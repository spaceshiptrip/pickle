import { useState } from 'react';
import { APP_SCRIPT_URL, ACCESS_CODE, ORGANIZER_CODE, DEFAULT_AMOUNT, VENMO_URL } from './config';

function formatToday() {
  const d = new Date();
  const year = d.getFullYear();
  const month = String(d.getMonth() + 1).padStart(2, '0');
  const day = String(d.getDate()).padStart(2, '0');
  return `${year}-${month}-${day}`;
}

function App() {
  const [stage, setStage] = useState('login'); // 'login' | 'checkin'
  const [userName, setUserName] = useState('');
  const [accessCodeInput, setAccessCodeInput] = useState('');
  const [loginError, setLoginError] = useState('');
  const [isOrganizer, setIsOrganizer] = useState(false);

  const [checkinDate, setCheckinDate] = useState(formatToday());
  const [otherNames, setOtherNames] = useState('');
  const [isPaying, setIsPaying] = useState(false);
  const [amount, setAmount] = useState(DEFAULT_AMOUNT);
  const [status, setStatus] = useState(null);
  const [isSubmitting, setIsSubmitting] = useState(false);

  // Admin / summary view state
  const [adminRows, setAdminRows] = useState([]);
  const [adminLoading, setAdminLoading] = useState(false);
  const [adminError, setAdminError] = useState(null);

  const handleLogin = (e) => {
    e.preventDefault();
    const trimmedName = userName.trim();
    const code = accessCodeInput.trim();

    if (!trimmedName) {
      setLoginError('Please enter your name.');
      return;
    }

    if (code === ORGANIZER_CODE) {
      setIsOrganizer(true);
      setLoginError('');
      setStage('checkin');
      return;
    }

    if (code === ACCESS_CODE) {
      setIsOrganizer(false);
      setLoginError('');
      setStage('checkin');
      return;
    }

    setLoginError('Invalid access code.');
  };

  const handleSubmitCheckin = async (e) => {
    e.preventDefault();
    setIsSubmitting(true);
    setStatus(null);

    const targets = [];
    const trimmedUser = userName.trim();
    if (trimmedUser) {
      targets.push(trimmedUser);
    }

    if (otherNames.trim()) {
      otherNames
        .split(',')
        .map((n) => n.trim())
        .filter((n) => n.length > 0)
        .forEach((n) => targets.push(n));
    }

    if (targets.length === 0) {
      setStatus('Please enter at least one person to check in.');
      setIsSubmitting(false);
      return;
    }

    const payload = {
      userName: trimmedUser,
      targets,
      paid: isPaying,
      amount: isPaying ? Number(amount) || 0 : 0,
      date: checkinDate, // YYYY-MM-DD
    };

    try {
      const body = new URLSearchParams({ payload: JSON.stringify(payload) });

      // We don't need to read the response body here, so no-cors is fine.
      await fetch(APP_SCRIPT_URL, {
        method: 'POST',
        mode: 'no-cors',
        headers: {
          'Content-Type': 'application/x-www-form-urlencoded',
        },
        body,
      });

      setStatus('Check-in submitted. If something looks off, tell the organizer.');
      setOtherNames('');
      if (!isPaying) {
        setAmount(DEFAULT_AMOUNT);
      }
    } catch (err) {
      console.error(err);
      setStatus('Error sending check-in. Please try again or contact the organizer.');
    } finally {
      setIsSubmitting(false);
    }
  };

  const handleVenmoClick = () => {
    if (VENMO_URL && VENMO_URL !== 'https://venmo.com/your-handle') {
      window.open(VENMO_URL, '_blank', 'noopener,noreferrer');
    } else {
      alert('Venmo link is not configured yet. Ask the organizer to set VENMO_URL in config.js.');
    }
  };

  const handleCopyTotalAmount = async () => {
    try {
      const value = isNaN(Number(amount)) ? '' : Number(amount).toFixed(2);
      if (!value) {
        setStatus('Nothing to copy – please enter an amount first.');
        return;
      }
      await navigator.clipboard.writeText(value);
      setStatus(`Copied total amount ${value} to clipboard.`);
    } catch (err) {
      console.error(err);
      setStatus('Unable to copy amount to clipboard.');
    }
  };

  const handleLoadAdminView = async () => {
    setAdminLoading(true);
    setAdminError(null);
    setAdminRows([]);

    try {
      const url = `${APP_SCRIPT_URL}?date=${encodeURIComponent(checkinDate)}`;
      const resp = await fetch(url);
      const data = await resp.json();
      if (data.status !== 'ok') {
        throw new Error(data.message || 'Unknown error from backend');
      }
      setAdminRows(data.rows || []);
    } catch (err) {
      console.error(err);
      setAdminError('Unable to load check-ins for that date. (CORS or script error)');
    } finally {
      setAdminLoading(false);
    }
  };

  const handleCopyTotalCollected = async (totalCharge) => {
    try {
      const formatted = totalCharge.toFixed(2);
      await navigator.clipboard.writeText(formatted);
      setStatus(`Copied total collected ${formatted} to clipboard.`);
    } catch (err) {
      console.error(err);
      setStatus('Unable to copy total collected.');
    }
  };

  // Summary metrics for admin view
  const totalPlayers = adminRows.length;
  const totalPaidPlayers = adminRows.filter((r) => r.paid).length;
  const totalCharge = adminRows.reduce((sum, r) => sum + (Number(r.charge) || 0), 0);

  if (stage === 'login') {
    return (
      <div className="app">
        <h1>Pickleball Check-In</h1>
        <form className="card" onSubmit={handleLogin}>
          <div className="field">
            <label>Your Name</label>
            <input
              type="text"
              value={userName}
              onChange={(e) => setUserName(e.target.value)}
              placeholder="e.g., Jay Torres"
              required
            />
          </div>

          <div className="field">
            <label>Access Code</label>
            <input
              type="password"
              value={accessCodeInput}
              onChange={(e) => setAccessCodeInput(e.target.value)}
              placeholder="Player or organizer code"
              required
            />
            <small>
              Players use the <strong>player code</strong>; organizers use the <strong>organizer code</strong> to unlock the admin view.
            </small>
          </div>

          {loginError && <p className="error">{loginError}</p>}

          <button type="submit">Log In</button>
        </form>
      </div>
    );
  }

  return (
    <div className="app">
      <h1>Pickleball Check-In</h1>
      <p className="subtitle">
        Logged in as <strong>{userName}</strong>{' '}
        {isOrganizer && <span className="badge">Organizer</span>}
      </p>

      <form className="card" onSubmit={handleSubmitCheckin}>
        <div className="field">
          <label>Check-in date</label>
          <input
            type="date"
            value={checkinDate}
            onChange={(e) => setCheckinDate(e.target.value)}
          />
        </div>

        <div className="field">
          <label>Checking in yourself</label>
          <p>(You are automatically included as <strong>{userName}</strong>.)</p>
        </div>

        <div className="field">
          <label>Check in other people (optional)</label>
          <textarea
            value={otherNames}
            onChange={(e) => setOtherNames(e.target.value)}
            placeholder="Comma-separated: Alice, Bob, Charlie"
            rows={3}
          />
        </div>

        <div className="field checkbox-row">
          <label>
            <input
              type="checkbox"
              checked={isPaying}
              onChange={(e) => setIsPaying(e.target.checked)}
            />
            Mark as paid
          </label>
        </div>

        {isPaying && (
          <div className="field">
            <label>Total amount paid (for everyone you're checking in)</label>
            <div className="amount-row">
              <input
                type="number"
                step="0.01"
                value={amount}
                onChange={(e) => setAmount(e.target.value)}
              />
              <button
                type="button"
                className="small-button"
                onClick={handleCopyTotalAmount}
              >
                Copy
              </button>
            </div>
            <small>
              This is the total sent (e.g., via Venmo). In the sheet we'll store a
              per-player charge by dividing this total by the number of people.
            </small>
          </div>
        )}

        <button type="submit" disabled={isSubmitting}>
          {isSubmitting ? 'Submitting…' : 'Submit Check-In'}
        </button>

        <button
          type="button"
          className="secondary-button"
          onClick={handleVenmoClick}
        >
          Open Venmo to Pay
        </button>

        {status && <p className="status">{status}</p>}
      </form>

      {isOrganizer && (
        <div className="card admin-card">
          <h2>Check-ins for {checkinDate}</h2>
          <button type="button" onClick={handleLoadAdminView} disabled={adminLoading}>
            {adminLoading ? 'Loading…' : 'Refresh list'}
          </button>

          {adminError && <p className="error">{adminError}</p>}

          {(totalPlayers > 0) && !adminError && (
            <div className="admin-summary">
              <p><strong>Total players:</strong> {totalPlayers}</p>
              <p><strong>Players marked paid:</strong> {totalPaidPlayers}</p>
              <p><strong>Total collected (sum of Charge):</strong> ${totalCharge.toFixed(2)}</p>
              <button
                type="button"
                className="small-button"
                onClick={() => handleCopyTotalCollected(totalCharge)}
              >
                Copy total for Venmo
              </button>
            </div>
          )}

          {adminRows.length > 0 && (
            <table className="admin-table">
              <thead>
                <tr>
                  <th>Player</th>
                  <th>Paid?</th>
                  <th>Charge</th>
                  <th>Hours</th>
                </tr>
              </thead>
              <tbody>
                {adminRows.map((row, idx) => (
                  <tr key={idx}>
                    <td>{row.playerName}</td>
                    <td>{row.paid ? 'Yes' : 'No'}</td>
                    <td>{row.charge}</td>
                    <td>{row.hours}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          )}

          {!adminLoading && !adminError && adminRows.length === 0 && (
            <p className="muted">No check-ins found for that date yet.</p>
          )}
        </div>
      )}
    </div>
  );
}

export default App;
