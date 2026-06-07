import type { APIRoute } from 'astro';
import { connectDB } from '../../../db/connection';
import { Candidate } from '../../../db/models/Candidate';
import { Job } from '../../../db/models/Job';

const json = (data: unknown, status = 200) =>
  new Response(JSON.stringify(data), { status, headers: { 'Content-Type': 'application/json' } });

export const GET: APIRoute = async ({ url }) => {
  await connectDB();
  const jobId = url.searchParams.get('jobId');
  const currentStage = url.searchParams.get('currentStage');
  const filter: Record<string, unknown> = {};
  if (jobId) filter.jobId = jobId;
  if (currentStage) filter.currentStage = currentStage;

  const candidates = await Candidate.find(filter)
    .populate('jobId', 'title department')
    .sort({ score: -1 })
    .lean();

  return json(candidates.map(c => ({
    ...c,
    _id: c._id.toString(),
    jobId: c.jobId ? (c.jobId as any)._id?.toString?.() || c.jobId.toString() : null,
    jobTitle: (c.jobId as any)?.title || '',
  })));
};

export const POST: APIRoute = async ({ request }) => {
  await connectDB();
  try {
    const body = await request.json();
    if (!body.currentStage && body.jobId) {
      const job = await Job.findById(body.jobId).lean();
      if (job?.pipeline?.length) {
        const first = [...job.pipeline].sort((a, b) => a.order - b.order)[0];
        body.currentStage = first.key;
      }
    }
    const candidate = await Candidate.create(body);
    return json({ ...candidate.toObject(), _id: candidate._id.toString() }, 201);
  } catch (err: any) {
    return json({ error: err.message }, 400);
  }
};
