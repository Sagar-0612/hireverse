import mongoose, { Schema, type Document } from 'mongoose';

// A LearningSignal is a single, immutable record of either:
//  - 'skill-alias-correction': a recruiter told the platform that resume text
//    ("evidencePhrase") is real evidence of a required skill the static
//    skillRelations lexicon didn't already know about. Once the SAME
//    (skill, evidencePhrase) pair has been confirmed enough times (see
//    src/lib/learningEngine.ts), it's promoted into SkillIntelligence and
//    applied to future resumes for ANY job that requires that skill.
//  - 'stage-outcome': a candidate's resume score at the moment they were
//    advanced, rejected, or hired — the raw data behind the "does our
//    scoring actually correlate with real outcomes" calibration insights.
//
// This collection is append-only and never read back into a single
// candidate's score directly — it only feeds the aggregate, explainable
// SkillIntelligence promotions and the read-only Platform Intelligence page.
export interface ILearningSignal extends Document {
  type: 'skill-alias-correction' | 'stage-outcome';
  jobId: string;
  candidateId: string;
  actor: string;
  // skill-alias-correction fields
  skill?: string;
  evidencePhrase?: string;
  fromStatus?: string;
  toStatus?: string;
  // stage-outcome fields
  score?: number;
  fromStageKey?: string;
  toStageKey?: string;
  outcome?: 'advanced' | 'rejected' | 'hired';
  createdAt: Date;
}

const LearningSignalSchema = new Schema<ILearningSignal>(
  {
    type:           { type: String, enum: ['skill-alias-correction', 'stage-outcome'], required: true },
    jobId:          { type: String, default: '' },
    candidateId:    { type: String, default: '' },
    actor:          { type: String, default: '' },
    skill:          { type: String },
    evidencePhrase: { type: String },
    fromStatus:     { type: String },
    toStatus:       { type: String },
    score:          { type: Number },
    fromStageKey:   { type: String },
    toStageKey:     { type: String },
    outcome:        { type: String, enum: ['advanced', 'rejected', 'hired'] },
  },
  { timestamps: { createdAt: true, updatedAt: false } }
);

LearningSignalSchema.index({ type: 1, createdAt: -1 });
LearningSignalSchema.index({ jobId: 1, type: 1 });

export const LearningSignal = (mongoose.models.LearningSignal as mongoose.Model<ILearningSignal>) ||
  mongoose.model<ILearningSignal>('LearningSignal', LearningSignalSchema);
