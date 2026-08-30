import mongoose from 'mongoose';

const skillSchema = new mongoose.Schema({
  name: {
    type: String,
    required: true,
    unique: true,
    trim: true,
  },
  category: {
    type: String,
    required: true,
    enum: ['Frontend', 'Backend', 'Data', 'Design', 'DevOps'],
  },
  createdAt: {
    type: Date,
    default: Date.now,
  },
});

export const Skill = mongoose.model('Skill', skillSchema);
