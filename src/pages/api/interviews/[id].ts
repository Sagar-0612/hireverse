import type { APIRoute } from 'astro';
import { connectDB } from '../../../db/connection';
import { Interview } from '../../../db/models/Interview';
import { Types } from 'mongoose';
import { logActivity } from '../../../lib/activity';

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

    const iv = await Interview.findByIdAndUpdate(id, body, { new: true, runValidators: true })
      .populate('candidateId', 'name')
      .populate('jobId', 'title')
      .lean();
    if (!iv) return json({ error: 'Not found' }, 404);

    if (body.status && body.status !== before.status) {
      await logActivity({
        type: 'interview',
        action: 'interview_status_changed',
        message: `"${iv.round}" interview for ${(iv.candidateId as any)?.name || 'a candidate'} marked ${body.status}`,
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
