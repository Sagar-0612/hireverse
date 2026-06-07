import type { APIRoute } from 'astro';
import { connectDB } from '../../../db/connection';
import { Interview } from '../../../db/models/Interview';
import { Candidate } from '../../../db/models/Candidate';
import { Job } from '../../../db/models/Job';
import { findStage, isValidStageTransition } from '../../../lib/pipeline';
import { logActivity } from '../../../lib/activity';

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
    const { candidateId, round, date, time, duration, format, interviewer, notes, pipelineStage } = body;

    if (!candidateId || !round || !date || !time || !interviewer) {
      return json({ error: 'candidateId, round, date, time, and interviewer are required.' }, 400);
    }

    const candidate = await Candidate.findById(candidateId);
    if (!candidate) return json({ error: 'Candidate not found.' }, 404);

    const job = await Job.findById(candidate.jobId).lean();
    if (!job) return json({ error: 'Parent job not found.' }, 404);

    // The round links to a pipeline stage — default to wherever the candidate
    // currently sits if the scheduler didn't pick one explicitly.
    const requestedStage = pipelineStage ? findStage(job.pipeline, pipelineStage) : null;
    const currentStage = findStage(job.pipeline, candidate.currentStage);
    const linkedStage = requestedStage || currentStage;

    const iv = await Interview.create({
      candidateId,
      jobId: candidate.jobId,
      pipelineStage: linkedStage?.key || candidate.currentStage,
      round,
      date,
      time,
      duration: Number(duration) || 60,
      format: format || 'Video Call',
      interviewer,
      notes: notes || '',
      status: 'scheduled',
    });

    // Scheduling a round for a stage ahead of the candidate's current position
    // auto-advances them there — replaces the old hardcoded stageOrder lookup.
    if (
      linkedStage &&
      linkedStage.key !== candidate.currentStage &&
      isValidStageTransition(job.pipeline, candidate.currentStage, linkedStage.key)
    ) {
      const fromStage = currentStage;
      candidate.stageHistory.push({
        stageKey: linkedStage.key,
        stageLabel: linkedStage.label,
        fromStageKey: fromStage?.key || '',
        fromStageLabel: fromStage?.label || '',
        movedBy: 'Maya Kim',
        movedAt: new Date(),
        notes: `Auto-advanced when "${round}" was scheduled`,
      } as any);
      candidate.currentStage = linkedStage.key;
      await candidate.save();

      await logActivity({
        type: 'stage',
        action: 'stage_changed',
        message: `${candidate.name} moved from "${fromStage?.label || 'the start'}" to "${linkedStage.label}" (auto-advanced by scheduling "${round}")`,
        entityType: 'candidate',
        entityId: candidate._id.toString(),
        jobId: candidate.jobId.toString(),
        candidateId: candidate._id.toString(),
      });
    }

    await logActivity({
      type: 'interview',
      action: 'interview_scheduled',
      message: `"${round}" interview scheduled for ${candidate.name} on ${date}`,
      entityType: 'interview',
      entityId: iv._id.toString(),
      jobId: candidate.jobId.toString(),
      candidateId: candidate._id.toString(),
    });

    const populated = await Interview.findById(iv._id)
      .populate('candidateId', 'name')
      .populate('jobId', 'title')
      .lean();
    return json({ ...serialize(populated), id: iv._id.toString() }, 201);
  } catch (err: any) {
    return json({ error: err.message }, 400);
  }
};
