import { Job } from './models/Job';
import { Candidate } from './models/Candidate';
import { Interview } from './models/Interview';
import { Team } from './models/Team';

export async function seedDatabase() {
  // Seed team
  const team = await Team.insertMany([
    { name: 'Sarah Kim',   email: 'sarah.kim@hireverse.ai',   role: 'Hiring Manager',       department: 'Engineering', status: 'active' },
    { name: 'Alex Chen',   email: 'alex.chen@hireverse.ai',   role: 'Technical Interviewer', department: 'Engineering', status: 'active' },
    { name: 'Maya Patel',  email: 'maya.patel@hireverse.ai',  role: 'Recruiter',             department: 'HR',          status: 'active' },
    { name: 'James Wilson',email: 'james.w@hireverse.ai',     role: 'Hiring Manager',        department: 'Product',     status: 'active' },
    { name: 'Priya Gupta', email: 'priya.gupta@hireverse.ai', role: 'Technical Interviewer', department: 'AI / ML',     status: 'inactive' },
  ]);

  // Seed jobs
  const jobs = await Job.insertMany([
    { title: 'Senior Frontend Engineer', department: 'Engineering',    location: 'Remote',             type: 'Full-time', level: 'Senior Level (5–8 yrs)', salary: '$140k–$180k', status: 'active',       requiredSkills: ['TypeScript','React','Node.js','GraphQL','AWS','Docker'], hiringManager: 'Sarah Kim',    threshold: 70, description: 'Build world-class frontend experiences.' },
    { title: 'Product Manager',          department: 'Product',         location: 'New York, NY',       type: 'Full-time', level: 'Senior Level (5–8 yrs)', salary: '$130k–$160k', status: 'active',       requiredSkills: ['Product Strategy','Roadmapping','Agile','SQL','User Research'], hiringManager: 'James Wilson', threshold: 72, description: 'Drive product vision and roadmap.' },
    { title: 'ML Engineer',              department: 'AI / ML',         location: 'San Francisco, CA',  type: 'Full-time', level: 'Mid Level (3–5 yrs)',    salary: '$150k–$190k', status: 'active',       requiredSkills: ['Python','PyTorch','TensorFlow','MLOps','AWS','Docker'], hiringManager: 'Priya Gupta',  threshold: 75, description: 'Design and deploy ML models at scale.' },
    { title: 'DevOps Engineer',          department: 'Infrastructure',  location: 'Remote',             type: 'Full-time', level: 'Mid Level (3–5 yrs)',    salary: '$120k–$150k', status: 'active',       requiredSkills: ['Kubernetes','Terraform','AWS','CI/CD','Linux','Docker'], hiringManager: 'Sarah Kim',    threshold: 68, description: 'Own infrastructure reliability and automation.' },
    { title: 'UX Designer',              department: 'Design',          location: 'Austin, TX',         type: 'Full-time', level: 'Mid Level (3–5 yrs)',    salary: '$100k–$130k', status: 'interviewing', requiredSkills: ['Figma','User Research','Prototyping','Design Systems'], hiringManager: 'James Wilson', threshold: 65, description: 'Shape user experience across all products.' },
    { title: 'Backend Engineer (Go)',    department: 'Engineering',     location: 'Remote',             type: 'Full-time', level: 'Senior Level (5–8 yrs)', salary: '$145k–$175k', status: 'interviewing', requiredSkills: ['Go','gRPC','PostgreSQL','Redis','Kubernetes','AWS'], hiringManager: 'Sarah Kim',    threshold: 72, description: 'Build scalable backend services in Go.' },
    { title: 'Data Analyst',             department: 'Analytics',       location: 'Chicago, IL',        type: 'Full-time', level: 'Mid Level (3–5 yrs)',    salary: '$90k–$115k',  status: 'closed',       requiredSkills: ['SQL','Python','Tableau','dbt','BigQuery'], hiringManager: 'James Wilson', threshold: 65, description: 'Drive data-informed decisions across the business.' },
    { title: 'Technical Recruiter',      department: 'HR',              location: 'Remote',             type: 'Full-time', level: 'Mid Level (3–5 yrs)',    salary: '$80k–$100k',  status: 'archived',     requiredSkills: ['Sourcing','ATS','Boolean Search','Negotiation'], hiringManager: 'Maya Patel',   threshold: 60, description: 'Find and recruit top technical talent.' },
  ]);

  const [j1, j2, j3] = jobs;

  // Seed candidates for job 1 (Frontend)
  const candidates = await Candidate.insertMany([
    { jobId: j1._id, name: 'Arjun Mehta',   email: 'arjun.mehta@example.com',  phone: '+1 (555) 012-3456', location: 'San Francisco, CA', score: 92, experience: 6, skillsMatch: 94, educationMatch: 88, recommendation: 'Strongly Recommend', status: 'shortlisted', skills: ['TypeScript','React','Node.js','GraphQL','AWS'], resumeName: 'arjun-mehta-resume.pdf' },
    { jobId: j1._id, name: 'Sofia Reyes',   email: 'sofia.reyes@example.com',  phone: '+1 (555) 023-4567', location: 'Remote',            score: 88, experience: 5, skillsMatch: 90, educationMatch: 85, recommendation: 'Recommend',          status: 'screening',  skills: ['TypeScript','React','CSS','Testing'],           resumeName: 'sofia_reyes_cv.pdf' },
    { jobId: j1._id, name: "Liam O'Brien",  email: 'liam@example.com',         phone: '+1 (555) 034-5678', location: 'New York, NY',      score: 81, experience: 4, skillsMatch: 82, educationMatch: 79, recommendation: 'Recommend',          status: 'interview',  skills: ['JavaScript','React','Node.js','Docker'],        resumeName: 'liam-obrien-resume.pdf' },
    { jobId: j1._id, name: 'Priya Nair',    email: 'priya.nair@example.com',   phone: '+1 (555) 045-6789', location: 'Austin, TX',        score: 76, experience: 3, skillsMatch: 78, educationMatch: 73, recommendation: 'Consider',           status: 'applied',    skills: ['React','JavaScript','CSS'],                     resumeName: 'PriyaNairResume.pdf' },
    { jobId: j1._id, name: 'David Park',    email: 'david.park@example.com',   phone: '+1 (555) 056-7890', location: 'Remote',            score: 68, experience: 2, skillsMatch: 65, educationMatch: 72, recommendation: 'Consider',           status: 'applied',    skills: ['JavaScript','Vue.js','CSS'],                    resumeName: 'david-park-cv.pdf' },
    { jobId: j2._id, name: 'Emma Zhang',    email: 'emma.zhang@example.com',   phone: '+1 (555) 067-8901', location: 'New York, NY',      score: 95, experience: 8, skillsMatch: 96, educationMatch: 92, recommendation: 'Strongly Recommend', status: 'shortlisted', skills: ['Product Strategy','SQL','Roadmapping','Agile'],  resumeName: 'emma-zhang-resume.pdf' },
    { jobId: j3._id, name: 'Noah Williams', email: 'noah.w@example.com',       phone: '+1 (555) 078-9012', location: 'San Francisco, CA', score: 89, experience: 5, skillsMatch: 91, educationMatch: 87, recommendation: 'Recommend',          status: 'interview',  skills: ['Python','PyTorch','TensorFlow','MLOps'],         resumeName: 'noah-williams-cv.pdf' },
  ]);

  const [c1, c3, c6, c7] = [candidates[0], candidates[2], candidates[5], candidates[6]];

  // Seed interviews
  await Interview.insertMany([
    { candidateId: c1._id,  jobId: j1._id, round: 'L1 Technical',  interviewer: 'Sarah Kim',    date: '2026-06-07', time: '10:00 AM', duration: 60, status: 'scheduled', format: 'Video Call' },
    { candidateId: c3._id,  jobId: j1._id, round: 'L1 Technical',  interviewer: 'Alex Chen',    date: '2026-06-08', time: '02:00 PM', duration: 60, status: 'scheduled', format: 'Video Call' },
    { candidateId: c6._id,  jobId: j2._id, round: 'Manager Round', interviewer: 'James Wilson', date: '2026-06-06', time: '11:00 AM', duration: 45, status: 'scheduled', format: 'In Person' },
    { candidateId: c7._id,  jobId: j3._id, round: 'L2 Technical',  interviewer: 'Priya Gupta',  date: '2026-05-30', time: '03:00 PM', duration: 90, status: 'completed', format: 'Video Call', commScore: 82, techScore: 91, confidenceScore: 78, recommendation: 'Proceed to Manager Round', transcriptSummary: 'Strong ML fundamentals. Excellent system design for ML pipelines. Showed depth in PyTorch and MLOps tooling. Communication was clear and structured. Recommend proceeding.' },
    { candidateId: candidates[1]._id, jobId: j1._id, round: 'HR Round', interviewer: 'Maya Patel', date: '2026-05-28', time: '01:00 PM', duration: 30, status: 'completed', format: 'Video Call', commScore: 88, techScore: 75, confidenceScore: 84, recommendation: 'Recommend Hire', transcriptSummary: 'Excellent communicator. Good culture fit. Technical background solid. High confidence and enthusiasm. Recommend for hire.' },
  ]);

  console.log('✓ Database seeded');
}
