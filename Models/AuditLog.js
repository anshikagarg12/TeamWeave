import mongoose from 'mongoose';

const auditLogSchema = new mongoose.Schema({
  changeType: {
    type: String,
    required: true,
    enum: [
      'ParticipantRegistered',
      'ParticipantUpdated',
      'ParticipantAddedToTeam',
      'ParticipantMoved',
      'TeamCreated',
      'TeamLocked',
      'TeamUnlocked',
      'ParticipantLocked',
      'ClusteringExecuted',
    ],
  },
  teamId: {
    type: mongoose.Schema.Types.ObjectId,
    ref: 'Team',
    default: null,
  },
  participantId: {
    type: mongoose.Schema.Types.ObjectId,
    ref: 'Participant',
    default: null,
  },
  actor: {
    type: String,
    default: 'System',
  },
  oldValue: {
    type: String,
    default: null,
  },
  newValue: {
    type: String,
    default: null,
  },
  details: {
    type: String,
    default: '',
  },
  timestamp: {
    type: Date,
    default: Date.now,
  },
});

auditLogSchema.index({ teamId: 1 });
auditLogSchema.index({ participantId: 1 });
auditLogSchema.index({ timestamp: -1 });

export const AuditLog = mongoose.model('AuditLog', auditLogSchema);
