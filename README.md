# Pickleball Check-In App

Simple web app for checking in players and tracking payments into your existing
**Caltech Picklers** Google Sheet.

- Frontend: React (Vite)
- Backend: Google Apps Script writing into your `Attendance` tab
- Uses your existing columns:

  ```text
  Date | Hours | Player Name | Present (1/0) | Charge (auto) | PAID
  ```

- Features:
  - ✅ Web check-in + optional payment
  - ✅ Writes rows directly into `Attendance`
  - ✅ Organizer-only admin view (second access code)
  - ✅ Admin summary: total players, players paid, total collected
  - ✅ Copy buttons:
    - Copy the **total amount** a player is about to pay
    - Copy the **total collected** for a session (for Venmo / records)
  - ✅ GitHub Actions workflow to auto-deploy to GitHub Pages

---

## 1. Google Sheet Setup (once)

1. Open your existing Google Sheet for Caltech Picklers.
2. Confirm you have an `Attendance` tab with this header row in row 1:

   ```text
   Date | Hours | Player Name | Present (1/0) | Charge (auto) | PAID
   ```

3. If the tab name is different, note it; you can change it in `Code.gs`.

---

## 2. Add the Apps Script Backend

1. In the Google Sheet, go to **Extensions → Apps Script**.
2. Delete any starter code.
3. In this project, open:

   ```
   backend/google-apps-script/Code.gs
   ```

   and paste the entire contents into the Script Editor.

4. At the top of `Code.gs`, adjust if needed:

   ```js
   var ATTENDANCE_SHEET_NAME = 'Attendance'; // change if your tab name differs
   var DEFAULT_HOURS = 2;                    // change to 1 or another default
   ```

5. Click **Deploy → New deployment → Web app**:
   - **Execute as:** *Me*
   - **Who has access:** *Anyone with the link*
6. Click **Deploy**, then copy the **Web app URL** (ends in `/exec`).

You'll paste this into the frontend config next.

---

## 3. Configure the React App (player code, organizer code, Venmo)

In `src/config.js`, set:

```js
export const APP_SCRIPT_URL = 'https://script.google.com/macros/s/REPLACE_ME/exec';

// Player access code (for regular players):
export const ACCESS_CODE = 'playercode';

// Organizer access code (unlocks admin view and summaries):
export const ORGANIZER_CODE = 'organizercode';

export const DEFAULT_AMOUNT = 5; // typical total payment per check-in
export const VENMO_URL = 'https://venmo.com/your-handle'; // your Venmo link
```

- Replace `APP_SCRIPT_URL` with the Web App URL from Apps Script.
- Pick a simple `ACCESS_CODE` for players (e.g., "pb2025").
- Pick a separate `ORGANIZER_CODE` that only you (and co-organizers) know.
- Adjust `DEFAULT_AMOUNT` if needed.
- Set `VENMO_URL` to your actual Venmo profile or payment link.

---

## 4. Run Locally (sanity check)

```bash
npm install
npm run dev
```

Open the printed `http://localhost:5173` URL.

### Player flow (using ACCESS_CODE)

1. Enter **name** and the **player access code**.
2. Choose a **date** (defaults to today).
3. Optionally add other players.
4. Optionally check **"Mark as paid"** and set a **total amount**.
5. Use the **Copy** button next to the amount if they want that number on their clipboard.
6. Click **Submit Check-In**.
7. Click **Open Venmo to Pay** to jump to your Venmo URL.

The app writes rows into `Attendance`:

```text
Date | Hours | Player Name | Present (1/0) | Charge (auto) | PAID
```

- Per-player charge is `total amount / number of players` for that submission.

### Organizer flow (using ORGANIZER_CODE)

1. Enter **name** and the **organizer code**.
2. You see a small **"Organizer" badge** next to your name.
3. Scroll down to the admin card:
   - Uses the same date field as the check-in form.
   - Click **"Refresh list"** to load that date's rows from `Attendance`.

In the admin card you get:

- **Summary box**:
  - Total players
  - Players marked paid
  - Total collected (sum of Charge)
  - Button **"Copy total for Venmo"** (copies total collected to clipboard)
- **Table** of individual rows:
  - Player, Paid?, Charge, Hours

---

## 5. Prepare the GitHub Repository

1. Create a new repo on GitHub, e.g. `pickleball-checkin`, without initializing it.
2. On your machine:
   - Unzip this project.
   - `cd` into `checkin-app`.

3. Initialize and push:

   ```bash
   git init
   git add .
   git commit -m "Initial pickleball check-in app"
   git branch -M main
   git remote add origin git@github.com:YOUR_USER/pickleball-checkin.git
   git push -u origin main
   ```

   Replace `YOUR_USER` with your GitHub username.

---

## 6. Enable GitHub Pages (auto-deploy)

This project already includes a GitHub Actions workflow:

```text
.github/workflows/deploy.yml
```

It will:

- Build the app (`npm run build` → `dist/`)
- Deploy `dist/` to GitHub Pages

**One-time setup:**

1. Go to your repo on GitHub.
2. Click **Settings → Pages**.
3. Under **Source**, select **GitHub Actions**.
4. Save.

Now, every time you push to `main`:

- The **Deploy Vite app to GitHub Pages** workflow runs in the **Actions** tab.
- When it finishes, it provides a URL like:

  ```text
  https://YOUR_USER.github.io/pickleball-checkin/
  ```

That URL is your live check-in website.

---

## 7. Daily Use Summary

- **Players** use the **player code**:
  - Check in, optionally mark paid, optionally copy their amount, then hit your Venmo link.

- **Organizers** use the **organizer code**:
  - Do everything a player can do **plus**:
    - See the admin summary and table.
    - Copy total collected for that date (handy for Venmo, reconciling with the venue, etc.).

All data is stored in your existing `Attendance` sheet so your current cost tracking
formulas and pivots can keep working.

