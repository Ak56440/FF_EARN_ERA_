// Shared constants and small helper functions used across every page.

export const MODES = {
  solo:   { label: "1 vs 1",  teamSize: 1, icon: "⬡" },
  duo:    { label: "2 vs 2",  teamSize: 2, icon: "⬡⬡" },
  squad:  { label: "4 vs 4",  teamSize: 4, icon: "⬡⬡⬡⬡" },
  custom: { label: "Custom Room (48 players)", teamSize: null, icon: "▦" }
};

export function modeLabel(mode) {
  return MODES[mode]?.label ?? mode;
}

export function teamSizeFor(tournament) {
  if (tournament.mode === "custom") return tournament.teamSize || 1;
  return MODES[tournament.mode]?.teamSize ?? 1;
}

export function formatDateTime(tsOrDate) {
  const d = tsOrDate?.toDate ? tsOrDate.toDate() : new Date(tsOrDate);
  if (isNaN(d)) return "TBD";
  return d.toLocaleString(undefined, {
    weekday: "short", month: "short", day: "numeric",
    hour: "2-digit", minute: "2-digit"
  });
}

export function countdownParts(target) {
  const t = target?.toDate ? target.toDate() : new Date(target);
  const diff = t.getTime() - Date.now();
  if (isNaN(diff) || diff <= 0) return null;
  const s = Math.floor(diff / 1000);
  return {
    days: Math.floor(s / 86400),
    hours: Math.floor((s % 86400) / 3600),
    minutes: Math.floor((s % 3600) / 60),
    seconds: s % 60
  };
}

export function statusBadge(status) {
  const map = {
    upcoming: { text: "Upcoming", cls: "badge-upcoming" },
    live: { text: "Live", cls: "badge-live" },
    completed: { text: "Completed", cls: "badge-completed" }
  };
  return map[status] ?? map.upcoming;
}

// Renders the "lobby fills up" slot grid — the site's signature visual.
// filled/total are player counts, not team counts.
export function renderSlotGrid(container, filled, total) {
  container.innerHTML = "";
  container.style.setProperty("--cols", Math.min(12, total));
  for (let i = 0; i < total; i++) {
    const cell = document.createElement("div");
    cell.className = "slot-cell" + (i < filled ? " slot-filled" : "");
    container.appendChild(cell);
  }
}

// Simple BR-style scoring: placement points + kill points.
// Placement points follow a common Free Fire tournament curve; kills are 1 point each.
const PLACEMENT_POINTS = [12, 9, 8, 7, 6, 5, 4, 3, 2, 1, 1, 1];
export function calcPoints(placement, kills) {
  const p = PLACEMENT_POINTS[placement - 1] ?? 0;
  return p + (kills || 0);
}

export function qs(name) {
  return new URLSearchParams(window.location.search).get(name);
}

export function escapeHtml(str) {
  const div = document.createElement("div");
  div.textContent = str ?? "";
  return div.innerHTML;
}
