/**
 * Comprehensive reseed — wipes ALL existing Job/Candidate/Interview/Assessment/
 * ActivityLog data and replaces it with a deliberately diverse set of jobs and
 * resumes spanning multiple departments, experience levels, and pipeline shapes
 * (including pipelines that name interview/assessment stages without the literal
 * words "Interview"/"Assessment", to exercise the gate-detection fixes in
 * src/lib/pipeline.ts). Resumes cover strong fits, partial/related-skill-only
 * fits, freshers, and overqualified candidates, plus regex edge cases (MM/YYYY
 * date ranges, labeled phone numbers, "till date" phrasing).
 *
 * Run once:
 *   node --experimental-strip-types src/scripts/seed-comprehensive.ts
 *
 * DESTRUCTIVE: deletes every Job, Candidate, Interview, Assessment, and
 * ActivityLog document before reseeding.
 */

import mongoose from 'mongoose';
import { analyzeResume, jdFingerprint } from '../lib/resumeAnalysis.ts';
import { Job } from '../db/models/Job.ts';
import { Candidate } from '../db/models/Candidate.ts';
import { Interview } from '../db/models/Interview.ts';
import { Assessment } from '../db/models/Assessment.ts';
import { ActivityLog } from '../db/models/ActivityLog.ts';
import { Team } from '../db/models/Team.ts';

const MONGODB_URI = process.env.MONGODB_URI ?? 'mongodb://localhost:27017/hireverse';

// ── Job + resume definitions ────────────────────────────────────────────────

const JOBS = [
  // ── 1. Backend Engineer — Engineering, Mid level ──────────────────────────
  {
    title: 'Backend Engineer (Node.js)',
    department: 'Engineering',
    location: 'Bangalore, India',
    type: 'Full-time',
    level: 'Mid (3-5 yrs)',
    salary: '₹15-22 LPA',
    status: 'active' as const,
    description:
      'We are looking for a Backend Engineer to design and operate the services that power our core product, with a focus on reliability, performance, and clean API design.',
    responsibilities:
      'Design and build REST APIs using Node.js and Express\nModel and optimise MongoDB schemas\nContainerize and deploy services using Docker\nWrite unit and integration tests\nParticipate in on-call rotation and incident response',
    requiredSkills: ['Node.js', 'Express', 'MongoDB', 'REST API', 'JavaScript', 'Docker'],
    niceToHaveSkills: ['TypeScript', 'AWS', 'Kafka', 'Microservices'],
    education: "Bachelor's in Computer Science",
    hiringManager: 'Vivek Sharma',
    threshold: 70,
    pipeline: [
      { key: 'applied',              label: 'Applied',              color: '#6b7280', icon: 'user',     order: 0 },
      { key: 'resume-screen',        label: 'Resume Screen',        color: '#3b82f6', icon: 'circle',   order: 1 },
      { key: 'coding-test',          label: 'Coding Test',          color: '#06b6d4', icon: 'check',    order: 2 },
      { key: 'technical-interview',  label: 'Technical Interview',  color: '#8b5cf6', icon: 'calendar', order: 3 },
      { key: 'hr-round',             label: 'HR Round',             color: '#ec4899', icon: 'star',     order: 4 },
      { key: 'offer',                label: 'Offer',                color: '#f59e0b', icon: 'flag',     order: 5 },
      { key: 'hired',                label: 'Hired',                color: '#10b981', icon: 'award',    order: 6 },
    ],
    resumes: [
      {
        filename: 'rohan_kapoor.txt',
        text: `Rohan Kapoor
Bangalore, India | rohan.kapoor.dev@gmail.com
Mobile No: +91-98450-12345

PROFILE
Backend Engineer with 4+ years of experience building and operating Node.js
services at scale. Strong focus on REST API design, MongoDB data modeling, and
containerized deployments.

PROFESSIONAL EXPERIENCE

Backend Engineer
CloudNest Technologies, Bangalore                            04/2021 - Present
• Designed and built REST APIs using Node.js and Express serving 2M+ requests/day
• Modeled MongoDB schemas and aggregation pipelines for analytics dashboards
• Containerized all services with Docker and deployed to AWS ECS
• Introduced a Kafka-based event pipeline for order processing, cutting latency by 40%
• Wrote unit and integration tests with Jest, raising coverage from 45% to 85%
• Mentored 2 junior engineers and led code reviews

Software Engineer
Webify Solutions, Pune                                       01/2019 - 03/2021
• Built REST APIs using Node.js and Express for an e-commerce platform
• Worked with MongoDB and Mongoose for data persistence
• Used Git for version control and participated in Agile sprints
• Wrote internal tooling in JavaScript to automate deployment checks

EDUCATION

B.Tech - Computer Science and Engineering
Pune Institute of Computer Technology                        2015 - 2019
CGPA: 8.2/10

SKILLS
Node.js, Express, MongoDB, REST API, JavaScript, TypeScript, Docker, AWS, Kafka,
Git, Mongoose, Jest, Microservices, Linux

ACHIEVEMENTS
• Reduced API response times by 40% through query optimization and caching
• Led migration of monolith to microservices architecture, improving deploy frequency 3x
`,
      },
      {
        filename: 'sandeep_iyer.txt',
        text: `Sandeep Iyer
sandeep.iyer1990@gmail.com | Phone: 9845098450
Chennai, India

PROFILE
Backend Developer with 3 years of experience building Java/Spring Boot
applications and REST services for enterprise clients.

WORK EXPERIENCE

Software Engineer
Enterprise Systems Ltd, Chennai                              Jun 2021 - Present
• Developed REST APIs using Spring Boot and Hibernate for HR management system
• Designed MySQL schemas and optimized queries for reporting modules
• Implemented JWT-based authentication and role-based access control
• Wrote unit tests using JUnit; participated in Agile ceremonies

Associate Software Engineer
Enterprise Systems Ltd, Chennai                              Jul 2020 - May 2021
• Maintained Java backend services for payroll processing
• Fixed production bugs and wrote SQL queries for data migrations

EDUCATION

B.E. - Information Technology
Anna University, Chennai                                     2016 - 2020
CGPA: 7.6/10

SKILLS
Java, Spring Boot, Spring, Hibernate, MySQL, REST API, JUnit, Git, Agile, Linux
`,
      },
      {
        filename: 'ananya_verma.txt',
        text: `Ananya Verma
New Delhi, India | ananya.verma.cs@gmail.com | +91-9911223344

PROFILE
Recent Computer Science graduate eager to start a career as a Backend Developer.
Completed coursework and personal projects in JavaScript, Node.js, and databases.

INTERNSHIP EXPERIENCE

Backend Developer Intern
StartupHub Technologies, Noida                               Jan 2024 - Jun 2024
• Assisted in building REST API endpoints using Node.js and Express
• Wrote basic MongoDB queries under senior engineer guidance
• Fixed minor bugs and updated documentation

EDUCATION

B.Tech - Computer Science and Engineering
Guru Gobind Singh Indraprastha University, Delhi             2020 - 2024
CGPA: 7.8/10

PROJECTS
• Library Management System - REST API built with Node.js, Express, and MongoDB
  with CRUD operations for books and members
• Personal Portfolio Website - Built using HTML, CSS, and JavaScript

SKILLS
JavaScript, Node.js, Express, MongoDB, HTML, CSS, Git, REST API (basics)
`,
      },
    ],
  },

  // ── 2. Data Scientist — Data, Senior level ────────────────────────────────
  {
    title: 'Senior Data Scientist',
    department: 'Data Science',
    location: 'Hyderabad, India',
    type: 'Full-time',
    level: 'Senior (5-8 yrs)',
    salary: '₹28-38 LPA',
    status: 'active' as const,
    description:
      'We are seeking a Senior Data Scientist to lead model development for our recommendation and forecasting systems, working closely with engineering and product teams.',
    responsibilities:
      'Design and train machine learning models for recommendations and forecasting\nBuild and maintain data pipelines using Python and SQL\nPresent findings and model performance to stakeholders\nMentor junior data scientists\nCollaborate with engineering on model deployment',
    requiredSkills: ['Python', 'Machine Learning', 'Pandas', 'SQL', 'Data Analysis'],
    niceToHaveSkills: ['TensorFlow', 'Spark', 'Airflow', 'AWS'],
    education: "Master's in Data Science, Statistics, or related field",
    hiringManager: 'Dr. Kavita Rao',
    threshold: 75,
    // Non-literal stage names — exercises findAssessmentGateStage ("Take-Home
    // Assignment") and findInterviewGateStage ("Panel Discussion") matching
    // stages that don't contain the literal words "assessment"/"interview".
    pipeline: [
      { key: 'applied',            label: 'Applied',              color: '#6b7280', icon: 'user',      order: 0 },
      { key: 'resume-screening',   label: 'Resume Screening',     color: '#3b82f6', icon: 'circle',    order: 1 },
      { key: 'take-home',          label: 'Take-Home Assignment', color: '#06b6d4', icon: 'check',     order: 2 },
      { key: 'panel-discussion',   label: 'Panel Discussion',     color: '#8b5cf6', icon: 'calendar',  order: 3 },
      { key: 'offer',              label: 'Offer',                color: '#f59e0b', icon: 'flag',      order: 4 },
      { key: 'hired',              label: 'Hired',                color: '#10b981', icon: 'award',     order: 5 },
    ],
    resumes: [
      {
        filename: 'priya_deshmukh.txt',
        text: `Priya Deshmukh
Hyderabad, India | priya.deshmukh.ds@gmail.com | Contact: +91-9000112233

PROFILE
Data Scientist with 6 years of experience building machine learning models for
recommendation systems and demand forecasting using Python, Pandas, and TensorFlow.

PROFESSIONAL EXPERIENCE

Data Scientist
Retailytics Pvt Ltd, Hyderabad                               Mar 2019 - Present
• Built recommendation models using Python, Pandas, and TensorFlow, increasing
  click-through rate by 18%
• Developed demand forecasting pipelines using SQL and Spark for 200+ stores
• Automated data pipelines using Airflow, reducing manual reporting time by 70%
• Deployed models to production on AWS SageMaker
• Presented model performance and insights to senior leadership monthly

Data Analyst
Insight Analytics, Pune                                      Jul 2017 - Feb 2019
• Performed exploratory data analysis using Python and Pandas on sales data
• Built SQL queries and dashboards for marketing performance tracking
• Created data visualizations using Matplotlib and Seaborn

EDUCATION

M.Sc - Statistics
University of Hyderabad                                      2015 - 2017

B.Sc - Mathematics
Osmania University, Hyderabad                                2012 - 2015

SKILLS
Python, Machine Learning, Pandas, NumPy, SQL, Data Analysis, TensorFlow, Spark,
Airflow, AWS, Scikit-learn, Matplotlib, Data Science

ACHIEVEMENTS
• Increased recommendation click-through rate by 18% through model retraining
• Reduced demand forecasting error (MAPE) from 22% to 11% across 200 stores
`,
      },
      {
        filename: 'arjun_malhotra.txt',
        text: `Arjun Malhotra
arjun.malhotra@gmail.com | Mobile: +91-9876512340
Bangalore, India

PROFILE
Lead Data Scientist with 12 years of experience leading data science teams,
designing ML platforms, and driving data-informed product strategy across
e-commerce and fintech domains.

PROFESSIONAL EXPERIENCE

Lead Data Scientist
FinEdge Analytics, Bangalore                                 Feb 2016 - Present
• Led a team of 8 data scientists building ML models for credit risk scoring
• Designed Python and Spark based feature pipelines processing 50M+ records daily
• Built and maintained ML platform using TensorFlow and Airflow for model training
  and deployment on AWS
• Drove adoption of A/B testing framework across 12 product teams
• Mentored 15+ junior data scientists over tenure

Senior Data Scientist
Quantica Labs, Mumbai                                        Jun 2012 - Jan 2016
• Built machine learning models for fraud detection using Python and Scikit-learn
• Designed SQL-based data warehouse schemas for analytics
• Conducted statistical analysis and presented findings to executive stakeholders

Data Analyst
Quantica Labs, Mumbai                                        Aug 2010 - May 2012
• Performed data analysis using SQL and Excel for operations reporting

EDUCATION

M.Tech - Computer Science (Specialization: Machine Learning)
Indian Institute of Technology, Bombay                       2008 - 2010

B.E. - Computer Engineering
University of Mumbai                                         2004 - 2008

SKILLS
Python, Machine Learning, Pandas, SQL, Data Analysis, TensorFlow, Spark, Airflow,
AWS, Scikit-learn, Data Science, Leadership, A/B Testing, Statistics

ACHIEVEMENTS
• Reduced fraud losses by 35% through new ML-based detection system
• Scaled data science team from 3 to 8 engineers and built internal ML platform
• Drove $4M annual savings through credit risk model improvements
`,
      },
      {
        filename: 'neha_joshi.txt',
        text: `Neha Joshi
neha.joshi.ops@gmail.com | +91-9123456780
Pune, India

PROFILE
Business Analyst with 5 years of experience in data analysis, reporting, and
dashboarding using Excel and SQL, supporting operations and finance teams.

WORK EXPERIENCE

Senior Business Analyst
Meridian Consulting, Pune                                    Aug 2019 - Present
• Built monthly reporting dashboards using Excel and SQL for leadership review
• Performed data analysis on operational metrics across 5 business units
• Automated recurring reports using Excel macros, saving 10 hours/week
• Collaborated with finance team on budget variance analysis

Business Analyst
Meridian Consulting, Pune                                    Jun 2017 - Jul 2019
• Maintained SQL databases and wrote queries for ad-hoc reporting requests
• Created Excel-based financial models for forecasting

EDUCATION

MBA - Finance
Symbiosis Institute of Business Management, Pune            2015 - 2017

B.Com
University of Pune                                           2012 - 2015

SKILLS
Excel, SQL, Data Analysis, Financial Analysis, MS Office, Power BI, Reporting
`,
      },
    ],
  },

  // ── 3. DevOps Engineer — Engineering, Senior/Lead level ───────────────────
  {
    title: 'Senior DevOps Engineer',
    department: 'Infrastructure',
    location: 'Remote (India)',
    type: 'Full-time',
    level: 'Senior (6-10 yrs)',
    salary: '₹30-42 LPA',
    status: 'active' as const,
    description:
      'We are hiring a Senior DevOps Engineer to own our cloud infrastructure, CI/CD pipelines, and observability stack across multiple environments.',
    responsibilities:
      'Design and maintain Kubernetes-based infrastructure on AWS\nBuild and improve CI/CD pipelines\nManage infrastructure as code using Terraform\nSet up monitoring and alerting using Prometheus and Grafana\nLead incident response and post-mortems',
    requiredSkills: ['Docker', 'Kubernetes', 'Terraform', 'CI/CD', 'AWS', 'Linux'],
    niceToHaveSkills: ['Kafka', 'Prometheus', 'Ansible', 'Python'],
    education: "Bachelor's in Computer Science or related field",
    hiringManager: 'Aditya Rao',
    threshold: 75,
    // Two interview-type stages back to back ("Tech Round 1" / "Tech Round 2")
    // — exercises the per-stage scoped analyzed-interview check.
    pipeline: [
      { key: 'applied',         label: 'Applied',         color: '#6b7280', icon: 'user',      order: 0 },
      { key: 'screening',       label: 'Screening',       color: '#3b82f6', icon: 'circle',    order: 1 },
      { key: 'tech-round-1',    label: 'Tech Round 1',    color: '#8b5cf6', icon: 'calendar',  order: 2 },
      { key: 'tech-round-2',    label: 'Tech Round 2',    color: '#06b6d4', icon: 'briefcase', order: 3 },
      { key: 'hr-discussion',   label: 'HR Discussion',   color: '#ec4899', icon: 'star',      order: 4 },
      { key: 'offer',           label: 'Offer',           color: '#f59e0b', icon: 'flag',      order: 5 },
      { key: 'hired',           label: 'Hired',           color: '#10b981', icon: 'award',     order: 6 },
    ],
    resumes: [
      {
        filename: 'karan_thakur.txt',
        text: `Karan Thakur
karan.thakur.devops@gmail.com | WhatsApp: +91-9988001122
Remote (Gurgaon, India)

PROFILE
DevOps Engineer with 7 years of experience designing cloud infrastructure,
Kubernetes platforms, and CI/CD pipelines for high-traffic applications.

PROFESSIONAL EXPERIENCE

Senior DevOps Engineer
NimbusCloud Technologies, Gurgaon                            05/2020 - Present
• Designed and operated Kubernetes clusters on AWS EKS running 80+ microservices
• Built CI/CD pipelines using Jenkins and GitHub Actions, cutting deploy time by 60%
• Wrote Terraform modules to provision infrastructure as code across 3 environments
• Set up monitoring and alerting using Prometheus and Grafana
• Automated configuration management using Ansible across 200+ servers
• Led incident response for production outages, reducing MTTR by 45%

DevOps Engineer
Skyline Systems, Gurgaon                                     06/2017 - 04/2020
• Managed Docker-based deployments on AWS EC2
• Wrote Bash scripts for automation and log management on Linux servers
• Maintained CI pipelines using Jenkins

EDUCATION

B.Tech - Information Technology
Maharshi Dayanand University, Rohtak                         2013 - 2017

SKILLS
Docker, Kubernetes, Terraform, CI/CD, AWS, Linux, Jenkins, GitHub Actions,
Ansible, Prometheus, Grafana, Python, Bash, Helm, Kafka

ACHIEVEMENTS
• Reduced infrastructure costs by 30% through autoscaling and rightsizing on AWS
• Cut deployment time from 45 minutes to 8 minutes via CI/CD pipeline overhaul
`,
      },
      {
        filename: 'manoj_pillai.txt',
        text: `Manoj Pillai
manoj.pillai.it@gmail.com | Phone Number: 9876054321
Kochi, India

PROFILE
Linux Systems Administrator with 5 years of experience managing on-premise and
cloud servers, with growing exposure to automation and AWS.

WORK EXPERIENCE

Systems Administrator
Coastal IT Services, Kochi                                   Mar 2019 - Present
• Managed Linux servers (CentOS, Ubuntu) for internal applications
• Wrote Bash and Ansible scripts for routine server configuration tasks
• Migrated several workloads to AWS EC2 and configured S3 storage
• Set up basic monitoring using Nagios

Junior Systems Administrator
Coastal IT Services, Kochi                                   Jan 2017 - Feb 2019
• Provided helpdesk and server support for Linux-based infrastructure
• Performed routine backups and patching

EDUCATION

B.Sc - Computer Science
Cochin University of Science and Technology                 2013 - 2016

SKILLS
Linux, Bash, AWS, Ansible, Networking, Shell Scripting, Nagios, EC2, S3
`,
      },
    ],
  },

  // ── 4. Sales Executive — Sales, Junior/Fresher level ──────────────────────
  {
    title: 'Sales Executive',
    department: 'Sales',
    location: 'Mumbai, India',
    type: 'Full-time',
    level: 'Junior (0-2 yrs)',
    salary: '₹4-7 LPA',
    status: 'active' as const,
    description:
      'We are looking for a motivated Sales Executive to generate leads, manage client relationships, and close deals for our growing B2B sales team.',
    responsibilities:
      'Generate and qualify new leads through cold calling and outreach\nManage and update CRM records\nConduct product demos and sales pitches\nMeet monthly sales targets\nBuild long-term relationships with clients',
    requiredSkills: ['CRM', 'Lead Generation', 'Communication', 'Sales', 'Cold Calling'],
    niceToHaveSkills: ['Salesforce', 'Negotiation', 'Digital Marketing'],
    education: "Bachelor's degree (any discipline)",
    hiringManager: 'Sunita Rao',
    threshold: 60,
    pipeline: [
      { key: 'applied',          label: 'Applied',           color: '#6b7280', icon: 'user',     order: 0 },
      { key: 'hr-screening',     label: 'HR Screening',      color: '#3b82f6', icon: 'circle',   order: 1 },
      { key: 'sales-pitch-round',label: 'Sales Pitch Round', color: '#8b5cf6', icon: 'calendar', order: 2 },
      { key: 'offer',            label: 'Offer',             color: '#f59e0b', icon: 'flag',     order: 3 },
      { key: 'hired',            label: 'Hired',             color: '#10b981', icon: 'award',    order: 4 },
    ],
    resumes: [
      {
        filename: 'rahul_bansal.txt',
        text: `Rahul Bansal
Mumbai, India | rahul.bansal.sales@gmail.com
Mobile: +91-9820012345

PROFILE
Sales professional with 2 years of experience in B2B lead generation, CRM
management, and client relationship building, consistently exceeding monthly
sales targets.

WORK EXPERIENCE

Sales Executive
BrightEdge Solutions, Mumbai                                 Feb 2022 - Present
• Generated 150+ qualified leads per month through cold calling and email outreach
• Managed client records and pipelines using Salesforce CRM
• Conducted product demos for prospective clients, achieving 25% conversion rate
• Consistently exceeded monthly sales targets by 15-20%
• Negotiated contract terms with enterprise clients

Sales Associate (Internship)
Quickmart Retail, Mumbai                                     Jun 2021 - Jan 2022
• Assisted in lead generation and customer follow-ups
• Updated CRM records and prepared sales reports

EDUCATION

B.Com
University of Mumbai                                         2018 - 2021

SKILLS
CRM, Salesforce, Lead Generation, Communication, Sales, Cold Calling, Negotiation,
Client Relationship Management, MS Office

ACHIEVEMENTS
• Exceeded quarterly sales target by 20% for three consecutive quarters
• Recognized as "Top Performer" Q3 2023 for highest lead conversion rate
`,
      },
      {
        filename: 'simran_kaur.txt',
        text: `Simran Kaur
simran.kaur1999@gmail.com | +91-9090909090
Chandigarh, India

PROFILE
Recent graduate with strong communication skills, seeking an entry-level Sales
Executive role. Completed a sales internship and college projects involving
customer outreach.

INTERNSHIP EXPERIENCE

Sales Intern
Campus Connect Pvt Ltd, Chandigarh                           Jan 2024 - May 2024
• Assisted senior sales team with lead follow-ups and data entry
• Participated in cold calling campaigns for student outreach programs
• Helped prepare presentation decks for client meetings

EDUCATION

BBA - Marketing
Panjab University, Chandigarh                                2021 - 2024

SKILLS
Communication, MS Office, Cold Calling (basics), Customer Service, Teamwork
`,
      },
    ],
  },

  // ── 5. UI/UX Designer — Design, Mid level ─────────────────────────────────
  {
    title: 'UI/UX Designer',
    department: 'Design',
    location: 'Pune, India',
    type: 'Full-time',
    level: 'Mid (2-4 yrs)',
    salary: '₹10-16 LPA',
    status: 'active' as const,
    description:
      'We are looking for a UI/UX Designer to craft intuitive, user-centered experiences for our web and mobile products, working closely with product and engineering teams.',
    responsibilities:
      'Design wireframes, prototypes, and high-fidelity mockups using Figma\nConduct user research and usability testing\nMaintain and evolve our design system\nCollaborate with engineers on implementation handoff\nPresent design rationale to stakeholders',
    requiredSkills: ['Figma', 'UI/UX Design', 'Wireframing', 'Prototyping', 'User Research'],
    niceToHaveSkills: ['Adobe XD', 'Sketch', 'Design Systems'],
    education: "Bachelor's in Design or related field",
    hiringManager: 'Meera Iyer',
    threshold: 65,
    // "UX Assessment" matches isAssessmentStage (\bassessment\b); "Stakeholder
    // Interview" matches isInterviewStage (\binterview\b); "Portfolio Review"
    // matches neither — exercises non-gated stages alongside gated ones.
    pipeline: [
      { key: 'applied',                label: 'Applied',                color: '#6b7280', icon: 'user',      order: 0 },
      { key: 'resume-screen',          label: 'Resume Screen',          color: '#3b82f6', icon: 'circle',    order: 1 },
      { key: 'ux-assessment',          label: 'UX Assessment',          color: '#06b6d4', icon: 'check',     order: 2 },
      { key: 'portfolio-review',       label: 'Portfolio Review',       color: '#ec4899', icon: 'star',      order: 3 },
      { key: 'stakeholder-interview',  label: 'Stakeholder Interview',  color: '#8b5cf6', icon: 'calendar',  order: 4 },
      { key: 'offer',                  label: 'Offer',                  color: '#f59e0b', icon: 'flag',      order: 5 },
      { key: 'hired',                  label: 'Hired',                  color: '#10b981', icon: 'award',     order: 6 },
    ],
    resumes: [
      {
        filename: 'tanvi_shah.txt',
        text: `Tanvi Shah
Pune, India | tanvi.shah.design@gmail.com | Cell: +91-9765432109

PROFILE
UI/UX Designer with 3 years of experience designing web and mobile interfaces,
conducting user research, and building scalable design systems using Figma.

WORK EXPERIENCE

UI/UX Designer
Pixelworks Studio, Pune                                      Jul 2021 - Present
• Designed wireframes, prototypes, and high-fidelity mockups in Figma for 10+ products
• Conducted user research and usability testing with 50+ participants
• Built and maintained a company-wide design system in Figma
• Collaborated with engineers during implementation handoff using Figma dev mode
• Presented design rationale to stakeholders in weekly design reviews

Junior UI Designer
Creativa Designs, Pune                                       Jun 2020 - Jun 2021
• Created UI mockups and icons using Figma and Adobe XD
• Assisted senior designers with wireframing for client projects

EDUCATION

B.Des - Communication Design
Symbiosis Institute of Design, Pune                          2016 - 2020

SKILLS
Figma, UI/UX Design, Wireframing, Prototyping, User Research, Adobe XD, Design
Systems, Sketch, Usability Testing

ACHIEVEMENTS
• Redesigned onboarding flow, increasing activation rate by 22%
• Built design system adopted across 4 product teams
`,
      },
      {
        filename: 'devika_nair.txt',
        text: `Devika Nair
devika.nair.creative@gmail.com | +91-9988776611
Kochi, India

PROFILE
Graphic Designer with 3 years of experience creating visual assets and marketing
designs using Adobe Photoshop and Sketch, looking to transition into UI/UX design.

WORK EXPERIENCE

Graphic Designer
AdVantage Creative Agency, Kochi                             Apr 2021 - Present
• Designed marketing creatives and social media assets using Adobe Photoshop
• Created app screen mockups using Sketch for client pitches
• Collaborated with marketing team on brand guidelines

EDUCATION

Diploma in Graphic Design
Kochi Institute of Visual Arts                               2018 - 2020

SKILLS
Photoshop, Sketch, Graphic Design, Adobe Illustrator, Branding
`,
      },
    ],
  },

  // ── 6. HR Manager — Human Resources, Manager level ────────────────────────
  {
    title: 'HR Manager',
    department: 'Human Resources',
    location: 'Gurgaon, India',
    type: 'Full-time',
    level: 'Manager (8-12 yrs)',
    salary: '₹22-30 LPA',
    status: 'active' as const,
    description:
      'We are seeking an experienced HR Manager to lead recruitment, onboarding, and employee relations functions for our growing organization.',
    responsibilities:
      'Lead end-to-end recruitment for all departments\nManage HRMS and payroll processes\nDesign and run onboarding programs\nHandle employee relations and grievance resolution\nPartner with leadership on talent strategy',
    requiredSkills: ['Recruitment', 'HRMS', 'Payroll', 'Onboarding', 'Employee Relations'],
    niceToHaveSkills: ['Talent Acquisition', 'Performance Management', 'Labor Law'],
    education: "MBA in Human Resources or related field",
    hiringManager: 'Anil Kapoor',
    threshold: 70,
    pipeline: [
      { key: 'applied',                label: 'Applied',                color: '#6b7280', icon: 'user',     order: 0 },
      { key: 'screening',              label: 'Screening',              color: '#3b82f6', icon: 'circle',   order: 1 },
      { key: 'hr-round',               label: 'HR Round',               color: '#06b6d4', icon: 'check',    order: 2 },
      { key: 'leadership-interview',   label: 'Leadership Interview',   color: '#8b5cf6', icon: 'calendar', order: 3 },
      { key: 'offer',                  label: 'Offer',                  color: '#f59e0b', icon: 'flag',     order: 4 },
      { key: 'hired',                  label: 'Hired',                  color: '#10b981', icon: 'award',    order: 5 },
    ],
    resumes: [
      {
        filename: 'shalini_mehra.txt',
        text: `Shalini Mehra
Gurgaon, India | shalini.mehra.hr@gmail.com | Tel: +91-9871123456

PROFILE
HR professional with 9 years of experience leading recruitment, onboarding, and
payroll operations for mid-to-large organizations.

WORK EXPERIENCE

HR Manager
Vertex Industries, Gurgaon                                   Aug 2018 - Present
• Led end-to-end recruitment for 5 departments, hiring 120+ employees annually
• Managed HRMS implementation and payroll processing for 800+ employees
• Designed and ran onboarding programs, improving new-hire retention by 18%
• Handled employee relations cases and grievance resolution
• Partnered with leadership on workforce planning and talent strategy

HR Executive
Vertex Industries, Gurgaon                                   Jun 2015 - Jul 2018
• Coordinated recruitment drives and screened candidate resumes
• Maintained HRMS records and processed monthly payroll
• Assisted with onboarding and induction programs for new joiners

EDUCATION

MBA - Human Resources
Indian Institute of Management, Lucknow                      2013 - 2015

B.A. - Psychology
Delhi University                                             2010 - 2013

SKILLS
Recruitment, HRMS, Payroll, Onboarding, Employee Relations, Talent Acquisition,
Performance Management, MS Office, Labor Law

ACHIEVEMENTS
• Reduced average time-to-hire from 45 days to 28 days
• Improved new-hire retention by 18% through revamped onboarding program
`,
      },
      {
        filename: 'vikram_oberoi.txt',
        text: `Vikram Oberoi
vikram.oberoi.hr@gmail.com | +91-9090112233
New Delhi, India

PROFILE
Senior HR leader with 14 years of experience across recruitment, HR operations,
and organizational development, having led HR functions for 1000+ employee
organizations.

PROFESSIONAL EXPERIENCE

Director - Human Resources
Sterling Group, New Delhi                                    Jan 2014 - Present
• Led HR strategy and operations for an organization of 1,200+ employees
• Oversaw recruitment, payroll, HRMS, and employee relations functions
• Designed leadership development and performance management programs
• Managed labor law compliance across 6 state offices
• Built and led an HR team of 12 across recruitment, payroll, and L&D

HR Manager
Crestline Corp, New Delhi                                    Mar 2010 - Dec 2013
• Managed end-to-end recruitment and onboarding for corporate functions
• Oversaw HRMS and payroll operations for 500+ employees

EDUCATION

MBA - Human Resources
Faculty of Management Studies, Delhi University              2008 - 2010

B.Com (Hons)
Shri Ram College of Commerce, Delhi University               2005 - 2008

SKILLS
Recruitment, HRMS, Payroll, Onboarding, Employee Relations, Talent Acquisition,
Performance Management, Labor Law, Leadership, Organizational Development

ACHIEVEMENTS
• Scaled HR function to support growth from 400 to 1,200 employees
• Reduced employee attrition from 22% to 13% through retention initiatives
`,
      },
    ],
  },
];

// ── Helpers ──────────────────────────────────────────────────────────────────

async function createCandidate(jobDoc: any, resumeDef: { filename: string; text: string }) {
  const analysis = analyzeResume(resumeDef.text, resumeDef.filename, {
    requiredSkills: jobDoc.requiredSkills,
    niceToHaveSkills: jobDoc.niceToHaveSkills,
    education: jobDoc.education,
    level: jobDoc.level,
  });

  const firstStage = [...jobDoc.pipeline].sort((a: any, b: any) => a.order - b.order)[0];
  const jdHash = jdFingerprint(jobDoc);
  const base64 = Buffer.from(resumeDef.text).toString('base64');

  await Candidate.create({
    jobId: jobDoc._id,
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
    stageHistory: [{
      stageKey: firstStage.key,
      stageLabel: firstStage.label,
      fromStageKey: '',
      fromStageLabel: '',
      movedBy: 'Seed Script',
      movedAt: new Date(),
      notes: 'Auto-created by comprehensive seed script',
    }],
    skills: analysis.skills,
    practicalSkills: analysis.practicalSkills,
    achievements: analysis.achievements,
    skillGaps: analysis.skillGaps,
    resumeName: resumeDef.filename,
    resumeType: 'text/plain',
    resumeBase64: base64,
    appliedJdHash: jdHash,
  });

  console.log(
    `    Created: ${analysis.name} — score ${analysis.score}, exp ${analysis.experience}y, ` +
    `phone "${analysis.phone}", loc "${analysis.location}" [${analysis.locationConfidence}]`
  );
}

// Every job's `hiringManager` is a free-text name shown on the job details
// page, but the Teams page (and the hiring-manager dropdown on job
// create/edit forms) is sourced from the Team collection — so any name used
// as a job's hiringManager needs a matching Team document with role
// 'Hiring Manager', or it shows up on the job but is absent from Teams.
// Additive and idempotent: only inserts managers that don't already exist by
// name, never touches/wipes the Team collection otherwise.
async function ensureHiringManagers() {
  const seen = new Set<string>();
  for (const def of JOBS) {
    const name = (def as any).hiringManager as string | undefined;
    if (!name || seen.has(name)) continue;
    seen.add(name);
    const existing = await Team.findOne({ name }).lean();
    if (existing) continue;
    const email = `${name.toLowerCase().replace(/[^a-z\s]/g, '').trim().replace(/\s+/g, '.')}@hireverse.com`;
    await Team.create({
      name,
      email,
      role: 'Hiring Manager',
      department: def.department,
      status: 'active',
    });
    console.log(`Created Team member: "${name}" (Hiring Manager, ${def.department})`);
  }
}

// ── Main ─────────────────────────────────────────────────────────────────────

async function main() {
  console.log('Connecting to MongoDB…');
  await mongoose.connect(MONGODB_URI);
  console.log('Connected.\n');

  console.log('Wiping existing data…');
  const [jobsDeleted, candidatesDeleted, interviewsDeleted, assessmentsDeleted, activityDeleted] = await Promise.all([
    Job.deleteMany({}),
    Candidate.deleteMany({}),
    Interview.deleteMany({}),
    Assessment.deleteMany({}),
    ActivityLog.deleteMany({}),
  ]);
  console.log(
    `  Removed ${jobsDeleted.deletedCount} jobs, ${candidatesDeleted.deletedCount} candidates, ` +
    `${interviewsDeleted.deletedCount} interviews, ${assessmentsDeleted.deletedCount} assessments, ` +
    `${activityDeleted.deletedCount} activity log entries.\n`
  );

  console.log('Ensuring hiring managers exist in Team…');
  await ensureHiringManagers();
  console.log();

  for (const def of JOBS) {
    const { resumes, ...jobFields } = def;
    const jobDoc = await Job.create(jobFields);
    console.log(`Created job: "${jobFields.title}" (${jobFields.department}, ${jobFields.level})`);

    for (const resumeDef of resumes) {
      await createCandidate(jobDoc, resumeDef);
    }
    console.log();
  }

  await mongoose.disconnect();
  console.log('Done. Comprehensive reseed complete.');
}

main().catch(err => { console.error(err); process.exit(1); });
