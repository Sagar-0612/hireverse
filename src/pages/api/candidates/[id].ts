import type { APIRoute } from 'astro';
import { connectDB } from '../../../db/connection';
import { Candidate } from '../../../db/models/Candidate';
import { Interview } from '../../../db/models/Interview';
import { Assessment } from '../../../db/models/Assessment';
import { Job } from '../../../db/models/Job';
import { Types } from 'mongoose';
import { findStage, isValidStageTransition, findInterviewGateStage, findAssessmentGateStage, isInterviewStage, isAssessmentStage } from '../../../lib/pipeline';
import { logActivity } from '../../../lib/activity';

const json = (data: unknown, status = 200) =>
  new Response(JSON.stringify(data), { status, headers: { 'Content-Type': 'application/json' } });

export const GET: APIRoute = async ({ params }) => {
  await connectDB();
  const { id } = params;
  if (!Types.ObjectId.isValid(id!)) return json({ error: 'Invalid ID' }, 400);
  const c = await Candidate.findById(id).populate('jobId', 'title department location requiredSkills pipeline').lean();
  if (!c) return json({ error: 'Not found' }, 404);
  return json({ ...c, _id: c._id.toString(), jobId: (c.jobId as any)?._id?.toString() });
};

export const PUT: APIRoute = async ({ params, request }) => {
  await connectDB();
  const { id } = params;
  if (!Types.ObjectId.isValid(id!)) return json({ error: 'Invalid ID' }, 400);
  try {
    const body = await request.json();
    const candidate = await Candidate.findById(id);
    if (!candidate) return json({ error: 'Not found' }, 404);

    // Rejection is a terminal action orthogonal to the pipeline — allowed from
    // any active (non-terminal) stage, not modeled as "backward movement".
    if (body.rejected === true) {
      if (candidate.rejected) return json({ error: 'Candidate is already rejected' }, 400);
      candidate.rejected = true;
      candidate.rejectedAt = new Date();
      candidate.rejectedBy = body.rejectedBy || 'Maya Kim';
      if (body.notes) candidate.notes = body.notes;
      await candidate.save();

      await logActivity({
        type: 'candidate',
        action: 'candidate_rejected',
        message: `${candidate.name} was rejected`,
        entityType: 'candidate',
        entityId: candidate._id.toString(),
        jobId: candidate.jobId.toString(),
        candidateId: candidate._id.toString(),
      });

      return json({ ...candidate.toObject(), _id: candidate._id.toString() });
    }

    // Undo a rejection — recruiters do mis-click "Reject", and there's no
    // reason a corrected mistake should require deleting and re-importing the
    // candidate. Only meaningful when the candidate is currently rejected.
    if (body.rejected === false) {
      if (!candidate.rejected) return json({ error: 'Candidate is not rejected' }, 400);
      candidate.rejected = false;
      candidate.rejectedAt = null;
      candidate.rejectedBy = '';
      if (body.notes) candidate.notes = body.notes;
      await candidate.save();

      await logActivity({
        type: 'candidate',
        action: 'candidate_unrejected',
        message: `${candidate.name}'s rejection was undone`,
        entityType: 'candidate',
        entityId: candidate._id.toString(),
        jobId: candidate.jobId.toString(),
        candidateId: candidate._id.toString(),
      });

      return json({ ...candidate.toObject(), _id: candidate._id.toString() });
    }

    // Stage transition — validated against the parent job's configurable pipeline.
    if (typeof body.currentStage === 'string' && body.currentStage !== candidate.currentStage) {
      const job = await Job.findById(candidate.jobId).lean();
      if (!job) return json({ error: 'Parent job not found' }, 404);

      if (!isValidStageTransition(job.pipeline, candidate.currentStage, body.currentStage)) {
        return json({ error: 'Candidates can only move to their current stage or a later one — not backward' }, 400);
      }

      const fromStage = findStage(job.pipeline, candidate.currentStage);
      const toStage = findStage(job.pipeline, body.currentStage);
      if (!toStage) return json({ error: 'Unknown pipeline stage' }, 400);

      // Moving a candidate past the pipeline's interview stage is exactly the
      // moment their AI read should stop being "resume score, frozen" and
      // start being grounded in real interview signal — that's the whole
      // premise of the dynamic, blended assessment shown on their profile. If
      // nobody has captured a completed, analyzed interview for them yet, that
      // promise silently breaks: the journey says they cleared the interview
      // bar, but the profile is still running on the resume alone. Surfacing
      // that gap (with a deliberate override) keeps the two in sync rather
      // than letting it slip through unnoticed.
      const gateStage = findInterviewGateStage(job.pipeline);
      if (gateStage && toStage.order > gateStage.order && body.confirmSkipInterview !== true) {
        const interviewQuery: Record<string, unknown> = {
          candidateId: candidate._id,
          status: 'completed',
          analysis: { $exists: true, $ne: null },
        };
        // If the candidate is leaving an interview-type stage, the analyzed
        // interview must be FOR that stage — an earlier round's analysis
        // doesn't vouch for a later round the candidate hasn't sat yet (e.g.
        // a "Final Interview" stage shouldn't be satisfied by a "Technical
        // Interview" analysis from an earlier round).
        if (fromStage && isInterviewStage(fromStage)) {
          interviewQuery.pipelineStage = fromStage.key;
        }
        const hasAnalyzedInterview = await Interview.exists(interviewQuery);
        if (!hasAnalyzedInterview) {
          return json({
            error: `${candidate.name} doesn't have a completed, analyzed interview on record yet — moving them to "${toStage.label}" now means their AI score and recommendation will keep running on the resume alone, out of step with a journey that says they've cleared the interview stage. Add the interview's feedback (and transcript, if you have it) first, or confirm you want to move them anyway.`,
            code: 'NO_ANALYZED_INTERVIEW',
            requiresConfirmation: true,
          }, 409);
        }
      }

      // Same idea for assessment-type stages (coding tests, written
      // assessments, take-home tasks): moving a candidate past one without an
      // evaluated, analyzed submission on record leaves their profile running
      // on resume/interview signal alone while the journey says they cleared
      // an assessment they never actually completed.
      const assessmentGateStage = findAssessmentGateStage(job.pipeline);
      if (assessmentGateStage && toStage.order > assessmentGateStage.order && body.confirmSkipAssessment !== true) {
        const assessmentQuery: Record<string, unknown> = {
          candidateId: candidate._id,
          status: 'evaluated',
          analysis: { $exists: true, $ne: null },
        };
        if (fromStage && isAssessmentStage(fromStage)) {
          assessmentQuery.pipelineStage = fromStage.key;
        }
        const hasAnalyzedAssessment = await Assessment.exists(assessmentQuery);
        if (!hasAnalyzedAssessment) {
          return json({
            error: `${candidate.name} doesn't have an evaluated, analyzed assessment on record yet — moving them to "${toStage.label}" now means their AI score and recommendation won't reflect the assessment stage their journey says they've cleared. Evaluate their submission first, or confirm you want to move them anyway.`,
            code: 'NO_ANALYZED_ASSESSMENT',
            requiresConfirmation: true,
          }, 409);
        }
      }

      candidate.stageHistory.push({
        stageKey: toStage.key,
        stageLabel: toStage.label,
        fromStageKey: fromStage?.key || '',
        fromStageLabel: fromStage?.label || '',
        movedBy: body.movedBy || 'Maya Kim',
        movedAt: new Date(),
        notes: body.notes || '',
      } as any);
      candidate.currentStage = toStage.key;
      await candidate.save();

      // Interviews still awaiting their session were scheduled for "wherever
      // the candidate currently sits" — when the candidate moves on before
      // that session happens, the still-scheduled round should follow them
      // forward so the journey/interview list keep showing it under the
      // candidate's real current stage rather than a stage they've left
      // behind. Completed/cancelled interviews stay frozen as history.
      if (fromStage) {
        await Interview.updateMany(
          { candidateId: candidate._id, status: 'scheduled', pipelineStage: fromStage.key },
          { $set: { pipelineStage: toStage.key } }
        );
        // Same idea for assessments still awaiting submission/evaluation —
        // follow the candidate forward rather than being left stranded on a
        // stage they've already moved past.
        await Assessment.updateMany(
          { candidateId: candidate._id, status: { $ne: 'evaluated' }, pipelineStage: fromStage.key },
          { $set: { pipelineStage: toStage.key } }
        );
      }

      await logActivity({
        type: 'stage',
        action: 'stage_changed',
        message: `${candidate.name} moved from "${fromStage?.label || 'the start'}" to "${toStage.label}"`,
        entityType: 'candidate',
        entityId: candidate._id.toString(),
        jobId: candidate.jobId.toString(),
        candidateId: candidate._id.toString(),
      });

      return json({ ...candidate.toObject(), _id: candidate._id.toString() });
    }

    // Generic field update — stage/rejection are mutated only via the dedicated
    // paths above so every transition is captured in stageHistory/ActivityLog.
    delete body.currentStage;
    delete body.rejected;
    delete body.rejectedAt;
    delete body.rejectedBy;
    delete body.stageHistory;
    delete body.jobId;

    const updated = await Candidate.findByIdAndUpdate(id, body, { new: true, runValidators: true }).lean();
    if (!updated) return json({ error: 'Not found' }, 404);
    return json({ ...updated, _id: updated._id.toString() });
  } catch (err: any) {
    return json({ error: err.message }, 400);
  }
};

export const DELETE: APIRoute = async ({ params }) => {
  await connectDB();
  const { id } = params;
  if (!Types.ObjectId.isValid(id!)) return json({ error: 'Invalid ID' }, 400);

  const candidate = await Candidate.findById(id).lean();
  if (!candidate) return json({ error: 'Not found' }, 404);

  await logActivity({
    type: 'candidate',
    action: 'candidate_deleted',
    message: `Candidate "${candidate.name}" was removed`,
    entityType: 'candidate',
    entityId: id!,
    jobId: candidate.jobId?.toString() || '',
  });

  await Interview.deleteMany({ candidateId: id });
  await Assessment.deleteMany({ candidateId: id });
  await Candidate.findByIdAndDelete(id);
  return json({ ok: true });
};
