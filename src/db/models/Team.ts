import mongoose, { Schema, type Document } from 'mongoose';

export interface ITeam extends Document {
  name: string;
  email: string;
  role: string;
  department: string;
  status: 'active' | 'inactive';
  createdAt: Date;
}

const TeamSchema = new Schema<ITeam>(
  {
    name:       { type: String, required: true },
    email:      { type: String, required: true },
    role:       { type: String, default: 'Recruiter' },
    department: { type: String, default: '' },
    status:     { type: String, enum: ['active','inactive'], default: 'active' },
  },
  { timestamps: true }
);

export const Team = (mongoose.models.Team as mongoose.Model<ITeam>) ||
  mongoose.model<ITeam>('Team', TeamSchema);
