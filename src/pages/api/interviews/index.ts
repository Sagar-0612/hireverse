import type { APIRoute } from 'astro';
import { connectDB } from '../../../db/connection';
import { Interview } from '../../../db/models/Interview';

const json = (data: unknown, status = 200) =>
  new Response(JSON.stringify(data), { status, headers: { 'Content-Type': 'application/json' } });

function serialize(iv: any) {
  return {
    ...iv,
    _id: iv._id.toString(),
    candidateId: iv.candidateId?._id?.toString?.() || iv.candidateId?.toString(),
    jobId: iv.jobId?._id?.toString?.() || iv.jobId?.toString(),
    candidateName: iv.candidateId?.name || '',
    jobTitle: iv.jobId?.title || '',
  };
}

export const GET: APIRoute = async ({ url }) => {
  await connectDB();
  const status = url.searchParams.get('status');
  const jobId = url.searchParams.get('jobId');
  const candidateId = url.searchParams.get('candidateId');
  const filter: Record<string, unknown> = {};
  if (status) filter.status = status;
  if (jobId) filter.jobId = jobId;
  if (candidateId) filter.candidateId = candidateId;

  const interviews = await Interview.find(filter)
    .populate('candidateId', 'name')
    .populate('jobId', 'title')
    .sort({ date: 1 })
    .lean();

  return json(interviews.map(serialize));
};

export const POST: APIRoute = async ({ request }) => {
  await connectDB();
  try {
    const body = await request.json();
    const { candidateId, round, date, time, duration, format, interviewer, notes } = body;

    if (!candidateId || !round || !date || !time || !interviewer) {
      return json({ error: 'candidateId, round, date, time, and interviewer are required.' }, 400);
    }

    const { Candidate } = await import('../../../db/models/Candidate');
    const candidate = await Candidate.findById(candidateId).lean();
    if (!candidate) return json({ error: 'Candidate not found.' }, 404);

    const iv = await Interview.create({
      candidateId,
      jobId: candidate.jobId,
      round,
      date,
      time,
      duration: Number(duration) || 60,
      format: format || 'Video Call',
      interviewer,
      notes: notes || '',
      status: 'scheduled',
    });

    // Advance candidate to interview stage if not already further
    const stageOrder = ['applied','screening','shortlisted','interview','offered','hired'];
    const curIdx = stageOrder.indexOf(candidate.status);
    if (curIdx < stageOrder.indexOf('interview')) {
      await Candidate.findByIdAndUpdate(candidateId, { status: 'interview' });
    }

    const populated = await Interview.findById(iv._id)
      .populate('candidateId', 'name')
      .populate('jobId', 'title')
      .lean();
    return json({ ...serialize(populated), id: iv._id.toString() }, 201);
  } catch (err: any) {
    return json({ error: err.message }, 400);
  }
};
