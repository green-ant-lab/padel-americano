import type {
  Match,
  Player,
  PlayerStanding,
  Round,
  Team,
  Tournament,
} from '../types';

export type { PlayerStanding } from '../types';

/**
 * Creates a canonical, sorted key (`"id1_id2"`) for a pair of player IDs.
 * Used both in-memory during round generation and in persistent `pairHistory`.
 */
export function getPairKey(idA: string, idB: string): string {
  return idA < idB ? `${idA}_${idB}` : `${idB}_${idA}`;
}

interface CandidateTeam {
  players: [Player, Player];
  teamIds: Team;
  key: string;
  historyCount: number;
  sessionCount: number;
  isMixedLevel: boolean;
  aLevelCount: number;
}

interface MatchPairingCandidate {
  teamA: Team;
  teamB: Team;
  cost: number;
}

/**
 * Evaluates all 3 ways to split 4 players into 2 teams of 2 and returns
 * the pairing with the lowest cost according to the History-Aware &
 * Level-Balanced Americano rules:
 *
 * 1. **Anti-Blowout Level Balancing**:
 *    - Heavily restricts/penalizes `Level A + Level A` vs `Level B + Level B`
 *      (`levelDiff === 2`, weight 1,000,000) to prevent 24-0 blowouts.
 *    - Rewards mixed-level teams (`Level A + Level B`) and penalizes
 *      unbalanced courts (`levelDiff === 1`, weight 8,000) so 2-court splits
 *      naturally distribute A/B players into mixed pairs.
 * 2. **In-Tournament Partner Uniqueness**:
 *    - Strong quadratic penalty (`weight 50,000`) for repeating the same
 *      teammate within the current tournament session.
 * 3. **Cross-Tournament History Prioritization (`pairHistory`)**:
 *    - Candidate teams are scored and sorted ascending by their persistent
 *      `pairHistory` count (`weight 2,000` quadratic) so pairs with 0 or 1
 *      past games together are strictly prioritized over frequent past partners.
 * 4. **Opponent Variety**:
 *    - Secondary penalty (`weight 100`) for repeated opponent matchups.
 */
function findBestSingleCourtMatch(
  fourPlayers: [Player, Player, Player, Player],
  sessionPartnerCounts: Map<string, number>,
  opponentCounts: Map<string, number>,
  pairHistory: Record<string, number>
): MatchPairingCandidate {
  const [p0, p1, p2, p3] = fourPlayers;

  const buildCandidateTeam = (a: Player, b: Player): CandidateTeam => {
    const key = getPairKey(a.id, b.id);
    const historyCount = pairHistory[key] ?? 0;
    const sessionCount = sessionPartnerCounts.get(key) ?? 0;
    const aLevelCount = (a.level === 'A' ? 1 : 0) + (b.level === 'A' ? 1 : 0);
    return {
      players: [a, b],
      teamIds: [a.id, b.id],
      key,
      historyCount,
      sessionCount,
      isMixedLevel: a.level !== b.level,
      aLevelCount,
    };
  };

  const rawPartitions: Array<[CandidateTeam, CandidateTeam]> = [
    [buildCandidateTeam(p0, p1), buildCandidateTeam(p2, p3)],
    [buildCandidateTeam(p0, p2), buildCandidateTeam(p1, p3)],
    [buildCandidateTeam(p0, p3), buildCandidateTeam(p1, p2)],
  ];

  // Sort candidate partitions by combined persistent pairHistory ascending first
  rawPartitions.sort((partA, partB) => {
    const histA = partA[0].historyCount + partA[1].historyCount;
    const histB = partB[0].historyCount + partB[1].historyCount;
    return histA - histB;
  });

  let bestCandidate: MatchPairingCandidate | null = null;

  for (const [teamA, teamB] of rawPartitions) {
    // 1. Level Balancing Penalty
    const levelDiff = Math.abs(teamA.aLevelCount - teamB.aLevelCount);
    let levelBalancePenalty = 0;

    if (levelDiff === 2) {
      // Strictly penalize Level A + Level A vs Level B + Level B blowouts
      levelBalancePenalty += 1_000_000;
    } else if (levelDiff === 1) {
      // Moderate penalty for 1-level imbalance (encourages 2-court splits to balance A/B across courts)
      levelBalancePenalty += 8_000;
    }

    // Bonus preference for forming mixed (A + B) teams
    if (!teamA.isMixedLevel) levelBalancePenalty += 1_500;
    if (!teamB.isMixedLevel) levelBalancePenalty += 1_500;

    // 2. Current-Session Partner Repeat Penalty
    const sessionPenalty =
      (teamA.sessionCount * teamA.sessionCount + teamA.sessionCount) * 50_000 +
      (teamB.sessionCount * teamB.sessionCount + teamB.sessionCount) * 50_000;

    // 3. Persistent Cross-Tournament pairHistory Penalty (prioritizes 0 or 1 past games)
    const historyPenalty =
      (teamA.historyCount * teamA.historyCount + teamA.historyCount) * 2_000 +
      (teamB.historyCount * teamB.historyCount + teamB.historyCount) * 2_000;

    // 4. Opponent Repeat Penalty
    let opponentPenalty = 0;
    for (const playerA of teamA.players) {
      for (const playerB of teamB.players) {
        const oppCount = opponentCounts.get(getPairKey(playerA.id, playerB.id)) ?? 0;
        opponentPenalty += (oppCount * oppCount + oppCount) * 100;
      }
    }

    const totalCost =
      levelBalancePenalty + sessionPenalty + historyPenalty + opponentPenalty;

    if (!bestCandidate || totalCost < bestCandidate.cost) {
      bestCandidate = {
        teamA: teamA.teamIds,
        teamB: teamB.teamIds,
        cost: totalCost,
      };
    }
  }

  return bestCandidate!;
}

/**
 * Given 4 or 8 active players for a round, finds the globally optimal
 * match pairings across 1 or 2 courts.
 *
 * For 2 courts (8 players), there are (8 choose 4) / 2 = 35 ways to split
 * players across courts, and 3 pairings per court (35 * 6 = 210 evaluations),
 * allowing an exact exhaustive search in <0.1ms.
 */
function findOptimalCourtMatches(
  playingPlayers: Player[],
  effectiveCourts: number,
  sessionPartnerCounts: Map<string, number>,
  opponentCounts: Map<string, number>,
  pairHistory: Record<string, number>
): { matches: Array<{ teamA: Team; teamB: Team }>; totalCost: number } {
  if (effectiveCourts === 1) {
    const best = findBestSingleCourtMatch(
      [playingPlayers[0], playingPlayers[1], playingPlayers[2], playingPlayers[3]],
      sessionPartnerCounts,
      opponentCounts,
      pairHistory
    );
    return {
      matches: [{ teamA: best.teamA, teamB: best.teamB }],
      totalCost: best.cost,
    };
  }

  // 2 Courts (8 players): fix index 0 in Court 1 to avoid symmetric duplicate court splits
  let bestSplit: {
    matches: Array<{ teamA: Team; teamB: Team }>;
    totalCost: number;
  } | null = null;

  const n = 8;
  for (let i = 1; i < n - 2; i++) {
    for (let j = i + 1; j < n - 1; j++) {
      for (let k = j + 1; k < n; k++) {
        const court1Players: [Player, Player, Player, Player] = [
          playingPlayers[0],
          playingPlayers[i],
          playingPlayers[j],
          playingPlayers[k],
        ];

        const court2Players: Player[] = [];
        for (let idx = 1; idx < n; idx++) {
          if (idx !== i && idx !== j && idx !== k) {
            court2Players.push(playingPlayers[idx]);
          }
        }

        const bestCourt1 = findBestSingleCourtMatch(
          court1Players,
          sessionPartnerCounts,
          opponentCounts,
          pairHistory
        );
        const bestCourt2 = findBestSingleCourtMatch(
          [court2Players[0], court2Players[1], court2Players[2], court2Players[3]],
          sessionPartnerCounts,
          opponentCounts,
          pairHistory
        );

        const combinedCost = bestCourt1.cost + bestCourt2.cost;

        if (!bestSplit || combinedCost < bestSplit.totalCost) {
          bestSplit = {
            matches: [
              { teamA: bestCourt1.teamA, teamB: bestCourt1.teamB },
              { teamA: bestCourt2.teamA, teamB: bestCourt2.teamB },
            ],
            totalCost: combinedCost,
          };
        }
      }
    }
  }

  return bestSplit!;
}

/**
 * Generates helper combinations of size `k` from `items`, capped at `maxCombinations`
 * to guarantee fast execution.
 */
function getCombinations<T>(items: T[], k: number, maxCombinations = 35): T[][] {
  if (k === 0) return [[]];
  if (k === items.length) return [[...items]];

  const results: T[][] = [];

  function backtrack(start: number, current: T[]) {
    if (results.length >= maxCombinations) return;
    if (current.length === k) {
      results.push([...current]);
      return;
    }
    for (let i = start; i <= items.length - (k - current.length); i++) {
      current.push(items[i]);
      backtrack(i + 1, current);
      current.pop();
      if (results.length >= maxCombinations) return;
    }
  }

  backtrack(0, []);
  return results;
}

/**
 * Generates an array of `Round` objects for a Padel Americano tournament.
 *
 * - 1 Court holds 4 players (1 match); 2 Courts hold 8 players (2 matches).
 * - Excess players are placed in `restingPlayers` and rotated evenly so every
 *   player rests an equal amount of time across the tournament.
 * - Pairings enforce Level Balancing (preferring Level A + Level B mixed teams
 *   and preventing AA vs BB blowouts) and History Prioritization (using
 *   `pairHistory` to prioritize teammates who have played together the least).
 */
export function generateRounds(
  activePlayers: Player[],
  totalCourts: number,
  targetRounds: number,
  pairHistory: Record<string, number> = {}
): Round[] {
  if (activePlayers.length < 4 || targetRounds <= 0 || totalCourts <= 0) {
    return [];
  }

  const effectiveCourts = Math.min(
    totalCourts === 2 ? 2 : 1,
    Math.floor(activePlayers.length / 4)
  );

  if (effectiveCourts === 0) {
    return [];
  }

  const courtCapacity = effectiveCourts * 4;
  const restingCount = activePlayers.length - courtCapacity;

  const restCounts = new Map<string, number>();
  const lastRestedRound = new Map<string, number>();
  const initialIndexMap = new Map<string, number>();

  activePlayers.forEach((player, idx) => {
    restCounts.set(player.id, 0);
    lastRestedRound.set(player.id, -Infinity);
    initialIndexMap.set(player.id, idx);
  });

  const sessionPartnerCounts = new Map<string, number>();
  const opponentCounts = new Map<string, number>();
  const rounds: Round[] = [];

  for (let roundIdx = 0; roundIdx < targetRounds; roundIdx++) {
    let selectedRestingIds: string[] = [];
    let bestMatchesForRound: Array<{ teamA: Team; teamB: Team }> = [];

    if (restingCount === 0) {
      const optimal = findOptimalCourtMatches(
        activePlayers,
        effectiveCourts,
        sessionPartnerCounts,
        opponentCounts,
        pairHistory
      );
      bestMatchesForRound = optimal.matches;
    } else {
      // Sort players by fewest rests so far, then least recently rested, then rotated index
      const sortedForRest = [...activePlayers].sort((a, b) => {
        const countA = restCounts.get(a.id) ?? 0;
        const countB = restCounts.get(b.id) ?? 0;
        if (countA !== countB) return countA - countB;

        const lastA = lastRestedRound.get(a.id) ?? -Infinity;
        const lastB = lastRestedRound.get(b.id) ?? -Infinity;
        if (lastA !== lastB) return lastA - lastB;

        const idxA = ((initialIndexMap.get(a.id) ?? 0) + roundIdx) % activePlayers.length;
        const idxB = ((initialIndexMap.get(b.id) ?? 0) + roundIdx) % activePlayers.length;
        return idxA - idxB;
      });

      // Strictly lock in players whose restCount is strictly less than the boundary player's restCount
      const boundaryRestCount = restCounts.get(sortedForRest[restingCount - 1].id) ?? 0;

      const mandatoryRestPlayers = sortedForRest.filter(
        (p) => (restCounts.get(p.id) ?? 0) < boundaryRestCount
      );

      // Candidates tied at `boundaryRestCount`, preferring those who did not rest immediately prior
      const tiedCandidates = sortedForRest.filter(
        (p) => (restCounts.get(p.id) ?? 0) === boundaryRestCount
      );

      const nonConsecutiveTied = tiedCandidates.filter(
        (p) => (lastRestedRound.get(p.id) ?? -Infinity) < roundIdx - 1
      );

      const remainingSlots = restingCount - mandatoryRestPlayers.length;
      const poolForTieBreak =
        nonConsecutiveTied.length >= remainingSlots
          ? nonConsecutiveTied
          : tiedCandidates;

      // Explore combinations among tied rest candidates to also maximize level balance & pairing novelty
      const candidateRestSubsets = getCombinations(poolForTieBreak, remainingSlots, 25);

      let bestOverallCost = Infinity;

      for (const subset of candidateRestSubsets) {
        const restingSet = new Set<string>([
          ...mandatoryRestPlayers.map((p) => p.id),
          ...subset.map((p) => p.id),
        ]);

        const playingPlayers = activePlayers.filter((p) => !restingSet.has(p.id));
        const candidateMatches = findOptimalCourtMatches(
          playingPlayers,
          effectiveCourts,
          sessionPartnerCounts,
          opponentCounts,
          pairHistory
        );

        if (candidateMatches.totalCost < bestOverallCost) {
          bestOverallCost = candidateMatches.totalCost;
          selectedRestingIds = Array.from(restingSet);
          bestMatchesForRound = candidateMatches.matches;
        }
      }
    }

    // Update rest tracking for this round
    for (const restingId of selectedRestingIds) {
      restCounts.set(restingId, (restCounts.get(restingId) ?? 0) + 1);
      lastRestedRound.set(restingId, roundIdx);
    }

    // Build Match objects and update in-session partner/opponent history
    const roundMatches: Match[] = bestMatchesForRound.map((m, idx) => {
      const [a1, a2] = m.teamA;
      const [b1, b2] = m.teamB;

      const keyA = getPairKey(a1, a2);
      const keyB = getPairKey(b1, b2);
      sessionPartnerCounts.set(keyA, (sessionPartnerCounts.get(keyA) ?? 0) + 1);
      sessionPartnerCounts.set(keyB, (sessionPartnerCounts.get(keyB) ?? 0) + 1);

      for (const pA of m.teamA) {
        for (const pB of m.teamB) {
          const oppKey = getPairKey(pA, pB);
          opponentCounts.set(oppKey, (opponentCounts.get(oppKey) ?? 0) + 1);
        }
      }

      return {
        id: crypto.randomUUID(),
        teamA: m.teamA,
        teamB: m.teamB,
        scoreA: 0,
        scoreB: 0,
        isCompleted: false,
        courtNumber: idx + 1,
      };
    });

    rounds.push({
      id: crypto.randomUUID(),
      roundNumber: roundIdx + 1,
      matches: roundMatches,
      restingPlayers: selectedRestingIds,
    });
  }

  return rounds;
}

/**
 * Calculates the live or final leaderboard standings for a tournament.
 *
 * - Strictly calculates W/D/L (`wins`, `draws`, `losses`) for each player from
 *   completed match scores.
 * - Implements the **Virtual Draw Rule** for missed matches:
 *   - Finds `maxMatchesPlayed` across all players in the tournament.
 *   - Any player with fewer than `maxMatchesPlayed` receives
 *     `tournament.targetPoints / 2` virtual points for each missed match,
 *     stored in `virtualPointsAdded`.
 *   - Virtual points are added to `totalPoints` without inflating `matchesPlayed`.
 * - Sorted by `totalPoints` descending, then `pointDifference` descending.
 */
export function calculateStandings(tournament: Tournament): PlayerStanding[] {
  const statsMap = new Map<
    string,
    {
      rawPoints: number;
      matchesPlayed: number;
      wins: number;
      draws: number;
      losses: number;
      pointDifference: number;
    }
  >();

  for (const player of tournament.activePlayers) {
    statsMap.set(player.id, {
      rawPoints: 0,
      matchesPlayed: 0,
      wins: 0,
      draws: 0,
      losses: 0,
      pointDifference: 0,
    });
  }

  // Accumulate W/D/L and points from all completed matches across all rounds
  for (const round of tournament.rounds) {
    for (const match of round.matches) {
      if (!match.isCompleted) continue;

      const diffA = match.scoreA - match.scoreB;
      const diffB = match.scoreB - match.scoreA;

      const isTeamAWin = match.scoreA > match.scoreB;
      const isTeamBWin = match.scoreB > match.scoreA;
      const isDraw = match.scoreA === match.scoreB;

      for (const playerId of match.teamA) {
        const entry = statsMap.get(playerId);
        if (entry) {
          entry.rawPoints += match.scoreA;
          entry.matchesPlayed += 1;
          entry.pointDifference += diffA;
          if (isTeamAWin) entry.wins += 1;
          else if (isDraw) entry.draws += 1;
          else entry.losses += 1;
        }
      }

      for (const playerId of match.teamB) {
        const entry = statsMap.get(playerId);
        if (entry) {
          entry.rawPoints += match.scoreB;
          entry.matchesPlayed += 1;
          entry.pointDifference += diffB;
          if (isTeamBWin) entry.wins += 1;
          else if (isDraw) entry.draws += 1;
          else entry.losses += 1;
        }
      }
    }
  }

  // Determine the highest number of completed matches played by any single participant
  let maxMatchesPlayed = 0;
  for (const entry of statsMap.values()) {
    if (entry.matchesPlayed > maxMatchesPlayed) {
      maxMatchesPlayed = entry.matchesPlayed;
    }
  }

  const virtualDrawValue = tournament.targetPoints / 2;

  const standings: PlayerStanding[] = tournament.activePlayers.map((player) => {
    const entry = statsMap.get(player.id) ?? {
      rawPoints: 0,
      matchesPlayed: 0,
      wins: 0,
      draws: 0,
      losses: 0,
      pointDifference: 0,
    };

    const missedMatches = Math.max(0, maxMatchesPlayed - entry.matchesPlayed);
    const virtualPointsAdded = missedMatches * virtualDrawValue;
    const totalPoints = entry.rawPoints + virtualPointsAdded;
    const averagePoints =
      entry.matchesPlayed > 0
        ? Number((entry.rawPoints / entry.matchesPlayed).toFixed(2))
        : 0;

    return {
      ...player,
      totalPoints,
      rawPoints: entry.rawPoints,
      virtualPointsAdded,
      virtualPoints: virtualPointsAdded,
      missedMatches,
      matchesPlayed: entry.matchesPlayed,
      wins: entry.wins,
      draws: entry.draws,
      losses: entry.losses,
      pointDiff: entry.pointDifference,
      pointDifference: entry.pointDifference,
      averagePoints,
    };
  });

  // Sort by totalPoints DESC, then pointDifference DESC, then averagePoints DESC
  standings.sort((a, b) => {
    if (b.totalPoints !== a.totalPoints) {
      return b.totalPoints - a.totalPoints;
    }
    if (b.pointDifference !== a.pointDifference) {
      return b.pointDifference - a.pointDifference;
    }
    if (b.averagePoints !== a.averagePoints) {
      return b.averagePoints - a.averagePoints;
    }
    return a.name.localeCompare(b.name);
  });

  return standings;
}
