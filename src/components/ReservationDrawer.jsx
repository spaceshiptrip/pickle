import React, { useEffect, useMemo, useRef, useState, useCallback } from 'react';
import { VENMO_URL, JAY_PHONE_E164 } from '../config';
import { buildSmsHref, hoursUntil } from '../utils/sms';
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

function formatDateMmmDdYyyy(dateStr) {
  // dateStr = "YYYY-MM-DD"
  const d = new Date(dateStr + 'T00:00:00');
  return d.toLocaleDateString(undefined, {
    month: 'short', // Jan, Feb, Mar
    day: '2-digit',
    year: 'numeric',
  });
}

function formatTimeAmPm(timeStr) {
  // timeStr = "HH:MM" (24h)
  const [h, m] = timeStr.split(':').map(Number);
  const d = new Date();
  d.setHours(h, m, 0, 0);
  return d.toLocaleTimeString(undefined, {
    hour: 'numeric',
    minute: '2-digit',
    hour12: true,
  });
}

export default function ReservationDrawer({ reservation, onClose, role, user, onEditReservation }) {
  const [players, setPlayers] = useState(['']);
  const [playerOthers, setPlayerOthers] = useState(['']);
  const [userNames, setUserNames] = useState([]);

  const [roster, setRoster] = useState([]);
  const [total, setTotal] = useState('');
  const [markPaid, setMarkPaid] = useState(false);

  const isAdmin = role?.toLowerCase() === 'admin';
  const isProposed = reservation.Status === 'proposed';

  // Local event start Date (avoid "Z" so it stays local time)
  const eventStart = useMemo(() => {
    if (!reservation?.Date || !reservation?.Start) return null;
    return new Date(`${reservation.Date}T${reservation.Start}:00`);
  }, [reservation?.Date, reservation?.Start]);

  const hoursToStart = useMemo(() => {
    return eventStart ? hoursUntil(eventStart) : null;
  }, [eventStart]);

  const needsTextWarning = useMemo(() => {
    // Only warn when we can compute it, and it’s within 30 hours
    return typeof hoursToStart === 'number' && hoursToStart >= 0 && hoursToStart <= 30;
  }, [hoursToStart]);



  const smsHref = useMemo(() => {
    const when = reservation?.Date && reservation?.Start
      ? `${formatDateMmmDdYyyy(reservation.Date)} ${formatTimeAmPm(reservation.Start)}`
      : 'the upcoming reservation';

    const body =
      `Hey Jay — quick question about ${when}. ` +
      `ReservationId: ${reservation?.Id || ''}`;

    return buildSmsHref(JAY_PHONE_E164, body);
  }, [reservation?.Date, reservation?.Start, reservation?.Id]);


  function confirmTextWarning() {
    if (!needsTextWarning) return true;

    const when = reservation?.Date && reservation?.Start
      ? `${formatDateMmmDdYyyy(reservation.Date)} ${formatTimeAmPm(reservation.Start)}`
      : 'this reservation';

    const ok = window.confirm(
      `⚠️ Heads up: ${when} starts in under 30 hours.\n\n` +
      `You MUST text Jay to coordinate.\n\n` +
      `Press OK to continue, or Cancel to go text now.`
    );

    if (!ok) {
      // User chose Cancel → open SMS composer immediately
      window.open(smsHref, '_self');
      return false;
    }
    return true;
  }

  const myName = (user?.Name || user?.name || '').trim();

  const isSignedUp = useMemo(() => {
    if (!myName) return false;
    const me = myName.toLowerCase();
    return (roster || []).some(r => String(r.Player || '').trim().toLowerCase() === me);
  }, [roster, myName]);

 async function cancelRsvp(sheetRow) {
  if (uiLocked) return;
  if (!confirmTextWarning()) return;

  const ok = window.confirm('Cancel this RSVP?');
  if (!ok) return;

  setBusy(true);
  try {
    const res = await apiPost('cancelrsvp', {
      reservationId: reservation.Id,
      sheetRow, // ✅ cancels ONE specific row
    });

    if (!res?.ok) {
      showToast('error', res?.error || 'Failed to cancel RSVP');
      return;
    }

    await refreshRoster();
    showToast('success', 'RSVP cancelled');
  } catch (e) {
    showToast('error', 'Failed to cancel RSVP: ' + e.message);
  } finally {
    setBusy(false);
  }
}

  const [updatingPaidFor, setUpdatingPaidFor] = useState(null); // player name or null
  const [toast, setToast] = useState(null); // { type: 'success'|'error', text: string }


  const toastTimerRef = useRef(null);

  // start true so opening shows spinner immediately
  const [rosterLoading, setRosterLoading] = useState(true); 

  // one lock for ALL actions that touch roster
  const [busy, setBusy] = useState(false); 

  const uiLocked = busy || rosterLoading;


  const refreshRoster = useCallback(async () => {
    setRosterLoading(true);
    try {
      const r = await apiGet({ action: 'listattendance', reservationId: reservation.Id });
      if (r?.ok) setRoster(r.attendees || []);
    } finally {
      setRosterLoading(false);
    }
  }, [reservation?.Id]);


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
      setRosterLoading(true);
      try {
        const data = await apiGet({ action: 'listattendance', reservationId: reservation.Id });
        if (!cancelled && data.ok) setRoster(data.attendees || []);
      } catch (e) {
        if (!cancelled) console.error('Failed to load attendance', e);
      } finally {
        if (!cancelled) setRosterLoading(false);
      }
    })();

    return () => { cancelled = true; };
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

  const used = rosterLoading ? '…' : roster.length;

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
    if (uiLocked) return;
    if (!confirmTextWarning()) return;
    setBusy(true);

    try {
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

      const res = await apiPost('signup', {
        reservationId: reservation.Id,
        ...(isAdmin ? { players: names } : {}),
        markPaid,
        totalAmount: total ? Number(total) : totalFees,
      });

      if (!res.ok) {
        showToast('error', res.error || 'Failed to sign up');
        return;
      }

      // IMPORTANT: keep locked while roster refreshes
      await refreshRoster();

      setPlayers(['']);
      setPlayerOthers(['']);
      showToast('success', 'Saved!');
    } catch (e) {
      showToast('error', 'Failed to sign up: ' + e.message);
    } finally {
      setBusy(false);
    }
  }

  async function setPaid(name, paid) {
    if (busy) return;
    setBusy(true);
    setUpdatingPaidFor(name);

    try {
      const r1 = await apiPost('markpaid', { reservationId: reservation.Id, player: name, paid });
      if (!r1.ok) {
        showToast('error', r1.error || 'Failed to update');
        return;
      }

      await refreshRoster();
      showToast('success', paid ? 'Marked paid' : 'Marked unpaid');
    } catch (e) {
      showToast('error', 'Failed to update payment status: ' + e.message);
    } finally {
      setUpdatingPaidFor(null);
      setBusy(false);
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
        <div className={`relative w-full max-w-2xl rounded-xl shadow-2xl border overflow-hidden ${modalShellClass}`}>

          {/* Sticky header */}
          <div className={`sticky top-0 z-30 border-b px-4 py-3 ${headerClass}`}>
            <div className="flex items-start justify-between gap-2">
              <div className="min-w-0 flex-1">
                {/* Line 1: Court/Proposed */}
                <div className="flex items-center gap-2 min-w-0">
                  {isProposed ? (
                    <span className="shrink-0 bg-amber-500 text-white text-[10px] px-2 py-0.5 rounded-full uppercase tracking-tighter">
                      Proposed
                    </span>
                  ) : (
                    <span className="shrink-0 text-base sm:text-lg font-semibold text-slate-900 dark:text-slate-100">
                      Court {reservation.Court} —
                    </span>
                  )}
              
                  {/* Keep this part from blowing up the row */}
                  {!isProposed && (
                    <span className="min-w-0 text-lg font-semibold text-slate-900 dark:text-slate-100 truncate">
                      {/* optional: if you ever add a long location/name, it won't wreck the layout */}
                    </span>
                  )}
                </div>
              
                {/* Line 2: Date/time (wraps naturally) */}
                <div className="mt-0.5 text-sm font-semibold text-slate-700 dark:text-slate-200 break-words">
                  {formatDateMmmDdYyyy(reservation.Date)} ·{' '}
                  {formatTimeAmPm(reservation.Start)} – {formatTimeAmPm(reservation.End)}
                </div>

              </div>
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

                <a
                  href={smsHref}
                  className="flex items-center gap-2 text-sm font-bold px-3 py-1 rounded border
                             bg-white text-slate-900 border-slate-300 hover:bg-slate-50
                             dark:bg-slate-800 dark:text-slate-100 dark:border-slate-700 dark:hover:bg-slate-700"
                  >
                  <span>💬</span>
                  <span>Text Jay</span>
                </a>
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

          {uiLocked && (
            <div className="absolute inset-0 z-20 bg-slate-900/10 dark:bg-slate-900/30 backdrop-blur-[1px] flex items-center justify-center">
              <div className="px-4 py-3 rounded-lg bg-white dark:bg-slate-800 border border-slate-200 dark:border-slate-700 shadow">
                <span className="inline-flex items-center gap-2 text-sm font-semibold text-slate-700 dark:text-slate-200">
                  <Spinner className="h-4 w-4" />
                  Updating…
                </span>
              </div>
            </div>
          )}


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
                        <select disabled={uiLocked}
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
                          <input disabled={uiLocked}
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
                                        ${busy ? 'opacity-60 cursor-not-allowed' : ''}`}
                            onClick={() => {
                              const nextPlayers = [...players, ''];
                              setPlayers(nextPlayers);
                              ensureOtherArrayLength(nextPlayers);
                            }}
                            type="button"
                            disabled={uiLocked}
                          >
                            + Add
                          </button>

                        ) : (
                          <button
                            className={`border rounded px-3 py-1 bg-white hover:bg-slate-50 text-red-600 border-slate-300
                                        dark:bg-slate-800 dark:hover:bg-slate-700 dark:text-red-300 dark:border-slate-700
                                        ${busy ? 'opacity-60 cursor-not-allowed' : ''}`}
                            onClick={() => {
                              const nextPlayers = players.filter((_, j) => j !== i);
                              const nextOthers = playerOthers.filter((_, j) => j !== i);
                              setPlayers(nextPlayers.length ? nextPlayers : ['']);
                              setPlayerOthers(nextOthers.length ? nextOthers : ['']);
                            }}
                            type="button"
                            disabled={uiLocked}
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
                  <input type="checkbox" disabled={uiLocked} checked={markPaid} onChange={(e) => setMarkPaid(e.target.checked)} />
                  Mark as paid now
                </label>
              )}

              <div className="flex gap-2 mt-3 flex-wrap">
                <button
                  className={`bg-blue-600 text-white rounded px-4 py-2 font-semibold inline-flex items-center gap-2
                              ${uiLocked ? 'opacity-60 cursor-not-allowed' : 'hover:bg-blue-700'}`}
                  onClick={submit}
                  type="button"
                  disabled={uiLocked}
                >
                  {uiLocked && <Spinner />}
                  {uiLocked ? 'Updating…' : (isProposed ? 'Sign up for proposal' : 'Submit sign-up')}
                </button>
                
                {!isProposed && (
                  uiLocked ? (
                    <span className="rounded px-4 py-2 font-semibold bg-slate-200 text-slate-500 dark:bg-slate-700 dark:text-slate-300 cursor-not-allowed">
                      Pay ${perPlayer} via Venmo
                    </span>
                  ) : (
                    <a
                      className="rounded px-4 py-2 font-semibold bg-blue-100 text-blue-800 hover:bg-blue-200 transition-colors
                                 dark:bg-indigo-500/15 dark:text-indigo-200 dark:hover:bg-indigo-500/25"
                      href={`${VENMO_URL}?txn=pay&amount=${perPlayer}&note=Pickleball ${reservation.Date} ${reservation.Start}`}
                      target="_blank"
                      rel="noreferrer"
                      onClick={(e) => {
                        if (!confirmTextWarning()) e.preventDefault();
                      }}
                    >
                      Pay ${perPlayer} via Venmo
                    </a>
                  )
                )}
              </div>
            </div>

            <div className="mt-6">
              <div className="flex items-baseline justify-between gap-2 mb-2">
                <div className="font-medium text-slate-900 dark:text-slate-100">
                  Roster
                  <span className="ml-2 text-xs font-semibold text-slate-500 dark:text-slate-400">
                    {formatDateMmmDdYyyy(reservation.Date)}
                  </span>
                </div>
              </div>

              <div className="overflow-x-auto">
                <table className="w-full text-sm border border-slate-200 dark:border-slate-700">
                  <thead>
                    <tr className="bg-slate-50 text-slate-700 dark:bg-slate-900 dark:text-slate-200">
                      <th className="p-2 border border-slate-200 dark:border-slate-700 text-left">Player</th>
                      <th className="p-2 border border-slate-200 dark:border-slate-700 text-left">Charge</th>
                      <th className="p-2 border border-slate-200 dark:border-slate-700 text-left">Paid</th>

                      {!isAdmin && (
                        <th className="p-2 border ... text-left w-[1%] whitespace-nowrap"></th>
                      )}
                    
                      {isAdmin && (
                        <th className="p-2 border border-slate-200 dark:border-slate-700 text-left">Actions</th>
                      )}
                    </tr>
                  </thead>
					<tbody>
					  {rosterLoading && (
						<tr>
						  <td colSpan={isAdmin ? 4 : 4} className="p-4 text-center text-slate-500 dark:text-slate-400">
							<span className="inline-flex items-center gap-2">
							  <Spinner className="h-4 w-4" />
							  Loading roster…
							</span>
						  </td>
						</tr>
					  )}


{!rosterLoading && roster.map((r) => {
  const isMine =
    !isAdmin &&
    myName &&
    String(r.Player || '').trim().toLowerCase() === myName.toLowerCase();

  return (
    <tr
      key={r._sheetRow}
      className="hover:bg-slate-50 dark:hover:bg-slate-800/60"
    >
      <td className="p-2 border border-slate-200 dark:border-slate-700">
        {r.Player}
      </td>

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

      {/* ✅ NON-ADMIN CANCEL BUTTON (only shows on YOUR rows) */}
      {!isAdmin && (
        <td className="p-2 border border-slate-200 dark:border-slate-700">
          {isMine ? (
            <button
              type="button"
              disabled={uiLocked}
              onClick={() => r._sheetRow && cancelRsvp(r._sheetRow)}
              className={`rounded px-3 py-1 text-xs font-semibold border
                border-rose-300 text-rose-700 bg-white hover:bg-rose-50
                dark:bg-slate-900 dark:border-rose-500/40 dark:text-rose-200 dark:hover:bg-rose-500/10
                ${uiLocked ? 'opacity-60 cursor-not-allowed' : ''}`}
            >
              Cancel
            </button>
          ) : null}
        </td>
      )}

      {isAdmin && (
        <td className="p-2 border border-slate-200 dark:border-slate-700">
          <div className="flex items-center gap-2">
            {updatingPaidFor === r.Player && (
              <span className="text-xs text-slate-500 dark:text-slate-400">Updating…</span>
            )}
            <button
              className={`border rounded px-2 py-0.5 bg-white hover:bg-gray-50
                          dark:bg-slate-900 dark:text-slate-100 dark:border-slate-700 dark:hover:bg-slate-800
                          ${busy ? 'opacity-60 cursor-not-allowed' : ''}`}
              onClick={() => setPaid(r.Player, true)}
              type="button"
              disabled={uiLocked}
            >
              Mark paid
            </button>

            <button
              className={`border rounded px-2 py-0.5 bg-white hover:bg-gray-50
                          dark:bg-slate-900 dark:text-slate-100 dark:border-slate-700 dark:hover:bg-slate-800
                          ${busy ? 'opacity-60 cursor-not-allowed' : ''}`}
              onClick={() => setPaid(r.Player, false)}
              type="button"
              disabled={uiLocked}
            >
              Unpay
            </button>
          </div>
        </td>
      )}
    </tr>
  );
})}


					  {!rosterLoading && roster.length === 0 && (
						<tr>
						  <td colSpan={isAdmin ? 4 : 4} className="p-4 text-center text-slate-500 dark:text-slate-400">
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

