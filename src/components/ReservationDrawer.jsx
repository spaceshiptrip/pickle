import React, { useEffect, useMemo, useState } from 'react';
import { VENMO_URL, DEFAULT_AMOUNT } from '../config';
import { apiGet, apiPost } from '../api';

export default function ReservationDrawer({ reservation, onClose, role }) {
    const [players, setPlayers] = useState(['']);
    const [roster, setRoster] = useState([]);
    const [total, setTotal] = useState('');
    const [markPaid, setMarkPaid] = useState(false);

    const totalFees = useMemo(() => {
        const fees = (reservation.Fees || []).reduce((a, f) => a + (Number(f.Amount) || 0), 0);
        return (Number(reservation.BaseFee) || 0) + fees;
    }, [reservation]);

    useEffect(() => {
        (async () => {
            try {
                const data = await apiGet({ action: 'listattendance', reservationId: reservation.Id });
                if (data.ok) setRoster(data.attendees);
            } catch (e) {
                console.error("Failed to load attendance", e);
            }
        })();
    }, [reservation.Id]);

    const perPlayer = useMemo(() => {
        const amt = total ? Number(total) : totalFees;
        const count = Math.max(players.filter(p => p.trim()).length, 1);
        return Math.round((amt / count) * 100) / 100;
    }, [total, totalFees, players]);

    const used = roster.length;
    const cap = reservation.Capacity || 0;

    async function submit() {
        const names = players.map(p => p.trim()).filter(Boolean);
        if (names.length === 0) return;
        try {
            const res = await apiPost('signup', {
                reservationId: reservation.Id,
                players: names,
                markPaid,
                totalAmount: total ? Number(total) : totalFees
            });
            if (res.ok) {
                // refresh roster
                const r = await apiGet({ action: 'listattendance', reservationId: reservation.Id });
                if (r.ok) setRoster(r.attendees);
                setPlayers(['']);
            }
        } catch (e) {
            alert("Failed to sign up: " + e.message);
        }
    }

    async function setPaid(name, paid) {
        try {
            await apiPost('markpaid', { reservationId: reservation.Id, player: name, paid });
            const r = await apiGet({ action: 'listattendance', reservationId: reservation.Id });
            if (r.ok) setRoster(r.attendees);
        } catch (e) {
            alert("Failed to update payment status: " + e.message);
        }
    }

    return (
        <div className="fixed inset-0 bg-black/30 flex items-end sm:items-center justify-center p-4 z-50">
            <div className="bg-white rounded-xl p-4 w-full max-w-2xl max-h-[90vh] overflow-y-auto">
                <div className="flex justify-between items-center mb-4">
                    <h2 className="text-lg font-semibold">Court {reservation.Court} — {reservation.Date} {reservation.Start}-{reservation.End}</h2>
                    <button onClick={onClose} className="text-sm font-bold px-2 py-1 bg-gray-200 rounded">Close</button>
                </div>

                <div className="mt-2 text-sm bg-gray-50 p-2 rounded">
                    <div>Capacity: {used}/{cap}</div>
                    <div>Base fee: ${reservation.BaseFee}</div>
                    {reservation.Fees?.length > 0 && (
                        <div>Extras: {reservation.Fees.map(f => `${f.FeeName} $${f.Amount}`).join(', ')}</div>
                    )}
                    <div className="mt-1 font-semibold">Suggested total: ${totalFees}</div>
                </div>

                <div className="mt-4 border rounded p-3">
                    <div className="font-medium mb-2">Sign up</div>
                    {players.map((p, i) => (
                        <div key={i} className="flex gap-2 mb-2">
                            <input className="border rounded px-2 py-1 flex-1" placeholder="Player name" value={p} onChange={e => {
                                const arr = [...players]; arr[i] = e.target.value; setPlayers(arr);
                            }} />
                            {i === players.length - 1 ? (
                                <button className="border rounded px-2" onClick={() => setPlayers([...players, ''])}>+ Add</button>
                            ) : (
                                <button className="border rounded px-2 text-red-500" onClick={() => setPlayers(players.filter((_, j) => j !== i))}>Remove</button>
                            )}
                        </div>
                    ))}
                    <div className="flex gap-2 items-center mb-2 flex-wrap">
                        <label className="text-sm">Total you’ll pay now (optional):</label>
                        <input className="border rounded px-2 py-1 w-28" placeholder={String(totalFees)} value={total} onChange={e => setTotal(e.target.value)} />
                        <span className="text-sm opacity-70">= ~ ${perPlayer}/player</span>
                    </div>
                    <label className="flex items-center gap-2 text-sm mb-2">
                        <input type="checkbox" checked={markPaid} onChange={e => setMarkPaid(e.target.checked)} />
                        Mark as paid now
                    </label>
                    <div className="flex gap-2 mt-3">
                        <button className="bg-blue-600 text-white rounded px-4 py-2 font-semibold" onClick={submit}>Submit sign-up</button>
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
                            <thead><tr className="bg-gray-50">
                                <th className="p-2 border text-left">Player</th>
                                <th className="p-2 border text-left">Charge</th>
                                <th className="p-2 border text-left">Paid</th>
                                {role === 'admin' && <th className="p-2 border text-left">Actions</th>}
                            </tr></thead>
                            <tbody>
                                {roster.map((r, idx) => (
                                    <tr key={idx}>
                                        <td className="p-2 border">{r.Player}</td>
                                        <td className="p-2 border">${r.Charge}</td>
                                        <td className="p-2 border">
                                            <span className={`px-2 py-0.5 rounded text-xs ${r.PAID ? 'bg-green-100 text-green-800' : 'bg-red-100 text-red-800'}`}>
                                                {r.PAID ? 'Yes' : 'No'}
                                            </span>
                                        </td>
                                        {role === 'admin' && (
                                            <td className="p-2 border">
                                                <button className="border rounded px-2 py-0.5 mr-1 bg-white hover:bg-gray-50" onClick={() => setPaid(r.Player, true)}>Mark paid</button>
                                                <button className="border rounded px-2 py-0.5 bg-white hover:bg-gray-50" onClick={() => setPaid(r.Player, false)}>Unpay</button>
                                            </td>
                                        )}
                                    </tr>
                                ))}
                                {roster.length === 0 && <tr><td colSpan={4} className="p-4 text-center text-gray-500">No sign-ups yet</td></tr>}
                            </tbody>
                        </table>
                    </div>
                </div>

            </div>
        </div>
    );
}
