import type { APIRoute } from 'astro';
import { connectDB } from '../../../db/connection';
import { Candidate } from '../../../db/models/Candidate';
import { Interview } from '../../../db/models/Interview';
import { Types } from 'mongoose';

const json = (data: unknown, status = 200) =>
  new Response(JSON.stringify(data), { status, headers: { 'Content-Type': 'application/json' } });

export const GET: APIRoute = async ({ params }) => {
  await connectDB();
  const { id } = params;
  if (!Types.ObjectId.isValid(id!)) return json({ error: 'Invalid ID' }, 400);
  const c = await Candidate.findById(id).populate('jobId', 'title department location requiredSkills').lean();
  if (!c) return json({ error: 'Not found' }, 404);
  return json({ ...c, _id: c._id.toString(), jobId: (c.jobId as any)?._id?.toString() });
};

export const PUT: APIRoute = async ({ params, request }) => {
  await connectDB();
  const { id } = params;
  if (!Types.ObjectId.isValid(id!)) return json({ error: 'Invalid ID' }, 400);
  try {
    const body = await request.json();
    const c = await Candidate.findByIdAndUpdate(id, body, { new: true, runValidators: true }).lean();
    if (!c) return json({ error: 'Not found' }, 404);
    return json({ ...c, _id: c._id.toString() });
  } catch (err: any) {
    return json({ error: err.message }, 400);
  }
};

export const DELETE: APIRoute = async ({ params }) => {
  await connectDB();
  const { id } = params;
  if (!Types.ObjectId.isValid(id!)) return json({ error: 'Invalid ID' }, 400);
  await Interview.deleteMany({ candidateId: id });
  await Candidate.findByIdAndDelete(id);
  return json({ ok: true });
};
