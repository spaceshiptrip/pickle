import React, { useEffect, useMemo, useState } from 'react';
import FullCalendar from '@fullcalendar/react';
import dayGridPlugin from '@fullcalendar/daygrid';
import { apiGet } from '../api';

export default function CalendarView({ onSelectReservation }) {
    const [items, setItems] = useState([]);
    const [key, setKey] = useState(0); // trigger rerender

    useEffect(() => {
        (async () => {
            try {
                const data = await apiGet({ action: 'listreservations' });
                if (data.ok) setItems(data.reservations);
            } catch (e) {
                console.error("Failed to load reservations", e);
            }
        })();
    }, [key]);

    const events = useMemo(() => items.map(it => {
        const start = `${it.Date}T${it.Start}:00`;
        const end = `${it.Date}T${it.End}:00`;
        const isProposed = it.Status === 'proposed';

        return {
            id: it.Id,
            title: isProposed ? `PROPOSED: ${it.Start}` : `Court ${it.Court} · $${it.BaseFee}`,
            start,
            end,
            extendedProps: it,
            backgroundColor: isProposed ? '#eab308' : '#1e3a8a', // text-yellow-500 vs text-blue-900 (approx)
            borderColor: isProposed ? '#854d0e' : '#1e3a8a',
        };
    }), [items]);

    return (
        <div className="mb-6">
            <FullCalendar
                plugins={[dayGridPlugin]}
                initialView="dayGridMonth"
                events={events}
                eventClick={(info) => onSelectReservation(info.event.extendedProps)}
                height="auto"
            />
            <button className="text-sm underline mt-2" onClick={() => setKey(k => k + 1)}>Refresh</button>
        </div>
    );
}
