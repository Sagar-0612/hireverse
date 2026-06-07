import type { APIRoute } from 'astro';
import { connectDB } from '../../db/connection';
import { Job } from '../../db/models/Job';
import { Candidate } from '../../db/models/Candidate';
import { Interview } from '../../db/models/Interview';

const json = (data: unknown, status = 200) =>
  new Response(JSON.stringify(data), { status, headers: { 'Content-Type': 'application/json' } });

export const GET: APIRoute = async () => {
  await connectDB();

  const [totalJobs, totalCandidates, totalInterviews] = await Promise.all([
    Job.countDocuments(),
    Candidate.countDocuments(),
    Interview.countDocuments(),
  ]);

  // Funnel
  const statuses = ['applied','screening','shortlisted','interview','offered','hired'];
  const funnelRaw = await Candidate.aggregate([
    { $group: { _id: '$status', count: { $sum: 1 } } },
  ]);
  const funnelMap: Record<string, number> = {};
  funnelRaw.forEach(r => { funnelMap[r._id] = r.count; });
  const total = totalCandidates || 1;
  const funnel = statuses.map(s => ({
    stage: s.charAt(0).toUpperCase() + s.slice(1),
    count: funnelMap[s] || 0,
    pct: Math.round(((funnelMap[s] || 0) / total) * 100),
  }));

  // Monthly trend (last 6 months)
  const sixMonthsAgo = new Date();
  sixMonthsAgo.setMonth(sixMonthsAgo.getMonth() - 5);
  sixMonthsAgo.setDate(1);

  const monthlyCandidates = await Candidate.aggregate([
    { $match: { createdAt: { $gte: sixMonthsAgo } } },
    { $group: { _id: { year: { $year: '$createdAt' }, month: { $month: '$createdAt' } }, count: { $sum: 1 } } },
    { $sort: { '_id.year': 1, '_id.month': 1 } },
  ]);

  const monthlyHires = await Candidate.aggregate([
    { $match: { status: 'hired', createdAt: { $gte: sixMonthsAgo } } },
    { $group: { _id: { year: { $year: '$createdAt' }, month: { $month: '$createdAt' } }, count: { $sum: 1 } } },
    { $sort: { '_id.year': 1, '_id.month': 1 } },
  ]);

  const months = ['Jan','Feb','Mar','Apr','May','Jun','Jul','Aug','Sep','Oct','Nov','Dec'];
  const now = new Date();
  const monthlyTrends = [];
  for (let i = 5; i >= 0; i--) {
    const d = new Date(now.getFullYear(), now.getMonth() - i, 1);
    const yr = d.getFullYear();
    const mo = d.getMonth() + 1;
    const apps = monthlyCandidates.find(x => x._id.year === yr && x._id.month === mo)?.count || 0;
    const hires = monthlyHires.find(x => x._id.year === yr && x._id.month === mo)?.count || 0;
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
