import type { APIRoute } from 'astro';
import { connectDB } from '../../../../db/connection';
import { Interview } from '../../../../db/models/Interview';
import { Candidate } from '../../../../db/models/Candidate';
import { Job } from '../../../../db/models/Job';
import { Types } from 'mongoose';
import { analyzeInterview } from '../../../../lib/interviewAnalysis';
import { logActivity } from '../../../../lib/activity';

const json = (data: unknown, status = 200) =>
  new Response(JSON.stringify(data), { status, headers: { 'Content-Type': 'application/json' } });

// Re-runs the interview analysis against the feedback/transcript already on
// file with the *current* analyzer — the one place a completed interview that
// was scored before an analysis-engine fix (lexicon coverage, JD calibration,
// etc.) can pick up the corrected, fairer read without anyone re-typing or
// re-fabricating feedback. Mirrors candidates/[id]/reanalyze.ts: only the
// fields the analyzer actually derives are touched, and it requires real
// feedback to already be on record — it never invents an assessment from
// nothing.
export const POST: APIRoute = async ({ params }) => {
  await connectDB();
  const { id } = params;
  if (!Types.ObjectId.isValid(id!)) return json({ error: 'Invalid ID' }, 400);

  const interview = await Interview.findById(id);
  if (!interview) return json({ error: 'Not found' }, 404);
  if (interview.status !== 'completed') {
    return json({ error: 'Only completed interviews can be re-analyzed.' }, 400);
  }
  const feedback = (interview.feedback || '').trim();
  if (feedback.length < 15) {
    return json({ error: 'No usable feedback is on record for this interview to re-analyze — add feedback first.' }, 400);
  }

  const candidate = await Candidate.findById(interview.candidateId, 'name').lean();
  const job = await Job.findById(interview.jobId, 'title level').lean();
  const transcript = (interview.transcript || '').trim();

  const result = analyzeInterview({
    candidateName: candidate?.name || 'The candidate',
    round: interview.round,
    feedback,
    transcript,
    jobTitle: job?.title || '',
    jobLevel: job?.level || '',
  });

  interview.commScore = result.commScore;
  interview.techScore = result.techScore;
  interview.confidenceScore = result.confidenceScore;
  interview.recommendation = result.recommendation;
  interview.transcriptSummary = result.transcriptSummary;
  interview.analysis = {
    strengths: result.strengths,
    concerns: result.concerns,
    reasoning: result.reasoning,
    decision: result.decision,
    analyzedAt: new Date(),
  };
  await interview.save();

  await logActivity({
    type: 'interview',
    action: 'interview_status_changed',
    message: `"${interview.round}" interview for ${candidate?.name || 'a candidate'} was re-analyzed with the latest engine — now reads: ${result.recommendation}`,
    entityType: 'interview',
    entityId: interview._id.toString(),
    jobId: interview.jobId.toString(),
    candidateId: interview.candidateId.toString(),
  });

  return json({
    commScore: result.commScore,
    techScore: result.techScore,
    confidenceScore: result.confidenceScore,
    recommendation: result.recommendation,
    decision: result.decision,
  });
};
