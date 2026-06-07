import mongoose, { Schema, type Document } from 'mongoose';

export interface IJob extends Document {
  title: string;
  department: string;
  location: string;
  type: string;
  level: string;
  salary: string;
  status: 'active' | 'interviewing' | 'closed' | 'archived';
  description: string;
  responsibilities: string;
  requiredSkills: string[];
  niceToHaveSkills: string[];
  education: string;
  hiringManager: string;
  threshold: number;
  autoRank: boolean;
  aiSummary: boolean;
  biasCheck: boolean;
  createdAt: Date;
  updatedAt: Date;
}

const JobSchema = new Schema<IJob>(
  {
    title:             { type: String, required: true },
    department:        { type: String, default: '' },
    location:          { type: String, default: '' },
    type:              { type: String, default: 'Full-time' },
    level:             { type: String, default: 'Mid Level' },
    salary:            { type: String, default: '' },
    status:            { type: String, enum: ['active','interviewing','closed','archived'], default: 'active' },
    description:       { type: String, default: '' },
    responsibilities:  { type: String, default: '' },
    requiredSkills:    [{ type: String }],
    niceToHaveSkills:  [{ type: String }],
    education:         { type: String, default: '' },
    hiringManager:     { type: String, default: '' },
    threshold:         { type: Number, default: 70 },
    autoRank:          { type: Boolean, default: true },
    aiSummary:         { type: Boolean, default: true },
    biasCheck:         { type: Boolean, default: false },
  },
  { timestamps: true }
);

export const Job = (mongoose.models.Job as mongoose.Model<IJob>) ||
  mongoose.model<IJob>('Job', JobSchema);
