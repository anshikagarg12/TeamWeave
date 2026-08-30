import mongoose from 'mongoose';

const participantSkillSchema = new mongoose.Schema({
  skillName: {
    type: String,
    required: true,
  },
  category: {
    type: String,
    required: true,
  },
  proficiencyLevel: {
    type: Number,
    required: true,
    min: 1,
    max: 5,
    default: 3,
  },
  addedAt: {
    type: Date,
    default: Date.now,
  },
}, { _id: false });

const participantSchema = new mongoose.Schema({
  name: {
    type: String,
    required: true,
    trim: true,
  },
  email: {
    type: String,
    required: true,
    unique: true,
    lowercase: true,
    trim: true,
  },
  profileStatus: {
    type: String,
    enum: ['Submitted', 'Approved', 'Rejected'],
    default: 'Submitted',
  },
  skills: [participantSkillSchema],
  interests: [{
    type: String,
    trim: true,
  }],
  createdAt: {
    type: Date,
    default: Date.now,
  },
  updatedAt: {
    type: Date,
    default: Date.now,
  },
});

participantSchema.pre('save', function(next) {
  this.updatedAt = new Date();
  next();
});

participantSchema.index({ 'skills.category': 1 });
participantSchema.index({ 'skills.skillName': 1 });

export const Participant = mongoose.model('Participant', participantSchema);
