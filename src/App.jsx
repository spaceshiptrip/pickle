// src/App.jsx
import React, { useState, useEffect } from 'react';
import CalendarView from './components/CalendarView.jsx';
import ReservationDrawer from './components/ReservationDrawer.jsx';
import AdminPanel from './components/AdminPanel.jsx';
import AuthView from './components/AuthView.jsx';
import { authApi } from './api';
import logo from './assets/AthPicklersLogo.png';
import spaceshiplogo from './assets/SpaceshipTripLogo.png';
import SettingsView from './components/SettingsView';
import { popPostLoginRedirect } from './utils/postLoginRedirect';



const THEME_KEY = 'pickle_theme'; // 'light' | 'dark'



function getInitialTheme() {
  const saved = localStorage.getItem(THEME_KEY);
  if (saved === 'dark' || saved === 'light') return saved;

  const prefersDark = window.matchMedia?.('(prefers-color-scheme: dark)')?.matches;
  return prefersDark ? 'dark' : 'light';
}

export default function App() {
  const [user, setUser] = useState(null);
  const [loading, setLoading] = useState(true);
  const [selected, setSelected] = useState(null);
  const [editingReservation, setEditingReservation] = useState(null);
  const [showSettings, setShowSettings] = useState(false);


  // Theme
  const [theme, setTheme] = useState(getInitialTheme);

  // Track whether the user explicitly chose
  const [hasExplicitTheme, setHasExplicitTheme] = useState(
    () => localStorage.getItem(THEME_KEY) === 'dark' || localStorage.getItem(THEME_KEY) === 'light'
  );

  useEffect(() => {
    document.documentElement.classList.toggle('dark', theme === 'dark');
    if (hasExplicitTheme) localStorage.setItem(THEME_KEY, theme);
  }, [theme, hasExplicitTheme]);

  useEffect(() => {
    if (hasExplicitTheme) return;
  
    const mq = window.matchMedia?.('(prefers-color-scheme: dark)');
    if (!mq) return;
  
    const handler = (e) => setTheme(e.matches ? 'dark' : 'light');
    mq.addEventListener?.('change', handler);
    return () => mq.removeEventListener?.('change', handler);
  }, [hasExplicitTheme]);

  const toggleTheme = () => {
    setHasExplicitTheme(true);
    setTheme((t) => {
      const next = t === 'dark' ? 'light' : 'dark';
      localStorage.setItem(THEME_KEY, next); // optional immediate persist
      return next;
    });
  };

  useEffect(() => {
    initAuth();
    // eslint-disable-next-line react-hooks/exhaustive-deps
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

          // ✅ NEW: if user came from recovery flow, send them to Settings
          const post = popPostLoginRedirect();
          if (post === '/settings') setShowSettings(true);

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

const onLoginSuccess = async (session) => {
  localStorage.setItem('pickle_session_id', session.sessionId);
  await loadUser(session.sessionId);

  const post = popPostLoginRedirect();
  if (post === '/settings') setShowSettings(true);
};

  const onLogout = async () => {
    const sessionId = localStorage.getItem('pickle_session_id');
    try {
      if (sessionId) await authApi.logout(sessionId);
    } catch (e) {}
    localStorage.removeItem('pickle_session_id');
    setShowSettings(false); // ✅ ADD THIS
    setUser(null);
  };

  if (loading) {
    return (
      <div className="min-h-screen bg-slate-100 dark:bg-slate-900 flex items-center justify-center">
        <div className="animate-spin rounded-full h-12 w-12 border-t-2 border-b-2 border-indigo-500"></div>
      </div>
    );
  }

  if (!user) {
    return (
      <AuthView
        onLoginSuccess={onLoginSuccess}
        theme={theme}
        onToggleTheme={toggleTheme}
      />
    );
  }


  // ✅ PUT THIS RIGHT HERE
  if (showSettings) {
    return (
      <SettingsView
        theme={theme}
        onDone={() => setShowSettings(false)}
      />
    );
  }

  return (
    // min-h-screen + flex column lets us “stick” a footer bar to bottom when content is short
    <div className="min-h-screen flex flex-col bg-slate-50 dark:bg-slate-900 text-gray-900 dark:text-slate-100">
      {/* Page content */}
      <div className="w-full max-w-5xl mx-auto p-4 font-sans flex-1">
            
            {/* --- START OF HEADER SECTION --- */}
            <div className="flex flex-col items-center justify-center mb-6 pb-6 w-full border-b border-slate-200 dark:border-slate-700">

              <div className="flex flex-col items-center gap-3">
                <img
                  src={logo}
                  alt="Athenaeum Picklers Logo"
                  className="h-[100px] w-[100px] object-contain"
                />

                <div className="text-center">
                  <h1 className="text-xl sm:text-3xl font-black uppercase tracking-tighter leading-none
                                 text-blue-900 dark:text-blue-200">
                    Pickleball Schedule
                  </h1>

                  <p className="mt-1 text-sm text-slate-500 dark:text-slate-400">
                    Welcome back,{' '}
                    <span className="font-bold text-indigo-600 dark:text-indigo-400">
                      {user.name}
                    </span>
                  </p>
                </div>
              </div>

              <div className="flex items-center gap-4 mt-4">
                <div
                  className={`px-3 py-1 rounded-full text-[10px] font-black uppercase tracking-widest
                    ${
                      user.role?.toLowerCase() === 'admin'
                        ? 'bg-amber-100 text-amber-700 dark:bg-amber-500/20 dark:text-amber-300'
                        : 'bg-emerald-100 text-emerald-700 dark:bg-emerald-500/20 dark:text-emerald-300'
                    }`}
                >
                  {user.role}
                </div>
{/* Theme toggle (same as AuthView) */}
<button
  type="button"
  onClick={toggleTheme}
  className="px-3 py-2 rounded-xl text-xs font-extrabold
             bg-slate-200 hover:bg-slate-300 text-slate-800
             dark:bg-slate-700 dark:hover:bg-slate-600 dark:text-slate-100
             transition"
  aria-label="Toggle theme"
  title="Toggle theme"
>
  {theme === 'dark' ? '☀️ Light' : '🌙 Dark'}
</button>

{/* Logout button (styled, but secondary) */}
<button
  type="button"
  onClick={onLogout}
  className="px-3 py-2 rounded-xl text-xs font-extrabold
             bg-slate-100 hover:bg-slate-200 text-slate-600
             dark:bg-slate-800 dark:hover:bg-slate-700 dark:text-slate-300
             transition"
  aria-label="Logout"
  title="Logout"
>
  Logout
</button>

<button
  type="button"
  onClick={() => setShowSettings(true)}
  className="ml-2 inline-flex items-center justify-center rounded-xl
             px-3 py-2 text-sm font-extrabold
             bg-slate-200 hover:bg-slate-300 text-slate-800
             dark:bg-slate-700 dark:hover:bg-slate-600 dark:text-slate-100
             transition"
  aria-label="Open settings"
  title="Settings"
>
  ⚙️
</button>


              </div>
            </div>
            {/* --- END OF HEADER SECTION --- */}



        <div className="bg-white dark:bg-slate-800 rounded-xl shadow-lg p-1">
          <CalendarView onSelectReservation={setSelected} />
        </div>

        {selected && (
          <ReservationDrawer
            reservation={selected}
            onClose={() => setSelected(null)}
            role={user.role}
						user={user}
            onEditReservation={(res) => {
              setEditingReservation(res);
              setSelected(null); // Close the drawer
            }}
          />
        )}

        {(user.role?.toLowerCase() === 'admin' || user.role?.toLowerCase() === 'memberplus') && (
          <AdminPanel
            role={user.role}
            editReservation={editingReservation}
            onSaveSuccess={() => setEditingReservation(null)}
          />
        )}
      </div>

      {/* Footer bar (black strip across full width) */}
      <footer style={{ width: '100%', backgroundColor: '#000', marginTop: 'auto', padding: '1.5rem 0' }}>
        <div
          style={{
            maxWidth: '1200px',
            margin: '0 auto',
            padding: '0 1rem',
            display: 'flex',
            flexDirection: 'column',
            alignItems: 'center',
            gap: '1rem',
          }}
        >
          <div style={{ display: 'flex', alignItems: 'center', gap: '0.75rem' }}>
            <img
              src={spaceshiplogo}
              alt="SpaceshipTrip Logo"
              style={{ height: '40px', width: '40px', objectFit: 'contain' }}
            />
            <div style={{ textAlign: 'center' }}>
              <span style={{ color: '#fff', fontSize: '0.75rem', fontWeight: 'bold', display: 'block' }}>
                Too Complex Pickle Check-in App
              </span>
              <span style={{ color: '#9ca3af', fontSize: '0.7rem' }}>Open Source</span>
            </div>
          </div>
          <div style={{ display: 'flex', gap: '1rem', fontSize: '0.7rem' }}>
            <a href="https://github.com/spaceshiptrip/pickle" style={{ color: '#9ca3af' }}>
              Repo
            </a>
            <a href="https://nadabarkada.com" style={{ color: '#9ca3af' }}>
              Athenaeum Picklers
            </a>
          </div>
        </div>
      </footer>
      {/* End Footer bar (black strip across full width) */}
    </div>
  );
}

