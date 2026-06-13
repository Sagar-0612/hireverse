import type { APIRoute } from 'astro';
import { connectDB } from '../../../db/connection';
import { Interview } from '../../../db/models/Interview';
import { Candidate } from '../../../db/models/Candidate';
import { Job } from '../../../db/models/Job';
import { Types } from 'mongoose';
import { logActivity } from '../../../lib/activity';
import { analyzeInterview } from '../../../lib/interviewAnalysis';
import { isWithinGap, MIN_GAP_MINUTES } from '../../../lib/scheduling';
import { recomputeFromSkillGaps } from '../../../lib/resumeAnalysis';
import { scanFeedbackForSkillEvidence, getLearnedAliases, recordSkillCorrection } from '../../../lib/learningEngine';

const json = (data: unknown, status = 200) =>
  new Response(JSON.stringify(data), { status, headers: { 'Content-Type': 'application/json' } });

export const PUT: APIRoute = async ({ params, request }) => {
  await connectDB();
  const { id } = params;
  if (!Types.ObjectId.isValid(id!)) return json({ error: 'Invalid ID' }, 400);
  try {
    const body = await request.json();
    const before = await Interview.findById(id).lean();
    if (!before) return json({ error: 'Not found' }, 404);

    // Normally this fires only on the scheduled→completed transition. It also
    // fires for interviews that are *already* marked completed but carry no
    // `analysis` — legacy records from before this analysis system existed —
    // so a recruiter can retroactively add real feedback and get a genuine,
    // text-grounded verdict instead of being stuck with placeholder scores.
    const completingNow = body.status === 'completed' && (before.status !== 'completed' || !before.analysis);

    // Reschedule: a new date and/or time for a still-active interview. Re-run
    // the same double-booking guard used at creation time so a reschedule
    // can't silently collide with another session for this candidate or
    // interviewer.
    const reschedulingNow =
      (typeof body.date === 'string' && body.date !== before.date) ||
      (typeof body.time === 'string' && body.time !== before.time);

    if (reschedulingNow && before.status !== 'completed' && before.status !== 'cancelled') {
      const newDate = typeof body.date === 'string' ? body.date : before.date;
      const newTime = typeof body.time === 'string' ? body.time : before.time;
      const newWindow = { time: newTime, duration: before.duration };

      const sameDay = await Interview.find({
        _id: { $ne: before._id },
        date: newDate,
        status: { $ne: 'cancelled' },
        $or: [{ candidateId: before.candidateId }, { interviewer: before.interviewer }],
      }).lean();

      const candidateConflict = sameDay.find(
        iv => iv.candidateId.toString() === before.candidateId.toString() && isWithinGap(iv, newWindow)
      );
      if (candidateConflict) {
        return json({
          error: `This candidate already has "${candidateConflict.round}" scheduled on ${newDate} at ${candidateConflict.time} — leave at least a ${MIN_GAP_MINUTES}-minute gap between sessions.`,
        }, 409);
      }

      const interviewerConflict = sameDay.find(
        iv => iv.interviewer === before.interviewer && isWithinGap(iv, newWindow)
      );
      if (interviewerConflict) {
        return json({
          error: `${before.interviewer} already has "${interviewerConflict.round}" scheduled on ${newDate} at ${interviewerConflict.time} — leave at least a ${MIN_GAP_MINUTES}-minute gap between their sessions.`,
        }, 409);
      }
    }

    // Completion is judged from what the interviewer actually observed — the
    // analysis (and every score/recommendation derived from it) is computed
    // here, server-side, from real feedback text. Never trust client-supplied
    // scores for something this consequential.
    if (completingNow) {
      const feedback = typeof body.feedback === 'string' ? body.feedback.trim() : '';
      if (feedback.length < 15) {
        return json({ error: 'Add a bit more detail to your interview feedback (at least a sentence or two) so the analysis has something real to work with.' }, 400);
      }

      const candidate = await Candidate.findById(before.candidateId);
      const job = await Job.findById(before.jobId).lean();
      const transcript = typeof body.transcript === 'string' ? body.transcript.trim() : '';
      const result = analyzeInterview({
        candidateName: candidate?.name || 'The candidate',
        round: before.round,
        feedback,
        transcript,
        jobTitle: job?.title || '',
        jobLevel: job?.level || '',
      });

      body.feedback = feedback;
      body.transcript = transcript;
      body.commScore = result.commScore;
      body.techScore = result.techScore;
      body.confidenceScore = result.confidenceScore;
      body.recommendation = result.recommendation;
      body.transcriptSummary = result.transcriptSummary;
      body.analysis = {
        strengths: result.strengths,
        concerns: result.concerns,
        reasoning: result.reasoning,
        decision: result.decision,
        analyzedAt: new Date(),
      };

      // AUTOMATIC learning: scan the interviewer's own feedback/transcript for
      // real-world evidence of any skill the candidate's resume marked
      // "missing" — the automatic counterpart to the manual "Found evidence?"
      // correction form, so the platform learns even if no recruiter ever
      // opens that form. Never lowers a score; only upgrades 'missing' gaps.
      if (candidate && job && candidate.skillGaps?.length) {
        const learnedAliases = await getLearnedAliases();
        const { updatedGaps, applied } = scanFeedbackForSkillEvidence(
          candidate.skillGaps as any,
          `${feedback} ${transcript}`,
          learnedAliases
        );

        if (applied.length) {
          candidate.skillGaps = updatedGaps as any;
          const recomputed = recomputeFromSkillGaps(candidate.skillGaps as any, candidate.educationMatch, candidate.experience, {
            requiredSkills: job.requiredSkills,
            niceToHaveSkills: job.niceToHaveSkills,
            education: job.education,
            level: job.level,
          });
          const before2 = { score: candidate.score };
          candidate.skillsMatch = recomputed.skillsMatch;
          candidate.score = recomputed.score;
          candidate.recommendation = recomputed.recommendation;

          for (const evidence of applied) {
            const correction = await recordSkillCorrection({
              jobId: candidate.jobId.toString(),
              candidateId: candidate._id.toString(),
              skill: evidence.skill,
              evidencePhrase: evidence.evidencePhrase,
              fromStatus: 'missing',
              toStatus: 'related',
              actor: 'System (interview feedback)',
            });
            const gap = candidate.skillGaps.find((g: any) => g.skill === evidence.skill);
            if (gap) (gap as any).learnedOccurrences = correction.occurrences;
          }
          candidate.markModified('skillGaps');

          await candidate.save();

          await logActivity({
            type: 'candidate',
            action: 'skill_correction_recorded',
            message: `${candidate.name}'s "${applied.map(a => a.skill).join('", "')}" gap${applied.length > 1 ? 's' : ''} were automatically upgraded to "related" based on evidence in the "${before.round}" interview feedback — score ${before2.score} → ${candidate.score}.`,
            entityType: 'candidate',
            entityId: candidate._id.toString(),
            jobId: candidate.jobId.toString(),
            candidateId: candidate._id.toString(),
          });
        }
      }
    } else {
      // Analysis is authoritative once computed — block any attempt to
      // overwrite it through a generic update.
      delete body.commScore;
      delete body.techScore;
      delete body.confidenceScore;
      delete body.recommendation;
      delete body.transcriptSummary;
      delete body.analysis;
    }

    const iv = await Interview.findByIdAndUpdate(id, body, { new: true, runValidators: true })
      .populate('candidateId', 'name')
      .populate('jobId', 'title')
      .lean();
    if (!iv) return json({ error: 'Not found' }, 404);

    if (body.status && body.status !== before.status) {
      const verdictNote = completingNow ? ` — AI analysis recommends: ${(iv as any).recommendation}` : '';
      await logActivity({
        type: 'interview',
        action: 'interview_status_changed',
        message: `"${iv.round}" interview for ${(iv.candidateId as any)?.name || 'a candidate'} marked ${body.status}${verdictNote}`,
        entityType: 'interview',
        entityId: iv._id.toString(),
        jobId: (iv.jobId as any)?._id?.toString() || '',
        candidateId: (iv.candidateId as any)?._id?.toString() || '',
      });
    }

    if (reschedulingNow) {
      await logActivity({
        type: 'interview',
        action: 'interview_rescheduled',
        message: `"${iv.round}" interview for ${(iv.candidateId as any)?.name || 'a candidate'} rescheduled from ${before.date} ${before.time} to ${iv.date} ${iv.time}`,
        entityType: 'interview',
        entityId: iv._id.toString(),
        jobId: (iv.jobId as any)?._id?.toString() || '',
        candidateId: (iv.candidateId as any)?._id?.toString() || '',
      });
    }

    return json({
      ...iv,
      _id: iv._id.toString(),
      candidateId: (iv.candidateId as any)?._id?.toString(),
      jobId: (iv.jobId as any)?._id?.toString(),
      candidateName: (iv.candidateId as any)?.name || '',
      jobTitle: (iv.jobId as any)?.title || '',
    });
  } catch (err: any) {
    return json({ error: err.message }, 400);
  }
};

export const DELETE: APIRoute = async ({ params }) => {
  await connectDB();
  const { id } = params;
  if (!Types.ObjectId.isValid(id!)) return json({ error: 'Invalid ID' }, 400);
  await Interview.findByIdAndDelete(id);
  return json({ ok: true });
};
