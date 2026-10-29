# Roadmap

Drafted October 29, 2026. Planning document only: nothing below is
implemented unless it says so. Related notes live in the ath-bot repo
(`SHEETS_SYNC.md`, `SHEETS_SYNC_STATUS.md`).

## Where the app stands today

**Hosting.** The site at pickle.nadabarkada.com is a Vite/React build served
by GitHub Pages. `.github/workflows/deploy.yml` builds and deploys on every
push to `main`. The live build (`version.json`: 0.14.1, built 2026-01-30)
matches `main` at PR #121 and calls the same Apps Script URL as
`src/config.js`.

**Backend.** `backend/google-apps-script/Code.gs`, pasted into the Apps
Script project bound to the sheet and deployed by hand (Deploy → Manage
deployments → New version). The repo copy matches the live editor except one
function name (`migrateUsersToLoginHash` vs `migrateUsersToLoginHash_`).

**What users can do now.**

| Area | Current behavior | Code |
| --- | --- | --- |
| Sign in | Phone/email + PIN; guests request access and get a magic link after admin approval | `AuthView.jsx`, `auth_*` in Code.gs |
| Calendar | Reservations filtered by role, visibility and allowlists; members/guests see only the next session unless allowlisted | `CalendarView.jsx`, `listReservations` |
| Sign up / cancel | "Sign up" writes Attendance rows with `Present=1`; cancel sets `Present=0`. Warning plus a text-Jay link within 30 hours of start | `ReservationDrawer.jsx`, `signup_`, `unrsvp_` |
| Pay | Venmo button with amount and note prefilled: `Pickleball {Date} {Start}`. Payment is not recorded; an admin marks PAID | `ReservationDrawer.jsx`, `markPaid_` |
| Personal report | **Every user** has a Reports button showing their own charges, paid, balance and plays, grouped by session. Presets: today, week, month, 30 days, custom range. Admins can pick any user | `ReviewReports.jsx`, `reportSummary_` |
| Admin report | Totals, by-user and by-reservation tables, ledger, sorting | `AdminPanel.jsx`, `adminReport_` |

**Gaps found during the October 29 Venmo reconciliation.**

- **"Check-in" is really an RSVP.** `Present=1` is set at sign-up, before the
  session. Nothing records who actually showed up, and the admin report's
  "check-ins" count RSVPs.
- **Sessions are missing from Attendance.** 4/1, 4/8 and 4/12 have
  reservations but no attendance rows. 4/16–18, 5/27, 5/31, 6/20, the 6/28
  tournament, 9/16 and 10/14 had Venmo payments but no reservation at all.
  Some regular players (for example Richard and Nick) pay almost weekly but
  rarely appear in Attendance.
- **PAID was not maintained from March to October.** Personal reports showed
  large false balances until PAID was backfilled from Venmo statements on
  October 29 (170 rows marked).
- **Venmo notes are inconsistent** when people pay outside the app button:
  missing dates, wrong dates, several sessions in one note.
- **Venmo names don't match sheet names** (Marvin Mangahis → Marv). The Users
  tab has a `Venmo` column, but it is not filled in.
- **Partial payments** can't be recorded as "partial" by `markPaid_`, which
  sets PAID to the full charge or 0.

## Plan

Steps are in suggested order. Step 5 (check-in) improves the data that steps
2–4 depend on, so it may be worth doing earlier.

### 1. Bot → schedule

Design and decisions: ath-bot `SHEETS_SYNC.md`; open questions:
`SHEETS_SYNC_STATUS.md`.

- New Apps Script action `botaddreservation`, authenticated with a shared
  secret, idempotent on Date + Start + Court.
- One `Both` row when both courts are booked (as done by hand for 11/4,
  reservation 76).
- Bot calls it after a confirmed booking; a sheet failure never affects the
  booking.

### 2. Venmo → PAID, automatically

Turn the October 29 one-off reconciliation into a scheduled job.

- **Source:** Venmo notification emails. Simplest if Venmo's account email is
  changed to the Gmail account; an unattended job then needs its own Gmail
  access (Gmail API credentials, or Apps Script reading the inbox of the
  account that owns the script). Alternatives: Yahoo over IMAP with an app
  password, or Apple Mail on the Mac.
- **Matching:** fill in `Users.Venmo` with each person's Venmo display name or
  handle; match on that instead of guessing. Parse the session date from the
  note; the app's prefilled note format matches reliably.
- **Write:** new action (for example `botmarkpaid`) using the same shared
  secret as step 1. Marks rows by sheetRow, never unmarks, logs what it
  changed.
- **Unmatched payments** go to a review list instead of being guessed.
- **App side:** make paying through the app the easy path (see step 3), so
  notes stay machine-readable.

### 3. Better reports

Personal report (`ReviewReports.jsx`):

- Add **All time** and **This year** presets. The default 30 days hides old
  balances.
- **Pay balance** button: Venmo link prefilled with the outstanding amount
  and a note listing the session dates.
- Show the sessions you're signed up for next, not only past ones.
- Explain what's counted (proposed sessions excluded, canceled sessions
  become credit).

Admin report (`AdminPanel.jsx`):

- **Who owes what** list, sorted by balance, with a copy/text reminder per
  person.
- **Data-quality warnings:** reserved sessions with no attendance; paid
  sessions not on the calendar (from step 2); Charge values that don't match
  the reservation's fee.
- Distinguish RSVPs from actual check-ins once step 5 exists.

### 4. Monthly statement email

- Apps Script time-driven trigger on the 1st of each month.
- For each active user with activity or a balance: last month's sessions,
  charges, payments, running balance, and a Venmo pay link. Reuses
  `reportSummary_`.
- Sent with `MailApp` from the script owner's account. About 35 users is well
  within the daily quota.
- Opt-out flag in Users; skip users with no email.
- Test by sending every statement to the admin first.

### 5. Check-in at the courts

- A sign at each court with a QR code linking to
  `pickle.nadabarkada.com/?checkin=today` (or `?checkin=<reservationId>`).
- Opening it shows today's session with **I'm here** for anyone signed up,
  and **Join** for walk-ins if capacity allows.
- Records an actual check-in (new Attendance column such as `CheckedInAt`)
  separate from the RSVP.
- Sign-in friction: users stay signed in for 30 days today; a first-timer
  needs the PIN or a magic link. Consider letting an admin check people in
  from their phone as a fallback.
- Afterwards, the admin report can flag RSVP no-shows and walk-ins.

## Open questions

1. **Charging rule:** should people be charged for RSVPs or for actual
   check-ins once step 5 exists?
2. **Unrecorded sessions:** should the 4/1, 4/8, 4/12 and the other paid
   off-calendar sessions be added to the sheet for history, or left alone?
3. **Venmo email:** move Venmo notifications to Gmail, or keep Yahoo?
4. **Users.Venmo:** OK to fill it in from the October statements (names
   matched by hand on October 29)?
5. **Statement emails:** who receives them (members only, or guests too), and
   from which account?
6. **Signs:** one QR per court or one for the whole venue? Does the
   Athenaeum allow signage?
