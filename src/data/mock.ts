export const jobs = [
  { id: "j1", title: "Senior Frontend Engineer", department: "Engineering", location: "Remote", applicants: 48, status: "active", created: "2026-05-12" },
  { id: "j2", title: "Product Manager", department: "Product", location: "New York, NY", applicants: 61, status: "active", created: "2026-05-08" },
  { id: "j3", title: "ML Engineer", department: "AI / ML", location: "San Francisco, CA", applicants: 34, status: "active", created: "2026-05-01" },
  { id: "j4", title: "DevOps Engineer", department: "Infrastructure", location: "Remote", applicants: 22, status: "active", created: "2026-04-28" },
  { id: "j5", title: "UX Designer", department: "Design", location: "Austin, TX", applicants: 39, status: "interviewing", created: "2026-04-20" },
  { id: "j6", title: "Backend Engineer (Go)", department: "Engineering", location: "Remote", applicants: 55, status: "interviewing", created: "2026-04-15" },
  { id: "j7", title: "Data Analyst", department: "Analytics", location: "Chicago, IL", applicants: 18, status: "closed", created: "2026-03-30" },
  { id: "j8", title: "Technical Recruiter", department: "HR", location: "Remote", applicants: 27, status: "archived", created: "2026-03-10" },
];

export const candidates = [
  { id: "c1", jobId: "j1", name: "Arjun Mehta", score: 92, experience: 6, skillsMatch: 94, educationMatch: 88, recommendation: "Strongly Recommend", status: "shortlisted", email: "arjun.mehta@example.com", phone: "+1 (555) 012-3456", location: "San Francisco, CA", applied: "2026-05-14" },
  { id: "c2", jobId: "j1", name: "Sofia Reyes", score: 88, experience: 5, skillsMatch: 90, educationMatch: 85, recommendation: "Recommend", status: "screening", email: "sofia.reyes@example.com", phone: "+1 (555) 023-4567", location: "Remote", applied: "2026-05-15" },
  { id: "c3", jobId: "j1", name: "Liam O'Brien", score: 81, experience: 4, skillsMatch: 82, educationMatch: 79, recommendation: "Recommend", status: "interview", email: "liam@example.com", phone: "+1 (555) 034-5678", location: "New York, NY", applied: "2026-05-13" },
  { id: "c4", jobId: "j1", name: "Priya Nair", score: 76, experience: 3, skillsMatch: 78, educationMatch: 73, recommendation: "Consider", status: "applied", email: "priya.nair@example.com", phone: "+1 (555) 045-6789", location: "Austin, TX", applied: "2026-05-16" },
  { id: "c5", jobId: "j1", name: "David Park", score: 68, experience: 2, skillsMatch: 65, educationMatch: 72, recommendation: "Consider", status: "applied", email: "david.park@example.com", phone: "+1 (555) 056-7890", location: "Remote", applied: "2026-05-17" },
  { id: "c6", jobId: "j2", name: "Emma Zhang", score: 95, experience: 8, skillsMatch: 96, educationMatch: 92, recommendation: "Strongly Recommend", status: "shortlisted", email: "emma.zhang@example.com", phone: "+1 (555) 067-8901", location: "New York, NY", applied: "2026-05-10" },
  { id: "c7", jobId: "j3", name: "Noah Williams", score: 89, experience: 5, skillsMatch: 91, educationMatch: 87, recommendation: "Recommend", status: "interview", email: "noah.w@example.com", phone: "+1 (555) 078-9012", location: "San Francisco, CA", applied: "2026-05-03" },
];

export const interviews = [
  { id: "i1", candidateId: "c1", candidateName: "Arjun Mehta", jobId: "j1", jobTitle: "Senior Frontend Engineer", round: "L1 Technical", interviewer: "Sarah Kim", date: "2026-06-07", time: "10:00 AM", status: "scheduled", duration: 60 },
  { id: "i2", candidateId: "c3", candidateName: "Liam O'Brien", jobId: "j1", jobTitle: "Senior Frontend Engineer", round: "L1 Technical", interviewer: "Alex Chen", date: "2026-06-08", time: "2:00 PM", status: "scheduled", duration: 60 },
  { id: "i3", candidateId: "c6", candidateName: "Emma Zhang", jobId: "j2", jobTitle: "Product Manager", round: "Manager Round", interviewer: "James Wilson", date: "2026-06-06", time: "11:00 AM", status: "scheduled", duration: 45 },
  { id: "i4", candidateId: "c7", candidateName: "Noah Williams", jobId: "j3", jobTitle: "ML Engineer", round: "L2 Technical", interviewer: "Priya Gupta", date: "2026-05-30", time: "3:00 PM", status: "completed", duration: 90, commScore: 82, techScore: 91, confidenceScore: 78, recommendation: "Proceed to Manager Round" },
  { id: "i5", candidateId: "c2", candidateName: "Sofia Reyes", jobId: "j1", jobTitle: "Senior Frontend Engineer", round: "HR Round", interviewer: "Maya Patel", date: "2026-05-28", time: "1:00 PM", status: "completed", duration: 30, commScore: 88, techScore: 75, confidenceScore: 84, recommendation: "Recommend Hire" },
];

export const teamMembers = [
  { id: "t1", name: "Sarah Kim", email: "sarah.kim@hireverse.ai", role: "Hiring Manager", department: "Engineering", status: "active", jobsAssigned: 3, interviewsThisMonth: 8 },
  { id: "t2", name: "Alex Chen", email: "alex.chen@hireverse.ai", role: "Technical Interviewer", department: "Engineering", status: "active", jobsAssigned: 2, interviewsThisMonth: 12 },
  { id: "t3", name: "Maya Patel", email: "maya.patel@hireverse.ai", role: "Recruiter", department: "HR", status: "active", jobsAssigned: 5, interviewsThisMonth: 20 },
  { id: "t4", name: "James Wilson", email: "james.w@hireverse.ai", role: "Hiring Manager", department: "Product", status: "active", jobsAssigned: 2, interviewsThisMonth: 6 },
  { id: "t5", name: "Priya Gupta", email: "priya.gupta@hireverse.ai", role: "Technical Interviewer", department: "AI / ML", status: "inactive", jobsAssigned: 1, interviewsThisMonth: 3 },
];

export const recentActivity = [
  { id: "a1", type: "hired", text: "Offer accepted by Emma Zhang for Product Manager", time: "2h ago", icon: "check" },
  { id: "a2", type: "interview", text: "Interview scheduled for Arjun Mehta — L1 Technical", time: "4h ago", icon: "calendar" },
  { id: "a3", type: "resume", text: "34 new resumes uploaded for ML Engineer", time: "6h ago", icon: "upload" },
  { id: "a4", type: "shortlist", text: "Liam O'Brien shortlisted for Frontend Engineer", time: "1d ago", icon: "star" },
  { id: "a5", type: "job", text: "New job posted — Backend Engineer (Go)", time: "1d ago", icon: "briefcase" },
  { id: "a6", type: "analysis", text: "AI analysis complete for Product Manager (61 resumes)", time: "2d ago", icon: "brain" },
];

export const funnelData = [
  { stage: "Applied", count: 247, pct: 100 },
  { stage: "Screened", count: 148, pct: 60 },
  { stage: "Shortlisted", count: 62, pct: 25 },
  { stage: "Interviewed", count: 31, pct: 13 },
  { stage: "Offer Sent", count: 12, pct: 5 },
  { stage: "Hired", count: 8, pct: 3 },
];

export const monthlyTrends = [
  { month: "Jan", applications: 38, hires: 2 },
  { month: "Feb", applications: 44, hires: 3 },
  { month: "Mar", applications: 51, hires: 4 },
  { month: "Apr", applications: 67, hires: 5 },
  { month: "May", applications: 82, hires: 6 },
  { month: "Jun", applications: 47, hires: 2 },
];
