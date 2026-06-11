import type { APIRoute } from 'astro';
import { connectDB } from '../../../db/connection';
import { Interview } from '../../../db/models/Interview';
import { Candidate } from '../../../db/models/Candidate';
import { Job } from '../../../db/models/Job';
import { Team } from '../../../db/models/Team';
import { findStage, isValidStageTransition, sortedPipeline } from '../../../lib/pipeline';
import { logActivity } from '../../../lib/activity';
import { isWithinGap, MIN_GAP_MINUTES } from '../../../lib/scheduling';
import { sendEmail, sendWhatsApp } from '../../../lib/notifications';

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

    const newWindow = { time, duration: Number(duration) || 60 };

    // Same-day double-booking guard: neither the candidate nor the interviewer
    // can sensibly be in two sessions back-to-back, so both get checked against
    // every other still-active session that day with at least a 1-hour buffer.
    const sameDay = await Interview.find({
      date,
      status: { $ne: 'cancelled' },
      $or: [{ candidateId: candidate._id }, { interviewer }],
    }).lean();

    const candidateConflict = sameDay.find(
      iv => iv.candidateId.toString() === candidate._id.toString() && isWithinGap(iv, newWindow)
    );
    if (candidateConflict) {
      return json({
        error: `${candidate.name} already has "${candidateConflict.round}" scheduled on ${date} at ${candidateConflict.time} — leave at least a ${MIN_GAP_MINUTES}-minute gap between sessions for the same candidate.`,
      }, 409);
    }

    const interviewerConflict = sameDay.find(
      iv => iv.interviewer === interviewer && isWithinGap(iv, newWindow)
    );
    if (interviewerConflict) {
      return json({
        error: `${interviewer} already has "${interviewerConflict.round}" scheduled on ${date} at ${interviewerConflict.time} — leave at least a ${MIN_GAP_MINUTES}-minute gap between their sessions.`,
      }, 409);
    }

    // The round links to a pipeline stage — default to wherever the candidate
    // currently sits if the scheduler didn't pick one explicitly.
    const requestedStage = pipelineStage ? findStage(job.pipeline, pipelineStage) : null;
    const currentStage = findStage(job.pipeline, candidate.currentStage);
    const linkedStage = requestedStage || currentStage;

    // A candidate cannot be interviewed twice for the same pipeline stage —
    // once a round for this stage is scheduled or completed, scheduling
    // another one for the same stage is a data-integrity error, not a
    // legitimate "round 2" (a genuinely new round belongs to the *next*
    // pipeline stage instead).
    const stageKeyToCheck = linkedStage?.key || candidate.currentStage;
    const existingForStage = await Interview.findOne({
      candidateId: candidate._id,
      pipelineStage: stageKeyToCheck,
      status: { $in: ['scheduled', 'completed'] },
    }).lean();
    if (existingForStage) {
      const stageLabel = linkedStage?.label || stageKeyToCheck;
      const error = existingForStage.status === 'completed'
        ? `${candidate.name} has already completed "${existingForStage.round}" (${stageLabel}) on ${existingForStage.date}. A candidate cannot be interviewed twice for the same pipeline stage.`
        : `${candidate.name} already has "${existingForStage.round}" (${stageLabel}) scheduled for ${existingForStage.date}. Cancel or reschedule that one instead of creating a new one.`;
      return json({ error }, 409);
    }

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
    // auto-advances them there. Booking that round is itself the signal that
    // every stage in between has effectively been cleared (you don't schedule
    // an "Interview" round for someone who hasn't been screened/shortlisted),
    // so each intermediate stage gets its own real stageHistory entry — a
    // clean, ordered progression on the journey rather than a "skipped" jump.
    if (
      linkedStage &&
      linkedStage.key !== candidate.currentStage &&
      isValidStageTransition(job.pipeline, candidate.currentStage, linkedStage.key)
    ) {
      const fromStage = currentStage;
      const fromOrder = fromStage ? fromStage.order : -1;
      const passedStages = sortedPipeline(job.pipeline).filter(s => s.order > fromOrder && s.order <= linkedStage.order);
      const baseTime = Date.now();
      let prevStage = fromStage;
      passedStages.forEach((stage, i) => {
        const isTarget = stage.key === linkedStage.key;
        candidate.stageHistory.push({
          stageKey: stage.key,
          stageLabel: stage.label,
          fromStageKey: prevStage?.key || '',
          fromStageLabel: prevStage?.label || '',
          movedBy: 'Maya Kim',
          movedAt: new Date(baseTime + i),
          notes: isTarget
            ? `Auto-advanced when "${round}" was scheduled`
            : `Auto-advanced on the way to "${linkedStage.label}" when "${round}" was scheduled`,
        } as any);
        prevStage = stage;
      });
      candidate.currentStage = linkedStage.key;
      await candidate.save();

      const passedLabels = passedStages.slice(0, -1).map(s => s.label);
      await logActivity({
        type: 'stage',
        action: 'stage_changed',
        message: `${candidate.name} moved from "${fromStage?.label || 'the start'}" to "${linkedStage.label}"${passedLabels.length ? ` (passing through ${passedLabels.join(', ')})` : ''} — auto-advanced by scheduling "${round}"`,
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

    // Notify the candidate (email + WhatsApp) and the interviewer (email).
    // Non-blocking: scheduling has already succeeded, so a notification
    // failure or missing config must never surface as an API error.
    try {
      const details = `Round: ${round}\nJob: ${job.title}\nDate: ${date}\nTime: ${iv.time}\nDuration: ${iv.duration} min\nFormat: ${iv.format}\nInterviewer: ${interviewer}`;
      const sentTo: string[] = [];

      const candidateEmailResult = await sendEmail({
        to: candidate.email,
        subject: `Interview scheduled: ${round} for ${job.title}`,
        text: `Hi ${candidate.name},\n\nYour "${round}" interview for ${job.title} has been scheduled.\n\n${details}\n\nGood luck!`,
      });
      if (candidateEmailResult.sent) sentTo.push('candidate email');

      const candidateWhatsAppResult = await sendWhatsApp({
        to: candidate.phone,
        message: `Hi ${candidate.name}, your "${round}" interview for ${job.title} is scheduled for ${date} at ${iv.time} (${iv.duration} min, ${iv.format}). Interviewer: ${interviewer}.`,
      });
      if (candidateWhatsAppResult.sent) sentTo.push('candidate WhatsApp');

      const interviewerTeamMember = await Team.findOne({ name: interviewer }).lean();
      const interviewerEmailResult = await sendEmail({
        to: interviewerTeamMember?.email || '',
        subject: `You're interviewing ${candidate.name}: ${round}`,
        text: `Hi ${interviewer},\n\nYou've been scheduled to conduct an interview.\n\nCandidate: ${candidate.name}\n${details}`,
      });
      if (interviewerEmailResult.sent) sentTo.push('interviewer email');

      await logActivity({
        type: 'interview',
        action: 'interview_notifications_sent',
        message: sentTo.length
          ? `Notifications sent for "${round}" (${candidate.name}): ${sentTo.join(', ')}`
          : `No notifications could be sent for "${round}" (${candidate.name}) — missing contact info or notification config`,
        entityType: 'interview',
        entityId: iv._id.toString(),
        jobId: candidate.jobId.toString(),
        candidateId: candidate._id.toString(),
      });
    } catch (notifyErr: any) {
      console.error('[notifications:error]', notifyErr.message);
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
