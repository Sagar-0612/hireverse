import mongoose, { Schema, type Document, type Types } from 'mongoose';

export interface IInterviewAnalysis {
  strengths: string[];
  concerns: string[];
  reasoning: string;
  decision: 'advance' | 'hold';
  analyzedAt: Date;
}

const InterviewAnalysisSchema = new Schema<IInterviewAnalysis>(
  {
    strengths:  [{ type: String }],
    concerns:   [{ type: String }],
    reasoning:  { type: String, default: '' },
    decision:   { type: String, enum: ['advance', 'hold'], default: 'hold' },
    analyzedAt: { type: Date, default: Date.now },
  },
  { _id: false }
);

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
  feedback: string;
  transcript: string;
  commScore: number;
  techScore: number;
  confidenceScore: number;
  recommendation: string;
  transcriptSummary: string;
  analysis: IInterviewAnalysis | null;
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
    // Post-interview inputs the interviewer provides so the AI can reason over
    // what actually happened — feedback is their own account, transcript is
    // the optional raw recording/call transcript (if one exists).
    feedback:          { type: String, default: '' },
    transcript:        { type: String, default: '' },
    commScore:         { type: Number, default: 0 },
    techScore:         { type: Number, default: 0 },
    confidenceScore:   { type: Number, default: 0 },
    recommendation:    { type: String, default: '' },
    transcriptSummary: { type: String, default: '' },
    // Structured AI verdict derived from feedback/transcript — computed
    // server-side by analyzeInterview(), never client-supplied.
    analysis:          { type: InterviewAnalysisSchema, default: null },
  },
  { timestamps: true }
);

export const Interview = (mongoose.models.Interview as mongoose.Model<IInterview>) ||
  mongoose.model<IInterview>('Interview', InterviewSchema);
