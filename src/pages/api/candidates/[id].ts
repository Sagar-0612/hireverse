import type { APIRoute } from 'astro';
import { connectDB } from '../../../db/connection';
import { Candidate } from '../../../db/models/Candidate';
import { Interview } from '../../../db/models/Interview';
import { Job } from '../../../db/models/Job';
import { Types } from 'mongoose';
import { findStage, isValidStageTransition } from '../../../lib/pipeline';
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
  await Candidate.findByIdAndDelete(id);
  return json({ ok: true });
};
