import type { APIRoute } from 'astro';
import { connectDB } from '../../db/connection';
import { ActivityLog } from '../../db/models/ActivityLog';

const json = (data: unknown, status = 200) =>
  new Response(JSON.stringify(data), { status, headers: { 'Content-Type': 'application/json' } });

export const DELETE: APIRoute = async () => {
  await connectDB();
  await ActivityLog.deleteMany({});
  return json({ ok: true });
};
