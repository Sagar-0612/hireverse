import type { APIRoute } from 'astro';
import { Types } from 'mongoose';
import { connectDB } from '../../../db/connection';
import { Candidate } from '../../../db/models/Candidate';
import { bucketForCandidate } from '../../../lib/pipeline';

const RANGE_PRESETS: Record<string, number> = { '7d': 7, '30d': 30, '90d': 90, '6m': 183, '12m': 365 };

function escapeCsv(value: string): string {
  if (/[",\r\n]/.test(value)) {
    return `"${value.replace(/"/g, '""')}"`;
  }
  return value;
}

export const GET: APIRoute = async ({ url }) => {
  await connectDB();

  const params = url.searchParams;
  const jobFilter = params.get('job') || '';
  const rangeFilter = params.get('range') || 'all';
  const fromParam = params.get('from') || '';
  const toParam = params.get('to') || '';

  let dateFrom: Date | null = null;
  let dateTo: Date | null = null;
  if (rangeFilter === 'custom' && (fromParam || toParam)) {
    if (fromParam) dateFrom = new Date(`${fromParam}T00:00:00`);
    if (toParam) dateTo = new Date(`${toParam}T23:59:59`);
  } else if (rangeFilter in RANGE_PRESETS) {
    const d = new Date();
    d.setDate(d.getDate() - RANGE_PRESETS[rangeFilter]);
    dateFrom = d;
  }

  const filter: Record<string, any> = {};
  if (jobFilter && Types.ObjectId.isValid(jobFilter)) filter.jobId = new Types.ObjectId(jobFilter);
  if (dateFrom || dateTo) {
    filter.createdAt = {};
    if (dateFrom) filter.createdAt.$gte = dateFrom;
    if (dateTo) filter.createdAt.$lte = dateTo;
  }

  const candidates = await Candidate.find(
    filter,
    'name email jobId currentStage rejected score skillsMatch experience educationMatch recommendation createdAt stageHistory'
  )
    .populate('jobId', 'title pipeline')
    .sort({ createdAt: -1 })
    .lean();

  const rows: string[][] = [
    ['Name', 'Email', 'Job', 'Current Stage', 'Funnel Status', 'Score', 'Skills Match %', 'Education Match %', 'Experience (yrs)', 'Recommendation', 'Applied On'],
  ];

  for (const c of candidates) {
    const pipeline = (c.jobId as any)?.pipeline || [];
    const bucket = bucketForCandidate(c, pipeline);
    rows.push([
      c.name || '',
      c.email || '',
      (c.jobId as any)?.title || '',
      c.currentStage || '',
      bucket,
      String(c.score ?? ''),
      String(c.skillsMatch ?? ''),
      String((c as any).educationMatch ?? ''),
      typeof c.experience === 'number' ? c.experience.toFixed(1) : '',
      c.recommendation || '',
      c.createdAt ? new Date(c.createdAt).toISOString().split('T')[0] : '',
    ]);
  }

  const csv = rows.map(r => r.map(escapeCsv).join(',')).join('\r\n');
  const datestamp = new Date().toISOString().split('T')[0];

  return new Response(csv, {
    status: 200,
    headers: {
      'Content-Type': 'text/csv; charset=utf-8',
      'Content-Disposition': `attachment; filename="hireverse-analytics-${datestamp}.csv"`,
    },
  });
};
