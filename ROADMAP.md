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

## Sprint (November 22-28, 2026)

Codex codes (ChatGPT plan); Claude writes jobs, reviews, runs the browser.
Claude usage: 65% used, resets Thu 11/26; one free reset expires Dec 10
(plan it for the UI/reports week).

1. [ ] Sun 11/22: Jay says who played -> Attendance rows (unpaid by default),
   payment check, bot reminder texts (preview -> Jay says "send").
2. [ ] Mac mini prep (deadline Nov 29, between the Tue and Sat runs): launchd
   install script with repo-relative paths; drop the bare "confirmed" marker.
3. [ ] You and Cora auto-paid (small Codex job).
3b. [ ] PRIORITY (Jay, 2026-11-22): a "Pay" button players can find without
   hunting: on the home screen / personal report, showing what they owe and
   opening Venmo with the right note. Today they must tap the session date on
   the calendar, then Pay. After-game texts will point to it.
4. [ ] Athenaeum walkthrough (~30 min, Jay signs in, observe only) -> Codex
   builds book / cancel / my_reservations / club_events tools.
5. [ ] Auto-cancel South (#129), after the cancel tool.
6. [ ] App speed: measure request timings, then cache (stale-while-revalidate,
   one bootstrap call, CacheService, lazy-load admin/calendar).
7. [ ] Reports redesign + running balance (#130); quick wins #110 #22 #44 #19 #103.

8. [ ] Club billing in the sheet + monthly reconciliation (Jay, 2026-11-22).
   - New tab ClubBilling: Date, Tracking, Description, Hours, Amount, Kind
     (court/openplay/payment/other), ReservationId (matched), Status (ok/mismatch).
   - ath-bot reads the Athenaeum statement (Recent Transactions + monthly
     statements on secure.clubessential.com, read-only) every 2 weeks via launchd,
     appends new lines (dedupe by Tracking #), matches court lines to Reservations.
     Rate seen: $17 per court-hour (Prime); Open Play $10.
   - The club bill is the source of truth (Jay): courts cancelled or added
     by hand may not be in the app. Rates differ by hour (Prime vs non-Prime,
     lights at night), so match on the line's hours/description, not a fixed rate.
   - Mismatches (billed hours vs booked courts x hours) -> ask Jay, then fix the
     sheet's reservation to match the bill.
     Nov 2026 to check: 11/4 1h, 11/8 2h, 11/15 1h billed.
   - Admin "Monthly" view (UI/UX refresh): club billed vs collected from players
     vs open balances, per month; mark a month reconciled.
   - Site notes: ath-bot handoff/notes/athenaeum-site-2026-11-22.md.

9. [ ] Game reminder texts (Jay, 2026-11-22; iterate on wording first):
   2 days before and the morning of each upcoming session, text the group
   list, filtered by membership status (member, JPL, JPL Plus, ...).
   Same bot tool (preview -> Jay says "send"), later a scheduled run.
   Needs: a status/group column in Users we can filter on.
   Unsubscribe (Jay, 2026-11-22): game-reminder texts end with "Reply STOP
   GAMES to stop game reminders." Users.GameReminders = off -> no game
   reminders. After-game thanks/paid texts and billing texts are NOT
   affected (no opt-out). Replies land in Jay's Messages: v1 Jay tells Claude
   and Claude sets the column; v2 the bot reads replies (needs Messages
   access on the Mac) or a toggle in the app.
10. [ ] After-game texts (in progress): everyone who played gets "thanks +
   paid / not yet paid"; two fixed templates; replaces the unpaid-only
   template in pickleball-ops send tool. Wording agreed 2026-11-22 (paid /
   not paid, "Hi <name>", app link first, then "text Jay at 818-653-9874").
10b. [ ] Payment-received text (Jay OK 2026-11-22): a launchd job on the Mac
   every 10 min reads newly paid rows (VenmoLog done) and texts "Got your $X
   for <Day>, thank you! You're marked PAID." (fixed template, SMS/iMessage by
   Users.TextVia). Jay OKs the first sends, then it runs on its own.
11. [ ] Users "FirstName" column for texts ("Hi Joe!" not "Hi JoeO!"); fall
   back to Name when blank. Fill in the ones we know.

Before Thursday: 1-3 (+4 if short). After the reset: 5-8.

## TODO (November 20, 2026)

Done Nov 20: Venmo -> PAID live (Apps Script timer every 10 min, VenmoLog,
Users.VenmoName), admin "Venmo to review" screen + review email (web app v34),
history catch-up (paid-but-not-RSVPed rows Dec-Nov, 9 missing sessions added),
"Paid updates within ~10 min" notice, pickleball-ops MCP (status, codex_apply,
codex_task) in ath-bot/ops/mcp.

1. [ ] Sat 11/21 23:55 bot run for Sun 11/29: check result Sunday via
   pickleball-ops status. No bot changes before it.
2. [ ] Sat 11/21 4 PM walkthrough (Jay signs in to the Athenaeum site in the
   browser pane; observe only, never submit): cancel page, My Reservations,
   events calendar.
3. [ ] pickleball-ops tools (Codex job after the walkthrough), each audited:
   - cancel(date, court|both) and book(date, time, courts): Jay's yes in chat
     before each; Athenaeum result + sheet update (Both -> remaining court,
     capacity 14 -> 8; both canceled -> Status canceled; book merges into Both).
   - my_reservations() and club_events(from, to): read-only.
   - Bot credentials stay in ath-bot .env on the Mac; never in chat.
4. [ ] UI/UX look-through (same sitting as 2): Jay signs in to the app in the
   browser pane; Claude reviews every screen at phone size and ranks issues;
   Jay picks top 3-5 -> small Codex jobs. Reuse the existing Fable design
   tokens from training_sheet/docs/design/fable_2026-11-16 ($0). Fold in:
   "Pay my balance" button, All time / This year report presets, upcoming
   sessions in the personal report.
5. [ ] Mac mini prep before Nov 29 (after the Sat run):
   - launchd install script with repo-relative paths (one command on the new Mac).
   - Bot success check: drop the bare "confirmed" marker (false-win risk).
   - Move order: bot + pickleball-ops together; run on one machine only.
6. [ ] Venmo follow-ups: watch the first real live payment in VenmoLog;
   one payment covering two sessions can only be assigned to one (split by
   hand for now); times for 4/16 and 4/18 sessions (blank = hidden on calendar).
7. [ ] Later: QR check-in at the courts, monthly statement email, iMessage
   group text for bot results.
8. [ ] Low priority: club events without Playwright. The calendar list view
   (https://www.athenaeumcaltech.com/Default.aspx?p=v35Calendar&view=l3&tab=l5&ssid=295099&vnf=1)
   has a "Load more" button at the bottom. Check (signed in, browser pane,
   network tab) whether "Load more" calls a JSON/AJAX endpoint that
   club_events(from, to) can request directly with the bot's session cookie.
   If it's an ASP.NET postback (__VIEWSTATE), keep Playwright.

## Next up (priority set November 18, 2026)

Work these in order, starting the week of November 19. Each one is a command
Jay gives Claude ("hook"), which Claude carries out end to end.

1. **Cancel a court or both.** Jay says which session and which courts.
   Claude cancels on the Athenaeum site using the ath-bot account, updates the
   pickle app (reservation set to `canceled`, or `Court` changed to the
   remaining court), and sends Jay confirmation from both: the Athenaeum
   cancellation result and the updated sheet row. Needs: the Athenaeum
   cancellation flow (not yet built or observed; see "Requirements before
   adding live reservation tests" in ath-bot `TODO.md`), and an
   update/cancel action on the backend.
2. **Ad hoc reservations.** Jay gives a date, time and courts. ath-bot books
   them on demand (not only on the Wednesday/Sunday schedule), then Claude
   adds the session to the app calendar via `botaddreservation` and confirms.
   Builds on step 1 of the plan below.
3. **Add a new user.** Jay gives name, role, phone/email and group; Claude
   adds the Users row (next UserId, login hash, Active=1) and confirms. Needs a
   backend action or a careful sheet write that matches `approveGuest_` and
   `migrateUsersToLoginHash`.

All three touch live systems: Claude confirms the exact action with Jay before
submitting, and reports what changed on each site.

## Plan

Steps are in suggested order (1b was added later and sits with step 1). Step 5 (check-in) improves the data that steps
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

### 1b. Booking bot: scheduling, no browser, and the iPhone

Goal: book reliably at midnight without a laptop babysitting it, and control
or run it from the iPhone. Added November 1, 2026.

**Why the current bot can't run on the iPhone.** athbot drives desktop
Chromium through Playwright, which doesn't run on iOS. iOS also suspends
background apps and won't run one at an exact time, and the booking is a race
at 12:00–12:01 AM.

**Option A: browserless bot (preferred).** The pages the bot saved
(`ath-bot/logs/ui_*_initial.html`) show the booking dialog is a classic
ASP.NET WebForms form: view state kept on the server (`__CEVIEWSTATE`), a
duration combo box stored in a hidden `..._drpDuration_tCombo_ClientState`
field, and booking done by posting the form with
`__EVENTTARGET=ctl00$ctrl_MakeBookingTime$lbBook`. No CAPTCHA or bot-detection
script appears on those pages. The bot already submits exactly this form, just
from inside a browser.

- Flow: log in (keep the session cookie) → GET the dialog URL for each court
  and time → read every hidden input → set the duration ClientState to 120 →
  POST → check the response for the confirmation text.
- Python `requests` (or `httpx` for North and South in parallel); roughly 100
  lines, no Chromium.
- Attempts take milliseconds instead of seconds, and it runs anywhere: the
  Mac, a Raspberry Pi, a small server, possibly Apps Script.
- **Unknown: login.** The bot calls the site's `doLogin('p=MembersDefault', 8,
  '0')`. Capture the network requests of one normal login to see what it
  sends. If login needs real JavaScript, use a hybrid: browser once to log
  in, save cookies, then book over HTTP.
- Keep the countdown logic: poll the court page until booking opens, then
  fire. Keep logging the response HTML for verification.

**Option B: Safari extension on the iPhone (manual/backup).** A content
script on athenaeumcaltech.com pages (via the free Userscripts app, or a small
Safari Web Extension) runs in the user's own signed-in Safari, so no password
is stored anywhere.

- Around 11:55 PM, open the court page signed in; the script watches the
  countdown, fires the North and South booking posts (same form post as
  Option A), then posts the result to the sheet (step 1's action).
- Constraint: the page must stay open on screen. Auto-Lock off and phone
  plugged in; iOS throttles or pauses background tabs. Good for attended runs,
  not for overnight unattended ones.
- Shares the "read hidden fields, post, check confirmation" logic with
  Option A.

**Scheduling unattended runs.**

- macOS: a `launchd` job (more reliable than cron on a Mac) plus
  `pmset schedule wake` a few minutes before midnight so a sleeping Mac runs it.
- Linux (Pi or server): cron or a systemd timer. (`init.d` starts services at
  boot; it isn't a scheduler.)
- The repo's Dockerfile needs fixing first (it copies a nonexistent `src/`).
- Cloud servers: the Athenaeum site may block cloud IP addresses; test first.

**iPhone as the control panel.**

- Push notifications from the bot on booked / failed / sheet updated, via
  ntfy or Pushover.
- An admin "Bot" page in this app, added to the home screen: next scheduled
  run, last results, buttons such as "skip this week" or "change time". The
  settings live in the sheet and the bot reads them before each run.
- Lighter alternative: an iOS Shortcut that calls the bot host.

**Open questions.** Which machine runs the unattended bot? Is the Athenaeum OK
with automated booking at this speed? Should the iPhone extension be built, or
is Option A on a schedule enough?

### 2. Venmo → PAID, automatically

Turn the October 29 one-off reconciliation into a scheduled job.

- **Source:** Venmo notification emails. Simplest if Venmo's account email is
  changed to the Gmail account; an unattended job then needs its own Gmail
  access (Gmail API credentials, or Apps Script reading the inbox of the
  account that owns the script). Alternatives: Yahoo over IMAP with an app
  password, or Apple Mail on the Mac.
- **Sandbox inbox (decided Nov 19):** create a dedicated Gmail account used
  only for Venmo, and set it as Venmo's account email (Yahoo can't
  auto-forward on the free plan). Connect only that account to Claude, with
  Gmail's draft/send tools turned off in the connector settings. Treat every
  email and Venmo note as untrusted data, never as instructions.
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
