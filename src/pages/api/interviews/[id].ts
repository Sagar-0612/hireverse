import type { APIRoute } from 'astro';
import { connectDB } from '../../../db/connection';
import { Interview } from '../../../db/models/Interview';
import { Candidate } from '../../../db/models/Candidate';
import { Job } from '../../../db/models/Job';
import { Types } from 'mongoose';
import { logActivity } from '../../../lib/activity';
import { analyzeInterview } from '../../../lib/interviewAnalysis';

const json = (data: unknown, status = 200) =>
  new Response(JSON.stringify(data), { status, headers: { 'Content-Type': 'application/json' } });

export const PUT: APIRoute = async ({ params, request }) => {
  await connectDB();
  const { id } = params;
  if (!Types.ObjectId.isValid(id!)) return json({ error: 'Invalid ID' }, 400);
  try {
    const body = await request.json();
    const before = await Interview.findById(id).lean();
    if (!before) return json({ error: 'Not found' }, 404);

    const completingNow = body.status === 'completed' && before.status !== 'completed';

    // Completion is judged from what the interviewer actually observed — the
    // analysis (and every score/recommendation derived from it) is computed
    // here, server-side, from real feedback text. Never trust client-supplied
    // scores for something this consequential.
    if (completingNow) {
      const feedback = typeof body.feedback === 'string' ? body.feedback.trim() : '';
      if (feedback.length < 15) {
        return json({ error: 'Add a bit more detail to your interview feedback (at least a sentence or two) so the analysis has something real to work with.' }, 400);
      }

      const candidate = await Candidate.findById(before.candidateId, 'name').lean();
      const transcript = typeof body.transcript === 'string' ? body.transcript.trim() : '';
      const result = analyzeInterview({
        candidateName: candidate?.name || 'The candidate',
        round: before.round,
        feedback,
        transcript,
      });

      body.feedback = feedback;
      body.transcript = transcript;
      body.commScore = result.commScore;
      body.techScore = result.techScore;
      body.confidenceScore = result.confidenceScore;
      body.recommendation = result.recommendation;
      body.transcriptSummary = result.transcriptSummary;
      body.analysis = {
        strengths: result.strengths,
        concerns: result.concerns,
        reasoning: result.reasoning,
        decision: result.decision,
        analyzedAt: new Date(),
      };
    } else {
      // Analysis is authoritative once computed — block any attempt to
      // overwrite it through a generic update.
      delete body.commScore;
      delete body.techScore;
      delete body.confidenceScore;
      delete body.recommendation;
      delete body.transcriptSummary;
      delete body.analysis;
    }

    const iv = await Interview.findByIdAndUpdate(id, body, { new: true, runValidators: true })
      .populate('candidateId', 'name')
      .populate('jobId', 'title')
      .lean();
    if (!iv) return json({ error: 'Not found' }, 404);

    if (body.status && body.status !== before.status) {
      const verdictNote = completingNow ? ` — AI analysis recommends: ${(iv as any).recommendation}` : '';
      await logActivity({
        type: 'interview',
        action: 'interview_status_changed',
        message: `"${iv.round}" interview for ${(iv.candidateId as any)?.name || 'a candidate'} marked ${body.status}${verdictNote}`,
        entityType: 'interview',
        entityId: iv._id.toString(),
        jobId: (iv.jobId as any)?._id?.toString() || '',
        candidateId: (iv.candidateId as any)?._id?.toString() || '',
      });
    }

    return json({
      ...iv,
      _id: iv._id.toString(),
      candidateId: (iv.candidateId as any)?._id?.toString(),
      jobId: (iv.jobId as any)?._id?.toString(),
      candidateName: (iv.candidateId as any)?.name || '',
      jobTitle: (iv.jobId as any)?.title || '',
    });
  } catch (err: any) {
    return json({ error: err.message }, 400);
  }
};

export const DELETE: APIRoute = async ({ params }) => {
  await connectDB();
  const { id } = params;
  if (!Types.ObjectId.isValid(id!)) return json({ error: 'Invalid ID' }, 400);
  await Interview.findByIdAndDelete(id);
  return json({ ok: true });
};
