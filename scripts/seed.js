import { connectDB, disconnectDB } from '../config/db.js';
import { Skill } from '../Models/Skill.js';
import { Participant } from '../Models/Participant.js';
import { ParticipantService } from '../Services/ParticipantService.js';
import { Team } from '../Models/Team.js';
import { AuditLog } from '../Models/AuditLog.js';
import { ClusteringRun } from '../Models/ClusteringRun.js';

export const defaultSkills = [
  // Frontend
  { name: 'React', category: 'Frontend' },
  { name: 'Vue.js', category: 'Frontend' },
  { name: 'Angular', category: 'Frontend' },
  { name: 'JavaScript', category: 'Frontend' },
  { name: 'TypeScript', category: 'Frontend' },
  { name: 'HTML/CSS', category: 'Frontend' },
  { name: 'Next.js', category: 'Frontend' },
  // Backend
  { name: 'C#', category: 'Backend' },
  { name: 'Python', category: 'Backend' },
  { name: 'Java', category: 'Backend' },
  { name: 'Node.js', category: 'Backend' },
  { name: 'PHP', category: 'Backend' },
  { name: 'Go', category: 'Backend' },
  { name: 'REST API Design', category: 'Backend' },
  // Database / APIs
  { name: 'SQL', category: 'Data' },
  { name: 'MongoDB', category: 'Data' },
  { name: 'PostgreSQL', category: 'Data' },
  { name: 'GraphQL', category: 'Data' },
  { name: 'Redis', category: 'Data' },
  { name: 'Machine Learning', category: 'Data' },
  { name: 'Data Analysis', category: 'Data' },
  { name: 'Big Data', category: 'Data' },
  // Design
  { name: 'UI/UX Design', category: 'Design' },
  { name: 'Figma', category: 'Design' },
  { name: 'Graphic Design', category: 'Design' },
  { name: 'Web Design', category: 'Design' },
  // DevOps / Deployment
  { name: 'Docker', category: 'DevOps' },
  { name: 'Kubernetes', category: 'DevOps' },
  { name: 'AWS', category: 'DevOps' },
  { name: 'Azure', category: 'DevOps' },
  { name: 'CI/CD', category: 'DevOps' },
  { name: 'GitHub Actions', category: 'DevOps' },
  { name: 'Terraform', category: 'DevOps' },
  // Version Control
  { name: 'Git', category: 'DevOps' },
  { name: 'GitHub', category: 'DevOps' },
  { name: 'GitLab', category: 'DevOps' },
];

/**
 * Demo participants — 12 people with diverse cross-functional skill profiles.
 * Designed so clustering at team_size=4 produces 3 well-balanced full-stack teams.
 *
 * Each participant intentionally spans 2-4 pillars to create realistic
 * cross-functional profiles (many devs know Git + their main domain skill, etc.)
 */
export const demoParticipants = [
  // ── Participant 1: Frontend specialist + Version Control ──
  {
    name: 'Alice Johnson',
    email: 'alice@example.com',
    skills: [
      { skillName: 'React', category: 'Frontend', proficiencyLevel: 5 },
      { skillName: 'TypeScript', category: 'Frontend', proficiencyLevel: 4 },
      { skillName: 'HTML/CSS', category: 'Frontend', proficiencyLevel: 5 },
      { skillName: 'Git', category: 'DevOps', proficiencyLevel: 3 },
    ],
    interests: ['Web Applications', 'Component Libraries'],
  },
  // ── Participant 2: Backend specialist + REST APIs ──
  {
    name: 'Bob Smith',
    email: 'bob@example.com',
    skills: [
      { skillName: 'Node.js', category: 'Backend', proficiencyLevel: 5 },
      { skillName: 'REST API Design', category: 'Backend', proficiencyLevel: 4 },
      { skillName: 'PostgreSQL', category: 'Data', proficiencyLevel: 4 },
      { skillName: 'Git', category: 'DevOps', proficiencyLevel: 4 },
    ],
    interests: ['APIs', 'Microservices'],
  },
  // ── Participant 3: DevOps / Deployment specialist ──
  {
    name: 'Carol White',
    email: 'carol@example.com',
    skills: [
      { skillName: 'Docker', category: 'DevOps', proficiencyLevel: 5 },
      { skillName: 'AWS', category: 'DevOps', proficiencyLevel: 4 },
      { skillName: 'CI/CD', category: 'DevOps', proficiencyLevel: 5 },
      { skillName: 'GitHub Actions', category: 'DevOps', proficiencyLevel: 4 },
    ],
    interests: ['Cloud Infrastructure', 'Automation'],
  },
  // ── Participant 4: Full-stack (Frontend + Backend) ──
  {
    name: 'David Lee',
    email: 'david@example.com',
    skills: [
      { skillName: 'Vue.js', category: 'Frontend', proficiencyLevel: 4 },
      { skillName: 'Python', category: 'Backend', proficiencyLevel: 5 },
      { skillName: 'REST API Design', category: 'Backend', proficiencyLevel: 3 },
      { skillName: 'GitHub', category: 'DevOps', proficiencyLevel: 3 },
    ],
    interests: ['Web Development', 'Python Tooling'],
  },
  // ── Participant 5: Designer + Frontend ──
  {
    name: 'Emma Davis',
    email: 'emma@example.com',
    skills: [
      { skillName: 'UI/UX Design', category: 'Design', proficiencyLevel: 5 },
      { skillName: 'Figma', category: 'Design', proficiencyLevel: 5 },
      { skillName: 'HTML/CSS', category: 'Frontend', proficiencyLevel: 4 },
      { skillName: 'Web Design', category: 'Design', proficiencyLevel: 4 },
    ],
    interests: ['User Experience', 'Design Systems'],
  },
  // ── Participant 6: Backend + Database ──
  {
    name: 'Frank Miller',
    email: 'frank@example.com',
    skills: [
      { skillName: 'Java', category: 'Backend', proficiencyLevel: 5 },
      { skillName: 'SQL', category: 'Data', proficiencyLevel: 5 },
      { skillName: 'MongoDB', category: 'Data', proficiencyLevel: 3 },
      { skillName: 'Git', category: 'DevOps', proficiencyLevel: 3 },
    ],
    interests: ['Enterprise Systems', 'Database Design'],
  },
  // ── Participant 7: DevOps + Version Control ──
  {
    name: 'Grace Kim',
    email: 'grace@example.com',
    skills: [
      { skillName: 'Kubernetes', category: 'DevOps', proficiencyLevel: 4 },
      { skillName: 'Terraform', category: 'DevOps', proficiencyLevel: 4 },
      { skillName: 'GitLab', category: 'DevOps', proficiencyLevel: 5 },
      { skillName: 'Azure', category: 'DevOps', proficiencyLevel: 3 },
    ],
    interests: ['Platform Engineering', 'IaC'],
  },
  // ── Participant 8: Frontend + GraphQL/APIs ──
  {
    name: 'Henry Brown',
    email: 'henry@example.com',
    skills: [
      { skillName: 'Angular', category: 'Frontend', proficiencyLevel: 4 },
      { skillName: 'TypeScript', category: 'Frontend', proficiencyLevel: 4 },
      { skillName: 'GraphQL', category: 'Data', proficiencyLevel: 4 },
      { skillName: 'GitHub', category: 'DevOps', proficiencyLevel: 4 },
    ],
    interests: ['SPA Development', 'API Integration'],
  },
  // ── Participant 9: Backend + DevOps (bridge role) ──
  {
    name: 'Isabella Chen',
    email: 'isabella@example.com',
    skills: [
      { skillName: 'C#', category: 'Backend', proficiencyLevel: 5 },
      { skillName: 'REST API Design', category: 'Backend', proficiencyLevel: 4 },
      { skillName: 'Docker', category: 'DevOps', proficiencyLevel: 4 },
      { skillName: 'Git', category: 'DevOps', proficiencyLevel: 4 },
    ],
    interests: ['.NET Ecosystem', 'Containerisation'],
  },
  // ── Participant 10: Data / ML + Backend ──
  {
    name: 'James Wilson',
    email: 'james@example.com',
    skills: [
      { skillName: 'Python', category: 'Backend', proficiencyLevel: 5 },
      { skillName: 'Machine Learning', category: 'Data', proficiencyLevel: 4 },
      { skillName: 'Data Analysis', category: 'Data', proficiencyLevel: 4 },
      { skillName: 'PostgreSQL', category: 'Data', proficiencyLevel: 3 },
    ],
    interests: ['AI/ML', 'Data Pipelines'],
  },
  // ── Participant 11: Designer + Version Control ──
  {
    name: 'Karen Patel',
    email: 'karen@example.com',
    skills: [
      { skillName: 'Figma', category: 'Design', proficiencyLevel: 5 },
      { skillName: 'Graphic Design', category: 'Design', proficiencyLevel: 4 },
      { skillName: 'HTML/CSS', category: 'Frontend', proficiencyLevel: 3 },
      { skillName: 'GitHub', category: 'DevOps', proficiencyLevel: 2 },
    ],
    interests: ['Brand Identity', 'Design Handoff'],
  },
  // ── Participant 12: Full-stack generalist (Frontend + Backend + DB) ──
  {
    name: 'Liam Torres',
    email: 'liam@example.com',
    skills: [
      { skillName: 'Next.js', category: 'Frontend', proficiencyLevel: 4 },
      { skillName: 'Node.js', category: 'Backend', proficiencyLevel: 4 },
      { skillName: 'MongoDB', category: 'Data', proficiencyLevel: 4 },
      { skillName: 'GitHub Actions', category: 'DevOps', proficiencyLevel: 3 },
    ],
    interests: ['Full-Stack JS', 'Serverless'],
  },
];

export async function seedDatabase(forceClean = false) {
  console.log('Seeding MongoDB...');

  if (forceClean) {
    await Skill.deleteMany({});
    await Participant.deleteMany({});
    await Team.deleteMany({});
    await AuditLog.deleteMany({});
    await ClusteringRun.deleteMany({});
    console.log('Cleared existing collections.');
  }

  // Seed Skills
  const existingSkillsCount = await Skill.countDocuments();
  if (existingSkillsCount === 0) {
    await Skill.insertMany(defaultSkills);
    console.log(`Seeded ${defaultSkills.length} default skills.`);
  }

  // Seed Demo Participants
  const existingParticipantsCount = await Participant.countDocuments();
  if (existingParticipantsCount === 0) {
    for (const p of demoParticipants) {
      await ParticipantService.registerParticipant({
        name: p.name,
        email: p.email,
        skills: p.skills,
        interests: p.interests
      });
    }
    console.log(`Seeded ${demoParticipants.length} demo participants.`);
  }
}

// If run directly as a script
if (process.argv[1]?.endsWith('seed.js')) {
  (async () => {
    await connectDB();
    await seedDatabase(true);
    console.log('Seed completed successfully!');
    await disconnectDB();
    process.exit(0);
  })();
}
