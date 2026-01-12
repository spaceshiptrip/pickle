import React, { useEffect, useState } from 'react';
import { authApi } from '../api';
import logo from '../assets/AthPicklersLogo.png';
import { setPostLoginRedirect } from '../utils/postLoginRedirect';


export default function AuthView({ onLoginSuccess, theme = 'light', onToggleTheme }) {
  const [tab, setTab] = useState('member');
  const [loginId, setLoginId] = useState('');
  const [mode, setMode] = useState('login'); // 'login' | 'recover'
  const [recoverEmail, setRecoverEmail] = useState('');


  const [pin, setPin] = useState('');
  const [email, setEmail] = useState('');
  const [name, setName] = useState('');
  const [loading, setLoading] = useState(false);
  const [message, setMessage] = useState('');
  const [error, setError] = useState('');

  const [buildInfo, setBuildInfo] = useState(null);

  useEffect(() => {
    fetch('/version.json')
	    .then((r) => r.json())
		    .then(setBuildInfo)
			    .catch(() => {});
				}, []);


  useEffect(() => {
    setError('');
    setMessage('');
    setLoading(false);
    setMode('login'); // ✅ always return to normal form when switching tabs
  }, [tab]);



  const handleMemberLogin = async (e) => {
    e.preventDefault();
    setLoading(true);
    setError('');
    setMessage('');
    try {
      const res = await authApi.loginWithPin(loginId, pin);

      if (res.ok && res.session) onLoginSuccess(res.session);
    } catch (err) {
      setError(err.message || 'Login failed');
    } finally {
      setLoading(false);
    }
  };

  const handleGuestRequest = async (e) => {
    e.preventDefault();
    setLoading(true);
    setError('');
    setMessage('');
    try {
      const res = await authApi.requestMagicLink(email, name);
      if (res.ok) setMessage(res.message);
    } catch (err) {
      setError(err.message || 'Request failed');
    } finally {
      setLoading(false);
    }
  };


  const handleRecoveryRequest = async (e) => {
    e.preventDefault();
    setLoading(true);
    setError('');
    setMessage('');

    try {
      // ✅ tell App.jsx where to go after token login
      setPostLoginRedirect('/settings');

      // ✅ request magic link (name optional / blank is fine)
      const res = await authApi.requestMagicLink(recoverEmail, '');
      if (res.ok) setMessage(res.message || 'Check your email for a recovery link.');
    } catch (err) {
      setError(err.message || 'Request failed');
    } finally {
      setLoading(false);
    }
  };



  const isDark = theme === 'dark';

  return (
    <div className="min-h-screen bg-slate-100 dark:bg-slate-900 flex items-start sm:items-center justify-center p-4 pt-8 sm:pt-4">
      <div className="relative max-w-md w-full bg-white dark:bg-slate-800 rounded-3xl p-8 border border-slate-200 dark:border-slate-700 shadow-xl">
        {/* Theme toggle */}
        {onToggleTheme && (
          <button
            type="button"
            onClick={onToggleTheme}
            className="absolute top-4 right-4 px-3 py-2 rounded-xl text-xs font-extrabold
                       bg-slate-200 hover:bg-slate-300 text-slate-800
                       dark:bg-slate-700 dark:hover:bg-slate-600 dark:text-slate-100
                       transition"
            aria-label="Toggle theme"
            title="Toggle theme"
          >
            {isDark ? '☀️ Light' : '🌙 Dark'}
          </button>
        )}

        {/* ✅ CENTERED, RESPONSIVE LOGO */}
        <div className="w-full flex justify-center mb-6">
          <div className="w-[240px] sm:w-[280px] md:w-[320px] aspect-square flex items-center justify-center overflow-hidden">
            <img
              src={logo}
              alt="Athenaeum Picklers Logo"
              className="w-full h-full object-contain block"
            />
          </div>
        </div>

        <h1 className="text-xl font-black text-slate-900 dark:text-white uppercase tracking-tight text-center">
          Pickleball Login
        </h1>
        <p className="text-slate-600 dark:text-slate-400 text-[10px] text-center mt-1 mb-6">
          Access reservations and payments
        </p>

        {/* TABS */}
        <div className="flex bg-slate-200 dark:bg-slate-900/50 p-1 rounded-xl mb-8">
          <button
            type="button"
            onClick={() => setTab('member')}
            className={`flex-1 py-2 rounded-lg font-bold transition-all ${
              tab === 'member'
                ? 'bg-indigo-600 text-white shadow'
                : 'text-slate-700 hover:text-slate-900 hover:bg-white/60 dark:text-slate-300 dark:hover:text-white dark:hover:bg-white/10'
            }`}
          >
            Member
          </button>
          <button
            type="button"
            onClick={() => setTab('guest')}
            className={`flex-1 py-2 rounded-lg font-bold transition-all ${
              tab === 'guest'
                ? 'bg-indigo-600 text-white shadow'
                : 'text-slate-700 hover:text-slate-900 hover:bg-white/60 dark:text-slate-300 dark:hover:text-white dark:hover:bg-white/10'
            }`}
          >
            Guest
          </button>
        </div>

{/* FORMS */}
{mode === 'recover' ? (
  <form onSubmit={handleRecoveryRequest} className="space-y-6">
    <div>
      <label className="block text-xs font-bold text-slate-600 dark:text-slate-300 uppercase mb-2">
        Email Address
      </label>
      <input
        type="email"
        value={recoverEmail}
        onChange={(e) => setRecoverEmail(e.target.value)}
        placeholder="name@example.com"
        className="w-full bg-white dark:bg-slate-900 border border-slate-300 dark:border-slate-700 rounded-xl px-4 py-3
                   text-slate-900 dark:text-white placeholder:text-slate-400
                   focus:outline-none focus:ring-2 focus:ring-indigo-500 focus:border-indigo-500"
        required
      />
      <p className="mt-2 text-[10px] text-slate-600 dark:text-slate-500">
        We’ll email you a one-time magic link. After clicking it, you’ll be taken directly to Settings.
      </p>
    </div>

    <button
      disabled={loading}
      className="w-full bg-emerald-600 hover:bg-emerald-500 text-white font-black py-4 rounded-xl transition disabled:opacity-50"
    >
      {loading ? 'Sending…' : 'Send recovery link'}
    </button>

    <div className="text-center">
      <button
        type="button"
        onClick={() => {
          setMode('login');
          setRecoverEmail('');
          setError('');
          setMessage('');
        }}
        className="text-xs font-bold text-indigo-700 dark:text-indigo-300 hover:underline"
      >
        Back to login
      </button>
    </div>
  </form>
) : tab === 'member' ? (
  <form onSubmit={handleMemberLogin} className="space-y-6">
    <div>
      <label className="block text-xs font-bold text-slate-600 dark:text-slate-300 uppercase mb-2">
        Login
      </label>
      <input
        type="text"
        value={loginId}
        onChange={(e) => setLoginId(e.target.value)}
        placeholder="8185551234 or name@example.com"
        className="w-full bg-white dark:bg-slate-900 border border-slate-300 dark:border-slate-700 rounded-xl px-4 py-3
                   text-slate-900 dark:text-white placeholder:text-slate-400
                   focus:outline-none focus:ring-2 focus:ring-indigo-500 focus:border-indigo-500"
        required
      />
    </div>

    <div>
      <label className="block text-xs font-bold text-slate-600 dark:text-slate-300 uppercase mb-2">
        PIN
      </label>
      <input
        type="password"
        value={pin}
        onChange={(e) => setPin(e.target.value)}
        placeholder="Your secret PIN"
        className="w-full bg-white dark:bg-slate-900 border border-slate-300 dark:border-slate-700 rounded-xl px-4 py-3
                   text-slate-900 dark:text-white placeholder:text-slate-400
                   focus:outline-none focus:ring-2 focus:ring-indigo-500 focus:border-indigo-500"
        required
      />
    </div>

    <button
      disabled={loading}
      className="w-full bg-indigo-600 hover:bg-indigo-500 text-white font-black py-4 rounded-xl transition disabled:opacity-50"
    >
      {loading ? 'Logging in…' : 'Sign In'}
    </button>

    <div className="text-center">
      <button
        type="button"
        onClick={() => {
          setPostLoginRedirect('/settings');
          setMode('recover');
          setRecoverEmail('');
          setError('');
          setMessage('');
        }}
        className="text-xs font-bold text-indigo-700 dark:text-indigo-300 hover:underline"
      >
        Forgot PIN / Update Login
      </button>
    </div>
  </form>
) : (
  <form onSubmit={handleGuestRequest} className="space-y-6">
    <div>
      <label className="block text-xs font-bold text-slate-600 dark:text-slate-300 uppercase mb-2">
        Full Name
      </label>
      <input
        type="text"
        value={name}
        onChange={(e) => setName(e.target.value)}
        placeholder="John Doe"
        className="w-full bg-white dark:bg-slate-900 border border-slate-300 dark:border-slate-700 rounded-xl px-4 py-3
                   text-slate-900 dark:text-white placeholder:text-slate-400
                   focus:outline-none focus:ring-2 focus:ring-indigo-500 focus:border-indigo-500"
        required
      />
    </div>

    <div>
      <label className="block text-xs font-bold text-slate-600 dark:text-slate-300 uppercase mb-2">
        Email Address
      </label>
      <input
        type="email"
        value={email}
        onChange={(e) => setEmail(e.target.value)}
        placeholder="friend@example.com"
        className="w-full bg-white dark:bg-slate-900 border border-slate-300 dark:border-slate-700 rounded-xl px-4 py-3
                   text-slate-900 dark:text-white placeholder:text-slate-400
                   focus:outline-none focus:ring-2 focus:ring-indigo-500 focus:border-indigo-500"
        required
      />
      <p className="mt-2 text-[10px] text-slate-600 dark:text-slate-500">
        We’ll email you a one-time magic link.
      </p>
    </div>

    <button
      disabled={loading}
      className="w-full bg-emerald-600 hover:bg-emerald-500 text-white font-black py-4 rounded-xl transition disabled:opacity-50"
    >
      {loading ? 'Sending…' : 'Request Magic Link'}
    </button>
  </form>
)}
{/* FORMS END */}

        {/* MESSAGES */}
        {message && (
          <div className="mt-6 p-4 bg-emerald-50 dark:bg-emerald-500/10 border border-emerald-200 dark:border-emerald-500/50 text-emerald-800 dark:text-emerald-300 text-sm rounded-xl text-center">
            {message}
          </div>
        )}
        {error && (
          <div className="mt-6 p-4 bg-rose-50 dark:bg-rose-500/10 border border-rose-200 dark:border-rose-500/50 text-rose-800 dark:text-rose-300 text-sm rounded-xl text-center">
            {error}
          </div>
        )}

        {/* Build info (subtle) */}
        {buildInfo && (
          <div className="mt-6 text-center text-[10px] text-slate-400 dark:text-slate-500">
            v{buildInfo.version} · build {buildInfo.build}
          </div>
        )}
      </div>
    </div>
  );
}

