import type { APIRoute } from 'astro';
import { connectDB } from '../../../../db/connection';
import { Assessment } from '../../../../db/models/Assessment';
import { Candidate } from '../../../../db/models/Candidate';
import { Job } from '../../../../db/models/Job';
import { Types } from 'mongoose';
import { analyzeAssessment } from '../../../../lib/assessmentAnalysis';

const json = (data: unknown, status = 200) =>
  new Response(JSON.stringify(data), { status, headers: { 'Content-Type': 'application/json' } });

export const POST: APIRoute = async ({ params }) => {
  await connectDB();
  const { id } = params;
  if (!id || !Types.ObjectId.isValid(id)) return json({ error: 'Invalid id' }, 400);

  const doc = await Assessment.findById(id);
  if (!doc) return json({ error: 'Assessment not found' }, 404);
  if (doc.status !== 'evaluated') return json({ error: 'Only evaluated assessments can be re-analysed.' }, 400);

  const notes = (doc.evaluatorNotes || '').trim();
  if (notes.length < 10) return json({ error: 'No usable evaluator notes on record — add notes first.' }, 400);

  const candidate = await Candidate.findById(doc.candidateId, 'name').lean();
  const job = await Job.findById(doc.jobId, 'title').lean();

  const result = analyzeAssessment({
    type: doc.type,
    round: doc.round,
    submission: doc.submission || '',
    evaluatorNotes: notes,
    testsPassed: doc.testsPassed || 0,
    testsTotal:  doc.testsTotal  || 0,
    candidateName: candidate?.name || 'The candidate',
    jobTitle: (job as any)?.title || '',
  });

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
  await doc.save();

  return json({ ...doc.toObject(), _id: doc._id.toString() });
};
