import React, { useState } from 'react';
import { authApi } from '../api';

export default function RecoverView() {
  const [email, setEmail] = useState('');
  const [loading, setLoading] = useState(false);
  const [message, setMessage] = useState('');
  const [error, setError] = useState('');

  const onSubmit = async (e) => {
    e.preventDefault();
    setLoading(true);
    setMessage('');
    setError('');
    try {
      // name is optional for recovery; backend already handles it
      const res = await authApi.requestMagicLink(email, '');
      if (res.ok) setMessage(res.message || 'Check your email for a recovery link.');
      else setError(res.error || 'Request failed');
    } catch (err) {
      setError(err.message || 'Request failed');
    } finally {
      setLoading(false);
    }
  };

  return (
    <div className="min-h-screen bg-slate-100 dark:bg-slate-900 flex items-start sm:items-center justify-center p-4 pt-8 sm:pt-4">
      <div className="max-w-md w-full bg-white dark:bg-slate-800 rounded-3xl p-8 border border-slate-200 dark:border-slate-700 shadow-xl">
        <h1 className="text-xl font-black text-slate-900 dark:text-white text-center">
          Account Recovery
        </h1>
        <p className="text-slate-600 dark:text-slate-400 text-xs text-center mt-2 mb-6">
          Enter your email and we’ll send a recovery magic link.
        </p>

        <form onSubmit={onSubmit} className="space-y-5">
          <div>
            <label className="block text-xs font-bold text-slate-600 dark:text-slate-300 uppercase mb-2">
              Email Address
            </label>
            <input
              type="email"
              value={email}
              onChange={(e) => setEmail(e.target.value)}
              placeholder="name@example.com"
              className="w-full bg-white dark:bg-slate-900 border border-slate-300 dark:border-slate-700 rounded-xl px-4 py-3
                         text-slate-900 dark:text-white placeholder:text-slate-400
                         focus:outline-none focus:ring-2 focus:ring-indigo-500 focus:border-indigo-500"
              required
            />
          </div>

          <button
            disabled={loading}
            className="w-full bg-emerald-600 hover:bg-emerald-500 text-white font-black py-4 rounded-xl transition disabled:opacity-50"
          >
            {loading ? 'Sending…' : 'Send recovery link'}
          </button>
        </form>

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

        <div className="mt-6 text-center">
          <a
            href="#/"
            className="text-xs font-bold text-indigo-700 dark:text-indigo-300 hover:underline"
          >
            Back to login
          </a>
        </div>
      </div>
    </div>
  );
}

