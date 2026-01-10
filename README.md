# Pickleball Check-In App

Simple web app for checking in players and tracking payments into your existing
**Caltech Picklers** Google Sheet.

- Frontend: React (Vite)
- Backend: Google Apps Script writing into your Google Sheet
- Data lives entirely in Sheets (no custom DB)

---

## Overview

This app allows players to check in for pickleball sessions, optionally mark themselves (or others) as paid, and provides organizers with an admin view to track attendance and payments — all backed by a Google Sheet you already use.

---

## Features

- Web-based check-in (mobile friendly)
- Optional payment tracking
- Writes rows directly into `Attendance`
- Organizer-only admin view
- Admin summary:
  - Total players
  - Players paid
  - Total collected
- Copy buttons:
  - Copy **total amount** a player is about to pay
  - Copy **total collected** for a session (useful for Venmo / records)
- Magic-link + PIN-based authentication (no accounts/passwords)
- Light/Dark mode toggle (defaults to **light**)
- Build/version identifier displayed in UI
- GitHub Actions workflow to auto-deploy to GitHub Pages

---

## Project Structure

```text
.
├── backend
│   └── google-apps-script
│       └── Code.gs       # The backend logic that runs on Google Apps Script
├── public                # Static assets
├── scripts               # Build/utility scripts
└── src
    ├── components        # React components
    ├── styles            # CSS files
    ├── utils             # Helper functions
    ├── App.jsx           # Main application component
    └── config.js         # App configuration (URLs, Venmo, etc.)
```

---

## Prerequisites

- **Node.js**: (v18 or higher recommended)
- **npm**: (comes with Node.js)

---

## Installation & Local Development

1. **Clone the repository:**
   ```bash
   git clone git@github.com:spaceshiptrip/pickle.git
   cd checkin-app
   ```

2. **Install dependencies:**
   ```bash
   npm install
   ```

3. **Start the development server:**
   ```bash
   npm run dev
   ```
   The app will run locally at `http://localhost:5173`.

4. **Build for production:**
   ```bash
   npm run build
   ```
   Output will be in the `dist` directory.

---

## Configuration

Crucial settings are managed in `src/config.js`. You may need to update these values for your own deployment:

- `APP_SCRIPT_URL`: The Web App URL of your deployed Google Apps Script (backend).
- `VENMO_HANDLE`: The Venmo handle displayed to users.
- `VENMO_URL`: Full link to the Venmo profile.
- `JAY_PHONE_E164`: Admin contact phone number.

---

## Backend Setup (Google Apps Script)

The backend is a simple Google Apps Script that acts as an API for your Google Sheet.

1. **Open your Google Sheet** (or create a new one).
2. Go to **Extensions** > **Apps Script**.
3. Copy the content of `backend/google-apps-script/Code.gs` from this repository.
4. Paste it into the script editor, replacing any existing code.
5. **Save** the project.
6. **Deploy as Web App**:
   - Click **Deploy** > **New deployment**.
   - Select type: **Web app**.
   - Description: "v1" (or similar).
   - Execute as: **Me** (your email).
   - Who has access: **Anyone** (allows the frontend to call it without auth prompt).
   - Click **Deploy**.
7. **Copy the Web App URL** and update `APP_SCRIPT_URL` in `src/config.js`.

---

## Data Model (Google Sheet)

Uses your existing columns in the `Attendance` tab:

```text
Date | Hours | Player Name | Present (1/0) | Charge (auto) | PAID
```

- Rows are appended directly by the backend Apps Script
- Existing formulas, pivots, and reports continue to work unchanged

---

## Build Versioning

Each build generates a version file at build time:

```text
public/version.json
```

Example:

```json
{
  "version": "0.4.0",
  "build": "20260108150244",
  "generatedAt": "2026-01-08T23:02:44.123Z"
}
```

The version is displayed subtly on the login screen to help identify deployed builds.
