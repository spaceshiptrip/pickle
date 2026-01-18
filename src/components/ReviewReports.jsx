import React, { useEffect, useMemo, useState } from "react";
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


export default function ReviewReports({ onClose }) {
  const [preset, setPreset] = useState("30d"); // 'today' | 'week' | 'month' | '30d' | 'range'
  const [grouped, setGrouped] = useState(true);
  const [loading, setLoading] = useState(false);
  const [err, setErr] = useState("");
  const [data, setData] = useState(null);

  /* Added: custom range state (only used when preset === 'range') */
  const [rangeFrom, setRangeFrom] = useState(() => ymd(new Date()));
  const [rangeTo, setRangeTo] = useState(() => ymd(new Date()));

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

  useEffect(() => {
    let cancelled = false;
    async function load() {
      setLoading(true);
      setErr("");
      try {
        const res = await apiGet({ action: "reportsummary", ...range });
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
  }, [range.from, range.to]);

  const totals = data?.totals || { plays: 0, charges: 0, paid: 0, balance: 0 };
  const rows = data?.byReservation || [];

  const balanceClass = balanceColorClass(totals.balance);

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center p-4">
      <div className="absolute inset-0 bg-black/50" onClick={onClose} />

      <div
        className="relative w-full max-w-3xl rounded-2xl bg-white dark:bg-slate-900 shadow-xl border
                      border-slate-200 dark:border-slate-800"
      >
        <div className="flex items-start justify-between p-4 border-b border-slate-200 dark:border-slate-800">
          <div>
            <div className="text-lg font-semibold">Reports</div>
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

        <div className="p-4 space-y-4">
          {/* Presets */}
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
                  {loading ? (
                    <tr>
                      <td
                        colSpan={6}
                        className="p-4 text-center text-slate-500 dark:text-slate-400"
                      >
                        <span className="inline-flex items-center gap-2">
                          <Spinner className="h-4 w-4" />
                          Loading…
                        </span>
                      </td>
                    </tr>
                  ) : rows.length === 0 ? (
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
                          {Array.isArray(r.players) ? r.players.join(", ") : ""}
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
