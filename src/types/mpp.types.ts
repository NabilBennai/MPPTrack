export type DepartmentCode = "MT" | "ES" | "TD" | "UNKNOWN";
export type DepartmentName = "MyTower" | "e-SCM" | "TDi" | "Inconnu";

// ---------------------------------------------------------------------------
// Formats bruts de l'API MPP (champs exacts inconnus sans token)
// ---------------------------------------------------------------------------
export interface MppRawPlayer {
  id?: string;
  username?: string;
  pseudo?: string;
  rank?: number;
  points?: number;
  exactScores?: number;
  goodResults?: number;
  playedPredictions?: number;
  [key: string]: unknown;
}

// Réponse brute de GET /user — shape inconnue, conservée flexible pour le debug
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
}

export interface DepartmentStats {
  departmentCode: DepartmentCode;
  departmentName: DepartmentName;
  playerCount: number;
  totalPoints: number;
  averagePoints: number;
  bestPlayer?: MppPlayer;
}
