import type {
  DepartmentCode,
  DepartmentStats,
  MppPlayer,
  MppRawUser,
} from "../../types/mpp.types.js";
import type { ProbeResult } from "../../services/mpp/mpp.service.js";

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------
function esc(str: string): string {
  return str
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;");
}

function fmt(value: number | undefined): string {
  return value !== undefined ? String(value) : "—";
}

function deptBadge(code: DepartmentCode): string {
  switch (code) {
    case "MT": return "bg-blue-900 text-blue-300 border border-blue-700";
    case "ES": return "bg-purple-900 text-purple-300 border border-purple-700";
    case "TD": return "bg-emerald-900 text-emerald-300 border border-emerald-700";
    default:   return "bg-slate-700 text-slate-400 border border-slate-600";
  }
}

// ---------------------------------------------------------------------------
// Classement
// ---------------------------------------------------------------------------
export function renderClassement(
  players: MppPlayer[],
  updatedAt: string,
  usingMock: boolean,
): string {
  const count = players.length;

  const mockBanner = usingMock
    ? `<div class="px-4 py-2 text-xs text-amber-400 bg-amber-950/50 border-b border-amber-800/50 flex items-center gap-2">
         <span>⚠</span>
         <span>Mode démo — configurez <code class="font-mono">MPP_ACCESS_TOKEN</code> dans <code class="font-mono">.env</code> pour les données réelles.</span>
       </div>`
    : "";

  if (count === 0) {
    return `
      ${mockBanner}
      <div class="px-4 py-2 text-xs text-slate-500 border-b border-slate-700/60">${esc(updatedAt)}</div>
      <p class="text-slate-400 text-center py-12">Aucun joueur pour ce filtre.</p>
    `;
  }

  const rows = players.map((p) => `
    <tr class="border-b border-slate-700/60 hover:bg-slate-800/50 transition-colors">
      <td class="px-4 py-3 font-bold ${p.rank <= 3 ? "text-yellow-400" : "text-slate-300"}">${p.rank}</td>
      <td class="px-4 py-3 font-semibold">${esc(p.pseudo)}</td>
      <td class="px-4 py-3">
        <span class="${deptBadge(p.departmentCode)} text-xs font-medium px-2 py-0.5 rounded-full">
          ${esc(p.departmentName)}
        </span>
      </td>
      <td class="px-4 py-3 text-right font-bold text-blue-400">${p.points}</td>
      <td class="px-4 py-3 text-right text-green-400">${fmt(p.exactScores)}</td>
      <td class="px-4 py-3 text-right text-slate-300">${fmt(p.goodResults)}</td>
      <td class="px-4 py-3 text-right text-slate-400">${fmt(p.playedPredictions)}</td>
      <td class="px-4 py-3 text-center">
        <button
          class="text-xs bg-slate-700 hover:bg-blue-700 border border-slate-600 hover:border-blue-500 px-3 py-1 rounded-md transition-colors"
          hx-get="/mpp/player/${esc(p.id)}"
          hx-target="#player-detail"
          hx-swap="innerHTML"
        >Voir</button>
      </td>
    </tr>
  `).join("");

  return `
    ${mockBanner}
    <div class="px-4 py-2 text-xs text-slate-500 border-b border-slate-700/60">
      Mis à jour le ${esc(updatedAt)} · ${count} joueur${count > 1 ? "s" : ""}
    </div>
    <div class="overflow-x-auto">
      <table class="w-full text-sm text-left">
        <thead class="text-xs uppercase text-slate-400 bg-slate-800/60 border-b border-slate-700">
          <tr>
            <th class="px-4 py-3 w-16">Rang</th>
            <th class="px-4 py-3">Pseudo</th>
            <th class="px-4 py-3">Département</th>
            <th class="px-4 py-3 text-right">Points</th>
            <th class="px-4 py-3 text-right">Exacts</th>
            <th class="px-4 py-3 text-right">Bons résultats</th>
            <th class="px-4 py-3 text-right">Pronostics</th>
            <th class="px-4 py-3 text-center w-20">Détail</th>
          </tr>
        </thead>
        <tbody>${rows}</tbody>
      </table>
    </div>
  `;
}

// ---------------------------------------------------------------------------
// Statistiques par département
// ---------------------------------------------------------------------------
export function renderStats(stats: DepartmentStats[]): string {
  if (stats.length === 0) {
    return `<p class="text-slate-400 text-center py-4">Aucune statistique disponible.</p>`;
  }

  const cards = stats.map((s) => `
    <div class="rounded-lg border border-slate-700 bg-slate-900 p-5 flex flex-col gap-3">
      <span class="${deptBadge(s.departmentCode)} text-xs font-semibold px-2.5 py-1 rounded-full self-start">
        ${esc(s.departmentName)}
      </span>
      <dl class="grid grid-cols-2 gap-y-2 text-sm">
        <dt class="text-slate-400">Joueurs</dt>
        <dd class="font-semibold text-right">${s.playerCount}</dd>
        <dt class="text-slate-400">Total points</dt>
        <dd class="font-bold text-right text-blue-400">${s.totalPoints}</dd>
        <dt class="text-slate-400">Moyenne</dt>
        <dd class="font-semibold text-right">${s.averagePoints}</dd>
        ${s.bestPlayer ? `
        <dt class="text-slate-400">Meilleur</dt>
        <dd class="font-semibold text-right text-yellow-400 truncate" title="${esc(s.bestPlayer.pseudo)}">${esc(s.bestPlayer.pseudo)}</dd>` : ""}
      </dl>
    </div>
  `).join("");

  return `<div class="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-4">${cards}</div>`;
}

// ---------------------------------------------------------------------------
// Détail joueur
// ---------------------------------------------------------------------------
export function renderPlayerDetail(player: MppPlayer): string {
  const rankLabel =
    player.rank === 1 ? "🥇" :
    player.rank === 2 ? "🥈" :
    player.rank === 3 ? "🥉" : `#${player.rank}`;

  return `
    <div class="rounded-lg border border-slate-600 bg-slate-900 p-6">
      <div class="flex items-start justify-between mb-5">
        <div class="flex flex-col gap-2">
          <h3 class="text-xl font-bold">${esc(player.pseudo)}</h3>
          <span class="${deptBadge(player.departmentCode)} text-xs font-semibold px-2.5 py-1 rounded-full self-start">
            ${esc(player.departmentName)}
          </span>
        </div>
        <div class="text-3xl font-extrabold text-yellow-400">${rankLabel}</div>
      </div>
      <div class="grid grid-cols-2 sm:grid-cols-4 gap-3 text-sm">
        <div class="bg-slate-800 rounded-lg p-3 text-center">
          <div class="text-2xl font-bold text-blue-400">${player.points}</div>
          <div class="text-slate-400 text-xs mt-1">Points</div>
        </div>
        <div class="bg-slate-800 rounded-lg p-3 text-center">
          <div class="text-2xl font-bold text-green-400">${fmt(player.exactScores)}</div>
          <div class="text-slate-400 text-xs mt-1">Scores exacts</div>
        </div>
        <div class="bg-slate-800 rounded-lg p-3 text-center">
          <div class="text-2xl font-bold text-slate-300">${fmt(player.goodResults)}</div>
          <div class="text-slate-400 text-xs mt-1">Bons résultats</div>
        </div>
        <div class="bg-slate-800 rounded-lg p-3 text-center">
          <div class="text-2xl font-bold text-slate-400">${fmt(player.playedPredictions)}</div>
          <div class="text-slate-400 text-xs mt-1">Pronostics joués</div>
        </div>
      </div>
    </div>
  `;
}

// ---------------------------------------------------------------------------
// Erreur générique
// ---------------------------------------------------------------------------
export function renderError(message: string): string {
  return `
    <div class="p-8 text-center">
      <p class="text-red-400 font-semibold">${esc(message)}</p>
      <p class="text-slate-500 text-sm mt-1">Veuillez réessayer dans quelques instants.</p>
    </div>
  `;
}

// ---------------------------------------------------------------------------
// Debug : réponse brute de GET /user
// ---------------------------------------------------------------------------
export function renderDebugUser(user: MppRawUser | null, error: string | null): string {
  const content = error
    ? `<p class="text-red-400">${esc(error)}</p>`
    : `<pre class="text-xs text-green-300 overflow-x-auto whitespace-pre-wrap break-all">${esc(JSON.stringify(user, null, 2))}</pre>`;

  return `
    <div class="max-w-4xl mx-auto px-4 py-8 font-mono">
      <div class="flex items-center gap-3 mb-4">
        <a href="/mpp" class="text-slate-400 hover:text-white text-sm">← Classement</a>
        <h1 class="text-xl font-bold">Debug — GET /user</h1>
        ${!error ? `<a href="/mpp/debug/probe" class="ml-auto text-xs bg-blue-700 hover:bg-blue-600 px-3 py-1 rounded">→ Sonder les endpoints classement</a>` : ""}
      </div>
      ${error ? "" : `
      <div class="mb-4 p-3 rounded bg-slate-800 text-xs text-slate-400">
        Repérez les IDs de vos ligues/groupes dans la réponse ci-dessous, puis :<br/>
        1. Ajoutez <code class="text-yellow-300">MPP_LEAGUE_ID=VOTRE_ID</code> dans <code class="text-yellow-300">.env</code><br/>
        2. Visitez <code class="text-yellow-300">/mpp/debug/probe?leagueId=VOTRE_ID</code> pour tester les endpoints
      </div>`}
      <div class="rounded-lg border border-slate-700 bg-slate-950 p-4">
        ${content}
      </div>
    </div>
  `;
}

// ---------------------------------------------------------------------------
// Debug : résultats du probe d'endpoints
// ---------------------------------------------------------------------------
export function renderDebugProbe(leagueId: string, results: ProbeResult[]): string {
  const best = results.find((r) => r.status === "ok");

  const rows = results.map((r) => {
    const color = r.status === "ok" ? "text-green-400" : r.status === "empty" ? "text-yellow-400" : "text-red-400";
    const icon  = r.status === "ok" ? "✅" : r.status === "empty" ? "⚠" : "✗";
    return `
      <tr class="border-b border-slate-700/60">
        <td class="px-4 py-2 font-mono text-xs text-slate-300">${esc(r.path)}</td>
        <td class="px-4 py-2 ${color} text-xs">${icon} ${esc(r.hint ?? r.status)}</td>
        ${r.playerCount !== undefined ? `<td class="px-4 py-2 text-xs text-blue-400">${r.playerCount} joueurs</td>` : `<td class="px-4 py-2"></td>`}
      </tr>
    `;
  }).join("");

  return `
    <div class="max-w-4xl mx-auto px-4 py-8 font-mono">
      <div class="flex items-center gap-3 mb-4">
        <a href="/mpp/debug/user" class="text-slate-400 hover:text-white text-sm">← /user</a>
        <h1 class="text-xl font-bold">Debug — Probe endpoints (leagueId: ${esc(leagueId)})</h1>
      </div>

      ${best ? `
      <div class="mb-4 p-3 rounded bg-green-950 border border-green-800 text-sm text-green-300">
        ✅ Endpoint valide trouvé : <code class="font-mono">${esc(best.path)}</code><br/>
        Ajoutez dans <code>.env</code> : <code class="text-yellow-300">MPP_RANKING_PATH=${esc(best.path)}</code>
      </div>` : `
      <div class="mb-4 p-3 rounded bg-red-950 border border-red-800 text-sm text-red-300">
        Aucun endpoint valide trouvé pour ce league ID.<br/>
        Vérifiez l'ID dans <a href="/mpp/debug/user" class="underline">/mpp/debug/user</a> ou inspectez les requêtes réseau sur mpp.football.
      </div>`}

      <div class="rounded-lg border border-slate-700 bg-slate-950 overflow-hidden">
        <table class="w-full text-sm">
          <thead class="bg-slate-800 text-xs uppercase text-slate-400">
            <tr>
              <th class="px-4 py-2 text-left">Endpoint</th>
              <th class="px-4 py-2 text-left">Résultat</th>
              <th class="px-4 py-2 text-left">Joueurs</th>
            </tr>
          </thead>
          <tbody>${rows}</tbody>
        </table>
      </div>
    </div>
  `;
}
