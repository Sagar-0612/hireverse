import type { APIRoute } from 'astro';
import { connectDB } from '../../../db/connection';
import { Job } from '../../../db/models/Job';
import { Candidate } from '../../../db/models/Candidate';
import { Interview } from '../../../db/models/Interview';
import { logActivity } from '../../../lib/activity';
import { Types } from 'mongoose';

const json = (data: unknown, status = 200) =>
  new Response(JSON.stringify(data), { status, headers: { 'Content-Type': 'application/json' } });

export const GET: APIRoute = async ({ params }) => {
  await connectDB();
  const { id } = params;
  if (!Types.ObjectId.isValid(id!)) return json({ error: 'Invalid ID' }, 400);
  const job = await Job.findById(id).lean();
  if (!job) return json({ error: 'Not found' }, 404);
  return json({ ...job, _id: job._id.toString() });
};

export const PUT: APIRoute = async ({ params, request }) => {
  await connectDB();
  const { id } = params;
  if (!Types.ObjectId.isValid(id!)) return json({ error: 'Invalid ID' }, 400);
  try {
    const body = await request.json();
    if (body.requiredSkills && typeof body.requiredSkills === 'string') {
      body.requiredSkills = body.requiredSkills.split(',').map((s: string) => s.trim()).filter(Boolean);
    }
    if (body.niceToHaveSkills && typeof body.niceToHaveSkills === 'string') {
      body.niceToHaveSkills = body.niceToHaveSkills.split(',').map((s: string) => s.trim()).filter(Boolean);
    }

    const existing = await Job.findById(id);
    if (!existing) return json({ error: 'Not found' }, 404);

    let pipelineChanged = false;
    if (body.pipeline) {
      const pipeline = body.pipeline;
      if (!Array.isArray(pipeline) || pipeline.length === 0) {
        return json({ error: 'A pipeline needs at least one stage' }, 400);
      }
      const keys = pipeline.map((s: any) => String(s.key || '').trim());
      if (keys.some((k: string) => !k) || new Set(keys).size !== keys.length) {
        return json({ error: 'Each pipeline stage needs a unique key' }, 400);
      }

      const oldKeys = (existing.pipeline || []).map(s => s.key);
      const removedKeys = oldKeys.filter(k => !keys.includes(k));
      if (removedKeys.length) {
        const count = await Candidate.countDocuments({ jobId: id, currentStage: { $in: removedKeys } });
        if (count > 0) {
          return json({
            error: `${count} candidate${count === 1 ? '' : 's'} currently sit in a stage you're removing. Move them to another stage first.`,
            count,
          }, 409);
        }
      }

      body.pipeline = pipeline.map((s: any, i: number) => ({
        key: String(s.key).trim(),
        label: String(s.label || s.key).trim(),
        color: s.color || '#6b7280',
        icon: s.icon || 'circle',
        order: i,
      }));
      pipelineChanged = true;
    }

    const job = await Job.findByIdAndUpdate(id, body, { new: true, runValidators: true }).lean();
    if (!job) return json({ error: 'Not found' }, 404);

    await logActivity({
      type: pipelineChanged ? 'stage' : 'job',
      action: pipelineChanged ? 'pipeline_updated' : 'job_updated',
      message: pipelineChanged
        ? `Hiring pipeline for "${job.title}" was updated (${job.pipeline.length} stages)`
        : `Job "${job.title}" was updated`,
      entityType: 'job',
      entityId: job._id.toString(),
      jobId: job._id.toString(),
    });

    return json({ ...job, _id: job._id.toString() });
  } catch (err: any) {
    return json({ error: err.message }, 400);
  }
};

export const DELETE: APIRoute = async ({ params }) => {
  await connectDB();
  const { id } = params;
  if (!Types.ObjectId.isValid(id!)) return json({ error: 'Invalid ID' }, 400);

  const job = await Job.findById(id).lean();
  if (!job) return json({ error: 'Not found' }, 404);

  const cands = await Candidate.find({ jobId: id }, '_id');
  const candIds = cands.map(c => c._id);

  // Log before deleting — the message is a frozen, denormalized string so it
  // remains readable in the activity feed even after the job is gone.
  await logActivity({
    type: 'job',
    action: 'job_deleted',
    message: `Job "${job.title}" was deleted (${candIds.length} candidate${candIds.length === 1 ? '' : 's'} removed)`,
    entityType: 'job',
    entityId: id!,
  });

  if (candIds.length) {
    await Interview.deleteMany({ candidateId: { $in: candIds } });
  }
  await Candidate.deleteMany({ jobId: id });
  await Job.findByIdAndDelete(id);

  return json({ ok: true });
};
