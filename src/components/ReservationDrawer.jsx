import React, { useEffect, useMemo, useState } from 'react';
import { VENMO_URL } from '../config';
import { apiGet, apiPost } from '../api';

const EXTRA_NAME_OPTIONS = ['TBD', 'Other'];

export default function ReservationDrawer({ reservation, onClose, role, onEditReservation }) {
    const [players, setPlayers] = useState(['']);
    const [playerOthers, setPlayerOthers] = useState(['']);
    const [userNames, setUserNames] = useState([]);

    const [roster, setRoster] = useState([]);
    const [total, setTotal] = useState('');
    const [markPaid, setMarkPaid] = useState(false);

    const isAdmin = role?.toLowerCase() === 'admin';
    // Proposed Dates feature (Issue #31)
    const isProposed = reservation.Status === 'proposed';

    // Lock page scroll while modal is open (prevents the “scroll behind” trap)
    useEffect(() => {
        const prevOverflow = document.body.style.overflow;
        const prevPaddingRight = document.body.style.paddingRight;

        // avoid layout shift when scrollbar disappears (desktop)
        const scrollBarWidth = window.innerWidth - document.documentElement.clientWidth;
        document.body.style.overflow = 'hidden';
        if (scrollBarWidth > 0) document.body.style.paddingRight = `${scrollBarWidth}px`;

        return () => {
            document.body.style.overflow = prevOverflow;
            document.body.style.paddingRight = prevPaddingRight;
        };
    }, []);

    // ESC to close
    useEffect(() => {
        const onKeyDown = (e) => {
            if (e.key === 'Escape') onClose?.();
        };
        window.addEventListener('keydown', onKeyDown);
        return () => window.removeEventListener('keydown', onKeyDown);
    }, [onClose]);

    const totalFees = useMemo(() => {
        const fees = (reservation.Fees || []).reduce((a, f) => a + (Number(f.Amount) || 0), 0);
        return (Number(reservation.BaseFee) || 0) + fees;
    }, [reservation]);

    // Load roster
		// useEffect(() => {
			// (async () => {
				// try {
					// console.log("Fetching attendance for reservation", reservation?.Id);
					// const data = await apiGet({ action: 'listattendance', reservationId: reservation.Id });
					// console.log("listattendance response:", data);
					// if (data.ok) setRoster(data.attendees || []);
					// else console.warn("listattendance not ok:", data);
				// } catch (e) {
					// console.error('Failed to load attendance', e);
				// }
			// })();
		// }, [reservation?.Id]);


		useEffect(() => {
			let cancelled = false;

			(async () => {
				try {
					console.log("Fetching attendance for reservation", reservation?.Id);
					const data = await apiGet({ action: 'listattendance', reservationId: reservation.Id });
					console.log("listattendance response:", data);

					if (!cancelled && data.ok) setRoster(data.attendees || []);
				} catch (e) {
					if (!cancelled) console.error('Failed to load attendance', e);
				}
			})();

			return () => { cancelled = true; };
		}, [reservation?.Id]);


    // Load user list for admin dropdown
    useEffect(() => {
        if (!isAdmin) return;
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
                    const uniq = Array.from(new Set(names)).sort((a, b) => a.localeCompare(b));
                    setUserNames(uniq);
                }
            } catch (e) {
                console.error('Failed to load users', e);
            }
        })();
    }, [isAdmin]);



		// Debug: mount/unmount
		useEffect(() => {
			console.log("ReservationDrawer mounted", { reservationId: reservation?.Id });
			return () => console.log("ReservationDrawer unmounted", { reservationId: reservation?.Id });
		}, []);

		// Debug: whenever roster updates
		useEffect(() => {
			console.log("ReservationDrawer roster updated:", roster);
		}, [roster]);


    const allNameOptions = useMemo(() => {
        return [...(userNames || []), ...EXTRA_NAME_OPTIONS];
    }, [userNames]);

    const perPlayer = useMemo(() => {
        const amt = total ? Number(total) : totalFees;

        let count = 1;
        if (isAdmin) {
            const resolved = players
                .map((p, i) => {
                    const v = (p || '').trim();
                    if (!v) return '';
                    if (v === 'Other') return (playerOthers[i] || '').trim();
                    return v;
                })
                .filter(Boolean);
            count = Math.max(resolved.length, 1);
        }

        return Math.round((amt / count) * 100) / 100;
    }, [total, totalFees, players, playerOthers, isAdmin]);

    const used = roster.length;
    const cap = reservation.Capacity || 0;

    function ensureOtherArrayLength(nextPlayers) {
        const nextOthers = [...playerOthers];
        while (nextOthers.length < nextPlayers.length) nextOthers.push('');
        while (nextOthers.length > nextPlayers.length) nextOthers.pop();
        setPlayerOthers(nextOthers);
    }

    async function submit() {
        const names = isAdmin
            ? players
                .map((p, i) => {
                    const v = (p || '').trim();
                    if (!v) return '';
                    if (v === 'Other') return (playerOthers[i] || '').trim();
                    return v;
                })
                .filter(Boolean)
            : [];

        if (isAdmin && names.length === 0) return;

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

    return (
        // Backdrop is scrollable. This is the key.
        <div
            className="fixed inset-0 z-[9999] overflow-y-auto overscroll-contain"
            style={{ backgroundColor: 'rgba(15, 23, 42, 0.75)', backdropFilter: 'blur(4px)' }}
            role="dialog"
            aria-modal="true"
            // click outside to close (optional but helps users escape)
            onMouseDown={(e) => {
                if (e.target === e.currentTarget) onClose?.();
            }}
            onTouchStart={(e) => {
                if (e.target === e.currentTarget) onClose?.();
            }}
        >
            {/* Centering wrapper that allows scrolling when content is tall */}
            <div className="min-h-full flex items-center justify-center p-2 sm:p-6 py-8">
                {/* The modal itself can be natural height; the page/backdrop scroll handles overflow */}
                <div className={`w-full max-w-2xl rounded-xl shadow-2xl border overflow-hidden ${isProposed ? 'bg-amber-50 border-amber-200' : 'bg-white border-gray-200'}`}>
                    {/* Sticky header ALWAYS visible within the modal while modal scrolls in backdrop */}
                    <div className={`sticky top-0 z-10 border-b px-4 py-3 ${isProposed ? 'bg-amber-100 border-amber-200' : 'bg-white'}`}>
                        <div className="flex justify-between items-center gap-2">
                            <h2 className="text-lg font-semibold truncate flex items-center gap-2">
                                {isProposed ? (
                                    <span className="bg-amber-500 text-white text-[10px] px-2 py-0.5 rounded-full uppercase tracking-tighter">Proposed</span>
                                ) : (
                                    <span>Court {reservation.Court} — </span>
                                )}
                                <span>{reservation.Date} {reservation.Start}-{reservation.End}</span>
                            </h2>

                            <div className="flex items-center gap-2 shrink-0">
                                {isAdmin && (
                                    <button
                                        onClick={() => {
                                            if (onEditReservation) return onEditReservation(reservation);
                                            alert('Edit (admin) clicked — wire onEditReservation() when ready.');
                                        }}
                                        className={`text-xs font-black uppercase tracking-widest px-3 py-1 border rounded hover:bg-opacity-80 transition-colors ${isProposed ? 'bg-amber-600 text-white border-amber-700' : 'bg-indigo-50 text-indigo-700 border-indigo-200'
                                            }`}
                                        type="button"
                                    >
                                        {isProposed ? 'Review & Confirm' : 'Edit'}
                                    </button>
                                )}

                                <button
                                    onClick={onClose}
                                    className="flex items-center gap-2 text-sm font-bold px-3 py-1 bg-black text-white rounded hover:bg-gray-900 transition-colors"
                                    type="button"
                                >
                                    <span>✕</span>
                                    <span>Close</span>
                                </button>
                            </div>
                        </div>
                    </div>

                    {/* Content */}
                    <div className="px-4 py-4 pb-24">
                        {!isProposed && (
                            <div className="mt-1 text-sm bg-gray-50 p-2 rounded">
                                <div>
                                    Capacity: {used}/{cap}
                                </div>
                                <div>Base fee: ${reservation.BaseFee}</div>
                                {reservation.Fees?.length > 0 && (
                                    <div>Extras: {reservation.Fees.map((f) => `${f.FeeName} $${f.Amount}`).join(', ')}</div>
                                )}
                                <div className="mt-1 font-semibold">Suggested total: ${totalFees}</div>
                            </div>
                        )}

                        <div className="mt-4 border rounded p-3">
                            <div className="font-medium mb-2">Sign up</div>

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

                            {!isProposed && (
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
                            )}

                            {isAdmin && (
                                <label className="flex items-center gap-2 text-sm mb-2">
                                    <input type="checkbox" checked={markPaid} onChange={(e) => setMarkPaid(e.target.checked)} />
                                    Mark as paid now
                                </label>
                            )}

                            <div className="flex gap-2 mt-3 flex-wrap">
                                <button className="bg-blue-600 text-white rounded px-4 py-2 font-semibold" onClick={submit} type="button">
                                    {isProposed ? 'Sign up for proposal' : 'Submit sign-up'}
                                </button>

                                {!isProposed && (
                                    <a
                                        className="bg-blue-100 text-blue-800 rounded px-4 py-2 font-semibold"
                                        href={`${VENMO_URL}?txn=pay&amount=${perPlayer}&note=Pickleball ${reservation.Date} ${reservation.Start}`}
                                        target="_blank"
                                        rel="noreferrer"
                                    >
                                        Pay ${perPlayer} via Venmo
                                    </a>
                                )}
                            </div>
                        </div>

                        <div className="mt-6">
                            <div className="font-medium mb-2">Roster</div>
                            <div className="overflow-x-auto">

																{/*
																// <div className="text-xs text-gray-500 mb-2">
																	// Debug roster: {roster.length} —
																	// {roster.map(r => r.Player).join(', ')}
																// </div>
																*/}

                                <table className="w-full text-sm border">
                                    <thead>
                                        <tr className="bg-gray-50">
                                            <th className="p-2 border text-left">Player</th>
                                            <th className="p-2 border text-left">Charge</th>
                                            <th className="p-2 border text-left">Paid</th>
                                            {isAdmin && <th className="p-2 border text-left">Actions</th>}
                                        </tr>
                                    </thead>
																		<tbody>
																			{roster.map((r) => (
																				<tr key={`${r.ReservationId}-${r.Player}`}>
																					<td className="p-2 border">{r.Player}</td>
																					<td className="p-2 border">{r.Charge != null ? `$${r.Charge}` : '-'}</td>
																					<td className="p-2 border">
																						{r.PAID != null ? (
																							<span className={`px-2 py-0.5 rounded text-xs ${r.PAID ? 'bg-green-100 text-green-800' : 'bg-red-100 text-red-800'}`}>
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
																								type="button"
																							>
																								Mark paid
																							</button>
																							<button
																								className="border rounded px-2 py-0.5 bg-white hover:bg-gray-50"
																								onClick={() => setPaid(r.Player, false)}
																								type="button"
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

                        <div className="h-4" />
                    </div>
                </div>
            </div>

            {/* Fail-safe floating close button: ALWAYS reachable */}
            <button
                onClick={onClose}
                className="fixed bottom-4 right-4 z-[60] bg-black text-white px-4 py-3 rounded-full font-bold shadow-lg hover:bg-gray-900 sm:hidden"
                type="button"
                aria-label="Close dialog"
            >
                ✕ Close
            </button>
        </div>
    );
}

