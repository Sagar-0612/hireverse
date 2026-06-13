import mongoose, { Schema, type Document } from 'mongoose';

// One document per required/nice-to-have skill that has ever received a
// recruiter correction. Each `aliases` entry is a phrase recruiters have
// pointed to as real evidence of that skill — e.g. skill="kubernetes",
// alias.term="container orchestration". Once `occurrences` crosses
// LEARNED_ALIAS_THRESHOLD (src/lib/learningEngine.ts), `promoted` flips to
// true and resumeAnalysis.ts starts treating that phrase as evidence for
// EVERY future resume that requires this skill — across every job, not just
// the one the correction was made on. This is the curated, auditable
// "the platform gets smarter with every correction" mechanism described in
// ai-architecture-recommendation.txt section 10.
export interface ISkillAlias {
  term: string;
  occurrences: number;
  promoted: boolean;
  firstSeenAt: Date;
  lastSeenAt: Date;
}

const SkillAliasSchema = new Schema<ISkillAlias>(
  {
    term:        { type: String, required: true },
    occurrences: { type: Number, default: 1 },
    promoted:    { type: Boolean, default: false },
    firstSeenAt: { type: Date, default: Date.now },
    lastSeenAt:  { type: Date, default: Date.now },
  },
  { _id: false }
);

export interface ISkillIntelligence extends Document {
  // Normalized skill key (lowercase, dots stripped) — same normalization as
  // skillRelations.ts's normSkill, so lookups line up regardless of "Node.js"
  // vs "nodejs" phrasing.
  skill: string;
  aliases: ISkillAlias[];
  updatedAt: Date;
}

const SkillIntelligenceSchema = new Schema<ISkillIntelligence>(
  {
    skill:   { type: String, required: true, unique: true },
    aliases: { type: [SkillAliasSchema], default: [] },
  },
  { timestamps: { createdAt: false, updatedAt: true } }
);

export const SkillIntelligence = (mongoose.models.SkillIntelligence as mongoose.Model<ISkillIntelligence>) ||
  mongoose.model<ISkillIntelligence>('SkillIntelligence', SkillIntelligenceSchema);
