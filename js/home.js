import { db, collection, getDocs, orderBy, query } from "./firebase-init.js";
import { MODES, modeLabel, formatDateTime, statusBadge, renderSlotGrid, escapeHtml } from "./utils.js";

const grid = document.getElementById("tournament-grid");
const emptyState = document.getElementById("empty-state");
const filterBar = document.getElementById("filter-bar");

let allTournaments = [];
let activeFilter = "all";

async function loadTournaments() {
  grid.innerHTML = `<p class="helper">Loading tournaments…</p>`;
  try {
    const q = query(collection(db, "tournaments"), orderBy("startTime", "asc"));
    const snap = await getDocs(q);
    allTournaments = snap.docs.map(d => ({ id: d.id, ...d.data() }));
    render();
  } catch (err) {
    console.error(err);
    grid.innerHTML = `<p class="error-text">Couldn't load tournaments. Check that js/firebase-config.js has your project's keys.</p>`;
  }
}

function render() {
  const list = activeFilter === "all"
    ? allTournaments
    : allTournaments.filter(t => t.mode === activeFilter);

  grid.innerHTML = "";
  emptyState.style.display = list.length ? "none" : "block";

  for (const t of list) {
    const badge = statusBadge(t.status);
    const card = document.createElement("a");
    card.href = `tournament.html?id=${t.id}`;
    card.className = "card";
    card.innerHTML = `
      <div class="card-top">
        <span class="mode-tag">${modeLabel(t.mode)}</span>
        <span class="badge ${badge.cls}">${badge.text}</span>
      </div>
      <h3>${escapeHtml(t.name)}</h3>
      <div class="meta">${formatDateTime(t.startTime)}</div>
      <div class="slot-grid" data-filled="${t.slotsFilled || 0}" data-total="${t.maxSlots || 48}"></div>
      <div class="slot-caption">${t.slotsFilled || 0} / ${t.maxSlots || 48} players locked in</div>
      ${t.prizePool ? `<div class="prize">₹${escapeHtml(String(t.prizePool))} prize pool</div>` : ""}
    `;
    grid.appendChild(card);
    const slotGrid = card.querySelector(".slot-grid");
    renderSlotGrid(slotGrid, t.slotsFilled || 0, t.maxSlots || 48);
  }
}

filterBar.addEventListener("click", (e) => {
  const btn = e.target.closest(".tab-btn");
  if (!btn) return;
  filterBar.querySelectorAll(".tab-btn").forEach(b => b.classList.remove("active"));
  btn.classList.add("active");
  activeFilter = btn.dataset.mode;
  render();
});

loadTournaments();
