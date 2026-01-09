import React, { useEffect, useMemo, useRef, useState, useCallback } from 'react';
import { VENMO_URL } from '../config';
import { apiGet, apiPost } from '../api';

const EXTRA_NAME_OPTIONS = ['TBD', 'Other'];

function Spinner({ className = "h-4 w-4" }) {
  return (
    <span
      className={`inline-block animate-spin rounded-full border-2 border-current border-t-transparent ${className}`}
      aria-hidden="true"
    />
  );
}

export default function ReservationDrawer({ reservation, onClose, role, onEditReservation }) {
  const [players, setPlayers] = useState(['']);
  const [playerOthers, setPlayerOthers] = useState(['']);
  const [userNames, setUserNames] = useState([]);

  const [roster, setRoster] = useState([]);
  const [total, setTotal] = useState('');
  const [markPaid, setMarkPaid] = useState(false);

  const isAdmin = role?.toLowerCase() === 'admin';
  const isProposed = reservation.Status === 'proposed';


  const [submitting, setSubmitting] = useState(false);
  const [updatingPaidFor, setUpdatingPaidFor] = useState(null); // player name or null
  const [toast, setToast] = useState(null); // { type: 'success'|'error', text: string }


  const toastTimerRef = useRef(null);


  const handleClose = useCallback(() => {
    if (toastTimerRef.current) {
      window.clearTimeout(toastTimerRef.current);
      toastTimerRef.current = null;
    }
    setToast(null);
    onClose?.();
  }, [onClose]);


  // Lock page scroll while modal is open
  useEffect(() => {
    const prevOverflow = document.body.style.overflow;
    const prevPaddingRight = document.body.style.paddingRight;

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
      if (e.key === 'Escape') handleClose();
    };
    window.addEventListener('keydown', onKeyDown);
    return () => window.removeEventListener('keydown', onKeyDown);
  }, [handleClose]);

  // totalFees calc
  const totalFees = useMemo(() => {
    const fees = (reservation.Fees || []).reduce((a, f) => a + (Number(f.Amount) || 0), 0);
    return (Number(reservation.BaseFee) || 0) + fees;
  }, [reservation]);

  // Load roster
  useEffect(() => {
    let cancelled = false;

    (async () => {
      try {
        const data = await apiGet({ action: 'listattendance', reservationId: reservation.Id });
        if (!cancelled && data.ok) setRoster(data.attendees || []);
      } catch (e) {
        if (!cancelled) console.error('Failed to load attendance', e);
      }
    })();

    return () => {
      cancelled = true;
    };
  }, [reservation?.Id]);

  // for toast timer
  useEffect(() => {
    return () => {
      if (toastTimerRef.current) {
        window.clearTimeout(toastTimerRef.current);
        toastTimerRef.current = null;
      }
    };
  }, []);

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

  function showToast(type, text, ms = 2000) {
    setToast({ type, text });

    if (toastTimerRef.current) {
      window.clearTimeout(toastTimerRef.current);
      toastTimerRef.current = null;
    }

    toastTimerRef.current = window.setTimeout(() => {
      setToast(null);
      toastTimerRef.current = null;
    }, ms);
  }




  async function submit() {
    if (submitting) return; // ✅ prevent double-submits
    setSubmitting(true);

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
  
    if (isAdmin && names.length === 0) {
      setSubmitting(false);
      return;
    }
  
    if (isAdmin) {
      const hasOtherMissing = players.some((p, i) => p === 'Other' && !(playerOthers[i] || '').trim());
      if (hasOtherMissing) {
        setSubmitting(false);
        return alert('Please fill in the name for any "Other" player.');
      }
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
        showToast('success', 'Saved!');
      } else {
        showToast('error', res.error || 'Failed to sign up');
      }
    } catch (e) {
      showToast('error', 'Failed to sign up: ' + e.message);
    } finally {
      setSubmitting(false);
    }
  }

  async function setPaid(name, paid) {
    if (updatingPaidFor) return; // ✅ prevent multiple payment updates at once
    setUpdatingPaidFor(name);
  
    try {
      const r1 = await apiPost('markpaid', { reservationId: reservation.Id, player: name, paid });
      if (!r1.ok) {
        showToast('error', r1.error || 'Failed to update');
        return;
      }

      const r2 = await apiGet({ action: 'listattendance', reservationId: reservation.Id });
      if (r2.ok) setRoster(r2.attendees);
      showToast('success', paid ? 'Marked paid' : 'Marked unpaid');
    } catch (e) {
      showToast('error', 'Failed to update payment status: ' + e.message);
    } finally {
      setUpdatingPaidFor(null);
    }
  }

  // Shared styling helpers (keeps dark mode consistent)
  const modalShellClass = isProposed
    ? 'bg-amber-50 border-amber-200 dark:bg-amber-500/10 dark:border-amber-500/30'
    : 'bg-white border-slate-200 dark:bg-slate-800 dark:border-slate-700';

  const headerClass = isProposed
    ? 'bg-amber-100 border-amber-200 dark:bg-amber-500/15 dark:border-amber-500/30'
    : 'bg-white dark:bg-slate-900 dark:border-slate-700';

  const panelClass =
    'border rounded p-3 bg-white dark:bg-slate-900/40 dark:border-slate-700';

  const inputClass =
    'border rounded px-2 py-1 w-full bg-white text-slate-900 border-slate-300 ' +
    'dark:bg-slate-900 dark:text-slate-100 dark:border-slate-700 ' +
    'placeholder:text-slate-400 dark:placeholder:text-slate-500';

  const selectClass =
    'border rounded px-2 py-1 w-full bg-white text-slate-900 border-slate-300 ' +
    'dark:bg-slate-900 dark:text-slate-100 dark:border-slate-700';

  const subtleTextClass = 'text-slate-600 dark:text-slate-300';

  return (
    <div
      className="fixed inset-0 z-[9999] overflow-y-auto overscroll-contain"
      style={{ backgroundColor: 'rgba(15, 23, 42, 0.75)', backdropFilter: 'blur(4px)' }}
      role="dialog"
      aria-modal="true"
      onMouseDown={(e) => {
        if (e.target === e.currentTarget) handleClose();
      }}
      onTouchStart={(e) => {
        if (e.target === e.currentTarget) handleClose();
      }}
    >
      <div className="min-h-full flex items-center justify-center p-2 sm:p-6 py-8">
        <div className={`w-full max-w-2xl rounded-xl shadow-2xl border overflow-hidden ${modalShellClass}`}>
          {/* Sticky header */}
          <div className={`sticky top-0 z-10 border-b px-4 py-3 ${headerClass}`}>
            <div className="flex justify-between items-center gap-2">
              <h2 className="text-lg font-semibold truncate flex items-center gap-2 text-slate-900 dark:text-slate-100">
                {isProposed ? (
                  <span className="bg-amber-500 text-white text-[10px] px-2 py-0.5 rounded-full uppercase tracking-tighter">
                    Proposed
                  </span>
                ) : (
                  <span>Court {reservation.Court} — </span>
                )}
                <span className="text-slate-700 dark:text-slate-200">
                  {reservation.Date} {reservation.Start}-{reservation.End}
                </span>
              </h2>

              <div className="flex items-center gap-2 shrink-0">
                {isAdmin && (
                  <button
                    onClick={() => {
                      if (onEditReservation) return onEditReservation(reservation);
                      alert('Edit (admin) clicked — wire onEditReservation() when ready.');
                    }}
                    className={`text-xs font-black uppercase tracking-widest px-3 py-1 border rounded transition-colors ${
                      isProposed
                        ? 'bg-amber-600 text-white border-amber-700 hover:bg-amber-700'
                        : 'bg-indigo-50 text-indigo-700 border-indigo-200 hover:bg-indigo-100 dark:bg-indigo-500/15 dark:text-indigo-200 dark:border-indigo-500/30 dark:hover:bg-indigo-500/25'
                    }`}
                    type="button"
                  >
                    {isProposed ? 'Review & Confirm' : 'Edit'}
                  </button>
                )}

                <button
                  onClick={handleClose}
                  className="flex items-center gap-2 text-sm font-bold px-3 py-1 bg-black text-white rounded hover:bg-gray-900 transition-colors"
                  type="button"
                >
                  <span>✕</span>
                  <span>Close</span>
                </button>
              </div>
            </div>
          </div>


          {/* Toast */}
          {toast && (
            <div
              className={`mx-4 mt-4 rounded-lg px-3 py-2 text-sm font-semibold
                ${toast.type === 'success'
                  ? 'bg-emerald-50 text-emerald-800 border border-emerald-200 dark:bg-emerald-500/15 dark:text-emerald-200 dark:border-emerald-500/30'
                  : 'bg-rose-50 text-rose-800 border border-rose-200 dark:bg-rose-500/15 dark:text-rose-200 dark:border-rose-500/30'
                }`}
              role="status"
              aria-live="polite"
            >
              {toast.text}
            </div>
          )}


          {/* Content */}
          <div className="px-4 py-4 pb-24 text-slate-900 dark:text-slate-100">
            {!isProposed && (
              <div className="mt-1 text-sm rounded p-2 bg-slate-50 border border-slate-200 text-slate-700 dark:bg-slate-900/40 dark:border-slate-700 dark:text-slate-200">
                <div>
                  <span className={subtleTextClass}>Capacity:</span> {used}/{cap}
                </div>
                <div>
                  <span className={subtleTextClass}>Base fee:</span> ${reservation.BaseFee}
                </div>
                {reservation.Fees?.length > 0 && (
                  <div>
                    <span className={subtleTextClass}>Extras:</span>{' '}
                    {reservation.Fees.map((f) => `${f.FeeName} $${f.Amount}`).join(', ')}
                  </div>
                )}
                <div className="mt-1 font-semibold text-slate-900 dark:text-slate-100">
                  Suggested total: ${totalFees}
                </div>
              </div>
            )}

            <div className={`mt-4 ${panelClass}`}>
              <div className="font-medium mb-2 text-slate-900 dark:text-slate-100">Sign up</div>

              {isAdmin &&
                players.map((p, i) => {
                  const isOther = p === 'Other';

                  return (
                    <div key={i} className="flex gap-2 mb-2 flex-wrap">
                      <div className="flex-1 min-w-[220px]">
                        <select
                          className={selectClass}
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
                            className={inputClass}
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
                            className={`border rounded px-3 py-1 bg-white hover:bg-slate-50 text-slate-900 border-slate-300
                                        dark:bg-slate-800 dark:hover:bg-slate-700 dark:text-slate-100 dark:border-slate-700
                                        ${submitting ? 'opacity-60 cursor-not-allowed' : ''}`}
                            onClick={() => {
                              const nextPlayers = [...players, ''];
                              setPlayers(nextPlayers);
                              ensureOtherArrayLength(nextPlayers);
                            }}
                            type="button"
                            disabled={submitting}
                          >
                            + Add
                          </button>

                        ) : (
                          <button
                            className={`border rounded px-3 py-1 bg-white hover:bg-slate-50 text-red-600 border-slate-300
                                        dark:bg-slate-800 dark:hover:bg-slate-700 dark:text-red-300 dark:border-slate-700
                                        ${submitting ? 'opacity-60 cursor-not-allowed' : ''}`}
                            onClick={() => {
                              const nextPlayers = players.filter((_, j) => j !== i);
                              const nextOthers = playerOthers.filter((_, j) => j !== i);
                              setPlayers(nextPlayers.length ? nextPlayers : ['']);
                              setPlayerOthers(nextOthers.length ? nextOthers : ['']);
                            }}
                            type="button"
                            disabled={submitting}
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
                  <label className={`text-sm ${subtleTextClass}`}>Total you’ll pay now (optional):</label>
                  <input
                    className={`${inputClass} w-28`}
                    placeholder={String(totalFees)}
                    value={total}
                    onChange={(e) => setTotal(e.target.value)}
                  />
                  <span className="text-sm text-slate-500 dark:text-slate-300">= ~ ${perPlayer}/player</span>
                </div>
              )}

              {isAdmin && (
                <label className={`flex items-center gap-2 text-sm mb-2 ${subtleTextClass}`}>
                  <input type="checkbox" checked={markPaid} onChange={(e) => setMarkPaid(e.target.checked)} />
                  Mark as paid now
                </label>
              )}

              <div className="flex gap-2 mt-3 flex-wrap">
                <button
                  className={`bg-blue-600 text-white rounded px-4 py-2 font-semibold inline-flex items-center gap-2
                              ${submitting ? 'opacity-60 cursor-not-allowed' : 'hover:bg-blue-700'}`}
                  onClick={submit}
                  type="button"
                  disabled={submitting}
                >
                  {submitting && <Spinner />}
                  {submitting ? 'Submitting…' : (isProposed ? 'Sign up for proposal' : 'Submit sign-up')}
                </button>


                {!isProposed && (
                  <a
                    className="rounded px-4 py-2 font-semibold bg-blue-100 text-blue-800 hover:bg-blue-200 transition-colors
                               dark:bg-indigo-500/15 dark:text-indigo-200 dark:hover:bg-indigo-500/25"
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
              <div className="font-medium mb-2 text-slate-900 dark:text-slate-100">Roster</div>
              <div className="overflow-x-auto">
                <table className="w-full text-sm border border-slate-200 dark:border-slate-700">
                  <thead>
                    <tr className="bg-slate-50 text-slate-700 dark:bg-slate-900 dark:text-slate-200">
                      <th className="p-2 border border-slate-200 dark:border-slate-700 text-left">Player</th>
                      <th className="p-2 border border-slate-200 dark:border-slate-700 text-left">Charge</th>
                      <th className="p-2 border border-slate-200 dark:border-slate-700 text-left">Paid</th>
                      {isAdmin && <th className="p-2 border border-slate-200 dark:border-slate-700 text-left">Actions</th>}
                    </tr>
                  </thead>

                  <tbody>
                    {roster.map((r) => (
                      <tr
                        key={`${r.ReservationId}-${r.Player}`}
                        className="hover:bg-slate-50 dark:hover:bg-slate-800/60"
                      >
                        <td className="p-2 border border-slate-200 dark:border-slate-700">{r.Player}</td>
                        <td className="p-2 border border-slate-200 dark:border-slate-700">
                          {r.Charge != null ? `$${r.Charge}` : '-'}
                        </td>
                        <td className="p-2 border border-slate-200 dark:border-slate-700">
                          {r.PAID != null ? (
                            <span
                              className={`px-2 py-0.5 rounded text-xs ${
                                r.PAID
                                  ? 'bg-green-100 text-green-800 dark:bg-emerald-500/15 dark:text-emerald-200'
                                  : 'bg-red-100 text-red-800 dark:bg-rose-500/15 dark:text-rose-200'
                              }`}
                            >
                              {r.PAID ? 'Yes' : 'No'}
                            </span>
                          ) : (
                            <span className="text-slate-400 dark:text-slate-500 italic">Private</span>
                          )}
                        </td>

                        {isAdmin && (
                          <td className="p-2 border border-slate-200 dark:border-slate-700">
                            <div className="flex items-center gap-2">
                              {updatingPaidFor === r.Player && (
                                <span className="text-xs text-slate-500 dark:text-slate-400">Updating…</span>
                              )}
                              <button
                                className={`border rounded px-2 py-0.5 bg-white hover:bg-gray-50
                                            dark:bg-slate-900 dark:text-slate-100 dark:border-slate-700 dark:hover:bg-slate-800
                                            ${updatingPaidFor ? 'opacity-60 cursor-not-allowed' : ''}`}
                                onClick={() => setPaid(r.Player, true)}
                                type="button"
                                disabled={!!updatingPaidFor}
                              >
                                Mark paid
                              </button>
                          
                              <button
                                className={`border rounded px-2 py-0.5 bg-white hover:bg-gray-50
                                            dark:bg-slate-900 dark:text-slate-100 dark:border-slate-700 dark:hover:bg-slate-800
                                            ${updatingPaidFor ? 'opacity-60 cursor-not-allowed' : ''}`}
                                onClick={() => setPaid(r.Player, false)}
                                type="button"
                                disabled={!!updatingPaidFor}
                              >
                                Unpay
                              </button>
                            </div>
                          </td>
                        )}
                      </tr>
                    ))}

                    {roster.length === 0 && (
                      <tr>
                        <td
                          colSpan={isAdmin ? 4 : 3}
                          className="p-4 text-center text-slate-500 dark:text-slate-400"
                        >
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

      {/* Mobile fail-safe close button */}
      <button
        onClick={handleClose}
        className="fixed bottom-4 right-4 z-[60] bg-black text-white px-4 py-3 rounded-full font-bold shadow-lg hover:bg-gray-900 sm:hidden"
        type="button"
        aria-label="Close dialog"
      >
        ✕ Close
      </button>
    </div>
  );
}

