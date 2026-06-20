import type {
  DepartmentCode,
  DepartmentStats,
  MppPlayer,
  MppRawUser,
} from "../../types/mpp.types.js";
import type { ProbeResult, ContestInfo } from "../../services/mpp/mpp.service.js";

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

function pct(num: number | undefined, den: number | undefined): string {
  if (num === undefined || den === undefined || den === 0) return "";
  return `${Math.round((num / den) * 100)}%`;
}

function deptBadge(code: DepartmentCode): string {
  switch (code) {
    case "MT": return "bg-blue-900/60 text-blue-300 border border-blue-700/60";
    case "ES": return "bg-purple-900/60 text-purple-300 border border-purple-700/60";
    case "TD": return "bg-emerald-900/60 text-emerald-300 border border-emerald-700/60";
    case "WD": return "bg-orange-900/60 text-orange-300 border border-orange-700/60";
    default:   return "bg-slate-700/60 text-slate-400 border border-slate-600/60";
  }
}

function deptRing(code: DepartmentCode): string {
  switch (code) {
    case "MT": return "ring-blue-600";
    case "ES": return "ring-purple-600";
    case "TD": return "ring-emerald-600";
    case "WD": return "ring-orange-600";
    default:   return "ring-slate-600";
  }
}

function deptAccent(code: DepartmentCode): string {
  switch (code) {
    case "MT": return "text-blue-400    border-blue-700    hover:bg-blue-950/40   bg-blue-950/20";
    case "ES": return "text-purple-400  border-purple-700  hover:bg-purple-950/40 bg-purple-950/20";
    case "TD": return "text-emerald-400 border-emerald-700 hover:bg-emerald-950/40 bg-emerald-950/20";
    case "WD": return "text-orange-400  border-orange-700  hover:bg-orange-950/40 bg-orange-950/20";
    default:   return "text-slate-400   border-slate-600   hover:bg-slate-800/40  bg-slate-800/20";
  }
}

function avatarImg(p: MppPlayer, size: string): string {
  const ring     = deptRing(p.departmentCode);
  const cls      = `${size} rounded-full object-cover ring-2 ${ring} bg-slate-800 shrink-0`;
  const initials = esc(p.pseudo.replace(/[^a-zA-Z]/g, "").slice(0, 2).toUpperCase() || "??");
  if (p.avatarUrl) {
    return `<img src="${esc(p.avatarUrl)}" alt="" class="${cls}" loading="lazy">`;
  }
  return `<div class="${cls} flex items-center justify-center text-xs font-bold text-slate-300">${initials}</div>`;
}

function rankDisplay(rank: number): string {
  if (rank === 1) return "🥇";
  if (rank === 2) return "🥈";
  if (rank === 3) return "🥉";
  return `<span class="font-semibold text-slate-400 tabular-nums">${rank}</span>`;
}

// ---------------------------------------------------------------------------
// Expand button (shared between initial render and OOB resets)
// ---------------------------------------------------------------------------
function expandBtn(playerId: string, open: boolean): string {
  const base = "w-7 h-7 rounded-lg border transition-colors flex items-center justify-center mx-auto";
  const cls  = open
    ? `${base} bg-blue-600 border-blue-500 text-white`
    : `${base} bg-slate-800 border-slate-700 text-slate-400 hover:bg-blue-600 hover:border-blue-500 hover:text-white`;
  const endpoint = open ? `/player/${playerId}/close` : `/player/${playerId}`;
  const icon     = open ? "▾" : "▸";
  return `<button
    id="btn-${playerId}"
    class="${cls}"
    hx-get="${endpoint}"
    hx-target="#detail-${playerId}"
    hx-swap="outerHTML"
    title="${open ? "Fermer" : "Voir le détail"}"
  >${icon}</button>`;
}

// ---------------------------------------------------------------------------
// Classement
// ---------------------------------------------------------------------------
export function renderClassement(
  players: MppPlayer[],
  updatedAt: string,
  usingMock: boolean,
  contestInfo?: ContestInfo | null,
  departmentFilter?: string,
): string {
  const count      = players.length;
  const isFiltered = Boolean(departmentFilter && departmentFilter !== "");

  const banner = usingMock
    ? `<div class="px-4 py-2.5 text-xs text-amber-400/90 bg-amber-950/40 border-b border-amber-800/40 flex items-center gap-2">
         <span class="shrink-0">⚠</span>
         <span>Mode démo — ajoutez <code class="font-mono bg-amber-900/30 px-1 rounded">MPP_ACCESS_TOKEN</code> dans <code class="font-mono bg-amber-900/30 px-1 rounded">.env</code> pour les vraies données.</span>
       </div>`
    : "";

  if (count === 0) {
    return `${banner}<p class="text-slate-500 text-center py-14 text-sm">Aucun joueur pour ce filtre.</p>`;
  }

  const rows = players.map((p, i) => {
    const deptRank = i + 1;
    const isTop3   = isFiltered ? deptRank <= 3 : p.rank <= 3;
    const rowBg    = isTop3 ? "bg-yellow-500/[0.03] hover:bg-yellow-500/[0.06]" : "hover:bg-slate-800/30";

    const rankCell = isFiltered
      ? `<td class="pl-4 pr-3 py-3 w-[4.5rem]">
           <div class="text-base leading-none">${rankDisplay(deptRank)}</div>
           <div class="text-[10px] text-slate-600 mt-1 tabular-nums">#${p.rank} gén.</div>
         </td>`
      : `<td class="pl-4 pr-3 py-3 w-12 text-center">
           <div class="text-base leading-none">${rankDisplay(p.rank)}</div>
         </td>`;

    const deptCell = isFiltered ? "" : `
      <td class="px-3 py-3 hidden sm:table-cell">
        <span class="${deptBadge(p.departmentCode)} text-[11px] font-medium px-2 py-0.5 rounded-full whitespace-nowrap">${esc(p.departmentName)}</span>
      </td>`;

    return `
      <tr class="border-b border-slate-800/40 transition-colors ${rowBg}">
        ${rankCell}
        <td class="px-2 py-3 w-10">${avatarImg(p, "w-9 h-9")}</td>
        <td class="px-3 py-3 font-medium text-slate-100 max-w-[12rem] truncate" title="${esc(p.pseudo)}">${esc(p.pseudo)}</td>
        ${deptCell}
        <td class="px-4 py-3 text-right font-bold tabular-nums text-slate-100">${p.points.toLocaleString("fr-FR")}</td>
        <td class="px-4 py-3 text-right tabular-nums text-slate-300 hidden sm:table-cell">${fmt(p.goodResults)}</td>
        <td class="px-4 py-3 text-right tabular-nums text-emerald-400 hidden sm:table-cell">${fmt(p.exactScores)}</td>
        <td class="px-3 py-3 text-right tabular-nums text-slate-600 text-xs hidden md:table-cell">${fmt(p.playedPredictions)}</td>
        <td class="pr-3 py-3 text-center w-12">${expandBtn(p.id, false)}</td>
      </tr>
      <tr id="detail-${esc(p.id)}"></tr>`;
  }).join("");

  const rankHeader = isFiltered
    ? `<th class="pl-4 pr-3 py-2.5 w-[4.5rem] text-left">Rang</th>`
    : `<th class="pl-4 pr-3 py-2.5 w-12"></th>`;
  const deptHeader = isFiltered ? "" : `<th class="px-3 py-2.5 hidden sm:table-cell">Département</th>`;

  return `
    ${banner}
    <div class="overflow-x-auto">
      <table class="w-full text-sm">
        <thead class="text-[11px] uppercase tracking-wide text-slate-500 border-b border-slate-800/40">
          <tr>
            ${rankHeader}
            <th class="px-2 py-2.5 w-10"></th>
            <th class="px-3 py-2.5 text-left">Joueur</th>
            ${deptHeader}
            <th class="px-4 py-2.5 text-right">Points</th>
            <th class="px-4 py-2.5 text-right hidden sm:table-cell">Pronos</th>
            <th class="px-4 py-2.5 text-right hidden sm:table-cell">Exacts</th>
            <th class="px-3 py-2.5 text-right hidden md:table-cell">Joués</th>
            <th class="pr-3 py-2.5 w-12"></th>
          </tr>
        </thead>
        <tbody>${rows}</tbody>
      </table>
    </div>`;
}

// ---------------------------------------------------------------------------
// Ligne de détail expandée (réponse HTMX pour /player/:id)
// ---------------------------------------------------------------------------
export function renderPlayerExpandRow(player: MppPlayer): string {
  const goodPct  = pct(player.goodResults, player.playedPredictions);
  const exactPct = pct(player.exactScores, player.playedPredictions);
  const ptsPerMatch = (player.playedPredictions && player.playedPredictions > 0)
    ? (player.points / player.playedPredictions).toFixed(1)
    : "—";

  const stat = (label: string, value: string, sub: string, color: string) => `
    <div class="text-center px-4 py-3 border-r border-slate-800/60 last:border-r-0">
      <div class="text-lg font-bold tabular-nums ${color}">${value}</div>
      ${sub ? `<div class="text-[11px] text-slate-500 mt-0.5">${sub}</div>` : ""}
      <div class="text-[11px] text-slate-600 mt-1 uppercase tracking-wide">${label}</div>
    </div>`;

  const detailRow = `
    <tr id="detail-${esc(player.id)}" class="border-b border-slate-800/40 bg-slate-950/70">
      <td colspan="99" class="py-0">
        <div class="flex items-stretch">
          <div class="flex items-center gap-3 px-4 py-3 border-r border-slate-800/60 shrink-0">
            ${avatarImg(player, "w-10 h-10")}
            <div>
              <div class="font-semibold text-sm text-slate-100 whitespace-nowrap">${esc(player.pseudo)}</div>
              <span class="${deptBadge(player.departmentCode)} text-[11px] font-medium px-1.5 py-0.5 rounded-full mt-1 inline-block">${esc(player.departmentName)}</span>
            </div>
          </div>
          <div class="flex flex-1 overflow-x-auto">
            ${stat("Points",        player.points.toLocaleString("fr-FR"), `${ptsPerMatch} pts/match`, "text-slate-100")}
            ${stat("Bons pronos",   fmt(player.goodResults),   goodPct,  "text-slate-200")}
            ${stat("Scores exacts", fmt(player.exactScores),   exactPct, "text-emerald-400")}
            ${stat("Joués",         fmt(player.playedPredictions), "",   "text-slate-500")}
          </div>
        </div>
      </td>
    </tr>`;

  // OOB : met à jour le bouton dans la ligne principale
  const oobBtn = `<span hx-swap-oob="outerHTML:#btn-${esc(player.id)}">${expandBtn(player.id, true)}</span>`;

  return detailRow + oobBtn;
}

// ---------------------------------------------------------------------------
// Ligne de détail fermée (réponse HTMX pour /player/:id/close)
// ---------------------------------------------------------------------------
export function renderPlayerCloseRow(player: MppPlayer): string {
  const emptyRow = `<tr id="detail-${esc(player.id)}"></tr>`;
  const oobBtn   = `<span hx-swap-oob="outerHTML:#btn-${esc(player.id)}">${expandBtn(player.id, false)}</span>`;
  return emptyRow + oobBtn;
}

// ---------------------------------------------------------------------------
// Statistiques par département — cartes compactes cliquables
// ---------------------------------------------------------------------------
export function renderStats(stats: DepartmentStats[]): string {
  if (stats.length === 0) {
    return `<p class="text-slate-500 text-center py-4 text-sm">Aucune statistique disponible.</p>`;
  }

  const pillClass: Record<DepartmentCode, string> = {
    MT: "fp-MT", ES: "fp-ES", TD: "fp-TD", WD: "fp-WD", UNKNOWN: "fp-UNK",
  };

  const cards = stats
    .filter((s) => s.departmentCode !== "UNKNOWN")
    .map((s) => {
    const pill  = pillClass[s.departmentCode] ?? "fp-UNK";
    const color = deptAccent(s.departmentCode);
    const best  = s.bestPlayer;
    return `
      <button
        type="button"
        class="filter-pill ${pill} group text-left rounded-lg border ${color} px-3 py-2.5 transition-colors cursor-pointer w-full"
        data-dept="${s.departmentCode}"
        onclick="setActivePill('${s.departmentCode}')"
        hx-get="/classement?department=${s.departmentCode}"
        hx-target="#classement-container"
        hx-swap="innerHTML"
      >
        <div class="flex items-center justify-between gap-2 mb-1.5">
          <span class="text-[11px] font-semibold uppercase tracking-wide ${color.split(" ")[0]}">${esc(s.departmentName)}</span>
          <span class="text-base font-black tabular-nums text-slate-100">${s.playerCount}</span>
        </div>
        <div class="text-[11px] text-slate-400">Moy. <span class="text-slate-200 font-semibold">${s.averagePoints.toLocaleString("fr-FR")}</span> · Total <span class="text-slate-300 font-medium">${s.totalPoints.toLocaleString("fr-FR")}</span></div>
        ${best ? `<div class="text-[11px] text-slate-600 mt-1 truncate" title="${esc(best.pseudo)}">🏆 ${esc(best.pseudo)}</div>` : ""}
      </button>`;
  }).join("");

  return `<div class="grid grid-cols-2 sm:grid-cols-4 gap-3">${cards}</div>`;
}

// ---------------------------------------------------------------------------
// Erreur générique
// ---------------------------------------------------------------------------
export function renderError(message: string): string {
  return `
    <div class="p-10 text-center">
      <p class="text-red-400 font-semibold text-sm">${esc(message)}</p>
      <p class="text-slate-600 text-xs mt-1">Réessayez dans quelques instants.</p>
    </div>`;
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
        <a href="/" class="text-slate-400 hover:text-white text-sm">← Classement</a>
        <h1 class="text-xl font-bold">Debug — GET /user</h1>
        ${!error ? `<a href="/debug/probe" class="ml-auto text-xs bg-blue-700 hover:bg-blue-600 px-3 py-1 rounded">→ Sonder les endpoints</a>` : ""}
      </div>
      <div class="rounded-lg border border-slate-700 bg-slate-950 p-4">${content}</div>
    </div>`;
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
        ${r.playerCount !== undefined ? `<td class="px-4 py-2 text-xs text-blue-400">${r.playerCount} joueurs</td>` : `<td></td>`}
      </tr>`;
  }).join("");

  return `
    <div class="max-w-4xl mx-auto px-4 py-8 font-mono">
      <div class="flex items-center gap-3 mb-4">
        <a href="/debug/user" class="text-slate-400 hover:text-white text-sm">← /user</a>
        <h1 class="text-xl font-bold">Debug — Probe (${esc(leagueId)})</h1>
      </div>
      ${best
        ? `<div class="mb-4 p-3 rounded bg-green-950 border border-green-800 text-sm text-green-300">✅ Endpoint valide : <code>${esc(best.path)}</code></div>`
        : `<div class="mb-4 p-3 rounded bg-red-950 border border-red-800 text-sm text-red-300">Aucun endpoint valide trouvé.</div>`}
      <div class="rounded-lg border border-slate-700 bg-slate-950 overflow-hidden">
        <table class="w-full text-sm">
          <thead class="bg-slate-800 text-xs uppercase text-slate-400">
            <tr><th class="px-4 py-2 text-left">Endpoint</th><th class="px-4 py-2 text-left">Résultat</th><th class="px-4 py-2 text-left">Joueurs</th></tr>
          </thead>
          <tbody>${rows}</tbody>
        </table>
      </div>
    </div>`;
}
