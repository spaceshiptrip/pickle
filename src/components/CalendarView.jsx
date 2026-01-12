import React, { useEffect, useMemo, useRef, useState } from 'react';
import FullCalendar from '@fullcalendar/react';
import dayGridPlugin from '@fullcalendar/daygrid';
import timeGridPlugin from '@fullcalendar/timegrid';
import interactionPlugin from '@fullcalendar/interaction';
import { apiGet } from '../api';
import { COURT_LAT, COURT_LON, COURT_TIMEZONE } from '../config';

function useIsMobile(breakpointPx = 520) {
  const [isMobile, setIsMobile] = useState(() => window.innerWidth <= breakpointPx);

  useEffect(() => {
    const onResize = () => setIsMobile(window.innerWidth <= breakpointPx);
    window.addEventListener('resize', onResize);
    return () => window.removeEventListener('resize', onResize);
  }, [breakpointPx]);

  return isMobile;
}

function codeToEmoji(code) {
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

  const [forecastDays, setForecastDays] = useState(16);
  const [showWeather, setShowWeather] = useState(true);
  const [weatherByDate, setWeatherByDate] = useState({});

  const isMobile = useIsMobile(520);
  const calRef = useRef(null);
  const [activeView, setActiveView] = useState('dayGridMonth');

  useEffect(() => {
    (async () => {
      try {
        const data = await apiGet({ action: 'listreservations' });
        if (data.ok) setItems(data.reservations);
      } catch (e) {
        console.error('Failed to load reservations', e);
      }
    })();
  }, [key]);

  useEffect(() => {
    if (!showWeather) {
      setWeatherByDate({});
      return;
    }

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
          map[time[i]] = { code: code[i], hi: hi[i], lo: lo[i], pop: pop[i] };
        }
        setWeatherByDate(map);
      } catch (e) {
        console.error('Failed to load weather', e);
        setWeatherByDate({});
      }
    })();
  }, [showWeather, forecastDays]);

  const today = new Date().toISOString().slice(0, 10);

  const events = useMemo(
    () =>
      items.map((it) => {
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

  const iconBtn =
    'inline-flex items-center justify-center h-8 w-8 rounded-md border border-gray-300 dark:border-gray-700 ' +
    'bg-white dark:bg-gray-900 hover:bg-gray-50 dark:hover:bg-gray-800 ' +
    'text-gray-800 dark:text-gray-100';

  const mobileViewBtn = (view, icon, label) => {
    const isActive = activeView === view;
    const cls =
      'inline-flex items-center justify-center h-8 w-8 rounded-md border ' +
      (isActive
        ? 'border-gray-900 dark:border-gray-100 bg-gray-100 dark:bg-gray-800'
        : 'border-gray-300 dark:border-gray-700 bg-white dark:bg-gray-900 hover:bg-gray-50 dark:hover:bg-gray-800') +
      ' text-gray-800 dark:text-gray-100';

    return (
      <button
        key={view}
        type="button"
        className={cls}
        onClick={() => {
          const api = calRef.current?.getApi?.();
          if (!api) return;
          api.changeView(view);
          setActiveView(view);
        }}
        title={label}
        aria-label={label}
      >
        <span style={{ fontSize: 16, lineHeight: 1 }}>{icon}</span>
      </button>
    );
  };

  return (
    <div className="mb-6">
      <div className="flex items-center justify-between mb-2">
        {/* left side: your existing small icon controls */}
        <div className="flex items-center gap-2">
          <button
            type="button"
            className={iconBtn}
            onClick={() => setShowWeather((v) => !v)}
            title={showWeather ? 'Hide weather' : 'Show weather'}
            aria-label={showWeather ? 'Hide weather' : 'Show weather'}
          >
            {showWeather ? '☀️' : '☁️'}
          </button>

          <button
            type="button"
            className={iconBtn}
            onClick={() => setForecastDays((d) => (d === 7 ? 16 : 7))}
            title={`Forecast range: ${forecastDays} days (click to toggle)`}
            aria-label={`Forecast range: ${forecastDays} days (click to toggle)`}
            disabled={!showWeather}
          >
            {forecastDays === 16 ? '16' : '7'}
          </button>

          <button
            type="button"
            className={iconBtn}
            onClick={() => setKey((k) => k + 1)}
            title="Refresh"
            aria-label="Refresh"
          >
            ↻
          </button>
        </div>

        {/* right side: mobile view switcher icons */}
        {isMobile && (
          <div className="flex items-center gap-2">
            {mobileViewBtn('dayGridMonth', '📅', 'Month')}
            {mobileViewBtn('timeGridWeek', '🗓️', 'Week')}
            {mobileViewBtn('timeGridDay', '⏱️', 'Day')}
          </div>
        )}
      </div>

      <FullCalendar
        ref={calRef}
        key={key}
        plugins={[dayGridPlugin, timeGridPlugin, interactionPlugin]}
        initialView={activeView}
        headerToolbar={
          isMobile
            ? {
                left: 'prev,next today',
                center: 'title',
                right: '', // ✅ hide big Month/Week/Day on mobile
              }
            : {
                left: 'prev,next today',
                center: 'title',
                right: 'dayGridMonth,timeGridWeek,timeGridDay',
              }
        }
        // keep activeView in sync if user changes view some other way
        datesSet={(arg) => setActiveView(arg.view.type)}
        titleFormat={isMobile ? { year: 'numeric', month: 'short' } : undefined}
        dayCellClassNames={(arg) => (arg.isToday ? ['fc-day-today-custom'] : [])}
        dayCellContent={(arg) => {
          const dayNumber = arg.dayNumberText;
          if (!showWeather) return dayNumber;

          const dateStr = arg.date.toISOString().slice(0, 10);
          const w = weatherByDate[dateStr];
          if (!w) return dayNumber;

          const emoji = codeToEmoji(w.code);
          const hi = Math.round(w.hi);
          const lo = Math.round(w.lo);

          return (
            <div style={{ lineHeight: 1.1 }}>
              <div>{dayNumber}</div>
              <div
                className="fc-weather-mini"
                title={`High ${hi}° / Low ${lo}° · Rain ${w.pop ?? 0}%`}
              >
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

