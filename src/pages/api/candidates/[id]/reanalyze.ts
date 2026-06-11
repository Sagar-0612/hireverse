import type { APIRoute } from 'astro';
import { connectDB } from '../../../../db/connection';
import { Candidate } from '../../../../db/models/Candidate';
import { Job } from '../../../../db/models/Job';
import { Types } from 'mongoose';
import { extractResumeText, analyzeResume } from '../../../../lib/resumeAnalysis';
import { logActivity } from '../../../../lib/activity';

const json = (data: unknown, status = 200) =>
  new Response(JSON.stringify(data), { status, headers: { 'Content-Type': 'application/json' } });

// Re-runs the resume analysis pipeline against the candidate's stored resume
// file with the *current* analyzer — the one place a candidate uploaded
// before a parsing fix (location, experience, skill-evidence, etc.) can pick
// up the corrected read without being re-uploaded from scratch. Only the
// fields the analyzer actually derives from resume text are touched; identity
// fields a recruiter might reasonably treat as settled (name/email/phone) are
// left alone so re-analysis can't quietly rewrite who someone is.
export const POST: APIRoute = async ({ params }) => {
  await connectDB();
  const { id } = params;
  if (!Types.ObjectId.isValid(id!)) return json({ error: 'Invalid ID' }, 400);

  const candidate = await Candidate.findById(id);
  if (!candidate) return json({ error: 'Not found' }, 404);
  if (!candidate.resumeBase64) {
    return json({ error: 'No resume file is on record for this candidate to re-analyze.' }, 400);
  }

  const job = await Job.findById(candidate.jobId).lean();
  if (!job) return json({ error: 'Parent job not found.' }, 404);

  const buffer = Buffer.from(candidate.resumeBase64, 'base64');
  const text = await extractResumeText(buffer, candidate.resumeType, candidate.resumeName);
  if (!text.trim()) {
    return json({ error: "Couldn't extract readable text from this resume file — re-analysis needs real text to work with." }, 400);
  }

  const analysis = analyzeResume(text, candidate.resumeName, {
    requiredSkills: job.requiredSkills,
    niceToHaveSkills: job.niceToHaveSkills,
    education: job.education,
    level: job.level,
  });

  const before = {
    score: candidate.score,
    location: candidate.location,
    experience: candidate.experience,
  };

  candidate.location = analysis.location;
  candidate.locationConfidence = analysis.locationConfidence;
  candidate.experience = analysis.experience;
  candidate.skills = analysis.skills;
  candidate.practicalSkills = analysis.practicalSkills;
  candidate.achievements = analysis.achievements;
  candidate.skillGaps = analysis.skillGaps as any;
  candidate.skillsMatch = analysis.skillsMatch;
  candidate.educationMatch = analysis.educationMatch;
  candidate.score = analysis.score;
  candidate.recommendation = analysis.recommendation;
  await candidate.save();

  await logActivity({
    type: 'candidate',
    action: 'candidate_reanalyzed',
    message: `${candidate.name}'s resume was re-analyzed — score ${before.score} → ${analysis.score}, location "${before.location}" → "${analysis.location}", experience ${before.experience} → ${analysis.experience} yrs`,
    entityType: 'candidate',
    entityId: candidate._id.toString(),
    jobId: candidate.jobId.toString(),
    candidateId: candidate._id.toString(),
  });

  return json({ ...candidate.toObject(), _id: candidate._id.toString() });
};
