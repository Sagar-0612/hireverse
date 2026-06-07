import mongoose, { Schema, type Document } from 'mongoose';

export interface IActivityLog extends Document {
  type: 'job' | 'candidate' | 'interview' | 'stage' | 'team';
  action: string;
  message: string;
  actor: string;
  entityType: string;
  entityId: string;
  jobId: string;
  candidateId: string;
  meta: Record<string, unknown>;
  createdAt: Date;
}

const ActivityLogSchema = new Schema<IActivityLog>(
  {
    type:        { type: String, enum: ['job','candidate','interview','stage','team'], required: true },
    action:      { type: String, required: true },
    message:     { type: String, required: true },
    actor:       { type: String, default: '' },
    entityType:  { type: String, default: '' },
    entityId:    { type: String, default: '' },
    jobId:       { type: String, default: '' },
    candidateId: { type: String, default: '' },
    meta:        { type: Schema.Types.Mixed, default: {} },
  },
  { timestamps: { createdAt: true, updatedAt: false } }
);

ActivityLogSchema.index({ createdAt: -1 });

export const ActivityLog = (mongoose.models.ActivityLog as mongoose.Model<IActivityLog>) ||
  mongoose.model<IActivityLog>('ActivityLog', ActivityLogSchema);
