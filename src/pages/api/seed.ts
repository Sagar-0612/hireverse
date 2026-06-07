import type { APIRoute } from 'astro';
import { connectDB } from '../../db/connection';
import { Job } from '../../db/models/Job';
import { Candidate } from '../../db/models/Candidate';
import { Interview } from '../../db/models/Interview';
import { Team } from '../../db/models/Team';
import { seedDatabase } from '../../db/seed';

const json = (data: unknown, status = 200) =>
  new Response(JSON.stringify(data), { status, headers: { 'Content-Type': 'application/json' } });

export const POST: APIRoute = async () => {
  await connectDB();
  // Drop existing data
  await Promise.all([
    Job.deleteMany({}),
    Candidate.deleteMany({}),
    Interview.deleteMany({}),
    Team.deleteMany({}),
  ]);
  await seedDatabase();
  return json({ ok: true, message: 'Database seeded successfully' });
};

export const GET: APIRoute = async () => {
  await connectDB();
  const [jobs, candidates, interviews, team] = await Promise.all([
    Job.countDocuments(),
    Candidate.countDocuments(),
    Interview.countDocuments(),
    Team.countDocuments(),
  ]);
  return json({ jobs, candidates, interviews, team });
};
