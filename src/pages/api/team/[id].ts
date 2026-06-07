import type { APIRoute } from 'astro';
import { connectDB } from '../../../db/connection';
import { Team } from '../../../db/models/Team';
import { Types } from 'mongoose';

const json = (data: unknown, status = 200) =>
  new Response(JSON.stringify(data), { status, headers: { 'Content-Type': 'application/json' } });

export const PUT: APIRoute = async ({ params, request }) => {
  await connectDB();
  const { id } = params;
  if (!Types.ObjectId.isValid(id!)) return json({ error: 'Invalid ID' }, 400);
  const body = await request.json();
  const member = await Team.findByIdAndUpdate(id, body, { new: true }).lean();
  if (!member) return json({ error: 'Not found' }, 404);
  return json({ ...member, _id: member._id.toString() });
};

export const DELETE: APIRoute = async ({ params }) => {
  await connectDB();
  const { id } = params;
  if (!Types.ObjectId.isValid(id!)) return json({ error: 'Invalid ID' }, 400);
  await Team.findByIdAndDelete(id);
  return json({ ok: true });
};
