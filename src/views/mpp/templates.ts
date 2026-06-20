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

function deptGradient(code: DepartmentCode): string {
  switch (code) {
    case "MT": return "from-blue-950/50 to-slate-900/0 border-blue-900/50 hover:border-blue-700/70";
    case "ES": return "from-purple-950/50 to-slate-900/0 border-purple-900/50 hover:border-purple-700/70";
    case "TD": return "from-emerald-950/50 to-slate-900/0 border-emerald-900/50 hover:border-emerald-700/70";
    case "WD": return "from-orange-950/50 to-slate-900/0 border-orange-900/50 hover:border-orange-700/70";
    default:   return "from-slate-800/40 to-slate-900/0 border-slate-700/50 hover:border-slate-600";
  }
}

function avatarImg(p: MppPlayer, size: string): string {
  const ring  = deptRing(p.departmentCode);
  const cls   = `${size} rounded-full object-cover ring-2 ${ring} bg-slate-800`;
  const initials = esc(p.pseudo.replace(/[^a-zA-Z]/g, "").slice(0, 2).toUpperCase() || "??");
  if (p.avatarUrl) {
    return `<img src="${esc(p.avatarUrl)}" alt="" class="${cls}" loading="lazy">`;
  }
  return `<div class="${cls} flex items-center justify-center text-xs font-bold text-slate-300 shrink-0">${initials}</div>`;
}

function rankDisplay(rank: number): string {
  if (rank === 1) return "🥇";
  if (rank === 2) return "🥈";
  if (rank === 3) return "🥉";
  return `<span class="font-semibold text-slate-400 tabular-nums">${rank}</span>`;
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
    : contestInfo
      ? `<div class="px-4 py-2.5 text-xs bg-slate-800/40 border-b border-slate-700/40 flex items-center justify-between gap-4 flex-wrap">
           <span class="font-semibold text-slate-200">${esc(contestInfo.title)}</span>
           <span class="text-slate-400 shrink-0">${contestInfo.totalUsers} participants · Rang : <strong class="text-yellow-400">#${contestInfo.userRanking}</strong> · ${contestInfo.userTotalPoints} pts</span>
         </div>`
      : "";

  if (count === 0) {
    return `
      ${banner}
      <p class="text-slate-500 text-center py-14 text-sm">Aucun joueur pour ce filtre.</p>
    `;
  }

  const rows = players.map((p, i) => {
    const deptRank = i + 1;
    const isTop3   = isFiltered ? deptRank <= 3 : p.rank <= 3;
    const rowBg    = isTop3 ? "bg-yellow-500/[0.03] hover:bg-yellow-500/[0.06]" : "hover:bg-slate-800/40";

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
        <span class="${deptBadge(p.departmentCode)} text-[11px] font-medium px-2 py-0.5 rounded-full whitespace-nowrap">
          ${esc(p.departmentName)}
        </span>
      </td>`;

    return `
      <tr class="border-b border-slate-800/60 transition-colors ${rowBg}">
        ${rankCell}
        <td class="px-2 py-3 w-10">${avatarImg(p, "w-9 h-9")}</td>
        <td class="px-3 py-3 font-medium text-slate-100 max-w-[10rem] truncate" title="${esc(p.pseudo)}">${esc(p.pseudo)}</td>
        ${deptCell}
        <td class="px-4 py-3 text-right font-bold tabular-nums text-slate-100">${p.points.toLocaleString("fr-FR")}</td>
        <td class="px-4 py-3 text-right tabular-nums text-slate-300 hidden sm:table-cell">${fmt(p.goodResults)}</td>
        <td class="px-4 py-3 text-right tabular-nums text-emerald-400 hidden sm:table-cell">${fmt(p.exactScores)}</td>
        <td class="px-3 py-3 text-right tabular-nums text-slate-600 text-xs hidden md:table-cell">${fmt(p.playedPredictions)}</td>
        <td class="pr-3 py-3 text-center w-14">
          <button
            class="w-7 h-7 rounded-lg bg-slate-800 hover:bg-blue-600 border border-slate-700 hover:border-blue-500 transition-colors flex items-center justify-center mx-auto text-slate-400 hover:text-white"
            hx-get="/player/${esc(p.id)}"
            hx-target="#player-detail"
            hx-swap="innerHTML"
            title="Voir le détail"
          >▸</button>
        </td>
      </tr>`;
  }).join("");

  const rankHeader = isFiltered
    ? `<th class="pl-4 pr-3 py-3 w-[4.5rem] text-left">Rang</th>`
    : `<th class="pl-4 pr-3 py-3 w-12"></th>`;

  const deptHeader = isFiltered ? "" : `<th class="px-3 py-3 hidden sm:table-cell">Département</th>`;

  return `
    ${banner}
    <div class="px-4 py-2 text-xs text-slate-600 border-b border-slate-800/60 flex items-center justify-between">
      <span>${count} joueur${count > 1 ? "s" : ""}</span>
      <span>${esc(updatedAt)}</span>
    </div>
    <div class="overflow-x-auto">
      <table class="w-full text-sm">
        <thead class="text-[11px] uppercase tracking-wide text-slate-500 border-b border-slate-800/60">
          <tr>
            ${rankHeader}
            <th class="px-2 py-3 w-10"></th>
            <th class="px-3 py-3 text-left">Joueur</th>
            ${deptHeader}
            <th class="px-4 py-3 text-right">Points</th>
            <th class="px-4 py-3 text-right hidden sm:table-cell">Pronos</th>
            <th class="px-4 py-3 text-right hidden sm:table-cell">Exacts</th>
            <th class="px-3 py-3 text-right hidden md:table-cell">Joués</th>
            <th class="pr-3 py-3 w-14"></th>
          </tr>
        </thead>
        <tbody>${rows}</tbody>
      </table>
    </div>
  `;
}

// ---------------------------------------------------------------------------
// Statistiques par département — cartes cliquables
// ---------------------------------------------------------------------------
export function renderStats(stats: DepartmentStats[]): string {
  if (stats.length === 0) {
    return `<p class="col-span-4 text-slate-500 text-center py-6 text-sm">Aucune statistique disponible.</p>`;
  }

  const pillClass: Record<DepartmentCode, string> = {
    MT: "fp-MT", ES: "fp-ES", TD: "fp-TD", WD: "fp-WD", UNKNOWN: "fp-UNK",
  };

  const cards = stats.map((s) => {
    const pill = pillClass[s.departmentCode] ?? "fp-UNK";
    const best = s.bestPlayer;
    return `
      <button
        type="button"
        class="filter-pill ${pill} text-left rounded-xl border bg-gradient-to-br ${deptGradient(s.departmentCode)} p-4 transition-all cursor-pointer"
        data-dept="${s.departmentCode}"
        onclick="setActivePill('${s.departmentCode}')"
        hx-get="/classement?department=${s.departmentCode}"
        hx-target="#classement-container"
        hx-swap="innerHTML"
      >
        <div class="flex items-start justify-between gap-2 mb-2">
          <span class="${deptBadge(s.departmentCode)} text-[11px] font-semibold px-2 py-0.5 rounded-full leading-snug shrink-0">${esc(s.departmentName)}</span>
          <span class="text-xl font-black tabular-nums leading-none">${s.playerCount}</span>
        </div>
        <div class="text-xs text-slate-400">Moy. <span class="text-slate-200 font-semibold">${s.averagePoints.toLocaleString("fr-FR")}</span> pts</div>
        ${best ? `<div class="text-[11px] text-slate-600 mt-1.5 truncate" title="${esc(best.pseudo)}">🏆 ${esc(best.pseudo)}</div>` : ""}
      </button>`;
  }).join("");

  return `<div class="grid grid-cols-2 sm:grid-cols-4 gap-3">${cards}</div>`;
}

// ---------------------------------------------------------------------------
// Détail joueur
// ---------------------------------------------------------------------------
export function renderPlayerDetail(player: MppPlayer): string {
  const rankLabel =
    player.rank === 1 ? "🥇 1er" :
    player.rank === 2 ? "🥈 2e"  :
    player.rank === 3 ? "🥉 3e"  : `#${player.rank}`;

  const headerGrad = {
    MT: "from-blue-950/80",
    ES: "from-purple-950/80",
    TD: "from-emerald-950/80",
    WD: "from-orange-950/80",
    UNKNOWN: "from-slate-800/80",
  }[player.departmentCode];

  return `
    <div class="rounded-xl border border-slate-700/60 overflow-hidden">
      <div class="bg-gradient-to-r ${headerGrad} to-slate-900/0 px-5 py-4 flex items-center justify-between gap-4 border-b border-slate-700/40">
        <div class="flex items-center gap-3 min-w-0">
          ${avatarImg(player, "w-12 h-12 shrink-0")}
          <div class="min-w-0">
            <div class="font-bold text-lg leading-tight truncate">${esc(player.pseudo)}</div>
            <span class="${deptBadge(player.departmentCode)} text-[11px] font-semibold px-2 py-0.5 rounded-full mt-1 inline-block">
              ${esc(player.departmentName)}
            </span>
          </div>
        </div>
        <div class="text-2xl font-black text-yellow-400 shrink-0 tabular-nums">${rankLabel}</div>
      </div>
      <div class="grid grid-cols-4 divide-x divide-slate-800/60 bg-slate-900/30">
        <div class="px-4 py-4 text-center">
          <div class="text-2xl font-bold tabular-nums">${player.points.toLocaleString("fr-FR")}</div>
          <div class="text-xs text-slate-500 mt-1">Points</div>
        </div>
        <div class="px-4 py-4 text-center">
          <div class="text-2xl font-bold tabular-nums text-slate-200">${fmt(player.goodResults)}</div>
          <div class="text-xs text-slate-500 mt-1">Bons pronos</div>
        </div>
        <div class="px-4 py-4 text-center">
          <div class="text-2xl font-bold tabular-nums text-emerald-400">${fmt(player.exactScores)}</div>
          <div class="text-xs text-slate-500 mt-1">Scores exacts</div>
        </div>
        <div class="px-4 py-4 text-center">
          <div class="text-2xl font-bold tabular-nums text-slate-500">${fmt(player.playedPredictions)}</div>
          <div class="text-xs text-slate-500 mt-1">Joués</div>
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
    <div class="p-10 text-center">
      <p class="text-red-400 font-semibold text-sm">${esc(message)}</p>
      <p class="text-slate-600 text-xs mt-1">Réessayez dans quelques instants.</p>
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
        <a href="/" class="text-slate-400 hover:text-white text-sm">← Classement</a>
        <h1 class="text-xl font-bold">Debug — GET /user</h1>
        ${!error ? `<a href="/debug/probe" class="ml-auto text-xs bg-blue-700 hover:bg-blue-600 px-3 py-1 rounded">→ Sonder les endpoints classement</a>` : ""}
      </div>
      ${error ? "" : `
      <div class="mb-4 p-3 rounded bg-slate-800 text-xs text-slate-400">
        Repérez les IDs de vos ligues/groupes dans la réponse ci-dessous, puis :<br/>
        1. Ajoutez <code class="text-yellow-300">MPP_LEAGUE_ID=VOTRE_ID</code> dans <code class="text-yellow-300">.env</code><br/>
        2. Visitez <code class="text-yellow-300">/debug/probe?leagueId=VOTRE_ID</code> pour tester les endpoints
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
        <a href="/debug/user" class="text-slate-400 hover:text-white text-sm">← /user</a>
        <h1 class="text-xl font-bold">Debug — Probe endpoints (leagueId: ${esc(leagueId)})</h1>
      </div>

      ${best ? `
      <div class="mb-4 p-3 rounded bg-green-950 border border-green-800 text-sm text-green-300">
        ✅ Endpoint valide trouvé : <code class="font-mono">${esc(best.path)}</code><br/>
        Ajoutez dans <code>.env</code> : <code class="text-yellow-300">MPP_RANKING_PATH=${esc(best.path)}</code>
      </div>` : `
      <div class="mb-4 p-3 rounded bg-red-950 border border-red-800 text-sm text-red-300">
        Aucun endpoint valide trouvé pour ce league ID.<br/>
        Vérifiez l'ID dans <a href="/debug/user" class="underline">/debug/user</a> ou inspectez les requêtes réseau sur mpp.football.
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
