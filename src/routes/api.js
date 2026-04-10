import { Router } from "express";
import { getDb } from "../db/database.js";
import {
  getRuleByPayerCpt,
  getRulesByCpt,
  logAiPrediction,
  getPredictionById,
  verifyPrediction,
} from "../db/crud.js";
import { predictAuth } from "../services/puterAI.js";

const router = Router();

// ── Helpers ───────────────────────────────────────────────────────────────────

function ruleToResponse(rule) {
  return {
    source: "database",
    payer: rule.payer,
    cpt: rule.cpt_code,
    auth_required: rule.auth_required,
    confidence: rule.confidence,
    conditions: rule.conditions,
    required_documentation: rule.required_documentation,
    channel: rule.submission_channel,
    turnaround_days: rule.turnaround_days,
  };
}

async function getAiFallback(payer, cpt) {
  const db = getDb();
  const prediction = await predictAuth(payer, cpt);

  const logged = logAiPrediction(db, {
    payer,
    cpt,
    predicted_auth: prediction.auth_required,
    confidence_score: prediction.confidence_score,
    confidence_label: prediction.confidence,
    reasoning: prediction.reasoning,
  });

  return {
    source: "ai_prediction",
    payer,
    cpt,
    auth_required: prediction.auth_required,
    confidence: prediction.confidence,
    confidence_score: prediction.confidence_score,
    reasoning: prediction.reasoning,
    prediction_id: logged.id,
    note: "Unverified AI prediction. Queued for specialist review.",
  };
}

// ── GET /api/check-auth?payer=...&cpt=... ─────────────────────────────────────

router.get("/check-auth", async (req, res) => {
  const { payer, cpt } = req.query;

  if (!payer || !cpt) {
    return res
      .status(400)
      .json({ error: "Both `payer` and `cpt` query parameters are required." });
  }

  const db = getDb();
  const rule = getRuleByPayerCpt(db, payer, cpt);

  if (rule) {
    return res.json(ruleToResponse(rule));
  }

  try {
    const aiResult = await getAiFallback(payer, cpt);
    return res.json(aiResult);
  } catch (err) {
    console.error("Puter AI error:", err.message);
    return res
      .status(502)
      .json({ error: `AI fallback failed: ${err.message}` });
  }
});

// ── GET /api/lookup/cpt/:code ─────────────────────────────────────────────────

router.get("/lookup/cpt/:code", (req, res) => {
  const { code } = req.params;
  const db = getDb();
  const rules = getRulesByCpt(db, code);

  res.json({
    cpt: code,
    total: rules.length,
    rules: rules.map(ruleToResponse),
  });
});

// ── POST /api/rules/verify ────────────────────────────────────────────────────

router.post("/rules/verify", (req, res) => {
  const { prediction_id, correct, corrected_data } = req.body;

  if (!prediction_id || correct === undefined) {
    return res
      .status(400)
      .json({ error: "`prediction_id` and `correct` are required." });
  }

  if (!correct && !corrected_data) {
    return res
      .status(422)
      .json({ error: "`corrected_data` is required when `correct` is false." });
  }

  const db = getDb();
  const prediction = getPredictionById(db, prediction_id);

  if (!prediction) {
    return res.status(404).json({ error: "Prediction not found." });
  }

  if (prediction.verified) {
    return res.status(409).json({ error: "Prediction already verified." });
  }

  const newRule = verifyPrediction(
    db,
    prediction,
    correct,
    corrected_data ?? null,
  );
  const action = correct ? "confirmed and promoted" : "corrected and promoted";

  res.json({
    success: true,
    message: `Prediction ${action} to verified payer rules.`,
    promoted_rule_id: newRule.id,
  });
});

// ── POST /api/check-auth/batch ────────────────────────────────────────────────

router.post("/check-auth/batch", async (req, res) => {
  const { items } = req.body;

  if (!Array.isArray(items) || items.length === 0) {
    return res.status(400).json({
      error: "`items` must be a non-empty array of { payer, cpt } objects.",
    });
  }

  if (items.length > 50) {
    return res.status(400).json({ error: "Maximum 50 items per batch." });
  }

  const db = getDb();

  // Separate DB hits from AI-needed
  const results = [];
  const aiQueue = []; // { index, payer, cpt }

  for (let i = 0; i < items.length; i++) {
    const { payer, cpt } = items[i];
    if (!payer || !cpt) {
      results[i] = { error: "Missing payer or cpt", payer, cpt };
      continue;
    }
    const rule = getRuleByPayerCpt(db, payer, cpt);
    if (rule) {
      results[i] = ruleToResponse(rule);
    } else {
      results[i] = null; // placeholder
      aiQueue.push({ index: i, payer, cpt });
    }
  }

  // Fire all AI calls concurrently
  const aiSettled = await Promise.allSettled(
    aiQueue.map(({ payer, cpt }) => getAiFallback(payer, cpt)),
  );

  for (let j = 0; j < aiQueue.length; j++) {
    const { index, payer, cpt } = aiQueue[j];
    const settled = aiSettled[j];
    if (settled.status === "fulfilled") {
      results[index] = settled.value;
    } else {
      results[index] = {
        source: "error",
        payer,
        cpt,
        auth_required: "unknown",
        confidence: "low",
        note: `AI error: ${settled.reason?.message ?? "unknown"}`,
      };
    }
  }

  res.json({ total: results.length, results });
});

export default router;
