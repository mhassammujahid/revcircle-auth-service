/**
 * Puter.js AI fallback service.
 *
 * Puter.js exposes an OpenAI-compatible chat completions endpoint at:
 *   https://api.puter.com/drivers/call
 *
 * No API key needed — Puter handles auth via its platform.
 * We call the `puter-chat-completion` driver with the `claude-sonnet-4` model.
 *
 * Docs: https://docs.puter.com/AI/chat/
 */

import { createRequire } from "module";

const require = createRequire(import.meta.url);
const { init } = require("@heyputer/puter.js/src/init.cjs");

const PUTER_AUTH_TOKEN = process.env.PUTER_AUTH_TOKEN;
let puterClient;

function getPuterClient() {
  if (!PUTER_AUTH_TOKEN) {
    throw new Error(
      "Missing PUTER_AUTH_TOKEN. Set it to your Puter auth token.",
    );
  }
  if (!puterClient) {
    puterClient = init(PUTER_AUTH_TOKEN);
  }
  return puterClient;
}

const SYSTEM_PROMPT = `You are an expert in US healthcare prior authorization rules.
Given a payer name and CPT procedure code, predict whether prior authorization is likely required.

Respond ONLY with a valid JSON object — no markdown fences, no extra text.

Required fields:
{
  "auth_required": "yes" | "no" | "conditional",
  "confidence": "high" | "medium" | "low",
  "confidence_score": <float 0.0-1.0>,
  "reasoning": "<concise 1-3 sentence explanation>"
}

Rules:
- "conditional" means auth depends on circumstance (visits, referral, plan type, etc.)
- confidence_score: 0.85-1.0 = high, 0.55-0.84 = medium, 0.0-0.54 = low
- When uncertain, lean toward "yes" with lower confidence (conservative default)`;

export async function predictAuth(payer, cpt) {
  const userMessage = `Payer: ${payer}\nCPT Code: ${cpt}\n\nPredict whether this payer requires prior authorization for this CPT code.`;

  const puter = getPuterClient();
  const response = await puter.ai.chat(
    [
      { role: "system", content: SYSTEM_PROMPT },
      { role: "user", content: userMessage },
    ],
    { model: "claude-sonnet-4" },
  );

  const rawText =
    typeof response === "string"
      ? response
      : (response?.message?.content?.[0]?.text ?? "");

  if (!rawText) throw new Error("Empty response from Puter AI.");

  // Strip accidental markdown fences
  const clean = rawText
    .replace(/^```(?:json)?\s*/m, "")
    .replace(/\s*```$/m, "")
    .trim();
  const parsed = JSON.parse(clean);

  return {
    auth_required: (parsed.auth_required ?? "yes").toLowerCase(),
    confidence: (parsed.confidence ?? "low").toLowerCase(),
    confidence_score: parseFloat(parsed.confidence_score ?? 0.5),
    reasoning: parsed.reasoning ?? "No reasoning provided.",
  };
}
