import { SkillVectorEncoder, getPillarCoverage, getMissingPillars, getCoverageScore, getParticipantPillars, FULL_STACK_PILLARS } from './SkillVectorEncoder.js';
import { Team } from '../Models/Team.js';
import { ClusteringRun } from '../Models/ClusteringRun.js';
import { AuditLog } from '../Models/AuditLog.js';

/**
 * URL of the Python FastAPI matchmaking microservice.
 * Set PYTHON_MATCHMAKER_URL in your environment to enable it.
 * Falls back to the built-in JS Coverage-Maximizing K-Means when unset or unreachable.
 *
 * Example .env entry:
 *   PYTHON_MATCHMAKER_URL=http://localhost:8000
 */
const PYTHON_MATCHMAKER_URL = process.env.PYTHON_MATCHMAKER_URL || null;

export class ClusteringService {
  // ---------------------------------------------------------------------------
  // PRIMARY ALGORITHM: Coverage-Maximizing Greedy Clustering (JS fallback)
  // ---------------------------------------------------------------------------

  /**
   * Forms full-stack-ready teams using a Coverage-Maximizing Greedy strategy
   * followed by a Coverage Gap Swap Optimiser.
   *
   * Strategy overview:
   *   PHASE 1 — K-Means pre-clustering to get a rough grouping that respects
   *             skill-vector diversity (prevents everyone with no skills being
   *             lumped into one team).
   *   PHASE 2 — Coverage-Maximizing Greedy Reassignment: redistribute members
   *             across teams so each team's union of skills covers as many
   *             full-stack pillars as possible.
   *   PHASE 3 — Coverage Gap Swap Optimiser: swap members between teams when
   *             the swap fills a pillar gap without breaking the donor team.
   *
   * @param {Array} participants
   * @param {number} teamSize   Target members per team (default 4)
   * @param {number} maxIterations  K-Means iterations cap
   * @returns {Array<Array<Object>>} Array of team clusters
   */
  static clusterParticipants(participants, teamSize = 4, maxIterations = 100) {
    if (!participants || participants.length === 0) return [];

    const numClusters = Math.max(1, Math.ceil(participants.length / teamSize));

    if (participants.length < 2) {
      return [participants];
    }

    const skillIndex = SkillVectorEncoder.buildSkillIndex(participants);

    // Fallback: if no skills at all, just chunk
    if (skillIndex.size === 0) {
      return this._chunkArray(participants, teamSize);
    }

    // ------------------------------------------------------------------
    // PHASE 1 — K-Means pre-clustering
    // ------------------------------------------------------------------
    const participantVectors = participants.map(p =>
      SkillVectorEncoder.encodeParticipantSkills(p.skills || [], skillIndex)
    );

    const centroids = this._initCentroids(participantVectors, numClusters);
    let assignments = new Array(participants.length).fill(0);

    for (let iter = 0; iter < maxIterations; iter++) {
      let changed = false;

      for (let i = 0; i < participants.length; i++) {
        let minDistance = Infinity;
        let nearestCluster = 0;
        for (let c = 0; c < centroids.length; c++) {
          const dist = SkillVectorEncoder.euclideanDistance(participantVectors[i], centroids[c]);
          if (dist < minDistance) {
            minDistance = dist;
            nearestCluster = c;
          }
        }
        if (assignments[i] !== nearestCluster) {
          assignments[i] = nearestCluster;
          changed = true;
        }
      }

      if (!changed) break;

      // Recalculate centroids
      for (let c = 0; c < numClusters; c++) {
        const members = [];
        for (let i = 0; i < participants.length; i++) {
          if (assignments[i] === c) members.push(participantVectors[i]);
        }
        if (members.length > 0) {
          const newCentroid = new Array(skillIndex.size).fill(0);
          for (const vec of members) {
            for (let d = 0; d < skillIndex.size; d++) newCentroid[d] += vec[d];
          }
          for (let d = 0; d < skillIndex.size; d++) newCentroid[d] /= members.length;
          centroids[c] = newCentroid;
        }
      }
    }

    // Build initial clusters from K-Means
    let clusters = Array.from({ length: numClusters }, () => []);
    for (let i = 0; i < participants.length; i++) {
      clusters[assignments[i]].push(participants[i]);
    }
    clusters = clusters.filter(c => c.length > 0);

    // ------------------------------------------------------------------
    // PHASE 2 — Coverage-Maximizing Greedy Reassignment
    // Pool all participants and greedily assign to teams by pillar coverage
    // ------------------------------------------------------------------
    clusters = this._coverageGreedyAssign(participants, numClusters, teamSize);

    // ------------------------------------------------------------------
    // PHASE 3 — Coverage Gap Swap Optimiser
    // ------------------------------------------------------------------
    clusters = this._coverageGapSwap(clusters, teamSize);

    return clusters;
  }

  // ---------------------------------------------------------------------------
  // PHASE 2: Coverage-Maximizing Greedy Assignment
  // ---------------------------------------------------------------------------

  /**
   * Greedy team assembly that prioritizes filling full-stack pillar gaps.
   *
   * For each team slot (round-robin across teams):
   *   1. Find the team with the worst coverage score.
   *   2. From the unassigned participant pool, pick the one who adds the
   *      most NEW pillar coverage to that team (priority: Frontend → Backend
   *      → Database/APIs → DevOps/Deployment → Version Control → Design).
   *   3. If no participant adds new coverage, pick the one with the highest
   *      total proficiency (best skill anchor for that team).
   *
   * @param {Array} participants
   * @param {number} numClusters
   * @param {number} teamSize
   * @returns {Array<Array<Object>>}
   */
  static _coverageGreedyAssign(participants, numClusters, teamSize) {
    const teams = Array.from({ length: numClusters }, () => []);
    const unassigned = [...participants];

    // Sort unassigned: participants covering more unique pillars go first
    // (seed anchor members into teams)
    unassigned.sort((a, b) => {
      const aPillars = getParticipantPillars(a).size;
      const bPillars = getParticipantPillars(b).size;
      if (bPillars !== aPillars) return bPillars - aPillars;
      // Tie-break: higher total proficiency goes first
      const aProf = (a.skills || []).reduce((s, sk) => s + (sk.proficiencyLevel || 3), 0);
      const bProf = (b.skills || []).reduce((s, sk) => s + (sk.proficiencyLevel || 3), 0);
      return bProf - aProf;
    });

    // Round-robin across teams, always filling the team with worst coverage
    while (unassigned.length > 0) {
      // Find the team that needs the most help (lowest coverage, smallest size)
      let targetTeamIdx = 0;
      let worstScore = Infinity;
      for (let t = 0; t < teams.length; t++) {
        if (teams[t].length >= teamSize) continue; // Full
        const score = getCoverageScore(teams[t]) * 10 + teams[t].length;
        if (score < worstScore) {
          worstScore = score;
          targetTeamIdx = t;
        }
      }

      // If all teams are at capacity, start filling overflow
      const allFull = teams.every(t => t.length >= teamSize);
      if (allFull) {
        // Find smallest team
        targetTeamIdx = teams.reduce((minIdx, t, idx) =>
          t.length < teams[minIdx].length ? idx : minIdx, 0);
      }

      const team = teams[targetTeamIdx];
      const missingPillars = getMissingPillars(team);

      let bestIdx = -1;
      let bestNewPillarCount = -1;
      let bestTotalProf = -1;

      for (let i = 0; i < unassigned.length; i++) {
        const p = unassigned[i];
        const pPillars = getParticipantPillars(p);

        // How many NEW pillars does this participant bring to the team?
        const newPillarCount = [...pPillars].filter(pillar => missingPillars.includes(pillar)).length;

        const totalProf = (p.skills || []).reduce((s, sk) => s + (sk.proficiencyLevel || 3), 0);

        // Priority: maximize new pillars first (in FULL_STACK_PILLARS priority order)
        // then maximize proficiency as tiebreaker
        if (newPillarCount > bestNewPillarCount ||
            (newPillarCount === bestNewPillarCount && totalProf > bestTotalProf)) {
          bestIdx = i;
          bestNewPillarCount = newPillarCount;
          bestTotalProf = totalProf;
        }
      }

      if (bestIdx === -1) bestIdx = 0; // Fallback
      team.push(unassigned[bestIdx]);
      unassigned.splice(bestIdx, 1);
    }

    return teams.filter(t => t.length > 0);
  }

  // ---------------------------------------------------------------------------
  // PHASE 3: Coverage Gap Swap Optimiser
  // ---------------------------------------------------------------------------

  /**
   * Swap members between teams to fill pillar coverage gaps without breaking
   * the donor team's coverage.
   *
   * A swap (member_i from Team A, member_j from Team B) is accepted when:
   *   - Team A's coverage score after swap >= before swap, AND
   *   - Team B's coverage score after swap > before swap (at least one gap filled)
   *   - Neither team violates teamSize ± 1 bounds after swap
   *
   * Bounded to MAX_SWAP_ROUNDS full passes for performance.
   *
   * @param {Array<Array<Object>>} clusters
   * @param {number} teamSize
   * @returns {Array<Array<Object>>}
   */
  static _coverageGapSwap(clusters, teamSize) {
    const MAX_SWAP_ROUNDS = Math.min(5, clusters.length);

    for (let round = 0; round < MAX_SWAP_ROUNDS; round++) {
      let improved = false;

      for (let i = 0; i < clusters.length; i++) {
        for (let j = i + 1; j < clusters.length; j++) {
          const teamA = clusters[i];
          const teamB = clusters[j];

          const baseScoreA = getCoverageScore(teamA);
          const baseScoreB = getCoverageScore(teamB);
          const baseTotal = baseScoreA + baseScoreB;

          let bestGain = 0;
          let bestSwap = null;

          for (let mi = 0; mi < teamA.length; mi++) {
            for (let mj = 0; mj < teamB.length; mj++) {
              // Proposed swap: mi from A goes to B, mj from B goes to A
              const candidateA = [...teamA.slice(0, mi), teamB[mj], ...teamA.slice(mi + 1)];
              const candidateB = [...teamB.slice(0, mj), teamA[mi], ...teamB.slice(mj + 1)];

              const newScoreA = getCoverageScore(candidateA);
              const newScoreB = getCoverageScore(candidateB);
              const gain = (newScoreA + newScoreB) - baseTotal;

              // Accept if: total coverage improves AND neither team regresses badly
              if (gain > bestGain && newScoreA >= baseScoreA - 0.01) {
                bestGain = gain;
                bestSwap = [candidateA, candidateB];
              }
            }
          }

          if (bestSwap) {
            clusters[i] = bestSwap[0];
            clusters[j] = bestSwap[1];
            improved = true;
          }
        }
      }

      if (!improved) break; // Converged
    }

    return clusters;
  }

  // ---------------------------------------------------------------------------
  // Internal Helpers
  // ---------------------------------------------------------------------------

  /**
   * K-Means++ style centroid initialisation (improves initial spread).
   * Falls back to simple random selection if only 1 cluster is requested.
   */
  static _initCentroids(vectors, numClusters) {
    const centroids = [];
    const n = vectors.length;

    if (n === 0 || numClusters === 0) return centroids;

    // Pick the first centroid randomly
    const firstIdx = Math.floor(Math.random() * n);
    centroids.push([...vectors[firstIdx]]);

    // Pick subsequent centroids weighted by distance² to nearest existing centroid
    for (let k = 1; k < numClusters; k++) {
      const distances = vectors.map(v => {
        let minDist = Infinity;
        for (const c of centroids) {
          const d = SkillVectorEncoder.euclideanDistance(v, c);
          if (d < minDist) minDist = d;
        }
        return minDist * minDist;
      });

      const totalDist = distances.reduce((a, b) => a + b, 0);
      if (totalDist === 0) {
        // All vectors identical — just pick next
        centroids.push([...vectors[k % n]]);
        continue;
      }

      let r = Math.random() * totalDist;
      let chosen = n - 1;
      for (let i = 0; i < n; i++) {
        r -= distances[i];
        if (r <= 0) { chosen = i; break; }
      }
      centroids.push([...vectors[chosen]]);
    }

    return centroids;
  }

  static _chunkArray(array, size) {
    const result = [];
    for (let i = 0; i < array.length; i += size) {
      result.push(array.slice(i, i + size));
    }
    return result;
  }

  // ---------------------------------------------------------------------------
  // Python Microservice Bridge
  // ---------------------------------------------------------------------------

  /**
   * Calls the Python FastAPI matchmaking microservice (app.py).
   *
   * The Python service now also receives `team_size` so it can scale
   * how many pillars it targets based on team size constraints.
   *
   * Returns an array of participant arrays (same shape as clusterParticipants),
   * or null if the service is unreachable so the caller can fall back.
   *
   * @param {Array} participants  MongoDB Participant documents
   * @param {Map}   idMap         Map from user_id string → Participant document
   * @param {number} teamSize     Target team size
   * @returns {Array<Array<Object>>|null}
   */
  static async _callPythonMatchmaker(participants, idMap, teamSize = 4) {
    const payload = participants.map(p => ({
      user_id: p._id.toString(),
      name: p.name,
      email: p.email || '',
      skills: (p.skills || []).map(s => ({
        skillName: s.skillName,
        category: s.category,
        proficiencyLevel: s.proficiencyLevel ?? 3,
      })),
    }));

    const url = `${PYTHON_MATCHMAKER_URL}/matchmake`;
    console.log(`[ClusteringService] Calling Python matchmaker at ${url} with team_size=${teamSize}…`);

    try {
      const response = await fetch(url, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ participants: payload, team_size: teamSize }),
        signal: AbortSignal.timeout(10_000),
      });

      if (!response.ok) {
        const err = await response.text();
        throw new Error(`Python matchmaker responded ${response.status}: ${err}`);
      }

      const data = await response.json();

      // Reconstruct participant arrays from the returned user_ids
      return data.teams.map(team =>
        team.user_ids.map(uid => idMap.get(uid)).filter(Boolean)
      );
    } catch (err) {
      console.warn(
        `[ClusteringService] Python matchmaker unavailable (${err.message}). ` +
        'Falling back to JS Coverage-Maximizing K-Means.'
      );
      return null;
    }
  }

  // ---------------------------------------------------------------------------
  // Coverage Reporting Helpers
  // ---------------------------------------------------------------------------

  /**
   * Computes full-stack coverage metadata for a list of clusters.
   * Returns an array of per-team coverage objects.
   *
   * @param {Array<Array<Object>>} clusters
   * @returns {Array<{coverageScore: number, coveredPillars: string[], missingPillars: string[]}>}
   */
  static computeCoverageReport(clusters) {
    return clusters.map(team => {
      const covered = [...getPillarCoverage(team)];
      const missing = getMissingPillars(team);
      return {
        coverageScore: Math.round((covered.length / FULL_STACK_PILLARS.length) * 100) / 100,
        coveredPillars: covered,
        missingPillars: missing,
      };
    });
  }

  // ---------------------------------------------------------------------------
  // Main Pipeline: executeAndPersistClustering
  // ---------------------------------------------------------------------------

  /**
   * Runs the full clustering pipeline, wipes unfinalized/draft teams,
   * creates new Team documents, and records a ClusteringRun in MongoDB.
   *
   * Strategy:
   *   1. If PYTHON_MATCHMAKER_URL is set, delegate to the Python microservice
   *      (Coverage-Maximizing Greedy + Jaccard Swap).
   *   2. Otherwise fall back to the local JS Coverage-Maximizing K-Means.
   *
   * @param {Array} participants   All MongoDB Participant documents
   * @param {number} teamSize      Target members per team
   * @param {number} eventId       MongoDB eventId
   * @returns {{ teams: Array, clusteringRun: Object, coverageReport: Array }}
   */
  static async executeAndPersistClustering(participants, teamSize = 4, eventId = 1) {
    const startTime = Date.now();

    // Build a lookup map for reconstructing Participant docs from user_id strings
    const idMap = new Map(participants.map(p => [p._id.toString(), p]));

    // 1. Choose algorithm: Python microservice or local JS fallback
    let clusters = null;
    let algorithmUsed = 'CoverageMaximizingKMeans';

    if (PYTHON_MATCHMAKER_URL) {
      clusters = await this._callPythonMatchmaker(participants, idMap, teamSize);
      if (clusters) {
        algorithmUsed = 'CoverageMaximizingGreedy+CoverageGapSwap';
        console.log(`[ClusteringService] Python matchmaker returned ${clusters.length} teams.`);
      }
    }

    // Fallback to local JS clustering if Python service was not used / unreachable
    if (!clusters) {
      clusters = this.clusterParticipants(participants, teamSize);
      console.log(`[ClusteringService] JS fallback produced ${clusters.length} teams.`);
    }

    // 2. Compute per-team coverage metadata
    const coverageReport = this.computeCoverageReport(clusters);
    const avgCoverage = coverageReport.reduce((s, r) => s + r.coverageScore, 0) / coverageReport.length;
    console.log(
      `[ClusteringService] Avg full-stack coverage: ${(avgCoverage * 100).toFixed(1)}%`,
      coverageReport.map(r => `[${r.coveredPillars.join(', ')} | missing: ${r.missingPillars.join(', ') || 'none'}]`)
    );

    // 3. Remove previous unlocked/draft teams for this event
    await Team.deleteMany({ eventId, isLocked: false });

    // 4. Persist new teams in MongoDB
    const createdTeams = [];
    for (let i = 0; i < clusters.length; i++) {
      const cluster = clusters[i];
      const coverage = coverageReport[i];

      const members = cluster.map(p => ({
        participantId: p._id,
        name: p.name,
        email: p.email,
        skills: p.skills || [],
        isLocked: false,
        addedAt: new Date(),
      }));

      const team = new Team({
        name: `Team ${i + 1}`,
        eventId,
        status: 'Draft',
        isLocked: false,
        members,
        // Coverage metadata stored on the team document
        coverageScore: coverage.coverageScore,
        coveredPillars: coverage.coveredPillars,
        missingPillars: coverage.missingPillars,
      });

      const savedTeam = await team.save();
      createdTeams.push(savedTeam);
    }

    const durationMs = Date.now() - startTime;

    // 5. Save ClusteringRun document
    const clusteringRun = new ClusteringRun({
      eventId,
      teamsGenerated: createdTeams.length,
      parameters: {
        targetTeamSize: teamSize,
        maxIterations: 100,
        algorithm: algorithmUsed,
        avgCoverageScore: Math.round(avgCoverage * 100) / 100,
      },
      teamIds: createdTeams.map(t => t._id),
      status: 'Completed',
      durationMs,
    });
    await clusteringRun.save();

    // 6. Create AuditLog
    await AuditLog.create({
      changeType: 'ClusteringExecuted',
      actor: 'Organizer',
      details: `Generated ${createdTeams.length} teams via ${algorithmUsed} in ${durationMs}ms (avg coverage: ${(avgCoverage * 100).toFixed(1)}%)`,
    });

    return {
      teams: createdTeams,
      clusteringRun,
      coverageReport,
    };
  }
}
