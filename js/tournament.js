import { db, doc, getDoc, collection, getDocs, query, orderBy } from "./firebase-init.js";
import { modeLabel, teamSizeFor, formatDateTime, countdownParts, statusBadge, renderSlotGrid, escapeHtml, calcPoints } from "./utils.js";

const root = document.getElementById("page-root");
const id = new URLSearchParams(window.location.search).get("id");

let countdownTimer = null;

async function load() {
  if (!id) {
    root.innerHTML = `<p class="error-text">No tournament specified.</p>`;
    return;
  }
  const snap = await getDoc(doc(db, "tournaments", id));
  if (!snap.exists()) {
    root.innerHTML = `<p class="error-text">This tournament doesn't exist or was removed.</p>`;
    return;
  }
  const t = { id: snap.id, ...snap.data() };
  render(t);
  if (t.status === "completed") loadResults(t);
}

function render(t) {
  const badge = statusBadge(t.status);
  const size = teamSizeFor(t);
  const full = (t.slotsFilled || 0) >= (t.maxSlots || 48);
  const canRegister = t.status === "upcoming" && !full;

  root.innerHTML = `
    <div class="card-top" style="margin-bottom:0.5rem;">
      <span class="mode-tag">${modeLabel(t.mode)}</span>
      <span class="badge ${badge.cls}">${badge.text}</span>
    </div>
    <h1>${escapeHtml(t.name)}</h1>
    ${t.rules ? `<p class="lead">${escapeHtml(t.rules)}</p>` : ""}

    <div class="panel">
      <div class="stat-row">
        <div class="stat"><div class="label">Starts</div><div class="value">${formatDateTime(t.startTime)}</div></div>
        <div class="stat"><div class="label">Team size</div><div class="value">${size} player${size > 1 ? "s" : ""}</div></div>
        <div class="stat"><div class="label">Capacity</div><div class="value">${t.maxSlots || 48} players</div></div>
        ${t.entryFee ? `<div class="stat"><div class="label">Entry fee</div><div class="value">₹${escapeHtml(String(t.entryFee))}</div></div>` : ""}
        ${t.prizePool ? `<div class="stat"><div class="label">Prize pool</div><div class="value">₹${escapeHtml(String(t.prizePool))}</div></div>` : ""}
      </div>
      <div id="countdown" class="stat"></div>
      <div class="slot-grid" id="slot-grid"></div>
      <div class="slot-caption">${t.slotsFilled || 0} / ${t.maxSlots || 48} players locked in</div>
    </div>

    <div class="panel" id="room-panel"></div>

    <a class="btn btn-primary btn-block" href="${canRegister ? `register.html?id=${t.id}` : "#"}"
       ${canRegister ? "" : "aria-disabled='true' style='pointer-events:none;opacity:0.5;'"}>
      ${full ? "Room full" : t.status !== "upcoming" ? "Registration closed" : "Register a slot"}
    </a>

    <div id="results-panel"></div>
  `;

  renderSlotGrid(document.getElementById("slot-grid"), t.slotsFilled || 0, t.maxSlots || 48);
  renderRoomPanel(t);
  startCountdown(t);
}

function renderRoomPanel(t) {
  const panel = document.getElementById("room-panel");
  const showRoom = t.roomId && (t.status === "live" || t.status === "completed");
  if (showRoom) {
    panel.innerHTML = `
      <h3>Room details</h3>
      <div class="room-reveal">
        ROOM ID: ${escapeHtml(t.roomId)}<br>
        PASSWORD: ${escapeHtml(t.roomPassword || "—")}
      </div>
    `;
  } else if (t.status === "upcoming") {
    panel.innerHTML = `<h3>Room details</h3><p class="helper">Room ID and password appear here once the admin opens the lobby, shortly before start.</p>`;
  } else {
    panel.innerHTML = "";
  }
}

function startCountdown(t) {
  const el = document.getElementById("countdown");
  if (!el || t.status !== "upcoming") { if (el) el.innerHTML = ""; return; }
  function tick() {
    const parts = countdownParts(t.startTime);
    if (!parts) {
      el.innerHTML = `<div class="label">Status</div><div class="value">Starting soon</div>`;
      clearInterval(countdownTimer);
      return;
    }
    el.innerHTML = `<div class="label">Starts in</div><div class="value mono">${parts.days}d ${parts.hours}h ${parts.minutes}m ${parts.seconds}s</div>`;
  }
  tick();
  countdownTimer = setInterval(tick, 1000);
}

async function loadResults(t) {
  const panel = document.getElementById("results-panel");
  panel.innerHTML = `<h2>Leaderboard</h2><p class="helper">Loading results…</p>`;
  const q = query(collection(db, "tournaments", t.id, "results"), orderBy("placement", "asc"));
  const snap = await getDocs(q);
  if (snap.empty) {
    panel.innerHTML = `<h2>Leaderboard</h2><p class="helper">Results haven't been posted yet.</p>`;
    return;
  }
  const rows = snap.docs.map(d => d.data()).map(r => ({
    ...r,
    points: r.points ?? calcPoints(r.placement, r.kills)
  })).sort((a, b) => b.points - a.points);

  panel.innerHTML = `
    <h2>Leaderboard</h2>
    <div class="panel">
      <table>
        <thead><tr><th>Team</th><th>Placement</th><th>Kills</th><th>Points</th></tr></thead>
        <tbody>
          ${rows.map((r, i) => `
            <tr class="${i === 0 ? "rank-1" : ""}">
              <td>${escapeHtml(r.teamName)}</td>
              <td>#${r.placement}</td>
              <td>${r.kills ?? 0}</td>
              <td class="mono">${r.points}</td>
            </tr>
          `).join("")}
        </tbody>
      </table>
    </div>
  `;
}

load();
