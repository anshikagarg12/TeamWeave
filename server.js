import express from 'express';
import cors from 'cors';
import path from 'path';
import { fileURLToPath } from 'url';
import { connectDB, disconnectDB } from './config/db.js';
import { seedDatabase } from './scripts/seed.js';
import { cleanUnnecessaryFiles } from './scripts/clean.js';
import { Skill } from './Models/Skill.js';
import { ParticipantService } from './Services/ParticipantService.js';
import { TeamService } from './Services/TeamService.js';
import { ClusteringService } from './Services/ClusteringService.js';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

const app = express();
const PORT = process.env.PORT || 3000;

// Middlewares
app.use(cors());
app.use(express.json());
app.use(express.static(__dirname));

// ================= API ROUTES ================= //

// Health check
app.get('/api/health', (req, res) => {
  res.json({ status: 'ok', time: new Date().toISOString() });
});

// Skills Catalog
app.get('/api/skills', async (req, res) => {
  try {
    const skills = await Skill.find().sort({ category: 1, name: 1 });
    res.json(skills);
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

// Seed / Reset Database with Demo Data
app.post('/api/seed', async (req, res) => {
  try {
    const forceClean = req.body.forceClean !== false;
    await seedDatabase(forceClean);
    res.json({ message: 'Database seeded successfully with demo participants and skills catalog.' });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

// Participants
app.get('/api/participants', async (req, res) => {
  try {
    const { category } = req.query;
    const participants = await ParticipantService.getAllParticipants(category);
    res.json(participants);
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

app.post('/api/participants', async (req, res) => {
  try {
    const { name, email, skills, interests } = req.body;
    const participant = await ParticipantService.registerParticipant({
      name,
      email,
      skills,
      interests,
    });
    res.status(201).json(participant);
  } catch (err) {
    res.status(400).json({ error: err.message });
  }
});

app.get('/api/participants/:id', async (req, res) => {
  try {
    const participant = await ParticipantService.getParticipantById(req.params.id);
    if (!participant) {
      return res.status(404).json({ error: 'Participant not found' });
    }
    res.json(participant);
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

// Teams
app.get('/api/teams', async (req, res) => {
  try {
    const eventId = req.query.eventId ? Number(req.query.eventId) : 1;
    const teams = await TeamService.getAllTeams(eventId);
    res.json(teams);
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

app.post('/api/teams', async (req, res) => {
  try {
    const { name, eventId, members } = req.body;
    const team = await TeamService.createTeam(name, eventId, members);
    res.status(201).json(team);
  } catch (err) {
    res.status(400).json({ error: err.message });
  }
});

// Clustering Pipeline
app.post('/api/clustering/run', async (req, res) => {
  try {
    const teamSize = Number(req.body.teamSize) || 4;
    const eventId = Number(req.body.eventId) || 1;

    const participants = await ParticipantService.getAllParticipants();
    if (participants.length === 0) {
      return res.status(400).json({ error: 'No participants available to cluster.' });
    }

    const result = await ClusteringService.executeAndPersistClustering(participants, teamSize, eventId);

    // Include per-team full-stack coverage metadata in the response
    const response = {
      teams: result.teams,
      clusteringRun: result.clusteringRun,
      coverageReport: result.coverageReport,
      summary: {
        totalTeams: result.teams.length,
        avgCoverageScore: result.coverageReport
          ? Math.round(
              result.coverageReport.reduce((s, r) => s + r.coverageScore, 0) /
              result.coverageReport.length * 100
            ) / 100
          : null,
      },
    };

    res.json(response);
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

// Move Participant Between Teams
app.post('/api/teams/move', async (req, res) => {
  try {
    const { participantId, fromTeamId, toTeamId, actor } = req.body;
    const result = await TeamService.moveParticipantBetweenTeams(
      participantId,
      fromTeamId,
      toTeamId,
      actor || 'Organizer'
    );
    res.json(result);
  } catch (err) {
    res.status(400).json({ error: err.message });
  }
});

// Lock / Unlock Team
app.patch('/api/teams/:id/lock', async (req, res) => {
  try {
    const { actor } = req.body;
    const team = await TeamService.toggleTeamLock(req.params.id, actor || 'Organizer');
    res.json(team);
  } catch (err) {
    res.status(400).json({ error: err.message });
  }
});

// Lock / Unlock Member in Team
app.patch('/api/teams/:id/member/:participantId/lock', async (req, res) => {
  try {
    const { actor } = req.body;
    const team = await TeamService.toggleParticipantLockInTeam(
      req.params.id,
      req.params.participantId,
      actor || 'Organizer'
    );
    res.json(team);
  } catch (err) {
    res.status(400).json({ error: err.message });
  }
});

// Audit Trail
app.get('/api/audit-logs', async (req, res) => {
  try {
    const limit = Number(req.query.limit) || 100;
    const logs = await TeamService.getAuditLogs(limit);
    res.json(logs);
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

// Statistics
app.get('/api/stats', async (req, res) => {
  try {
    const stats = await TeamService.getStats();
    res.json(stats);
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

// CSV Export
app.get('/api/export/:type', async (req, res) => {
  try {
    const { type } = req.params;
    const csv = await TeamService.exportCSV(type);
    res.setHeader('Content-Type', 'text/csv');
    res.setHeader('Content-Disposition', `attachment; filename="${type}.csv"`);
    res.send(csv);
  } catch (err) {
    res.status(400).json({ error: err.message });
  }
});

// Fallback to index.html for UI
app.get('*', (req, res) => {
  res.sendFile(path.join(__dirname, 'index.html'));
});

// Start Server
async function startServer() {
  cleanUnnecessaryFiles(false);
  await connectDB();
  await seedDatabase(false);

  const server = app.listen(PORT, () => {
    console.log(`========================================`);
    console.log(`  TeamWeave Portal running on port ${PORT}`);
    console.log(`  URL: http://localhost:${PORT}`);
    console.log(`========================================`);
  });

  const shutdown = async (signal) => {
    console.log(`\nReceived ${signal}. Shutting down gracefully...`);
    server.close(async () => {
      await disconnectDB();
      console.log('Server terminated cleanly.');
      process.exit(0);
    });
  };

  process.on('SIGINT', () => shutdown('SIGINT'));
  process.on('SIGTERM', () => shutdown('SIGTERM'));
}

startServer().catch(err => {
  console.error('Server failed to start:', err);
  process.exit(1);
});
