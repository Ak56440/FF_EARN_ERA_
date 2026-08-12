import { db, doc, getDoc, collection, runTransaction, serverTimestamp } from "./firebase-init.js";
import { modeLabel, teamSizeFor, escapeHtml, UPI_ID } from "./utils.js";

const root = document.getElementById("page-root");
const id = new URLSearchParams(window.location.search).get("id");

async function load() {
  if (!id) { root.innerHTML = `<p class="error-text">No tournament specified.</p>`; return; }
  const snap = await getDoc(doc(db, "tournaments", id));
  if (!snap.exists()) { root.innerHTML = `<p class="error-text">Tournament not found.</p>`; return; }
  const t = { id: snap.id, ...snap.data() };

  if (t.status !== "upcoming") {
    root.innerHTML = `<p class="error-text">Registration is closed for this tournament.</p>`;
    return;
  }
  const full = (t.slotsFilled || 0) >= (t.maxSlots || 48);
  if (full) {
    root.innerHTML = `<p class="error-text">This room is already full.</p>`;
    return;
  }

  renderForm(t);
}

function renderForm(t) {
  const size = teamSizeFor(t);
  const remaining = (t.maxSlots || 48) - (t.slotsFilled || 0);
  const hasFee = (t.entryFee || 0) > 0;
  const upiLink = `upi://pay?pa=${encodeURIComponent(UPI_ID)}&pn=${encodeURIComponent("Zone Ledger")}&am=${t.entryFee}&cu=INR&tn=${encodeURIComponent(t.name)}`;
  const qrUrl = `https://api.qrserver.com/v1/create-qr-code/?size=220x220&data=${encodeURIComponent(upiLink)}`;

  root.innerHTML = `
    <div class="eyebrow" style="font-family:var(--font-mono);color:var(--zone);font-size:0.8rem;">${modeLabel(t.mode)}</div>
    <h1>Register — ${escapeHtml(t.name)}</h1>
    <p class="lead">${remaining} of ${t.maxSlots || 48} player slots remaining.</p>

    ${hasFee ? `
    <div class="panel" style="margin-bottom:1.5rem;">
      <h3 style="margin-top:0;">Pay entry fee — ₹${t.entryFee}</h3>
      <p class="helper">Scan the QR or pay to the UPI ID below, then enter the transaction/reference ID from your payment app so we can confirm it.</p>
      <div style="display:flex;gap:1.25rem;align-items:center;flex-wrap:wrap;">
        <img src="${qrUrl}" alt="UPI QR code" width="160" height="160" style="border-radius:8px;background:#fff;padding:6px;">
        <div>
          <div class="field" style="margin-bottom:0.5rem;">
            <label>UPI ID</label>
            <div class="mono" style="font-size:1.05rem;">${escapeHtml(UPI_ID)}</div>
          </div>
          <div class="field" style="margin-bottom:0;">
            <label>Amount</label>
            <div class="mono" style="font-size:1.05rem;">₹${t.entryFee}</div>
          </div>
        </div>
      </div>
    </div>
    ` : ""}

    <form id="reg-form">
      <div class="field">
        <label for="teamName">${size > 1 ? "Team name" : "In-game name"}</label>
        <input id="teamName" required maxlength="40" placeholder="${size > 1 ? "e.g. Ember Squad" : "e.g. ShadowStriker"}">
      </div>
      <div class="field">
        <label for="contact">Contact number (WhatsApp preferred)</label>
        <input id="contact" required maxlength="20" placeholder="e.g. 98765 43210">
      </div>
      ${hasFee ? `
      <div class="field">
        <label for="upiTxnId">UPI transaction / reference ID</label>
        <input id="upiTxnId" required maxlength="60" placeholder="e.g. 123456789012">
      </div>
      ` : ""}

      <div id="players"></div>

      <div id="form-error" class="error-text" style="display:none;"></div>
      <button type="submit" class="btn btn-primary btn-block">Confirm registration</button>
    </form>
  `;

  const playersEl = document.getElementById("players");
  for (let i = 1; i <= size; i++) {
    const block = document.createElement("div");
    block.className = "player-block";
    block.innerHTML = `
      <h4>Player ${i}${size > 1 ? "" : ""}</h4>
      <div class="field-row">
        <div class="field">
          <label for="p${i}name">Player name</label>
          <input id="p${i}name" required maxlength="30">
        </div>
        <div class="field">
          <label for="p${i}uid">Free Fire UID</label>
          <input id="p${i}uid" required maxlength="15" inputmode="numeric" pattern="[0-9]*">
        </div>
      </div>
    `;
    playersEl.appendChild(block);
  }

  document.getElementById("reg-form").addEventListener("submit", (e) => submit(e, t, size));
}

async function submit(e, t, size) {
  e.preventDefault();
  const errorEl = document.getElementById("form-error");
  errorEl.style.display = "none";
  const submitBtn = e.target.querySelector("button[type=submit]");

  const teamName = document.getElementById("teamName").value.trim();
  const contactNumber = document.getElementById("contact").value.trim();
  const hasFee = (t.entryFee || 0) > 0;
  const upiTxnId = hasFee ? document.getElementById("upiTxnId").value.trim() : "";
  if (hasFee && !upiTxnId) { showError("Enter your UPI transaction ID so we can confirm payment."); return; }
  const players = [];
  for (let i = 1; i <= size; i++) {
    const name = document.getElementById(`p${i}name`).value.trim();
    const uid = document.getElementById(`p${i}uid`).value.trim();
    if (!name || !uid) { showError("Fill in every player's name and UID."); return; }
    players.push({ name, uid });
  }
  if (!teamName || !contactNumber) { showError("Fill in all required fields."); return; }

  submitBtn.disabled = true;
  submitBtn.textContent = "Submitting…";

  try {
    await runTransaction(db, async (tx) => {
      const tRef = doc(db, "tournaments", t.id);
      const tSnap = await tx.get(tRef);
      if (!tSnap.exists()) throw new Error("Tournament no longer exists.");
      const data = tSnap.data();
      const newFilled = (data.slotsFilled || 0) + size;
      if (newFilled > (data.maxSlots || 48)) {
        throw new Error("Not enough slots left for your full team. Try a smaller room or contact the admin.");
      }
      const regRef = doc(collection(db, "tournaments", t.id, "registrations"));
      tx.set(regRef, {
        teamName, contactNumber, players,
        slotNumber: (data.slotsFilled || 0) + 1,
        paymentStatus: data.entryFee ? "pending" : "not_required",
        upiTxnId: upiTxnId || null,
        registeredAt: serverTimestamp()
      });
      tx.update(tRef, { slotsFilled: newFilled });
    });

    root.innerHTML = `
      <div class="success-box">
        <h3 style="color:var(--zone);">You're in.</h3>
        <p style="color:var(--zone);opacity:0.85;">Your slot is booked for <strong>${escapeHtml(t.name)}</strong>. ${hasFee ? "We'll confirm your payment shortly using the transaction ID you provided. " : ""}Room ID and password will appear on the tournament page shortly before start — save the link below.</p>
      </div>
      <p style="margin-top:1rem;"><a href="tournament.html?id=${t.id}">← Back to tournament page</a></p>
    `;
  } catch (err) {
    console.error(err);
    showError(err.message || "Something went wrong. Please try again.");
    submitBtn.disabled = false;
    submitBtn.textContent = "Confirm registration";
  }

  function showError(msg) {
    errorEl.textContent = msg;
    errorEl.style.display = "block";
    submitBtn.disabled = false;
    submitBtn.textContent = "Confirm registration";
  }
}

load();
