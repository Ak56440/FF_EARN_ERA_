# Zone Ledger — Free Fire Tournament Hub

A static site (no build step) for running Free Fire custom-room tournaments:
1v1, 2v2, 4v4, or a full 48-player custom room. Players see live slot counts
and a countdown, register themselves, and get the room ID/password once the
admin opens the lobby. Admins create rooms, manage registrations, and post
placement/kill results from a login-protected dashboard.

Built with plain HTML/CSS/JS + the Firebase Firestore/Auth SDKs loaded from
a CDN — so you can host it for free on GitHub Pages with zero build tooling.

## What's in the repo

```
index.html         Home page — lists tournaments, filterable by mode
tournament.html     Tournament detail — slots, countdown, room reveal, leaderboard
register.html        Registration form (player names + Free Fire UIDs)
admin.html            Admin login + dashboard
css/style.css          All styling
js/firebase-config.js   ← put your Firebase project keys here
js/firebase-init.js       Boots Firebase, shared by every page
js/utils.js                 Shared helpers (dates, modes, scoring)
js/home.js, tournament.js, register.js, admin.js   Page-specific logic
firestore.rules              Security rules — deploy these to Firebase
```

## 1. Create a Firebase project

1. Go to [console.firebase.google.com](https://console.firebase.google.com) → **Add project** → follow the prompts (Google Analytics is optional, skip it if you want).
2. In the left sidebar: **Build → Firestore Database → Create database**. Choose a region close to your players, start in **production mode**.
3. In the left sidebar: **Build → Authentication → Get started**. Enable the **Email/Password** sign-in method — this is how you'll log into the admin dashboard.
4. In the left sidebar: **Project settings** (gear icon) → scroll to **Your apps** → click the **</>** (Web) icon → register the app (any nickname) → you don't need Firebase Hosting for this step.
5. Firebase shows you a `firebaseConfig` object. Copy those values into `js/firebase-config.js` in this repo, replacing the placeholders.

## 2. Deploy the security rules

The rules in `firestore.rules` control who can read/write what:
- Anyone can **read** tournaments and results (so the public site works).
- Anyone can **create** a registration (so people can sign themselves up) and bump the tournament's `slotsFilled` counter — but only upward, and never past capacity.
- Only accounts listed in the `admins` collection can create/edit/delete tournaments, edit registrations, or post results.

To deploy them:
1. Install the Firebase CLI once: `npm install -g firebase-tools`
2. In this project folder: `firebase login`, then `firebase init firestore` (choose your project, keep the default file name `firestore.rules`, say no to overwriting it).
3. Deploy: `firebase deploy --only firestore:rules`

(Alternatively, paste the contents of `firestore.rules` directly into **Firestore Database → Rules** in the Firebase console and click Publish — no CLI needed.)

## 3. Create your admin account

1. In the Firebase console: **Authentication → Users → Add user**. Enter the email/password you'll use to log into `admin.html`.
2. Copy that user's **UID** (shown in the users list).
3. Go to **Firestore Database → Start collection** → collection ID `admins` → document ID = paste the UID you copied → add any field (e.g. `role: "admin"`) → Save.

Now that account can sign in at `admin.html` and manage tournaments. Repeat step 3 for any co-admin.

## 4. Run it locally

Because this uses ES modules (`type="module"`), opening `index.html` directly from disk (`file://`) will be blocked by the browser. Serve it locally instead, e.g.:

```bash
npx serve .
# or
python3 -m http.server 8000
```

Then open the printed `localhost` URL.

## 5. Put it on GitHub and host it for free

```bash
git init
git add .
git commit -m "Zone Ledger tournament hub"
git branch -M main
git remote add origin https://github.com/YOUR_USERNAME/YOUR_REPO.git
git push -u origin main
```

Then, in the GitHub repo: **Settings → Pages → Source → Deploy from a branch → `main` / `/ (root)` → Save**. GitHub gives you a live URL a minute or two later (something like `https://YOUR_USERNAME.github.io/YOUR_REPO/`).

Since `js/firebase-config.js` only contains your project's public identifiers (not secrets), it's fine to commit and push as-is — real protection comes from `firestore.rules`, not from hiding this file.

## How a tournament flows

1. **Admin tab → Tournaments**: create a room — name, mode (1v1/2v2/4v4/custom), capacity, start time, optional entry fee and prize pool.
2. Players find it on the homepage, open it, and hit **Register**. The form adapts to team size automatically (1 field for 1v1, up to 4 for squad, whatever you set for a custom room).
3. Shortly before start, the admin edits the tournament (**Tournaments tab → Edit**), sets **Status → Live** and fills in **Room ID / Password** — this instantly appears on the public tournament page.
4. After the match, the admin opens **Results**, picks the tournament, and enters each team's placement and kill count. Points (placement points + 1 per kill) are calculated automatically and shown on the public leaderboard once status is set to **Completed**.
5. **Admin tab → Registrations** lets you review who signed up for any tournament, or remove an entry (its slot is freed automatically).

## Notes and things you may want to extend

- **Payments**: `entryFee` is stored per tournament and each registration gets a `paymentStatus` field, but there's no payment gateway wired up — you'd confirm payment manually (e.g. over UPI/WhatsApp) and could add a "mark as paid" button in the admin Registrations view.
- **Registration privacy**: registration documents (names, UIDs, phone numbers) are only readable by admins, not by the public — the homepage/tournament page only shows an aggregate slot count.
- **Slot counting trust model**: to keep this a no-backend static site, the security rules let anyone increment `slotsFilled` by exactly their team size (and never past capacity) when they register. This is simple and good enough for community tournaments, but a determined user could theoretically spam registrations. For stricter control, move registration through a Firebase Cloud Function instead of writing to Firestore directly from the browser.
- **Notifications**: there's no SMS/WhatsApp/email reminder system built in. You could add one with a Cloud Function that watches for tournaments starting soon.
