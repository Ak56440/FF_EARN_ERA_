import {
  db, auth, collection, doc, getDoc, getDocs, addDoc, setDoc, updateDoc, deleteDoc,
  query, orderBy, serverTimestamp,
  signInWithEmailAndPassword, signOut, onAuthStateChanged
} from "./firebase-init.js";
import { MODES, modeLabel, teamSizeFor, formatDateTime, statusBadge, escapeHtml, calcPoints } from "./utils.js";

const root = document.getElementById("page-root");
const signoutLink = document.getElementById("signout-link");

let currentUser = null;
let tournamentsCache = [];

onAuthStateChanged(auth, async (user) => {
  if (!user) { currentUser = null; signoutLink.style.display = "none"; renderLogin(); return; }
  const adminSnap = await getDoc(doc(db, "admins", user.uid));
  if (!adminSnap.exists()) {
    root.innerHTML = `<div class="panel"><h2>Not an admin account</h2><p>This account signed in but isn't on the admin list. Ask an existing admin to add your UID (<span class="mono">${user.uid}</span>) to the <span class="mono">admins</span> collection in Firestore.</p></div>`;
    signoutLink.style.display = "inline";
    return;
  }
  currentUser = user;
  signoutLink.style.display = "inline";
  renderDashboard();
});

signoutLink.addEventListener("click", (e) => { e.preventDefault(); signOut(auth); });

function renderLogin() {
  root.innerHTML = `
    <div class="admin-login panel">
      <h2>Admin sign in</h2>
      <form id="login-form">
        <div class="field"><label for="email">Email</label><input id="email" type="email" required></div>
        <div class="field"><label for="password">Password</label><input id="password" type="password" required></div>
        <div id="login-error" class="error-text" style="display:none;"></div>
        <button class="btn btn-primary btn-block" type="submit">Sign in</button>
      </form>
      <p class="helper" style="margin-top:1rem;">Admin accounts are created in Firebase Authentication, then granted access by adding their UID to the <span class="mono">admins</span> collection in Firestore. See the README.</p>
    </div>
  `;
  document.getElementById("login-form").addEventListener("submit", async (e) => {
    e.preventDefault();
    const errorEl = document.getElementById("login-error");
    errorEl.style.display = "none";
    try {
      await signInWithEmailAndPassword(auth, document.getElementById("email").value, document.getElementById("password").value);
    } catch (err) {
      errorEl.textContent = "Sign-in failed. Check the email and password.";
      errorEl.style.display = "block";
    }
  });
}

// ==========================================================================
// Dashboard shell + tabs
// ==========================================================================
async function renderDashboard() {
  root.innerHTML = `
    <h1>Admin</h1>
    <div class="tab-bar">
      <button class="tab-btn active" data-tab="tournaments">Tournaments</button>
      <button class="tab-btn" data-tab="registrations">Registrations</button>
      <button class="tab-btn" data-tab="results">Results</button>
    </div>
    <div id="tab-content"></div>
  `;
  root.querySelectorAll(".tab-btn").forEach(btn => {
    btn.addEventListener("click", () => {
      root.querySelectorAll(".tab-btn").forEach(b => b.classList.remove("active"));
      btn.classList.add("active");
      showTab(btn.dataset.tab);
    });
  });
  await refreshTournaments();
  showTab("tournaments");
}

async function refreshTournaments() {
  const snap = await getDocs(query(collection(db, "tournaments"), orderBy("startTime", "desc")));
  tournamentsCache = snap.docs.map(d => ({ id: d.id, ...d.data() }));
}

function showTab(tab) {
  if (tab === "tournaments") renderTournamentsTab();
  if (tab === "registrations") renderRegistrationsTab();
  if (tab === "results") renderResultsTab();
}

// ==========================================================================
// Tournaments tab — create + manage
// ==========================================================================
function renderTournamentsTab() {
  const el = document.getElementById("tab-content");
  el.innerHTML = `
    <div class="panel">
      <h2>Open a new room</h2>
      <form id="create-form">
        <div class="field-row">
          <div class="field"><label for="name">Tournament name</label><input id="name" required maxlength="60"></div>
          <div class="field"><label for="mode">Mode</label>
            <select id="mode">
              <option value="solo">1 vs 1</option>
              <option value="duo">2 vs 2</option>
              <option value="squad">4 vs 4</option>
              <option value="custom">Custom room</option>
            </select>
          </div>
        </div>
        <div class="field-row">
          <div class="field" id="teamsize-field" style="display:none;">
            <label for="teamSize">Players per team</label><input id="teamSize" type="number" min="1" max="48" value="1">
          </div>
          <div class="field"><label for="maxSlots">Room capacity (players)</label><input id="maxSlots" type="number" min="2" max="48" value="48"></div>
        </div>
        <div class="field-row">
          <div class="field"><label for="startTime">Start time</label><input id="startTime" type="datetime-local" required></div>
          <div class="field"><label for="entryFee">Entry fee (₹, optional)</label><input id="entryFee" type="number" min="0"></div>
        </div>
        <div class="field"><label for="prizePool">Prize pool (₹, optional)</label><input id="prizePool" type="number" min="0"></div>
        <div class="field"><label for="rules">Rules / notes</label><textarea id="rules" rows="3" placeholder="Map, points system, ban list, etc."></textarea></div>
        <div id="create-error" class="error-text" style="display:none;"></div>
        <button class="btn btn-primary" type="submit">Create tournament</button>
      </form>
    </div>

    <h2>Manage tournaments</h2>
    <div id="tournament-table"></div>
  `;

  const modeSelect = document.getElementById("mode");
  const teamSizeField = document.getElementById("teamsize-field");
  modeSelect.addEventListener("change", () => {
    teamSizeField.style.display = modeSelect.value === "custom" ? "block" : "none";
  });

  document.getElementById("create-form").addEventListener("submit", createTournament);
  renderTournamentTable();
}

async function createTournament(e) {
  e.preventDefault();
  const errorEl = document.getElementById("create-error");
  errorEl.style.display = "none";
  const mode = document.getElementById("mode").value;
  const maxSlots = parseInt(document.getElementById("maxSlots").value, 10) || 48;
  const startTimeVal = document.getElementById("startTime").value;
  if (!startTimeVal) { errorEl.textContent = "Set a start time."; errorEl.style.display = "block"; return; }

  const data = {
    name: document.getElementById("name").value.trim(),
    mode,
    teamSize: mode === "custom" ? (parseInt(document.getElementById("teamSize").value, 10) || 1) : MODES[mode].teamSize,
    maxSlots,
    slotsFilled: 0,
    startTime: new Date(startTimeVal),
    entryFee: parseInt(document.getElementById("entryFee").value, 10) || 0,
    prizePool: parseInt(document.getElementById("prizePool").value, 10) || 0,
    rules: document.getElementById("rules").value.trim(),
    status: "upcoming",
    roomId: "",
    roomPassword: "",
    createdAt: serverTimestamp()
  };

  try {
    await addDoc(collection(db, "tournaments"), data);
    await refreshTournaments();
    renderTournamentsTab();
  } catch (err) {
    console.error(err);
    errorEl.textContent = "Couldn't create the tournament. " + err.message;
    errorEl.style.display = "block";
  }
}

function renderTournamentTable() {
  const el = document.getElementById("tournament-table");
  if (!tournamentsCache.length) {
    el.innerHTML = `<div class="empty-state"><div class="glyph">▦</div><p>No tournaments yet — create one above.</p></div>`;
    return;
  }
  el.innerHTML = `
    <table>
      <thead><tr><th>Name</th><th>Mode</th><th>Start</th><th>Slots</th><th>Status</th><th>Room</th><th></th></tr></thead>
      <tbody>
        ${tournamentsCache.map(t => `
          <tr>
            <td>${escapeHtml(t.name)}</td>
            <td>${modeLabel(t.mode)}</td>
            <td>${formatDateTime(t.startTime)}</td>
            <td class="mono">${t.slotsFilled || 0}/${t.maxSlots}</td>
            <td>${statusBadge(t.status).text}</td>
            <td>${t.roomId ? `<span class="mono">${escapeHtml(t.roomId)}</span>` : "—"}</td>
            <td class="row-actions">
              <button class="btn btn-ghost" data-action="edit" data-id="${t.id}">Edit</button>
              <button class="btn btn-danger" data-action="delete" data-id="${t.id}">Delete</button>
            </td>
          </tr>
        `).join("")}
      </tbody>
    </table>
  `;
  el.querySelectorAll("[data-action=edit]").forEach(b => b.addEventListener("click", () => openEditPanel(b.dataset.id)));
  el.querySelectorAll("[data-action=delete]").forEach(b => b.addEventListener("click", () => deleteTournament(b.dataset.id)));
}

function openEditPanel(id) {
  const t = tournamentsCache.find(x => x.id === id);
  if (!t) return;
  const existing = document.getElementById("edit-panel");
  if (existing) existing.remove();

  const panel = document.createElement("div");
  panel.className = "panel";
  panel.id = "edit-panel";
  panel.innerHTML = `
    <h3>Edit — ${escapeHtml(t.name)}</h3>
    <div class="field-row">
      <div class="field"><label>Status</label>
        <select id="edit-status">
          <option value="upcoming" ${t.status === "upcoming" ? "selected" : ""}>Upcoming</option>
          <option value="live" ${t.status === "live" ? "selected" : ""}>Live</option>
          <option value="completed" ${t.status === "completed" ? "selected" : ""}>Completed</option>
        </select>
      </div>
      <div class="field"><label>Room ID</label><input id="edit-roomid" value="${escapeHtml(t.roomId || "")}" placeholder="e.g. 123456789"></div>
    </div>
    <div class="field"><label>Room password</label><input id="edit-roompass" value="${escapeHtml(t.roomPassword || "")}"></div>
    <div class="row-actions">
      <button class="btn btn-primary" id="edit-save">Save changes</button>
      <button class="btn btn-ghost" id="edit-cancel">Cancel</button>
    </div>
  `;
  document.getElementById("create-form").closest(".panel").after(panel);

  document.getElementById("edit-cancel").addEventListener("click", () => panel.remove());
  document.getElementById("edit-save").addEventListener("click", async () => {
    await updateDoc(doc(db, "tournaments", id), {
      status: document.getElementById("edit-status").value,
      roomId: document.getElementById("edit-roomid").value.trim(),
      roomPassword: document.getElementById("edit-roompass").value.trim()
    });
    await refreshTournaments();
    renderTournamentsTab();
  });
}

async function deleteTournament(id) {
  if (!confirm("Delete this tournament? This can't be undone.")) return;
  await deleteDoc(doc(db, "tournaments", id));
  await refreshTournaments();
  renderTournamentsTab();
}

// ==========================================================================
// Registrations tab
// ==========================================================================
function renderRegistrationsTab() {
  const el = document.getElementById("tab-content");
  el.innerHTML = `
    <div class="field" style="max-width:400px;">
      <label for="reg-tournament-select">Tournament</label>
      <select id="reg-tournament-select">
        <option value="">Select a tournament…</option>
        ${tournamentsCache.map(t => `<option value="${t.id}">${escapeHtml(t.name)}</option>`).join("")}
      </select>
    </div>
    <div id="reg-table"></div>
  `;
  document.getElementById("reg-tournament-select").addEventListener("change", (e) => {
    if (e.target.value) loadRegistrations(e.target.value);
    else document.getElementById("reg-table").innerHTML = "";
  });
}

async function loadRegistrations(tournamentId) {
  const el = document.getElementById("reg-table");
  el.innerHTML = `<p class="helper">Loading…</p>`;
  const snap = await getDocs(query(collection(db, "tournaments", tournamentId, "registrations"), orderBy("slotNumber", "asc")));
  if (snap.empty) {
    el.innerHTML = `<div class="empty-state"><div class="glyph">▦</div><p>No registrations yet.</p></div>`;
    return;
  }
  const rows = snap.docs.map(d => ({ id: d.id, ...d.data() }));
  el.innerHTML = `
    <table>
      <thead><tr><th>#</th><th>Team / IGN</th><th>Players (UID)</th><th>Contact</th><th>Payment</th><th></th></tr></thead>
      <tbody>
        ${rows.map(r => `
          <tr>
            <td class="mono">${r.slotNumber}</td>
            <td>${escapeHtml(r.teamName)}</td>
            <td>${(r.players || []).map(p => `${escapeHtml(p.name)} <span class="mono">(${escapeHtml(p.uid)})</span>`).join(", ")}</td>
            <td>${escapeHtml(r.contactNumber)}</td>
            <td>${escapeHtml(r.paymentStatus || "—")}</td>
            <td class="row-actions">
              <button class="btn btn-danger" data-id="${r.id}">Remove</button>
            </td>
          </tr>
        `).join("")}
      </tbody>
    </table>
  `;
  el.querySelectorAll("button[data-id]").forEach(b => b.addEventListener("click", () => removeRegistration(tournamentId, b.dataset.id, rows)));
}

async function removeRegistration(tournamentId, regId, rows) {
  if (!confirm("Remove this registration and free its slot(s)?")) return;
  const reg = rows.find(r => r.id === regId);
  const t = tournamentsCache.find(x => x.id === tournamentId);
  await deleteDoc(doc(db, "tournaments", tournamentId, "registrations", regId));
  const freed = (reg?.players || []).length || 1;
  await updateDoc(doc(db, "tournaments", tournamentId), {
    slotsFilled: Math.max(0, (t?.slotsFilled || 0) - freed)
  });
  await refreshTournaments();
  loadRegistrations(tournamentId);
}

// ==========================================================================
// Results tab
// ==========================================================================
function renderResultsTab() {
  const el = document.getElementById("tab-content");
  el.innerHTML = `
    <div class="field" style="max-width:400px;">
      <label for="res-tournament-select">Tournament</label>
      <select id="res-tournament-select">
        <option value="">Select a tournament…</option>
        ${tournamentsCache.map(t => `<option value="${t.id}">${escapeHtml(t.name)}</option>`).join("")}
      </select>
    </div>
    <div id="res-form-area"></div>
  `;
  document.getElementById("res-tournament-select").addEventListener("change", (e) => {
    if (e.target.value) loadResultsForm(e.target.value);
    else document.getElementById("res-form-area").innerHTML = "";
  });
}

async function loadResultsForm(tournamentId) {
  const el = document.getElementById("res-form-area");
  el.innerHTML = `<p class="helper">Loading…</p>`;

  const [regSnap, resultSnap] = await Promise.all([
    getDocs(collection(db, "tournaments", tournamentId, "registrations")),
    getDocs(collection(db, "tournaments", tournamentId, "results"))
  ]);

  if (regSnap.empty) {
    el.innerHTML = `<div class="empty-state"><div class="glyph">▦</div><p>No registered teams to score yet.</p></div>`;
    return;
  }

  const existing = {};
  resultSnap.docs.forEach(d => { existing[d.id] = d.data(); });

  const teams = regSnap.docs.map(d => ({ id: d.id, ...d.data() }));

  el.innerHTML = `
    <div class="panel">
      <h3>Enter placements &amp; kills</h3>
      <p class="helper">Placement 1 = winner. Points are calculated automatically (placement points + 1 per kill) and shown on the tournament's public page.</p>
      <table>
        <thead><tr><th>Team</th><th>Placement</th><th>Kills</th></tr></thead>
        <tbody>
          ${teams.map(t => `
            <tr>
              <td>${escapeHtml(t.teamName)}</td>
              <td><input type="number" min="1" max="48" style="width:5rem;" id="place-${t.id}" value="${existing[t.id]?.placement ?? ""}"></td>
              <td><input type="number" min="0" style="width:5rem;" id="kills-${t.id}" value="${existing[t.id]?.kills ?? ""}"></td>
            </tr>
          `).join("")}
        </tbody>
      </table>
      <div id="res-error" class="error-text" style="display:none;"></div>
      <button class="btn btn-primary" id="save-results" style="margin-top:1rem;">Save results</button>
    </div>
  `;

  document.getElementById("save-results").addEventListener("click", async () => {
    const errorEl = document.getElementById("res-error");
    errorEl.style.display = "none";
    try {
      for (const t of teams) {
        const placement = parseInt(document.getElementById(`place-${t.id}`).value, 10);
        const kills = parseInt(document.getElementById(`kills-${t.id}`).value, 10) || 0;
        if (!placement) continue;
        await setResultDoc(tournamentId, t.id, t.teamName, placement, kills);
      }
      errorEl.style.display = "none";
      alert("Results saved.");
    } catch (err) {
      console.error(err);
      errorEl.textContent = "Couldn't save results. " + err.message;
      errorEl.style.display = "block";
    }
  });
}

async function setResultDoc(tournamentId, regId, teamName, placement, kills) {
  // Uses the registration's own ID as the result doc ID, so re-saving updates
  // the same row instead of creating duplicates.
  const ref = doc(db, "tournaments", tournamentId, "results", regId);
  const points = calcPoints(placement, kills);
  await setDoc(ref, { teamName, placement, kills, points });
}
