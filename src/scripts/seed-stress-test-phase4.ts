/**
 * Phase 4 of the adversarial stress-test dataset (see
 * C:\Users\sa06t\.claude\plans\playful-yawning-shannon.md).
 *
 * Run AFTER seed-stress-test.ts (Phases 1-3), which must have already created
 * the 12 jobs + ~92 candidates this script looks up by job title + resume
 * filename. This script is purely ADDITIVE — it never deletes anything — and:
 *
 *  - Moves a subset of candidates through their pipeline stages, recording
 *    `recordOutcomeSignal` (advanced/rejected/hired) so /intelligence's
 *    calibration table has real per-job, per-score-band data.
 *  - Creates Interview records engineered to hit: the red-flag hard cap
 *    (score capped at 35), the 3+ uncertainty-admission penalty, the
 *    empty-feedback neutral-60 default, an "inverted negation" verdict
 *    phrase, and a rescheduled interview (audit trail).
 *  - Creates Assessment records engineered to hit: 100% tests-passed,
 *    0/0 testsTotal, a question-relevance mismatch, and an empty submission.
 *  - Creates an overdue (past-due, still-pending) assessment.
 *  - Rejects several candidates (one with an "undo rejection").
 *  - Moves a candidate through BOTH gated stages of the two dual-gate jobs
 *    (#4 DevOps/SRE Lead's two interview rounds, #5 QA's two assessment
 *    rounds).
 *  - Demonstrates the learned-alias promotion loop end-to-end: two
 *    recruiter corrections for the same (skill, phrase) pair promote the
 *    alias, and a third candidate's resume is automatically re-scored with
 *    it via `getLearnedAliases()` + `analyzeResume()`'s `learnedAliases` arg.
 *
 * Run via: node --experimental-strip-types src/scripts/seed-stress-test-phase4.ts
 */

import mongoose from 'mongoose';
import { analyzeResume, extractResumeText, recomputeFromSkillGaps, RELATED_SKILL_SCORE } from '../lib/resumeAnalysis.ts';
import { analyzeInterview } from '../lib/interviewAnalysis.ts';
import { analyzeAssessment } from '../lib/assessmentAnalysis.ts';
import { Job } from '../db/models/Job.ts';
import { Candidate } from '../db/models/Candidate.ts';
import { Interview } from '../db/models/Interview.ts';
import { Assessment } from '../db/models/Assessment.ts';
import { logActivity } from '../lib/activity.ts';
import { recordSkillCorrection, recordOutcomeSignal, getLearnedAliases } from '../lib/learningEngine.ts';
import { sortedPipeline, findStage, isHiredStage } from '../lib/pipeline.ts';

const MONGODB_URI = process.env.MONGODB_URI ?? 'mongodb://localhost:27017/hireverse';

// ── Lookup helpers ────────────────────────────────────────────────────────

async function getJob(title: string) {
  const job = await Job.findOne({ title }).lean();
  if (!job) throw new Error(`Job "${title}" not found — run seed-stress-test.ts first.`);
  return job as any;
}

async function getCandidate(jobId: any, resumeName: string) {
  const c = await Candidate.findOne({ jobId, resumeName });
  if (!c) throw new Error(`Candidate with resumeName "${resumeName}" not found for job ${jobId}`);
  return c;
}

// ── Stage movement / outcome signals ─────────────────────────────────────

async function advanceThroughStages(candidate: any, job: any, stageKeys: string[], movedBy = 'Maya Kim') {
  const pipeline = sortedPipeline(job.pipeline);
  for (const key of stageKeys) {
    const toStage = findStage(pipeline, key);
    const fromStage = findStage(pipeline, candidate.currentStage);
    if (!toStage) throw new Error(`Stage "${key}" not found in pipeline for job "${job.title}"`);

    candidate.stageHistory.push({
      stageKey: toStage.key,
      stageLabel: toStage.label,
      fromStageKey: fromStage?.key || '',
      fromStageLabel: fromStage?.label || '',
      movedBy,
      movedAt: new Date(),
      notes: '',
    } as any);
    candidate.currentStage = toStage.key;
    await candidate.save();

    await recordOutcomeSignal({
      jobId: job._id.toString(),
      candidateId: candidate._id.toString(),
      score: candidate.score,
      fromStageKey: fromStage?.key,
      toStageKey: toStage.key,
      outcome: isHiredStage(job.pipeline, toStage.key) ? 'hired' : 'advanced',
    });

    await logActivity({
      type: 'stage',
      action: 'stage_changed',
      message: `${candidate.name} moved from "${fromStage?.label || 'the start'}" to "${toStage.label}"`,
      entityType: 'candidate',
      entityId: candidate._id.toString(),
      jobId: job._id.toString(),
      candidateId: candidate._id.toString(),
    });
    console.log(`    ${candidate.name}: "${fromStage?.label || 'the start'}" -> "${toStage.label}"`);
  }
}

async function rejectCandidate(candidate: any, job: any, by = 'Maya Kim') {
  candidate.rejected = true;
  candidate.rejectedAt = new Date();
  candidate.rejectedBy = by;
  await candidate.save();

  await recordOutcomeSignal({
    jobId: job._id.toString(),
    candidateId: candidate._id.toString(),
    score: candidate.score,
    fromStageKey: candidate.currentStage,
    outcome: 'rejected',
  });

  await logActivity({
    type: 'candidate',
    action: 'candidate_rejected',
    message: `${candidate.name} was rejected`,
    entityType: 'candidate',
    entityId: candidate._id.toString(),
    jobId: job._id.toString(),
    candidateId: candidate._id.toString(),
  });
  console.log(`    Rejected: ${candidate.name}`);
}

async function unrejectCandidate(candidate: any, job: any) {
  candidate.rejected = false;
  candidate.rejectedAt = null;
  candidate.rejectedBy = '';
  await candidate.save();

  await logActivity({
    type: 'candidate',
    action: 'candidate_unrejected',
    message: `${candidate.name}'s rejection was undone`,
    entityType: 'candidate',
    entityId: candidate._id.toString(),
    jobId: job._id.toString(),
    candidateId: candidate._id.toString(),
  });
  console.log(`    Un-rejected: ${candidate.name}`);
}

// ── Interview / Assessment fixtures ──────────────────────────────────────

async function createInterview(candidate: any, job: any, opts: {
  pipelineStage: string;
  round: string;
  interviewer: string;
  date: string;
  time?: string;
  status: 'scheduled' | 'completed' | 'cancelled' | 'rescheduled';
  feedback?: string;
  transcript?: string;
  notes?: string;
}) {
  const fields: any = {
    candidateId: candidate._id,
    jobId: job._id,
    pipelineStage: opts.pipelineStage,
    round: opts.round,
    interviewer: opts.interviewer,
    date: opts.date,
    time: opts.time || '10:00',
    status: opts.status,
    notes: opts.notes || '',
  };

  if (opts.status === 'completed') {
    const feedback = opts.feedback ?? '';
    const transcript = opts.transcript ?? '';
    const result = analyzeInterview({
      candidateName: candidate.name,
      round: opts.round,
      feedback,
      transcript,
      jobTitle: job.title,
      jobLevel: job.level,
    });
    fields.feedback = feedback;
    fields.transcript = transcript;
    fields.commScore = result.commScore;
    fields.techScore = result.techScore;
    fields.confidenceScore = result.confidenceScore;
    fields.recommendation = result.recommendation;
    fields.transcriptSummary = result.transcriptSummary;
    fields.analysis = {
      strengths: result.strengths,
      concerns: result.concerns,
      reasoning: result.reasoning,
      decision: result.decision,
      analyzedAt: new Date(),
    };
    console.log(
      `    Interview "${opts.round}" for ${candidate.name}: tech ${result.techScore}, comm ${result.commScore}, ` +
      `confidence ${result.confidenceScore} -> ${result.recommendation} (${result.decision})`
    );
  } else {
    console.log(`    Interview "${opts.round}" for ${candidate.name}: status=${opts.status}`);
  }

  return Interview.create(fields);
}

async function createAssessment(candidate: any, job: any, opts: {
  pipelineStage: string;
  round: string;
  type: 'coding' | 'written' | 'take-home';
  status: 'pending' | 'submitted' | 'evaluated';
  questionAsked?: string;
  submission?: string;
  evaluatorNotes?: string;
  testsPassed?: number;
  testsTotal?: number;
  dueDate?: string;
  dueTime?: string;
  instructions?: string;
}) {
  const fields: any = {
    candidateId: candidate._id,
    jobId: job._id,
    pipelineStage: opts.pipelineStage,
    round: opts.round,
    type: opts.type,
    status: opts.status,
    instructions: opts.instructions || '',
    questionAsked: opts.questionAsked || '',
    dueDate: opts.dueDate || '',
    dueTime: opts.dueTime || '',
    submission: opts.submission || '',
    evaluatorNotes: opts.evaluatorNotes || '',
    testsPassed: opts.testsPassed || 0,
    testsTotal: opts.testsTotal || 0,
  };

  if (opts.status === 'evaluated') {
    const result = analyzeAssessment({
      type: opts.type,
      round: opts.round,
      submission: fields.submission,
      evaluatorNotes: fields.evaluatorNotes,
      testsPassed: fields.testsPassed,
      testsTotal: fields.testsTotal,
      candidateName: candidate.name,
      jobTitle: job.title,
      questionAsked: fields.questionAsked,
    });
    fields.codeQualityScore = result.codeQualityScore;
    fields.algorithmScore = result.algorithmScore;
    fields.problemSolvingScore = result.problemSolvingScore;
    fields.overallScore = result.overallScore;
    fields.recommendation = result.recommendation;
    fields.summary = result.summary;
    fields.analysis = {
      strengths: result.strengths,
      concerns: result.concerns,
      reasoning: result.reasoning,
      decision: result.decision,
      analyzedAt: new Date(),
    };
    console.log(
      `    Assessment "${opts.round}" for ${candidate.name}: cq ${result.codeQualityScore}, alg ${result.algorithmScore}, ` +
      `ps ${result.problemSolvingScore}, overall ${result.overallScore} -> ${result.recommendation}`
    );
  } else {
    console.log(`    Assessment "${opts.round}" for ${candidate.name}: status=${opts.status}`);
  }

  return Assessment.create(fields);
}

// ── Learned-alias promotion proof ────────────────────────────────────────
//
// Job 1's required skill "Kubernetes" is deliberately absent from every
// resume's literal vocabulary. Two Job 1 candidates (rohan_kapoor.txt,
// sneha_iyer.txt) instead say "container orchestration" for it — exactly the
// kind of real-but-unrecognized evidence the skill-correction flow exists
// for. After both are corrected, the (Kubernetes, "container orchestration")
// alias should be PROMOTED (LEARNED_ALIAS_THRESHOLD = 2), and a third
// candidate (sunil_rao.txt, also says "container orchestration", analyzed
// before the alias existed) should automatically pick up `related` credit +
// `learnedOccurrences` when re-analyzed with `getLearnedAliases()`.
async function learnedAliasProof() {
  console.log('\n=== Learned-alias promotion proof: Kubernetes / "container orchestration" ===');
  const job1 = await getJob('Backend Engineer (Node.js)');
  const jobLike = {
    requiredSkills: job1.requiredSkills,
    niceToHaveSkills: job1.niceToHaveSkills,
    education: job1.education,
    level: job1.level,
  };

  async function correctKubernetes(resumeName: string) {
    const candidate = await getCandidate(job1._id, resumeName);
    const idx = (candidate.skillGaps as any[]).findIndex((g: any) => g.skill.toLowerCase() === 'kubernetes');
    if (idx === -1) throw new Error(`${resumeName}: no "Kubernetes" skillGap found`);
    const gap = candidate.skillGaps[idx] as any;
    if (gap.status !== 'missing') {
      console.log(`    ${candidate.name}: "Kubernetes" already "${gap.status}" — skipping correction`);
      return null;
    }

    const before = { score: candidate.score };
    candidate.skillGaps[idx].status = 'related';
    candidate.skillGaps[idx].relatedSkill = 'container orchestration';
    candidate.skillGaps[idx].score = RELATED_SKILL_SCORE;

    const recomputed = recomputeFromSkillGaps(candidate.skillGaps as any, candidate.educationMatch, candidate.experience, jobLike);
    candidate.skillsMatch = recomputed.skillsMatch;
    candidate.score = recomputed.score;
    candidate.recommendation = recomputed.recommendation;

    const correction = await recordSkillCorrection({
      jobId: job1._id.toString(),
      candidateId: candidate._id.toString(),
      skill: 'Kubernetes',
      evidencePhrase: 'container orchestration',
      fromStatus: 'missing',
      toStatus: 'related',
    });
    candidate.skillGaps[idx].learnedOccurrences = correction.occurrences;
    await candidate.save();

    await logActivity({
      type: 'candidate',
      action: 'skill_correction_recorded',
      message: `${candidate.name}'s "Kubernetes" gap was corrected to "related" (evidence: "container orchestration") — score ${before.score} → ${candidate.score}.${correction.justPromoted ? ' This alias is now recognized platform-wide for "Kubernetes".' : ''}`,
      entityType: 'candidate',
      entityId: candidate._id.toString(),
      jobId: job1._id.toString(),
      candidateId: candidate._id.toString(),
    });

    console.log(
      `    ${candidate.name}: "Kubernetes" missing -> related, score ${before.score} -> ${candidate.score}, ` +
      `occurrences=${correction.occurrences}, promoted=${correction.promoted}, justPromoted=${correction.justPromoted}`
    );
    return correction;
  }

  await correctKubernetes('rohan_kapoor.txt');
  const second = await correctKubernetes('sneha_iyer.txt');
  if (!second?.justPromoted) {
    console.warn('    WARNING: expected the 2nd correction (sneha_iyer.txt) to promote the alias — check LEARNED_ALIAS_THRESHOLD / occurrences.');
  }

  // 3rd candidate: re-analyze sunil_rao.txt (also has "container orchestration"
  // in his resume, but was originally analyzed before the alias existed) with
  // the now-promoted alias loaded.
  const learnedAliases = await getLearnedAliases();
  const sunil = await getCandidate(job1._id, 'sunil_rao.txt');
  const before = { score: sunil.score, skillsMatch: sunil.skillsMatch };
  const text = await extractResumeText(Buffer.from(sunil.resumeBase64, 'base64'), sunil.resumeType, sunil.resumeName);
  const analysis = analyzeResume(text, sunil.resumeName, jobLike, learnedAliases);
  const kGap: any = analysis.skillGaps.find(g => g.skill.toLowerCase() === 'kubernetes');

  sunil.skills = analysis.skills;
  sunil.practicalSkills = analysis.practicalSkills;
  sunil.achievements = analysis.achievements;
  sunil.skillGaps = analysis.skillGaps as any;
  sunil.skillsMatch = analysis.skillsMatch;
  sunil.educationMatch = analysis.educationMatch;
  sunil.score = analysis.score;
  sunil.recommendation = analysis.recommendation;
  await sunil.save();

  await logActivity({
    type: 'candidate',
    action: 'candidate_reanalyzed',
    message: `${sunil.name}'s resume was re-analyzed with the now-promoted "container orchestration" -> "Kubernetes" alias — skillsMatch ${before.skillsMatch} -> ${sunil.skillsMatch}, score ${before.score} -> ${sunil.score}.`,
    entityType: 'candidate',
    entityId: sunil._id.toString(),
    jobId: job1._id.toString(),
    candidateId: sunil._id.toString(),
  });

  console.log(
    `    ${sunil.name} (3rd candidate, auto-benefit): "Kubernetes" gap now "${kGap?.status}" ` +
    `(learnedOccurrences=${kGap?.learnedOccurrences}), score ${before.score} -> ${sunil.score}`
  );

  return job1;
}

// ── Job 1: Backend Engineer (Node.js) ────────────────────────────────────

async function job1Fixtures(job1: any) {
  console.log('\n=== Job 1: Backend Engineer (Node.js) ===');

  // Strong candidate sails through the entire pipeline -> hired.
  const arjun = await getCandidate(job1._id, 'arjun_mehta.txt');
  await advanceThroughStages(arjun, job1, ['resume-screen', 'coding-test', 'technical-interview', 'hr-round', 'offer', 'hired']);

  // Mid-pipeline candidate, still in progress.
  const meena = await getCandidate(job1._id, 'meena_pillai.txt');
  await advanceThroughStages(meena, job1, ['resume-screen', 'coding-test']);

  // Overdue assessment: candidate sits at "Coding Test" with a pending
  // assessment whose due date has already passed.
  const priyanka = await getCandidate(job1._id, 'priyanka_das.txt');
  await advanceThroughStages(priyanka, job1, ['resume-screen', 'coding-test']);
  await createAssessment(priyanka, job1, {
    pipelineStage: 'coding-test',
    round: 'Coding Test',
    type: 'coding',
    status: 'pending',
    questionAsked: 'Implement a REST endpoint that paginates a list of users from MongoDB.',
    instructions: 'Implement a REST endpoint that paginates a list of users from MongoDB using Express and Mongoose.',
    dueDate: '2026-06-01',
    dueTime: '18:00',
  });

  // Red-flag hard cap: strong technical signal, but an integrity-related red
  // flag in the verdict should cap the overall score at 35 regardless.
  const farah = await getCandidate(job1._id, 'farah_khan.txt');
  await advanceThroughStages(farah, job1, ['resume-screen', 'coding-test', 'technical-interview']);
  await createInterview(farah, job1, {
    pipelineStage: 'technical-interview',
    round: 'Technical Interview',
    interviewer: 'Anika Rao',
    date: '2026-06-10',
    status: 'completed',
    feedback:
      'Farah demonstrated strong technical knowledge and solid architectural thinking throughout the session, ' +
      'and produced clean, working code for the exercise. However, there is a serious red flag: her account of ' +
      'her previous role\'s responsibilities was inconsistent with what is on her resume, which raises an ' +
      'integrity concern we cannot ignore.',
  });
  await rejectCandidate(farah, job1);
}

// ── Job 2: Frontend Engineer (React) ─────────────────────────────────────

async function job2Fixtures() {
  console.log('\n=== Job 2: Frontend Engineer (React) ===');
  const job2 = await getJob('Frontend Engineer (React)');

  // Take Home Project, 100% tests passed.
  const aditi = await getCandidate(job2._id, 'aditi_verma.txt');
  await advanceThroughStages(aditi, job2, ['resume-screen', 'take-home-project']);
  await createAssessment(aditi, job2, {
    pipelineStage: 'take-home-project',
    round: 'Take Home Project',
    type: 'take-home',
    status: 'evaluated',
    questionAsked: 'Build a small React component that fetches and displays a paginated list of items.',
    submission:
      'Implemented a PaginatedList component using React hooks (useState, useEffect) with clean, well-structured ' +
      'code and inline comments. All provided unit tests pass.',
    evaluatorNotes:
      'Clean, readable code with good naming conventions. All 10 tests passed. Solid problem-solving approach — ' +
      'broke the task down into clear, reusable pieces.',
    testsPassed: 10,
    testsTotal: 10,
  });
  await advanceThroughStages(aditi, job2, ['tech-screen']);

  // Take Home Project, 0/0 testsTotal (no test harness for this submission).
  const rohit = await getCandidate(job2._id, 'rohit_sharma.txt');
  await advanceThroughStages(rohit, job2, ['resume-screen', 'take-home-project']);
  await createAssessment(rohit, job2, {
    pipelineStage: 'take-home-project',
    round: 'Take Home Project',
    type: 'take-home',
    status: 'evaluated',
    questionAsked: 'Build a small React component that fetches and displays a paginated list of items.',
    submission:
      'Submitted a working prototype as a hosted preview link. Implemented the basic list view and pagination controls.',
    evaluatorNotes:
      'Reasonable understanding of React fundamentals; the UI works but state management could be cleaner. No automated test suite was provided for this submission.',
    testsPassed: 0,
    testsTotal: 0,
  });

  // Empty-feedback neutral-60 default at the "Tech Screen" stage — a stage
  // name that is NOT classified as an interview stage by isInterviewStage()
  // (see PART 8 findings).
  const ishaan = await getCandidate(job2._id, 'ishaan_kapoor.md');
  await advanceThroughStages(ishaan, job2, ['resume-screen', 'take-home-project', 'tech-screen']);
  await createInterview(ishaan, job2, {
    pipelineStage: 'tech-screen',
    round: 'Tech Screen',
    interviewer: 'Anika Rao',
    date: '2026-06-09',
    status: 'completed',
    feedback: '',
  });

  // Strong overqualified-for-junior candidate sails through to hired.
  const rakesh = await getCandidate(job2._id, 'rakesh_verma.txt');
  await advanceThroughStages(rakesh, job2, ['resume-screen', 'take-home-project', 'tech-screen', 'hr-round', 'offer', 'hired']);

  // Rejected early.
  const devika = await getCandidate(job2._id, 'devika_nair.txt');
  await advanceThroughStages(devika, job2, ['resume-screen']);
  await rejectCandidate(devika, job2);
}

// ── Job 3: Senior Data Scientist ─────────────────────────────────────────

async function job3Fixtures() {
  console.log('\n=== Job 3: Senior Data Scientist ===');
  const job3 = await getJob('Senior Data Scientist');

  // Domain-mismatch candidate (score 48) rejected.
  const rina = await getCandidate(job3._id, 'rina_thomas.txt');
  await rejectCandidate(rina, job3);

  // 3+ uncertainty-admission penalty.
  const oleg = await getCandidate(job3._id, 'oleg_petrov.txt');
  await advanceThroughStages(oleg, job3, ['resume-screen', 'technical-interview']);
  await createInterview(oleg, job3, {
    pipelineStage: 'technical-interview',
    round: 'Technical Interview',
    interviewer: 'Dev Patel',
    date: '2026-06-08',
    status: 'completed',
    feedback:
      "When asked about distributed training, Oleg said 'I don't know the details of that.' When asked about " +
      "Spark internals, he said 'I haven't worked with that much.' When asked about a recent MLOps tool, he " +
      "said 'I'm not familiar with that.' He did show a solid understanding of classical ML algorithms overall.",
  });

  // Strong candidate -> hired.
  const ananya = await getCandidate(job3._id, 'ananya_krishnan.txt');
  await advanceThroughStages(ananya, job3, ['resume-screen', 'technical-interview', 'panel-interview', 'offer', 'hired']);

  // Mid-pipeline.
  const tina = await getCandidate(job3._id, 'tina_fernandes.txt');
  await advanceThroughStages(tina, job3, ['resume-screen', 'technical-interview', 'panel-interview']);
}

// ── Job 4: DevOps/SRE Lead (dual interview gate) ─────────────────────────

async function job4Fixtures() {
  console.log('\n=== Job 4: DevOps/SRE Lead (dual interview-gate) ===');
  const job4 = await getJob('DevOps/SRE Lead');

  // Moves through BOTH "Tech Round 1" and "Tech Round 2" — each gets its own
  // completed, analyzed interview, confirming per-stage-scoped gate checks.
  const rajesh = await getCandidate(job4._id, 'rajesh_nair.txt');
  await advanceThroughStages(rajesh, job4, ['resume-screen', 'tech-round-1']);
  await createInterview(rajesh, job4, {
    pipelineStage: 'tech-round-1',
    round: 'Tech Round 1',
    interviewer: 'Dev Patel',
    date: '2026-06-05',
    status: 'completed',
    feedback:
      'Rajesh showed a strong technical knowledge of Kubernetes and Terraform, and walked us through several ' +
      'real-world incident-response trade-offs with clear, confident reasoning. Communicated clearly throughout.',
  });
  await advanceThroughStages(rajesh, job4, ['tech-round-2']);
  await createInterview(rajesh, job4, {
    pipelineStage: 'tech-round-2',
    round: 'Tech Round 2',
    interviewer: 'Anika Rao',
    date: '2026-06-09',
    status: 'completed',
    feedback:
      'Second round confirmed the same impression — an exceptional candidate with practical, hands-on industry ' +
      'experience running production AWS infrastructure. Strong hire.',
  });
  await advanceThroughStages(rajesh, job4, ['hr-round']);

  // Rescheduled interview (audit-trail check) — candidate still sits at
  // "Tech Round 1", with a rescheduled (not completed) interview on record.
  const natasha = await getCandidate(job4._id, 'natasha_volkov.txt');
  await advanceThroughStages(natasha, job4, ['resume-screen', 'tech-round-1']);
  await createInterview(natasha, job4, {
    pipelineStage: 'tech-round-1',
    round: 'Tech Round 1',
    interviewer: 'Dev Patel',
    date: '2026-06-12',
    time: '15:00',
    status: 'rescheduled',
    notes: 'Originally scheduled for 2026-06-08 14:00 — moved to 2026-06-12 15:00 at the interviewer\'s request (scheduling conflict).',
  });
}

// ── Job 5: QA Automation Engineer (dual assessment gate) ─────────────────

async function job5Fixtures() {
  console.log('\n=== Job 5: QA Automation Engineer (dual assessment-gate) ===');
  const job5 = await getJob('QA Automation Engineer');

  // Moves through BOTH "Coding Test" and "Written Assessment" — each gets
  // its own evaluated, analyzed assessment, confirming per-stage-scoped
  // gate checks for findAssessmentGateStage with multiple matching stages.
  const sonal = await getCandidate(job5._id, 'sonal_mishra.txt');
  await advanceThroughStages(sonal, job5, ['resume-screen', 'coding-test']);
  await createAssessment(sonal, job5, {
    pipelineStage: 'coding-test',
    round: 'Coding Test',
    type: 'coding',
    status: 'evaluated',
    questionAsked: 'Write a Selenium test suite (Java) for a login form, including negative test cases.',
    submission:
      'function loginTests() { if (validCreds) { return pass; } else { return fail; } } // covers valid, invalid, ' +
      'and empty-field cases with a data-driven loop over test fixtures.',
    evaluatorNotes:
      'Clean, well-structured code with good naming. All edge cases handled. 9 of 10 tests passed — correct, working solution overall.',
    testsPassed: 9,
    testsTotal: 10,
  });
  await advanceThroughStages(sonal, job5, ['written-assessment']);
  await createAssessment(sonal, job5, {
    pipelineStage: 'written-assessment',
    round: 'Written Assessment',
    type: 'written',
    status: 'evaluated',
    questionAsked: 'Describe your approach to designing a regression test strategy for a fast-moving API.',
    submission:
      'I would start by identifying the highest-risk endpoints based on usage analytics and recent change ' +
      'frequency. From there, I would build a layered suite: fast contract tests on every PR, a broader ' +
      'regression pass nightly, and a small smoke suite gating deploys. I would also track flaky tests weekly ' +
      'and quarantine them so they do not erode trust in the suite. Finally, I would review coverage gaps each ' +
      'sprint with the team and prioritize new tests against real incidents we have seen.',
    evaluatorNotes:
      'Excellent communication skills and a clear, structured approach to the problem. Justified the prioritization ' +
      'trade-offs well.',
  });
  await advanceThroughStages(sonal, job5, ['technical-interview']);

  // Rejected.
  const fatima = await getCandidate(job5._id, 'fatima_ali.txt');
  await advanceThroughStages(fatima, job5, ['resume-screen']);
  await rejectCandidate(fatima, job5);
}

// ── Job 6: Product Manager ────────────────────────────────────────────────

async function job6Fixtures() {
  console.log('\n=== Job 6: Product Manager ===');
  const job6 = await getJob('Product Manager');

  // Domain-mismatch candidate (score 48) rejected.
  const tushar = await getCandidate(job6._id, 'tushar_agarwal.txt');
  await rejectCandidate(tushar, job6);

  // Strong candidate -> hired.
  const simran = await getCandidate(job6._id, 'simran_kaur.txt');
  await advanceThroughStages(simran, job6, ['resume-screen', 'hiring-manager-interview', 'panel-interview', 'offer', 'hired']);
}

// ── Job 8: Sales Development Representative ──────────────────────────────

async function job8Fixtures() {
  console.log('\n=== Job 8: Sales Development Representative ===');
  const job8 = await getJob('Sales Development Representative');

  // Reject then undo — full rejection-toggle flow.
  const harpreet = await getCandidate(job8._id, 'harpreet_singh.txt');
  await rejectCandidate(harpreet, job8);
  await unrejectCandidate(harpreet, job8);

  // "Inverted negation" verdict phrase — a positive-sounding "great fit"
  // immediately followed by "but ... would not recommend moving them
  // forward" should read as a NEGATIVE overall verdict, not a positive one.
  // The VERDICT_SIGNALS lookahead/lookbehind in interviewAnalysis.ts is
  // designed to catch exactly this; this fixture documents/confirms it.
  const ritika = await getCandidate(job8._id, 'ritika_chawla.txt');
  await advanceThroughStages(ritika, job8, ['resume-screen', 'phone-screen']);
  await createInterview(ritika, job8, {
    pipelineStage: 'phone-screen',
    round: 'Phone Screen',
    interviewer: 'Tom Becker',
    date: '2026-06-07',
    status: 'completed',
    feedback:
      'Ritika came across as an articulate, structured communicator with a lot of enthusiasm for the role. ' +
      'On paper this looked like a great fit, but after the call I would not recommend moving her forward — ' +
      'her cold-calling experience was entirely internship-based.',
  });
}

// ── Job 9: Mobile Engineer (React Native) ────────────────────────────────

async function job9Fixtures() {
  console.log('\n=== Job 9: Mobile Engineer (React Native) ===');
  const job9 = await getJob('Mobile Engineer (React Native)');

  // Strong candidate -> hired.
  const arnav = await getCandidate(job9._id, 'arnav_sethi.txt');
  await advanceThroughStages(arnav, job9, ['resume-screen', 'coding-test', 'technical-interview', 'hr-round', 'offer', 'hired']);
}

// ── Job 10: HR Business Partner ──────────────────────────────────────────

async function job10Fixtures() {
  console.log('\n=== Job 10: HR Business Partner ===');
  const job10 = await getJob('HR Business Partner');

  // Strong candidate -> hired.
  const shreya = await getCandidate(job10._id, 'shreya_kulkarni.txt');
  await advanceThroughStages(shreya, job10, ['resume-screen', 'hr-panel-interview', 'leadership-interview', 'offer', 'hired']);

  // Oscar Lima — the candidate whose score was corrected 48 -> 78 by the
  // extractExperience() cross-section fix (Phase 6) — now progresses normally.
  const oscar = await getCandidate(job10._id, 'oscar_lima.txt');
  await advanceThroughStages(oscar, job10, ['resume-screen', 'hr-panel-interview']);
}

// ── Job 11: Data Engineer ─────────────────────────────────────────────────

async function job11Fixtures() {
  console.log('\n=== Job 11: Data Engineer ===');
  const job11 = await getJob('Data Engineer');

  // Strong candidate, good coding-test, advances further.
  const kiran = await getCandidate(job11._id, 'kiran_desai.txt');
  await advanceThroughStages(kiran, job11, ['resume-screen', 'coding-test']);
  await createAssessment(kiran, job11, {
    pipelineStage: 'coding-test',
    round: 'Coding Test',
    type: 'coding',
    status: 'evaluated',
    questionAsked: 'Write a function that deduplicates streaming records using a sliding time window.',
    submission:
      'function dedupe(records, windowMs) { const seen = new Map(); const out = []; for (const r of records) { ' +
      'if (!seen.has(r.id) || r.ts - seen.get(r.id) > windowMs) { out.push(r); seen.set(r.id, r.ts); } } return out; } ' +
      '// O(n) single pass, handles edge cases like empty input and out-of-order timestamps.',
    evaluatorNotes:
      'Efficient, correct solution — handled edge cases well and explained the trade-offs of the sliding-window ' +
      'approach clearly. All tests passed.',
    testsPassed: 8,
    testsTotal: 8,
  });
  await advanceThroughStages(kiran, job11, ['technical-interview']);

  // Question-relevance mismatch: submission/notes don't address the assigned question at all.
  const mohit = await getCandidate(job11._id, 'mohit_agarwal.txt');
  await advanceThroughStages(mohit, job11, ['resume-screen', 'coding-test']);
  await createAssessment(mohit, job11, {
    pipelineStage: 'coding-test',
    round: 'Coding Test',
    type: 'coding',
    status: 'evaluated',
    questionAsked:
      'Design and implement an Airflow DAG that ingests data from Kafka, deduplicates records using a sliding ' +
      'window, and writes results to a Spark job for downstream processing.',
    submission:
      'I really enjoyed my time at my last company. The team culture was great and I learned a lot about ' +
      'communication and leadership. I am excited about new opportunities and growing my career.',
    evaluatorNotes:
      'The response did not address the technical question at all — talked about culture and career goals instead.',
    testsPassed: 0,
    testsTotal: 0,
  });

  // Below-range experience, rejected.
  const priya = await getCandidate(job11._id, 'priya_nambiar.txt');
  await advanceThroughStages(priya, job11, ['resume-screen']);
  await rejectCandidate(priya, job11);
}

// ── Job 12: Full-Stack Engineer (Contract) ───────────────────────────────

async function job12Fixtures() {
  console.log('\n=== Job 12: Full-Stack Engineer (Contract) ===');
  const job12 = await getJob('Full-Stack Engineer (Contract)');

  // Strong bootcamp grad -> hired.
  const leon = await getCandidate(job12._id, 'leon_marsh.txt');
  await advanceThroughStages(leon, job12, ['resume-screen', 'take-home-project', 'technical-interview', 'offer', 'hired']);

  // Empty submission + harshly negative evaluator notes — tests the
  // submissionHeuristics() "-10 for no submission on record" path and how it
  // combines with negative signal scanning of the evaluator's notes.
  const noah = await getCandidate(job12._id, 'noah_bennett.txt');
  await advanceThroughStages(noah, job12, ['resume-screen', 'take-home-project']);
  await createAssessment(noah, job12, {
    pipelineStage: 'take-home-project',
    round: 'Take Home Project',
    type: 'take-home',
    status: 'evaluated',
    questionAsked: 'Build a small full-stack to-do list app with a Node.js API and a simple frontend.',
    submission: '',
    evaluatorNotes:
      'No submission was received by the deadline. Based on our call, the candidate seemed to have no clear ' +
      'approach and the solution was incomplete — did not finish even a basic version of the task.',
    testsPassed: 0,
    testsTotal: 0,
  });
}

// ── Main ──────────────────────────────────────────────────────────────────

async function main() {
  console.log('Connecting to MongoDB…');
  await mongoose.connect(MONGODB_URI);
  console.log('Connected.\n');

  const job1 = await learnedAliasProof();
  await job1Fixtures(job1);
  await job2Fixtures();
  await job3Fixtures();
  await job4Fixtures();
  await job5Fixtures();
  await job6Fixtures();
  await job8Fixtures();
  await job9Fixtures();
  await job10Fixtures();
  await job11Fixtures();
  await job12Fixtures();

  await mongoose.disconnect();
  console.log('\nDone. Stress-test reseed Phase 4 complete.');
}

main().catch(err => { console.error(err); process.exit(1); });
