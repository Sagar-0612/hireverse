/**
 * Records short Playwright walkthrough videos for the FAQ page
 * (src/pages/faq.astro) and saves them to public/faq-videos/<slug>.webm.
 *
 * Each scenario below corresponds 1:1 to a `video.slug` referenced from an
 * FAQ item. faq.astro checks for the existence of that file at build time
 * and renders an inline <video> player when present, falling back to a
 * "coming soon" placeholder otherwise.
 *
 * Scenarios that need to demonstrate scheduling/overdue/reschedule behavior
 * create their own throwaway Job/Candidate/Interview/Assessment records,
 * record the walkthrough against them, and delete everything afterwards —
 * the real seeded demo data (jobs, candidates, interviews, assessments) is
 * never modified.
 *
 * Run:
 *   node --experimental-strip-types src/scripts/record-faq-videos.ts
 *
 * Requires a MongoDB instance with the comprehensive seed data already
 * loaded (for the job/candidate-tour scenarios) — run `npm run seed` and
 * `node --experimental-strip-types src/scripts/seed-part-e.ts` first if
 * the database is empty.
 */

import { chromium, type Page } from 'playwright';
import mongoose from 'mongoose';
import fs from 'fs';
import path from 'path';
import { spawn, type ChildProcess } from 'child_process';
import { Job } from '../db/models/Job.ts';
import { Candidate } from '../db/models/Candidate.ts';
import { Interview } from '../db/models/Interview.ts';
import { Assessment } from '../db/models/Assessment.ts';
import { Team } from '../db/models/Team.ts';

const MONGODB_URI = process.env.MONGODB_URI ?? 'mongodb://localhost:27017/hireverse';
const BASE_URL = process.env.FAQ_RECORD_BASE_URL ?? 'http://localhost:4321';
const VIDEO_DIR = path.resolve('public/faq-videos');
const VIEWPORT = { width: 1280, height: 800 };

function pause(page: Page, ms = 900) {
  return page.waitForTimeout(ms);
}

function addDays(days: number): string {
  const d = new Date();
  d.setDate(d.getDate() + days);
  return d.toISOString().split('T')[0];
}

async function waitForServer(url: string, timeoutMs: number): Promise<void> {
  const start = Date.now();
  while (Date.now() - start < timeoutMs) {
    try {
      const res = await fetch(url);
      if (res.ok || res.status < 500) return;
    } catch {
      // not up yet
    }
    await new Promise(r => setTimeout(r, 500));
  }
  throw new Error(`Server at ${url} did not become ready within ${timeoutMs}ms`);
}

async function recordScenario(slug: string, run: (page: Page) => Promise<void>): Promise<void> {
  // Use a temp dir on the same drive/volume as the project — recordVideo
  // writes here, and the final move below is a same-volume rename. Mixing
  // volumes (e.g. the OS temp dir on C: vs a project on G:) makes
  // fs.renameSync fail with EXDEV.
  const localTmpRoot = path.resolve('.tmp-faq-recordings');
  fs.mkdirSync(localTmpRoot, { recursive: true });
  const tmpDir = fs.mkdtempSync(path.join(localTmpRoot, `${slug}-`));
  const browser = await chromium.launch();
  const context = await browser.newContext({ viewport: VIEWPORT, recordVideo: { dir: tmpDir, size: VIEWPORT } });
  const page = await context.newPage();
  try {
    await run(page);
  } finally {
    await page.close();
    await context.close();
    await browser.close();
  }

  const recorded = fs.readdirSync(tmpDir).filter(f => f.endsWith('.webm'));
  if (!recorded.length) throw new Error(`No video produced for scenario "${slug}"`);
  fs.mkdirSync(VIDEO_DIR, { recursive: true });
  const dest = path.join(VIDEO_DIR, `${slug}.webm`);
  fs.renameSync(path.join(tmpDir, recorded[0]), dest);
  fs.rmSync(tmpDir, { recursive: true, force: true });
  console.log(`  -> recorded public/faq-videos/${slug}.webm`);
}

// ── Scenario 1: platform tour ──────────────────────────────────────────────
async function recordPlatformTour() {
  await recordScenario('platform-tour', async (page) => {
    for (const route of ['/dashboard', '/jobs', '/candidates', '/interviews', '/assessments']) {
      await page.goto(`${BASE_URL}${route}`, { waitUntil: 'load' });
      await pause(page, 1600);
    }
  });
}

// ── Scenario 2: dashboard stats + activity feed ────────────────────────────
async function recordDashboardActivity() {
  await recordScenario('dashboard-activity', async (page) => {
    await page.goto(`${BASE_URL}/dashboard`, { waitUntil: 'load' });
    await pause(page, 1200);
    const activity = page.locator('#activity-list, #activity-empty').first();
    await activity.scrollIntoViewIfNeeded().catch(() => {});
    await pause(page, 1500);
    await page.locator('.activity-row').first().hover().catch(() => {});
    await pause(page, 1200);
    await page.goto(`${BASE_URL}/candidates`, { waitUntil: 'load' });
    await pause(page, 1500);
  });
}

// ── Scenario 3: editing a job's pipeline (not saved) ───────────────────────
async function recordEditPipeline(jobId: string) {
  await recordScenario('edit-pipeline', async (page) => {
    await page.goto(`${BASE_URL}/jobs/${jobId}/edit`, { waitUntil: 'load' });
    await pause(page, 1000);
    const rows = page.locator('#pipeline-rows');
    await rows.scrollIntoViewIfNeeded().catch(() => {});
    await pause(page, 1000);
    await page.locator('#add-stage-btn').click();
    await pause(page, 900);
    const newLabel = page.locator('.pipeline-row .stage-label').last();
    await newLabel.fill('Written Assessment Demo');
    await pause(page, 1200);
    await page.locator('.pipeline-row .remove-stage').last().click();
    await pause(page, 900);
  });
}

// ── Scenario 4: resume upload modal ────────────────────────────────────────
async function recordResumeUpload(jobId: string) {
  await recordScenario('resume-upload-modal', async (page) => {
    await page.goto(`${BASE_URL}/jobs/${jobId}`, { waitUntil: 'load' });
    await pause(page, 1000);
    await page.locator('.tab[data-tab="candidates"]').click();
    await pause(page, 800);
    const uploadBtn = page.locator('#upload-btn-tab, #upload-btn-empty').first();
    await uploadBtn.scrollIntoViewIfNeeded().catch(() => {});
    await uploadBtn.click();
    await page.locator('#upload-modal').waitFor({ state: 'visible' });
    await pause(page, 1800);
    await page.locator('#modal-close').click();
    await pause(page, 600);
  });
}

// ── Scenario 5: scheduling an interview, hitting & resolving a conflict ────
async function recordScheduleConflict() {
  const interviewer = (await Team.findOne({ status: 'active' }).lean())?.name || 'Alex Rivera';

  const job = await Job.create({
    title: 'FAQ Recording — Temp Job',
    pipeline: [
      { key: 'applied', label: 'Applied', color: '#6b7280', icon: 'user', order: 0 },
      { key: 'technical-interview', label: 'Technical Interview', color: '#0070f3', icon: 'calendar', order: 1 },
      { key: 'final-interview', label: 'Final Interview', color: '#7928ca', icon: 'calendar', order: 2 },
    ],
  });
  const candidate = await Candidate.create({
    jobId: job._id,
    name: 'Riya Kapoor (Demo)',
    currentStage: 'technical-interview',
  });
  const existingDate = addDays(1);
  const existing = await Interview.create({
    candidateId: candidate._id,
    jobId: job._id,
    pipelineStage: 'technical-interview',
    round: 'Technical Interview',
    interviewer,
    date: existingDate,
    time: '10:00',
    duration: 60,
    status: 'scheduled',
  });

  let createdInterviewId: string | null = null;
  try {
    await recordScenario('schedule-interview-conflict', async (page) => {
      await page.goto(`${BASE_URL}/interviews/schedule?candidate=${candidate._id.toString()}`, { waitUntil: 'load' });
      await pause(page, 1000);

      await page.fill('input[name="date"]', existingDate);
      await page.fill('input[name="time"]', '10:15');
      await page.selectOption('select[name="interviewer"]', interviewer);
      await pause(page, 900);

      await page.click('#submit-btn');
      await page.locator('#error-banner').waitFor({ state: 'visible', timeout: 10000 });
      await pause(page, 2200);

      await page.fill('input[name="time"]', '15:00');
      await pause(page, 800);
      await page.click('#submit-btn');
      await page.waitForURL(/\/interviews\/[a-f0-9]{24}$/, { timeout: 10000 });
      await pause(page, 1800);

      const match = page.url().match(/\/interviews\/([a-f0-9]{24})$/);
      createdInterviewId = match ? match[1] : null;
    });
  } finally {
    if (createdInterviewId) await Interview.findByIdAndDelete(createdInterviewId);
    await Interview.findByIdAndDelete(existing._id);
    await Candidate.findByIdAndDelete(candidate._id);
    await Job.findByIdAndDelete(job._id);
  }
}

// ── Scenario 6: rescheduling an overdue interview ───────────────────────────
async function recordRescheduleInterview() {
  const job = await Job.create({
    title: 'FAQ Recording — Temp Job (Reschedule Interview)',
    pipeline: [
      { key: 'applied', label: 'Applied', color: '#6b7280', icon: 'user', order: 0 },
      { key: 'technical-interview', label: 'Technical Interview', color: '#0070f3', icon: 'calendar', order: 1 },
    ],
  });
  const candidate = await Candidate.create({
    jobId: job._id,
    name: 'Devansh Oberoi (Demo)',
    currentStage: 'technical-interview',
  });
  const interview = await Interview.create({
    candidateId: candidate._id,
    jobId: job._id,
    pipelineStage: 'technical-interview',
    round: 'Technical Interview',
    interviewer: 'Maya Kim',
    date: addDays(-1),
    time: '14:00',
    duration: 60,
    status: 'scheduled',
  });

  try {
    await recordScenario('reschedule-interview', async (page) => {
      await page.goto(`${BASE_URL}/interviews/${interview._id.toString()}`, { waitUntil: 'load' });
      await pause(page, 1000);
      await page.locator('text=Overdue').first().scrollIntoViewIfNeeded().catch(() => {});
      await pause(page, 1500);

      await page.click('#reschedule-btn');
      await page.locator('#reschedule-modal').waitFor({ state: 'visible' });
      await pause(page, 800);

      await page.fill('#reschedule-date', addDays(2));
      await page.fill('#reschedule-time', '15:00');
      await pause(page, 800);

      await page.click('#reschedule-save');
      await pause(page, 2000);
    });
  } finally {
    await Interview.findByIdAndDelete(interview._id);
    await Candidate.findByIdAndDelete(candidate._id);
    await Job.findByIdAndDelete(job._id);
  }
}

// ── Scenario 7: rescheduling an overdue assessment due date ─────────────────
async function recordRescheduleAssessment() {
  const job = await Job.create({
    title: 'FAQ Recording — Temp Job (Reschedule Assessment)',
    pipeline: [
      { key: 'applied', label: 'Applied', color: '#6b7280', icon: 'user', order: 0 },
      { key: 'coding-test', label: 'Coding Test', color: '#f5a623', icon: 'circle', order: 1 },
    ],
  });
  const candidate = await Candidate.create({
    jobId: job._id,
    name: 'Neha Choudhary (Demo)',
    currentStage: 'coding-test',
  });
  const assessment = await Assessment.create({
    candidateId: candidate._id,
    jobId: job._id,
    pipelineStage: 'coding-test',
    round: 'Coding Test',
    type: 'coding',
    status: 'pending',
    dueDate: addDays(-1),
    dueTime: '18:00',
  });

  try {
    await recordScenario('reschedule-assessment', async (page) => {
      await page.goto(`${BASE_URL}/assessments/${assessment._id.toString()}`, { waitUntil: 'load' });
      await pause(page, 1000);
      await page.locator('text=Overdue').first().scrollIntoViewIfNeeded().catch(() => {});
      await pause(page, 1500);

      await page.click('#reschedule-btn');
      await page.locator('#reschedule-modal').waitFor({ state: 'visible' });
      await pause(page, 800);

      await page.fill('#reschedule-date', addDays(2));
      await page.fill('#reschedule-time', '18:00');
      await pause(page, 800);

      await page.click('#reschedule-save');
      await pause(page, 2000);
    });
  } finally {
    await Assessment.findByIdAndDelete(assessment._id);
    await Candidate.findByIdAndDelete(candidate._id);
    await Job.findByIdAndDelete(job._id);
  }
}

// ── Scenario 8: Analytics page tour ─────────────────────────────────────────
async function recordAnalyticsTour() {
  await recordScenario('analytics-tour', async (page) => {
    await page.goto(`${BASE_URL}/analytics`, { waitUntil: 'load' });
    await pause(page, 1500);
    await page.locator('text=Conversion by Job').first().scrollIntoViewIfNeeded().catch(() => {});
    await pause(page, 1500);
    await page.locator('text=Monthly Trends').first().scrollIntoViewIfNeeded().catch(() => {});
    await pause(page, 1500);
    await page.locator('text=Score Calibration').first().scrollIntoViewIfNeeded().catch(() => {});
    await pause(page, 1800);
  });
}

// ── Scenario 9: Platform Intelligence page tour ─────────────────────────────
async function recordIntelligenceTour() {
  await recordScenario('intelligence-tour', async (page) => {
    await page.goto(`${BASE_URL}/intelligence`, { waitUntil: 'load' });
    await pause(page, 1500);
    await page.locator('text=Learned Skill Aliases').first().scrollIntoViewIfNeeded().catch(() => {});
    await pause(page, 1500);
    await page.locator('text=Score Calibration by Job').first().scrollIntoViewIfNeeded().catch(() => {});
    await pause(page, 1800);
  });
}

// ── Scenario 10: a rejected candidate whose recommendation is shown as
// historical/muted context, not a live call to action ───────────────────────
async function recordRejectedCandidateContext(jobId: string) {
  const candidate = await Candidate.create({
    jobId,
    name: 'Priya Sharma (Demo)',
    email: 'priya.sharma.demo@example.com',
    score: 88,
    skillsMatch: 90,
    educationMatch: 100,
    experience: 5,
    recommendation: 'Strongly Recommend',
    currentStage: 'applied',
    rejected: true,
    rejectedAt: new Date(),
    rejectedBy: 'Maya Kim',
    skillGaps: [],
  });

  try {
    await recordScenario('rejected-candidate-context', async (page) => {
      await page.goto(`${BASE_URL}/candidates`, { waitUntil: 'load' });
      await pause(page, 1000);
      await page.selectOption('#stage-filter', 'Rejected');
      await pause(page, 1200);
      await page.locator(`text=${candidate.name}`).first().click();
      await page.waitForURL(/\/candidates\/[a-f0-9]{24}$/, { timeout: 10000 });
      await pause(page, 1000);
      await page.locator('#score-banner').scrollIntoViewIfNeeded().catch(() => {});
      await pause(page, 2000);
    });
  } finally {
    await Candidate.findByIdAndDelete(candidate._id);
  }
}

async function main() {
  console.log('Connecting to MongoDB…');
  await mongoose.connect(MONGODB_URI);

  const backendJob = await Job.findOne({ title: 'Backend Engineer (Node.js)' }).lean();
  if (!backendJob) {
    throw new Error('Job "Backend Engineer (Node.js)" not found — run `npm run seed` first.');
  }
  const jobId = backendJob._id.toString();

  let devServer: ChildProcess | null = null;
  const serverAlreadyUp = await fetch(BASE_URL).then(() => true).catch(() => false);
  if (!serverAlreadyUp) {
    console.log('Starting dev server…');
    devServer = spawn('npx', ['astro', 'dev', '--port', '4321'], {
      shell: true,
      stdio: 'ignore',
      cwd: process.cwd(),
    });
    await waitForServer(BASE_URL, 60000);
  }

  try {
    console.log('Recording: platform-tour');
    await recordPlatformTour();

    console.log('Recording: dashboard-activity');
    await recordDashboardActivity();

    console.log('Recording: edit-pipeline');
    await recordEditPipeline(jobId);

    console.log('Recording: resume-upload-modal');
    await recordResumeUpload(jobId);

    console.log('Recording: schedule-interview-conflict');
    await recordScheduleConflict();

    console.log('Recording: reschedule-interview');
    await recordRescheduleInterview();

    console.log('Recording: reschedule-assessment');
    await recordRescheduleAssessment();

    console.log('Recording: analytics-tour');
    await recordAnalyticsTour();

    console.log('Recording: intelligence-tour');
    await recordIntelligenceTour();

    console.log('Recording: rejected-candidate-context');
    await recordRejectedCandidateContext(jobId);
  } finally {
    if (devServer) devServer.kill();
    await mongoose.disconnect();
    fs.rmSync(path.resolve('.tmp-faq-recordings'), { recursive: true, force: true });
  }

  console.log('\nDone. FAQ videos written to public/faq-videos/.');
}

main().catch(err => {
  console.error(err);
  process.exit(1);
});
