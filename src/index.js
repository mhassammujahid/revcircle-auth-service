import 'dotenv/config';
import express from 'express';
import cors from 'cors';
import { join, dirname } from 'path';
import { fileURLToPath } from 'url';
import { getDb } from './db/database.js';
import { seedPayerRules } from './db/seed.js';
import apiRouter from './routes/api.js';

const __dirname = dirname(fileURLToPath(import.meta.url));

const app  = express();
const PORT = process.env.PORT || 8000;

app.use(cors());
app.use(express.json());

// Serve built React app (after running: cd frontend-react && npm run build)
const PUBLIC_DIR = join(__dirname, '../public');
app.use(express.static(PUBLIC_DIR));

// Initialise DB + seed
const db = getDb();
seedPayerRules(db);

// API routes
app.use('/api', apiRouter);

app.get('/health', (_req, res) => {
  res.json({ status: 'ok', service: 'revcircle-prior-auth-api', runtime: 'node.js' });
});

// SPA fallback — serve React app for any non-API route
app.get('*', (_req, res) => {
  res.sendFile(join(PUBLIC_DIR, 'index.html'));
});

app.listen(PORT, () => {
  console.log(`\n🚀 RevCircle API running at http://localhost:${PORT}`);
  console.log(`   API:      http://localhost:${PORT}/api/check-auth?payer=...&cpt=...`);
  console.log(`   Frontend: http://localhost:${PORT}\n`);
});
