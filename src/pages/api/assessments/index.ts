import type { APIRoute } from 'astro';
import { connectDB } from '../../../db/connection';
import { Assessment } from '../../../db/models/Assessment';
import { Candidate } from '../../../db/models/Candidate';
import { Job } from '../../../db/models/Job';
import { findStage, isValidStageTransition, sortedPipeline } from '../../../lib/pipeline';
import { inferAssessmentType } from '../../../lib/assessmentAnalysis';
import { generateAssessmentQuestions } from '../../../lib/codingChallenges';
import { logActivity } from '../../../lib/activity';
import { sendEmail, sendWhatsApp } from '../../../lib/notifications';

const json = (data: unknown, status = 200) =>
  new Response(JSON.stringify(data), { status, headers: { 'Content-Type': 'application/json' } });

export const POST: APIRoute = async ({ request }) => {
  await connectDB();
  try {
    const body = await request.json();
    const { candidateId, pipelineStage, instructions, dueDate, dueTime } = body;

    if (!candidateId || !pipelineStage) {
      return json({ error: 'candidateId and pipelineStage are required.' }, 400);
    }

    const candidate = await Candidate.findById(candidateId);
    if (!candidate) return json({ error: 'Candidate not found.' }, 404);

    const job = await Job.findById(candidate.jobId).lean();
    if (!job) return json({ error: 'Parent job not found.' }, 404);

    const requestedStage = findStage(job.pipeline, pipelineStage);
    if (!requestedStage) return json({ error: 'Pipeline stage not found on this job.' }, 400);

    // A candidate cannot be assessed twice for the same pipeline stage —
    // any existing assessment for this stage (pending, submitted, or already
    // evaluated) means a new one would be a duplicate, not a fresh attempt.
    const existingForStage = await Assessment.findOne({
      candidateId: candidate._id,
      pipelineStage: requestedStage.key,
    }).lean();
    if (existingForStage) {
      return json({
        error: `${candidate.name} already has a "${existingForStage.round}" assessment (${existingForStage.status}) for this pipeline stage. A candidate cannot be assessed twice for the same stage.`,
      }, 409);
    }

    const type = inferAssessmentType(requestedStage.key, requestedStage.label);

    const suggestedQuestions = generateAssessmentQuestions({
      type,
      jobTitle: job.title,
      jobLevel: job.level || 'Mid Level',
      experience: candidate.experience || 0,
      requiredSkills: job.requiredSkills || [],
      niceToHaveSkills: job.niceToHaveSkills || [],
      practicalSkills: candidate.practicalSkills || [],
      matchedSkills: candidate.skills || [],
    });

    const assessment = await Assessment.create({
      candidateId,
      jobId: candidate.jobId,
      pipelineStage: requestedStage.key,
      round: requestedStage.label,
      type,
      status: 'pending',
      instructions: instructions || '',
      suggestedQuestions,
      dueDate: dueDate || '',
      dueTime: dueTime || '',
    });

    // Auto-advance the candidate to the selected stage (same logic as interview scheduling).
    const currentStage = findStage(job.pipeline, candidate.currentStage);
    if (
      requestedStage.key !== candidate.currentStage &&
      isValidStageTransition(job.pipeline, candidate.currentStage, requestedStage.key)
    ) {
      const fromOrder = currentStage ? currentStage.order : -1;
      const passedStages = sortedPipeline(job.pipeline).filter(s => s.order > fromOrder && s.order <= requestedStage.order);
      const baseTime = Date.now();
      let prevStage = currentStage;
      passedStages.forEach((stage, i) => {
        const isTarget = stage.key === requestedStage.key;
        candidate.stageHistory.push({
          stageKey: stage.key,
          stageLabel: stage.label,
          fromStageKey: prevStage?.key || '',
          fromStageLabel: prevStage?.label || '',
          movedBy: 'System',
          movedAt: new Date(baseTime + i),
          notes: isTarget
            ? `Auto-advanced when "${requestedStage.label}" assessment was created`
            : `Auto-advanced on the way to "${requestedStage.label}"`,
        } as any);
        prevStage = stage;
      });
      candidate.currentStage = requestedStage.key;
      await candidate.save();

      await logActivity({
        type: 'stage',
        action: 'stage_changed',
        message: `${candidate.name} advanced to "${requestedStage.label}" — auto-moved when assessment was created`,
        entityType: 'candidate',
        entityId: candidate._id.toString(),
        jobId: candidate.jobId.toString(),
        candidateId: candidate._id.toString(),
      });
    }

    await logActivity({
      type: 'interview',
      action: 'interview_scheduled',
      message: `"${requestedStage.label}" assessment created for ${candidate.name}`,
      entityType: 'assessment',
      entityId: assessment._id.toString(),
      jobId: candidate.jobId.toString(),
      candidateId: candidate._id.toString(),
    });

    // Notify the candidate (email + WhatsApp) that a new assessment is ready.
    // Non-blocking — assessment creation has already succeeded.
    try {
      const sentTo: string[] = [];
      const details = `Assessment: ${requestedStage.label}\nJob: ${job.title}` + (instructions ? `\n\nInstructions:\n${instructions}` : '');

      const emailResult = await sendEmail({
        to: candidate.email,
        subject: `New assessment: ${requestedStage.label} for ${job.title}`,
        text: `Hi ${candidate.name},\n\nA new assessment has been created for you.\n\n${details}\n\nGood luck!`,
      });
      if (emailResult.sent) sentTo.push('candidate email');

      const whatsAppResult = await sendWhatsApp({
        to: candidate.phone,
        message: `Hi ${candidate.name}, a new assessment ("${requestedStage.label}") has been created for your application to ${job.title}. Check your email/HireVerse for details.`,
      });
      if (whatsAppResult.sent) sentTo.push('candidate WhatsApp');

      await logActivity({
        type: 'interview',
        action: 'interview_notifications_sent',
        message: sentTo.length
          ? `Notifications sent for "${requestedStage.label}" assessment (${candidate.name}): ${sentTo.join(', ')}`
          : `No notifications could be sent for "${requestedStage.label}" assessment (${candidate.name}) — missing contact info or notification config`,
        entityType: 'assessment',
        entityId: assessment._id.toString(),
        jobId: candidate.jobId.toString(),
        candidateId: candidate._id.toString(),
      });
    } catch (notifyErr: any) {
      console.error('[notifications:error]', notifyErr.message);
    }

    return json({ id: assessment._id.toString() }, 201);
  } catch (err: any) {
    return json({ error: err.message }, 400);
  }
};
