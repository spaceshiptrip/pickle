import React, { useEffect, useMemo, useState } from 'react';
import { VENMO_URL } from '../config';
import { apiGet, apiPost } from '../api';

/**
 * Backend needed:
 *  - GET action=listusers -> { ok: true, users: [{ Name: "JT" }, { Name: "Cora" }, ...] }
 *    (You can also return: users: ["JT","Cora"] — this component supports both)
 */

const EXTRA_NAME_OPTIONS = ['TBD', 'Other'];

export default function ReservationDrawer({ reservation, onClose, role, onEditReservation }) {
    const [players, setPlayers] = useState(['']); // for admin: stores selected value ("JT" | "TBD" | "Other")
    const [playerOthers, setPlayerOthers] = useState(['']); // for admin: typed value when "Other" selected
    const [userNames, setUserNames] = useState([]); // from Users sheet

    const [roster, setRoster] = useState([]);
    const [total, setTotal] = useState('');
    const [markPaid, setMarkPaid] = useState(false);

    const totalFees = useMemo(() => {
        const fees = (reservation.Fees || []).reduce((a, f) => a + (Number(f.Amount) || 0), 0);
        return (Number(reservation.BaseFee) || 0) + fees;
    }, [reservation]);

    const isAdmin = role?.toLowerCase() === 'admin';

    // Load roster
    useEffect(() => {
        (async () => {
            try {
                const data = await apiGet({ action: 'listattendance', reservationId: reservation.Id });
                if (data.ok) setRoster(data.attendees);
            } catch (e) {
                console.error('Failed to load attendance', e);
            }
        })();
    }, [reservation.Id]);

    // Load user list for admin dropdown
    useEffect(() => {
        if (role?.toLowerCase() !== 'admin') return;

        (async () => {
            try {
                const r = await apiGet({ action: 'listusers' });
                if (r?.ok) {
                    const raw = r.users || [];
                    const names =
                        Array.isArray(raw) && raw.length > 0
                            ? typeof raw[0] === 'string'
                                ? raw
                                : raw.map((u) => u.Name).filter(Boolean)
                            : [];
                    // Sort + unique
                    const uniq = Array.from(new Set(names)).sort((a, b) => a.localeCompare(b));
                    setUserNames(uniq);
                }
            } catch (e) {
                console.error('Failed to load users', e);
            }
        })();
    }, [role]);

    const perPlayer = useMemo(() => {
        const amt = total ? Number(total) : totalFees;

        // compute count of valid names (for admin, respect Other typed values)
        let count = 1;
        if (role?.toLowerCase() === 'admin') {
            const resolved = players
                .map((p, i) => {
                    const v = (p || '').trim();
                    if (!v) return '';
                    if (v === 'Other') return (playerOthers[i] || '').trim();
                    return v;
                })
                .filter(Boolean);
            count = Math.max(resolved.length, 1);
        } else {
            // non-admin signup is "self" in backend; keep divisor as 1
            count = 1;
        }

        return Math.round((amt / count) * 100) / 100;
    }, [total, totalFees, players, playerOthers, role]);

    const used = roster.length;
    const cap = reservation.Capacity || 0;

    function ensureOtherArrayLength(nextPlayers) {
        // keep playerOthers array same length as players
        const nextOthers = [...playerOthers];
        while (nextOthers.length < nextPlayers.length) nextOthers.push('');
        while (nextOthers.length > nextPlayers.length) nextOthers.pop();
        setPlayerOthers(nextOthers);
    }

    async function submit() {
        // resolve admin names
        const names =
            role?.toLowerCase() === 'admin'
                ? players
                    .map((p, i) => {
                        const v = (p || '').trim();
                        if (!v) return '';
                        if (v === 'Other') return (playerOthers[i] || '').trim();
                        return v;
                    })
                    .filter(Boolean)
                : [];

        const isAdmin = role?.toLowerCase() === 'admin';
        if (isAdmin && names.length === 0) return;

        // Validate any "Other" rows
        if (isAdmin) {
            const hasOtherMissing = players.some((p, i) => p === 'Other' && !(playerOthers[i] || '').trim());
            if (hasOtherMissing) return alert('Please fill in the name for any "Other" player.');
        }

        try {
            const res = await apiPost('signup', {
                reservationId: reservation.Id,
                ...(isAdmin ? { players: names } : {}),
                markPaid,
                totalAmount: total ? Number(total) : totalFees,
            });

            if (res.ok) {
                const r = await apiGet({ action: 'listattendance', reservationId: reservation.Id });
                if (r.ok) setRoster(r.attendees);
                setPlayers(['']);
                setPlayerOthers(['']);
            }
        } catch (e) {
            alert('Failed to sign up: ' + e.message);
        }
    }

    async function setPaid(name, paid) {
        try {
            await apiPost('markpaid', { reservationId: reservation.Id, player: name, paid });
            const r = await apiGet({ action: 'listattendance', reservationId: reservation.Id });
            if (r.ok) setRoster(r.attendees);
        } catch (e) {
            alert('Failed to update payment status: ' + e.message);
        }
    }

    const allNameOptions = useMemo(() => {
        const base = userNames || [];
        return [...base, ...EXTRA_NAME_OPTIONS];
    }, [userNames]);

    return (
        <div className="fixed inset-0 bg-black/30 flex items-end sm:items-center justify-center p-4 z-50">
            <div className="bg-white rounded-xl p-4 w-full max-w-2xl max-h-[90vh] overflow-y-auto">
                <div className="flex justify-between items-center mb-4 gap-2">
                    <h2 className="text-lg font-semibold">
                        Court {reservation.Court} — {reservation.Date} {reservation.Start}-{reservation.End}
                    </h2>

                    <div className="flex items-center gap-2">
                        {role?.toLowerCase() === 'admin' && (
                            <button
                                onClick={() => {
                                    if (onEditReservation) return onEditReservation(reservation);
                                    alert('Edit (admin) clicked — wire onEditReservation() when ready.');
                                }}
                                className="text-xs font-black uppercase tracking-widest px-3 py-1 bg-indigo-50 text-indigo-700 border border-indigo-200 rounded hover:bg-indigo-100 transition-colors"
                            >
                                Edit
                            </button>
                        )}

                        <button
                            onClick={onClose}
                            className="flex items-center gap-2 text-sm font-bold px-3 py-1 bg-black text-white rounded hover:bg-gray-900 transition-colors"
                        >
                            <span>✕</span>
                            <span>Close</span>
                        </button>
                    </div>
                </div>

                <div className="mt-2 text-sm bg-gray-50 p-2 rounded">
                    <div>
                        Capacity: {used}/{cap}
                    </div>
                    <div>Base fee: ${reservation.BaseFee}</div>
                    {reservation.Fees?.length > 0 && (
                        <div>Extras: {reservation.Fees.map((f) => `${f.FeeName} $${f.Amount}`).join(', ')}</div>
                    )}
                    <div className="mt-1 font-semibold">Suggested total: ${totalFees}</div>
                </div>

                <div className="mt-4 border rounded p-3">
                    <div className="font-medium mb-2">Sign up</div>

                    {/* Admin: player list dropdowns */}
                    {isAdmin &&
                        players.map((p, i) => {
                            const isOther = p === 'Other';

                            return (
                                <div key={i} className="flex gap-2 mb-2 flex-wrap">
                                    <div className="flex-1 min-w-[220px]">
                                        <select
                                            className="border rounded px-2 py-1 w-full"
                                            value={p || ''}
                                            onChange={(e) => {
                                                const next = e.target.value;
                                                const nextPlayers = [...players];
                                                nextPlayers[i] = next;
                                                setPlayers(nextPlayers);

                                                // If switching away from Other, clear its other-text
                                                if (next !== 'Other') {
                                                    const nextOthers = [...playerOthers];
                                                    nextOthers[i] = '';
                                                    setPlayerOthers(nextOthers);
                                                }
                                            }}
                                        >
                                            <option value="">Select player…</option>
                                            {allNameOptions.map((name) => (
                                                <option key={name} value={name}>
                                                    {name}
                                                </option>
                                            ))}
                                        </select>
                                    </div>

                                    {isOther && (
                                        <div className="flex-1 min-w-[220px]">
                                            <input
                                                className="border rounded px-2 py-1 w-full"
                                                placeholder="Enter player name"
                                                value={playerOthers[i] || ''}
                                                onChange={(e) => {
                                                    const next = [...playerOthers];
                                                    next[i] = e.target.value;
                                                    setPlayerOthers(next);
                                                }}
                                            />
                                        </div>
                                    )}

                                    <div className="flex gap-2">
                                        {i === players.length - 1 ? (
                                            <button
                                                className="border rounded px-3 py-1 bg-white hover:bg-gray-50"
                                                onClick={() => {
                                                    const nextPlayers = [...players, ''];
                                                    setPlayers(nextPlayers);
                                                    ensureOtherArrayLength(nextPlayers);
                                                }}
                                                type="button"
                                            >
                                                + Add
                                            </button>
                                        ) : (
                                            <button
                                                className="border rounded px-3 py-1 bg-white hover:bg-gray-50 text-red-600"
                                                onClick={() => {
                                                    const nextPlayers = players.filter((_, j) => j !== i);
                                                    const nextOthers = playerOthers.filter((_, j) => j !== i);
                                                    setPlayers(nextPlayers.length ? nextPlayers : ['']);
                                                    setPlayerOthers(nextOthers.length ? nextOthers : ['']);
                                                }}
                                                type="button"
                                            >
                                                Remove
                                            </button>
                                        )}
                                    </div>
                                </div>
                            );
                        })}

                    <div className="flex gap-2 items-center mb-2 flex-wrap">
                        <label className="text-sm">Total you’ll pay now (optional):</label>
                        <input
                            className="border rounded px-2 py-1 w-28"
                            placeholder={String(totalFees)}
                            value={total}
                            onChange={(e) => setTotal(e.target.value)}
                        />
                        <span className="text-sm opacity-70">= ~ ${perPlayer}/player</span>
                    </div>

                    {role === 'admin' && (
                        <label className="flex items-center gap-2 text-sm mb-2">
                            <input type="checkbox" checked={markPaid} onChange={(e) => setMarkPaid(e.target.checked)} />
                            Mark as paid now
                        </label>
                    )}

                    <div className="flex gap-2 mt-3 flex-wrap">
                        <button className="bg-blue-600 text-white rounded px-4 py-2 font-semibold" onClick={submit}>
                            Submit sign-up
                        </button>

                        <a
                            className="bg-blue-100 text-blue-800 rounded px-4 py-2 font-semibold"
                            href={`${VENMO_URL}?txn=pay&amount=${perPlayer}&note=Pickleball ${reservation.Date} ${reservation.Start}`}
                            target="_blank"
                            rel="noreferrer"
                        >
                            Pay ${perPlayer} via Venmo
                        </a>
                    </div>
                </div>

                <div className="mt-6">
                    <div className="font-medium mb-2">Roster</div>
                    <div className="overflow-x-auto">
                        <table className="w-full text-sm border collapse">
                            <thead>
                                <tr className="bg-gray-50">
                                    <th className="p-2 border text-left">Player</th>
                                    <th className="p-2 border text-left">Charge</th>
                                    <th className="p-2 border text-left">Paid</th>
                                    {isAdmin && <th className="p-2 border text-left">Actions</th>}
                                </tr>
                            </thead>
                            <tbody>
                                {roster.map((r, idx) => (
                                    <tr key={idx}>
                                        <td className="p-2 border">{r.Player}</td>
                                        <td className="p-2 border">{r.Charge !== null ? `$${r.Charge}` : '-'}</td>
                                        <td className="p-2 border">
                                            {r.PAID !== null ? (
                                                <span
                                                    className={`px-2 py-0.5 rounded text-xs ${r.PAID ? 'bg-green-100 text-green-800' : 'bg-red-100 text-red-800'
                                                        }`}
                                                >
                                                    {r.PAID ? 'Yes' : 'No'}
                                                </span>
                                            ) : (
                                                <span className="text-gray-400 italic">Private</span>
                                            )}
                                        </td>
                                        {isAdmin && (
                                            <td className="p-2 border">
                                                <button
                                                    className="border rounded px-2 py-0.5 mr-1 bg-white hover:bg-gray-50"
                                                    onClick={() => setPaid(r.Player, true)}
                                                >
                                                    Mark paid
                                                </button>
                                                <button
                                                    className="border rounded px-2 py-0.5 bg-white hover:bg-gray-50"
                                                    onClick={() => setPaid(r.Player, false)}
                                                >
                                                    Unpay
                                                </button>
                                            </td>
                                        )}
                                    </tr>
                                ))}
                                {roster.length === 0 && (
                                    <tr>
                                        <td colSpan={isAdmin ? 4 : 3} className="p-4 text-center text-gray-500">
                                            No sign-ups yet
                                        </td>
                                    </tr>
                                )}
                            </tbody>
                        </table>
                    </div>
                </div>
            </div>
        </div>
    );
}
