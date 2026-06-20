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

// ---------------------------------------------------------------------------
// Design helpers
// ---------------------------------------------------------------------------
function deptColor(code: DepartmentCode): { solid: string; dim: string; text: string; border: string } {
  switch (code) {
    case "MT": return { solid: "#3b82f6", dim: "rgba(59,130,246,0.1)",  text: "#93c5fd", border: "rgba(59,130,246,0.25)"  };
    case "ES": return { solid: "#8b5cf6", dim: "rgba(139,92,246,0.1)",  text: "#c4b5fd", border: "rgba(139,92,246,0.25)"  };
    case "TD": return { solid: "#10b981", dim: "rgba(16,185,129,0.1)",  text: "#6ee7b7", border: "rgba(16,185,129,0.25)"  };
    case "WD": return { solid: "#f97316", dim: "rgba(249,115,22,0.1)",  text: "#fdba74", border: "rgba(249,115,22,0.25)"  };
    default:   return { solid: "#64748b", dim: "rgba(100,116,139,0.08)", text: "#94a3b8", border: "rgba(100,116,139,0.2)" };
  }
}

function deptRowFill(code: DepartmentCode): string {
  switch (code) {
    case "MT": return "rgba(59,130,246,0.055)";
    case "ES": return "rgba(139,92,246,0.055)";
    case "TD": return "rgba(16,185,129,0.055)";
    case "WD": return "rgba(249,115,22,0.055)";
    default:   return "rgba(100,116,139,0.04)";
  }
}

function deptBadge(code: DepartmentCode, name: string): string {
  const c = deptColor(code);
  return `<span style="font-size:10px;font-weight:600;padding:2px 7px;border-radius:999px;background:${c.dim};color:${c.text};border:1px solid ${c.border};letter-spacing:0.02em;white-space:nowrap">${esc(name)}</span>`;
}

function avatarImg(p: MppPlayer, px: number): string {
  const c        = deptColor(p.departmentCode);
  const initials = esc(p.pseudo.replace(/[^a-zA-Z]/g, "").slice(0, 2).toUpperCase() || "??");
  const base     = `width:${px}px;height:${px}px;border-radius:50%;flex-shrink:0;outline:2px solid ${c.solid};outline-offset:1.5px;`;
  if (p.avatarUrl) {
    return `<img src="${esc(p.avatarUrl)}" alt="" style="${base}object-fit:cover;background:#101520" loading="lazy">`;
  }
  return `<div style="${base}background:#0f1828;display:flex;align-items:center;justify-content:center;font-size:${Math.round(px * 0.3)}px;font-weight:700;color:${c.text};font-family:'Manrope',sans-serif">${initials}</div>`;
}

function rankDisplay(rank: number, isFiltered: boolean, globalRank?: number): string {
  const numStyle = (color: string, size: string) =>
    `<span class="font-oswald" style="color:${color};font-size:${size};font-weight:700;line-height:1">${rank}</span>`;

  let primary: string;
  if (rank === 1) primary = numStyle("#f4c340", "1.35rem");
  else if (rank === 2) primary = numStyle("#96afc4", "1.35rem");
  else if (rank === 3) primary = numStyle("#c87a42", "1.35rem");
  else primary = numStyle("#243040", "1rem");

  if (isFiltered && globalRank !== undefined) {
    return `<div style="display:flex;flex-direction:column;gap:2px">
      ${primary}
      <span style="font-size:10px;color:#243040;font-family:'Manrope',sans-serif;line-height:1">#${globalRank} gén.</span>
    </div>`;
  }
  return primary;
}

// ---------------------------------------------------------------------------
// Expand / close button
// ---------------------------------------------------------------------------
function expandBtn(playerId: string, open: boolean): string {
  const endpoint = open ? `/player/${playerId}/close` : `/player/${playerId}`;
  const s = open
    ? "background:rgba(170,238,68,0.12);border:1px solid rgba(170,238,68,0.28);color:#aaee44"
    : "background:rgba(255,255,255,0.04);border:1px solid rgba(255,255,255,0.08);color:#4e6278";
  return `<button
    id="btn-${esc(playerId)}"
    style="${s};width:28px;height:28px;border-radius:6px;display:flex;align-items:center;justify-content:center;margin:0 auto;cursor:pointer;transition:background 0.12s,color 0.12s,border-color 0.12s;font-size:10px"
    hx-get="${endpoint}"
    hx-target="#detail-${esc(playerId)}"
    hx-swap="outerHTML"
    title="${open ? "Fermer" : "Voir le détail"}"
  >${open ? "▲" : "▼"}</button>`;
}

// ---------------------------------------------------------------------------
// Pagination helper
// ---------------------------------------------------------------------------
function paginationBar(
  current: number,
  total: number,
  totalRows: number,
  pageSize: number,
  deptParam: string,
): string {
  if (total <= 1) return "";

  const pageUrl = (n: number) =>
    deptParam
      ? `/classement?department=${deptParam}&page=${n}`
      : `/classement?page=${n}`;

  const pageBtn = (n: number, label?: string) => {
    const active = n === current;
    const s = active
      ? "background:rgba(170,238,68,0.12);border-color:rgba(170,238,68,0.28);color:#aaee44;cursor:default"
      : "background:rgba(255,255,255,0.04);border-color:rgba(255,255,255,0.08);color:#4e6278;cursor:pointer";
    const htmx = active ? "" : `hx-get="${pageUrl(n)}" hx-target="#classement-container" hx-swap="innerHTML"`;
    return `<button ${htmx} style="${s};width:30px;height:30px;border-radius:6px;border-width:1px;font-size:12px;font-weight:600;font-family:'Manrope',sans-serif;display:inline-flex;align-items:center;justify-content:center;transition:background 0.12s,color 0.12s">${label ?? n}</button>`;
  };

  const navBtn = (n: number, label: string, disabled: boolean) => {
    const s = disabled
      ? "background:transparent;border-color:rgba(255,255,255,0.05);color:#243040;cursor:not-allowed"
      : "background:rgba(255,255,255,0.04);border-color:rgba(255,255,255,0.08);color:#4e6278;cursor:pointer";
    const htmx = disabled ? "" : `hx-get="${pageUrl(n)}" hx-target="#classement-container" hx-swap="innerHTML"`;
    return `<button ${htmx} ${disabled ? "disabled" : ""} style="${s};padding:0 10px;height:30px;border-radius:6px;border-width:1px;font-size:12px;font-weight:600;font-family:'Manrope',sans-serif;display:inline-flex;align-items:center;justify-content:center;transition:background 0.12s,color 0.12s">${label}</button>`;
  };

  const MAX_VISIBLE = 5;
  let pages: (number | "…")[] = [];
  if (total <= MAX_VISIBLE + 2) {
    pages = Array.from({ length: total }, (_, i) => i + 1);
  } else {
    const half = Math.floor(MAX_VISIBLE / 2);
    let start = Math.max(2, current - half);
    let end   = Math.min(total - 1, start + MAX_VISIBLE - 1);
    if (end - start < MAX_VISIBLE - 1) start = Math.max(2, end - MAX_VISIBLE + 1);
    pages = [1];
    if (start > 2) pages.push("…");
    for (let i = start; i <= end; i++) pages.push(i);
    if (end < total - 1) pages.push("…");
    pages.push(total);
  }

  const start = (current - 1) * pageSize + 1;
  const end   = Math.min(current * pageSize, totalRows);

  return `
    <div style="position:sticky;bottom:0;z-index:10;background:#0b1018;display:flex;align-items:center;justify-content:center;padding:10px 20px;border-top:1px solid rgba(255,255,255,0.05);gap:16px;flex-wrap:wrap">
      ${navBtn(current - 1, "←", current === 1)}
      ${pages.map((p) => p === "…"
        ? `<span style="width:20px;text-align:center;color:#243040;font-size:12px">…</span>`
        : pageBtn(p as number)
      ).join("")}
      ${navBtn(current + 1, "→", current === total)}
      <span style="font-size:11px;color:#243040;font-family:'Manrope',sans-serif;margin-left:8px">${start}–${end} / ${totalRows}</span>
    </div>`;
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
  page = 1,
  perPage = 20,
): string {
  const isFiltered = Boolean(departmentFilter && departmentFilter !== "");

  const banner = usingMock
    ? `<div style="padding:10px 20px;font-size:12px;color:#fbbf24;background:rgba(120,80,0,0.18);border-bottom:1px solid rgba(251,191,36,0.15);display:flex;align-items:center;gap:8px">
         <span>⚠</span>
         <span>Mode démo — ajoutez <code style="font-family:monospace;background:rgba(251,191,36,0.1);padding:0 4px;border-radius:3px">MPP_ACCESS_TOKEN</code> dans <code style="font-family:monospace;background:rgba(251,191,36,0.1);padding:0 4px;border-radius:3px">.env</code> pour les vraies données.</span>
       </div>`
    : "";

  if (players.length === 0) {
    return `${banner}<p style="text-align:center;padding:56px 0;font-size:14px;color:#243040">Aucun joueur pour ce filtre.</p>`;
  }

  const totalRows  = players.length;
  const totalPages = Math.max(1, Math.ceil(totalRows / perPage));
  const current    = Math.min(Math.max(1, page), totalPages);
  const start      = (current - 1) * perPage;
  const pagePlayers = players.slice(start, start + perPage);

  const maxPts = players[0]?.points ?? 1;

  const rows = pagePlayers.map((p, i) => {
    const deptRank = start + i + 1;
    const ptsPct   = Math.max(6, Math.round((p.points / maxPts) * 82));
    const fill     = deptRowFill(p.departmentCode);
    const c        = deptColor(p.departmentCode);
    const isTop3   = isFiltered ? deptRank <= 3 : p.rank <= 3;
    const rowStyle = `--pts-pct:${ptsPct}%;--row-fill:${fill};border-bottom:1px solid rgba(255,255,255,0.04);cursor:default;transition:background 0.1s`;

    const rankCell = isFiltered
      ? `<td style="padding:10px 12px 10px 20px;width:72px;vertical-align:middle">
           ${rankDisplay(deptRank, true, p.rank)}
         </td>`
      : `<td style="padding:10px 12px 10px 20px;width:48px;text-align:center;vertical-align:middle">
           ${rankDisplay(p.rank, false)}
         </td>`;

    const deptCell = isFiltered ? "" : `
      <td class="hidden sm:table-cell" style="padding:10px 16px;vertical-align:middle">
        ${deptBadge(p.departmentCode, p.departmentName)}
      </td>`;

    const mobileDeptBadge = isFiltered ? "" :
      `<div class="sm:hidden" style="margin-top:3px">${deptBadge(p.departmentCode, p.departmentName)}</div>`;

    return `
      <tr class="player-row" style="${rowStyle}">
        ${rankCell}
        <td style="padding:8px;width:44px;vertical-align:middle">${avatarImg(p, 36)}</td>
        <td style="padding:10px 12px;vertical-align:middle;max-width:200px">
          <div style="font-weight:600;font-size:14px;color:#dce9f8;white-space:nowrap;overflow:hidden;text-overflow:ellipsis" title="${esc(p.pseudo)}">${esc(p.pseudo)}</div>
          ${mobileDeptBadge}
        </td>
        ${deptCell}
        <td style="padding:10px 16px;text-align:right;vertical-align:middle">
          <span class="font-oswald" style="font-size:17px;font-weight:600;color:${isTop3 ? c.text : "#dce9f8"};letter-spacing:0.01em">${p.points.toLocaleString("fr-FR")}</span>
        </td>
        <td class="hidden sm:table-cell" style="padding:10px 14px;text-align:right;vertical-align:middle;font-size:13px;color:#4e6278;font-variant-numeric:tabular-nums">${fmt(p.goodResults)}</td>
        <td class="hidden sm:table-cell" style="padding:10px 14px;text-align:right;vertical-align:middle;font-size:13px;color:#6ee7b7;font-variant-numeric:tabular-nums">${fmt(p.exactScores)}</td>
        <td class="hidden md:table-cell" style="padding:10px 12px;text-align:right;vertical-align:middle;font-size:12px;color:#243040;font-variant-numeric:tabular-nums">${fmt(p.playedPredictions)}</td>
        <td style="padding:10px 12px;width:44px;vertical-align:middle">${expandBtn(p.id, false)}</td>
      </tr>
      <tr id="detail-${esc(p.id)}"></tr>`;
  }).join("");

  const rankTh = isFiltered
    ? `<th style="padding-left:20px;text-align:left;width:72px">Rang</th>`
    : `<th style="padding-left:20px;width:48px"></th>`;
  const deptTh = isFiltered ? "" : `<th class="hidden sm:table-cell" style="padding:0 16px;text-align:left">Département</th>`;

  const deptParam = departmentFilter ?? "";

  return `
    ${banner}
    <div style="overflow-x:auto">
      <table style="width:100%;border-collapse:collapse">
        <thead class="table-head" style="position:sticky;top:0;z-index:10;background:#0b1018">
          <tr>
            ${rankTh}
            <th style="width:44px"></th>
            <th style="padding:0 12px;text-align:left">Joueur</th>
            ${deptTh}
            <th style="padding:0 16px;text-align:right">Points</th>
            <th class="hidden sm:table-cell" style="padding:0 14px;text-align:right">Pronos</th>
            <th class="hidden sm:table-cell" style="padding:0 14px;text-align:right">Exacts</th>
            <th class="hidden md:table-cell" style="padding:0 12px;text-align:right">Joués</th>
            <th style="width:44px"></th>
          </tr>
        </thead>
        <tbody>${rows}</tbody>
      </table>
    </div>
    ${paginationBar(current, totalPages, totalRows, perPage, deptParam)}`;
}

// ---------------------------------------------------------------------------
// Expand row — réponse HTMX /player/:id
// ---------------------------------------------------------------------------
export function renderPlayerExpandRow(player: MppPlayer): string {
  const c         = deptColor(player.departmentCode);
  const goodPct   = pct(player.goodResults, player.playedPredictions);
  const exactPct  = pct(player.exactScores, player.playedPredictions);
  const ptsPerM   = (player.playedPredictions && player.playedPredictions > 0)
    ? (player.points / player.playedPredictions).toFixed(1)
    : "—";

  const statBlock = (label: string, value: string, sub: string, valueColor: string) => `
    <div style="flex:1;min-width:80px;text-align:center;padding:14px 10px;border-right:1px solid rgba(255,255,255,0.05)">
      <div class="font-oswald" style="font-size:1.4rem;font-weight:600;color:${valueColor};line-height:1;letter-spacing:0.01em">${value}</div>
      ${sub ? `<div style="font-size:10px;color:#4e6278;margin-top:3px;font-variant-numeric:tabular-nums">${sub}</div>` : ""}
      <div style="font-size:10px;text-transform:uppercase;letter-spacing:0.08em;color:#243040;margin-top:6px;font-weight:700">${label}</div>
    </div>`;

  const detailRow = `
    <tr id="detail-${esc(player.id)}" class="detail-expand" style="border-bottom:1px solid rgba(255,255,255,0.04)">
      <td colspan="99" style="padding:0">
        <div style="display:flex;align-items:stretch;border-left:3px solid ${c.solid}">
          <div style="display:flex;align-items:center;gap:12px;padding:14px 16px;border-right:1px solid rgba(255,255,255,0.05);flex-shrink:0">
            ${avatarImg(player, 40)}
            <div>
              <div style="font-weight:600;font-size:14px;color:#dce9f8;white-space:nowrap">${esc(player.pseudo)}</div>
              <div style="margin-top:4px">${deptBadge(player.departmentCode, player.departmentName)}</div>
            </div>
          </div>
          <div style="display:flex;flex:1;overflow-x:auto">
            ${statBlock("Points",        player.points.toLocaleString("fr-FR"), `${ptsPerM} pts / match`, "#dce9f8")}
            ${statBlock("Bons pronos",   fmt(player.goodResults),  goodPct,  "#dce9f8")}
            ${statBlock("Scores exacts", fmt(player.exactScores),  exactPct, c.text)}
            ${statBlock("Joués",         fmt(player.playedPredictions), "",  "#4e6278")}
          </div>
        </div>
      </td>
    </tr>`;

  const oobBtn = `<span hx-swap-oob="outerHTML:#btn-${esc(player.id)}">${expandBtn(player.id, true)}</span>`;
  return detailRow + oobBtn;
}

// ---------------------------------------------------------------------------
// Close row — réponse HTMX /player/:id/close
// ---------------------------------------------------------------------------
export function renderPlayerCloseRow(player: MppPlayer): string {
  const emptyRow = `<tr id="detail-${esc(player.id)}"></tr>`;
  const oobBtn   = `<span hx-swap-oob="outerHTML:#btn-${esc(player.id)}">${expandBtn(player.id, false)}</span>`;
  return emptyRow + oobBtn;
}

// ---------------------------------------------------------------------------
// Stats par département
// ---------------------------------------------------------------------------
export function renderStats(stats: DepartmentStats[]): string {
  if (stats.length === 0) {
    return `<p style="text-align:center;padding:16px 0;font-size:14px;color:#243040">Aucune statistique disponible.</p>`;
  }

  const pillClass: Record<DepartmentCode, string> = {
    MT: "fp-MT", ES: "fp-ES", TD: "fp-TD", WD: "fp-WD", UNKNOWN: "",
  };

  const cards = stats
    .filter((s) => s.departmentCode !== "UNKNOWN")
    .map((s) => {
      const c    = deptColor(s.departmentCode);
      const pill = pillClass[s.departmentCode] ?? "";
      const best = s.bestPlayer;
      return `
        <button
          type="button"
          class="dept-tab stat-card dept-${s.departmentCode} ${pill}"
          data-dept="${s.departmentCode}"
          onclick="setActivePill('${s.departmentCode}')"
          hx-get="/classement?department=${s.departmentCode}"
          hx-target="#classement-container"
          hx-swap="innerHTML"
          style="text-align:left;padding:11px 14px;border-radius:8px;cursor:pointer;width:100%"
        >
          <div style="display:flex;align-items:flex-start;justify-content:space-between;gap:8px;margin-bottom:5px">
            <span style="font-size:11px;font-weight:700;text-transform:uppercase;letter-spacing:0.08em;color:${c.text}">${esc(s.departmentName)}</span>
            <span class="font-oswald" style="font-size:1.25rem;font-weight:700;color:#dce9f8;line-height:1;flex-shrink:0">${s.playerCount}</span>
          </div>
          <div style="font-size:11px;color:#4e6278;line-height:1.5">
            Moy. <span style="color:#dce9f8;font-weight:600">${s.averagePoints.toLocaleString("fr-FR")}</span>
            <span style="color:#243040;margin:0 4px">·</span>
            Total <span style="color:#aab8c8;font-weight:500">${s.totalPoints.toLocaleString("fr-FR")}</span>
          </div>
          ${best ? `<div style="font-size:10px;color:#243040;margin-top:4px;white-space:nowrap;overflow:hidden;text-overflow:ellipsis" title="${esc(best.pseudo)}">🏆 ${esc(best.pseudo)}</div>` : ""}
        </button>`;
    }).join("");

  return `<div class="grid grid-cols-2 sm:grid-cols-4 gap-3">${cards}</div>`;
}

// ---------------------------------------------------------------------------
// Erreur générique
// ---------------------------------------------------------------------------
export function renderError(message: string): string {
  return `
    <div style="padding:48px 0;text-align:center">
      <p style="color:#f87171;font-weight:600;font-size:14px">${esc(message)}</p>
      <p style="color:#243040;font-size:12px;margin-top:4px">Réessayez dans quelques instants.</p>
    </div>`;
}

// ---------------------------------------------------------------------------
// Debug — GET /user
// ---------------------------------------------------------------------------
export function renderDebugUser(user: MppRawUser | null, error: string | null): string {
  const content = error
    ? `<p style="color:#f87171">${esc(error)}</p>`
    : `<pre style="font-size:12px;color:#6ee7b7;overflow-x:auto;white-space:pre-wrap;word-break:break-all">${esc(JSON.stringify(user, null, 2))}</pre>`;
  return `
    <div style="max-width:900px;margin:0 auto;padding:32px 20px;font-family:'Manrope',sans-serif">
      <div style="display:flex;align-items:center;gap:12px;margin-bottom:16px">
        <a href="/" style="color:#4e6278;font-size:14px;text-decoration:none">← Classement</a>
        <h1 style="font-size:20px;font-weight:700;color:#dce9f8">Debug — GET /user</h1>
        ${!error ? `<a href="/debug/probe" style="margin-left:auto;font-size:12px;background:#1d4ed8;color:#fff;padding:4px 12px;border-radius:6px;text-decoration:none">→ Sonder les endpoints</a>` : ""}
      </div>
      <div style="border-radius:10px;border:1px solid rgba(255,255,255,0.07);background:#0b1018;padding:16px">${content}</div>
    </div>`;
}

// ---------------------------------------------------------------------------
// Debug — probe endpoints
// ---------------------------------------------------------------------------
export function renderDebugProbe(leagueId: string, results: ProbeResult[]): string {
  const best = results.find((r) => r.status === "ok");
  const rows = results.map((r) => {
    const color = r.status === "ok" ? "#6ee7b7" : r.status === "empty" ? "#fbbf24" : "#f87171";
    const icon  = r.status === "ok" ? "✅" : r.status === "empty" ? "⚠" : "✗";
    return `
      <tr style="border-bottom:1px solid rgba(255,255,255,0.05)">
        <td style="padding:8px 16px;font-family:monospace;font-size:12px;color:#dce9f8">${esc(r.path)}</td>
        <td style="padding:8px 16px;font-size:12px;color:${color}">${icon} ${esc(r.hint ?? r.status)}</td>
        ${r.playerCount !== undefined ? `<td style="padding:8px 16px;font-size:12px;color:#93c5fd">${r.playerCount} joueurs</td>` : `<td></td>`}
      </tr>`;
  }).join("");
  return `
    <div style="max-width:900px;margin:0 auto;padding:32px 20px;font-family:'Manrope',sans-serif">
      <div style="display:flex;align-items:center;gap:12px;margin-bottom:16px">
        <a href="/debug/user" style="color:#4e6278;font-size:14px;text-decoration:none">← /user</a>
        <h1 style="font-size:20px;font-weight:700;color:#dce9f8">Debug — Probe (${esc(leagueId)})</h1>
      </div>
      ${best
        ? `<div style="margin-bottom:16px;padding:12px 16px;border-radius:8px;background:rgba(16,185,129,0.1);border:1px solid rgba(16,185,129,0.25);font-size:14px;color:#6ee7b7">✅ Endpoint valide : <code style="font-family:monospace">${esc(best.path)}</code></div>`
        : `<div style="margin-bottom:16px;padding:12px 16px;border-radius:8px;background:rgba(248,113,113,0.1);border:1px solid rgba(248,113,113,0.25);font-size:14px;color:#f87171">Aucun endpoint valide trouvé.</div>`}
      <div style="border-radius:10px;border:1px solid rgba(255,255,255,0.07);background:#0b1018;overflow:hidden">
        <table style="width:100%;border-collapse:collapse">
          <thead>
            <tr style="background:rgba(255,255,255,0.04)">
              <th style="padding:10px 16px;text-align:left;font-size:11px;text-transform:uppercase;letter-spacing:0.08em;color:#243040;font-weight:700">Endpoint</th>
              <th style="padding:10px 16px;text-align:left;font-size:11px;text-transform:uppercase;letter-spacing:0.08em;color:#243040;font-weight:700">Résultat</th>
              <th style="padding:10px 16px;text-align:left;font-size:11px;text-transform:uppercase;letter-spacing:0.08em;color:#243040;font-weight:700">Joueurs</th>
            </tr>
          </thead>
          <tbody>${rows}</tbody>
        </table>
      </div>
    </div>`;
}
