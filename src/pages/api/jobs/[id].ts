import type { APIRoute } from 'astro';
import { connectDB } from '../../../db/connection';
import { Job } from '../../../db/models/Job';
import { Candidate } from '../../../db/models/Candidate';
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
    const job = await Job.findByIdAndUpdate(id, body, { new: true, runValidators: true }).lean();
    if (!job) return json({ error: 'Not found' }, 404);
    return json({ ...job, _id: job._id.toString() });
  } catch (err: any) {
    return json({ error: err.message }, 400);
  }
};

export const DELETE: APIRoute = async ({ params }) => {
  await connectDB();
  const { id } = params;
  if (!Types.ObjectId.isValid(id!)) return json({ error: 'Invalid ID' }, 400);
  await Job.findByIdAndDelete(id);
  // cascade-delete candidates and their interviews
  const cands = await Candidate.find({ jobId: id }, '_id');
  const candIds = cands.map(c => c._id);
  if (candIds.length) {
    const { Interview } = await import('../../../db/models/Interview');
    await Interview.deleteMany({ candidateId: { $in: candIds } });
  }
  await Candidate.deleteMany({ jobId: id });
  return json({ ok: true });
};
