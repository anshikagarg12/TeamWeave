import { Participant } from '../Models/Participant.js';
import { AuditLog } from '../Models/AuditLog.js';

export class ParticipantService {
  /**
   * Registers a new participant in MongoDB.
   */
  static async registerParticipant({ name, email, skills = [], interests = [] }) {
    if (!name || !email) {
      throw new Error('Name and email are required');
    }
    if (!skills || skills.length === 0) {
      throw new Error('At least one skill is required');
    }

    // Check if participant already exists
    const existing = await Participant.findOne({ email: email.toLowerCase().trim() });
    if (existing) {
      throw new Error(`Participant with email ${email} already registered`);
    }

    const participant = new Participant({
      name: name.trim(),
      email: email.toLowerCase().trim(),
      skills: skills.map(s => ({
        skillName: s.name || s.skillName,
        category: s.category || 'Frontend',
        proficiencyLevel: Number(s.proficiency || s.proficiencyLevel || 3),
      })),
      interests: interests || [],
      profileStatus: 'Submitted',
    });

    const saved = await participant.save();

    // Audit log in MongoDB
    await AuditLog.create({
      changeType: 'ParticipantRegistered',
      participantId: saved._id,
      actor: 'Participant',
      details: `Participant '${saved.name}' registered with ${saved.skills.length} skills.`,
    });

    return saved;
  }

  /**
   * Retrieves all participants with optional skill category filter.
   */
  static async getAllParticipants(category) {
    if (category && category.trim() !== '') {
      return await Participant.find({ 'skills.category': category }).sort({ createdAt: -1 });
    }
    return await Participant.find().sort({ createdAt: -1 });
  }

  /**
   * Retrieves a single participant by MongoDB ObjectId.
   */
  static async getParticipantById(id) {
    return await Participant.findById(id);
  }

  /**
   * Updates participant profile status.
   */
  static async updateParticipantStatus(id, newStatus, actor = 'Organizer') {
    const participant = await Participant.findById(id);
    if (!participant) {
      throw new Error('Participant not found');
    }

    const oldStatus = participant.profileStatus;
    participant.profileStatus = newStatus;
    const updated = await participant.save();

    await AuditLog.create({
      changeType: 'ParticipantUpdated',
      participantId: participant._id,
      actor,
      oldValue: oldStatus,
      newValue: newStatus,
      details: `Updated status for ${participant.name}`,
    });

    return updated;
  }

  /**
   * Adds or updates a skill for a participant.
   */
  static async addSkillToParticipant(id, skillName, category, proficiencyLevel = 3) {
    const participant = await Participant.findById(id);
    if (!participant) {
      throw new Error('Participant not found');
    }

    const existingSkillIndex = participant.skills.findIndex(s => s.skillName.toLowerCase() === skillName.toLowerCase());
    if (existingSkillIndex > -1) {
      participant.skills[existingSkillIndex].proficiencyLevel = proficiencyLevel;
      participant.skills[existingSkillIndex].category = category;
    } else {
      participant.skills.push({
        skillName,
        category,
        proficiencyLevel,
      });
    }

    return await participant.save();
  }
}
