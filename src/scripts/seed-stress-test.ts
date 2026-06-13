/**
 * Adversarial stress-test reseed — wipes ALL existing data (Job, Candidate,
 * Interview, Assessment, ActivityLog, Team, LearningSignal, SkillIntelligence)
 * and replaces it with 12 deliberately diverse/adversarial jobs and ~8-10
 * resumes each, engineered to probe specific edge cases in resumeAnalysis.ts,
 * assessmentAnalysis.ts, interviewAnalysis.ts, pipeline.ts gate logic,
 * scheduling.ts, and the adaptive-intelligence layer (learningEngine.ts).
 *
 * Run once:
 *   node --experimental-strip-types src/scripts/seed-stress-test.ts
 *
 * DESTRUCTIVE: deletes every Job, Candidate, Interview, Assessment,
 * ActivityLog, Team, LearningSignal, and SkillIntelligence document.
 */

import mongoose from 'mongoose';
import { analyzeResume, jdFingerprint } from '../lib/resumeAnalysis.ts';
import { Job } from '../db/models/Job.ts';
import { Candidate } from '../db/models/Candidate.ts';
import { Interview } from '../db/models/Interview.ts';
import { Assessment } from '../db/models/Assessment.ts';
import { ActivityLog } from '../db/models/ActivityLog.ts';
import { Team } from '../db/models/Team.ts';
import { LearningSignal } from '../db/models/LearningSignal.ts';
import { SkillIntelligence } from '../db/models/SkillIntelligence.ts';

const MONGODB_URI = process.env.MONGODB_URI ?? 'mongodb://localhost:27017/hireverse';

// ── Job + resume definitions ────────────────────────────────────────────────

const JOBS: any[] = [
  // ── 1. Backend Engineer (Node.js) — Mid, default pipeline, Kubernetes learned-alias target ──
  {
    title: 'Backend Engineer (Node.js)',
    department: 'Engineering',
    location: 'Bangalore, India',
    type: 'Full-time',
    level: 'Mid (3-6 yrs)',
    salary: '₹15-24 LPA',
    status: 'active' as const,
    description: 'Design and operate the Node.js services that power our core product, with a focus on reliability and clean API design.',
    responsibilities: 'Design and build REST APIs using Node.js and Express\nModel MongoDB schemas\nOperate services on Kubernetes\nWrite unit and integration tests',
    requiredSkills: ['Node.js', 'Express', 'MongoDB', 'REST API', 'JavaScript', 'Kubernetes'],
    niceToHaveSkills: ['TypeScript', 'AWS', 'Redis'],
    education: "Bachelor's in Computer Science",
    hiringManager: 'Vivek Sharma',
    threshold: 70,
    autoRank: true,
    aiSummary: true,
    biasCheck: false,
    pipeline: [
      { key: 'applied',             label: 'Applied',             color: '#6b7280', icon: 'user',     order: 0 },
      { key: 'resume-screen',       label: 'Resume Screen',       color: '#3b82f6', icon: 'circle',   order: 1 },
      { key: 'coding-test',         label: 'Coding Test',         color: '#06b6d4', icon: 'check',    order: 2 },
      { key: 'technical-interview', label: 'Technical Interview', color: '#8b5cf6', icon: 'calendar', order: 3 },
      { key: 'hr-round',            label: 'HR Round',            color: '#ec4899', icon: 'star',     order: 4 },
      { key: 'offer',               label: 'Offer',               color: '#f59e0b', icon: 'flag',     order: 5 },
      { key: 'hired',               label: 'Hired',               color: '#10b981', icon: 'award',    order: 6 },
    ],
    resumes: [
      {
        // Strong practical match; "container orchestration" phrase (Kubernetes
        // learned-alias seed #1) — avoids "docker"/"containerization"/"kubernetes"
        // so the Kubernetes gap stays "missing" for the skill-correction flow.
        filename: 'rohan_kapoor.txt',
        text: `Rohan Kapoor
Bangalore, India | rohan.kapoor.dev@gmail.com
Mobile No: +91-98450-12345

PROFILE
Backend Engineer with 4 years of experience building Node.js services.

EXPERIENCE
Backend Engineer, CloudNest Technologies, Bangalore        04/2021 - Present
- Designed and built REST APIs using Node.js and Express serving 2M+ requests/day
- Modeled MongoDB schemas and aggregation pipelines for analytics dashboards
- Led container orchestration efforts for a fleet of 40 microservices, improving rollout reliability
- Wrote unit and integration tests in JavaScript, raising coverage from 45% to 85%

Software Engineer, Webify Solutions, Pune                  01/2019 - 03/2021
- Built REST APIs using Node.js and Express for an e-commerce platform
- Worked with MongoDB for data persistence

EDUCATION
B.Tech - Computer Science and Engineering
Pune Institute of Computer Technology                      2015 - 2019

SKILLS
Node.js, Express, MongoDB, REST API, JavaScript, Git, Mongoose, Linux
`,
      },
      {
        // Strong practical match; "container orchestration" phrase (Kubernetes
        // learned-alias seed #2) — second independent candidate using the same
        // evidence phrase for the same skill, so two corrections promote the alias.
        filename: 'sneha_iyer.txt',
        text: `Sneha Iyer
Hyderabad, India | sneha.iyer.eng@gmail.com
Mobile No: +91-99001-44556

PROFILE
Backend Engineer with 5 years of experience in Node.js and MongoDB.

EXPERIENCE
Senior Backend Engineer, Quantal Systems, Hyderabad        06/2020 - Present
- Built and maintained REST APIs using Node.js and Express for a payments platform
- Designed MongoDB schemas for transaction history with strict consistency needs
- Owned container orchestration for the platform's 25-service backend, cutting deploy time by half
- Wrote JavaScript automation scripts for release pipelines

Backend Developer, Innomatics, Hyderabad                   07/2018 - 05/2020
- Developed REST API endpoints using Node.js and Express
- Used MongoDB and Mongoose for application data

EDUCATION
B.E. - Information Technology
Osmania University                                          2014 - 2018

SKILLS
Node.js, Express, MongoDB, REST API, JavaScript, Mongoose, Git
`,
      },
      {
        // Listed-only skills: "MongoDB" and "REST API" appear only in the Skills
        // block, never used in a working sentence — tests hasPracticalEvidence
        // boundary (listed = 65, not practical = 100).
        filename: 'arjun_mehta.txt',
        text: `Arjun Mehta
Pune, India | arjun.mehta1990@gmail.com
Mobile No: +91-98220-77889

PROFILE
Backend developer with 3 years of experience.

EXPERIENCE
Backend Developer, Trione Labs, Pune                        03/2021 - Present
- Wrote server-side code in JavaScript and Node.js for internal tools
- Used Express to set up routing for an admin dashboard
- Collaborated with frontend team on API contracts

Junior Developer, Codeworks, Pune                           06/2020 - 02/2021
- Assisted senior developers with bug fixes in Node.js codebase

EDUCATION
B.Sc - Computer Science
Savitribai Phule Pune University                            2017 - 2020

SKILLS
Node.js, Express, MongoDB, REST API, JavaScript, Kubernetes, Git, HTML, CSS
`,
      },
      {
        // Fuzzy/typo skill spelling "Kubernates" (edit distance 1 from
        // "Kubernetes") — tests levenshteinAtMost1 fuzzy matching.
        filename: 'farah_khan.txt',
        text: `Farah Khan
Mumbai, India | farah.khan.dev@gmail.com
Mobile No: +91-98765-11223

PROFILE
Backend Engineer with 4 years of experience in Node.js microservices.

EXPERIENCE
Backend Engineer, Veltrix Software, Mumbai                  02/2021 - Present
- Built REST APIs with Node.js and Express for a logistics platform
- Designed MongoDB schemas for shipment tracking
- Deployed and scaled services on Kubernates clusters, managing rolling updates
- Wrote integration tests in JavaScript using Mocha

EDUCATION
B.Tech - Computer Engineering
Mumbai University                                           2015 - 2019

SKILLS
Node.js, Express, MongoDB, REST API, JavaScript, Kubernates, Mocha, Git
`,
      },
      {
        // Overqualified: 16 years of experience for a Mid (3-6 yrs) role —
        // tests scoreExperience's ">range.max + 2" branch (caps at 88, not 95).
        filename: 'sunil_rao.txt',
        text: `Sunil Rao
Chennai, India | sunil.rao.tech@gmail.com
Mobile No: +91-94440-99887

PROFILE
Backend Engineer with 16 years of experience across Node.js, Java, and MongoDB platforms.

EXPERIENCE
Principal Engineer, Aravalli Systems, Chennai               05/2014 - Present
- Architected REST APIs using Node.js and Express for enterprise clients
- Led MongoDB cluster design and sharding strategy for multi-tenant SaaS
- Directed container orchestration strategy across the engineering org
- Mentored 10+ engineers and ran architecture reviews

Senior Software Engineer, Brightcove India, Chennai        04/2008 - 04/2014
- Built JavaScript-based REST services and MongoDB-backed APIs

EDUCATION
B.E. - Computer Science
Anna University                                             2004 - 2008

SKILLS
Node.js, Express, MongoDB, REST API, JavaScript, Java, Git, Linux
`,
      },
      {
        // Fresher / internship-only: zero professional experience, no date
        // ranges with employer history — tests the low end of scoreExperience
        // and experience-extraction with internship-only timeline.
        filename: 'priyanka_das.txt',
        text: `Priyanka Das
Kolkata, India | priyanka.das.cs@gmail.com
Mobile No: +91-90021-33445

PROFILE
Recent Computer Science graduate, eager to start a career in backend development.

EXPERIENCE
Summer Intern, Webnest Technologies, Kolkata               06/2024 - 08/2024
- Built small REST API endpoints using Node.js and Express as part of a training project
- Wrote basic MongoDB queries for a sample inventory app

EDUCATION
B.Tech - Computer Science and Engineering
Jadavpur University                                         2020 - 2024

SKILLS
Node.js, Express, MongoDB, REST API, JavaScript, Git, HTML, CSS

ACHIEVEMENTS
- Winner, college-level hackathon for a campus-event booking app
`,
      },
      {
        // Markdown format: '#'/'**'/'-' markup — format-diversity coverage,
        // strong practical match.
        filename: 'kabir_singh.md',
        text: `# Kabir Singh

Delhi, India | kabir.singh.dev@gmail.com | Mobile No: +91-98110-22334

## Profile
**Backend Engineer** with **5 years** of experience building Node.js services.

## Experience

**Backend Engineer**, Northstar Cloud, Delhi — *03/2020 - Present*
- Built REST APIs using **Node.js** and **Express** for a fintech product
- Modeled **MongoDB** collections for ledger and audit-trail data
- Used **JavaScript** across backend services and internal CLIs

**Software Engineer**, Datazen, Gurgaon — *01/2018 - 02/2020*
- Built REST endpoints with Node.js and Express

## Education
**B.Tech - Computer Science**, Delhi Technological University, 2014 - 2018

## Skills
Node.js, Express, MongoDB, REST API, JavaScript, Git, Postman
`,
      },
      {
        // ALL-CAPS template — format-diversity coverage.
        filename: 'meena_pillai.txt',
        text: `MEENA PILLAI
COCHIN, INDIA | MEENA.PILLAI.DEV@GMAIL.COM
MOBILE NO: +91-94470-55667

PROFILE
BACKEND ENGINEER WITH 4 YEARS OF EXPERIENCE IN NODE.JS AND MONGODB.

EXPERIENCE
BACKEND ENGINEER, MARINA SOFT, COCHIN                       07/2021 - PRESENT
- BUILT REST APIS USING NODE.JS AND EXPRESS FOR A BOOKING PLATFORM
- DESIGNED MONGODB SCHEMAS FOR RESERVATION DATA
- WROTE JAVASCRIPT UTILITIES FOR DATA MIGRATION

SOFTWARE ENGINEER, KERON TECH, COCHIN                       06/2019 - 06/2021
- DEVELOPED REST API FEATURES USING NODE.JS AND EXPRESS

EDUCATION
B.TECH - COMPUTER SCIENCE
COCHIN UNIVERSITY OF SCIENCE AND TECHNOLOGY                 2015 - 2019

SKILLS
NODE.JS, EXPRESS, MONGODB, REST API, JAVASCRIPT, GIT, LINUX
`,
      },
      {
        // Pipe-delimited contact line + "Remote (City, Country)" location +
        // employment GAP (two non-contiguous ranges) — gap should be excluded
        // from total experience.
        filename: 'tariq_ahmed.txt',
        text: `Tariq Ahmed
Remote (Lahore, Pakistan) | tariq.ahmed.dev@gmail.com | +92-300-1234567

PROFILE
Backend developer with experience in Node.js and MongoDB-based APIs.

EXPERIENCE
Backend Developer, Nexova Systems (Remote)                  01/2023 - Present
- Built REST APIs using Node.js and Express for a subscription billing system
- Worked with MongoDB for storing billing records
- Wrote JavaScript validation logic for payment forms

(Career break for family relocation: 07/2021 - 12/2022)

Backend Developer, Pixova Labs, Lahore                      02/2019 - 06/2021
- Built REST API services with Node.js and Express
- Used MongoDB for product catalog storage

EDUCATION
BS - Computer Science
University of the Punjab                                    2015 - 2019

SKILLS
Node.js, Express, MongoDB, REST API, JavaScript, Git
`,
      },
    ],
  },

  // ── 2. Frontend Engineer (React) — Junior/fresher, custom pipeline with
  // "Take Home Project" (assessment) then "Tech Screen" (interview, non-literal name) ──
  {
    title: 'Frontend Engineer (React)',
    department: 'Engineering',
    location: 'Remote',
    type: 'Full-time',
    level: '(0-2 yrs)',
    salary: '₹6-10 LPA',
    status: 'active' as const,
    description: 'Build user-facing features for our React-based web app. Great first role for early-career frontend engineers.',
    responsibilities: 'Build UI components in React\nWrite semantic HTML and CSS\nManage application state with Redux\nWrite JavaScript for client-side logic',
    requiredSkills: ['React', 'JavaScript', 'HTML', 'CSS', 'Redux'],
    niceToHaveSkills: ['TypeScript', 'Next.js', 'Tailwind CSS'],
    education: "Bachelor's degree",
    hiringManager: 'Anita Desai',
    threshold: 60,
    autoRank: true,
    aiSummary: true,
    biasCheck: false,
    pipeline: [
      { key: 'applied',             label: 'Applied',             color: '#6b7280', icon: 'user',     order: 0 },
      { key: 'resume-screen',       label: 'Resume Screen',       color: '#3b82f6', icon: 'circle',   order: 1 },
      { key: 'take-home-project',   label: 'Take Home Project',   color: '#06b6d4', icon: 'check',    order: 2 },
      { key: 'tech-screen',         label: 'Tech Screen',         color: '#8b5cf6', icon: 'calendar', order: 3 },
      { key: 'hr-round',            label: 'HR Round',            color: '#ec4899', icon: 'star',     order: 4 },
      { key: 'offer',               label: 'Offer',               color: '#f59e0b', icon: 'flag',     order: 5 },
      { key: 'hired',               label: 'Hired',               color: '#10b981', icon: 'award',    order: 6 },
    ],
    resumes: [
      {
        // Strong junior fit, ~1.5 yrs experience, practical React/JS/HTML/CSS/Redux.
        filename: 'aditi_verma.txt',
        text: `Aditi Verma
Pune, India | aditi.verma.fe@gmail.com
Mobile No: +91-99876-54321

PROFILE
Frontend developer with 1.5 years of experience building React applications.

EXPERIENCE
Frontend Developer, Loopwave Tech, Pune                     06/2023 - Present
- Built reusable UI components in React for a customer portal
- Wrote semantic HTML and CSS for responsive layouts
- Managed application state using Redux across feature modules
- Wrote JavaScript utilities for form validation

EDUCATION
B.Sc - Computer Science
Fergusson College, Pune                                     2019 - 2023

SKILLS
React, JavaScript, HTML, CSS, Redux, Git
`,
      },
      {
        // "Name: X Y" labeled line — name-extraction heuristic.
        filename: 'rohit_sharma.txt',
        text: `Name: Rohit Sharma
Location: Jaipur, India
Email: rohit.sharma.fe@gmail.com
Mobile No: +91-90120-44556

PROFILE
Frontend developer with 1 year of experience in React and JavaScript.

EXPERIENCE
Junior Frontend Developer, Pixelhive, Jaipur                08/2023 - Present
- Built UI components in React for a small SaaS dashboard
- Wrote CSS and HTML for marketing pages
- Used Redux to manage shared state across views

EDUCATION
BCA
University of Rajasthan                                     2020 - 2023

SKILLS
React, JavaScript, HTML, CSS, Redux
`,
      },
      {
        // Single-word name on its own line — name-extraction edge case.
        filename: 'zara.txt',
        text: `Zara
Bengaluru, India | zara.codes@gmail.com
Mobile No: +91-98450-99001

PROFILE
Frontend developer, 1 year experience with React.

EXPERIENCE
Frontend Developer, Brightloop, Bengaluru                   09/2023 - Present
- Built React components for an internal admin tool
- Wrote HTML and CSS for layout and styling
- Used Redux for state management in the dashboard module
- Wrote JavaScript event handlers for interactive widgets

EDUCATION
B.Tech - Information Technology
Visvesvaraya Technological University                      2019 - 2023

SKILLS
React, JavaScript, HTML, CSS, Redux, Figma
`,
      },
      {
        // Noisy first lines (LinkedIn/GitHub URLs before the name) — name
        // extraction must skip URL lines and find the real name.
        filename: 'devika_nair.txt',
        text: `linkedin.com/in/devika-nair-dev
github.com/devikanair

Devika Nair
Kochi, India | devika.nair.dev@gmail.com
Mobile No: +91-94000-22113

PROFILE
Frontend developer with 1 year of experience building React UIs.

EXPERIENCE
Frontend Developer, Coastline Apps, Kochi                   10/2023 - Present
- Developed React components for a travel booking site
- Wrote HTML and CSS for booking flow pages
- Used Redux for managing booking state
- Wrote JavaScript for date-picker and form logic

EDUCATION
B.Tech - Computer Science
Cochin University of Science and Technology                2019 - 2023

SKILLS
React, JavaScript, HTML, CSS, Redux
`,
      },
      {
        // Fresher: zero professional experience, no date ranges, explicit
        // "0 years of professional experience" — experience should be 0.
        filename: 'harsh_gupta.txt',
        text: `Harsh Gupta
Lucknow, India | harsh.gupta.dev@gmail.com
Mobile No: +91-97890-11223

PROFILE
Final-year Computer Science student with 0 years of professional experience,
seeking an entry-level frontend role. Built multiple personal projects using
React, JavaScript, HTML, and CSS during coursework.

PROJECTS
- Personal portfolio site built with React and deployed on Vercel
- To-do list app using React and Redux for state management
- Static landing page built with HTML and CSS

EDUCATION
B.Tech - Computer Science (Final Year)
Dr. A.P.J. Abdul Kalam Technical University                 2021 - 2025

SKILLS
React, JavaScript, HTML, CSS, Redux, Git
`,
      },
      {
        // Listed-only skills: HTML and CSS appear only in the Skills block,
        // never used in a working sentence.
        filename: 'neha_joshi.txt',
        text: `Neha Joshi
Indore, India | neha.joshi.fe@gmail.com
Mobile No: +91-96690-33221

PROFILE
Frontend developer with 1 year of experience in React.

EXPERIENCE
Frontend Developer, Vantage Web, Indore                     07/2023 - Present
- Built React components for a customer feedback tool
- Used Redux to manage form state across multi-step wizard
- Wrote JavaScript logic for API integration

EDUCATION
B.E. - Information Technology
Devi Ahilya Vishwavidyalaya                                 2019 - 2023

SKILLS
React, JavaScript, HTML, CSS, Redux, Webpack
`,
      },
      {
        // Markdown '# Full Name' header — name-extraction format coverage.
        filename: 'ishaan_kapoor.md',
        text: `# Ishaan Kapoor

Chandigarh, India | ishaan.kapoor.dev@gmail.com | Mobile No: +91-98140-55667

## Profile
Frontend developer with **2 years** of experience in **React** and **Redux**.

## Experience

**Frontend Developer**, Hillcrest Apps, Chandigarh — *05/2022 - Present*
- Built React components for a school management system
- Wrote HTML and CSS for responsive dashboards
- Used Redux for global state across modules
- Wrote JavaScript for charting integrations

## Education
**B.Tech - Computer Science**, Punjab University, 2018 - 2022

## Skills
React, JavaScript, HTML, CSS, Redux, Chart.js
`,
      },
      {
        // ALL-CAPS name line + "5 years of experience" sentence without date
        // ranges (regex fallback) — overqualified for a (0-2 yrs) role, tests
        // scoreExperience's upper-bound branch for a junior posting.
        filename: 'rakesh_verma.txt',
        text: `RAKESH VERMA
GHAZIABAD, INDIA | RAKESH.VERMA.FE@GMAIL.COM
MOBILE NO: +91-99580-11442

PROFILE
SENIOR FRONTEND DEVELOPER WITH 5 YEARS OF EXPERIENCE BUILDING REACT
APPLICATIONS, LOOKING FOR A REMOTE OPPORTUNITY.

SKILLS
REACT, JAVASCRIPT, HTML, CSS, REDUX, TYPESCRIPT, NEXT.JS

PROJECTS
- LED DEVELOPMENT OF A REACT-BASED DASHBOARD USING REDUX FOR STATE MANAGEMENT
- BUILT RESPONSIVE PAGES WITH HTML AND CSS FOR A MARKETING SITE
- WROTE JAVASCRIPT MODULES FOR ANALYTICS TRACKING

EDUCATION
B.TECH - COMPUTER SCIENCE
AMITY UNIVERSITY                                            2014 - 2018
`,
      },
    ],
  },

  // ── 3. Senior Data Scientist — "Senior" only (inferLevelYears), Rust = guaranteed-missing skill ──
  {
    title: 'Senior Data Scientist',
    department: 'Data Science',
    location: 'Bangalore, India',
    type: 'Full-time',
    level: 'Senior',
    salary: '₹35-50 LPA',
    status: 'active' as const,
    description: 'Lead machine learning initiatives across the company, from research to production deployment.',
    responsibilities: 'Design and train machine learning models using Python and TensorFlow\nWrite SQL for data analysis\nDeploy ML systems in performance-critical Rust services\nMentor junior data scientists',
    requiredSkills: ['Python', 'Machine Learning', 'TensorFlow', 'SQL', 'Rust'],
    niceToHaveSkills: ['PyTorch', 'AWS', 'Spark'],
    education: "Master's in Data Science or related field",
    hiringManager: 'Dev Patel',
    threshold: 75,
    autoRank: true,
    aiSummary: true,
    biasCheck: true,
    pipeline: [
      { key: 'applied',             label: 'Applied',             color: '#6b7280', icon: 'user',     order: 0 },
      { key: 'resume-screen',       label: 'Resume Screen',       color: '#3b82f6', icon: 'circle',   order: 1 },
      { key: 'technical-interview', label: 'Technical Interview', color: '#8b5cf6', icon: 'calendar', order: 2 },
      { key: 'panel-interview',     label: 'Panel Interview',     color: '#06b6d4', icon: 'check',    order: 3 },
      { key: 'offer',               label: 'Offer',               color: '#f59e0b', icon: 'flag',     order: 4 },
      { key: 'hired',               label: 'Hired',               color: '#10b981', icon: 'award',    order: 5 },
    ],
    resumes: [
      {
        // Strong senior practical fit; "Rust" required but genuinely absent
        // from this candidate's experience and from SKILL_RELATIONS —
        // guaranteed hard-miss for the Rust gap.
        filename: 'ananya_krishnan.txt',
        text: `Ananya Krishnan
Bangalore, India | ananya.krishnan.ds@gmail.com
Mobile No: +91-98860-77123

PROFILE
Senior Data Scientist with 8 years of experience building and deploying
machine learning models in production.

EXPERIENCE
Senior Data Scientist, Northbridge AI, Bangalore           03/2018 - Present
- Designed and trained machine learning models using Python and TensorFlow for demand forecasting
- Wrote complex SQL queries for feature engineering on large datasets
- Deployed models to production and monitored drift over time
- Mentored a team of 4 junior data scientists

Data Scientist, Quanta Analytics, Bangalore                06/2014 - 02/2018
- Built machine learning pipelines in Python for churn prediction
- Used SQL extensively for data extraction and transformation

EDUCATION
M.Tech - Computer Science (AI/ML specialization)
Indian Institute of Science, Bangalore                     2012 - 2014

SKILLS
Python, Machine Learning, TensorFlow, SQL, PyTorch, AWS, Spark, Scikit-learn

ACHIEVEMENTS
- Published 2 papers on demand forecasting at internal ML conference
- Reduced forecast error by 22% through ensemble modeling
`,
      },
      {
        // Domain-mismatch: a non-technical HR resume applying to a Data
        // Scientist role — <20% required-skill match with 3+ required gaps,
        // tests the recomputeFromSkillGaps hard floor (score <= 48).
        filename: 'rina_thomas.txt',
        text: `Rina Thomas
Chennai, India | rina.thomas.hr@gmail.com
Mobile No: +91-90030-44556

PROFILE
HR generalist with 6 years of experience in recruitment and employee relations,
looking to transition into a data-driven role.

EXPERIENCE
HR Executive, Coral Bay Hotels, Chennai                    04/2018 - Present
- Managed end-to-end recruitment for hospitality staff
- Conducted employee onboarding and exit interviews
- Maintained HR records and attendance using Excel

EDUCATION
MBA - Human Resources
Loyola College, Chennai                                     2016 - 2018

SKILLS
Recruitment, Onboarding, Employee Relations, MS Excel, Communication
`,
      },
      {
        // Achievements-rich: certifications, awards, hackathons.
        filename: 'oleg_petrov.txt',
        text: `Oleg Petrov
Pune, India | oleg.petrov.ml@gmail.com
Mobile No: +91-98220-66554

PROFILE
Senior Data Scientist with 7 years of experience in machine learning research
and applied ML systems.

EXPERIENCE
Senior Data Scientist, Vertex Analytics, Pune              01/2019 - Present
- Built machine learning models in Python and TensorFlow for fraud detection
- Wrote SQL for large-scale feature pipelines on a data warehouse
- Led a cross-functional ML platform initiative

Data Scientist, Insight Labs, Pune                          07/2015 - 12/2018
- Developed Python-based machine learning models for recommendation systems

EDUCATION
M.Sc - Data Science
University of Pune                                          2013 - 2015

SKILLS
Python, Machine Learning, TensorFlow, SQL, PyTorch, AWS

CERTIFICATIONS
- AWS Certified Machine Learning - Specialty
- TensorFlow Developer Certificate

ACHIEVEMENTS
- Winner, National AI Hackathon 2021 (fraud detection track)
- Speaker at PyData Pune 2022
- 3 patents filed in applied ML systems
`,
      },
      {
        // Achievements-empty counterpart — same seniority, no certifications/
        // awards/hackathons section at all.
        filename: 'manoj_pillai.txt',
        text: `Manoj Pillai
Hyderabad, India | manoj.pillai.ml@gmail.com
Mobile No: +91-90100-22334

PROFILE
Senior Data Scientist with 7 years of experience in machine learning.

EXPERIENCE
Senior Data Scientist, Delta Analytics, Hyderabad          02/2019 - Present
- Built machine learning models using Python and TensorFlow for pricing optimization
- Wrote SQL queries for data analysis and reporting
- Worked with Spark for large-scale data processing

Data Scientist, Cortex Systems, Hyderabad                  03/2015 - 01/2019
- Developed Python-based ML models for customer segmentation

EDUCATION
M.Tech - Computer Science
Jawaharlal Nehru Technological University                  2013 - 2015

SKILLS
Python, Machine Learning, TensorFlow, SQL, Spark, AWS
`,
      },
      {
        // PhD candidate (DEGREE_LEVELS PhD=3 > Master required=2) — tests the
        // "more than required" branch of scoreEducation.
        filename: 'dr_sameer_qureshi.txt',
        text: `Dr. Sameer Qureshi
Delhi, India | sameer.qureshi.phd@gmail.com
Mobile No: +91-98100-99887

PROFILE
Senior Data Scientist with a PhD in Machine Learning and 9 years of combined
research and industry experience.

EXPERIENCE
Senior Data Scientist, Helios AI, Delhi                    08/2018 - Present
- Designed deep learning models in Python and TensorFlow for medical imaging
- Wrote SQL for clinical data analysis pipelines
- Led research collaborations with 2 universities

Postdoctoral Researcher, IIT Delhi                          07/2015 - 07/2018
- Conducted research on machine learning using Python

EDUCATION
PhD - Machine Learning
Indian Institute of Technology, Delhi                       2011 - 2015

M.Tech - Computer Science
Indian Institute of Technology, Delhi                       2009 - 2011

SKILLS
Python, Machine Learning, TensorFlow, SQL, PyTorch
`,
      },
      {
        // No-degree-mentioned resume — education section absent entirely,
        // tests scoreEducation with no education signal.
        filename: 'leila_hassan.txt',
        text: `Leila Hassan
Mumbai, India | leila.hassan.ds@gmail.com
Mobile No: +91-99200-33112

PROFILE
Senior Data Scientist with 8 years of self-taught and on-the-job experience in
machine learning, starting as a data analyst and growing into model development.

EXPERIENCE
Senior Data Scientist, Marlin Data Co, Mumbai              05/2018 - Present
- Built machine learning models in Python and TensorFlow for inventory forecasting
- Wrote SQL queries for ad-hoc analysis and dashboards
- Worked with AWS for model deployment

Data Analyst, Coreline Retail, Mumbai                       06/2013 - 04/2018
- Used SQL and Python for reporting and analysis

SKILLS
Python, Machine Learning, TensorFlow, SQL, AWS, Pandas, NumPy
`,
      },
      {
        // Extremely long resume — multi-page, many roles, "till date" phrasing
        // for the current role's end date.
        filename: 'vikram_seth.txt',
        text: `Vikram Seth
Bangalore, India | vikram.seth.ml@gmail.com
Mobile No: +91-98450-11990

PROFILE
Senior Data Scientist with over a decade of progressive experience across
machine learning, data engineering, and analytics roles in fintech, retail,
and healthcare domains.

EXPERIENCE

Principal Data Scientist, Orbital Finance, Bangalore        Jan 2021 - till date
- Lead a team of 6 data scientists building machine learning models in Python and TensorFlow for credit risk
- Designed SQL-based feature stores used across 5 product teams
- Worked with Spark for distributed model training
- Established MLOps practices for model monitoring and retraining

Senior Data Scientist, MedAI Health, Bangalore              Mar 2018 - Dec 2020
- Built TensorFlow models in Python for diagnostic imaging
- Wrote SQL for clinical data warehousing

Data Scientist, RetailSense, Pune                           Jul 2015 - Feb 2018
- Developed Python-based machine learning models for demand forecasting
- Used SQL for sales data analysis

Junior Data Analyst, Coreview Analytics, Pune               Jun 2013 - Jun 2015
- Built dashboards and reports using SQL and Excel

EDUCATION
M.Sc - Statistics
University of Mumbai                                        2011 - 2013

B.Sc - Mathematics
University of Mumbai                                        2008 - 2011

SKILLS
Python, Machine Learning, TensorFlow, SQL, Spark, AWS, PyTorch, Pandas, NumPy,
Scikit-learn, Airflow, Docker, MLflow

ACHIEVEMENTS
- Built credit risk model that reduced default rate by 15%
- Led migration of legacy ML pipelines to a modern MLOps stack
- Mentored 10+ data scientists over career
`,
      },
      {
        // Extremely short resume — one paragraph, minimal structure.
        filename: 'tina_fernandes.txt',
        text: `Tina Fernandes
tina.fernandes.ds@gmail.com | +91-98200-44110 | Bangalore, India

Senior Data Scientist with 6 years of experience in Python, Machine Learning,
TensorFlow, and SQL. Built and deployed forecasting models in production at a
mid-size retail analytics company. M.Sc in Data Science from Christ University.
`,
      },
    ],
  },

  // ── 4. DevOps/SRE Lead — Lead (7-12 yrs), TWO consecutive interview-type stages ──
  {
    title: 'DevOps/SRE Lead',
    department: 'Infrastructure',
    location: 'Pune, India',
    type: 'Full-time',
    level: 'Lead (7-12 yrs)',
    salary: '₹40-60 LPA',
    status: 'active' as const,
    description: 'Lead our DevOps/SRE practice, owning cloud infrastructure, CI/CD, and on-call reliability for the platform.',
    responsibilities: 'Own AWS infrastructure using Terraform\nOperate Kubernetes and Docker workloads\nBuild and maintain CI/CD pipelines\nLead incident response on Linux systems',
    requiredSkills: ['AWS', 'Kubernetes', 'Docker', 'Terraform', 'CI/CD', 'Linux'],
    niceToHaveSkills: ['Python', 'Monitoring', 'Ansible'],
    education: "Bachelor's in Computer Science or related field",
    hiringManager: 'Vivek Sharma',
    threshold: 75,
    autoRank: true,
    aiSummary: true,
    biasCheck: false,
    pipeline: [
      { key: 'applied',        label: 'Applied',        color: '#6b7280', icon: 'user',     order: 0 },
      { key: 'resume-screen',  label: 'Resume Screen',  color: '#3b82f6', icon: 'circle',   order: 1 },
      { key: 'tech-round-1',   label: 'Tech Round 1',   color: '#8b5cf6', icon: 'calendar', order: 2 },
      { key: 'tech-round-2',   label: 'Tech Round 2',   color: '#06b6d4', icon: 'calendar', order: 3 },
      { key: 'hr-round',       label: 'HR Round',       color: '#ec4899', icon: 'star',     order: 4 },
      { key: 'offer',          label: 'Offer',          color: '#f59e0b', icon: 'flag',     order: 5 },
      { key: 'hired',          label: 'Hired',          color: '#10b981', icon: 'award',    order: 6 },
    ],
    resumes: [
      {
        // Strong Lead fit — 9 years, all required skills practical.
        filename: 'rajesh_nair.txt',
        text: `Rajesh Nair
Pune, India | rajesh.nair.devops@gmail.com
Mobile No: +91-98220-11567

PROFILE
DevOps/SRE Lead with 9 years of experience operating large-scale cloud
infrastructure.

EXPERIENCE
DevOps Lead, Skyline Cloud, Pune                           04/2018 - Present
- Own AWS infrastructure for a 200+ service platform, managed via Terraform
- Operate Kubernetes clusters running 300+ microservices on Docker
- Built and maintained CI/CD pipelines using Jenkins and GitHub Actions
- Lead on-call rotation and incident response across Linux fleets

Senior DevOps Engineer, Cloudpoint Systems, Pune           06/2014 - 03/2018
- Managed AWS infrastructure with Terraform for a SaaS product
- Operated Docker-based deployments and basic Kubernetes workloads
- Maintained CI/CD pipelines and Linux servers

EDUCATION
B.E. - Computer Engineering
College of Engineering, Pune                               2010 - 2014

SKILLS
AWS, Kubernetes, Docker, Terraform, CI/CD, Linux, Jenkins, Python, Ansible
`,
      },
      {
        // Overqualified: 20 years for a Lead (7-12 yrs) role — caps at 88.
        filename: 'george_mathew.txt',
        text: `George Mathew
Bangalore, India | george.mathew.sre@gmail.com
Mobile No: +91-98450-22119

PROFILE
DevOps/SRE leader with 20 years of experience across infrastructure, cloud,
and platform engineering.

EXPERIENCE
VP Infrastructure, Tallship Technologies, Bangalore        01/2010 - Present
- Direct AWS infrastructure strategy across the org, standardized on Terraform
- Oversee Kubernetes and Docker platform teams supporting 500+ services
- Set CI/CD standards used by 40+ engineering teams
- Own Linux fleet reliability and incident management process

Infrastructure Manager, Coreweb Systems, Bangalore         03/2004 - 12/2009
- Managed Linux server infrastructure and early CI/CD adoption

EDUCATION
B.Tech - Computer Science
R.V. College of Engineering, Bangalore                      2000 - 2004

SKILLS
AWS, Kubernetes, Docker, Terraform, CI/CD, Linux, Python, Monitoring, Ansible
`,
      },
      {
        // Exactly at the bottom of the Lead range — 7 years experience.
        filename: 'sandeep_kumar.txt',
        text: `Sandeep Kumar
Hyderabad, India | sandeep.kumar.ops@gmail.com
Mobile No: +91-90300-44552

PROFILE
DevOps engineer with 7 years of experience, ready to step into a lead role.

EXPERIENCE
Senior DevOps Engineer, Vantapoint Cloud, Hyderabad        06/2019 - Present
- Manage AWS infrastructure using Terraform for a multi-region deployment
- Operate Kubernetes clusters and Docker-based CI/CD pipelines
- Maintain Linux servers and lead incident response during on-call shifts

DevOps Engineer, Brightcore Tech, Hyderabad                05/2017 - 05/2019
- Built CI/CD pipelines and managed Docker containers on Linux servers
- Assisted with AWS infrastructure setup using Terraform

EDUCATION
B.Tech - Information Technology
Osmania University                                          2013 - 2017

SKILLS
AWS, Kubernetes, Docker, Terraform, CI/CD, Linux
`,
      },
      {
        // Below the range: 4 years experience for a Lead (7-12 yrs) role —
        // tests the low end of scoreExperience's gap formula.
        filename: 'amit_bose.txt',
        text: `Amit Bose
Kolkata, India | amit.bose.devops@gmail.com
Mobile No: +91-98300-77661

PROFILE
DevOps engineer with 4 years of experience in cloud infrastructure and CI/CD.

EXPERIENCE
DevOps Engineer, Northgate Systems, Kolkata                07/2021 - Present
- Manage AWS resources and write Terraform modules for new services
- Operate Docker containers and a small Kubernetes cluster
- Maintain CI/CD pipelines using GitLab CI on Linux runners

Junior DevOps Engineer, Westfield Tech, Kolkata            06/2020 - 06/2021
- Assisted with Linux server administration and basic CI/CD scripting

EDUCATION
B.Tech - Computer Science
Jadavpur University                                         2016 - 2020

SKILLS
AWS, Kubernetes, Docker, Terraform, CI/CD, Linux, Python
`,
      },
      {
        // Markdown format, strong fit.
        filename: 'priya_chandran.md',
        text: `# Priya Chandran

Chennai, India | priya.chandran.sre@gmail.com | Mobile No: +91-90470-11882

## Profile
**DevOps/SRE Lead** with **10 years** of experience in cloud infrastructure and reliability engineering.

## Experience

**SRE Lead**, Tideway Systems, Chennai — *02/2017 - Present*
- Own **AWS** infrastructure managed via **Terraform** for a 150-service platform
- Operate **Kubernetes** and **Docker** workloads across 3 regions
- Built **CI/CD** pipelines used by 20+ teams
- Lead incident response on **Linux** systems, on-call rotation of 8 engineers

**DevOps Engineer**, Cascade Cloud, Chennai — *03/2013 - 01/2017*
- Managed AWS and Linux infrastructure, early Docker adoption

## Education
**B.E. - Computer Science**, Anna University, 2009 - 2013

## Skills
AWS, Kubernetes, Docker, Terraform, CI/CD, Linux, Monitoring, Python
`,
      },
      {
        // Pipe-delimited contact + "Remote (City, Country)" + overlapping/
        // concurrent roles (merge-interval logic for total experience).
        filename: 'daniel_okafor.txt',
        text: `Daniel Okafor
Remote (Lagos, Nigeria) | daniel.okafor.ops@gmail.com | +234-803-555-1122

PROFILE
DevOps/SRE professional with experience managing AWS and Kubernetes platforms
across concurrent contract engagements.

EXPERIENCE
Lead Site Reliability Engineer, Vortek Cloud (Remote)       Jan 2019 - Present
- Own AWS infrastructure with Terraform for a multi-tenant SaaS platform
- Operate Kubernetes and Docker workloads across staging and production
- Maintain CI/CD pipelines and Linux-based build agents

DevOps Consultant, Savanna Systems (Remote)                 Jun 2018 - Dec 2021
- Provided part-time DevOps consulting: AWS, Terraform, and CI/CD setup for
  three client companies in parallel with the Vortek Cloud role
- Managed Linux servers and Docker deployments

EDUCATION
B.Sc - Computer Science
University of Lagos                                         2012 - 2016

SKILLS
AWS, Kubernetes, Docker, Terraform, CI/CD, Linux, Ansible
`,
      },
      {
        // Mixed date formats within one resume: MM/YYYY, month-name range,
        // and a bare-year range.
        filename: 'natasha_volkov.txt',
        text: `Natasha Volkov
Bangalore, India | natasha.volkov.sre@gmail.com
Mobile No: +91-98860-33119

PROFILE
DevOps/SRE Lead with extensive experience across AWS, Kubernetes, and CI/CD.

EXPERIENCE
SRE Lead, Polestar Cloud, Bangalore                         03/2020 - Present
- Own AWS infrastructure via Terraform, operate Kubernetes and Docker at scale
- Build CI/CD pipelines and lead Linux incident response

Senior DevOps Engineer, Glacier Systems, Bangalore          January 2016 - February 2020
- Managed AWS and Terraform-based infrastructure, Docker and Kubernetes operations

DevOps Engineer, Frostline Technologies, Bangalore          2012 - 2015
- Maintained Linux servers and early CI/CD pipelines, AWS basics

EDUCATION
B.Tech - Computer Science
PES University, Bangalore                                   2008 - 2012

SKILLS
AWS, Kubernetes, Docker, Terraform, CI/CD, Linux, Monitoring
`,
      },
    ],
  },

  // ── 5. QA Automation Engineer — Mid, "Coding Test" + "Written Assessment" (two assessment-type stages) ──
  {
    title: 'QA Automation Engineer',
    department: 'Quality Engineering',
    location: 'Noida, India',
    type: 'Full-time',
    level: 'Mid (3-5 yrs)',
    salary: '₹12-18 LPA',
    status: 'active' as const,
    description: 'Build and maintain automated test suites for our web platform, ensuring quality across releases.',
    responsibilities: 'Write automated UI tests using Selenium and Java\nBuild API test suites\nWrite SQL for test data validation\nMaintain test automation frameworks',
    requiredSkills: ['Selenium', 'Java', 'API Testing', 'SQL', 'Test Automation'],
    niceToHaveSkills: ['Cypress', 'Jenkins', 'Postman'],
    education: "Bachelor's degree in Computer Science",
    hiringManager: 'Anita Desai',
    threshold: 65,
    autoRank: true,
    aiSummary: true,
    biasCheck: false,
    pipeline: [
      { key: 'applied',             label: 'Applied',             color: '#6b7280', icon: 'user',     order: 0 },
      { key: 'resume-screen',       label: 'Resume Screen',       color: '#3b82f6', icon: 'circle',   order: 1 },
      { key: 'coding-test',         label: 'Coding Test',         color: '#06b6d4', icon: 'check',    order: 2 },
      { key: 'written-assessment',  label: 'Written Assessment',  color: '#f97316', icon: 'check',    order: 3 },
      { key: 'technical-interview', label: 'Technical Interview', color: '#8b5cf6', icon: 'calendar', order: 4 },
      { key: 'hr-round',            label: 'HR Round',            color: '#ec4899', icon: 'star',     order: 5 },
      { key: 'offer',               label: 'Offer',               color: '#f59e0b', icon: 'flag',     order: 6 },
      { key: 'hired',               label: 'Hired',               color: '#10b981', icon: 'award',    order: 7 },
    ],
    resumes: [
      {
        // Strong practical fit, 4 years experience.
        filename: 'sonal_mishra.txt',
        text: `Sonal Mishra
Noida, India | sonal.mishra.qa@gmail.com
Mobile No: +91-98100-44221

PROFILE
QA Automation Engineer with 4 years of experience in test automation.

EXPERIENCE
QA Automation Engineer, Brightline Software, Noida         05/2021 - Present
- Wrote automated UI tests using Selenium and Java for a banking web app
- Built API test suites for REST services using Java
- Wrote SQL queries to validate test data in staging databases
- Maintained a test automation framework used across 3 teams

QA Engineer, Coreframe Tech, Noida                          06/2019 - 04/2021
- Wrote Selenium scripts in Java for regression testing
- Performed manual API testing using Postman

EDUCATION
B.Tech - Computer Science
Amity University, Noida                                     2015 - 2019

SKILLS
Selenium, Java, API Testing, SQL, Test Automation, Postman, Jenkins
`,
      },
      {
        // Listed-only skills: "SQL" and "API Testing" appear only in Skills
        // block, never used in a working sentence.
        filename: 'kunal_shah.txt',
        text: `Kunal Shah
Ahmedabad, India | kunal.shah.qa@gmail.com
Mobile No: +91-99250-66778

PROFILE
QA engineer with 3 years of experience in automated testing.

EXPERIENCE
QA Automation Engineer, Westgate Software, Ahmedabad       04/2022 - Present
- Wrote Selenium test scripts in Java for a retail web application
- Maintained an automated test automation suite for regression coverage

QA Engineer, Cloudgate Systems, Ahmedabad                   05/2021 - 03/2022
- Wrote Selenium-based UI tests in Java

EDUCATION
B.E. - Computer Engineering
Gujarat Technological University                           2017 - 2021

SKILLS
Selenium, Java, API Testing, SQL, Test Automation, Cypress
`,
      },
      {
        // Practical "Postman" usage for API Testing — related/practical
        // evidence beyond the literal skill name.
        filename: 'rachel_dsouza.txt',
        text: `Rachel D'Souza
Mumbai, India | rachel.dsouza.qa@gmail.com
Mobile No: +91-98200-55334

PROFILE
QA Automation Engineer with 4 years of experience in UI and API test automation.

EXPERIENCE
QA Automation Engineer, Tidewave Tech, Mumbai              03/2021 - Present
- Wrote Selenium UI tests in Java for an e-commerce platform
- Used Postman extensively for API testing of backend services, building full
  regression collections for the payments API
- Wrote SQL queries to verify order data integrity after test runs
- Built a test automation framework adopted by 2 other QA teams

QA Engineer, Lakeside Software, Mumbai                      06/2019 - 02/2021
- Performed manual and automated testing using Selenium and Java

EDUCATION
B.Sc - Information Technology
University of Mumbai                                        2016 - 2019

SKILLS
Selenium, Java, API Testing, SQL, Test Automation, Postman
`,
      },
      {
        // Fresher: internship-only QA testing experience.
        filename: 'abhinav_rathi.txt',
        text: `Abhinav Rathi
Jaipur, India | abhinav.rathi.qa@gmail.com
Mobile No: +91-90015-66332

PROFILE
Computer Science graduate seeking an entry-level QA automation role.

EXPERIENCE
QA Intern, Brightspan Technologies, Jaipur                 01/2024 - 06/2024
- Wrote basic Selenium scripts in Java to automate login and form-submission tests
- Assisted with manual API testing using Postman

EDUCATION
B.Tech - Computer Science
Malaviya National Institute of Technology, Jaipur          2020 - 2024

SKILLS
Selenium, Java, API Testing, SQL, Test Automation
`,
      },
      {
        // Overqualified: 11 years for a Mid (3-5 yrs) role — caps at 88.
        filename: 'deepak_menon.txt',
        text: `Deepak Menon
Bangalore, India | deepak.menon.qa@gmail.com
Mobile No: +91-98450-77002

PROFILE
QA Automation Lead with 11 years of experience across test automation frameworks.

EXPERIENCE
QA Automation Lead, Stratos Systems, Bangalore             04/2014 - Present
- Lead a team of 6 QA engineers building Selenium/Java automation frameworks
- Oversee API test automation strategy and SQL-based data validation
- Drive test automation adoption across 5 product teams

Senior QA Engineer, Coastal Software, Bangalore             06/2010 - 03/2014
- Wrote Selenium scripts in Java, performed API testing and SQL validation

EDUCATION
B.E. - Computer Science
RV College of Engineering, Bangalore                        2006 - 2010

SKILLS
Selenium, Java, API Testing, SQL, Test Automation, Jenkins, Cypress
`,
      },
      {
        // "5 years of experience" sentence, no employer date ranges at all —
        // regex fallback for experience extraction.
        filename: 'fatima_ali.txt',
        text: `Fatima Ali
fatima.ali.qa@gmail.com | +91-98760-11223 | Karachi, Pakistan

PROFILE
QA Automation Engineer with 5 years of experience in Selenium, Java, and API
testing. Skilled in building maintainable test automation frameworks and
writing SQL for test data setup and validation across multiple projects.

SKILLS
Selenium, Java, API Testing, SQL, Test Automation, Postman, Jenkins

EDUCATION
BS - Software Engineering
NED University of Engineering and Technology                2012 - 2016
`,
      },
      {
        // ALL-CAPS template.
        filename: 'pooja_yadav.txt',
        text: `POOJA YADAV
LUCKNOW, INDIA | POOJA.YADAV.QA@GMAIL.COM
MOBILE NO: +91-94150-22887

PROFILE
QA AUTOMATION ENGINEER WITH 4 YEARS OF EXPERIENCE IN SELENIUM AND JAVA.

EXPERIENCE
QA AUTOMATION ENGINEER, RIVERBANK SOFTWARE, LUCKNOW          06/2021 - PRESENT
- WROTE SELENIUM TEST SCRIPTS IN JAVA FOR A LOGISTICS WEB APPLICATION
- BUILT API TESTING SUITES FOR ORDER-TRACKING SERVICES
- WROTE SQL QUERIES TO VALIDATE DATABASE STATE AFTER TEST RUNS
- MAINTAINED TEST AUTOMATION FRAMEWORK USED BY THE QA TEAM

QA ENGINEER, NORTHSTAR TECH, LUCKNOW                         07/2019 - 05/2021
- PERFORMED MANUAL AND AUTOMATED TESTING USING SELENIUM AND JAVA

EDUCATION
B.TECH - COMPUTER SCIENCE
DR. A.P.J. ABDUL KALAM TECHNICAL UNIVERSITY                 2015 - 2019

SKILLS
SELENIUM, JAVA, API TESTING, SQL, TEST AUTOMATION
`,
      },
      {
        // Pipe-delimited contact + "Remote (City, Country)" location.
        filename: 'carlos_mendes.txt',
        text: `Carlos Mendes
Remote (Lisbon, Portugal) | carlos.mendes.qa@gmail.com | +351-91-234-5678

PROFILE
QA Automation Engineer with experience testing web and API platforms.

EXPERIENCE
QA Automation Engineer, Nimbus Software (Remote)            08/2020 - Present
- Wrote Selenium tests in Java for a multi-region SaaS platform
- Built API testing suites for internal microservices
- Wrote SQL for verifying data consistency across test environments
- Maintained the team's test automation framework

QA Engineer, Solara Tech, Lisbon                            09/2018 - 07/2020
- Performed manual and Selenium-based automated testing in Java

EDUCATION
BSc - Computer Science
University of Lisbon                                        2014 - 2018

SKILLS
Selenium, Java, API Testing, SQL, Test Automation, Cypress, Jenkins
`,
      },
    ],
  },

  // ── 6. Product Manager (non-tech) — Manager level, PM-domain requiredSkills ──
  {
    title: 'Product Manager',
    department: 'Product',
    location: 'Bangalore, India',
    type: 'Full-time',
    level: 'Manager (5-8 yrs)',
    salary: '₹30-45 LPA',
    status: 'active' as const,
    description: 'Own the product roadmap for a core product area, working closely with engineering, design, and business stakeholders.',
    responsibilities: 'Define and prioritize the product roadmap\nManage stakeholders across business and engineering\nTrack delivery using Jira and Agile ceremonies\nConduct market research to inform product decisions',
    requiredSkills: ['Product Roadmap', 'Stakeholder Management', 'Jira', 'Agile', 'Market Research'],
    niceToHaveSkills: ['SQL', 'A/B Testing', 'Figma'],
    education: "Bachelor's degree, MBA preferred",
    hiringManager: 'Dev Patel',
    threshold: 70,
    autoRank: true,
    aiSummary: true,
    biasCheck: true,
    pipeline: [
      { key: 'applied',                  label: 'Applied',                  color: '#6b7280', icon: 'user',     order: 0 },
      { key: 'resume-screen',            label: 'Resume Screen',            color: '#3b82f6', icon: 'circle',   order: 1 },
      { key: 'hiring-manager-interview', label: 'Hiring Manager Interview', color: '#8b5cf6', icon: 'calendar', order: 2 },
      { key: 'panel-interview',          label: 'Panel Interview',          color: '#06b6d4', icon: 'calendar', order: 3 },
      { key: 'offer',                    label: 'Offer',                    color: '#f59e0b', icon: 'flag',     order: 4 },
      { key: 'hired',                    label: 'Hired',                    color: '#10b981', icon: 'award',    order: 5 },
    ],
    resumes: [
      {
        // Strong practical fit, 6 years experience.
        filename: 'simran_kaur.txt',
        text: `Simran Kaur
Bangalore, India | simran.kaur.pm@gmail.com
Mobile No: +91-98450-66112

PROFILE
Product Manager with 6 years of experience owning product roadmaps for B2C
mobile apps.

EXPERIENCE
Product Manager, Flowdesk Inc, Bangalore                   05/2021 - Present
- Own the product roadmap for the core mobile app, prioritizing across 4 squads
- Manage stakeholders across engineering, design, and business teams
- Track delivery using Jira and run Agile ceremonies (standups, retros, planning)
- Conduct market research to inform quarterly roadmap decisions

Associate Product Manager, Vantage Apps, Bangalore         06/2018 - 04/2021
- Maintained product backlog in Jira and worked within Agile sprints
- Coordinated stakeholder management for feature launches

EDUCATION
MBA - Marketing
Indian Institute of Management, Bangalore                   2016 - 2018

B.Com
Christ University, Bangalore                                2013 - 2016

SKILLS
Product Roadmap, Stakeholder Management, Jira, Agile, Market Research, SQL, Figma
`,
      },
      {
        // Listed-only skills: "Market Research" and "Stakeholder Management"
        // appear only in the Skills block, never used in a sentence.
        filename: 'arvind_rao.txt',
        text: `Arvind Rao
Hyderabad, India | arvind.rao.pm@gmail.com
Mobile No: +91-90040-88221

PROFILE
Product Manager with 5 years of experience in B2B SaaS products.

EXPERIENCE
Product Manager, Cortex Software, Hyderabad               03/2021 - Present
- Own the product roadmap for a B2B analytics platform
- Run Agile sprint planning and manage the team's Jira board

Product Analyst, Brightfield Tech, Hyderabad              06/2019 - 02/2021
- Supported roadmap planning and tracked tasks in Jira

EDUCATION
MBA - Business Administration
ICFAI Business School, Hyderabad                            2017 - 2019

SKILLS
Product Roadmap, Stakeholder Management, Jira, Agile, Market Research, A/B Testing
`,
      },
      {
        // Related-skill credit: "Scrum" used practically as evidence for Agile.
        filename: 'meera_subramaniam.txt',
        text: `Meera Subramaniam
Chennai, India | meera.subramaniam.pm@gmail.com
Mobile No: +91-98410-22556

PROFILE
Product Manager with 6 years of experience running Scrum teams for fintech products.

EXPERIENCE
Product Manager, Finbloom, Chennai                         04/2020 - Present
- Own the product roadmap for a payments product line
- Run Scrum ceremonies (sprint planning, standups, retrospectives) with 2 squads
- Manage stakeholder relationships with compliance and risk teams
- Use Jira for sprint tracking and release planning

Senior Business Analyst, Coral Finance, Chennai            06/2017 - 03/2020
- Conducted market research for new product features
- Tracked requirements and tasks in Jira

EDUCATION
MBA - Finance
Great Lakes Institute of Management, Chennai               2015 - 2017

SKILLS
Product Roadmap, Stakeholder Management, Jira, Market Research, SQL
`,
      },
      {
        // Domain-mismatch: a software engineer's resume applied to a PM role —
        // <20% required-skill match with 3+ required gaps, tests the
        // recomputeFromSkillGaps hard floor (score <= 48).
        filename: 'tushar_agarwal.txt',
        text: `Tushar Agarwal
Pune, India | tushar.agarwal.dev@gmail.com
Mobile No: +91-98230-77441

PROFILE
Software Engineer with 5 years of experience building backend systems in Java
and Spring Boot.

EXPERIENCE
Software Engineer, Coreloop Systems, Pune                  04/2020 - Present
- Built REST APIs using Java and Spring Boot
- Designed PostgreSQL schemas for transactional systems
- Wrote unit tests with JUnit

EDUCATION
B.E. - Computer Engineering
College of Engineering, Pune                                2016 - 2020

SKILLS
Java, Spring Boot, PostgreSQL, REST API, JUnit, Git
`,
      },
      {
        // Overqualified: 16 years (Director-level) for a Manager (5-8 yrs)
        // role — caps at 88.
        filename: 'rebecca_jacob.txt',
        text: `Rebecca Jacob
Mumbai, India | rebecca.jacob.pm@gmail.com
Mobile No: +91-98200-99441

PROFILE
Director of Product with 16 years of experience leading product organizations
across fintech and e-commerce.

EXPERIENCE
Director of Product, Marquee Commerce, Mumbai             02/2014 - Present
- Own multi-year product roadmaps across 5 product lines
- Manage stakeholders at the executive level across the org
- Set Agile and Jira standards adopted company-wide
- Lead quarterly market research initiatives to guide strategy

Senior Product Manager, Vault Finance, Mumbai             06/2008 - 01/2014
- Owned product roadmap for core banking products
- Managed stakeholders, ran Agile ceremonies, tracked work in Jira

EDUCATION
MBA - Strategy
S.P. Jain Institute of Management, Mumbai                   2006 - 2008

SKILLS
Product Roadmap, Stakeholder Management, Jira, Agile, Market Research, SQL, A/B Testing
`,
      },
      {
        // Junior/Associate PM with 2 years — below the Manager (5-8 yrs)
        // range, tests the low end of scoreExperience's gap formula.
        filename: 'naveen_pillai.txt',
        text: `Naveen Pillai
Kochi, India | naveen.pillai.pm@gmail.com
Mobile No: +91-94470-11665

PROFILE
Associate Product Manager with 2 years of experience supporting roadmap
planning for a mobile app.

EXPERIENCE
Associate Product Manager, Reeflink Apps, Kochi            06/2023 - Present
- Support roadmap planning and maintain the product backlog in Jira
- Coordinate stakeholder updates for sprint reviews
- Assist with market research for upcoming features
- Participate in Agile ceremonies as part of a 2-squad team

EDUCATION
MBA - Marketing
Indian Institute of Management, Kozhikode                   2021 - 2023

SKILLS
Product Roadmap, Jira, Agile, Market Research, Stakeholder Management
`,
      },
      {
        // Markdown format, strong fit.
        filename: 'ayesha_siddiqui.md',
        text: `# Ayesha Siddiqui

Delhi, India | ayesha.siddiqui.pm@gmail.com | Mobile No: +91-98110-77332

## Profile
**Product Manager** with **7 years** of experience owning roadmaps for B2B SaaS products.

## Experience

**Product Manager**, Northlane Software, Delhi — *01/2019 - Present*
- Own the **product roadmap** for a B2B platform serving 200+ enterprise clients
- Manage **stakeholder** relationships across sales, engineering, and support
- Run **Agile** ceremonies and track delivery in **Jira**
- Conduct **market research** to validate new feature bets

## Education
**MBA**, XLRI Jamshedpur, 2017 - 2019

## Skills
Product Roadmap, Stakeholder Management, Jira, Agile, Market Research, SQL
`,
      },
      {
        // ALL-CAPS template + pipe-delimited contact line.
        filename: 'jonathan_silva.txt',
        text: `JONATHAN SILVA
JONATHAN.SILVA.PM@GMAIL.COM | +91-98200-66110 | GOA, INDIA

PROFILE
PRODUCT MANAGER WITH 6 YEARS OF EXPERIENCE IN CONSUMER APPS.

EXPERIENCE
PRODUCT MANAGER, SUNCOAST APPS, GOA                          03/2020 - PRESENT
- OWN THE PRODUCT ROADMAP FOR A TRAVEL BOOKING APP
- MANAGE STAKEHOLDERS ACROSS MARKETING AND ENGINEERING TEAMS
- RUN AGILE SPRINTS AND TRACK WORK IN JIRA
- CONDUCT MARKET RESEARCH ON COMPETITOR APPS QUARTERLY

SENIOR BUSINESS ANALYST, COASTLINE TRAVEL, GOA               06/2017 - 02/2020
- SUPPORTED PRODUCT ROADMAP PLANNING AND STAKEHOLDER MANAGEMENT

EDUCATION
MBA - PRODUCT MANAGEMENT
GOA INSTITUTE OF MANAGEMENT                                  2015 - 2017

SKILLS
PRODUCT ROADMAP, STAKEHOLDER MANAGEMENT, JIRA, AGILE, MARKET RESEARCH
`,
      },
    ],
  },

  // ── 7. UI/UX Designer — Mid, non-gating "Portfolio Review" stage between assessment and interview ──
  {
    title: 'UI/UX Designer',
    department: 'Design',
    location: 'Bangalore, India',
    type: 'Full-time',
    level: 'Mid (3-5 yrs)',
    salary: '₹14-20 LPA',
    status: 'active' as const,
    description: 'Design intuitive, accessible interfaces for our product, from research through high-fidelity prototypes.',
    responsibilities: 'Conduct user research to inform design decisions\nCreate wireframes and prototypes in Figma\nMaintain and extend the design system\nCollaborate with engineering on implementation',
    requiredSkills: ['Figma', 'User Research', 'Wireframing', 'Prototyping', 'Design Systems'],
    niceToHaveSkills: ['Sketch', 'Adobe XD', 'HTML/CSS'],
    education: "Bachelor's in Design or related field",
    hiringManager: 'Anita Desai',
    threshold: 65,
    autoRank: true,
    aiSummary: true,
    biasCheck: false,
    pipeline: [
      { key: 'applied',                label: 'Applied',                color: '#6b7280', icon: 'user',     order: 0 },
      { key: 'resume-screen',          label: 'Resume Screen',          color: '#3b82f6', icon: 'circle',   order: 1 },
      { key: 'take-home-design-task',  label: 'Take Home Design Task',  color: '#06b6d4', icon: 'check',    order: 2 },
      { key: 'portfolio-review',       label: 'Portfolio Review',       color: '#f97316', icon: 'star',     order: 3 },
      { key: 'design-interview',       label: 'Design Interview',       color: '#8b5cf6', icon: 'calendar', order: 4 },
      { key: 'offer',                  label: 'Offer',                  color: '#f59e0b', icon: 'flag',     order: 5 },
      { key: 'hired',                  label: 'Hired',                  color: '#10b981', icon: 'award',    order: 6 },
    ],
    resumes: [
      {
        // Strong practical fit, 4 years experience.
        filename: 'kavya_reddy.txt',
        text: `Kavya Reddy
Bangalore, India | kavya.reddy.design@gmail.com
Mobile No: +91-98450-33119

PROFILE
UI/UX Designer with 4 years of experience designing for consumer mobile apps.

EXPERIENCE
UI/UX Designer, Lumora Apps, Bangalore                     06/2021 - Present
- Conduct user research through interviews and usability testing
- Create wireframes and high-fidelity prototypes in Figma
- Maintain and extend the company's design system
- Collaborate closely with engineering on implementation details

Junior Designer, Pixelgrid Studio, Bangalore               07/2019 - 05/2021
- Created wireframes and prototypes in Figma for client projects
- Contributed to a shared design system component library

EDUCATION
B.Des - Interaction Design
National Institute of Design, Ahmedabad                     2015 - 2019

SKILLS
Figma, User Research, Wireframing, Prototyping, Design Systems, Sketch
`,
      },
      {
        // Listed-only skills: "User Research" and "Design Systems" appear
        // only in the Skills block, never used in a sentence.
        filename: 'rohan_bedi.txt',
        text: `Rohan Bedi
Delhi, India | rohan.bedi.design@gmail.com
Mobile No: +91-98110-44778

PROFILE
UI/UX Designer with 3 years of experience designing web interfaces.

EXPERIENCE
UI/UX Designer, Crestform Studio, Delhi                    08/2022 - Present
- Create wireframes and prototypes in Figma for marketing websites
- Iterate on layouts based on stakeholder feedback

Visual Designer, Inkframe Design, Delhi                    07/2021 - 07/2022
- Created Figma mockups for client websites

EDUCATION
B.Des - Communication Design
Pearl Academy, Delhi                                        2017 - 2021

SKILLS
Figma, User Research, Wireframing, Prototyping, Design Systems, Adobe XD
`,
      },
      {
        // Practical "Adobe XD" usage (nice-to-have) alongside required skills.
        filename: 'lara_fonseca.txt',
        text: `Lara Fonseca
Goa, India | lara.fonseca.design@gmail.com
Mobile No: +91-98220-55119

PROFILE
UI/UX Designer with 5 years of experience across mobile and web products.

EXPERIENCE
Senior UI/UX Designer, Tidehouse Studio, Goa               04/2020 - Present
- Conduct user research, including interviews and surveys, to guide design decisions
- Build wireframes and interactive prototypes using Figma and Adobe XD
- Own and extend the design system used across 4 product teams
- Mentor junior designers on prototyping best practices

UI Designer, Coastline Creative, Goa                       06/2018 - 03/2020
- Designed wireframes and prototypes in Adobe XD for client websites

EDUCATION
B.Des - Visual Communication
MIT Institute of Design, Pune                               2014 - 2018

SKILLS
Figma, User Research, Wireframing, Prototyping, Design Systems, Adobe XD, Sketch
`,
      },
      {
        // Fresher/junior designer, internship only.
        filename: 'yusuf_ansari.txt',
        text: `Yusuf Ansari
Lucknow, India | yusuf.ansari.design@gmail.com
Mobile No: +91-97890-22114

PROFILE
Design graduate seeking an entry-level UI/UX role.

EXPERIENCE
UI/UX Design Intern, Glassframe Studio, Lucknow            01/2024 - 06/2024
- Created wireframes and basic prototypes in Figma under mentor guidance
- Assisted with user research sessions for a campus app project

EDUCATION
B.Des - Product Design
National Institute of Fashion Technology, Lucknow          2020 - 2024

SKILLS
Figma, Wireframing, Prototyping, User Research, Design Systems
`,
      },
      {
        // Overqualified: 10 years for a Mid (3-5 yrs) role — caps at 88.
        filename: 'shalini_kapoor.txt',
        text: `Shalini Kapoor
Mumbai, India | shalini.kapoor.design@gmail.com
Mobile No: +91-98200-66554

PROFILE
Lead UI/UX Designer with 10 years of experience across fintech and e-commerce.

EXPERIENCE
Lead UI/UX Designer, Marquee Digital, Mumbai               05/2015 - Present
- Lead user research initiatives across 3 product squads
- Own the design system used across the company's product suite
- Drive wireframing and prototyping standards in Figma
- Mentor a team of 5 designers

UI/UX Designer, Coreframe Studio, Mumbai                   06/2012 - 04/2015
- Created wireframes and prototypes in Figma, contributed to design system

EDUCATION
B.Des - Interaction Design
Srishti Institute of Art, Design and Technology, Bangalore  2008 - 2012

SKILLS
Figma, User Research, Wireframing, Prototyping, Design Systems, Sketch, Adobe XD
`,
      },
      {
        // Markdown format, strong fit, achievements-rich.
        filename: 'noor_fatima.md',
        text: `# Noor Fatima

Hyderabad, India | noor.fatima.design@gmail.com | Mobile No: +91-90100-44229

## Profile
**UI/UX Designer** with **5 years** of experience designing for SaaS products.

## Experience

**UI/UX Designer**, Vertex Software, Hyderabad — *03/2020 - Present*
- Conduct **user research** through interviews and usability testing
- Create **wireframes** and **prototypes** in **Figma**
- Maintain the company **design system** across web and mobile

## Education
**B.Des - Interaction Design**, JNTU Hyderabad, 2015 - 2019

## Skills
Figma, User Research, Wireframing, Prototyping, Design Systems, HTML/CSS

## Achievements
- Winner, Awwwards "Site of the Day" for a redesigned client website
- Speaker at DesignUp 2023 conference
- Completed Google UX Design Professional Certificate
`,
      },
      {
        // ALL-CAPS template, achievements-empty.
        filename: 'pavel_novak.txt',
        text: `PAVEL NOVAK
PAVEL.NOVAK.DESIGN@GMAIL.COM | +91-98450-77119 | PUNE, INDIA

PROFILE
UI/UX DESIGNER WITH 4 YEARS OF EXPERIENCE IN WEB AND MOBILE DESIGN.

EXPERIENCE
UI/UX DESIGNER, RIVERBEND STUDIO, PUNE                       06/2021 - PRESENT
- CONDUCT USER RESEARCH SESSIONS WITH CUSTOMERS
- CREATE WIREFRAMES AND PROTOTYPES IN FIGMA FOR WEB AND MOBILE
- CONTRIBUTE TO THE COMPANY DESIGN SYSTEM

UI DESIGNER, GREENPATH DESIGN, PUNE                          07/2019 - 05/2021
- CREATED WIREFRAMES AND PROTOTYPES IN FIGMA FOR CLIENT PROJECTS

EDUCATION
B.DES - PRODUCT DESIGN
SYMBIOSIS INSTITUTE OF DESIGN, PUNE                          2015 - 2019

SKILLS
FIGMA, USER RESEARCH, WIREFRAMING, PROTOTYPING, DESIGN SYSTEMS
`,
      },
    ],
  },

  // ── 8. Sales Development Rep (non-tech, fresher) — (0-1 yrs), "Bachelor's (any stream)" ──
  {
    title: 'Sales Development Representative',
    department: 'Sales',
    location: 'Gurgaon, India',
    type: 'Full-time',
    level: '(0-1 yrs)',
    salary: '₹4-6 LPA + incentives',
    status: 'active' as const,
    description: 'Generate and qualify leads for our sales team. A great first sales role for early-career candidates.',
    responsibilities: 'Make outbound cold calls to prospective customers\nLog activity and manage pipeline in CRM software\nGenerate and qualify leads\nCommunicate product value clearly to prospects',
    requiredSkills: ['Cold Calling', 'CRM Software', 'Lead Generation', 'Communication', 'Negotiation'],
    niceToHaveSkills: ['Salesforce', 'Email Outreach'],
    education: "Bachelor's (any stream)",
    hiringManager: 'Tom Becker',
    threshold: 55,
    autoRank: true,
    aiSummary: true,
    biasCheck: false,
    pipeline: [
      { key: 'applied',        label: 'Applied',        color: '#6b7280', icon: 'user',     order: 0 },
      { key: 'resume-screen',  label: 'Resume Screen',  color: '#3b82f6', icon: 'circle',   order: 1 },
      { key: 'phone-screen',   label: 'Phone Screen',   color: '#8b5cf6', icon: 'calendar', order: 2 },
      { key: 'hr-round',       label: 'HR Round',       color: '#ec4899', icon: 'star',     order: 3 },
      { key: 'offer',          label: 'Offer',          color: '#f59e0b', icon: 'flag',     order: 4 },
      { key: 'hired',          label: 'Hired',          color: '#10b981', icon: 'award',    order: 5 },
    ],
    resumes: [
      {
        // Strong fit: fresher with a sales internship, practical CRM/cold-calling.
        filename: 'ritika_chawla.txt',
        text: `Ritika Chawla
Gurgaon, India | ritika.chawla.sales@gmail.com
Mobile No: +91-98730-44112

PROFILE
Recent graduate with strong communication skills, seeking an entry-level sales role.

EXPERIENCE
Sales Intern, Bridgeway Solutions, Gurgaon                 01/2024 - 06/2024
- Made outbound cold calls to prospective customers to introduce the product
- Logged all activity and managed leads in CRM software
- Helped generate and qualify leads through outreach campaigns
- Practiced negotiation techniques during mock sales calls with the team

EDUCATION
B.A. - Economics
Delhi University                                            2021 - 2024

SKILLS
Cold Calling, CRM Software, Lead Generation, Communication, Negotiation
`,
      },
      {
        // No degree mentioned — tests scoreEducation against a "Bachelor's
        // (any stream)" requirement with zero education signal.
        filename: 'manish_thakur.txt',
        text: `Manish Thakur
manish.thakur.sales@gmail.com | +91-98110-33221 | Gurgaon, India

PROFILE
Energetic and motivated candidate looking to start a career in sales. Strong
communication and negotiation skills developed through retail customer service.

EXPERIENCE
Retail Sales Associate, Citywalk Mall, Gurgaon             06/2023 - Present
- Communicated product information to customers and handled objections
- Used negotiation skills to close in-store sales
- Logged customer interactions in the store's CRM software

SKILLS
Cold Calling, CRM Software, Lead Generation, Communication, Negotiation
`,
      },
      {
        // Listed-only skills: "Lead Generation" and "Negotiation" appear only
        // in the Skills block, never used in a sentence.
        filename: 'pranjal_saxena.txt',
        text: `Pranjal Saxena
Noida, India | pranjal.saxena.sales@gmail.com
Mobile No: +91-90120-66332

PROFILE
Graduate seeking an entry-level Sales Development role.

EXPERIENCE
Telecaller, Quickdesk Services, Noida                      03/2024 - Present
- Made cold calls to customers regarding service renewals
- Used CRM software to track call outcomes
- Communicated renewal offers clearly to customers

EDUCATION
B.Com
Amity University, Noida                                     2021 - 2024

SKILLS
Cold Calling, CRM Software, Lead Generation, Communication, Negotiation, Salesforce
`,
      },
      {
        // Domain-mismatch: a software engineer's resume applied to a sales
        // role — <20% required-skill match with 3+ required gaps.
        filename: 'siddharth_jain.txt',
        text: `Siddharth Jain
Bangalore, India | siddharth.jain.dev@gmail.com
Mobile No: +91-98450-99220

PROFILE
Software Engineer with 2 years of experience in web development.

EXPERIENCE
Software Engineer, Codeloop Systems, Bangalore             07/2023 - Present
- Built REST APIs using Node.js and Express
- Worked with MongoDB for data storage
- Wrote JavaScript for frontend integrations

EDUCATION
B.Tech - Computer Science
PES University, Bangalore                                   2019 - 2023

SKILLS
Node.js, Express, MongoDB, JavaScript, REST API, Git
`,
      },
      {
        // Overqualified: 8 years of sales experience for a (0-1 yrs) role —
        // tests scoreExperience's ">range.max + 2" branch.
        filename: 'harpreet_singh.txt',
        text: `Harpreet Singh
Chandigarh, India | harpreet.singh.sales@gmail.com
Mobile No: +91-98140-66773

PROFILE
Sales professional with 8 years of experience in B2C sales and lead generation.

EXPERIENCE
Senior Sales Executive, Crestline Retail, Chandigarh       04/2016 - Present
- Lead cold calling campaigns and manage a team's CRM software pipeline
- Generate and qualify leads for the regional sales team
- Train junior reps on negotiation and communication techniques

Sales Executive, Northgate Mobiles, Chandigarh             06/2014 - 03/2016
- Made cold calls and managed leads using CRM software

EDUCATION
B.Com
Panjab University, Chandigarh                               2011 - 2014

SKILLS
Cold Calling, CRM Software, Lead Generation, Communication, Negotiation, Salesforce
`,
      },
      {
        // Markdown format, strong fit.
        filename: 'ankita_verma.md',
        text: `# Ankita Verma

Gurgaon, India | ankita.verma.sales@gmail.com | Mobile No: +91-99580-22119

## Profile
Enthusiastic recent graduate seeking an entry-level **Sales Development Representative** role.

## Experience

**Sales Trainee**, Brightedge Solutions, Gurgaon — *02/2024 - Present*
- Make outbound **cold calls** to prospective customers daily
- Manage leads using **CRM software**
- Support **lead generation** campaigns for the sales team
- Practice **negotiation** and **communication** skills in daily roleplay sessions

## Education
**BBA**, Maharshi Dayanand University, 2021 - 2024

## Skills
Cold Calling, CRM Software, Lead Generation, Communication, Negotiation
`,
      },
      {
        // ALL-CAPS template, no location at all — "Location Not Found".
        filename: 'vivaan_chopra.txt',
        text: `VIVAAN CHOPRA
VIVAAN.CHOPRA.SALES@GMAIL.COM | +91-98230-77114

PROFILE
RECENT GRADUATE SEEKING AN ENTRY-LEVEL SALES DEVELOPMENT ROLE.

EXPERIENCE
SALES INTERN, NORTHPOINT MEDIA                               01/2024 - 06/2024
- MADE COLD CALLS TO PROSPECTIVE ADVERTISERS
- LOGGED LEAD GENERATION ACTIVITY IN CRM SOFTWARE
- COMMUNICATED PACKAGE OFFERS TO PROSPECTS AND NEGOTIATED TERMS

EDUCATION
B.A. - MASS COMMUNICATION
2021 - 2024

SKILLS
COLD CALLING, CRM SOFTWARE, LEAD GENERATION, COMMUNICATION, NEGOTIATION
`,
      },
    ],
  },

  // ── 9. Mobile Engineer (React Native) — Senior, curated mobile-development ladder + alias skills ──
  {
    title: 'Mobile Engineer (React Native)',
    department: 'Engineering',
    location: 'Bangalore, India',
    type: 'Full-time',
    level: 'Senior (6-10 yrs)',
    salary: '₹30-45 LPA',
    status: 'active' as const,
    description: 'Build and scale our cross-platform mobile app used by millions of users, with deep native iOS and Android expertise.',
    responsibilities: 'Build features in React Native and JavaScript\nWork with native iOS and Android modules\nOwn mobile app architecture decisions\nMentor junior mobile engineers',
    requiredSkills: ['React Native', 'JavaScript', 'iOS Development', 'Android Development', 'Mobile App Architecture'],
    niceToHaveSkills: ['Swift', 'Kotlin', 'TypeScript'],
    education: "Bachelor's in Computer Science",
    hiringManager: 'Vivek Sharma',
    threshold: 75,
    autoRank: true,
    aiSummary: true,
    biasCheck: false,
    pipeline: [
      { key: 'applied',             label: 'Applied',             color: '#6b7280', icon: 'user',     order: 0 },
      { key: 'resume-screen',       label: 'Resume Screen',       color: '#3b82f6', icon: 'circle',   order: 1 },
      { key: 'coding-test',         label: 'Coding Test',         color: '#06b6d4', icon: 'check',    order: 2 },
      { key: 'technical-interview', label: 'Technical Interview', color: '#8b5cf6', icon: 'calendar', order: 3 },
      { key: 'hr-round',            label: 'HR Round',            color: '#ec4899', icon: 'star',     order: 4 },
      { key: 'offer',               label: 'Offer',               color: '#f59e0b', icon: 'flag',     order: 5 },
      { key: 'hired',               label: 'Hired',               color: '#10b981', icon: 'award',    order: 6 },
    ],
    resumes: [
      {
        // Strong practical fit, 8 years, including Swift/Kotlin native work.
        filename: 'arnav_sethi.txt',
        text: `Arnav Sethi
Bangalore, India | arnav.sethi.mobile@gmail.com
Mobile No: +91-98450-22667

PROFILE
Senior Mobile Engineer with 8 years of experience building cross-platform and
native mobile applications.

EXPERIENCE
Senior Mobile Engineer, Quantum Apps, Bangalore            05/2017 - Present
- Build core features in React Native and JavaScript for an app with 5M+ users
- Write native iOS modules in Swift for camera and payments integrations
- Write native Android modules in Kotlin for background sync
- Own mobile app architecture decisions across the React Native codebase
- Mentor 3 junior mobile engineers

Mobile Developer, Skyline Apps, Bangalore                  06/2014 - 04/2017
- Built React Native features and basic iOS Development and Android Development work

EDUCATION
B.Tech - Computer Science
PES University, Bangalore                                   2010 - 2014

SKILLS
React Native, JavaScript, iOS Development, Android Development, Mobile App Architecture, Swift, Kotlin, TypeScript
`,
      },
      {
        // Practical "Objective-C" usage as evidence of iOS Development —
        // related-skill credit via static SKILL_RELATIONS (if mapped).
        filename: 'olivia_fernandes.txt',
        text: `Olivia Fernandes
Goa, India | olivia.fernandes.mobile@gmail.com
Mobile No: +91-98220-44119

PROFILE
Senior Mobile Engineer with 7 years of experience in React Native and native iOS development.

EXPERIENCE
Senior Mobile Engineer, Tidal Apps, Goa                    03/2018 - Present
- Build features in React Native and JavaScript for a travel booking app
- Maintain legacy native modules written in Objective-C for camera and maps
- Write Kotlin code for Android-specific integrations
- Contribute to mobile app architecture decisions for the React Native codebase

Mobile Developer, Coastal Software, Goa                    06/2015 - 02/2018
- Built React Native screens and JavaScript business logic

EDUCATION
B.E. - Computer Engineering
Goa Engineering College                                     2011 - 2015

SKILLS
React Native, JavaScript, Objective-C, Android Development, Mobile App Architecture, Kotlin
`,
      },
      {
        // Listed-only skills: "Mobile App Architecture" and "Android
        // Development" appear only in the Skills block, never in a sentence.
        filename: 'rishabh_malhotra.txt',
        text: `Rishabh Malhotra
Delhi, India | rishabh.malhotra.mobile@gmail.com
Mobile No: +91-98110-66229

PROFILE
Senior Mobile Engineer with 7 years of experience in React Native development.

EXPERIENCE
Senior Mobile Engineer, Northbeam Apps, Delhi              04/2018 - Present
- Build features in React Native and JavaScript for a food delivery app
- Write native iOS modules in Swift for push notifications

Mobile Developer, Eastline Software, Delhi                 06/2015 - 03/2018
- Built React Native screens for an internal logistics app

EDUCATION
B.Tech - Information Technology
Delhi Technological University                             2011 - 2015

SKILLS
React Native, JavaScript, iOS Development, Android Development, Mobile App Architecture, Swift
`,
      },
      {
        // Fuzzy/typo skill spelling "Andriod Development" (edit distance 1
        // from "Android Development") — tests levenshteinAtMost1.
        filename: 'tanya_bhatt.txt',
        text: `Tanya Bhatt
Mumbai, India | tanya.bhatt.mobile@gmail.com
Mobile No: +91-98200-33667

PROFILE
Senior Mobile Engineer with 7 years of experience across React Native and native platforms.

EXPERIENCE
Senior Mobile Engineer, Westline Apps, Mumbai              05/2018 - Present
- Build features in React Native and JavaScript for a fintech app
- Write native iOS Development modules in Swift
- Lead Andriod Development efforts using Kotlin for the payments module
- Drive mobile app architecture decisions for the team

Mobile Developer, Coreapp Studio, Mumbai                   06/2015 - 04/2018
- Built React Native screens and basic native modules

EDUCATION
B.E. - Computer Engineering
University of Mumbai                                        2011 - 2015

SKILLS
React Native, JavaScript, iOS Development, Andriod Development, Mobile App Architecture, Swift, Kotlin
`,
      },
      {
        // Below the range: 3 years for a Senior (6-10 yrs) role — tests the
        // low end of scoreExperience's gap formula.
        filename: 'jatin_verma.txt',
        text: `Jatin Verma
Pune, India | jatin.verma.mobile@gmail.com
Mobile No: +91-98220-77115

PROFILE
Mobile Engineer with 3 years of experience in React Native development.

EXPERIENCE
Mobile Engineer, Loopcraft Apps, Pune                      07/2022 - Present
- Build features in React Native and JavaScript for a retail app
- Write basic native iOS Development and Android Development fixes as needed
- Contribute to mobile app architecture discussions

EDUCATION
B.Tech - Computer Science
College of Engineering, Pune                                2018 - 2022

SKILLS
React Native, JavaScript, iOS Development, Android Development, Mobile App Architecture
`,
      },
      {
        // Overqualified: 15 years for a Senior (6-10 yrs) role — caps at 88.
        filename: 'rakesh_iyer.txt',
        text: `Rakesh Iyer
Chennai, India | rakesh.iyer.mobile@gmail.com
Mobile No: +91-98410-55229

PROFILE
Principal Mobile Engineer with 15 years of experience across native and
cross-platform mobile development.

EXPERIENCE
Principal Mobile Engineer, Vertex Mobile, Chennai          04/2010 - Present
- Direct mobile app architecture across a portfolio of React Native apps
- Oversee native iOS Development (Swift) and Android Development (Kotlin) teams
- Build core React Native and JavaScript modules used across all apps
- Mentor 10+ mobile engineers

Senior iOS Developer, Coastline Apps, Chennai              06/2006 - 03/2010
- Built native iOS apps, early adoption of React Native

EDUCATION
B.E. - Computer Science
Anna University, Chennai                                    2002 - 2006

SKILLS
React Native, JavaScript, iOS Development, Android Development, Mobile App Architecture, Swift, Kotlin, TypeScript
`,
      },
      {
        // Markdown format, strong fit.
        filename: 'celine_dsouza.md',
        text: `# Celine D'Souza

Bangalore, India | celine.dsouza.mobile@gmail.com | Mobile No: +91-98450-11774

## Profile
**Senior Mobile Engineer** with **8 years** of experience in **React Native** and native mobile development.

## Experience

**Senior Mobile Engineer**, Northcore Apps, Bangalore — *02/2017 - Present*
- Build features in **React Native** and **JavaScript** for a ride-hailing app
- Write native **iOS** modules in **Swift** and **Android** modules in **Kotlin**
- Own **mobile app architecture** decisions for the React Native codebase

## Education
**B.Tech - Computer Science**, RV College of Engineering, Bangalore, 2009 - 2013

## Skills
React Native, JavaScript, iOS Development, Android Development, Mobile App Architecture, Swift, Kotlin
`,
      },
      {
        // ALL-CAPS template.
        filename: 'hassan_ali.txt',
        text: `HASSAN ALI
HASSAN.ALI.MOBILE@GMAIL.COM | +91-98230-66112 | HYDERABAD, INDIA

PROFILE
SENIOR MOBILE ENGINEER WITH 7 YEARS OF EXPERIENCE IN REACT NATIVE.

EXPERIENCE
SENIOR MOBILE ENGINEER, SOUTHPEAK APPS, HYDERABAD            03/2018 - PRESENT
- BUILD FEATURES IN REACT NATIVE AND JAVASCRIPT FOR A HEALTHCARE APP
- WRITE NATIVE IOS DEVELOPMENT MODULES IN SWIFT
- WRITE NATIVE ANDROID DEVELOPMENT MODULES IN KOTLIN
- OWN MOBILE APP ARCHITECTURE FOR THE TEAM'S REACT NATIVE CODEBASE

MOBILE DEVELOPER, EASTGATE SOFTWARE, HYDERABAD               06/2015 - 02/2018
- BUILT REACT NATIVE SCREENS AND BASIC NATIVE MODULES

EDUCATION
B.TECH - COMPUTER SCIENCE
JNTU HYDERABAD                                               2011 - 2015

SKILLS
REACT NATIVE, JAVASCRIPT, IOS DEVELOPMENT, ANDROID DEVELOPMENT, MOBILE APP ARCHITECTURE, SWIFT, KOTLIN
`,
      },
    ],
  },

  // ── 10. HR Business Partner — Director (8-15+ yrs), overqualified-candidate target ──
  {
    title: 'HR Business Partner',
    department: 'Human Resources',
    location: 'Mumbai, India',
    type: 'Full-time',
    level: 'Director (8-15+ yrs)',
    salary: '₹35-55 LPA',
    status: 'active' as const,
    description: 'Partner with senior leadership to drive HR strategy, talent management, and employee relations across the organization.',
    responsibilities: 'Own HR operations for assigned business units\nManage employee relations and conflict resolution\nDrive talent management and succession planning\nMaintain HRIS data integrity\nLead performance management cycles',
    requiredSkills: ['HR Operations', 'Employee Relations', 'Talent Management', 'HRIS', 'Performance Management'],
    niceToHaveSkills: ['Compensation & Benefits', 'Labor Law'],
    education: "MBA in Human Resources or related field",
    hiringManager: 'Tom Becker',
    threshold: 70,
    autoRank: true,
    aiSummary: true,
    biasCheck: true,
    pipeline: [
      { key: 'applied',              label: 'Applied',              color: '#6b7280', icon: 'user',     order: 0 },
      { key: 'resume-screen',        label: 'Resume Screen',        color: '#3b82f6', icon: 'circle',   order: 1 },
      { key: 'hr-panel-interview',   label: 'HR Panel Interview',   color: '#8b5cf6', icon: 'calendar', order: 2 },
      { key: 'leadership-interview', label: 'Leadership Interview', color: '#06b6d4', icon: 'calendar', order: 3 },
      { key: 'offer',                label: 'Offer',                color: '#f59e0b', icon: 'flag',     order: 4 },
      { key: 'hired',                label: 'Hired',                color: '#10b981', icon: 'award',    order: 5 },
    ],
    resumes: [
      {
        // Strong fit at the Director level — 12 years.
        filename: 'shreya_kulkarni.txt',
        text: `Shreya Kulkarni
Mumbai, India | shreya.kulkarni.hr@gmail.com
Mobile No: +91-98200-44119

PROFILE
HR Business Partner with 12 years of experience supporting business units
across mid-to-large organizations.

EXPERIENCE
HR Business Partner, Vantage Corp, Mumbai                  04/2016 - Present
- Own HR operations for a 600-employee business unit
- Manage employee relations cases and conflict resolution
- Drive talent management and succession planning for senior roles
- Maintain HRIS data integrity across the unit
- Lead performance management cycles for 600+ employees

HR Manager, Coreline Industries, Mumbai                    06/2012 - 03/2016
- Managed employee relations and HRIS records for a 300-employee division
- Supported performance management cycle administration

EDUCATION
MBA - Human Resources
Narsee Monjee Institute of Management Studies, Mumbai      2010 - 2012

SKILLS
HR Operations, Employee Relations, Talent Management, HRIS, Performance Management, Labor Law
`,
      },
      {
        // Overqualified: 25 years (CHRO-level) for a Director (8-15+ yrs)
        // role — tests scoreExperience's ">range.max + 2" branch (caps at 88).
        filename: 'rajiv_malhotra.txt',
        text: `Rajiv Malhotra
Delhi, India | rajiv.malhotra.hr@gmail.com
Mobile No: +91-98110-99221

PROFILE
Chief Human Resources Officer with 25 years of experience leading HR functions
for large enterprises.

EXPERIENCE
CHRO, Continental Industries, Delhi                        01/2008 - Present
- Own HR operations and strategy for a 10,000+ employee organization
- Oversee employee relations, talent management, and performance management company-wide
- Lead HRIS modernization initiatives across business units

VP HR, Sterling Manufacturing, Delhi                       06/1999 - 12/2007
- Managed employee relations and talent management for a 3,000-employee plant

EDUCATION
MBA - Human Resources
Faculty of Management Studies, Delhi University             1997 - 1999

SKILLS
HR Operations, Employee Relations, Talent Management, HRIS, Performance Management, Compensation & Benefits, Labor Law
`,
      },
      {
        // Below the range: 5 years for a Director (8-15+ yrs) role — tests the
        // low end of scoreExperience's gap formula.
        filename: 'anjali_bhatia.txt',
        text: `Anjali Bhatia
Pune, India | anjali.bhatia.hr@gmail.com
Mobile No: +91-98220-33665

PROFILE
HR professional with 5 years of experience in employee relations and HR operations.

EXPERIENCE
HR Generalist, Northbridge Tech, Pune                      06/2020 - Present
- Support HR operations for a 200-employee office
- Handle employee relations queries and escalations
- Maintain HRIS records and assist with performance management cycles

HR Associate, Coreview Systems, Pune                       07/2019 - 05/2020
- Assisted with HRIS data entry and onboarding

EDUCATION
MBA - Human Resources
Symbiosis Institute of Business Management, Pune           2017 - 2019

SKILLS
HR Operations, Employee Relations, HRIS, Performance Management, Talent Management
`,
      },
      {
        // Listed-only skills: "Talent Management" and "HRIS" appear only in
        // the Skills block, never used in a sentence.
        filename: 'farhan_qureshi.txt',
        text: `Farhan Qureshi
Hyderabad, India | farhan.qureshi.hr@gmail.com
Mobile No: +91-90100-66332

PROFILE
HR Business Partner with 9 years of experience in employee relations and HR operations.

EXPERIENCE
HR Business Partner, Coreline Tech, Hyderabad             05/2017 - Present
- Own HR operations for a 400-employee business unit
- Manage employee relations cases and escalations
- Support performance management cycle administration

HR Manager, Brightfield Systems, Hyderabad                06/2014 - 04/2017
- Handled employee relations and HR operations tasks

EDUCATION
MBA - Human Resources
ICFAI Business School, Hyderabad                            2012 - 2014

SKILLS
HR Operations, Employee Relations, Talent Management, HRIS, Performance Management, Labor Law
`,
      },
      {
        // Domain-mismatch: a software engineer's resume applied to an HRBP
        // role — <20% required-skill match with 3+ required gaps.
        filename: 'aakash_verma.txt',
        text: `Aakash Verma
Bangalore, India | aakash.verma.dev@gmail.com
Mobile No: +91-98450-77332

PROFILE
Software Engineer with 9 years of experience in backend systems.

EXPERIENCE
Senior Software Engineer, Coreloop Systems, Bangalore     04/2016 - Present
- Built REST APIs using Java and Spring Boot
- Designed PostgreSQL schemas for high-traffic systems
- Led a team of 4 engineers

EDUCATION
B.Tech - Computer Science
PES University, Bangalore                                   2012 - 2016

SKILLS
Java, Spring Boot, PostgreSQL, REST API, Git, Kubernetes
`,
      },
      {
        // Markdown format, strong fit.
        filename: 'divya_menon.md',
        text: `# Divya Menon

Chennai, India | divya.menon.hr@gmail.com | Mobile No: +91-98410-55229

## Profile
**HR Business Partner** with **11 years** of experience across IT services organizations.

## Experience

**HR Business Partner**, Tideline Software, Chennai — *03/2017 - Present*
- Own **HR operations** for a 500-employee business unit
- Manage **employee relations** cases and resolution
- Drive **talent management** programs including succession planning
- Maintain **HRIS** records and lead **performance management** cycles

## Education
**MBA - Human Resources**, Loyola Institute of Business Administration, Chennai, 2009 - 2011

## Skills
HR Operations, Employee Relations, Talent Management, HRIS, Performance Management, Compensation & Benefits
`,
      },
      {
        // ALL-CAPS template + no degree mentioned (MBA required) — tests
        // scoreEducation with zero education signal against an MBA requirement.
        filename: 'oscar_lima.txt',
        text: `OSCAR LIMA
OSCAR.LIMA.HR@GMAIL.COM | +91-98200-11774 | GOA, INDIA

PROFILE
HR BUSINESS PARTNER WITH 10 YEARS OF EXPERIENCE IN EMPLOYEE RELATIONS AND
TALENT MANAGEMENT, RISEN THROUGH THE RANKS WITHOUT A FORMAL HR DEGREE.

EXPERIENCE
HR BUSINESS PARTNER, COASTAL ENTERPRISES, GOA                04/2016 - PRESENT
- OWN HR OPERATIONS FOR A 350-EMPLOYEE BUSINESS UNIT
- MANAGE EMPLOYEE RELATIONS CASES ACROSS THE REGION
- DRIVE TALENT MANAGEMENT AND PERFORMANCE MANAGEMENT CYCLES
- MAINTAIN HRIS RECORDS FOR THE UNIT

HR EXECUTIVE, SUNCOAST RESORTS, GOA                          06/2013 - 03/2016
- HANDLED EMPLOYEE RELATIONS AND HRIS DATA ENTRY

SKILLS
HR OPERATIONS, EMPLOYEE RELATIONS, TALENT MANAGEMENT, HRIS, PERFORMANCE MANAGEMENT
`,
      },
    ],
  },

  // ── 11. Data Engineer — Mid-Senior (4-8 yrs), "Apache Pinot" = truly novel guaranteed-missing skill ──
  {
    title: 'Data Engineer',
    department: 'Data Engineering',
    location: 'Hyderabad, India',
    type: 'Full-time',
    level: 'Mid-Senior (4-8 yrs)',
    salary: '₹22-32 LPA',
    status: 'active' as const,
    description: 'Build and operate data pipelines powering analytics and real-time features across the platform.',
    responsibilities: 'Build data pipelines using Python and SQL\nOperate Kafka-based streaming pipelines\nSchedule workflows with Airflow\nProcess large datasets with Spark\nServe real-time analytics via Apache Pinot',
    requiredSkills: ['Python', 'SQL', 'Kafka', 'Airflow', 'Spark', 'Apache Pinot'],
    niceToHaveSkills: ['AWS', 'Docker', 'Snowflake'],
    education: "Bachelor's in Computer Science or related field",
    hiringManager: 'Dev Patel',
    threshold: 72,
    autoRank: true,
    aiSummary: true,
    biasCheck: false,
    pipeline: [
      { key: 'applied',             label: 'Applied',             color: '#6b7280', icon: 'user',     order: 0 },
      { key: 'resume-screen',       label: 'Resume Screen',       color: '#3b82f6', icon: 'circle',   order: 1 },
      { key: 'coding-test',         label: 'Coding Test',         color: '#06b6d4', icon: 'check',    order: 2 },
      { key: 'technical-interview', label: 'Technical Interview', color: '#8b5cf6', icon: 'calendar', order: 3 },
      { key: 'hr-round',            label: 'HR Round',            color: '#ec4899', icon: 'star',     order: 4 },
      { key: 'offer',               label: 'Offer',               color: '#f59e0b', icon: 'flag',     order: 5 },
      { key: 'hired',               label: 'Hired',               color: '#10b981', icon: 'award',    order: 6 },
    ],
    resumes: [
      {
        // Strong practical fit, 6 years; "Apache Pinot" genuinely absent —
        // guaranteed hard-miss for that gap.
        filename: 'kiran_desai.txt',
        text: `Kiran Desai
Hyderabad, India | kiran.desai.de@gmail.com
Mobile No: +91-90100-44778

PROFILE
Data Engineer with 6 years of experience building streaming and batch data
pipelines.

EXPERIENCE
Senior Data Engineer, Pulseflow Data, Hyderabad           06/2019 - Present
- Build data pipelines using Python and SQL for analytics workloads
- Operate Kafka-based streaming pipelines for clickstream data
- Schedule and monitor workflows using Airflow
- Process large datasets with Spark for daily batch jobs
- Mentor 2 junior data engineers

Data Engineer, Coreflow Systems, Hyderabad                07/2017 - 05/2019
- Built ETL pipelines in Python and SQL
- Used Spark for data transformation jobs

EDUCATION
B.Tech - Computer Science
JNTU Hyderabad                                              2013 - 2017

SKILLS
Python, SQL, Kafka, Airflow, Spark, AWS, Docker

ACHIEVEMENTS
- Reduced pipeline latency by 35% by redesigning the Kafka consumer architecture
- Built a self-service Airflow DAG template adopted by 4 teams
`,
      },
      {
        // Listed-only skills: "Airflow" and "Spark" appear only in the Skills
        // block, never used in a sentence.
        filename: 'mohit_agarwal.txt',
        text: `Mohit Agarwal
Pune, India | mohit.agarwal.de@gmail.com
Mobile No: +91-98220-66110

PROFILE
Data Engineer with 5 years of experience building data pipelines.

EXPERIENCE
Data Engineer, Streamline Data, Pune                       04/2020 - Present
- Build data pipelines in Python and SQL for the analytics team
- Operate Kafka topics for event ingestion

Data Engineer, Coreview Analytics, Pune                    06/2018 - 03/2020
- Wrote Python and SQL scripts for ETL jobs

EDUCATION
B.E. - Information Technology
College of Engineering, Pune                                2014 - 2018

SKILLS
Python, SQL, Kafka, Airflow, Spark, Snowflake
`,
      },
      {
        // Fuzzy/typo skill spelling "Airflo" (edit distance 1 from "Airflow")
        // — tests levenshteinAtMost1.
        filename: 'sandra_lobo.txt',
        text: `Sandra Lobo
Mumbai, India | sandra.lobo.de@gmail.com
Mobile No: +91-98200-33119

PROFILE
Data Engineer with 5 years of experience in Python and SQL-based data pipelines.

EXPERIENCE
Data Engineer, Tidalwave Data, Mumbai                      05/2020 - Present
- Build data pipelines in Python and SQL for marketing analytics
- Operate Kafka consumers for real-time event processing
- Schedule batch jobs using Airflo for daily reporting pipelines
- Process large datasets using Spark for monthly aggregations

EDUCATION
B.Sc - Computer Science
University of Mumbai                                        2015 - 2019

SKILLS
Python, SQL, Kafka, Airflo, Spark, AWS
`,
      },
      {
        // Overqualified: 14 years for a Mid-Senior (4-8 yrs) role — caps at 88.
        filename: 'rohan_chowdhury.txt',
        text: `Rohan Chowdhury
Kolkata, India | rohan.chowdhury.de@gmail.com
Mobile No: +91-98300-55229

PROFILE
Principal Data Engineer with 14 years of experience designing large-scale
data platforms.

EXPERIENCE
Principal Data Engineer, Northstar Data, Kolkata          04/2012 - Present
- Architect data pipelines in Python and SQL across the data platform
- Own Kafka infrastructure for real-time event streaming
- Set Airflow standards used by 6 data teams
- Lead Spark-based batch processing architecture

Senior Data Engineer, Coreline Analytics, Kolkata          06/2009 - 03/2012
- Built ETL pipelines in Python and SQL, early Spark adoption

EDUCATION
B.Tech - Computer Science
Indian Institute of Technology, Kharagpur                   2005 - 2009

SKILLS
Python, SQL, Kafka, Airflow, Spark, AWS, Docker, Snowflake
`,
      },
      {
        // Below the range: 2 years for a Mid-Senior (4-8 yrs) role — tests
        // the low end of scoreExperience's gap formula.
        filename: 'priya_nambiar.txt',
        text: `Priya Nambiar
Bangalore, India | priya.nambiar.de@gmail.com
Mobile No: +91-98450-11669

PROFILE
Data Engineer with 2 years of experience building data pipelines.

EXPERIENCE
Data Engineer, Brightline Data, Bangalore                  07/2023 - Present
- Build data pipelines in Python and SQL for product analytics
- Operate Kafka topics for event ingestion
- Write basic Airflow DAGs for scheduled jobs

EDUCATION
B.Tech - Computer Science
PES University, Bangalore                                   2019 - 2023

SKILLS
Python, SQL, Kafka, Airflow, Spark
`,
      },
      {
        // Markdown format, strong fit.
        filename: 'wei_zhang.md',
        text: `# Wei Zhang

Bangalore, India | wei.zhang.de@gmail.com | Mobile No: +91-98220-77004

## Profile
**Data Engineer** with **7 years** of experience building **Python**/**SQL** data pipelines at scale.

## Experience

**Senior Data Engineer**, Northflow Analytics, Bangalore — *02/2018 - Present*
- Build data pipelines using **Python** and **SQL** for real-time analytics
- Operate **Kafka** clusters for event streaming
- Schedule workflows with **Airflow** across 10+ DAGs
- Process petabyte-scale datasets with **Spark**

## Education
**B.Tech - Computer Science**, Tsinghua University, 2010 - 2014

## Skills
Python, SQL, Kafka, Airflow, Spark, AWS, Docker
`,
      },
      {
        // ALL-CAPS template.
        filename: 'anand_krishnan.txt',
        text: `ANAND KRISHNAN
ANAND.KRISHNAN.DE@GMAIL.COM | +91-98410-66332 | CHENNAI, INDIA

PROFILE
DATA ENGINEER WITH 6 YEARS OF EXPERIENCE BUILDING DATA PIPELINES.

EXPERIENCE
SENIOR DATA ENGINEER, SOUTHBRIDGE DATA, CHENNAI              03/2019 - PRESENT
- BUILD DATA PIPELINES USING PYTHON AND SQL FOR FINANCE ANALYTICS
- OPERATE KAFKA STREAMING PIPELINES FOR TRANSACTION EVENTS
- SCHEDULE WORKFLOWS USING AIRFLOW ACROSS MULTIPLE TEAMS
- PROCESS LARGE DATASETS WITH SPARK FOR MONTHLY CLOSE REPORTING

DATA ENGINEER, EASTBRIDGE SYSTEMS, CHENNAI                   06/2017 - 02/2019
- BUILT ETL PIPELINES IN PYTHON AND SQL

EDUCATION
B.E. - COMPUTER SCIENCE
ANNA UNIVERSITY                                              2013 - 2017

SKILLS
PYTHON, SQL, KAFKA, AIRFLOW, SPARK, AWS
`,
      },
    ],
  },

  // ── 12. Full-Stack Engineer (Contract/Remote) — (2-4 yrs), "Bootcamp/self-taught OK" ──
  {
    title: 'Full-Stack Engineer (Contract)',
    department: 'Engineering',
    location: 'Remote',
    type: 'Contract',
    level: '(2-4 yrs)',
    salary: '$35-55/hr',
    status: 'active' as const,
    description: 'Contract full-stack role building features end-to-end across our React/Node.js product. Remote, flexible hours.',
    responsibilities: 'Build UI features in React and JavaScript\nBuild backend APIs in Node.js\nWrite SQL queries for application data\nUse Git for version control',
    requiredSkills: ['JavaScript', 'React', 'Node.js', 'SQL', 'Git'],
    niceToHaveSkills: ['TypeScript', 'GraphQL', 'AWS'],
    education: "Bootcamp/self-taught OK",
    hiringManager: 'Anita Desai',
    threshold: 60,
    autoRank: true,
    aiSummary: true,
    biasCheck: false,
    pipeline: [
      { key: 'applied',             label: 'Applied',             color: '#6b7280', icon: 'user',     order: 0 },
      { key: 'resume-screen',       label: 'Resume Screen',       color: '#3b82f6', icon: 'circle',   order: 1 },
      { key: 'take-home-project',   label: 'Take Home Project',   color: '#06b6d4', icon: 'check',    order: 2 },
      { key: 'technical-interview', label: 'Technical Interview', color: '#8b5cf6', icon: 'calendar', order: 3 },
      { key: 'offer',               label: 'Offer',               color: '#f59e0b', icon: 'flag',     order: 4 },
      { key: 'hired',               label: 'Hired',               color: '#10b981', icon: 'award',    order: 5 },
    ],
    resumes: [
      {
        // Strong fit, bootcamp grad, 3 years experience.
        filename: 'leon_marsh.txt',
        text: `Leon Marsh
Remote | leon.marsh.dev@gmail.com
Mobile No: +1-415-555-0182

PROFILE
Full-stack developer with 3 years of experience, bootcamp graduate.

EXPERIENCE
Full-Stack Developer, Brightwave Apps (Remote)             05/2022 - Present
- Build UI features in React and JavaScript for a SaaS dashboard
- Build backend APIs in Node.js for the same product
- Write SQL queries against a Postgres database for reporting features
- Use Git for version control with a small distributed team

EDUCATION
Full-Stack Web Development Bootcamp
App Academy                                                 2021 - 2022

SKILLS
JavaScript, React, Node.js, SQL, Git, TypeScript
`,
      },
      {
        // PhD candidate applying to a "Bootcamp/self-taught OK" role —
        // requiredEducationLevel=0, tests scoreEducation's "more than
        // required" branch when essentially nothing is required.
        filename: 'dr_helena_voss.txt',
        text: `Dr. Helena Voss
Remote | helena.voss.dev@gmail.com
Mobile No: +49-151-2345-6789

PROFILE
Full-stack developer with a PhD in Computer Science and 4 years of industry
experience after academia.

EXPERIENCE
Full-Stack Developer, Glassbridge Software (Remote)        06/2021 - Present
- Build features in React and JavaScript for a research-data platform
- Build Node.js APIs for data ingestion services
- Write SQL queries for analytics on research datasets
- Use Git for version control across the team

EDUCATION
PhD - Computer Science
Technical University of Munich                             2014 - 2018

M.Sc - Computer Science
Technical University of Munich                             2012 - 2014

SKILLS
JavaScript, React, Node.js, SQL, Git, GraphQL
`,
      },
      {
        // Fully self-taught, no degree mentioned at all — the canonical
        // match for "Bootcamp/self-taught OK".
        filename: 'jordan_pierce.txt',
        text: `Jordan Pierce
jordan.pierce.dev@gmail.com | +1-202-555-0147 | Remote

PROFILE
Self-taught full-stack developer with 2 years of professional experience,
learned through online courses and personal projects before going professional.

EXPERIENCE
Full-Stack Developer, Driftcode Studio (Remote)            03/2023 - Present
- Build UI features in React and JavaScript for client web apps
- Build Node.js backend APIs and write SQL queries for client databases
- Use Git for version control on all client projects

SKILLS
JavaScript, React, Node.js, SQL, Git
`,
      },
      {
        // Listed-only skills: "SQL" and "Git" appear only in the Skills
        // block, never used in a sentence.
        filename: 'mariana_costa.txt',
        text: `Mariana Costa
Remote | mariana.costa.dev@gmail.com
Mobile No: +55-11-91234-5678

PROFILE
Full-stack developer with 3 years of experience in React and Node.js.

EXPERIENCE
Full-Stack Developer, Riverline Software (Remote)          04/2022 - Present
- Build UI features in React and JavaScript for a booking platform
- Build backend APIs in Node.js for booking and payments

Frontend Developer, Codecrest Studio (Remote)              06/2021 - 03/2022
- Built React components for marketing pages

EDUCATION
Web Development Bootcamp
Le Wagon                                                     2020 - 2021

SKILLS
JavaScript, React, Node.js, SQL, Git, TypeScript, AWS
`,
      },
      {
        // Overqualified: 10 years for a (2-4 yrs) contract role — caps at 88.
        filename: 'victor_huang.txt',
        text: `Victor Huang
Remote | victor.huang.dev@gmail.com
Mobile No: +1-647-555-0193

PROFILE
Full-stack engineer with 10 years of experience across React and Node.js platforms.

EXPERIENCE
Staff Full-Stack Engineer, Northline Software (Remote)     03/2015 - Present
- Architect React and JavaScript front-ends for multiple products
- Build and operate Node.js backend services
- Write complex SQL queries for reporting across services
- Use Git for version control and code review across teams

EDUCATION
B.Sc - Computer Science
University of Toronto                                       2010 - 2014

SKILLS
JavaScript, React, Node.js, SQL, Git, TypeScript, GraphQL, AWS
`,
      },
      {
        // Below the range: fresher with 0-1 yrs for a (2-4 yrs) contract role.
        filename: 'noah_bennett.txt',
        text: `Noah Bennett
Remote | noah.bennett.dev@gmail.com
Mobile No: +1-312-555-0124

PROFILE
Junior full-stack developer with 1 year of experience, self-taught via online bootcamp.

EXPERIENCE
Junior Full-Stack Developer, Pinecrest Apps (Remote)       06/2024 - Present
- Build small UI features in React and JavaScript
- Write basic Node.js endpoints for internal tools
- Write simple SQL queries for internal dashboards
- Use Git for version control

SKILLS
JavaScript, React, Node.js, SQL, Git
`,
      },
      {
        // Markdown format, strong fit, "ongoing" open-ended date phrasing.
        filename: 'amelia_clark.md',
        text: `# Amelia Clark

Remote | amelia.clark.dev@gmail.com | Mobile No: +44-7700-900123

## Profile
**Full-stack developer** with **3 years** of experience in **React** and **Node.js**.

## Experience

**Full-Stack Developer**, Foxglove Software (Remote) — *07/2022 - ongoing*
- Build UI features in **React** and **JavaScript** for a marketplace product
- Build backend APIs in **Node.js** and write **SQL** queries for order data
- Use **Git** for version control across a distributed team

## Education
**Full-Stack Development Bootcamp**, Makers Academy, 2021 - 2022

## Skills
JavaScript, React, Node.js, SQL, Git, TypeScript
`,
      },
      {
        // Near-empty/garbled text (simulated corrupted extraction) — tests
        // the isLikelyText fallback path ("Unknown Candidate").
        filename: 'corrupted_resume.txt',
        text: `%PDF-1.4
âˆ«â‰ˆÃ§Â®Â´Â£Â¢Ã¢âˆšâ‰¤â‰¥Ã·Ã—Â¥Â§ÂµÂ¶

stream
ÿØÿàJFIFÿþ
endstream endobj
      
`,
      },
    ],
  },

  // === JOBS_END ===
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

  const doc = await Candidate.create({
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
      notes: 'Auto-created by stress-test seed script',
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
  return doc;
}

// Every job's `hiringManager` is a free-text name shown on the job details
// page, but the Teams page (and the hiring-manager dropdown on job
// create/edit forms) is sourced from the Team collection — so any name used
// as a job's hiringManager needs a matching Team document with role
// 'Hiring Manager'.
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

// Additional technical interviewers / recruiters referenced by Phase 4
// interview fixtures, kept separate from hiring managers so the Team page
// shows a realistic mix of roles.
async function ensureExtraTeamMembers() {
  const extras: { name: string; role: string; department: string }[] = [
    { name: 'Maya Kim', role: 'Recruiter', department: 'Talent Acquisition' },
    { name: 'Dev Patel', role: 'Engineering Manager', department: 'Engineering' },
    { name: 'Anika Rao', role: 'Senior Engineer', department: 'Engineering' },
    { name: 'Tom Becker', role: 'Recruiter', department: 'Talent Acquisition' },
  ];
  for (const extra of extras) {
    const existing = await Team.findOne({ name: extra.name }).lean();
    if (existing) continue;
    const email = `${extra.name.toLowerCase().replace(/[^a-z\s]/g, '').trim().replace(/\s+/g, '.')}@hireverse.com`;
    await Team.create({ ...extra, email, status: 'active' });
    console.log(`Created Team member: "${extra.name}" (${extra.role}, ${extra.department})`);
  }
}

// ── Main ─────────────────────────────────────────────────────────────────────

async function main() {
  console.log('Connecting to MongoDB…');
  await mongoose.connect(MONGODB_URI);
  console.log('Connected.\n');

  console.log('Wiping existing data…');
  const [jobsDeleted, candidatesDeleted, interviewsDeleted, assessmentsDeleted, activityDeleted, teamDeleted, signalsDeleted, skillIntelDeleted] = await Promise.all([
    Job.deleteMany({}),
    Candidate.deleteMany({}),
    Interview.deleteMany({}),
    Assessment.deleteMany({}),
    ActivityLog.deleteMany({}),
    Team.deleteMany({}),
    LearningSignal.deleteMany({}),
    SkillIntelligence.deleteMany({}),
  ]);
  console.log(
    `  Removed ${jobsDeleted.deletedCount} jobs, ${candidatesDeleted.deletedCount} candidates, ` +
    `${interviewsDeleted.deletedCount} interviews, ${assessmentsDeleted.deletedCount} assessments, ` +
    `${activityDeleted.deletedCount} activity log entries, ${teamDeleted.deletedCount} team members, ` +
    `${signalsDeleted.deletedCount} learning signals, ${skillIntelDeleted.deletedCount} skill-intelligence docs.\n`
  );

  console.log('Ensuring team members exist…');
  await ensureHiringManagers();
  await ensureExtraTeamMembers();
  console.log();

  const jobDocs: Record<string, any> = {};
  for (const def of JOBS) {
    const { resumes, ...jobFields } = def;
    const jobDoc = await Job.create(jobFields);
    jobDocs[jobFields.title] = jobDoc;
    console.log(`Created job: "${jobFields.title}" (${jobFields.department}, ${jobFields.level})`);

    for (const resumeDef of resumes) {
      await createCandidate(jobDoc, resumeDef);
    }
    console.log();
  }

  await mongoose.disconnect();
  console.log('Done. Stress-test reseed complete (Phase 1-3).');
}

main().catch(err => { console.error(err); process.exit(1); });
