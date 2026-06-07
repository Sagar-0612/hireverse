import mongoose, { Schema, type Document, type Types } from 'mongoose';

export interface ICandidate extends Document {
  jobId: Types.ObjectId;
  name: string;
  email: string;
  phone: string;
  location: string;
  score: number;
  experience: number;
  skillsMatch: number;
  educationMatch: number;
  recommendation: string;
  status: 'applied' | 'screening' | 'shortlisted' | 'interview' | 'offered' | 'hired' | 'rejected';
  resumeName: string;
  resumeType: string;
  resumeBase64: string;
  skills: string[];
  notes: string;
  createdAt: Date;
  updatedAt: Date;
}

const CandidateSchema = new Schema<ICandidate>(
  {
    jobId:          { type: Schema.Types.ObjectId, ref: 'Job', required: true },
    name:           { type: String, required: true },
    email:          { type: String, default: '' },
    phone:          { type: String, default: '' },
    location:       { type: String, default: '' },
    score:          { type: Number, default: 0 },
    experience:     { type: Number, default: 0 },
    skillsMatch:    { type: Number, default: 0 },
    educationMatch: { type: Number, default: 0 },
    recommendation: { type: String, default: '' },
    status:         { type: String, enum: ['applied','screening','shortlisted','interview','offered','hired','rejected'], default: 'applied' },
    resumeName:     { type: String, default: '' },
    resumeType:     { type: String, default: '' },
    resumeBase64:   { type: String, default: '' },
    skills:         [{ type: String }],
    notes:          { type: String, default: '' },
  },
  { timestamps: true }
);

export const Candidate = (mongoose.models.Candidate as mongoose.Model<ICandidate>) ||
  mongoose.model<ICandidate>('Candidate', CandidateSchema);
