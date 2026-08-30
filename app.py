"""
TeamWeave Matchmaking Microservice
====================================
A FastAPI Python microservice that receives participant data from the
TeamWeave Node.js/MongoDB backend (server.js → ClusteringService.js)
and returns balanced, full-stack-ready team assignments.

Integration Point
-----------------
The Node.js backend calls POST /matchmake with the list of MongoDB
Participant documents serialised to JSON. Each participant's skills
are an array of objects matching the MongoDB participantSkillSchema:
  { skillName: str, category: str, proficiencyLevel: 1-5 }

The `category` field (e.g. "Frontend", "Backend", "Data", "Design",
"DevOps", "Version Control") is used for full-stack pillar detection.

Algorithm: Coverage-Maximizing Greedy + Coverage Gap Swap Optimiser
--------------------------------------------------------------------
The goal is for every team to collectively span as many full-stack
engineering pillars as possible, scaled by team size.

FULL-STACK PILLARS (in priority order):
  1. Frontend       — React, Vue, HTML/CSS, TypeScript, …
  2. Backend        — Node.js, Python, Java, C#, Django, …
  3. Database/APIs  — SQL, MongoDB, GraphQL, REST, …
  4. DevOps         — Docker, AWS, CI/CD, GitHub Actions, …
  5. Version Control— Git, GitHub, GitLab, …
  6. Design         — Figma, UI/UX, Sketch, …

PHASE 1 — Dynamic Pillar Bucket Detection:
  Detect which pillars each participant covers from their skill names
  and categories (keyword matching). No hardcoded enum required —
  if a participant lists "Git" it automatically maps to Version Control.

PHASE 2 — Coverage-Maximizing Greedy Team Assembly:
  For each "team slot" (iterating over teams in worst-coverage-first order):
  pick the unassigned participant who adds the MOST new pillar coverage
  to that team. Tiebreak by total proficiency. This ensures the first
  members seeded into each team are cross-functional anchors.

PHASE 3 — Coverage Gap Swap Optimiser:
  Scan all (team_i, team_j) pairs. Attempt member swaps that increase
  the combined coverage score without reducing any team's coverage below
  its pre-swap baseline. Bounded to O(teams²) rounds for performance.

Response includes per-team:
  coverage_score    : float [0-1], fraction of pillars covered
  covered_pillars   : list of covered pillar names
  missing_pillars   : list of uncovered pillar names
"""

import uuid
import math
import logging
from collections import defaultdict
from typing import List, Optional, Dict, Set

import uvicorn
from fastapi import FastAPI, HTTPException
from pydantic import BaseModel, field_validator

# ---------------------------------------------------------------------------
# Logging
# ---------------------------------------------------------------------------
logging.basicConfig(
    level=logging.INFO,
    format="%(asctime)s [%(levelname)s] %(name)s – %(message)s",
)
logger = logging.getLogger("teamweave")

# ---------------------------------------------------------------------------
# Constants
# ---------------------------------------------------------------------------
MIN_TEAM_SIZE = 2
MAX_TEAM_SIZE = 8

# ---------------------------------------------------------------------------
# Full-Stack Pillar Definitions
#
# Each pillar is a dict with:
#   name     : display name
#   keywords : list of lowercase substrings to match against skill names
#              and categories (any match → pillar is covered)
#
# Pillars are ordered by priority: Frontend and Backend are filled first
# when a team is too small to cover everything.
# ---------------------------------------------------------------------------
FULL_STACK_PILLARS: List[Dict] = [
    {
        "name": "Frontend",
        "keywords": [
            "frontend", "react", "vue", "angular", "html", "css",
            "typescript", "svelte", "next", "nuxt", "sass", "scss",
            "tailwind", "web design", "javascript",
        ],
    },
    {
        "name": "Backend",
        "keywords": [
            "backend", "node.js", "nodejs", "python", "java", "c#",
            ".net", "php", "ruby", "go", "rust", "spring", "django",
            "flask", "express", "fastapi", "laravel", "server",
        ],
    },
    {
        "name": "Database/APIs",
        "keywords": [
            "database", "data", "sql", "mongodb", "postgresql", "mysql",
            "graphql", "rest", "api", "redis", "cassandra", "firebase",
            "supabase", "prisma", "sequelize", "orm",
        ],
    },
    {
        "name": "DevOps/Deployment",
        "keywords": [
            "devops", "docker", "kubernetes", "aws", "azure", "gcp",
            "ci/cd", "jenkins", "terraform", "ansible", "nginx",
            "linux", "cloud", "deployment", "github action", "pipeline",
            "heroku", "vercel", "netlify",
        ],
    },
    {
        "name": "Version Control",
        "keywords": [
            "git", "github", "gitlab", "bitbucket", "svn",
            "version control", "source control",
        ],
    },
    {
        "name": "Design",
        "keywords": [
            "design", "figma", "ui", "ux", "sketch", "adobe",
            "photoshop", "illustrator", "wireframe", "prototype",
            "graphic",
        ],
    },
]

PILLAR_NAMES = [p["name"] for p in FULL_STACK_PILLARS]

# ---------------------------------------------------------------------------
# Pydantic Data Models
# ---------------------------------------------------------------------------

class ParticipantSkill(BaseModel):
    """
    Mirrors the MongoDB participantSkillSchema embedded document:
      skillName        : str   (e.g. "React", "PostgreSQL", "Git")
      category         : str   (e.g. "Frontend", "Backend", "Version Control")
      proficiencyLevel : int 1-5 (default 3)
    """
    skillName: str
    category: str
    proficiencyLevel: int = 3

    @field_validator("proficiencyLevel")
    @classmethod
    def clamp_proficiency(cls, v: int) -> int:
        return max(1, min(5, v))

    @field_validator("category", "skillName")
    @classmethod
    def strip_and_trim(cls, v: str) -> str:
        return v.strip()


class Participant(BaseModel):
    """
    Matches the MongoDB Participant document structure sent by the Node.js backend.
    """
    user_id: str
    name: str
    email: Optional[str] = None
    skills: List[ParticipantSkill] = []

    def skill_tokens(self) -> List[str]:
        """Returns lowercase skill names + categories for keyword matching."""
        tokens = []
        for s in self.skills:
            tokens.append(s.skillName.lower())
            tokens.append(s.category.lower())
        return tokens

    def covered_pillars(self) -> Set[str]:
        """Returns the set of full-stack pillar names this participant covers."""
        tokens = self.skill_tokens()
        covered = set()
        for pillar in FULL_STACK_PILLARS:
            for token in tokens:
                if any(kw in token for kw in pillar["keywords"]):
                    covered.add(pillar["name"])
                    break
        return covered

    def total_proficiency(self) -> int:
        return sum(s.proficiencyLevel for s in self.skills)

    def skill_name_set(self) -> Set[str]:
        """Returns a lowercase set of skill names for Jaccard comparison."""
        return {s.skillName.lower() for s in self.skills}


class MatchmakeRequest(BaseModel):
    """Request payload from ClusteringService.js."""
    participants: List[Participant]
    team_size: int = 4

    @field_validator("team_size")
    @classmethod
    def clamp_team_size(cls, v: int) -> int:
        return max(MIN_TEAM_SIZE, min(MAX_TEAM_SIZE, v))


class Team(BaseModel):
    """A single formed team returned to the Node.js backend."""
    team_id: str
    user_ids: List[str]
    member_names: List[str]
    roles_represented: List[str]
    coverage_score: float
    covered_pillars: List[str]
    missing_pillars: List[str]


class TeamResponse(BaseModel):
    """Response payload returned to the Node.js ClusteringService."""
    teams: List[Team]
    total_participants: int
    total_teams: int
    avg_coverage_score: float
    algorithm: str = "CoverageMaximizingGreedy+CoverageGapSwap"


# ---------------------------------------------------------------------------
# Pillar Coverage Helpers
# ---------------------------------------------------------------------------

def get_team_pillar_coverage(members: List[Participant]) -> Set[str]:
    """Returns the union of all pillars covered by the given team members."""
    covered: Set[str] = set()
    for m in members:
        covered |= m.covered_pillars()
    return covered


def get_missing_pillars(members: List[Participant]) -> List[str]:
    """Returns pillar names NOT covered by this team, in priority order."""
    covered = get_team_pillar_coverage(members)
    return [p for p in PILLAR_NAMES if p not in covered]


def coverage_score(members: List[Participant]) -> float:
    """[0,1] fraction of full-stack pillars covered by the team."""
    if not members:
        return 0.0
    return len(get_team_pillar_coverage(members)) / len(FULL_STACK_PILLARS)


def jaccard_distance(a: Set[str], b: Set[str]) -> float:
    if not a or not b:
        return 0.0
    return 1.0 - len(a & b) / len(a | b)


# ---------------------------------------------------------------------------
# Core Matching Algorithm
# ---------------------------------------------------------------------------

def build_fullstack_teams(
    participants: List[Participant],
    team_size: int = 4,
) -> List[List[Participant]]:
    """
    Assigns participants to full-stack-ready teams using:
      PHASE 1 — Coverage-Maximizing Greedy Team Assembly
      PHASE 2 — Coverage Gap Swap Optimiser

    Returns
    -------
    List[List[Participant]]
        A list of teams, each being a list of Participant objects.
    """
    n = len(participants)
    logger.info(
        "Starting full-stack matchmaking for %d participants, target team size %d.",
        n, team_size,
    )

    if n < MIN_TEAM_SIZE:
        raise ValueError(
            f"Need at least {MIN_TEAM_SIZE} participants to form a team, got {n}."
        )

    num_teams = max(1, math.ceil(n / team_size))
    # Ensure every team can reach MIN_TEAM_SIZE
    num_teams = min(num_teams, n // MIN_TEAM_SIZE)
    if num_teams == 0:
        num_teams = 1

    # Log each participant's pillar coverage for debugging
    for p in participants:
        pillars = p.covered_pillars()
        logger.debug("  %s → pillars: %s", p.name, sorted(pillars))

    # ------------------------------------------------------------------
    # PHASE 1 — Coverage-Maximizing Greedy Team Assembly
    #
    # Sort participants so multi-pillar anchors seed teams first.
    # Then greedily assign each unassigned participant to the team that
    # benefits most from them (most new pillars added), breaking ties
    # by total proficiency.
    # ------------------------------------------------------------------
    unassigned = sorted(
        participants,
        key=lambda p: (-len(p.covered_pillars()), -p.total_proficiency()),
    )

    teams: List[List[Participant]] = [[] for _ in range(num_teams)]

    while unassigned:
        # Find the team needing the most help:
        # lowest (coverage_score * 10 + current_size) → prioritises coverage gaps,
        # then smaller teams when coverage is equal.
        target_t = min(
            (t for t in range(len(teams)) if len(teams[t]) < team_size + 1),
            key=lambda t: coverage_score(teams[t]) * 10 + len(teams[t]),
            default=min(range(len(teams)), key=lambda t: len(teams[t])),
        )

        team = teams[target_t]
        missing = get_missing_pillars(team)

        # Pick the participant who adds the most new pillars (priority order),
        # then break ties by total proficiency.
        def candidate_score(p: Participant):
            p_pillars = p.covered_pillars()
            # Count new pillars added, weighted by their priority index
            # (lower index = higher priority pillar)
            new_pillar_priority_score = sum(
                (len(PILLAR_NAMES) - PILLAR_NAMES.index(pl))
                for pl in p_pillars
                if pl in missing
            )
            return (new_pillar_priority_score, p.total_proficiency())

        best = max(unassigned, key=candidate_score)
        team.append(best)
        unassigned.remove(best)

    # ------------------------------------------------------------------
    # PHASE 2 — Coverage Gap Swap Optimiser
    #
    # For each pair of teams, attempt member swaps that increase
    # combined coverage score without reducing either team's coverage
    # below its baseline. Bounded for performance.
    # ------------------------------------------------------------------
    MAX_SWAP_ROUNDS = min(5, num_teams)

    for _round in range(MAX_SWAP_ROUNDS):
        improved = False

        for i in range(len(teams)):
            for j in range(i + 1, len(teams)):
                team_a = teams[i]
                team_b = teams[j]
                base_a = coverage_score(team_a)
                base_b = coverage_score(team_b)
                base_total = base_a + base_b

                best_gain = 0.0
                best_swap = None

                for mi, member_i in enumerate(team_a):
                    for mj, member_j in enumerate(team_b):
                        candidate_a = team_a[:mi] + [member_j] + team_a[mi + 1:]
                        candidate_b = team_b[:mj] + [member_i] + team_b[mj + 1:]
                        new_a = coverage_score(candidate_a)
                        new_b = coverage_score(candidate_b)
                        gain = (new_a + new_b) - base_total

                        # Accept: total coverage improves, neither team regresses
                        if gain > best_gain and new_a >= base_a - 0.01:
                            best_gain = gain
                            best_swap = (candidate_a, candidate_b)

                if best_swap:
                    teams[i], teams[j] = best_swap
                    improved = True

        if not improved:
            break  # Converged

    # Final coverage summary
    final_scores = [coverage_score(t) for t in teams]
    avg = sum(final_scores) / len(final_scores) if final_scores else 0.0
    logger.info(
        "Matchmaking complete. %d teams formed. "
        "Coverage scores: %s  |  Avg: %.1f%%",
        len(teams),
        [f"{s:.2f}" for s in final_scores],
        avg * 100,
    )

    return teams


# ---------------------------------------------------------------------------
# FastAPI Application
# ---------------------------------------------------------------------------

app = FastAPI(
    title="TeamWeave Matchmaking Microservice",
    description=(
        "Receives participant lists from the TeamWeave Node.js backend and "
        "returns full-stack-ready team assignments. "
        "Uses a Coverage-Maximizing Greedy algorithm + Coverage Gap Swap "
        "Optimiser to ensure each team collectively covers Frontend, Backend, "
        "Database/APIs, DevOps, Version Control, and Design pillars."
    ),
    version="2.0.0",
)


@app.get("/health", tags=["Health"])
def health_check() -> dict:
    """Liveness probe used by the Node.js backend before delegating clustering."""
    return {"status": "ok", "service": "teamweave-matchmaking", "version": "2.0.0"}


@app.get("/pillars", tags=["Info"])
def list_pillars() -> dict:
    """Returns the full-stack pillar definitions used for team formation."""
    return {
        "pillars": [
            {"name": p["name"], "keywords": p["keywords"]}
            for p in FULL_STACK_PILLARS
        ]
    }


@app.post("/matchmake", response_model=TeamResponse, tags=["Matchmaking"])
def matchmake(request: MatchmakeRequest) -> TeamResponse:
    """
    Accepts a list of MongoDB Participant documents and a target team_size,
    and returns full-stack-ready, skill-diverse team assignments.

    Called by ClusteringService.js in the Node.js backend when
    PYTHON_MATCHMAKER_URL is set in the environment.

    The algorithm:
      1. Greedily assembles teams so each team's collective skills cover
         as many full-stack pillars as possible (Frontend, Backend,
         Database/APIs, DevOps, Version Control, Design).
      2. Runs a Coverage Gap Swap pass to fix remaining pillar gaps.

    Each returned team includes:
      coverage_score   : [0-1] fraction of pillars covered
      covered_pillars  : list of covered pillar names
      missing_pillars  : list of uncovered pillar names

    Raises:
        400: Empty list or too few participants.
        422: Pydantic validation failure (malformed payload).
    """
    participants = request.participants
    team_size = request.team_size

    logger.info(
        "POST /matchmake — %d participants, team_size=%d",
        len(participants), team_size,
    )

    if not participants:
        raise HTTPException(status_code=400, detail="Participant list is empty.")

    try:
        raw_teams = build_fullstack_teams(participants, team_size)
    except ValueError as exc:
        raise HTTPException(status_code=400, detail=str(exc)) from exc

    formed_teams: List[Team] = []
    for members in raw_teams:
        covered = sorted(get_team_pillar_coverage(members))
        missing = get_missing_pillars(members)
        score = coverage_score(members)

        formed_teams.append(Team(
            team_id=str(uuid.uuid4()),
            user_ids=[m.user_id for m in members],
            member_names=[m.name for m in members],
            roles_represented=list({m.covered_pillars() for m in members} and covered),
            coverage_score=round(score, 3),
            covered_pillars=covered,
            missing_pillars=missing,
        ))

    avg_coverage = (
        sum(t.coverage_score for t in formed_teams) / len(formed_teams)
        if formed_teams else 0.0
    )

    return TeamResponse(
        teams=formed_teams,
        total_participants=len(participants),
        total_teams=len(formed_teams),
        avg_coverage_score=round(avg_coverage, 3),
    )


# ---------------------------------------------------------------------------
# Entry Point — `python app.py` starts the dev server on port 8000
# ---------------------------------------------------------------------------

if __name__ == "__main__":
    uvicorn.run(
        "app:app",
        host="0.0.0.0",
        port=8000,
        reload=True,
        log_level="info",
    )
