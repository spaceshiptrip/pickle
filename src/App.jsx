import React, { useMemo, useState, useEffect } from 'react';
import CalendarView from './components/CalendarView.jsx';
import ReservationDrawer from './components/ReservationDrawer.jsx';
import AdminPanel from './components/AdminPanel.jsx';
import AuthView from './components/AuthView.jsx';
import { authApi } from './api';
import logo from './assets/AthPicklersLogo.png';

export default function App() {
  const [user, setUser] = useState(null);
  const [loading, setLoading] = useState(true);
  const [selected, setSelected] = useState(null);

  useEffect(() => {
    initAuth();
  }, []);

  async function initAuth() {
    const params = new URLSearchParams(window.location.search);
    const token = params.get('token');
    const existingSession = localStorage.getItem('pickle_session_id');

    try {
      if (token) {
        // Handle Magic Link
        const res = await authApi.consumeToken(token);
        if (res.ok && res.session) {
          localStorage.setItem('pickle_session_id', res.session.sessionId);
          // Clean URL
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
    try { if (sessionId) await authApi.logout(sessionId); } catch (e) { }
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
    <div className="max-w-5xl mx-auto p-4 font-sans text-gray-900">
      <div className="flex flex-col sm:flex-row justify-between items-center mb-6 border-b pb-4 gap-4">
        <div className="flex flex-col sm:flex-row items-center gap-3 sm:gap-4 text-center sm:text-left">
          <img src={logo} alt="Athenaeum Picklers Logo" className="h-12 w-12 sm:h-10 sm:w-10 object-contain" />
          <div>
            <h1 className="text-2xl sm:text-3xl font-black text-blue-900 uppercase tracking-tight">Pickleball Schedule</h1>
            <p className="text-sm text-gray-500">Welcome back, <span className="font-bold text-indigo-600">{user.name}</span></p>
          </div>
        </div>

        <div className="flex items-center gap-4">
          <div className={`px-3 py-1 rounded-full text-xs font-black uppercase tracking-widest ${user.role === 'admin' ? 'bg-amber-100 text-amber-700' : 'bg-emerald-100 text-emerald-700'}`}>
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
        <ReservationDrawer reservation={selected} onClose={() => setSelected(null)} role={user.role} />
      )}

      {user.role === 'admin' && <AdminPanel />}

      <div className="mt-12 text-center text-sm text-gray-400 pb-8 flex flex-col items-center gap-2">
        <img src={logo} alt="Logo" className="h-6 w-6 opacity-40 grayscale" />
        <div>
          <a href="https://github.com/spaceshiptrip/pickle" target="_blank" rel="noreferrer" className="hover:underline text-gray-500">Too Complex Pickle Check-in App</a> · <a href="https://opensource.org/licenses/MIT" target="_blank" rel="noreferrer" className="hover:underline text-gray-500">Open Source</a> · <a href="https://github.com/spaceshiptrip" target="_blank" rel="noreferrer" className="hover:underline text-gray-500">SpaceshipTrip ツ</a> · <a href="https://nadabarkada.com" target="_blank" rel="noreferrer" className="hover:underline text-gray-500">Athenaeum Picklers</a>
        </div>
      </div>
    </div>
  );
}
