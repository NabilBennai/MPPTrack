import type { DepartmentCode, DepartmentName } from "../types/mpp.types.js";

interface DepartmentInfo {
  code: DepartmentCode;
  name: DepartmentName;
}

const DEPARTMENT_MAP: Record<string, DepartmentInfo> = {
  MT: { code: "MT", name: "MyTower" },
  ES: { code: "ES", name: "e-SCM" },
  TD: { code: "TD", name: "TDi" },
};

const UNKNOWN: DepartmentInfo = { code: "UNKNOWN", name: "Inconnu" };

export function getDepartmentFromPseudo(pseudo: string): DepartmentInfo {
  const prefix = pseudo.trim().slice(0, 2).toUpperCase();
  return DEPARTMENT_MAP[prefix] ?? UNKNOWN;
}
