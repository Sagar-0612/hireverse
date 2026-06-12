import mongoose, { Schema, type Document, type Types } from 'mongoose';

export type AssessmentType = 'coding' | 'written' | 'take-home';

export interface IAssessmentAnalysis {
  strengths: string[];
  concerns: string[];
  reasoning: string;
  decision: 'advance' | 'hold';
  analyzedAt: Date;
}

export interface IAssessment extends Document {
  candidateId: Types.ObjectId;
  jobId: Types.ObjectId;
  pipelineStage: string;       // stage key
  round: string;               // e.g. "Coding Test", "Written Assessment"
  type: AssessmentType;
  status: 'pending' | 'submitted' | 'evaluated';
  instructions: string;        // problem statement / task given to candidate
  suggestedQuestions: { skill: string; difficulty: string; question: string }[]; // server-generated, tailored to candidate/job
  questionAsked: string;       // the actual question given to the candidate (from suggestions or custom)
  dueDate: string;             // YYYY-MM-DD — when the candidate must complete this by (optional)
  dueTime: string;             // HH:MM — optional time component for the due date
  submission: string;          // code/answer text or URL submitted
  evaluatorNotes: string;      // human reviewer's written notes
  testsPassed: number;
  testsTotal: number;
  codeQualityScore: number;    // 0-100, server-computed
  algorithmScore: number;      // 0-100, server-computed
  problemSolvingScore: number; // 0-100, server-computed
  overallScore: number;        // 0-100, server-computed
  recommendation: string;      // server-computed
  summary: string;             // server-computed brief summary
  analysis: IAssessmentAnalysis | null;
  createdAt: Date;
  updatedAt: Date;
}

const AssessmentAnalysisSchema = new Schema<IAssessmentAnalysis>(
  {
    strengths:  { type: [String], default: [] },
    concerns:   { type: [String], default: [] },
    reasoning:  { type: String, default: '' },
    decision:   { type: String, enum: ['advance', 'hold'], required: true },
    analyzedAt: { type: Date, default: Date.now },
  },
  { _id: false }
);

const AssessmentSchema = new Schema<IAssessment>(
  {
    candidateId:         { type: Schema.Types.ObjectId, ref: 'Candidate', required: true },
    jobId:               { type: Schema.Types.ObjectId, ref: 'Job', required: true },
    pipelineStage:       { type: String, required: true },
    round:               { type: String, required: true },
    type:                { type: String, enum: ['coding', 'written', 'take-home'], default: 'coding' },
    status:              { type: String, enum: ['pending', 'submitted', 'evaluated'], default: 'pending' },
    instructions:        { type: String, default: '' },
    suggestedQuestions:  {
      type: [{ skill: String, difficulty: String, question: String, _id: false }],
      default: [],
    },
    questionAsked:       { type: String, default: '' },
    dueDate:             { type: String, default: '' },
    dueTime:             { type: String, default: '' },
    submission:          { type: String, default: '' },
    evaluatorNotes:      { type: String, default: '' },
    testsPassed:         { type: Number, default: 0 },
    testsTotal:          { type: Number, default: 0 },
    codeQualityScore:    { type: Number, default: 0 },
    algorithmScore:      { type: Number, default: 0 },
    problemSolvingScore: { type: Number, default: 0 },
    overallScore:        { type: Number, default: 0 },
    recommendation:      { type: String, default: '' },
    summary:             { type: String, default: '' },
    analysis:            { type: AssessmentAnalysisSchema, default: null },
  },
  { timestamps: true }
);

export const Assessment = (mongoose.models.Assessment as mongoose.Model<IAssessment>) ||
  mongoose.model<IAssessment>('Assessment', AssessmentSchema);
