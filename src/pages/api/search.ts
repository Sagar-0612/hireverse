import type { APIRoute } from 'astro';
import { connectDB } from '../../db/connection';
import { Job } from '../../db/models/Job';
import { Candidate } from '../../db/models/Candidate';

const json = (data: unknown, status = 200) =>
  new Response(JSON.stringify(data), { status, headers: { 'Content-Type': 'application/json' } });

const escapeRegex = (s: string) => s.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');

export const GET: APIRoute = async ({ url }) => {
  await connectDB();
  const q = (url.searchParams.get('q') || '').trim();
  if (q.length < 2) return json({ jobs: [], candidates: [] });

  const re = new RegExp(escapeRegex(q), 'i');

  const [jobs, candidates] = await Promise.all([
    Job.find({ $or: [{ title: re }, { department: re }, { location: re }] })
      .select('title department location status')
      .sort({ createdAt: -1 })
      .limit(6)
      .lean(),
    Candidate.find({ $or: [{ name: re }, { email: re }, { location: re }] })
      .select('name email location currentStage jobId')
      .sort({ createdAt: -1 })
      .limit(6)
      .lean(),
  ]);

  return json({
    jobs: jobs.map(j => ({ _id: j._id.toString(), title: j.title, department: j.department, location: j.location, status: j.status })),
    candidates: candidates.map(c => ({ _id: c._id.toString(), name: c.name, email: c.email, location: c.location, currentStage: c.currentStage })),
  });
};
