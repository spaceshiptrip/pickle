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

## Data Model (Google Sheet)

Uses your existing columns in the `Attendance` tab:

```text
Date | Hours | Player Name | Present (1/0) | Charge (auto) | PAID
```

- Rows are appended directly by the backend Apps Script
- Existing formulas, pivots, and reports continue to work unchanged

---

## Features

- ✅ Web-based check-in (mobile friendly)
- ✅ Optional payment tracking
- ✅ Writes rows directly into `Attendance`
- ✅ Organizer-only admin view
- ✅ Admin summary:
  - Total players
  - Players paid
  - Total collected
- ✅ Copy buttons:
  - Copy **total amount** a player is about to pay
  - Copy **total collected** for a session (useful for Venmo / records)
- ✅ Magic-link + PIN-based authentication (no accounts/passwords)
- ✅ Light/Dark mode toggle (defaults to **light**)
- ✅ Build/version identifier displayed in UI
- ✅ GitHub Actions workflow to auto-deploy to GitHub Pages

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

---

See the repository for full setup, deployment, and usage instructions.
