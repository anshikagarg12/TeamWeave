import mongoose from 'mongoose';

const teamMemberSchema = new mongoose.Schema({
  participantId: {
    type: mongoose.Schema.Types.ObjectId,
    ref: 'Participant',
    required: true,
  },
  name: {
    type: String,
    required: true,
  },
  email: {
    type: String,
    required: true,
  },
  skills: [{
    skillName: String,
    category: String,
    proficiencyLevel: Number,
  }],
  isLocked: {
    type: Boolean,
    default: false,
  },
  addedAt: {
    type: Date,
    default: Date.now,
  },
}, { _id: false });

const teamSchema = new mongoose.Schema({
  name: {
    type: String,
    required: true,
    trim: true,
  },
  eventId: {
    type: Number,
    default: 1,
  },
  status: {
    type: String,
    enum: ['Draft', 'Suggested', 'Locked', 'Finalized'],
    default: 'Draft',
  },
  isLocked: {
    type: Boolean,
    default: false,
  },
  members: [teamMemberSchema],
  // Full-stack coverage metadata set by the clustering algorithm
  coverageScore: {
    type: Number,
    default: 0,
    min: 0,
    max: 1,
  },
  coveredPillars: [{
    type: String,
  }],
  missingPillars: [{
    type: String,
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

teamSchema.pre('save', function(next) {
  this.updatedAt = new Date();
  next();
});

teamSchema.index({ eventId: 1 });
teamSchema.index({ isLocked: 1 });
teamSchema.index({ 'members.participantId': 1 });

export const Team = mongoose.model('Team', teamSchema);
