export type DepartmentCode = "MT" | "ES" | "TD" | "WD" | "UNKNOWN";
export type DepartmentName = "MyTower" | "e-SCM" | "TDi" | "Winddle" | "Inconnu";

// ---------------------------------------------------------------------------
// Réponse brute GET /user-contests
// ---------------------------------------------------------------------------
export interface MppContestCard {
  contestId: string;
  shortContestId?: string;
  title: string;
  championshipId: number;
  season: number;
  adminId?: string;
  imageUrl?: string;
  userRanking: number;
  userTotalPoints: number;
  totalUsers: number;
  isLive?: boolean;
  firstGameWeekNumber?: number;
  lastGameWeekNumber?: number;
  actualGameWeekNumber?: number;
  totalGameWeekNumber?: number;
  isPinned?: boolean;
  isSupervised?: boolean;
  [key: string]: unknown;
}

export interface MppUserContestsResponse {
  contestsCards: MppContestCard[];
  pinnedChallengesCards: MppContestCard[];
  pendingContestsInvitationsCards: unknown[];
  hasNewContestMessages: boolean;
}

// ---------------------------------------------------------------------------
// Réponse brute GET /challenge-standings/top-users-standings
// (shape exacte inconnue — on supporte les variantes courantes)
// ---------------------------------------------------------------------------
export interface MppRawStandingEntry {
  userId?: string;
  id?: string;
  username?: string;
  pseudo?: string;
  firstName?: string;
  rank?: number;
  ranking?: number;
  points?: number;
  totalPoints?: number;
  exactScores?: number;
  exactResults?: number;
  goodResults?: number;
  correctResults?: number;
  playedPredictions?: number;
  totalForecasts?: number;
  avatarUrl?: string;
  level?: number;
  [key: string]: unknown;
}

// Réponse brute de /user — kept flexible for debug display
export type MppRawUser = Record<string, unknown>;

// ---------------------------------------------------------------------------
// Modèle interne normalisé
// ---------------------------------------------------------------------------
export interface MppPlayer {
  id: string;
  pseudo: string;
  rank: number;
  points: number;
  departmentCode: DepartmentCode;
  departmentName: DepartmentName;
  exactScores?: number;
  goodResults?: number;
  playedPredictions?: number;
  avatarUrl?: string;
}

export interface DepartmentStats {
  departmentCode: DepartmentCode;
  departmentName: DepartmentName;
  playerCount: number;
  totalPoints: number;
  averagePoints: number;
  bestPlayer?: MppPlayer;
}
