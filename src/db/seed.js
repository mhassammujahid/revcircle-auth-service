import { getDb } from './database.js';
import { v4 as uuidv4 } from 'uuid';

const SEED_RULES = [
  {
    payer: 'Aetna Health Plans', cpt_code: '27447', auth_required: 'yes',
    conditions: { notes: 'TKA. Always required.' },
    required_documentation: { items: ['clinical notes', 'X-rays', 'conservative treatment history'] },
    submission_channel: 'Availity portal', turnaround_days: '5-14',
  },
  {
    payer: 'Aetna Health Plans', cpt_code: '27130', auth_required: 'yes',
    conditions: { notes: 'Total hip arthroplasty. Always required.' },
    required_documentation: { items: ['clinical notes', 'X-rays', 'conservative treatment history'] },
    submission_channel: 'Availity portal', turnaround_days: '5-14',
  },
  {
    payer: 'Aetna Health Plans', cpt_code: '29881', auth_required: 'yes',
    conditions: { notes: 'Knee arthroscopy surgical.' },
    required_documentation: { items: ['clinical notes', 'MRI', 'conservative treatment failure'] },
    submission_channel: 'Availity portal', turnaround_days: '5-14',
  },
  {
    payer: 'Aetna Health Plans', cpt_code: '0055T', auth_required: 'yes',
    conditions: { notes: 'Computer-assisted surgery. Considered experimental.' },
    required_documentation: { items: ['clinical justification', 'medical necessity letter'] },
    submission_channel: 'Availity portal', turnaround_days: '14-21',
  },
  {
    payer: 'Aetna (Valley Employees)', cpt_code: '20610', auth_required: 'yes',
    conditions: { notes: 'Joint injection. Employer plan exception.' },
    required_documentation: { items: ['clinical notes', 'diagnosis code'] },
    submission_channel: 'Availity portal', turnaround_days: '3-5',
  },
  {
    payer: 'Horizon BCBS of NJ', cpt_code: '97110', auth_required: 'conditional',
    conditions: { notes: 'PT therapeutic exercises. Auth required after plan of care initiated.' },
    required_documentation: { items: ['plan of care', 'functional assessment', 'diagnosis'] },
    submission_channel: 'NaviNet', turnaround_days: '3-5',
  },
  {
    payer: 'Horizon BCBS of NJ', cpt_code: '97140', auth_required: 'conditional',
    conditions: { notes: 'Manual therapy. Covered under PT authorization umbrella.' },
    required_documentation: { items: ['plan of care', 'PT evaluation'] },
    submission_channel: 'NaviNet', turnaround_days: '3-5',
  },
  {
    payer: 'Horizon BCBS of NJ', cpt_code: '97112', auth_required: 'conditional',
    conditions: { notes: 'Neuromuscular reeducation. Under PT auth umbrella.' },
    required_documentation: { items: ['plan of care', 'PT evaluation'] },
    submission_channel: 'NaviNet', turnaround_days: '3-5',
  },
  {
    payer: 'Horizon BCBS of NJ', cpt_code: '29827', auth_required: 'yes',
    conditions: { notes: 'Shoulder arthroscopy rotator cuff repair.' },
    required_documentation: { items: ['MRI report', 'clinical notes', 'conservative treatment history'] },
    submission_channel: 'NaviNet', turnaround_days: '5-10',
  },
  {
    payer: 'Horizon BCBS of NJ', cpt_code: '63030', auth_required: 'yes',
    conditions: { notes: 'Lumbar disk surgery.' },
    required_documentation: { items: ['MRI', 'clinical notes', 'conservative treatment failure', 'neurosurgical consult'] },
    submission_channel: 'NaviNet', turnaround_days: '7-14',
  },
  {
    payer: 'Horizon BCBS of NJ', cpt_code: '64483', auth_required: 'yes',
    conditions: { notes: 'Epidural steroid injection.' },
    required_documentation: { items: ['clinical notes', 'diagnosis', 'conservative treatment failure'] },
    submission_channel: 'NaviNet', turnaround_days: '3-7',
  },
  {
    payer: 'Cigna', cpt_code: '27130', auth_required: 'yes',
    conditions: { notes: 'Total hip arthroplasty. Always required.' },
    required_documentation: { items: ['clinical notes', 'X-rays', 'conservative treatment history'] },
    submission_channel: 'Cigna portal', turnaround_days: '5-14',
  },
  {
    payer: 'Cigna', cpt_code: 'J7327', auth_required: 'yes',
    conditions: { notes: 'Monovisc (hyaluronate) injection.' },
    required_documentation: { items: ['clinical notes', 'conservative treatment failure', 'X-ray'] },
    submission_channel: 'Cigna portal', turnaround_days: '3-7',
  },
  {
    payer: 'UnitedHealthcare', cpt_code: '27130', auth_required: 'yes',
    conditions: { notes: 'Total hip arthroplasty. Always required.' },
    required_documentation: { items: ['clinical notes', 'X-rays', 'conservative treatment history'] },
    submission_channel: 'UHC portal', turnaround_days: '5-14',
  },
  {
    payer: 'UnitedHealthcare', cpt_code: '22633', auth_required: 'yes',
    conditions: { notes: 'Lumbar arthrodesis (spinal fusion).' },
    required_documentation: { items: ['MRI', 'clinical notes', 'surgical plan', 'conservative treatment failure'] },
    submission_channel: 'UHC portal', turnaround_days: '7-14',
  },
  {
    payer: 'Aetna Medicare', cpt_code: '27447', auth_required: 'yes',
    conditions: { notes: 'TKA under Medicare Advantage plan.' },
    required_documentation: { items: ['clinical notes', 'X-rays', 'functional assessment', 'conservative treatment history'] },
    submission_channel: 'Availity portal', turnaround_days: '5-14',
  },
  {
    payer: 'Aetna Better Health NJ', cpt_code: '97110', auth_required: 'yes',
    conditions: { notes: 'Medicaid plan. All PT services require prior authorization.' },
    required_documentation: { items: ['plan of care', 'functional assessment', 'diagnosis', 'referring provider info'] },
    submission_channel: 'Availity portal', turnaround_days: '3-5',
  },
  {
    payer: 'WellCare Medicaid NJ', cpt_code: '99213', auth_required: 'conditional',
    conditions: { notes: 'Specialist office visit. Referral from PCP may be required depending on specialist type.' },
    required_documentation: { items: ['referral letter', 'diagnosis'] },
    submission_channel: 'WellCare portal', turnaround_days: '1-3',
  },
  {
    payer: 'Medicare NJ (J12)', cpt_code: '27447', auth_required: 'no',
    conditions: { notes: 'Traditional Medicare. No prior auth required. Standard fee schedule applies.' },
    required_documentation: null,
    submission_channel: 'CMS standard', turnaround_days: null,
  },
];

export function seedPayerRules(db) {
  const existing = db.prepare('SELECT COUNT(*) as cnt FROM payer_rules').get();
  if (existing.cnt > 0) {
    console.log(`Seed skipped: ${existing.cnt} rules already present.`);
    return;
  }

  const insert = db.prepare(`
    INSERT INTO payer_rules
      (id, payer, cpt_code, auth_required, conditions, required_documentation,
       submission_channel, turnaround_days, source, confidence)
    VALUES
      (?, ?, ?, ?, ?, ?, ?, ?, 'specialist_verified', 'verified')
  `);

  db.exec('BEGIN');
  try {
    for (const r of SEED_RULES) {
      insert.run([
        uuidv4(),
        r.payer,
        r.cpt_code,
        r.auth_required,
        r.conditions ? JSON.stringify(r.conditions) : null,
        r.required_documentation ? JSON.stringify(r.required_documentation) : null,
        r.submission_channel ?? null,
        r.turnaround_days ?? null,
      ]);
    }
    db.exec('COMMIT');
  } catch (e) {
    db.exec('ROLLBACK');
    throw e;
  }
  console.log(`Seeded ${SEED_RULES.length} payer rules.`);
}

// Allow running directly: node src/db/seed.js
if (process.argv[1] && process.argv[1].endsWith('seed.js')) {
  const db = getDb();
  seedPayerRules(db);
  db.close();
}
