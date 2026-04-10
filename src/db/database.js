import pkg from 'node-sqlite3-wasm';
const { Database } = pkg;
import { join, dirname } from 'path';
import { fileURLToPath } from 'url';
import { mkdirSync, rmdirSync } from 'fs';

const __dirname = dirname(fileURLToPath(import.meta.url));
const DATA_DIR = join(__dirname, '../../data');

mkdirSync(DATA_DIR, { recursive: true });

const DB_PATH = join(DATA_DIR, 'revcircle.db');

// node-sqlite3-wasm uses a .lock directory as a file mutex.
// If a previous process crashed mid-write, this stale lock blocks reopening.
try { rmdirSync(DB_PATH + '.lock'); } catch { /* didn't exist — fine */ }

let _db = null;

export function getDb() {
  if (_db) return _db;

  _db = new Database(DB_PATH);

  _db.exec(
    `CREATE TABLE IF NOT EXISTS payer_rules (
      id                     TEXT PRIMARY KEY,
      payer                  TEXT NOT NULL,
      cpt_code               TEXT NOT NULL,
      auth_required          TEXT NOT NULL CHECK(auth_required IN ('yes','no','conditional')),
      conditions             TEXT,
      required_documentation TEXT,
      submission_channel     TEXT,
      turnaround_days        TEXT,
      source                 TEXT,
      confidence             TEXT NOT NULL DEFAULT 'verified' CHECK(confidence IN ('verified','unverified')),
      created_at             TEXT NOT NULL DEFAULT (datetime('now')),
      updated_at             TEXT NOT NULL DEFAULT (datetime('now'))
    )`
  );

  _db.exec(`CREATE INDEX IF NOT EXISTS ix_pr_payer ON payer_rules(lower(payer))`);
  _db.exec(`CREATE INDEX IF NOT EXISTS ix_pr_cpt ON payer_rules(lower(cpt_code))`);
  _db.exec(`CREATE INDEX IF NOT EXISTS ix_pr_payer_cpt ON payer_rules(lower(payer), lower(cpt_code))`);

  _db.exec(
    `CREATE TABLE IF NOT EXISTS ai_predictions (
      id               TEXT PRIMARY KEY,
      payer            TEXT NOT NULL,
      cpt_code         TEXT NOT NULL,
      predicted_auth   TEXT NOT NULL CHECK(predicted_auth IN ('yes','no','conditional')),
      confidence_score REAL,
      confidence_label TEXT,
      reasoning        TEXT,
      verified         INTEGER NOT NULL DEFAULT 0,
      corrected_data   TEXT,
      promoted_rule_id TEXT,
      created_at       TEXT NOT NULL DEFAULT (datetime('now')),
      verified_at      TEXT
    )`
  );

  _db.exec(`CREATE INDEX IF NOT EXISTS ix_aip_payer ON ai_predictions(lower(payer))`);
  _db.exec(`CREATE INDEX IF NOT EXISTS ix_aip_cpt ON ai_predictions(lower(cpt_code))`);

  return _db;
}
