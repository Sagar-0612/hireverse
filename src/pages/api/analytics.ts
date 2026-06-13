import type { APIRoute } from 'astro';
import { connectDB } from '../../db/connection';
import { Job } from '../../db/models/Job';
import { Candidate } from '../../db/models/Candidate';
import { Interview } from '../../db/models/Interview';
import { bucketForCandidate, type FunnelBucket } from '../../lib/pipeline';

const json = (data: unknown, status = 200) =>
  new Response(JSON.stringify(data), { status, headers: { 'Content-Type': 'application/json' } });

export const GET: APIRoute = async () => {
  await connectDB();

  const [totalJobs, totalCandidates, totalInterviews] = await Promise.all([
    Job.countDocuments(),
    Candidate.countDocuments(),
    Interview.countDocuments(),
  ]);

  // Funnel — bucket each candidate by relative position in their own job's
  // pipeline (the same cross-job-safe approach used by the dashboard and
  // analytics pages), since `Candidate` has no `status` field and pipelines
  // vary per job.
  const allCandidates = await Candidate.find({}, 'jobId currentStage rejected rejectedAt stageHistory createdAt updatedAt')
    .populate('jobId', 'pipeline')
    .lean();

  const bucketCounts: Record<FunnelBucket, number> = { Applied: 0, 'In Progress': 0, Hired: 0, Rejected: 0 };
  const hiredCandidates: typeof allCandidates = [];
  for (const c of allCandidates) {
    const pipeline = (c.jobId as any)?.pipeline || [];
    const bucket = bucketForCandidate(c, pipeline);
    bucketCounts[bucket]++;
    if (bucket === 'Hired') hiredCandidates.push(c);
  }

  const total = totalCandidates || 1;
  const funnelOrder: FunnelBucket[] = ['Applied', 'In Progress', 'Hired', 'Rejected'];
  const funnel = funnelOrder.map(stage => ({
    stage,
    count: bucketCounts[stage],
    pct: Math.round((bucketCounts[stage] / total) * 100),
  }));

  // Monthly trend (last 6 months) — applications from createdAt, hires from
  // each hired candidate's last real stageHistory transition (or updatedAt
  // as fallback), mirroring analytics/index.astro.
  const sixMonthsAgo = new Date();
  sixMonthsAgo.setMonth(sixMonthsAgo.getMonth() - 5);
  sixMonthsAgo.setDate(1);

  const monthlyCandidates = await Candidate.aggregate([
    { $match: { createdAt: { $gte: sixMonthsAgo } } },
    { $group: { _id: { year: { $year: '$createdAt' }, month: { $month: '$createdAt' } }, count: { $sum: 1 } } },
    { $sort: { '_id.year': 1, '_id.month': 1 } },
  ]);

  const hiredByMonth = new Map<string, number>();
  for (const c of hiredCandidates) {
    const hist = c.stageHistory || [];
    const at = new Date(hist.length ? hist[hist.length - 1].movedAt : c.updatedAt);
    if (at < sixMonthsAgo) continue;
    const k = `${at.getFullYear()}-${at.getMonth() + 1}`;
    hiredByMonth.set(k, (hiredByMonth.get(k) || 0) + 1);
  }

  const months = ['Jan','Feb','Mar','Apr','May','Jun','Jul','Aug','Sep','Oct','Nov','Dec'];
  const now = new Date();
  const monthlyTrends = [];
  for (let i = 5; i >= 0; i--) {
    const d = new Date(now.getFullYear(), now.getMonth() - i, 1);
    const yr = d.getFullYear();
    const mo = d.getMonth() + 1;
    const apps = monthlyCandidates.find(x => x._id.year === yr && x._id.month === mo)?.count || 0;
    const hires = hiredByMonth.get(`${yr}-${mo}`) || 0;
    monthlyTrends.push({ month: months[mo - 1], applications: apps, hires });
  }

  // Top jobs by applicants
  const topJobs = await Job.find()
    .sort({ createdAt: -1 })
    .limit(5)
    .lean();

  const topJobsWithCount = await Promise.all(topJobs.map(async j => ({
    _id: j._id.toString(),
    title: j.title,
    department: j.department,
    status: j.status,
    applicants: await Candidate.countDocuments({ jobId: j._id }),
  })));

  // Scheduled interviews
  const scheduledInterviews = await Interview.countDocuments({ status: 'scheduled' });

  // Avg scores
  const scoreAgg = await Candidate.aggregate([
    { $group: { _id: null, avgScore: { $avg: '$score' }, avgExp: { $avg: '$experience' } } },
  ]);
  const avgScore = Math.round(scoreAgg[0]?.avgScore || 0);
  const avgExperience = parseFloat((scoreAgg[0]?.avgExp || 0).toFixed(1));

  return json({
    totalJobs,
    totalCandidates,
    totalInterviews,
    scheduledInterviews,
    avgScore,
    avgExperience,
    funnel,
    monthlyTrends,
    topJobs: topJobsWithCount,
  });
};
