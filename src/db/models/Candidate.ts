import mongoose, { Schema, type Document, type Types } from 'mongoose';

export interface IStageHistoryEntry {
  stageKey: string;
  stageLabel: string;
  fromStageKey: string;
  fromStageLabel: string;
  movedBy: string;
  movedAt: Date;
  notes: string;
}

const StageHistorySchema = new Schema<IStageHistoryEntry>(
  {
    stageKey:       { type: String, required: true },
    stageLabel:     { type: String, required: true },
    fromStageKey:   { type: String, default: '' },
    fromStageLabel: { type: String, default: '' },
    movedBy:        { type: String, default: '' },
    movedAt:        { type: Date, default: Date.now },
    notes:          { type: String, default: '' },
  },
  { _id: false }
);

export interface ICandidate extends Document {
  jobId: Types.ObjectId;
  name: string;
  email: string;
  phone: string;
  location: string;
  locationConfidence: 'high' | 'medium' | 'low' | 'none';
  score: number;
  experience: number;
  skillsMatch: number;
  educationMatch: number;
  recommendation: string;
  currentStage: string;
  rejected: boolean;
  rejectedAt: Date | null;
  rejectedBy: string;
  stageHistory: IStageHistoryEntry[];
  resumeName: string;
  resumeType: string;
  resumeBase64: string;
  skills: string[];
  practicalSkills: string[];
  achievements: string[];
  notes: string;
  createdAt: Date;
  updatedAt: Date;
}

const CandidateSchema = new Schema<ICandidate>(
  {
    jobId:              { type: Schema.Types.ObjectId, ref: 'Job', required: true },
    name:               { type: String, required: true },
    email:              { type: String, default: '' },
    phone:              { type: String, default: '' },
    location:           { type: String, default: '' },
    locationConfidence: { type: String, enum: ['high','medium','low','none'], default: 'none' },
    score:              { type: Number, default: 0 },
    experience:         { type: Number, default: 0 },
    skillsMatch:        { type: Number, default: 0 },
    educationMatch:     { type: Number, default: 0 },
    recommendation:     { type: String, default: '' },
    currentStage:       { type: String, required: true },
    rejected:           { type: Boolean, default: false },
    rejectedAt:         { type: Date, default: null },
    rejectedBy:         { type: String, default: '' },
    stageHistory:       { type: [StageHistorySchema], default: [] },
    resumeName:         { type: String, default: '' },
    resumeType:         { type: String, default: '' },
    resumeBase64:       { type: String, default: '' },
    skills:             [{ type: String }],
    practicalSkills:    { type: [String], default: [] },
    achievements:       { type: [String], default: [] },
    notes:              { type: String, default: '' },
  },
  { timestamps: true }
);

export const Candidate = (mongoose.models.Candidate as mongoose.Model<ICandidate>) ||
  mongoose.model<ICandidate>('Candidate', CandidateSchema);
