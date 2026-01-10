import React, { useEffect, useMemo, useState } from 'react';
import FullCalendar from '@fullcalendar/react';
import dayGridPlugin from '@fullcalendar/daygrid';
import timeGridPlugin from '@fullcalendar/timegrid';
import interactionPlugin from '@fullcalendar/interaction';
import { apiGet } from '../api';

export default function CalendarView({ onSelectReservation }) {
  const [items, setItems] = useState([]);
  const [key, setKey] = useState(0);

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

  const today = new Date().toISOString().slice(0, 10);

  const events = useMemo(
    () =>
      items.map(it => {
        const start = `${it.Date}T${it.Start}:00`;
        const end = `${it.Date}T${it.End}:00`;
        const isProposed = it.Status === 'proposed';
        const isToday = it.Date === today;

        return {
          id: it.Id,
          title: isProposed
            ? `PROPOSED · ${it.Start}`
            : `Court ${it.Court} · $${it.BaseFee}`,
          start,
          end,
          extendedProps: it,

          classNames: isToday ? ['fc-event-today'] : [],

          backgroundColor: isProposed ? '#eab308' : '#1e3a8a',
          borderColor: isProposed ? '#854d0e' : '#1e3a8a',
        };
      }),
    [items, today]
  );

  return (
    <div className="mb-6">
      <FullCalendar
        key={key}
        plugins={[dayGridPlugin, timeGridPlugin, interactionPlugin]}
        initialView="dayGridMonth"

        headerToolbar={{
          left: 'prev,next today',
          center: 'title',
          right: 'dayGridMonth,timeGridWeek,timeGridDay',
        }}

        dayCellClassNames={(arg) =>
          arg.isToday ? ['fc-day-today-custom'] : []
        }

        events={events}
        eventClick={(info) =>
          onSelectReservation(info.event.extendedProps)
        }

        height="auto"
        nowIndicator
        allDaySlot={false}
        slotMinTime="06:00:00"
        slotMaxTime="23:00:00"
      />

      <button
        className="text-sm underline mt-2"
        onClick={() => setKey(k => k + 1)}
      >
        Refresh
      </button>
    </div>
  );
}
