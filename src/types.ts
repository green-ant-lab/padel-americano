export type PlayerLevel = 'A' | 'B';

export interface Player {
  id: string;
  name: string;
  level: PlayerLevel;
  totalPoints: number;
  matchesPlayed: number;
  pointDiff: number;
}

/**
 * Tuple of two Player IDs representing a doubles pair.
 */
export type Team = [Player['id'], Player['id']];

export interface Match {
  id: string;
  teamA: Team;
  teamB: Team;
  scoreA: number;
  scoreB: number;
  isCompleted: boolean;
  courtNumber: number;
}

export interface Round {
  id: string;
  roundNumber: number;
  matches: Match[];
  restingPlayers: Player['id'][];
}

export type TotalCourts = 1 | 2;
export type TargetPoints = 21 | 24 | 32 | number;

export interface Tournament {
  id: string;
  activePlayers: Player[];
  totalCourts: TotalCourts;
  targetPoints: TargetPoints;
  rounds: Round[];
  currentRoundIndex: number;
  isFinished: boolean;
}

export interface PlayerStanding extends Player {
  /** Total points including Virtual Draw compensation for missed matches */
  totalPoints: number;
  /** Actual points scored on court (excluding Virtual Draw points) */
  rawPoints: number;
  /** Exact amount of Virtual Draw points added for missed/resting matches */
  virtualPointsAdded: number;
  /** Alias for virtualPointsAdded for backwards compatibility */
  virtualPoints: number;
  /** Number of missed matches relative to maxMatchesPlayed */
  missedMatches: number;
  /** Actual completed matches played on court */
  matchesPlayed: number;
  /** Completed matches won (team score > opponent score) */
  wins: number;
  /** Completed matches drawn (team score === opponent score) */
  draws: number;
  /** Completed matches lost (team score < opponent score) */
  losses: number;
  /** Net point differential (+/-) across completed matches */
  pointDifference: number;
  /** Average points scored per completed match played */
  averagePoints: number;
}

export interface TournamentHistoryItem {
  id: string;
  date: string;
  configuration: string;
  finalStandings: PlayerStanding[];
}
