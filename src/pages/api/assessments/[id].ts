import type { APIRoute } from 'astro';
import { connectDB } from '../../../db/connection';
import { Assessment } from '../../../db/models/Assessment';
import { Candidate } from '../../../db/models/Candidate';
import { Job } from '../../../db/models/Job';
import { Types } from 'mongoose';
import { analyzeAssessment } from '../../../lib/assessmentAnalysis';
import { logActivity } from '../../../lib/activity';

const json = (data: unknown, status = 200) =>
  new Response(JSON.stringify(data), { status, headers: { 'Content-Type': 'application/json' } });

export const GET: APIRoute = async ({ params }) => {
  await connectDB();
  const { id } = params;
  if (!id || !Types.ObjectId.isValid(id)) return json({ error: 'Invalid id' }, 400);
  const doc = await Assessment.findById(id).lean();
  if (!doc) return json({ error: 'Not found' }, 404);
  return json({ ...doc, _id: doc._id.toString() });
};

export const PUT: APIRoute = async ({ params, request }) => {
  await connectDB();
  const { id } = params;
  if (!id || !Types.ObjectId.isValid(id)) return json({ error: 'Invalid id' }, 400);

  const body = await request.json();
  const doc = await Assessment.findById(id);
  if (!doc) return json({ error: 'Assessment not found' }, 404);

  const evaluatingNow =
    body.status === 'evaluated' && (doc.status !== 'evaluated' || !doc.analysis);

  if (evaluatingNow) {
    const evaluatorNotes = typeof body.evaluatorNotes === 'string' ? body.evaluatorNotes.trim() : '';
    if (evaluatorNotes.length < 10) {
      return json({ error: 'Add a bit more detail to your evaluator notes before analysing (at least a sentence).' }, 400);
    }

    const candidate = await Candidate.findById(doc.candidateId, 'name').lean();
    const job = await Job.findById(doc.jobId, 'title level').lean();
    const submission = typeof body.submission === 'string' ? body.submission.trim() : (doc.submission || '');

    const result = analyzeAssessment({
      type: doc.type,
      round: doc.round,
      submission,
      evaluatorNotes,
      testsPassed:  Number(body.testsPassed  ?? doc.testsPassed  ?? 0),
      testsTotal:   Number(body.testsTotal   ?? doc.testsTotal   ?? 0),
      candidateName: candidate?.name || 'The candidate',
      jobTitle: (job as any)?.title || '',
    });

    // Store user inputs
    doc.evaluatorNotes      = evaluatorNotes;
    doc.submission          = submission;
    doc.testsPassed         = Number(body.testsPassed  ?? doc.testsPassed  ?? 0);
    doc.testsTotal          = Number(body.testsTotal   ?? doc.testsTotal   ?? 0);

    // Store computed results only — never from client
    doc.codeQualityScore    = result.codeQualityScore;
    doc.algorithmScore      = result.algorithmScore;
    doc.problemSolvingScore = result.problemSolvingScore;
    doc.overallScore        = result.overallScore;
    doc.recommendation      = result.recommendation;
    doc.summary             = result.summary;
    doc.analysis = {
      strengths:  result.strengths,
      concerns:   result.concerns,
      reasoning:  result.reasoning,
      decision:   result.decision,
      analyzedAt: new Date(),
    };
    doc.status = 'evaluated';
    await doc.save();

    await logActivity({
      type: 'interview',
      action: 'interview_completed',
      message: `"${doc.round}" assessment evaluated for ${candidate?.name || 'candidate'} — ${result.recommendation}`,
      entityType: 'assessment',
      entityId: doc._id.toString(),
      jobId: doc.jobId.toString(),
      candidateId: doc.candidateId.toString(),
    });

    return json({ ...doc.toObject(), _id: doc._id.toString() });
  }

  // Non-evaluation updates: allow changing submission, instructions, status (pending→submitted)
  if (typeof body.instructions    === 'string') doc.instructions    = body.instructions;
  if (typeof body.submission      === 'string') doc.submission      = body.submission;
  if (typeof body.evaluatorNotes  === 'string') doc.evaluatorNotes  = body.evaluatorNotes;
  if (body.testsPassed !== undefined) doc.testsPassed = Number(body.testsPassed);
  if (body.testsTotal  !== undefined) doc.testsTotal  = Number(body.testsTotal);
  if (body.status === 'submitted' && doc.status === 'pending') doc.status = 'submitted';
  await doc.save();

  return json({ ...doc.toObject(), _id: doc._id.toString() });
};
