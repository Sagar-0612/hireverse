/**
 * Seed script — creates 3 sample jobs with distinct pipelines and applies the
 * fixture resumes against them so the platform has realistic demo data.
 *
 * Run once:
 *   node --experimental-strip-types src/scripts/seed-sample-data.ts
 *
 * Safe to re-run: jobs are matched by title and skipped if they already exist;
 * candidates are matched by email and updated rather than duplicated.
 */

import mongoose from 'mongoose';
import { readFileSync } from 'fs';
import { fileURLToPath } from 'url';
import { dirname, join } from 'path';
import { analyzeResume, jdFingerprint } from '../lib/resumeAnalysis.ts';
import { Job } from '../db/models/Job.ts';
import { Candidate } from '../db/models/Candidate.ts';

const __dirname = dirname(fileURLToPath(import.meta.url));
const MONGODB_URI = process.env.MONGODB_URI ?? 'mongodb://localhost:27017/hireverse';

// ── Job definitions ──────────────────────────────────────────────────────────

const JOBS = [
  {
    title: 'Business Operations Manager',
    department: 'Operations',
    location: 'Mumbai, India',
    type: 'Full-time',
    level: 'Senior (5-8 yrs)',
    salary: '₹18-25 LPA',
    status: 'active' as const,
    description:
      'We are looking for an experienced Business Operations Manager to lead our operations division, drive process excellence, and partner with cross-functional stakeholders to scale the business.',
    responsibilities:
      'Lead end-to-end operational processes\nManage budgets and resource planning\nDrive stakeholder alignment across departments\nOwn process improvement and cost optimisation initiatives\nDeliver executive-level reporting and dashboards',
    requiredSkills: [
      'MS Excel', 'PowerPoint', 'Business Analysis', 'Operations Management',
      'Project Management', 'Stakeholder Management', 'Process Improvement', 'Data Analysis',
    ],
    niceToHaveSkills: ['PMP Certification', 'Six Sigma', 'SAP', 'ERP Systems', 'Power BI'],
    education: 'MBA or equivalent',
    hiringManager: 'Rahul Mehta',
    threshold: 70,
    pipeline: [
      { key: 'hr-screening',        label: 'HR Screening',         color: '#6b7280', icon: 'user',      order: 0 },
      { key: 'written-assessment',  label: 'Written Assessment',   color: '#3b82f6', icon: 'flag',      order: 1 },
      { key: 'panel-interview',     label: 'Panel Interview',      color: '#8b5cf6', icon: 'calendar',  order: 2 },
      { key: 'final-round',         label: 'Final Round',          color: '#f59e0b', icon: 'star',      order: 3 },
      { key: 'offer-extended',      label: 'Offer Extended',       color: '#10b981', icon: 'award',     order: 4 },
    ],
    fixture: 'basudha_sharma.txt',
  },
  {
    title: 'Junior Frontend Developer',
    department: 'Engineering',
    location: 'Delhi, India',
    type: 'Full-time',
    level: 'Junior (1-3 yrs)',
    salary: '₹6-10 LPA',
    status: 'active' as const,
    description:
      'Join our growing engineering team as a Junior Frontend Developer. You will build responsive, accessible web interfaces using React and collaborate closely with designers and backend engineers.',
    responsibilities:
      'Build and maintain React-based web applications\nDevelop reusable UI component libraries\nIntegrate REST APIs and ensure clean data flow\nWrite unit tests and participate in code reviews\nCollaborate with UX/UI designers using Figma specs',
    requiredSkills: ['React', 'JavaScript', 'HTML', 'CSS', 'Git'],
    niceToHaveSkills: ['TypeScript', 'Redux', 'Next.js', 'REST APIs', 'Figma', 'Testing'],
    education: "Bachelor's in Computer Science",
    hiringManager: 'Priya Nair',
    threshold: 65,
    pipeline: [
      { key: 'resume-screen',      label: 'Resume Screen',        color: '#6b7280', icon: 'circle',    order: 0 },
      { key: 'coding-test',        label: 'Coding Test',          color: '#06b6d4', icon: 'check',     order: 1 },
      { key: 'technical-interview',label: 'Technical Interview',  color: '#8b5cf6', icon: 'calendar',  order: 2 },
      { key: 'hr-round',           label: 'HR Round',             color: '#f59e0b', icon: 'user',      order: 3 },
      { key: 'offer',              label: 'Offer',                color: '#10b981', icon: 'award',     order: 4 },
    ],
    fixture: 'muskan.txt',
  },
  {
    title: 'Full Stack Developer',
    department: 'Engineering',
    location: 'Bangalore, India',
    type: 'Full-time',
    level: 'Mid (3-5 yrs)',
    salary: '₹14-20 LPA',
    status: 'active' as const,
    description:
      'We are hiring a Full Stack Developer to design, build, and ship scalable web applications end-to-end. You will own features from API design through to production deployment.',
    responsibilities:
      'Design and implement REST APIs using Node.js and Express\nBuild frontend experiences with React and TypeScript\nModel and optimise MongoDB schemas for performance\nDeploy and maintain services on AWS using Docker\nMentor junior developers and lead code reviews',
    requiredSkills: ['Node.js', 'React', 'MongoDB', 'REST APIs', 'JavaScript'],
    niceToHaveSkills: ['TypeScript', 'Docker', 'AWS', 'Python', 'GraphQL', 'Redis'],
    education: "Bachelor's in Computer Science",
    hiringManager: 'Vivek Sharma',
    threshold: 70,
    pipeline: [
      { key: 'phone-screen',     label: 'Phone Screen',         color: '#6b7280', icon: 'user',      order: 0 },
      { key: 'technical-1',      label: 'Technical Round 1',    color: '#3b82f6', icon: 'check',     order: 1 },
      { key: 'system-design',    label: 'System Design',        color: '#8b5cf6', icon: 'briefcase', order: 2 },
      { key: 'culture-fit',      label: 'Culture Fit',          color: '#ec4899', icon: 'star',      order: 3 },
      { key: 'offer',            label: 'Offer',                color: '#10b981', icon: 'award',     order: 4 },
    ],
    fixture: 'aswani_soni.txt',
  },
];

// ── Helpers ──────────────────────────────────────────────────────────────────

function readFixture(filename: string): string {
  return readFileSync(join(__dirname, '../fixtures/resumes', filename), 'utf-8');
}

async function upsertCandidate(jobDoc: any, resumeText: string, filename: string) {
  const analysis = analyzeResume(resumeText, filename, {
    requiredSkills: jobDoc.requiredSkills,
    niceToHaveSkills: jobDoc.niceToHaveSkills,
    education: jobDoc.education,
    level: jobDoc.level,
  });

  const firstStage = [...jobDoc.pipeline].sort((a: any, b: any) => a.order - b.order)[0];
  const jdHash = jdFingerprint(jobDoc);
  const base64 = Buffer.from(resumeText).toString('base64');

  // Wipe every candidate for this job that carries the seed marker — identified
  // by the 'Seed Script' mover tag written into stageHistory at creation time.
  // This means renaming a fixture file (e.g. muskan_gupta.txt → muskan.txt)
  // never leaves a stale ghost record alongside the freshly-created one, and
  // re-running the script always produces a clean, single authoritative record.
  const gone = await Candidate.deleteMany({
    jobId: jobDoc._id,
    'stageHistory.movedBy': 'Seed Script',
  });
  if (gone.deletedCount > 0) {
    console.log(`  Cleaned ${gone.deletedCount} stale seed record(s) for this job`);
  }

  await Candidate.create({
    jobId: jobDoc._id,
    name: analysis.name,
    email: analysis.email,
    phone: analysis.phone,
    location: analysis.location,
    locationConfidence: analysis.locationConfidence,
    score: analysis.score,
    experience: analysis.experience,
    skillsMatch: analysis.skillsMatch,
    educationMatch: analysis.educationMatch,
    recommendation: analysis.recommendation,
    currentStage: firstStage.key,
    stageHistory: [{
      stageKey: firstStage.key,
      stageLabel: firstStage.label,
      fromStageKey: '',
      fromStageLabel: '',
      movedBy: 'Seed Script',
      movedAt: new Date(),
      notes: 'Auto-created by seed script',
    }],
    skills: analysis.skills,
    practicalSkills: analysis.practicalSkills,
    achievements: analysis.achievements,
    resumeName: filename,
    resumeType: 'text/plain',
    resumeBase64: base64,
    appliedJdHash: jdHash,
  });
  console.log(`  Created: ${analysis.name} (score ${analysis.score}, loc: "${analysis.location}" [${analysis.locationConfidence}])`);
}

// ── Main ─────────────────────────────────────────────────────────────────────

async function main() {
  console.log('Connecting to MongoDB…');
  await mongoose.connect(MONGODB_URI);
  console.log('Connected.\n');

  for (const def of JOBS) {
    const { fixture, ...jobFields } = def;

    // Find or create job
    let jobDoc = await Job.findOne({ title: jobFields.title }).lean();
    if (jobDoc) {
      console.log(`Job exists: "${jobFields.title}" — skipping job creation`);
    } else {
      jobDoc = await Job.create(jobFields);
      console.log(`Created job: "${jobFields.title}"`);
    }

    // Apply fixture resume
    console.log(`Applying resume ${fixture}…`);
    const resumeText = readFixture(fixture);
    await upsertCandidate(jobDoc, resumeText, fixture);
    console.log();
  }

  await mongoose.disconnect();
  console.log('Done. Seed complete.');
}

main().catch(err => { console.error(err); process.exit(1); });
