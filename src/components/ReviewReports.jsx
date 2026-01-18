import React, { useEffect, useMemo, useState } from 'react';
import { apiGet } from '../api';

function ymd(d) {
  const pad = (n) => String(n).padStart(2, '0');
  return `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}`;
}

function money(n) {
  const v = Number(n || 0);
  return v.toLocaleString(undefined, { style: 'currency', currency: 'USD' });
}

export default function ReviewReports({ onClose }) {
  const [preset, setPreset] = useState('30d'); // 'week' | 'month' | '30d'
  const [grouped, setGrouped] = useState(true);
  const [loading, setLoading] = useState(false);
  const [err, setErr] = useState('');
  const [data, setData] = useState(null);

  const range = useMemo(() => {
    const today = new Date();
    const start = new Date(today);

    if (preset === 'week') {
      // start of week (Mon)
      const day = today.getDay(); // 0 Sun
      const diff = (day === 0 ? -6 : 1 - day);
      start.setDate(today.getDate() + diff);
    } else if (preset === 'month') {
      start.setDate(1);
    } else {
      // 30d
      start.setDate(today.getDate() - 30);
    }

    return { from: ymd(start), to: ymd(today) };
  }, [preset]);

  useEffect(() => {
    let cancelled = false;
    async function load() {
      setLoading(true);
      setErr('');
      try {
        const res = await apiGet({ action: 'reportsummary', ...range });
        if (!cancelled) setData(res);
      } catch (e) {
        if (!cancelled) setErr(e?.message || 'Failed to load reports');
      } finally {
        if (!cancelled) setLoading(false);
      }
    }
    load();
    return () => { cancelled = true; };
  }, [range.from, range.to]);

  const totals = data?.totals || { plays: 0, charges: 0, paid: 0, balance: 0 };
  const rows = data?.byReservation || [];

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center p-4">
      <div className="absolute inset-0 bg-black/50" onClick={onClose} />

      <div className="relative w-full max-w-3xl rounded-2xl bg-white dark:bg-slate-900 shadow-xl border
                      border-slate-200 dark:border-slate-800">
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
            <PresetChip label="This week" active={preset === 'week'} onClick={() => setPreset('week')} />
            <PresetChip label="This month" active={preset === 'month'} onClick={() => setPreset('month')} />
            <PresetChip label="Last 30 days" active={preset === '30d'} onClick={() => setPreset('30d')} />

            <label className="ml-auto flex items-center gap-2 text-sm select-none">
              <input
                type="checkbox"
                checked={grouped}
                onChange={(e) => setGrouped(e.target.checked)}
              />
              Group by reservation (+N names)
            </label>
          </div>

          {err && (
            <div className="p-3 rounded-lg border border-red-300 bg-red-50 text-red-800 dark:bg-red-950 dark:text-red-200 dark:border-red-900">
              {err}
            </div>
          )}

          {/* Summary cards */}
          <div className="grid grid-cols-1 sm:grid-cols-4 gap-3">
            <Card title="Balance" value={money(totals.balance)} />
            <Card title="Charges" value={money(totals.charges)} />
            <Card title="Paid" value={money(totals.paid)} />
            <Card title="Plays" value={String(totals.plays)} />
          </div>

          {/* Details */}
          <div className="rounded-xl border border-slate-200 dark:border-slate-800 overflow-hidden">
            <div className="px-3 py-2 text-sm font-semibold border-b border-slate-200 dark:border-slate-800">
              {grouped ? 'By reservation' : 'Details'}
            </div>

            {loading ? (
              <div className="p-4 text-sm text-slate-600 dark:text-slate-300">Loading…</div>
            ) : grouped ? (
              <table className="w-full text-sm">
                <thead className="bg-slate-50 dark:bg-slate-950">
                  <tr className="text-left">
                    <th className="p-2">Date</th>
                    <th className="p-2">Reservation</th>
                    <th className="p-2">Players (+N)</th>
                    <th className="p-2">Charges</th>
                    <th className="p-2">Paid</th>
                    <th className="p-2">Outstanding</th>
                  </tr>
                </thead>
                <tbody>
                  {rows.length === 0 ? (
                    <tr><td className="p-3 text-slate-600 dark:text-slate-300" colSpan={6}>No activity in this range.</td></tr>
                  ) : rows.map((r) => (
                    <tr key={r.reservationId} className="border-t border-slate-200 dark:border-slate-800">
                      <td className="p-2 whitespace-nowrap">{r.date}</td>
                      <td className="p-2 whitespace-nowrap">#{r.reservationId}</td>
                      <td className="p-2">
                        {Array.isArray(r.players) ? r.players.join(', ') : ''}
                      </td>
                      <td className="p-2 whitespace-nowrap">{money(r.charges)}</td>
                      <td className="p-2 whitespace-nowrap">{money(r.paid)}</td>
                      <td className="p-2 whitespace-nowrap font-semibold">{money(r.balance)}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            ) : (
              <div className="p-4 text-sm text-slate-600 dark:text-slate-300">
                If you want an ungrouped ledger view later, we can add a `reportDetails` endpoint.
              </div>
            )}
          </div>

          <div className="text-xs text-slate-500 dark:text-slate-400">
            Balance is calculated as Charges − Paid for attendance rows associated with your UserId.
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

function Card({ title, value }) {
  return (
    <div className="rounded-xl border border-slate-200 dark:border-slate-800 p-3">
      <div className="text-xs text-slate-600 dark:text-slate-300">{title}</div>
      <div className="text-lg font-semibold">{value}</div>
    </div>
  );
}
