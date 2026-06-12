/**
 * sync-hiring-managers.ts
 *
 * Non-destructive consistency fix: every Job's `hiringManager` is a free-text
 * name shown on the job details page, but the Teams page (and the hiring
 * manager dropdown on job create/edit forms) is sourced from the Team
 * collection. If a job's hiringManager has no matching Team document with
 * role 'Hiring Manager', the name appears on the job but not in Teams.
 *
 * This script scans existing Jobs for hiringManager names with no matching
 * Team member and creates one (role: 'Hiring Manager', status: 'active'),
 * using the job's department. Idempotent — only inserts what's missing,
 * never deletes or modifies existing data.
 *
 * Run with: node --experimental-strip-types src/scripts/sync-hiring-managers.ts
 */

import mongoose from 'mongoose';
import { Job } from '../db/models/Job.ts';
import { Team } from '../db/models/Team.ts';

const MONGODB_URI = process.env.MONGODB_URI ?? 'mongodb://localhost:27017/hireverse';

async function main() {
  console.log('Connecting to MongoDB…');
  await mongoose.connect(MONGODB_URI);
  console.log('Connected.\n');

  const jobs = await Job.find({ hiringManager: { $exists: true, $ne: '' } }, 'hiringManager department').lean();
  const seen = new Set<string>();
  let created = 0;

  for (const job of jobs) {
    const name = job.hiringManager;
    if (!name || seen.has(name)) continue;
    seen.add(name);

    const existing = await Team.findOne({ name }).lean();
    if (existing) continue;

    const email = `${name.toLowerCase().replace(/[^a-z\s]/g, '').trim().replace(/\s+/g, '.')}@hireverse.com`;
    await Team.create({
      name,
      email,
      role: 'Hiring Manager',
      department: job.department || '',
      status: 'active',
    });
    created++;
    console.log(`Created Team member: "${name}" (Hiring Manager, ${job.department || 'no department'})`);
  }

  console.log(`\nDone. ${created} Team member(s) created, ${jobs.length} job(s) scanned.`);
  await mongoose.disconnect();
}

main().catch(err => { console.error(err); process.exit(1); });
