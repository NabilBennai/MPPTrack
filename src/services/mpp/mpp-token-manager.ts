// Gestionnaire de tokens MPP.
// Lit le refresh token depuis .env, rafraîchit l'access token automatiquement,
// persiste les nouveaux tokens dans .mpp_tokens.json (jamais dans le code).

import { readFileSync, writeFileSync, existsSync } from "fs";
import { resolve } from "path";

const TOKEN_FILE = resolve(".mpp_tokens.json");
const AUTH_URL   = "https://connect.ligue1.fr/oauth/token";
const CLIENT_ID  = "grX5jWGWWQ4Uq91oe7KPNDZ96FS3jr0X";

interface StoredTokens {
  accessToken:  string;
  refreshToken: string;
  expiresAt:    number; // timestamp ms
}

// ---------------------------------------------------------------------------
// Persistence locale (.mpp_tokens.json — ignoré par git)
// ---------------------------------------------------------------------------
function loadStoredTokens(): StoredTokens | null {
  if (!existsSync(TOKEN_FILE)) return null;
  try {
    return JSON.parse(readFileSync(TOKEN_FILE, "utf8")) as StoredTokens;
  } catch {
    return null;
  }
}

function saveTokens(tokens: StoredTokens): void {
  try {
    writeFileSync(TOKEN_FILE, JSON.stringify(tokens, null, 2), "utf8");
  } catch {
    // Pas bloquant — les tokens restent en mémoire
  }
}

// ---------------------------------------------------------------------------
// Cache mémoire (évite les lectures fichier à chaque requête)
// ---------------------------------------------------------------------------
let memoryTokens: StoredTokens | null = null;

// ---------------------------------------------------------------------------
// Rafraîchissement via Auth0
// ---------------------------------------------------------------------------
async function refreshAccessToken(refreshToken: string): Promise<StoredTokens> {
  const res = await fetch(AUTH_URL, {
    method:  "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({
      grant_type:    "refresh_token",
      client_id:     CLIENT_ID,
      refresh_token: refreshToken,
    }),
  });

  if (!res.ok) {
    const body = await res.text().catch(() => "");
    throw new Error(`Auth0 refresh failed: HTTP ${res.status} — ${body.slice(0, 200)}`);
  }

  const data = await res.json() as {
    access_token:  string;
    expires_in:    number;
    refresh_token?: string;
  };

  const tokens: StoredTokens = {
    accessToken:  data.access_token,
    refreshToken: data.refresh_token ?? refreshToken, // rotation : nouveau token si fourni
    expiresAt:    Date.now() + (data.expires_in - 60) * 1000, // marge 60s
  };

  console.log("[MPP] Access token rafraîchi (expire dans ~%ds)", data.expires_in);
  return tokens;
}

// ---------------------------------------------------------------------------
// Point d'entrée : retourne un access token valide
// ---------------------------------------------------------------------------
export async function getValidAccessToken(): Promise<string | null> {
  const now = Date.now();

  // 1. Token en mémoire encore valide
  if (memoryTokens && now < memoryTokens.expiresAt) {
    return memoryTokens.accessToken;
  }

  // 2. Token access direct depuis .env (sans refresh — mode simple)
  const envAccessToken  = process.env["MPP_ACCESS_TOKEN"]?.trim();
  const envRefreshToken = process.env["MPP_REFRESH_TOKEN"]?.trim();

  // 3. Tokens persistés sur disque (issus d'un refresh précédent)
  const stored = loadStoredTokens();
  if (stored && now < stored.expiresAt) {
    memoryTokens = stored;
    return stored.accessToken;
  }

  // 4. Refresh via le refresh token (priorité : fichier > .env)
  const refreshToken = stored?.refreshToken ?? envRefreshToken;
  if (refreshToken) {
    try {
      const fresh = await refreshAccessToken(refreshToken);
      memoryTokens = fresh;
      saveTokens(fresh);
      return fresh.accessToken;
    } catch (err) {
      console.error("[MPP] Échec du refresh token:", err instanceof Error ? err.message : err);
      // Fallback sur l'access token .env s'il existe encore
    }
  }

  // 5. Fallback : access token brut du .env (peut être expiré)
  if (envAccessToken) {
    return envAccessToken;
  }

  return null;
}

export function hasAnyToken(): boolean {
  return Boolean(
    memoryTokens?.accessToken ||
    process.env["MPP_ACCESS_TOKEN"]?.trim() ||
    process.env["MPP_REFRESH_TOKEN"]?.trim() ||
    loadStoredTokens()?.refreshToken
  );
}
