import { v4 as uuidv4 } from 'uuid';

function parseJson(val) {
  if (!val) return null;
  try { return JSON.parse(val); } catch { return val; }
}

function ruleRow(row) {
  if (!row) return null;
  return {
    ...row,
    conditions:             parseJson(row.conditions),
    required_documentation: parseJson(row.required_documentation),
  };
}

export function getRuleByPayerCpt(db, payer, cpt) {
  const row = db.get(
    `SELECT * FROM payer_rules WHERE lower(payer) = lower(?) AND lower(cpt_code) = lower(?) LIMIT 1`,
    [payer, cpt]
  );
  return ruleRow(row);
}

export function getRulesByCpt(db, cpt) {
  const rows = db.all(
    `SELECT * FROM payer_rules WHERE lower(cpt_code) = lower(?) ORDER BY payer`,
    [cpt]
  );
  return rows.map(ruleRow);
}

export function createRule(db, data) {
  const id = uuidv4();
  db.run(
    `INSERT INTO payer_rules (id, payer, cpt_code, auth_required, conditions, required_documentation, submission_channel, turnaround_days, source, confidence) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
    [
      id, data.payer, data.cpt_code, data.auth_required,
      data.conditions ? JSON.stringify(data.conditions) : null,
      data.required_documentation ? JSON.stringify(data.required_documentation) : null,
      data.submission_channel ?? null, data.turnaround_days ?? null,
      data.source ?? 'ai_promoted', data.confidence ?? 'verified',
    ]
  );
  return ruleRow(db.get('SELECT * FROM payer_rules WHERE id = ?', [id]));
}

export function logAiPrediction(db, { payer, cpt, predicted_auth, confidence_score, confidence_label, reasoning }) {
  const id = uuidv4();
  db.run(
    `INSERT INTO ai_predictions (id, payer, cpt_code, predicted_auth, confidence_score, confidence_label, reasoning) VALUES (?, ?, ?, ?, ?, ?, ?)`,
    [id, payer, cpt, predicted_auth, confidence_score, confidence_label, reasoning]
  );
  return db.get('SELECT * FROM ai_predictions WHERE id = ?', [id]);
}

export function getPredictionById(db, id) {
  const row = db.get('SELECT * FROM ai_predictions WHERE id = ?', [id]);
  if (!row) return null;
  return { ...row, corrected_data: parseJson(row.corrected_data), verified: !!row.verified };
}

export function verifyPrediction(db, prediction, correct, correctedData) {
  let ruleData = {
    payer: prediction.payer, cpt_code: prediction.cpt_code,
    auth_required: prediction.predicted_auth,
    conditions: { notes: prediction.reasoning || 'Promoted from AI prediction.' },
    required_documentation: null, submission_channel: null, turnaround_days: null,
    source: 'ai_promoted', confidence: 'verified',
  };
  if (!correct && correctedData) {
    for (const key of ['auth_required','conditions','required_documentation','submission_channel','turnaround_days']) {
      if (correctedData[key] !== undefined) ruleData[key] = correctedData[key];
    }
  }
  const newRule = createRule(db, ruleData);
  db.run(
    `UPDATE ai_predictions SET verified=1, verified_at=datetime('now'), corrected_data=?, promoted_rule_id=? WHERE id=?`,
    [(!correct && correctedData) ? JSON.stringify(correctedData) : null, newRule.id, prediction.id]
  );
  return newRule;
}
