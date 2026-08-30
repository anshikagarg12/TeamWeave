import fs from 'fs';
import path from 'path';
import { fileURLToPath } from 'url';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);
const rootDir = path.resolve(__dirname, '..');

// List of unnecessary files to remove
const filesToRemove = [
  // Redundant documentation clutter
  'ARCHITECTURE.md',
  'COMPLETION_CERTIFICATE.txt',
  'DELIVERY_SUMMARY.txt',
  'DEVELOPER_GUIDE.md',
  'FILE_INDEX.md',
  'GETTING_STARTED.md',
  'IMPLEMENTATION.md',
  'PROJECT_STATUS.md',
  'PROJECT_STATUS.txt',
  'START_HERE.md',

  // Legacy C# solution & project files
  'App.config',
  'Program.cs',
  'TeamWeave.csproj',
  'TeamWeave.sln',

  // C# Models
  'Models/AuditLog.cs',
  'Models/ClusteringRun.cs',
  'Models/Participant.cs',
  'Models/ParticipantSkill.cs',
  'Models/Skill.cs',
  'Models/Team.cs',
  'Models/TeamMember.cs',

  // C# Services
  'Services/ClusteringService.cs',
  'Services/ParticipantService.cs',
  'Services/SkillVectorEncoder.cs',
  'Services/TeamService.cs',

  // C# Utilities
  'Utilities/DataExporter.cs',
  'Utilities/SkillRepository.cs',

  // Properties
  'Properties/AssemblyInfo.cs',
];

// Directories to remove
const dirsToRemove = [
  'Properties',
  'Utilities',
  'bin',
  'obj',
  '.vs',
];

export function cleanUnnecessaryFiles(verbose = true) {
  let count = 0;

  for (const relPath of filesToRemove) {
    const fullPath = path.join(rootDir, relPath);
    if (fs.existsSync(fullPath)) {
      try {
        fs.unlinkSync(fullPath);
        count++;
        if (verbose) console.log(`  🗑️ Removed file: ${relPath}`);
      } catch (err) {
        if (verbose) console.warn(`  ⚠️ Could not remove ${relPath}: ${err.message}`);
      }
    }
  }

  for (const relDir of dirsToRemove) {
    const fullDir = path.join(rootDir, relDir);
    if (fs.existsSync(fullDir)) {
      try {
        fs.rmSync(fullDir, { recursive: true, force: true });
        count++;
        if (verbose) console.log(`  🗑️ Removed directory: ${relDir}/`);
      } catch (err) {
        if (verbose) console.warn(`  ⚠️ Could not remove dir ${relDir}: ${err.message}`);
      }
    }
  }

  if (verbose) {
    if (count > 0) {
      console.log(`✨ Cleanup completed: removed ${count} unwanted legacy/redundant items.`);
    } else {
      console.log('✨ Repository is already clean.');
    }
  }

  return count;
}

// Run directly if invoked as script
if (process.argv[1]?.endsWith('clean.js')) {
  console.log('🧹 Cleaning unnecessary and legacy files from TeamWeave...');
  cleanUnnecessaryFiles(true);
}
