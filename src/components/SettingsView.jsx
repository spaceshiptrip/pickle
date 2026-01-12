import React, { useMemo, useState } from 'react';
import { settingsApi } from '../api';

function friendlyError(code) {
  switch (String(code || '').toLowerCase()) {
    case 'invalid_login_format':
      return 'Please enter a valid 10-digit US phone number or a valid email address.';
    case 'login_taken':
      return 'That login is already used by someone else.';
    case 'invalid_old_pin':
      return 'Your current PIN is incorrect.';
    case 'bad_request':
      return 'Missing or invalid input.';
    case 'auth_required':
    case 'invalid_session':
    case 'session_expired':
      return 'Your session expired. Please log in again.';
    default:
      return code || 'Something went wrong.';
  }
}

function looksLikeEmail(s) {
  const v = String(s || '').trim();
  if (!v.includes('@')) return false;
  // simple email sanity check
  return /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(v);
}

function looksLikePhone(s) {
  let digits = String(s || '').replace(/[^\d]/g, '');
  if (digits.length === 11 && digits[0] === '1') digits = digits.slice(1);
  return digits.length === 10;
}

export default function SettingsView({ theme = 'light', onDone }) {
  const isDark = theme === 'dark';

  // Update login
  const [newLogin, setNewLogin] = useState('');
  const [loginBusy, setLoginBusy] = useState(false);
  const [loginMsg, setLoginMsg] = useState('');
  const [loginErr, setLoginErr] = useState('');

  // Update pin
  const [oldPin, setOldPin] = useState('');
  const [newPin, setNewPin] = useState('');
  const [newPin2, setNewPin2] = useState('');
  const [pinBusy, setPinBusy] = useState(false);
  const [pinMsg, setPinMsg] = useState('');
  const [pinErr, setPinErr] = useState('');

  const loginValid = useMemo(() => {
    const v = String(newLogin || '').trim();
    if (!v) return false;
    return looksLikeEmail(v) || looksLikePhone(v);
  }, [newLogin]);

  const pinValid = useMemo(() => {
    if (!oldPin || !newPin || !newPin2) return false;
    if (String(newPin) !== String(newPin2)) return false;
    // you can enforce length rules if you want; backend accepts any string
    return true;
  }, [oldPin, newPin, newPin2]);

  async function submitLogin(e) {
    e.preventDefault();
    setLoginMsg('');
    setLoginErr('');

    const v = String(newLogin || '').trim();
    if (!v || !loginValid) {
      setLoginErr('Please enter a valid phone or email.');
      return;
    }

    setLoginBusy(true);
    try {
      await settingsApi.updateLogin(v);
      setLoginMsg('Login updated.');
      setNewLogin('');
    } catch (err) {
      setLoginErr(friendlyError(err.message));
    } finally {
      setLoginBusy(false);
    }
  }

  async function submitPin(e) {
    e.preventDefault();
    setPinMsg('');
    setPinErr('');

    if (!pinValid) {
      setPinErr('Please fill everything in and make sure the new PINs match.');
      return;
    }

    setPinBusy(true);
    try {
      await settingsApi.updatePin(String(oldPin).trim(), String(newPin).trim());
      setPinMsg('PIN updated.');
      setOldPin('');
      setNewPin('');
      setNewPin2('');
    } catch (err) {
      setPinErr(friendlyError(err.message));
    } finally {
      setPinBusy(false);
    }
  }

  return (
    <div className="min-h-screen bg-slate-100 dark:bg-slate-900 flex items-start sm:items-center justify-center p-4 pt-8 sm:pt-4">
      <div className="relative max-w-md w-full bg-white dark:bg-slate-800 rounded-3xl p-8 border border-slate-200 dark:border-slate-700 shadow-xl">
        <div className="flex items-center justify-between mb-6">
          <h1 className="text-xl font-black text-slate-900 dark:text-white uppercase tracking-tight">
            Settings
          </h1>

          {onDone && (
            <button
              type="button"
              onClick={onDone}
              className="px-3 py-2 rounded-xl text-xs font-extrabold
                         bg-slate-200 hover:bg-slate-300 text-slate-800
                         dark:bg-slate-700 dark:hover:bg-slate-600 dark:text-slate-100
                         transition"
            >
              Done
            </button>
          )}
        </div>

        {/* Update login */}
        <div className="mb-8">
          <h2 className="text-sm font-black text-slate-900 dark:text-white mb-2">Update Login</h2>
          <p className="text-[11px] text-slate-600 dark:text-slate-400 mb-4">
            Use either a 10-digit US phone number or an email address.
          </p>

          <form onSubmit={submitLogin} className="space-y-4">
            <input
              type="text"
              value={newLogin}
              onChange={(e) => setNewLogin(e.target.value)}
              placeholder="8185551234 or name@example.com"
              className="w-full bg-white dark:bg-slate-900 border border-slate-300 dark:border-slate-700 rounded-xl px-4 py-3
                         text-slate-900 dark:text-white placeholder:text-slate-400
                         focus:outline-none focus:ring-2 focus:ring-indigo-500 focus:border-indigo-500"
            />

            <button
              type="submit"
              disabled={loginBusy || !loginValid}
              className="w-full bg-indigo-600 hover:bg-indigo-500 text-white font-black py-3 rounded-xl transition disabled:opacity-50"
            >
              {loginBusy ? 'Updating…' : 'Update Login'}
            </button>
          </form>

          {loginMsg && (
            <div className="mt-4 p-3 bg-emerald-50 dark:bg-emerald-500/10 border border-emerald-200 dark:border-emerald-500/50 text-emerald-800 dark:text-emerald-300 text-sm rounded-xl text-center">
              {loginMsg}
            </div>
          )}
          {loginErr && (
            <div className="mt-4 p-3 bg-rose-50 dark:bg-rose-500/10 border border-rose-200 dark:border-rose-500/50 text-rose-800 dark:text-rose-300 text-sm rounded-xl text-center">
              {loginErr}
            </div>
          )}
        </div>

        <div className="h-px bg-slate-200 dark:bg-slate-700 my-6" />

        {/* Update pin */}
        <div>
          <h2 className="text-sm font-black text-slate-900 dark:text-white mb-2">Update PIN</h2>
          <p className="text-[11px] text-slate-600 dark:text-slate-400 mb-4">
            You must enter your current PIN to change it.
          </p>

          <form onSubmit={submitPin} className="space-y-4">
            <input
              type="password"
              value={oldPin}
              onChange={(e) => setOldPin(e.target.value)}
              placeholder="Current PIN"
              className="w-full bg-white dark:bg-slate-900 border border-slate-300 dark:border-slate-700 rounded-xl px-4 py-3
                         text-slate-900 dark:text-white placeholder:text-slate-400
                         focus:outline-none focus:ring-2 focus:ring-indigo-500 focus:border-indigo-500"
            />

            <input
              type="password"
              value={newPin}
              onChange={(e) => setNewPin(e.target.value)}
              placeholder="New PIN"
              className="w-full bg-white dark:bg-slate-900 border border-slate-300 dark:border-slate-700 rounded-xl px-4 py-3
                         text-slate-900 dark:text-white placeholder:text-slate-400
                         focus:outline-none focus:ring-2 focus:ring-indigo-500 focus:border-indigo-500"
            />

            <input
              type="password"
              value={newPin2}
              onChange={(e) => setNewPin2(e.target.value)}
              placeholder="Confirm new PIN"
              className="w-full bg-white dark:bg-slate-900 border border-slate-300 dark:border-slate-700 rounded-xl px-4 py-3
                         text-slate-900 dark:text-white placeholder:text-slate-400
                         focus:outline-none focus:ring-2 focus:ring-indigo-500 focus:border-indigo-500"
            />

            <button
              type="submit"
              disabled={pinBusy || !pinValid}
              className="w-full bg-emerald-600 hover:bg-emerald-500 text-white font-black py-3 rounded-xl transition disabled:opacity-50"
            >
              {pinBusy ? 'Updating…' : 'Update PIN'}
            </button>
          </form>

          {pinMsg && (
            <div className="mt-4 p-3 bg-emerald-50 dark:bg-emerald-500/10 border border-emerald-200 dark:border-emerald-500/50 text-emerald-800 dark:text-emerald-300 text-sm rounded-xl text-center">
              {pinMsg}
            </div>
          )}
          {pinErr && (
            <div className="mt-4 p-3 bg-rose-50 dark:bg-rose-500/10 border border-rose-200 dark:border-rose-500/50 text-rose-800 dark:text-rose-300 text-sm rounded-xl text-center">
              {pinErr}
            </div>
          )}
        </div>
      </div>
    </div>
  );
}

