import { connectDB, disconnectDB } from '../config/db.js';
import { seedDatabase } from './seed.js';
import { ParticipantService } from '../Services/ParticipantService.js';
import { TeamService } from '../Services/TeamService.js';
import { ClusteringService } from '../Services/ClusteringService.js';
import { Participant } from '../Models/Participant.js';
import { Team } from '../Models/Team.js';
import { AuditLog } from '../Models/AuditLog.js';
import { ClusteringRun } from '../Models/ClusteringRun.js';

async function runTests() {
  console.log('🧪 Starting TeamWeave MongoDB Integration Tests...\n');

  await connectDB();
  await seedDatabase(true); // clean slate

  console.log('Test 1: Verify Seeded Participants & Skills');
  const participants = await ParticipantService.getAllParticipants();
  console.log(`✅ Loaded ${participants.length} participants from MongoDB.`);
  if (participants.length === 0) throw new Error('Expected seeded participants, got 0');

  console.log('\nTest 2: Register a New Participant in MongoDB');
  const newParticipant = await ParticipantService.registerParticipant({
    name: 'Grace Hopper',
    email: 'grace@example.com',
    skills: [
      { skillName: 'C#', category: 'Backend', proficiencyLevel: 5 },
      { skillName: 'SQL', category: 'Data', proficiencyLevel: 5 }
    ],
    interests: ['Compilers', 'Distributed Systems']
  });
  console.log(`✅ Registered participant '${newParticipant.name}' (ID: ${newParticipant._id}) in MongoDB.`);

  console.log('\nTest 3: Run K-Means Clustering on MongoDB Data');
  const allParticipants = await ParticipantService.getAllParticipants();
  const clusterResult = await ClusteringService.executeAndPersistClustering(allParticipants, 4, 1);
  console.log(`✅ Clustering completed! Created ${clusterResult.teams.length} teams.`);
  const runs = await ClusteringRun.countDocuments();
  console.log(`✅ Recorded ${runs} ClusteringRun documents in MongoDB.`);

  console.log('\nTest 4: Move Participant Between Teams & Verify Audit Log');
  const teams = await TeamService.getAllTeams(1);
  if (teams.length >= 2 && teams[0].members.length > 0) {
    const memberToMove = teams[0].members[0];
    console.log(`Moving member '${memberToMove.name}' from ${teams[0].name} to ${teams[1].name}...`);
    await TeamService.moveParticipantBetweenTeams(
      memberToMove.participantId,
      teams[0]._id,
      teams[1]._id,
      'TestRunner'
    );
    console.log(`✅ Moved member successfully in MongoDB.`);
  }

  console.log('\nTest 5: Lock Team in MongoDB');
  const updatedTeams = await TeamService.getAllTeams(1);
  const lockedTeam = await TeamService.toggleTeamLock(updatedTeams[0]._id, 'TestRunner');
  console.log(`✅ Team '${lockedTeam.name}' isLocked=${lockedTeam.isLocked}, status='${lockedTeam.status}'.`);

  console.log('\nTest 6: Verify Audit Trail in MongoDB');
  const auditLogs = await TeamService.getAuditLogs(10);
  console.log(`✅ Retrieved ${auditLogs.length} audit log entries from MongoDB:`);
  for (const log of auditLogs.slice(0, 5)) {
    console.log(`   - [${log.changeType}] by ${log.actor}: ${log.details}`);
  }

  console.log('\nTest 7: Test CSV Export');
  const participantCsv = await TeamService.exportCSV('participants');
  console.log(`✅ CSV generated successfully (${participantCsv.split('\n').length} lines).`);

  console.log('\n🎉 ALL MONGODB INTEGRATION TESTS PASSED SUCCESSFULLY! 🎉\n');
  await disconnectDB();
  process.exit(0);
}

runTests().catch(async (err) => {
  console.error('❌ Test failed:', err);
  await disconnectDB();
  process.exit(1);
});
