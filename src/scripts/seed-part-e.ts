/**
 * PART 5 demo seed — additive, NOT destructive (does not wipe existing data).
 *
 * 1. Adds a "Written Assessment" pipeline stage to the "Backend Engineer
 *    (Node.js)" job, between "Coding Test" and "Technical Interview".
 * 2. Adds three new candidates against that job with resumes in three
 *    deliberately different formats (plain prose, Markdown-style with
 *    headers/bullets, and an old-school all-caps layout with MM/YYYY dates)
 *    to exercise resume-parsing robustness.
 * 3. Creates a scheduled "Coding Test" assessment (due in 2 days) and a
 *    "Written Assessment" (due in 3 days) so both scheduling and the new
 *    written-assessment stage have live data to inspect.
 *
 * Run once:
 *   node --experimental-strip-types src/scripts/seed-part-e.ts
 */

import mongoose from 'mongoose';
import { analyzeResume, jdFingerprint } from '../lib/resumeAnalysis.ts';
import { Job } from '../db/models/Job.ts';
import { Candidate } from '../db/models/Candidate.ts';
import { Assessment } from '../db/models/Assessment.ts';
import { sortedPipeline, findStage } from '../lib/pipeline.ts';
import { generateAssessmentQuestions } from '../lib/codingChallenges.ts';
import { logActivity } from '../lib/activity.ts';

const MONGODB_URI = process.env.MONGODB_URI ?? 'mongodb://localhost:27017/hireverse';

const RESUMES = {
  // Plain prose — no headers, no bullets, dates spelled out in words.
  priya: {
    filename: 'priya_nair.txt',
    text: `Priya Nair
Pune, India | priya.nair.dev@gmail.com | Phone: 9876543210

I am a backend engineer with about five years of experience working mainly with Node.js and Express to build REST APIs, and MongoDB for data storage. In my most recent role at Finlytics Pvt Ltd, from June 2019 till date, I designed and maintained microservices that processed payment data, used Docker to containerize and deploy these services, and worked closely with the DevOps team on AWS infrastructure. Before that, I worked at Webcrafts Solutions from January 2017 to May 2019 as a Junior Developer, where I built internal tools using JavaScript and Express, and wrote unit tests for our REST endpoints. I hold a Bachelor's degree in Computer Science from Pune University. I have also used Kafka for event streaming on a couple of side projects and TypeScript on a recent internal tool rewrite.`,
  },
  // Markdown-style with headers and bullet lists, MM/YYYY date ranges.
  arjun: {
    filename: 'arjun_mehta.md',
    text: `# Arjun Mehta
**Location:** Hyderabad, India
**Email:** arjun.mehta.eng@outlook.com
**Mobile:** +91 90123 45678

## Summary
Backend engineer (4 yrs) specializing in Node.js, Express, and MongoDB.

## Experience

### Backend Engineer — Stackline Systems (03/2021 - Present)
- Built and maintained REST APIs in Node.js / Express serving the core product
- Designed MongoDB schemas and optimized slow aggregation queries
- Containerized services with Docker and deployed to AWS ECS
- Introduced TypeScript across two major services

### Software Engineer — Devmint Labs (07/2019 - 02/2021)
- Implemented REST endpoints in JavaScript / Express
- Wrote integration tests and set up CI pipelines
- Worked with Kafka for an internal event-driven notification system

## Education
- B.Tech, Computer Science — Osmania University

## Skills
Node.js, Express, MongoDB, REST API, JavaScript, TypeScript, Docker, AWS, Kafka, Microservices`,
  },
  // Old-school all-caps layout, MM/YYYY ranges, "Tel" label for phone.
  sunita: {
    filename: 'sunita_rao.txt',
    text: `SUNITA RAO
CHENNAI, INDIA
EMAIL: SUNITA.RAO1990@YAHOO.COM
TEL: 9988776655

OBJECTIVE
BACKEND DEVELOPER WITH 3 YEARS EXPERIENCE SEEKING A ROLE WORKING WITH NODE.JS AND MONGODB.

WORK HISTORY
BACKEND DEVELOPER, GREENFIELD SOFTWARE PVT LTD, 06/2021 - PRESENT
- DEVELOPED REST API ENDPOINTS USING NODE.JS AND EXPRESS
- WROTE MONGODB QUERIES AND BASIC SCHEMA DESIGN
- USED DOCKER FOR LOCAL DEVELOPMENT ENVIRONMENTS
- COLLABORATED WITH FRONTEND TEAM ON JAVASCRIPT INTEGRATION

JUNIOR DEVELOPER, BYTEWORKS, 01/2020 - 05/2021
- ASSISTED IN BUILDING REST API FEATURES IN JAVASCRIPT
- FIXED BUGS AND WROTE BASIC UNIT TESTS

EDUCATION
B.SC COMPUTER SCIENCE, ANNA UNIVERSITY, 2019

SKILLS
NODE.JS, EXPRESS, MONGODB, REST API, JAVASCRIPT, DOCKER`,
  },
};

function addDays(days: number): { date: string; time: string } {
  const d = new Date();
  d.setDate(d.getDate() + days);
  return { date: d.toISOString().split('T')[0], time: '17:00' };
}

async function createCandidateAtStage(jobDoc: any, resumeDef: { filename: string; text: string }, targetStageKey: string) {
  const analysis = analyzeResume(resumeDef.text, resumeDef.filename, {
    requiredSkills: jobDoc.requiredSkills,
    niceToHaveSkills: jobDoc.niceToHaveSkills,
    education: jobDoc.education,
    level: jobDoc.level,
  });

  const pipeline = sortedPipeline(jobDoc.pipeline);
  const targetStage = findStage(jobDoc.pipeline, targetStageKey);
  if (!targetStage) throw new Error(`Stage "${targetStageKey}" not found on job pipeline`);

  const passedStages = pipeline.filter(s => s.order <= targetStage.order);
  const baseTime = Date.now();
  const stageHistory = passedStages.map((stage, i) => ({
    stageKey: stage.key,
    stageLabel: stage.label,
    fromStageKey: i === 0 ? '' : passedStages[i - 1].key,
    fromStageLabel: i === 0 ? '' : passedStages[i - 1].label,
    movedBy: 'Seed Script',
    movedAt: new Date(baseTime + i),
    notes: i === 0 ? 'Auto-created by Part E demo seed script' : `Auto-advanced to "${stage.label}" by Part E demo seed script`,
  }));

  const jdHash = jdFingerprint(jobDoc);
  const base64 = Buffer.from(resumeDef.text).toString('base64');

  const candidate = await Candidate.create({
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
    currentStage: targetStage.key,
    stageHistory,
    skills: analysis.skills,
    practicalSkills: analysis.practicalSkills,
    achievements: analysis.achievements,
    skillGaps: analysis.skillGaps,
    resumeName: resumeDef.filename,
    resumeType: resumeDef.filename.endsWith('.md') ? 'text/markdown' : 'text/plain',
    resumeBase64: base64,
    appliedJdHash: jdHash,
  });

  console.log(
    `    Created: ${analysis.name} (${resumeDef.filename}) — score ${analysis.score}, exp ${analysis.experience}y, ` +
    `currentStage "${targetStage.label}"`
  );

  return candidate;
}

async function main() {
  console.log('Connecting to MongoDB…');
  await mongoose.connect(MONGODB_URI);
  console.log('Connected.\n');

  const job = await Job.findOne({ title: 'Backend Engineer (Node.js)' });
  if (!job) {
    throw new Error('Job "Backend Engineer (Node.js)" not found — run the comprehensive seed first.');
  }

  // 1. Add the "Written Assessment" stage between "Coding Test" and
  //    "Technical Interview" if it isn't there already.
  let pipeline = sortedPipeline(job.pipeline);
  if (!pipeline.some(s => s.key === 'written-assessment')) {
    const codingTest = pipeline.find(s => s.key === 'coding-test');
    const insertOrder = codingTest ? codingTest.order + 1 : pipeline.length;
    const newPipeline = pipeline.map(s => s.order >= insertOrder ? { ...s, order: s.order + 1 } : s);
    newPipeline.push({
      key: 'written-assessment',
      label: 'Written Assessment',
      color: '#14b8a6',
      icon: 'circle',
      order: insertOrder,
    } as any);
    job.pipeline = sortedPipeline(newPipeline) as any;
    await job.save();
    console.log('Added "Written Assessment" stage to "Backend Engineer (Node.js)" pipeline.\n');
    pipeline = sortedPipeline(job.pipeline);
  } else {
    console.log('"Written Assessment" stage already present — skipping pipeline edit.\n');
  }

  // 2. Add candidates with diverse resume formats.
  console.log('Creating candidates with diverse resume formats…');
  const arjun = await createCandidateAtStage(job, RESUMES.arjun, 'coding-test');
  const priya = await createCandidateAtStage(job, RESUMES.priya, 'written-assessment');
  await createCandidateAtStage(job, RESUMES.sunita, 'resume-screen');
  console.log();

  // 3. Scheduled assessments — one coding test, one written assessment, both
  //    with due dates so the new scheduling UI has live overdue/upcoming data.
  const codingDue = addDays(2);
  const codingQuestions = generateAssessmentQuestions({
    type: 'coding',
    jobTitle: job.title,
    jobLevel: job.level || 'Mid Level',
    experience: arjun.experience || 0,
    requiredSkills: job.requiredSkills || [],
    niceToHaveSkills: job.niceToHaveSkills || [],
    practicalSkills: arjun.practicalSkills || [],
    matchedSkills: arjun.skills || [],
  });
  await Assessment.create({
    candidateId: arjun._id,
    jobId: job._id,
    pipelineStage: 'coding-test',
    round: 'Coding Test',
    type: 'coding',
    status: 'pending',
    suggestedQuestions: codingQuestions,
    dueDate: codingDue.date,
    dueTime: '18:00',
  });
  await logActivity({
    type: 'interview',
    action: 'interview_scheduled',
    message: `"Coding Test" assessment created for ${arjun.name}, due ${codingDue.date} 18:00`,
    entityType: 'assessment',
    jobId: job._id.toString(),
    candidateId: arjun._id.toString(),
  });
  console.log(`  Scheduled "Coding Test" for ${arjun.name}, due ${codingDue.date} 18:00`);

  const writtenDue = addDays(3);
  const writtenQuestions = generateAssessmentQuestions({
    type: 'written',
    jobTitle: job.title,
    jobLevel: job.level || 'Mid Level',
    experience: priya.experience || 0,
    requiredSkills: job.requiredSkills || [],
    niceToHaveSkills: job.niceToHaveSkills || [],
    practicalSkills: priya.practicalSkills || [],
    matchedSkills: priya.skills || [],
  });
  await Assessment.create({
    candidateId: priya._id,
    jobId: job._id,
    pipelineStage: 'written-assessment',
    round: 'Written Assessment',
    type: 'written',
    status: 'pending',
    suggestedQuestions: writtenQuestions,
    dueDate: writtenDue.date,
    dueTime: '17:00',
  });
  await logActivity({
    type: 'interview',
    action: 'interview_scheduled',
    message: `"Written Assessment" assessment created for ${priya.name}, due ${writtenDue.date} 17:00`,
    entityType: 'assessment',
    jobId: job._id.toString(),
    candidateId: priya._id.toString(),
  });
  console.log(`  Scheduled "Written Assessment" for ${priya.name}, due ${writtenDue.date} 17:00`);

  await mongoose.disconnect();
  console.log('\nDone. Part E demo seed complete.');
}

main().catch(err => { console.error(err); process.exit(1); });
