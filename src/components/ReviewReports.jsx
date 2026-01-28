import React, { useEffect, useMemo, useRef, useState } from "react";
import { apiGet } from "../api";

function ymd(d) {
  const pad = (n) => String(n).padStart(2, "0");
  return `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}`;
}

function money(n) {
  const v = Number(n || 0);
  return v.toLocaleString(undefined, { style: "currency", currency: "USD" });
}

/* Added: same spinner style as ReservationDrawer.jsx */
function Spinner({ className = "h-4 w-4" }) {
  return (
    <span
      className={`inline-block animate-spin rounded-full border-2 border-current border-t-transparent ${className}`}
      aria-hidden="true"
    />
  );
}

/* Added: small helper for red/green balance styling */
function balanceColorClass(n) {
  const v = Number(n || 0);
  if (Math.abs(v) <= 0.0001) return "";
  return v > 0
    ? "text-rose-700 dark:text-rose-300"
    : "text-emerald-700 dark:text-emerald-300";
}

function StatusPill({ status }) {
  const s = String(status || "").toLowerCase();

  const isCanceled = s === "canceled";
  const isReserved = s === "reserved";

  const cls = isCanceled
    ? "bg-rose-100 text-rose-800 dark:bg-rose-950 dark:text-rose-200 border-rose-200 dark:border-rose-900"
    : isReserved
      ? "bg-emerald-600 text-white border-emerald-700 dark:bg-emerald-500 dark:border-emerald-400"
      : "bg-slate-100 text-slate-800 dark:bg-slate-800 dark:text-slate-200 border-slate-200 dark:border-slate-700";

  const label = isCanceled
    ? "Canceled"
    : isReserved
      ? "Reserved"
      : s || "Reserved";

  return (
    <span
      className={`inline-flex items-center rounded-full border px-2 py-0.5 text-xs font-semibold ${cls}`}
    >
      {label}
    </span>
  );
}

export default function ReviewReports({ user, onClose }) {
  const [preset, setPreset] = useState("30d"); // 'today' | 'week' | 'month' | '30d' | 'range'
  const [grouped, setGrouped] = useState(true);
  const [loading, setLoading] = useState(false);
  const [err, setErr] = useState("");
  const [data, setData] = useState(null);

  /* Added: custom range state (only used when preset === 'range') */
  const [rangeFrom, setRangeFrom] = useState(() => ymd(new Date()));
  const [rangeTo, setRangeTo] = useState(() => ymd(new Date()));

  const [reportUsers, setReportUsers] = useState([]);
  const [selectedUserId, setSelectedUserId] = useState("");

  // Admin search + picker UI
  const [userQuery, setUserQuery] = useState("");
  const [userPickerOpen, setUserPickerOpen] = useState(false);
  const [activeUserIndex, setActiveUserIndex] = useState(0);

  const userQueryRef = useRef(null);
  const userPickerRef = useRef(null);

  const myId = String(user?.UserId ?? user?.userId ?? "").trim();
  const myName = String(user?.name ?? user?.Name ?? "Me").trim();
  const isAdmin = user?.role === "admin";
  const effectiveSelectedUserId = String(selectedUserId || myId).trim();

  const range = useMemo(() => {
    const today = new Date();
    const start = new Date(today);

    if (preset === "today") {
      return { from: ymd(today), to: ymd(today) };
    }

    if (preset === "range") {
      const from = (rangeFrom || "").trim() || ymd(today);
      const to = (rangeTo || "").trim() || ymd(today);
      return { from, to };
    }

    if (preset === "week") {
      // start of week (Mon)
      const day = today.getDay(); // 0 Sun
      const diff = day === 0 ? -6 : 1 - day;
      start.setDate(today.getDate() + diff);
    } else if (preset === "month") {
      start.setDate(1);
    } else {
      // 30d
      start.setDate(today.getDate() - 30);
    }

    return { from: ymd(start), to: ymd(today) };
  }, [preset, rangeFrom, rangeTo]);

  // "/" focuses admin search
  useEffect(() => {
    if (!isAdmin) return;

    function onKeyDown(e) {
      // avoid interfering with browser shortcuts / IME / etc
      if (e.ctrlKey || e.metaKey || e.altKey) return;

      const key = e.key;
      const code = e.code;

      const isSlash = key === "/" || code === "Slash";
      if (!isSlash) return;

      const tag = String(document.activeElement?.tagName || "").toLowerCase();
      const isTyping =
        tag === "input" || tag === "textarea" || tag === "select";

      if (isTyping) return;

      e.preventDefault();
      userQueryRef.current?.focus?.();
      setUserPickerOpen(true);
    }

    window.addEventListener("keydown", onKeyDown, { passive: false });
    return () => window.removeEventListener("keydown", onKeyDown);
  }, [isAdmin]);

  // click outside closes picker
  useEffect(() => {
    if (!isAdmin) return;

    function onDown(e) {
      const el = userPickerRef.current;
      if (!el) return;
      if (el.contains(e.target)) return;
      setUserPickerOpen(false);
    }

    window.addEventListener("mousedown", onDown);
    window.addEventListener("touchstart", onDown);
    return () => {
      window.removeEventListener("mousedown", onDown);
      window.removeEventListener("touchstart", onDown);
    };
  }, [isAdmin]);

  useEffect(() => {
    if (!isAdmin) return;

    let cancelled = false;

    (async () => {
      try {
        const res = await apiGet({ action: "listusers" });
        const list = Array.isArray(res?.users) ? res.users : [];

        if (cancelled) return;

        const normalized = list
          .map((u) => {
            const userId = String(u?.UserId ?? u?.userId ?? u?.id ?? "").trim();
            const name = String(
              u?.Name ?? u?.name ?? u?.displayName ?? "",
            ).trim();
            return { userId, name };
          })
          .filter((u) => u.userId && u.name);

        setReportUsers(normalized);

        // Default selection to "me" if not set
        if (!selectedUserId && myId) setSelectedUserId(myId);
      } catch (e) {
        if (!cancelled) {
          setReportUsers([]);
          setErr(e?.message || "Failed to load user list");
        }
      }
    })();

    return () => {
      cancelled = true;
    };
  }, [isAdmin, myId, selectedUserId]);

  useEffect(() => {
    let cancelled = false;

    async function load() {
      setLoading(true);
      setErr("");

      try {
        const viewId = isAdmin ? String(selectedUserId || myId).trim() : myId;

        const params = { from: range.from, to: range.to };

        // Only pass forUserId when admin is viewing someone else
        if (isAdmin && viewId && myId && viewId !== myId) {
          params.forUserId = viewId;
        }

        const res = await apiGet({ action: "reportsummary", ...params });
        if (!cancelled) setData(res);
      } catch (e) {
        if (!cancelled) setErr(e?.message || "Failed to load reports");
      } finally {
        if (!cancelled) setLoading(false);
      }
    }

    load();

    return () => {
      cancelled = true;
    };
  }, [range.from, range.to, selectedUserId, isAdmin, myId]);

  const totals = data?.totals || { plays: 0, charges: 0, paid: 0, balance: 0 };
  const rows = data?.byReservation || [];

  const balanceClass = balanceColorClass(totals.balance);

  const totalUsersCount =
    isAdmin
      ? 1 + reportUsers.filter((u) => String(u.userId) !== String(myId)).length
      : 0;

  const filteredUsers = useMemo(() => {
    const q = String(userQuery || "").trim().toLowerCase();
    const others = reportUsers.filter((u) => String(u.userId) !== String(myId));

    if (!q) return others;

    return others.filter((u) => {
      const name = String(u.name || "").toLowerCase();
      const id = String(u.userId || "").toLowerCase();
      return name.includes(q) || id.includes(q);
    });
  }, [userQuery, reportUsers, myId]);

  const pickerItems = useMemo(() => {
    if (!isAdmin) return [];

    const me = { userId: myId, name: `${myName} (me)` };
    const items = [me, ...filteredUsers];

    // keep selection visible even if it doesn't match current query
    const selId = String(effectiveSelectedUserId || "").trim();
    if (selId && selId !== String(myId)) {
      const inItems = items.some((u) => String(u.userId) === selId);
      if (!inItems) {
        const hit = reportUsers.find((u) => String(u.userId) === selId);
        if (hit?.userId && hit?.name) items.splice(1, 0, hit);
      }
    }

    return items;
  }, [
    isAdmin,
    myId,
    myName,
    filteredUsers,
    effectiveSelectedUserId,
    reportUsers,
  ]);

  // keep active index in bounds when list changes
  useEffect(() => {
    if (!isAdmin) return;
    setActiveUserIndex((i) => {
      const max = Math.max(0, pickerItems.length - 1);
      return Math.min(i, max);
    });
  }, [isAdmin, pickerItems.length]);

  const selectedUserName = (() => {
    if (!isAdmin) return "";
    if (effectiveSelectedUserId && String(effectiveSelectedUserId) === String(myId))
      return myName;

    const hit = reportUsers.find(
      (u) => String(u.userId) === String(effectiveSelectedUserId),
    );
    if (hit?.name) return hit.name;

    const fromReport = String(data?.reportFor?.name || "").trim();
    if (fromReport) return fromReport;

    return effectiveSelectedUserId || "User";
  })();

  function pickUser(id) {
    setSelectedUserId(id);
    setUserPickerOpen(false);
  }

  return (
    <div
      className="fixed inset-0 z-50 overflow-y-auto overscroll-contain"
      style={{
        backgroundColor: "rgba(0,0,0,0.5)",
        WebkitOverflowScrolling: "touch",
      }}
      role="dialog"
      aria-modal="true"
      onMouseDown={(e) => {
        if (e.target === e.currentTarget) onClose?.();
      }}
      onTouchStart={(e) => {
        if (e.target === e.currentTarget) onClose?.();
      }}
    >
      <div className="min-h-full flex items-center justify-center p-2 sm:p-6 py-8">
        <div
          className="relative w-full max-w-3xl rounded-2xl bg-white dark:bg-slate-900 shadow-xl border
             border-slate-200 dark:border-slate-800"
          onMouseDown={(e) => e.stopPropagation()}
          onTouchStart={(e) => e.stopPropagation()}
        >
          <div className="flex items-start justify-between p-4 border-b border-slate-200 dark:border-slate-800">
            <div>
              <div className="flex items-center gap-2">
                <div className="text-lg font-semibold">Reports</div>

                {isAdmin && (
                  <span
                    className="inline-flex items-center rounded-full border px-2 py-0.5 text-[11px] font-extrabold uppercase tracking-wide
                               bg-amber-100 text-amber-800 border-amber-200
                               dark:bg-amber-500/15 dark:text-amber-200 dark:border-amber-500/30"
                  >
                    Admin view · {selectedUserName} · #{effectiveSelectedUserId || "?"}
                  </span>
                )}
              </div>

              <div className="text-sm text-slate-600 dark:text-slate-300">
                {range.from} → {range.to}
              </div>
            </div>

            <button
              onClick={onClose}
              className="px-3 py-1.5 rounded-lg border text-sm hover:opacity-90
                       border-slate-300 dark:border-slate-700"
            >
              Close
            </button>
          </div>

          {/* content wrapper needs relative for overlay */}
          <div className="relative p-4 space-y-4">
            {/* ✅ overlay spinner while report is loading */}
            {loading && (
              <div className="absolute inset-0 z-20 bg-slate-900/10 dark:bg-slate-900/30 backdrop-blur-[1px] flex items-center justify-center rounded-b-2xl">
                <div className="px-4 py-3 rounded-lg bg-white dark:bg-slate-800 border border-slate-200 dark:border-slate-700 shadow">
                  <span className="inline-flex items-center gap-2 text-sm font-semibold text-slate-700 dark:text-slate-200">
                    <Spinner className="h-4 w-4" />
                    Loading…
                  </span>
                </div>
              </div>
            )}

            {/* Presets */}
            {isAdmin ? (
              <div className="space-y-3">
                <div className="w-full" ref={userPickerRef}>
                  <label className="block text-xs text-slate-600 dark:text-slate-300 mb-1">
                    Viewing report for{" "}
                    <span className="opacity-70">({totalUsersCount} users)</span>
                  </label>

                  <div className="relative">
                    <input
                      ref={userQueryRef}
                      value={userQuery}
                      onChange={(e) => {
                        setUserQuery(e.target.value);
                        setUserPickerOpen(true);
                        setActiveUserIndex(0);
                      }}
                      onFocus={() => setUserPickerOpen(true)}
                      onKeyDown={(e) => {
                        if (!userPickerOpen && (e.key === "ArrowDown" || e.key === "Enter")) {
                          setUserPickerOpen(true);
                          return;
                        }

                        if (e.key === "Escape") {
                          setUserPickerOpen(false);
                          return;
                        }

                        if (e.key === "ArrowDown") {
                          e.preventDefault();
                          setUserPickerOpen(true);
                          setActiveUserIndex((i) =>
                            Math.min(i + 1, Math.max(0, pickerItems.length - 1)),
                          );
                          return;
                        }

                        if (e.key === "ArrowUp") {
                          e.preventDefault();
                          setActiveUserIndex((i) => Math.max(0, i - 1));
                          return;
                        }

                        if (e.key === "Enter") {
                          e.preventDefault();
                          const pick = pickerItems[activeUserIndex] || pickerItems[0];
                          if (pick?.userId) pickUser(pick.userId);
                          return;
                        }
                      }}
                      placeholder='Search name or user id… (press "/")'
                      className="w-full rounded-lg border border-slate-300 bg-white p-2 text-sm
                                 dark:border-slate-700 dark:bg-slate-900"
                    />

                    {userPickerOpen && (
                      <div
                        className="absolute z-30 mt-1 w-full rounded-xl border border-slate-200 bg-white shadow-lg overflow-hidden
                                   dark:bg-slate-900 dark:border-slate-700"
                        role="listbox"
                      >
                        <div className="max-h-60 overflow-auto">
                          {pickerItems.length === 0 ? (
                            <div className="p-3 text-sm text-slate-600 dark:text-slate-300">
                              No matches
                            </div>
                          ) : (
                            pickerItems.map((u, idx) => {
                              const active = idx === activeUserIndex;
                              const selected =
                                String(u.userId) === String(effectiveSelectedUserId);

                              return (
                                <button
                                  key={`${u.userId}-${idx}`}
                                  type="button"
                                  onMouseEnter={() => setActiveUserIndex(idx)}
                                  onClick={() => pickUser(u.userId)}
                                  className={
                                    "w-full text-left px-3 py-2 text-sm flex items-center justify-between gap-3 " +
                                    (active
                                      ? "bg-slate-100 dark:bg-slate-800"
                                      : "bg-white dark:bg-slate-900") +
                                    (selected ? " font-semibold" : "")
                                  }
                                >
                                  <span className="truncate">
                                    {u.name}
                                  </span>
                                  <span className="shrink-0 text-xs text-slate-500 dark:text-slate-400">
                                    #{u.userId}
                                  </span>
                                </button>
                              );
                            })
                          )}
                        </div>

                        <div className="px-3 py-2 text-[11px] text-slate-500 dark:text-slate-400 border-t border-slate-200 dark:border-slate-700">
                          ↑↓ to navigate · Enter to select · Esc to close
                        </div>
                      </div>
                    )}
                  </div>

                  {data?.reportFor?.name && (
                    <div className="mt-1 text-xs text-slate-500 dark:text-slate-400">
                      Report for:{" "}
                      <span className="font-medium">{data.reportFor.name}</span>
                    </div>
                  )}
                </div>

                <div className="flex flex-wrap gap-2 items-center">
                  <PresetChip
                    label="Today"
                    active={preset === "today"}
                    onClick={() => setPreset("today")}
                  />
                  <PresetChip
                    label="This week"
                    active={preset === "week"}
                    onClick={() => setPreset("week")}
                  />
                  <PresetChip
                    label="This month"
                    active={preset === "month"}
                    onClick={() => setPreset("month")}
                  />
                  <PresetChip
                    label="Last 30 days"
                    active={preset === "30d"}
                    onClick={() => setPreset("30d")}
                  />
                  <PresetChip
                    label="Range"
                    active={preset === "range"}
                    onClick={() => setPreset("range")}
                  />

                  <label className="sm:ml-auto flex items-center gap-2 text-sm select-none whitespace-nowrap">
                    <input
                      type="checkbox"
                      checked={grouped}
                      onChange={(e) => setGrouped(e.target.checked)}
                    />
                    Group by reservation (+N names)
                  </label>
                </div>
              </div>
            ) : (
              <div className="flex flex-wrap gap-2">
                <PresetChip
                  label="Today"
                  active={preset === "today"}
                  onClick={() => setPreset("today")}
                />
                <PresetChip
                  label="This week"
                  active={preset === "week"}
                  onClick={() => setPreset("week")}
                />
                <PresetChip
                  label="This month"
                  active={preset === "month"}
                  onClick={() => setPreset("month")}
                />
                <PresetChip
                  label="Last 30 days"
                  active={preset === "30d"}
                  onClick={() => setPreset("30d")}
                />
                <PresetChip
                  label="Range"
                  active={preset === "range"}
                  onClick={() => setPreset("range")}
                />

                <label className="ml-auto flex items-center gap-2 text-sm select-none">
                  <input
                    type="checkbox"
                    checked={grouped}
                    onChange={(e) => setGrouped(e.target.checked)}
                  />
                  Group by reservation (+N names)
                </label>
              </div>
            )}

            {/* Range inputs */}
            {preset === "range" && (
              <div className="flex flex-wrap gap-2 items-end">
                <div>
                  <div className="text-xs font-semibold text-slate-600 dark:text-slate-300 mb-1">
                    From
                  </div>
                  <input
                    type="date"
                    value={rangeFrom}
                    onChange={(e) => setRangeFrom(e.target.value)}
                    className="rounded border px-2 py-1 text-sm bg-white dark:bg-slate-950 border-slate-300 dark:border-slate-700"
                  />
                </div>

                <div>
                  <div className="text-xs font-semibold text-slate-600 dark:text-slate-300 mb-1">
                    To
                  </div>
                  <input
                    type="date"
                    value={rangeTo}
                    onChange={(e) => setRangeTo(e.target.value)}
                    className="rounded border px-2 py-1 text-sm bg-white dark:bg-slate-950 border-slate-300 dark:border-slate-700"
                  />
                </div>
              </div>
            )}

            {err && (
              <div className="p-3 rounded-lg border border-red-300 bg-red-50 text-red-800 dark:bg-red-950 dark:text-red-200 dark:border-red-900">
                {err}
              </div>
            )}

            {/* Summary cards */}
            <div className="grid grid-cols-1 sm:grid-cols-4 gap-3">
              <Card
                title="Balance"
                value={money(totals.balance)}
                valueClassName={balanceClass}
              />
              <Card title="Charges" value={money(totals.charges)} />
              <Card title="Paid" value={money(totals.paid)} />
              <Card title="Plays" value={String(totals.plays)} />
            </div>

            {/* Details */}
            <div className="rounded-xl border border-slate-200 dark:border-slate-800 overflow-hidden">
              <div className="px-3 py-2 text-sm font-semibold border-b border-slate-200 dark:border-slate-800">
                {grouped ? "By reservation" : "Details"}
              </div>

              {grouped ? (
                <table className="w-full text-sm">
                  <thead className="bg-slate-50 dark:bg-slate-950">
                    <tr className="text-left">
                      <th className="p-2">Date</th>
                      <th className="p-2">Status</th>
                      <th className="p-2">Players (+N)</th>
                      <th className="p-2">Charges</th>
                      <th className="p-2">Paid</th>
                      <th className="p-2">Outstanding</th>
                    </tr>
                  </thead>
                  <tbody>
                    {rows.length === 0 && !loading ? (
                      <tr>
                        <td
                          className="p-3 text-slate-600 dark:text-slate-300"
                          colSpan={6}
                        >
                          No activity in this range.
                        </td>
                      </tr>
                    ) : (
                      rows.map((r) => (
                        <tr
                          key={r.reservationId}
                          className="border-t border-slate-200 dark:border-slate-800"
                        >
                          <td className="p-2 whitespace-nowrap">{r.date}</td>
                          <td className="p-2 whitespace-nowrap">
                            <StatusPill status={r.status} />
                          </td>

                          <td className="p-2">
                            {Array.isArray(r.players)
                              ? r.players.join(", ")
                              : ""}
                          </td>
                          <td className="p-2 whitespace-nowrap">
                            {money(r.charges)}
                          </td>
                          <td className="p-2 whitespace-nowrap">
                            {money(r.paid)}
                          </td>

                          {/* Changed: Outstanding colored red (owed) / green (credit) when non-zero */}
                          <td
                            className={`p-2 whitespace-nowrap font-semibold ${balanceColorClass(r.balance)}`}
                          >
                            {money(r.balance)}
                          </td>
                        </tr>
                      ))
                    )}
                  </tbody>
                </table>
              ) : (
                <div className="p-4 text-sm text-slate-600 dark:text-slate-300">
                  If you want an ungrouped ledger view later, we can add a
                  `reportDetails` endpoint.
                </div>
              )}
            </div>

            <div className="text-xs text-slate-500 dark:text-slate-400">
              Balance is calculated as Charges − Paid for attendance rows
              associated with your UserId.
            </div>
          </div>
        </div>
      </div>
    </div>
  );
}

function PresetChip({ label, active, onClick }) {
  return (
    <button
      onClick={onClick}
      className={
        "px-3 py-1.5 rounded-full text-sm border " +
        (active
          ? "bg-slate-900 text-white border-slate-900 dark:bg-white dark:text-slate-900 dark:border-white"
          : "border-slate-300 dark:border-slate-700 hover:opacity-90")
      }
    >
      {label}
    </button>
  );
}

/* Changed: Card now accepts optional valueClassName (doesn't affect other cards) */
function Card({ title, value, valueClassName = "" }) {
  return (
    <div className="rounded-xl border border-slate-200 dark:border-slate-800 p-3">
      <div className="text-xs text-slate-600 dark:text-slate-300">{title}</div>
      <div className={`text-lg font-semibold ${valueClassName}`}>{value}</div>
    </div>
  );
}
