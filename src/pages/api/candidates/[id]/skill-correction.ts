import type { APIRoute } from 'astro';
import { connectDB } from '../../../../db/connection';
import { Candidate } from '../../../../db/models/Candidate';
import { Job } from '../../../../db/models/Job';
import { Types } from 'mongoose';
import { extractResumeText, recomputeFromSkillGaps, RELATED_SKILL_SCORE } from '../../../../lib/resumeAnalysis';
import { appearsInText } from '../../../../lib/skillRelations';
import { recordSkillCorrection } from '../../../../lib/learningEngine';
import { logActivity } from '../../../../lib/activity';

const json = (data: unknown, status = 200) =>
  new Response(JSON.stringify(data), { status, headers: { 'Content-Type': 'application/json' } });

// Lets a recruiter point at resume text the static analysis missed as real
// evidence of a required/nice-to-have skill that came back "missing" (score
// 0). This is the human half of the adaptive-intelligence loop described in
// ai-architecture-recommendation.txt section 10: the correction (a) fixes
// THIS candidate's gap immediately (related-skill credit, score 35 — never
// worse than the 0 it replaces), and (b) is recorded via learningEngine so
// that once the SAME (skill, phrase) pair has been confirmed by enough
// independent recruiters, the platform recognizes it for every future resume
// that requires this skill, on any job.
//
// Deliberately restricted to "missing" -> "related": every other status
// (listed=65, practical=100) already scores higher than the 35 a learned
// alias would award, so allowing corrections from those statuses could only
// ever LOWER a candidate's score — which would violate the "no automatic
// score can get worse" guarantee.
export const POST: APIRoute = async ({ params, request }) => {
  await connectDB();
  const { id } = params;
  if (!Types.ObjectId.isValid(id!)) return json({ error: 'Invalid ID' }, 400);

  const body = await request.json().catch(() => ({}));
  const skill = typeof body.skill === 'string' ? body.skill.trim() : '';
  const evidencePhrase = typeof body.evidencePhrase === 'string' ? body.evidencePhrase.trim() : '';
  if (!skill || !evidencePhrase) return json({ error: 'skill and evidencePhrase are required.' }, 400);
  if (evidencePhrase.length < 2 || evidencePhrase.length > 80) {
    return json({ error: 'Evidence phrase must be between 2 and 80 characters.' }, 400);
  }

  const candidate = await Candidate.findById(id);
  if (!candidate) return json({ error: 'Not found' }, 404);

  const gapIndex = (candidate.skillGaps || []).findIndex((g: any) => g.skill.toLowerCase() === skill.toLowerCase());
  if (gapIndex === -1) return json({ error: `"${skill}" is not part of this candidate's skill analysis.` }, 404);

  const gap = candidate.skillGaps[gapIndex];
  if (gap.status !== 'missing') {
    return json({ error: `"${skill}" is already credited (${gap.status}) — no correction needed.` }, 400);
  }

  if (!candidate.resumeBase64) {
    return json({ error: 'No resume file is on record for this candidate.' }, 400);
  }
  const buffer = Buffer.from(candidate.resumeBase64, 'base64');
  const text = await extractResumeText(buffer, candidate.resumeType, candidate.resumeName);
  const lowerText = text.toLowerCase();
  if (!appearsInText(lowerText, evidencePhrase)) {
    return json({ error: `That phrase doesn't appear on ${candidate.name}'s resume — corrections must point at real resume text.` }, 400);
  }

  const job = await Job.findById(candidate.jobId).lean();
  if (!job) return json({ error: 'Parent job not found.' }, 404);

  const fromStatus = gap.status;
  candidate.skillGaps[gapIndex].status = 'related';
  candidate.skillGaps[gapIndex].relatedSkill = evidencePhrase;
  candidate.skillGaps[gapIndex].score = RELATED_SKILL_SCORE;

  const recomputed = recomputeFromSkillGaps(candidate.skillGaps as any, candidate.educationMatch, candidate.experience, {
    requiredSkills: job.requiredSkills,
    niceToHaveSkills: job.niceToHaveSkills,
    education: job.education,
    level: job.level,
  });
  const before = { score: candidate.score };
  candidate.skillsMatch = recomputed.skillsMatch;
  candidate.score = recomputed.score;
  candidate.recommendation = recomputed.recommendation;

  const correction = await recordSkillCorrection({
    jobId: candidate.jobId.toString(),
    candidateId: candidate._id.toString(),
    skill,
    evidencePhrase,
    fromStatus,
    toStatus: 'related',
  });
  candidate.skillGaps[gapIndex].learnedOccurrences = correction.occurrences;

  await candidate.save();

  await logActivity({
    type: 'candidate',
    action: 'skill_correction_recorded',
    message: `${candidate.name}'s "${skill}" gap was corrected to "related" (evidence: "${evidencePhrase}") — score ${before.score} → ${candidate.score}.${correction.justPromoted ? ` This alias is now recognized platform-wide for "${skill}".` : ''}`,
    entityType: 'candidate',
    entityId: candidate._id.toString(),
    jobId: candidate.jobId.toString(),
    candidateId: candidate._id.toString(),
  });

  return json({
    ...candidate.toObject(),
    _id: candidate._id.toString(),
    correction,
  });
};
