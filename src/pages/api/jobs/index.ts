import type { APIRoute } from 'astro';
import { connectDB } from '../../../db/connection';
import { Job } from '../../../db/models/Job';
import { buildDefaultPipeline } from '../../../lib/pipeline';
import { logActivity } from '../../../lib/activity';

const json = (data: unknown, status = 200) =>
  new Response(JSON.stringify(data), { status, headers: { 'Content-Type': 'application/json' } });

export const GET: APIRoute = async ({ url }) => {
  await connectDB();
  const status = url.searchParams.get('status');
  const filter = status ? { status } : {};
  const jobs = await Job.find(filter).sort({ createdAt: -1 }).lean();
  return json(jobs.map(j => ({ ...j, _id: j._id.toString() })));
};

export const POST: APIRoute = async ({ request }) => {
  await connectDB();
  try {
    const body = await request.json();
    const job = await Job.create({
      ...body,
      requiredSkills: body.requiredSkills
        ? body.requiredSkills.split(',').map((s: string) => s.trim()).filter(Boolean)
        : [],
      niceToHaveSkills: body.niceToHaveSkills
        ? body.niceToHaveSkills.split(',').map((s: string) => s.trim()).filter(Boolean)
        : [],
      pipeline: buildDefaultPipeline(),
    });

    await logActivity({
      type: 'job',
      action: 'job_created',
      message: `Job "${job.title}" was created`,
      entityType: 'job',
      entityId: job._id.toString(),
      jobId: job._id.toString(),
    });

    return json({ ...job.toObject(), _id: job._id.toString() }, 201);
  } catch (err: any) {
    return json({ error: err.message }, 400);
  }
};
