/**
 * One-off data migration — recomputes score, skillsMatch, educationMatch,
 * skillGaps, skills, practicalSkills, achievements, and recommendation for
 * every existing candidate by re-running analyzeResume() against their
 * stored resume and their parent job's *current* requirements. Brings
 * pre-existing candidates (analyzed before the related-skill-credit and
 * skillGaps changes) in line with the current scoring logic.
 *
 * Run once:
 *   node --experimental-strip-types src/scripts/backfill-skill-gaps.ts
 */

import mongoose from 'mongoose';
import { extractResumeText, analyzeResume } from '../lib/resumeAnalysis.ts';
import { Job } from '../db/models/Job.ts';
import { Candidate } from '../db/models/Candidate.ts';

const MONGODB_URI = process.env.MONGODB_URI || 'mongodb://localhost:27017/hireverse';

async function main() {
  await mongoose.connect(MONGODB_URI);

  const candidates = await Candidate.find({ resumeBase64: { $ne: '' } });
  let updated = 0;
  let skipped = 0;

  for (const candidate of candidates) {
    const job = await Job.findById(candidate.jobId).lean();
    if (!job) {
      skipped++;
      continue;
    }

    try {
      const buffer = Buffer.from(candidate.resumeBase64, 'base64');
      const text = await extractResumeText(buffer, candidate.resumeType, candidate.resumeName);
      const analysis = analyzeResume(text, candidate.resumeName, {
        requiredSkills: job.requiredSkills,
        niceToHaveSkills: job.niceToHaveSkills,
        education: job.education,
        level: job.level,
      });

      candidate.score = analysis.score;
      candidate.experience = analysis.experience;
      candidate.skillsMatch = analysis.skillsMatch;
      candidate.educationMatch = analysis.educationMatch;
      candidate.recommendation = analysis.recommendation;
      candidate.skills = analysis.skills;
      candidate.practicalSkills = analysis.practicalSkills;
      candidate.achievements = analysis.achievements;
      candidate.skillGaps = analysis.skillGaps as any;
      await candidate.save();

      console.log(`updated: ${candidate.name} (${candidate._id}) — score ${analysis.score}, skillsMatch ${analysis.skillsMatch}, gaps ${analysis.skillGaps.length}`);
      updated++;
    } catch (err: any) {
      console.error(`failed: ${candidate.name} (${candidate._id}) — ${err.message}`);
      skipped++;
    }
  }

  console.log(`\nDone. Updated ${updated}, skipped ${skipped}.`);
  await mongoose.disconnect();
}

main().catch(err => {
  console.error(err);
  process.exit(1);
});
