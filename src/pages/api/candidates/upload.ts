import type { APIRoute } from 'astro';
import { connectDB } from '../../../db/connection';
import { Candidate } from '../../../db/models/Candidate';
import { Job } from '../../../db/models/Job';
import { Types } from 'mongoose';
import { extractResumeText, analyzeResume, jdFingerprint, hasMeaningfulProfileChange } from '../../../lib/resumeAnalysis';
import { sortedPipeline } from '../../../lib/pipeline';
import { logActivity } from '../../../lib/activity';
import { getLearnedAliases } from '../../../lib/learningEngine';

const json = (data: unknown, status = 200) =>
  new Response(JSON.stringify(data), { status, headers: { 'Content-Type': 'application/json' } });

export const POST: APIRoute = async ({ request }) => {
  await connectDB();
  try {
    const formData = await request.formData();
    const jobId = formData.get('jobId') as string;
    const files = formData.getAll('files') as File[];

    if (!jobId || !Types.ObjectId.isValid(jobId)) {
      return json({ error: 'Valid jobId is required' }, 400);
    }
    if (!files || files.length === 0) {
      return json({ error: 'No files provided' }, 400);
    }

    const job = await Job.findById(jobId).lean();
    if (!job) return json({ error: 'Job not found' }, 404);

    const firstStage = sortedPipeline(job.pipeline)[0];
    if (!firstStage) return json({ error: 'This job has no hiring pipeline configured' }, 400);

    // Current JD's fingerprint — captured once so every file in this batch is
    // judged against the exact same "has the ask actually changed?" baseline.
    const currentJdHash = jdFingerprint(job);

    // Platform-learned skill aliases (ai-architecture-recommendation.txt
    // section 10) — loaded once per batch, applied to every resume in it.
    // Returns {} on a fresh install, reproducing pre-existing behavior exactly.
    const learnedAliases = await getLearnedAliases();

    const existing = await Candidate.find({ jobId }).lean();
    const byEmail = new Map(existing.filter(c => c.email).map(c => [c.email.toLowerCase(), c]));
    const byResumeName = new Map(existing.filter(c => !c.email && c.resumeName).map(c => [c.resumeName, c]));

    const created: any[] = [];
    const updated: any[] = [];
    const notices: { type: 'duplicate' | 'reapplied' | 'already_progressed'; message: string }[] = [];

    for (const file of files) {
      if (!file.name) continue;

      const arrayBuffer = await file.arrayBuffer();
      const buffer = Buffer.from(arrayBuffer);
      const base64 = buffer.toString('base64');
      const mimeType = file.type || 'application/octet-stream';

      const text = await extractResumeText(buffer, mimeType, file.name);
      const analysis = analyzeResume(text, file.name, {
        requiredSkills: job.requiredSkills,
        niceToHaveSkills: job.niceToHaveSkills,
        education: job.education,
        level: job.level,
      }, learnedAliases);

      // A resume matches a candidate already on this job by parsed email, or —
      // when no email could be parsed — by an exact resume-filename match.
      const emailKey = analysis.email ? analysis.email.toLowerCase() : '';
      const match = emailKey ? byEmail.get(emailKey) : byResumeName.get(file.name);

      if (match) {
        // Guard: candidate has already moved through the pipeline (or been
        // rejected).  Hiring decisions were made on the original score — we
        // must not silently mutate it.  We still archive the new resume file
        // (the recruiter may legitimately want the latest version on record)
        // but every scored field and the stage history are left untouched.
        const hasProgressed = match.rejected || match.currentStage !== firstStage.key;
        if (hasProgressed) {
          const stageLabel = match.rejected
            ? 'Rejected'
            : ((job.pipeline as any[]).find((s: any) => s.key === match.currentStage)?.label ?? match.currentStage);
          const doc = await Candidate.findById(match._id);
          if (doc) {
            doc.resumeName = file.name;
            doc.resumeType = mimeType;
            doc.resumeBase64 = base64;
            await doc.save();
          }
          notices.push({
            type: 'already_progressed',
            message: `${match.name} is already at "${stageLabel}" in the pipeline — scores and stage history are frozen. Resume file was archived, but no re-scoring was done.`,
          });
          continue;
        }

        // Same person, same job — but is this actually a *new* application, or
        // the same one again? Only a real change on either side (the JD now
        // asks for something different, or their profile genuinely reads
        // differently — not just reshuffled) earns them a fresh look.
        const jdChanged = !match.appliedJdHash || match.appliedJdHash !== currentJdHash;
        const profileChanged = hasMeaningfulProfileChange(match, analysis);

        if (!jdChanged && !profileChanged) {
          notices.push({
            type: 'duplicate',
            message: `${analysis.name || match.name} has already applied to this role and nothing concrete has changed — same JD, same experience/skills/achievements (just possibly reordered). Skipped as a duplicate; "${file.name}" was not added.`,
          });
          continue;
        }

        const why = jdChanged && profileChanged
          ? 'the JD has been revised since they applied and their resume now reads differently'
          : jdChanged
            ? 'the JD has been revised since they applied'
            : 'their resume now reads with concretely different experience, skills, or achievements';

        const doc = await Candidate.findById(match._id);
        if (doc) {
          doc.name = analysis.name || doc.name;
          doc.phone = analysis.phone || doc.phone;
          doc.location = analysis.location || doc.location;
          doc.locationConfidence = analysis.locationConfidence;
          doc.score = analysis.score;
          doc.experience = analysis.experience;
          doc.skillsMatch = analysis.skillsMatch;
          doc.educationMatch = analysis.educationMatch;
          doc.recommendation = analysis.recommendation;
          doc.resumeName = file.name;
          doc.resumeType = mimeType;
          doc.resumeBase64 = base64;
          doc.skills = analysis.skills;
          doc.practicalSkills = analysis.practicalSkills;
          doc.achievements = analysis.achievements;
          doc.skillGaps = analysis.skillGaps as any;
          doc.appliedJdHash = currentJdHash;
          await doc.save();

          const updatedObj = { ...doc.toObject(), _id: doc._id.toString() };
          updated.push(updatedObj);
          notices.push({
            type: 'reapplied',
            message: `${doc.name} re-applied for "${job.title}" — ${why}, so this counts as a real re-application. Their record was refreshed with the new resume (their stage and progress were left untouched).`,
          });

          await logActivity({
            type: 'candidate',
            action: 'candidate_reapplied',
            message: `${doc.name} re-applied for "${job.title}" with an updated resume — ${why}`,
            entityType: 'candidate',
            entityId: doc._id.toString(),
            jobId,
            candidateId: doc._id.toString(),
          });

          if (emailKey) byEmail.set(emailKey, updatedObj as any);
          else byResumeName.set(file.name, updatedObj as any);
        }
        continue;
      }

      const candidate = await Candidate.create({
        jobId,
        name: analysis.name,
        email: analysis.email,
        phone: analysis.phone,
        location: analysis.location,
        locationConfidence: analysis.locationConfidence,
        score: analysis.score,
        experience: analysis.experience,
        skillsMatch: analysis.skillsMatch,
        educationMatch: analysis.educationMatch,
        recommendation: analysis.recommendation,
        currentStage: firstStage.key,
        resumeName: file.name,
        resumeType: mimeType,
        resumeBase64: base64,
        skills: analysis.skills,
        practicalSkills: analysis.practicalSkills,
        achievements: analysis.achievements,
        skillGaps: analysis.skillGaps,
        appliedJdHash: currentJdHash,
      });

      const createdObj = { ...candidate.toObject(), _id: candidate._id.toString() };
      created.push(createdObj);
      if (emailKey) byEmail.set(emailKey, createdObj as any);
      else byResumeName.set(file.name, createdObj as any);
    }

    const duplicates = notices.filter(n => n.type === 'duplicate').length;

    if (created.length || updated.length) {
      const parts = [];
      if (created.length) parts.push(`${created.length} new candidate${created.length === 1 ? '' : 's'}`);
      if (updated.length) parts.push(`${updated.length} re-application${updated.length === 1 ? '' : 's'} refreshed`);
      await logActivity({
        type: 'candidate',
        action: 'candidates_uploaded',
        message: `${parts.join(' and ')} for "${job.title}"${duplicates ? ` (${duplicates} duplicate${duplicates === 1 ? '' : 's'} skipped)` : ''}`,
        entityType: 'job',
        entityId: jobId,
        jobId,
        meta: { count: created.length, updated: updated.length, duplicates },
      });
    }

    return json({ uploaded: created.length, updated: updated.length, duplicates, candidates: created, updatedCandidates: updated, notices }, 201);
  } catch (err: any) {
    console.error('Upload error:', err);
    return json({ error: err.message }, 500);
  }
};
