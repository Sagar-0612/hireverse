import type { APIRoute } from 'astro';
import { connectDB } from '../../../../db/connection';
import { Candidate } from '../../../../db/models/Candidate';
import { Types } from 'mongoose';

export const GET: APIRoute = async ({ params }) => {
  await connectDB();
  const { id } = params;
  if (!id || !Types.ObjectId.isValid(id)) {
    return new Response(JSON.stringify({ error: 'Invalid ID' }), { status: 400, headers: { 'Content-Type': 'application/json' } });
  }

  const candidate = await Candidate.findById(id).lean();
  if (!candidate || !candidate.resumeBase64) {
    return new Response(JSON.stringify({ error: 'Resume not found' }), { status: 404, headers: { 'Content-Type': 'application/json' } });
  }

  const buffer = Buffer.from(candidate.resumeBase64, 'base64');
  const filename = candidate.resumeName || `resume-${id}`;

  return new Response(buffer, {
    status: 200,
    headers: {
      'Content-Type': candidate.resumeType || 'application/octet-stream',
      'Content-Disposition': `attachment; filename="${filename.replace(/"/g, '')}"`,
      'Content-Length': String(buffer.length),
    },
  });
};
