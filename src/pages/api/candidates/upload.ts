import type { APIRoute } from 'astro';
import { connectDB } from '../../../db/connection';
import { Candidate } from '../../../db/models/Candidate';
import { Job } from '../../../db/models/Job';
import { Types } from 'mongoose';
import { extractResumeText, analyzeResume } from '../../../lib/resumeAnalysis';
import { sortedPipeline } from '../../../lib/pipeline';
import { logActivity } from '../../../lib/activity';

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

    const existing = await Candidate.find({ jobId }, 'email resumeName').lean();
    const seenEmails = new Set(existing.map(c => c.email).filter(Boolean));
    const seenResumeNames = new Set(existing.map(c => c.resumeName).filter(Boolean));

    const created = [];
    let duplicates = 0;

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
      });

      // A candidate is a duplicate of one already on this job if their parsed
      // email matches, or — when no email could be parsed — their resume
      // filename matches exactly.
      const dupKey = analysis.email || file.name;
      const isDuplicate = analysis.email
        ? seenEmails.has(analysis.email)
        : seenResumeNames.has(file.name);
      if (isDuplicate) {
        duplicates++;
        continue;
      }
      if (analysis.email) seenEmails.add(analysis.email);
      else seenResumeNames.add(file.name);

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
      });

      created.push({ ...candidate.toObject(), _id: candidate._id.toString() });
    }

    if (created.length) {
      await logActivity({
        type: 'candidate',
        action: 'candidates_uploaded',
        message: `${created.length} candidate${created.length === 1 ? '' : 's'} uploaded for "${job.title}"${duplicates ? ` (${duplicates} duplicate${duplicates === 1 ? '' : 's'} skipped)` : ''}`,
        entityType: 'job',
        entityId: jobId,
        jobId,
        meta: { count: created.length, duplicates },
      });
    }

    return json({ uploaded: created.length, duplicates, candidates: created }, 201);
  } catch (err: any) {
    console.error('Upload error:', err);
    return json({ error: err.message }, 500);
  }
};
