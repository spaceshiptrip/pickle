// src/App.jsx
import React, { useState, useEffect } from 'react';
import CalendarView from './components/CalendarView.jsx';
import ReservationDrawer from './components/ReservationDrawer.jsx';
import AdminPanel from './components/AdminPanel.jsx';
import AuthView from './components/AuthView.jsx';
import { authApi } from './api';
import logo from './assets/AthPicklersLogo.png';
import spaceshiplogo from './assets/SpaceshipTripLogo.png';

export default function App() {
  const [user, setUser] = useState(null);
  const [loading, setLoading] = useState(true);
  const [selected, setSelected] = useState(null);
  const [editingReservation, setEditingReservation] = useState(null);

  useEffect(() => {
    initAuth();
  }, []);

  async function initAuth() {
    const params = new URLSearchParams(window.location.search);
    const token = params.get('token');
    const existingSession = localStorage.getItem('pickle_session_id');

    try {
      if (token) {
        const res = await authApi.consumeToken(token);
        if (res.ok && res.session) {
          localStorage.setItem('pickle_session_id', res.session.sessionId);
          window.history.replaceState({}, document.title, window.location.pathname);
          await loadUser(res.session.sessionId);
        }
      } else if (existingSession) {
        await loadUser(existingSession);
      }
    } catch (err) {
      console.error('Auth init failed', err);
      localStorage.removeItem('pickle_session_id');
    } finally {
      setLoading(false);
    }
  }

  async function loadUser(sessionId) {
    const res = await authApi.whoAmI(sessionId);
    if (res.ok && res.user) {
      setUser(res.user);
    } else {
      localStorage.removeItem('pickle_session_id');
    }
  }

  const onLoginSuccess = (session) => {
    localStorage.setItem('pickle_session_id', session.sessionId);
    loadUser(session.sessionId);
  };

  const onLogout = async () => {
    const sessionId = localStorage.getItem('pickle_session_id');
    try {
      if (sessionId) await authApi.logout(sessionId);
    } catch (e) { }
    localStorage.removeItem('pickle_session_id');
    setUser(null);
  };

  if (loading) {
    return (
      <div className="min-h-screen bg-slate-900 flex items-center justify-center">
        <div className="animate-spin rounded-full h-12 w-12 border-t-2 border-b-2 border-indigo-500"></div>
      </div>
    );
  }

  if (!user) {
    return <AuthView onLoginSuccess={onLoginSuccess} />;
  }

  return (
    // min-h-screen + flex column lets us “stick” a footer bar to bottom when content is short
    <div className="min-h-screen flex flex-col bg-slate-50 text-gray-900">
      {/* Page content */}
      <div className="w-full max-w-5xl mx-auto p-4 font-sans flex-1">
        <div className="flex flex-col items-center sm:flex-row sm:justify-between mb-6 border-b pb-4 gap-4">
          <div className="flex flex-col items-center sm:flex-row gap-2 sm:gap-4">
            <img
              src={logo}
              alt="Athenaeum Picklers Logo"
              className="h-10 w-10 sm:h-14 sm:w-14 object-contain"
            />
            <div className="text-center sm:text-left">
              <h1 className="text-lg sm:text-2xl font-black text-blue-900 uppercase tracking-tighter leading-none">
                Pickleball Schedule
              </h1>
              <p className="text-[10px] sm:text-xs text-gray-500 mt-1">
                Welcome back, <span className="font-bold text-indigo-600">{user.name}</span>
              </p>
            </div>
          </div>

          <div className="flex items-center gap-4">
            <div
              className={`px-3 py-1 rounded-full text-[10px] font-black uppercase tracking-widest ${user.role?.toLowerCase() === 'admin'
                ? 'bg-amber-100 text-amber-700'
                : user.role?.toLowerCase() === 'memberplus'
                  ? 'bg-indigo-100 text-indigo-700'
                  : user.role?.toLowerCase() === 'member'
                    ? 'bg-emerald-100 text-emerald-700'
                    : 'bg-slate-200 text-slate-600'
                }`}
            >
              {user.role}
            </div>
            <button
              onClick={onLogout}
              className="text-xs font-bold text-gray-400 hover:text-rose-500 transition-colors uppercase tracking-widest"
            >
              Logout
            </button>
          </div>
        </div>

        <div className="bg-white rounded-xl shadow-lg p-1">
          <CalendarView onSelectReservation={setSelected} />
        </div>

        {selected && (
          <ReservationDrawer
            reservation={selected}
            onClose={() => setSelected(null)}
            role={user.role}
            onEditReservation={(res) => {
              setEditingReservation(res);
              setSelected(null); // Close the drawer
            }}
          />
        )}

        {user.role === 'admin' && (
          <AdminPanel
            editReservation={editingReservation}
            onSaveSuccess={() => setEditingReservation(null)}
          />
        )}
      </div>

      {/* Footer bar (black strip across full width) */}
      <footer className="w-full bg-black">
        {/* Match “thickness” visually by controlling height + padding */}
        <div className="max-w-5xl mx-auto px-4 py-3 sm:py-4">
          <div className="flex flex-col sm:flex-row items-center justify-between gap-3">
            {/* Left: logo in a fixed-height row so the bar thickness feels tied to it */}
            <div className="flex items-center gap-3">
              <img
                src={spaceshiplogo}
                alt="SpaceshipTrip Logo"
                className="h-9 w-9 sm:h-10 sm:w-10 object-contain opacity-95"
              />
              <div className="text-xs sm:text-sm text-gray-300 leading-tight text-center sm:text-left">
                <span className="font-semibold text-gray-100">Too Complex Pickle Check-in App</span>
                <span className="hidden sm:inline"> · </span>
                <span className="block sm:inline text-gray-400">Open Source</span>
              </div>
            </div>

            {/* Right: links wrap nicely on mobile */}
            <div className="text-[11px] sm:text-xs text-gray-400 text-center sm:text-right flex flex-wrap justify-center sm:justify-end gap-x-3 gap-y-1">
              <a
                href="https://github.com/spaceshiptrip/pickle"
                target="_blank"
                rel="noreferrer"
                className="hover:underline hover:text-gray-200 transition-colors"
              >
                Repo
              </a>
              <a
                href="https://opensource.org/licenses/MIT"
                target="_blank"
                rel="noreferrer"
                className="hover:underline hover:text-gray-200 transition-colors"
              >
                MIT
              </a>
              <a
                href="https://github.com/spaceshiptrip"
                target="_blank"
                rel="noreferrer"
                className="hover:underline hover:text-gray-200 transition-colors"
              >
                SpaceshipTrip ツ
              </a>
              <a
                href="https://nadabarkada.com"
                target="_blank"
                rel="noreferrer"
                className="hover:underline hover:text-gray-200 transition-colors"
              >
                Athenaeum Picklers
              </a>
            </div>
          </div>
        </div>
      </footer>
    </div>
  );
}
