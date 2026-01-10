import React, { useEffect, useMemo, useState } from 'react';
import FullCalendar from '@fullcalendar/react';
import dayGridPlugin from '@fullcalendar/daygrid';
import timeGridPlugin from '@fullcalendar/timegrid';
import interactionPlugin from '@fullcalendar/interaction';
import { apiGet } from '../api';
import { COURT_LAT, COURT_LON, COURT_TIMEZONE } from '../config';

function codeToEmoji(code) {
  // Open-Meteo weathercode quick mapping
  if (code === 0) return '☀️';
  if ([1, 2].includes(code)) return '⛅️';
  if (code === 3) return '☁️';
  if ([45, 48].includes(code)) return '🌫️';
  if ([51, 53, 55, 56, 57].includes(code)) return '🌦️';
  if ([61, 63, 65, 66, 67].includes(code)) return '🌧️';
  if ([71, 73, 75, 77].includes(code)) return '❄️';
  if ([80, 81, 82].includes(code)) return '🌧️';
  if ([95, 96, 99].includes(code)) return '⛈️';
  return '🌡️';
}

export default function CalendarView({ onSelectReservation }) {
  const [items, setItems] = useState([]);
  const [key, setKey] = useState(0);
  const [forecastDays, setForecastDays] = useState(7); // toggle 7 or 16
  const [weatherByDate, setWeatherByDate] = useState({}); // { 'YYYY-MM-DD': { code, hi, lo, pop } }

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

  // ✅ Weather: set your court location here
  const COURT_LAT = 34.1478;     // <-- replace
  const COURT_LON = -118.1445;   // <-- replace

  useEffect(() => {
    (async () => {
      try {
const url =
  `https://api.open-meteo.com/v1/forecast` +
  `?latitude=${COURT_LAT}` +
  `&longitude=${COURT_LON}` +
  `&daily=weathercode,temperature_2m_max,temperature_2m_min,precipitation_probability_max` +
  `&temperature_unit=fahrenheit` +
  `&timezone=${COURT_TIMEZONE}` +
  `&forecast_days=${forecastDays}`;

        const resp = await fetch(url);
        const json = await resp.json();

        const time = json?.daily?.time || [];
        const code = json?.daily?.weathercode || [];
        const hi = json?.daily?.temperature_2m_max || [];
        const lo = json?.daily?.temperature_2m_min || [];
        const pop = json?.daily?.precipitation_probability_max || [];

        const map = {};
        for (let i = 0; i < time.length; i++) {
          map[time[i]] = {
            code: code[i],
            hi: hi[i],
            lo: lo[i],
            pop: pop[i],
          };
        }
        setWeatherByDate(map);
      } catch (e) {
        console.error('Failed to load weather', e);
        setWeatherByDate({});
      }
    })();
  }, [forecastDays, COURT_LAT, COURT_LON]);

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
          title: isProposed ? `PROPOSED · ${it.Start}` : `Court ${it.Court} · $${it.BaseFee}`,
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
      <div className="flex items-center gap-3 mb-2">
        <button
          className="text-sm underline"
          onClick={() => setForecastDays(d => (d === 7 ? 16 : 7))}
          title="Toggle forecast range"
        >
          Weather: next {forecastDays} days (click to toggle)
        </button>

        <button
          className="text-sm underline"
          onClick={() => setKey(k => k + 1)}
        >
          Refresh
        </button>
      </div>

      <FullCalendar
        key={key}
        plugins={[dayGridPlugin, timeGridPlugin, interactionPlugin]}
        initialView="dayGridMonth"
        headerToolbar={{
          left: 'prev,next today',
          center: 'title',
          right: 'dayGridMonth,timeGridWeek,timeGridDay',
        }}
        dayCellClassNames={(arg) => (arg.isToday ? ['fc-day-today-custom'] : [])}

        // ✅ Render weather inside each day cell (month/week/day)
        dayCellContent={(arg) => {
          const dateStr = arg.date.toISOString().slice(0, 10);
          const w = weatherByDate[dateStr];
          const dayNumber = arg.dayNumberText; // e.g., "9"
          if (!w) return dayNumber;

          const emoji = codeToEmoji(w.code);
          const hi = Math.round(w.hi);
          const lo = Math.round(w.lo);

          // Keep it compact: "9" + "☀️ 72/55"
          return (
            <div style={{ lineHeight: 1.1 }}>
              <div>{dayNumber}</div>
              <div className="fc-weather-mini" title={`High ${hi}° / Low ${lo}° · Rain ${w.pop ?? 0}%`}>
                {emoji} {hi}/{lo}
              </div>
            </div>
          );
        }}

        events={events}
        eventClick={(info) => onSelectReservation(info.event.extendedProps)}
        height="auto"
        nowIndicator
        allDaySlot={false}
        slotMinTime="06:00:00"
        slotMaxTime="23:00:00"
      />
    </div>
  );
}
