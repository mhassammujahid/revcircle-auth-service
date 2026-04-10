# RevCircle — Prior Authorization API (Node.js + Puter.js)

A REST API for querying insurance prior authorization rules, backed by a SQLite database with **Puter.js AI fallback** for unknown payer+CPT combinations.

---

## Stack

| Layer       | Technology                                                                |
| ----------- | ------------------------------------------------------------------------- |
| Runtime     | Node.js 22 (ESM)                                                          |
| Framework   | Express 4                                                                 |
| Database    | SQLite via `node-sqlite3-wasm` (pure WebAssembly — no native compilation) |
| AI Fallback | [Puter.js](https://docs.puter.com/AI/chat/) — no API key required         |
| Frontend    | Vanilla HTML/JS + Puter.js browser SDK                                    |

---

## Quick Start

```bash
# 1. Install
npm install

# 2. Start (DB is created and seeded automatically)
npm start

# Development mode (auto-restarts on file changes)
npm run dev
```

API runs at **http://localhost:8000**  
Frontend at **http://localhost:8000** (served as static files)

---

## Authentication Requirements

> **Important:** While this application does not require a traditional API key for AI features, **you must log in to Puter.js using your own account** after starting the server before performing any AI predictions. The default configured account has exhausted its available AI credits. Once authenticated with your personal Puter.js account, the AI fallback predictions will function correctly.

---

## Docker

```bash
docker compose up --build
```

One command. Database persists in a named Docker volume.

---

## How Puter.js AI Works

This project uses Puter.js in two ways:

### 1. Server-side (API fallback — `src/services/puterAI.js`)

When `GET /api/check-auth` finds no rule in the database, the backend calls the Puter API directly:

```
POST https://api.puter.com/drivers/call
{
  "interface": "puter-chat-completion",
  "driver": "claude-sonnet-4",
  "method": "complete",
  "args": { "messages": [...] }
}
```

No API key needed — Puter handles authentication. The prediction is logged to `ai_predictions` for specialist review.

### 2. Browser-side (frontend "Puter.js Direct" mode)

The frontend includes `<script src="https://js.puter.com/v2/"></script>` and exposes a mode toggle. In **Puter.js Direct** mode, queries bypass the backend entirely and call:

```js
puter.ai.chat(messages, { model: "claude-sonnet-4" });
```

This runs entirely in the browser — useful for demos without a running backend.

---

## API Reference

### `GET /api/check-auth?payer=...&cpt=...`

Returns a verified database rule if found; otherwise calls Puter.js and returns an AI prediction.

**Database hit:**

```json
{
  "source": "database",
  "payer": "Aetna Health Plans",
  "cpt": "27447",
  "auth_required": "yes",
  "confidence": "verified",
  "conditions": { "notes": "TKA. Always required." },
  "channel": "Availity portal",
  "turnaround_days": "5-14"
}
```

**AI fallback:**

```json
{
  "source": "ai_prediction",
  "payer": "Oxford Health Plan",
  "cpt": "29827",
  "auth_required": "yes",
  "confidence": "medium",
  "confidence_score": 0.75,
  "reasoning": "Shoulder arthroscopy typically requires prior auth for commercial plans...",
  "prediction_id": "uuid-for-later-verification",
  "note": "Unverified AI prediction. Queued for specialist review."
}
```

---

### `GET /api/lookup/cpt/:code`

All payer rules for a CPT code across all payers.

```
GET /api/lookup/cpt/27130
→ { "cpt": "27130", "total": 3, "rules": [...] }
```

---

### `POST /api/rules/verify`

Specialist verification — promotes an AI prediction to a verified rule.

```json
// Prediction was correct — promote as-is
{ "prediction_id": "uuid", "correct": true }

// Prediction was wrong — apply corrections and promote
{
  "prediction_id": "uuid",
  "correct": false,
  "corrected_data": {
    "auth_required": "conditional",
    "conditions": { "notes": "Only required for outpatient." },
    "submission_channel": "NaviNet",
    "turnaround_days": "3-5"
  }
}
```

---

### `POST /api/check-auth/batch` (Bonus)

Check up to 50 payer+CPT pairs in one call. DB hits are resolved synchronously; AI fallbacks are fired concurrently with `Promise.allSettled`.

```json
{
  "items": [
    { "payer": "Aetna Health Plans", "cpt": "27447" },
    { "payer": "Oxford Health Plan", "cpt": "29827" },
    { "payer": "Medicare NJ (J12)", "cpt": "27447" }
  ]
}
```

---

## Project Structure

```
revcircle-node/
├── src/
│   ├── index.js              # Express app, startup, static serving
│   ├── db/
│   │   ├── database.js       # SQLite connection + schema creation
│   │   ├── seed.js           # 19 verified payer rules
│   │   └── crud.js           # All DB query helpers
│   ├── services/
│   │   └── puterAI.js        # Puter.js server-side AI call
│   └── routes/
│       └── api.js            # All Express route handlers
├── frontend/
│   └── index.html            # Single-page UI (Puter.js browser SDK)
├── data/                     # SQLite DB file (auto-created)
├── Dockerfile
├── docker-compose.yml
└── package.json
```

---

## Schema

### `payer_rules`

| Column                 | Type           | Notes                        |
| ---------------------- | -------------- | ---------------------------- |
| id                     | TEXT (UUID PK) |                              |
| payer                  | TEXT           | Indexed (case-insensitive)   |
| cpt_code               | TEXT           | Indexed (case-insensitive)   |
| auth_required          | TEXT           | `yes` / `no` / `conditional` |
| conditions             | TEXT           | JSON string                  |
| required_documentation | TEXT           | JSON string                  |
| submission_channel     | TEXT           | e.g. Availity, NaviNet       |
| turnaround_days        | TEXT           | e.g. `5-14`                  |
| source                 | TEXT           | Rule origin                  |
| confidence             | TEXT           | `verified` / `unverified`    |

Composite index on `(lower(payer), lower(cpt_code))` for fast lookups.

### `ai_predictions`

| Column           | Type           | Notes                        |
| ---------------- | -------------- | ---------------------------- |
| id               | TEXT (UUID PK) | Returned as `prediction_id`  |
| payer / cpt_code | TEXT           |                              |
| predicted_auth   | TEXT           |                              |
| confidence_score | REAL           | 0.0–1.0                      |
| confidence_label | TEXT           | `high` / `medium` / `low`    |
| reasoning        | TEXT           | Puter.js explanation         |
| verified         | INTEGER        | 0/1 boolean                  |
| corrected_data   | TEXT           | JSON, specialist corrections |
| promoted_rule_id | TEXT           | ID of promoted `payer_rule`  |
| verified_at      | TEXT           | ISO timestamp                |

---

## Design Decisions

**`node-sqlite3-wasm` over `better-sqlite3`** — Pure WebAssembly, no native compilation, no `node-gyp` build step. Ideal for Docker and environments where downloading Node headers is restricted. Identical synchronous query API.

**Puter.js for AI** — No API key management, no billing setup, no environment variable to forget. Puter exposes Claude via its driver API server-side, and `puter.ai.chat()` browser-side. The frontend ships a toggle so the same UI works with or without a running backend.

**No framework for DB** — Raw SQL via the wasm driver keeps the code readable and dependency-light. A 25-line `crud.js` is easier to extend than an ORM config.

**Concurrent batch AI** — `Promise.allSettled` fires all Claude fallbacks in parallel, so a 10-item batch with 4 AI calls takes ~1× latency, not 4×. Errors per-item don't fail the whole batch.

**Case-insensitive lookups** — `lower(payer) = lower(?)` in SQL with matching indexes means `"aetna health plans"` and `"Aetna Health Plans"` both hit the same rule without a normalisation layer.

---

## What I'd Improve with More Time

1. **Payer normalisation** — a canonical payer registry so `"Aetna"`, `"Aetna Health Plans"`, and `"Aetna (Valley Employees)"` resolve deterministically.
2. **Auth middleware** — JWT or API key on mutating endpoints (`/verify`, `/batch`).
3. **Confidence decay** — rules get a `last_verified_at` timestamp; rules older than N months are flagged for re-verification.
4. **Specialist review queue** — `GET /api/predictions/pending` endpoint for the UI queue.
5. **Pagination** — `GET /api/lookup/cpt/:code` needs limit/offset for high-volume CPTs.
6. **PostgreSQL migration** — swap the `DATABASE_URL` and add `pg` driver; schema is compatible.
