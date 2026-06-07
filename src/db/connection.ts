import mongoose from 'mongoose';

const MONGODB_URI =
  (import.meta as any).env?.MONGODB_URI ||
  process.env.MONGODB_URI ||
  'mongodb://localhost:27017/hireverse';

export async function connectDB(): Promise<void> {
  if (mongoose.connection.readyState >= 1) return;
  await mongoose.connect(MONGODB_URI);
}
