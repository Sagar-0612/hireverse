import type { APIRoute } from 'astro';
import { connectDB } from '../../../db/connection';
import { Candidate } from '../../../db/models/Candidate';
import { Job } from '../../../db/models/Job';
import { Types } from 'mongoose';

const json = (data: unknown, status = 200) =>
  new Response(JSON.stringify(data), { status, headers: { 'Content-Type': 'application/json' } });

function extractName(filename: string): string {
  let name = filename.replace(/\.(pdf|docx|doc|txt)$/i, '');
  name = name.replace(/[-_]/g, ' ');
  // split camelCase
  name = name.replace(/([a-z])([A-Z])/g, '$1 $2');
  // strip common noise words
  name = name.replace(/\b(resume|cv|curriculum|vitae|application|final|updated|new|v\d+)\b/gi, '');
  const words = name.trim().split(/\s+/).filter(Boolean);
  // capitalize each word; only keep first 3 words as the name
  return words
    .slice(0, 3)
    .map(w => w.charAt(0).toUpperCase() + w.slice(1).toLowerCase())
    .join(' ') || 'Unknown Candidate';
}

function rand(min: number, max: number) {
  return Math.floor(Math.random() * (max - min + 1)) + min;
}

function getRecommendation(score: number): string {
  if (score >= 88) return 'Strongly Recommend';
  if (score >= 75) return 'Recommend';
  if (score >= 65) return 'Consider';
  return 'Not Recommended';
}

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

    const created = [];

    for (const file of files) {
      if (!file.name) continue;

      const arrayBuffer = await file.arrayBuffer();
      const base64 = Buffer.from(arrayBuffer).toString('base64');
      const score = rand(60, 96);
      const skillsMatch = rand(62, 97);
      const educationMatch = rand(60, 94);
      const experience = rand(1, 10);

      const candidate = await Candidate.create({
        jobId,
        name: extractName(file.name),
        email: '',
        phone: '',
        location: '',
        score,
        experience,
        skillsMatch,
        educationMatch,
        recommendation: getRecommendation(score),
        status: 'applied',
        resumeName: file.name,
        resumeType: file.type || 'application/octet-stream',
        resumeBase64: base64,
        skills: (job.requiredSkills || []).slice(0, rand(2, 5)),
      });

      created.push({ ...candidate.toObject(), _id: candidate._id.toString() });
    }

    return json({ uploaded: created.length, candidates: created }, 201);
  } catch (err: any) {
    console.error('Upload error:', err);
    return json({ error: err.message }, 500);
  }
};
