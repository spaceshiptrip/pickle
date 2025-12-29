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
				{/* --- START OF HEADER SECTION --- */}
				<div style={{ display: 'flex', flexDirection: 'column', alignItems: 'center', justifyContent: 'center', marginBottom: '1.5rem', borderBottom: '1px solid #e5e7eb', paddingBottom: '1.5rem', width: '100%' }}>
					<div style={{ display: 'flex', flexDirection: 'column', alignItems: 'center', gap: '0.75rem' }}>
						<img
							src={logo}
							alt="Athenaeum Picklers Logo"
							style={{ height: '100px', width: '100px', objectFit: 'contain' }} 
						/>
						<div style={{ textAlign: 'center' }}>
							<h1 className="text-xl sm:text-3xl font-black text-blue-900 uppercase tracking-tighter leading-none">
								Pickleball Schedule
							</h1>
							<p style={{ fontSize: '0.875rem', color: '#6b7280', marginTop: '0.25rem' }}>
								Welcome back, <span style={{ fontWeight: 'bold', color: '#4f46e5' }}>{user.name}</span>
							</p>
						</div>
					</div>

					<div style={{ display: 'flex', alignItems: 'center', gap: '1rem', marginTop: '1rem' }}>
						<div
							className={`px-3 py-1 rounded-full text-[10px] font-black uppercase tracking-widest ${
								user.role?.toLowerCase() === 'admin' ? 'bg-amber-100 text-amber-700' : 'bg-emerald-100 text-emerald-700'
							}`}
						>
							{user.role}
						</div>
						<button
							onClick={onLogout}
							style={{ width: 'auto', background: 'transparent', color: '#9ca3af', fontSize: '0.75rem', fontWeight: 'bold', textTransform: 'uppercase', padding: '0' }}
						>
							Logout
						</button>
					</div>
				</div>
				{/* --- END OF HEADER SECTION --- */}

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
				<div style={{ maxWidth: '1200px', margin: '0 auto', padding: '0 1rem', display: 'flex', flexDirection: 'column', alignItems: 'center', gap: '1rem' }}>
					<div style={{ display: 'flex', alignItems: 'center', gap: '0.75rem' }}>
						<img
							src={spaceshiplogo}
							alt="SpaceshipTrip Logo"
							style={{ height: '40px', width: '40px', objectFit: 'contain' }}
						/>
						<div style={{ textAlign: 'center' }}>
							<span style={{ color: '#fff', fontSize: '0.75rem', fontWeight: 'bold', display: 'block' }}>Too Complex Pickle Check-in App</span>
							<span style={{ color: '#9ca3af', fontSize: '0.7rem' }}>Open Source</span>
						</div>
					</div>
					<div style={{ display: 'flex', gap: '1rem', fontSize: '0.7rem' }}>
						 <a href="https://github.com/spaceshiptrip/pickle" style={{ color: '#9ca3af' }}>Repo</a>
						 <a href="https://nadabarkada.com" style={{ color: '#9ca3af' }}>Athenaeum Picklers</a>
					</div>
				</div>
			</footer>
      {/* End Footer bar (black strip across full width) */}



    </div>
  );
}
