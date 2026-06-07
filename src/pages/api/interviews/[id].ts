import type { APIRoute } from 'astro';
import { connectDB } from '../../../db/connection';
import { Interview } from '../../../db/models/Interview';
import { Types } from 'mongoose';

const json = (data: unknown, status = 200) =>
  new Response(JSON.stringify(data), { status, headers: { 'Content-Type': 'application/json' } });

export const PUT: APIRoute = async ({ params, request }) => {
  await connectDB();
  const { id } = params;
  if (!Types.ObjectId.isValid(id!)) return json({ error: 'Invalid ID' }, 400);
  try {
    const body = await request.json();
    const iv = await Interview.findByIdAndUpdate(id, body, { new: true, runValidators: true })
      .populate('candidateId', 'name')
      .populate('jobId', 'title')
      .lean();
    if (!iv) return json({ error: 'Not found' }, 404);
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
