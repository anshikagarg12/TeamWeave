/**
 * SkillVectorEncoder converts participant skill proficiencies into normalized numerical vectors
 * and calculates mathematical distances and similarities between participants.
 *
 * It also provides full-stack pillar coverage utilities used by the clustering algorithms
 * to ensure each generated team collectively covers all key engineering disciplines.
 */

/**
 * Full-stack pillar definitions.
 *
 * Each pillar maps to a set of lowercase keyword fragments found in skill names or categories.
 * Pillars are ordered by priority: Frontend and Backend are seeded first when a team is small
 * (per the "maximize partial coverage" policy).
 *
 * The algorithm dynamically detects categories from participant data so no schema changes
 * are required — if participants list Git/GitHub those automatically contribute to the
 * "Version Control" pillar.
 */
export const FULL_STACK_PILLARS = [
  {
    name: 'Frontend',
    // Matches skill names OR category containing any of these substrings (case-insensitive)
    keywords: ['frontend', 'react', 'vue', 'angular', 'html', 'css', 'typescript', 'svelte', 'next', 'nuxt', 'sass', 'scss', 'tailwind'],
  },
  {
    name: 'Backend',
    keywords: ['backend', 'node.js', 'node js', 'python', 'java', 'c#', '.net', 'php', 'ruby', 'go', 'rust', 'spring', 'django', 'flask', 'express', 'fastapi', 'laravel'],
  },
  {
    name: 'Database/APIs',
    keywords: ['database', 'data', 'sql', 'mongodb', 'postgresql', 'mysql', 'graphql', 'rest', 'api', 'redis', 'cassandra', 'firebase', 'supabase', 'prisma', 'sequelize'],
  },
  {
    name: 'DevOps/Deployment',
    keywords: ['devops', 'docker', 'kubernetes', 'aws', 'azure', 'gcp', 'ci/cd', 'jenkins', 'terraform', 'ansible', 'nginx', 'linux', 'cloud', 'deployment', 'github action', 'pipeline'],
  },
  {
    name: 'Version Control',
    keywords: ['git', 'github', 'gitlab', 'bitbucket', 'svn', 'version control', 'source control'],
  },
  {
    name: 'Design',
    keywords: ['design', 'figma', 'ui', 'ux', 'sketch', 'adobe', 'photoshop', 'illustrator', 'wireframe', 'prototype'],
  },
];

/**
 * Returns which full-stack pillars are covered by a list of participants' skills.
 *
 * A pillar is considered "covered" if at least one participant has at least one skill
 * whose name OR category contains any of that pillar's keyword fragments.
 *
 * @param {Array<{skills: Array<{skillName: string, category: string}>}>} participants
 * @returns {Set<string>}  Set of covered pillar names
 */
export function getPillarCoverage(participants) {
  const covered = new Set();

  // Collect all skill tokens from all participants
  const allTokens = [];
  for (const p of participants) {
    for (const s of (p.skills || [])) {
      allTokens.push((s.skillName || '').toLowerCase());
      allTokens.push((s.category || '').toLowerCase());
    }
  }

  for (const pillar of FULL_STACK_PILLARS) {
    for (const token of allTokens) {
      if (pillar.keywords.some(kw => token.includes(kw))) {
        covered.add(pillar.name);
        break;
      }
    }
  }

  return covered;
}

/**
 * Returns the pillar(s) NOT yet covered by the given set of participants.
 *
 * @param {Array} participants
 * @returns {string[]}  Array of missing pillar names (in priority order)
 */
export function getMissingPillars(participants) {
  const covered = getPillarCoverage(participants);
  return FULL_STACK_PILLARS.map(p => p.name).filter(name => !covered.has(name));
}

/**
 * Returns a [0, 1] coverage score: fraction of full-stack pillars covered by
 * the given participants collectively.
 *
 * @param {Array} participants
 * @returns {number}
 */
export function getCoverageScore(participants) {
  if (!participants || participants.length === 0) return 0;
  const covered = getPillarCoverage(participants);
  return covered.size / FULL_STACK_PILLARS.length;
}

/**
 * Returns the set of full-stack pillars covered by a SINGLE participant's skills.
 *
 * @param {{skills: Array<{skillName: string, category: string}>}} participant
 * @returns {Set<string>}
 */
export function getParticipantPillars(participant) {
  return getPillarCoverage([participant]);
}

// ---------------------------------------------------------------------------
// Class-based API (kept for backward compatibility with existing imports)
// ---------------------------------------------------------------------------

export class SkillVectorEncoder {
  /**
   * Encodes a participant's skills into a normalized vector ([0.0 - 1.0]).
   * @param {Array<{skillName: string, proficiencyLevel: number}>} skills
   * @param {Map<string, number>} skillIndex
   * @returns {number[]}
   */
  static encodeParticipantSkills(skills, skillIndex) {
    const vector = new Array(skillIndex.size).fill(0);

    for (const skill of skills) {
      if (skillIndex.has(skill.skillName)) {
        const index = skillIndex.get(skill.skillName);
        // Normalize 1-5 scale to 0.2-1.0
        vector[index] = (skill.proficiencyLevel || 3) / 5.0;
      }
    }

    return vector;
  }

  /**
   * Calculates Euclidean distance between two vectors: sqrt(sum((a_i - b_i)^2))
   * @param {number[]} v1
   * @param {number[]} v2
   * @returns {number}
   */
  static euclideanDistance(v1, v2) {
    if (v1.length !== v2.length) {
      throw new Error(`Vector dimensions must match: ${v1.length} vs ${v2.length}`);
    }

    let sum = 0;
    for (let i = 0; i < v1.length; i++) {
      const diff = v1[i] - v2[i];
      sum += diff * diff;
    }

    return Math.sqrt(sum);
  }

  /**
   * Calculates Cosine Similarity between two vectors: (a . b) / (||a|| * ||b||)
   * @param {number[]} v1
   * @param {number[]} v2
   * @returns {number}
   */
  static cosineSimilarity(v1, v2) {
    if (v1.length !== v2.length) {
      throw new Error(`Vector dimensions must match: ${v1.length} vs ${v2.length}`);
    }

    let dotProduct = 0;
    let mag1 = 0;
    let mag2 = 0;

    for (let i = 0; i < v1.length; i++) {
      dotProduct += v1[i] * v2[i];
      mag1 += v1[i] * v1[i];
      mag2 += v2[i] * v2[i];
    }

    mag1 = Math.sqrt(mag1);
    mag2 = Math.sqrt(mag2);

    if (mag1 === 0 || mag2 === 0) return 0;
    return dotProduct / (mag1 * mag2);
  }

  /**
   * Builds an index map of all distinct skill names across all participants.
   * @param {Array} participants
   * @returns {Map<string, number>}
   */
  static buildSkillIndex(participants) {
    const skillIndex = new Map();
    let index = 0;

    for (const participant of participants) {
      for (const skill of participant.skills || []) {
        if (!skillIndex.has(skill.skillName)) {
          skillIndex.set(skill.skillName, index++);
        }
      }
    }

    return skillIndex;
  }

  // Expose pillar utilities as static class methods for convenience
  static getPillarCoverage = getPillarCoverage;
  static getMissingPillars = getMissingPillars;
  static getCoverageScore = getCoverageScore;
  static getParticipantPillars = getParticipantPillars;
}
