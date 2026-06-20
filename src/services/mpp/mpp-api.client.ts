// Client HTTP centralisé pour l'API Mon Petit Prono.
// Toute la logique réseau passe ici — le token ne sort jamais de ce fichier.

function getMppHeaders(): Record<string, string> {
  const token = process.env["MPP_ACCESS_TOKEN"];

  const headers: Record<string, string> = {
    "Accept":          "application/json",
    "platform":        process.env["MPP_PLATFORM"]        ?? "web",
    "client-version":  process.env["MPP_CLIENT_VERSION"]  ?? "11.12.0",
    "client-language": process.env["MPP_CLIENT_LANGUAGE"] ?? "fr-FR",
    "application":     process.env["MPP_APPLICATION"]     ?? "mppLfp",
    "app-context":     process.env["MPP_APP_CONTEXT"]     ?? "internationalEvent",
  };

  if (token) {
    headers["Authorization"] = `Bearer ${token}`;
  }

  return headers;
}

function getBaseUrl(): string {
  return process.env["MPP_API_BASE_URL"] ?? "https://api.mpp.football";
}

export function hasToken(): boolean {
  return Boolean(process.env["MPP_ACCESS_TOKEN"]);
}

/**
 * Effectue une requête GET authentifiée sur l'API MPP.
 * Log : méthode + chemin + status HTTP uniquement. Jamais le token.
 */
export async function requestMpp<T>(path: string): Promise<T> {
  const url = `${getBaseUrl()}${path}`;

  let status = 0;
  try {
    const response = await fetch(url, {
      method: "GET",
      headers: getMppHeaders(),
    });

    status = response.status;
    console.log(`[MPP] GET ${path} → ${status}`);

    if (!response.ok) {
      const body = await response.text().catch(() => "");
      throw new MppApiError(`HTTP ${status}`, status, path, body);
    }

    return response.json() as Promise<T>;
  } catch (err) {
    if (err instanceof MppApiError) throw err;
    const detail = err instanceof Error ? `${err.name}: ${err.message}` : String(err);
    console.error(`[MPP] GET ${path} → réseau KO — ${detail}`);
    throw new MppApiError("Erreur réseau", 0, path, detail);
  }
}

/**
 * Sonde un chemin sans lever d'exception.
 * Retourne null si l'endpoint n'existe pas ou est inaccessible.
 */
export async function probeMpp<T>(path: string): Promise<T | null> {
  try {
    return await requestMpp<T>(path);
  } catch {
    return null;
  }
}

export class MppApiError extends Error {
  constructor(
    message: string,
    public readonly status: number,
    public readonly path: string,
    public readonly detail: string,
  ) {
    super(message);
    this.name = "MppApiError";
  }
}
