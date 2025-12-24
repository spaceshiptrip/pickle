import React, { useMemo, useState } from 'react';
import CalendarView from './components/CalendarView.jsx';
import ReservationDrawer from './components/ReservationDrawer.jsx';
import AdminPanel from './components/AdminPanel.jsx';
import { ACCESS_CODE, ORGANIZER_CODE } from './config';

export default function App() {
  const [code, setCode] = useState('');
  const [role, setRole] = useState('guest'); // guest|player|admin
  const [selected, setSelected] = useState(null);

  const onSubmitCode = (e) => {
    e.preventDefault();
    if (code === ORGANIZER_CODE) setRole('admin');
    else if (code === ACCESS_CODE) setRole('player');
    else setRole('guest');
  };

  const roleLabel = useMemo(() => {
    if (role === 'admin') return 'Organizer';
    if (role === 'player') return 'Player';
    return 'Guest';
  }, [role]);

  return (
    <div className="max-w-5xl mx-auto p-4 font-sans text-gray-900">
      <div className="flex flex-col sm:flex-row justify-between items-center mb-6 border-b pb-4">
        <h1 className="text-3xl font-bold text-blue-900">Pickleball Schedule & Check-In</h1>

        <form onSubmit={onSubmitCode} className="mt-4 sm:mt-0 flex gap-2 items-center">
          <div className="flex flex-col items-end">
            {role !== 'guest' && <span className="text-xs font-semibold uppercase tracking-wider text-green-600 mb-1">{roleLabel} Access Granted</span>}
            <div className="flex gap-2">
              <input
                className="border px-3 py-1.5 rounded shadow-sm focus:ring-2 focus:ring-blue-500 outline-none"
                placeholder="Enter access code"
                type="password"
                value={code}
                onChange={e => setCode(e.target.value)}
              />
              <button className="bg-gray-800 text-white px-4 py-1.5 rounded hover:bg-black transition-colors" type="submit">Unlock</button>
            </div>
          </div>
        </form>
      </div>

      <div className="bg-white rounded-xl shadow-lg p-1">
        <CalendarView onSelectReservation={setSelected} />
      </div>

      {selected && (
        <ReservationDrawer reservation={selected} onClose={() => setSelected(null)} role={role} />
      )}

      {role === 'admin' && <AdminPanel />}

      <div className="mt-12 text-center text-sm text-gray-400 pb-8">
        Pickle Check-in App · Open Source · Caltech Picklers
      </div>
    </div>
  );
}
