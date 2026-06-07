import mongoose, { Schema, type Document, type Types } from 'mongoose';

export interface IInterview extends Document {
  candidateId: Types.ObjectId;
  jobId: Types.ObjectId;
  pipelineStage: string;
  round: string;
  interviewer: string;
  date: string;
  time: string;
  duration: number;
  format: string;
  status: 'scheduled' | 'completed' | 'cancelled' | 'rescheduled';
  notes: string;
  commScore: number;
  techScore: number;
  confidenceScore: number;
  recommendation: string;
  transcriptSummary: string;
  createdAt: Date;
  updatedAt: Date;
}

const InterviewSchema = new Schema<IInterview>(
  {
    candidateId:       { type: Schema.Types.ObjectId, ref: 'Candidate', required: true },
    jobId:             { type: Schema.Types.ObjectId, ref: 'Job', required: true },
    pipelineStage:     { type: String, default: '' },
    round:             { type: String, default: 'L1 Technical' },
    interviewer:       { type: String, default: '' },
    date:              { type: String, required: true },
    time:              { type: String, default: '' },
    duration:          { type: Number, default: 60 },
    format:            { type: String, default: 'Video Call' },
    status:            { type: String, enum: ['scheduled','completed','cancelled','rescheduled'], default: 'scheduled' },
    notes:             { type: String, default: '' },
    commScore:         { type: Number, default: 0 },
    techScore:         { type: Number, default: 0 },
    confidenceScore:   { type: Number, default: 0 },
    recommendation:    { type: String, default: '' },
    transcriptSummary: { type: String, default: '' },
  },
  { timestamps: true }
);

export const Interview = (mongoose.models.Interview as mongoose.Model<IInterview>) ||
  mongoose.model<IInterview>('Interview', InterviewSchema);
