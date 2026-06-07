import type { APIRoute } from 'astro';
import { connectDB } from '../../../db/connection';
import { Team } from '../../../db/models/Team';

const json = (data: unknown, status = 200) =>
  new Response(JSON.stringify(data), { status, headers: { 'Content-Type': 'application/json' } });

export const GET: APIRoute = async () => {
  await connectDB();
  const members = await Team.find().sort({ createdAt: 1 }).lean();
  return json(members.map(m => ({ ...m, _id: m._id.toString() })));
};

export const POST: APIRoute = async ({ request }) => {
  await connectDB();
  try {
    const body = await request.json();
    const member = await Team.create(body);
    return json({ ...member.toObject(), _id: member._id.toString() }, 201);
  } catch (err: any) {
    return json({ error: err.message }, 400);
  }
};
