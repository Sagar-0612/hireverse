import { ActivityLog, type IActivityLog } from '../db/models/ActivityLog.ts';

export interface LogActivityInput {
  type: IActivityLog['type'];
  action: string;
  message: string;
  actor?: string;
  entityType?: string;
  entityId?: string;
  jobId?: string;
  candidateId?: string;
  meta?: Record<string, unknown>;
}

// Denormalized audit-log writer — message is a frozen, human-readable string so
// history stays readable after the referenced job/candidate is deleted.
export async function logActivity(input: LogActivityInput) {
  return ActivityLog.create({
    type: input.type,
    action: input.action,
    message: input.message,
    actor: input.actor || 'Maya Kim',
    entityType: input.entityType || '',
    entityId: input.entityId || '',
    jobId: input.jobId || '',
    candidateId: input.candidateId || '',
    meta: input.meta || {},
  });
}
