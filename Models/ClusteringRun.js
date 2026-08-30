import mongoose from 'mongoose';

const clusteringRunSchema = new mongoose.Schema({
  eventId: {
    type: Number,
    default: 1,
  },
  executedAt: {
    type: Date,
    default: Date.now,
  },
  teamsGenerated: {
    type: Number,
    required: true,
  },
  parameters: {
    targetTeamSize: Number,
    maxIterations: Number,
    algorithm: {
      type: String,
      default: 'KMeans_SkillVector',
    },
  },
  teamIds: [{
    type: mongoose.Schema.Types.ObjectId,
    ref: 'Team',
  }],
  status: {
    type: String,
    enum: ['Completed', 'Failed'],
    default: 'Completed',
  },
  durationMs: {
    type: Number,
    default: 0,
  },
});

clusteringRunSchema.index({ eventId: 1, executedAt: -1 });

export const ClusteringRun = mongoose.model('ClusteringRun', clusteringRunSchema);
