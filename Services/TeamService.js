import { Team } from '../Models/Team.js';
import { Participant } from '../Models/Participant.js';
import { AuditLog } from '../Models/AuditLog.js';

export class TeamService {
  /**
   * Retrieves all teams.
   */
  static async getAllTeams(eventId = 1) {
    return await Team.find({ eventId }).sort({ createdAt: 1 });
  }

  /**
   * Retrieves a single team by ID.
   */
  static async getTeamById(id) {
    return await Team.findById(id);
  }

  /**
   * Creates a new team manually.
   */
  static async createTeam(name, eventId = 1, members = []) {
    const team = new Team({
      name: name || 'New Team',
      eventId,
      status: 'Draft',
      isLocked: false,
      members,
    });
    const saved = await team.save();

    await AuditLog.create({
      changeType: 'TeamCreated',
      teamId: saved._id,
      actor: 'Organizer',
      details: `Team '${saved.name}' created manually.`,
    });

    return saved;
  }

  /**
   * Moves a participant from one team to another.
   */
  static async moveParticipantBetweenTeams(participantId, fromTeamId, toTeamId, actor = 'Organizer') {
    const fromTeam = await Team.findById(fromTeamId);
    const toTeam = await Team.findById(toTeamId);

    if (!fromTeam || !toTeam) {
      throw new Error('One or both teams not found');
    }

    if (fromTeam.isLocked || toTeam.isLocked) {
      throw new Error('Cannot move participants involving a locked team');
    }

    const memberIndex = fromTeam.members.findIndex(
      m => m.participantId.toString() === participantId.toString()
    );

    if (memberIndex === -1) {
      throw new Error('Participant not found in source team');
    }

    const [movingMember] = fromTeam.members.splice(memberIndex, 1);
    await fromTeam.save();

    toTeam.members.push({
      participantId: movingMember.participantId,
      name: movingMember.name,
      email: movingMember.email,
      skills: movingMember.skills || [],
      isLocked: false,
      addedAt: new Date(),
    });
    await toTeam.save();

    // Audit log
    await AuditLog.create({
      changeType: 'ParticipantMoved',
      participantId: movingMember.participantId,
      teamId: toTeam._id,
      actor,
      oldValue: fromTeam.name,
      newValue: toTeam.name,
      details: `Moved '${movingMember.name}' from '${fromTeam.name}' to '${toTeam.name}'`,
    });

    return { fromTeam, toTeam };
  }

  /**
   * Toggles team lock state.
   */
  static async toggleTeamLock(teamId, actor = 'Organizer') {
    const team = await Team.findById(teamId);
    if (!team) {
      throw new Error('Team not found');
    }

    const previousLock = team.isLocked;
    team.isLocked = !previousLock;
    team.status = team.isLocked ? 'Locked' : 'Draft';
    await team.save();

    await AuditLog.create({
      changeType: team.isLocked ? 'TeamLocked' : 'TeamUnlocked',
      teamId: team._id,
      actor,
      oldValue: previousLock ? 'Locked' : 'Draft',
      newValue: team.status,
      details: `Team '${team.name}' ${team.isLocked ? 'locked' : 'unlocked'} by ${actor}`,
    });

    return team;
  }

  /**
   * Locks or unlocks a specific participant within a team.
   */
  static async toggleParticipantLockInTeam(teamId, participantId, actor = 'Organizer') {
    const team = await Team.findById(teamId);
    if (!team) {
      throw new Error('Team not found');
    }

    const member = team.members.find(
      m => m.participantId.toString() === participantId.toString()
    );
    if (!member) {
      throw new Error('Participant not found in team');
    }

    member.isLocked = !member.isLocked;
    await team.save();

    await AuditLog.create({
      changeType: 'ParticipantLocked',
      teamId: team._id,
      participantId: member.participantId,
      actor,
      details: `Participant '${member.name}' in team '${team.name}' lock set to ${member.isLocked}`,
    });

    return team;
  }

  /**
   * Retrieves audit logs.
   */
  static async getAuditLogs(limit = 100) {
    return await AuditLog.find().sort({ timestamp: -1 }).limit(limit);
  }

  /**
   * Computes portal statistics.
   */
  static async getStats() {
    const totalParticipants = await Participant.countDocuments();
    const totalTeams = await Team.countDocuments();
    const teams = await Team.find();
    
    let totalMembersInTeams = 0;
    for (const t of teams) {
      totalMembersInTeams += t.members.length;
    }
    const avgTeamSize = totalTeams > 0 ? (totalMembersInTeams / totalTeams).toFixed(1) : 0;

    return {
      totalParticipants,
      totalTeams,
      availableSkills: '24',
      avgTeamSize,
    };
  }

  /**
   * Exports data to CSV string format.
   */
  static async exportCSV(type) {
    if (type === 'participants') {
      const participants = await Participant.find().sort({ createdAt: -1 });
      let csv = 'ID,Name,Email,Profile Status,Skills,Created At\n';
      for (const p of participants) {
        const skills = (p.skills || []).map(s => `${s.skillName}(${s.proficiencyLevel})`).join('; ');
        csv += `"${p._id}","${p.name}","${p.email}","${p.profileStatus}","${skills}","${p.createdAt.toISOString()}"\n`;
      }
      return csv;
    }

    if (type === 'teams') {
      const teams = await Team.find().sort({ createdAt: 1 });
      let csv = 'Team ID,Team Name,Status,Is Locked,Member Count,Coverage Score,Covered Pillars,Missing Pillars,Members,Created At\n';
      for (const t of teams) {
        const memberNames = (t.members || []).map(m => m.name).join('; ');
        const covered = (t.coveredPillars || []).join('; ');
        const missing = (t.missingPillars || []).join('; ');
        const coveragePct = t.coverageScore != null ? `${Math.round(t.coverageScore * 100)}%` : 'N/A';
        csv += `"${t._id}","${t.name}","${t.status}",${t.isLocked},${t.members.length},"${coveragePct}","${covered}","${missing}","${memberNames}","${t.createdAt.toISOString()}"\n`;
      }
      return csv;
    }

    if (type === 'audit') {
      const logs = await AuditLog.find().sort({ timestamp: -1 });
      let csv = 'ID,Change Type,Actor,Old Value,New Value,Details,Timestamp\n';
      for (const l of logs) {
        csv += `"${l._id}","${l.changeType}","${l.actor}","${l.oldValue || ''}","${l.newValue || ''}","${l.details || ''}","${l.timestamp.toISOString()}"\n`;
      }
      return csv;
    }

    throw new Error('Invalid export type. Supported: participants, teams, audit');
  }
}
