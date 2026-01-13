import React, { useEffect, useMemo, useRef, useState } from 'react';

import FullCalendar from '@fullcalendar/react';
import dayGridPlugin from '@fullcalendar/daygrid';
import timeGridPlugin from '@fullcalendar/timegrid';
import interactionPlugin from '@fullcalendar/interaction';
import { apiGet } from '../api';
import { COURT_LAT, COURT_LON, COURT_TIMEZONE } from '../config';

import { createPortal } from 'react-dom';

function CenterTitleSpinnerPortal({ show }) {
  const [mountEl, setMountEl] = useState(null);

  const findTitleEl = () =>
    document.querySelector('.fc .fc-toolbar-title');

  useEffect(() => {
    if (!show) return;
    setMountEl(findTitleEl());
  }, [show]);

  // Re-find when the calendar rerenders (view change, next/prev, etc.)
  useEffect(() => {
    if (!show) return;
    const id = setInterval(() => {
      const el = findTitleEl();
      if (el) {
        setMountEl(el);
        clearInterval(id);
      }
    }, 50);
    return () => clearInterval(id);
  }, [show]);

  if (!show || !mountEl) return null;

  return createPortal(
    <span
      className="inline-flex items-center ml-2 align-middle"
      title="Loading calendar…"
      aria-label="Loading calendar…"
    >
      <Spinner className="h-4 w-4" />
    </span>,
    mountEl
  );
}



function useIsMobile(breakpointPx = 520) {
  const [isMobile, setIsMobile] = useState(() => window.innerWidth <= breakpointPx);

  useEffect(() => {
    const onResize = () => setIsMobile(window.innerWidth <= breakpointPx);
    window.addEventListener('resize', onResize);
    return () => window.removeEventListener('resize', onResize);
  }, [breakpointPx]);

  return isMobile;
}

function Spinner({ className = "h-4 w-4" }) {
  return (
    <svg
      className={`animate-spin ${className}`}
      viewBox="0 0 24 24"
      aria-hidden="true"
    >
      <circle
        className="opacity-25"
        cx="12"
        cy="12"
        r="10"
        stroke="currentColor"
        strokeWidth="4"
        fill="none"
      />
      <path
        className="opacity-75"
        fill="currentColor"
        d="M4 12a8 8 0 018-8v3a5 5 0 00-5 5H4z"
      />
    </svg>
  );
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



function MobileDropdown({ label, value, icon, children, compact = false, className = "" }) {
  const [open, setOpen] = useState(false);
  const ref = useRef(null);

  useEffect(() => {
    function onDocClick(e) {
      if (!ref.current) return;
      if (!ref.current.contains(e.target)) setOpen(false);
    }
    document.addEventListener('mousedown', onDocClick);
    document.addEventListener('touchstart', onDocClick, { passive: true });
    return () => {
      document.removeEventListener('mousedown', onDocClick);
      document.removeEventListener('touchstart', onDocClick);
    };
  }, []);

  return (
    <div ref={ref} className={`relative ${className}`}>
      <button
        type="button"
        onClick={() => setOpen((v) => !v)}
        aria-label={label}
        aria-expanded={open}
        title={compact ? `${label}: ${value}` : label}
        className={
          compact
            ? `h-12 w-12 rounded-2xl flex items-center justify-center
               bg-slate-800/70 text-slate-100 border border-slate-700
               active:scale-[0.99]`
            : `w-full flex items-center justify-between gap-3 px-4 py-3 rounded-2xl
               bg-slate-800/70 text-slate-100 border border-slate-700
               active:scale-[0.99]`
        }
      >
        {compact ? (
          <span className="text-2xl leading-none">{icon}</span>
        ) : (
          <>
            <div className="flex items-center gap-3 min-w-0">
              <span className="text-lg shrink-0">{icon}</span>
              <div className="min-w-0">
                <div className="text-[11px] uppercase tracking-wider text-slate-300">{label}</div>
                <div className="text-base font-extrabold truncate">{value}</div>
              </div>
            </div>
            <span className={`shrink-0 text-slate-300 transition-transform ${open ? 'rotate-180' : ''}`}>
              ▾
            </span>
          </>
        )}
      </button>

      {open && (
        <div
          className="absolute left-0 right-0 mt-2 z-50 rounded-2xl overflow-hidden
                     border border-slate-700 bg-slate-900 shadow-xl"
        >
          {children({ close: () => setOpen(false) })}
        </div>
      )}
    </div>
  );
}

function MobileDropdownItem({ active, onClick, icon, title, subtitle }) {
  return (
    <button
      type="button"
      onClick={onClick}
      className={`w-full text-left px-4 py-3 flex items-start gap-3
                  ${active ? 'bg-slate-800 text-white' : 'bg-slate-900 text-slate-200 hover:bg-slate-800/70'}`}
    >
      <span className="text-lg shrink-0 mt-0.5">{icon}</span>
      <div className="min-w-0">
        <div className="font-extrabold">{title}</div>
        {subtitle ? <div className="text-xs text-slate-400">{subtitle}</div> : null}
      </div>
    </button>
  );
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
  const [loading, setLoading] = useState(false);


useEffect(() => {
  (async () => {
    setLoading(true);
    try {
      const data = await apiGet({ action: 'listreservations' });
      if (data.ok) setItems(data.reservations);
    } catch (e) {
      console.error('Failed to load reservations', e);
    } finally {
      setLoading(false);
    }
  })();
}, [key]);

useEffect(() => {
  const btn = document.querySelector('.fc-refreshIndicator-button');
  if (!btn) return;

  if (loading) btn.classList.add('is-loading');
  else btn.classList.remove('is-loading');
}, [loading]);



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
      const status = String(it.Status || '').toLowerCase();
      const isProposed = status === 'proposed';
      const isCancelled = status === 'cancelled' || status === 'canceled';
      const isToday = it.Date === today;

      return {
        id: it.Id,
        title: isProposed ? `PROPOSED · ${it.Start}` : `${it.Court} Court · $${it.BaseFee}`,
        start,
        end,
        extendedProps: it,
        classNames: [
          ...(isToday ? ['fc-event-today'] : []),
          ...(isCancelled ? ['fc-event-cancelled'] : []),
        ],
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


  const VIEW_OPTIONS = [
    { key: 'dayGridMonth', icon: '📅', title: 'Month', subtitle: 'Month grid' },
    { key: 'timeGridWeek', icon: '🗓️', title: 'Week', subtitle: '7-day schedule' },
    { key: 'timeGridDay',  icon: '⏱️', title: 'Day',  subtitle: 'Hourly schedule' },
  ];

  const currentView =
    VIEW_OPTIONS.find(v => v.key === activeView) || VIEW_OPTIONS[0];

  const weatherLabel = showWeather
    ? (forecastDays === 16 ? 'On (16d)' : 'On (7d)')
    : 'Off';

  const weatherIcon = showWeather ? '☀️' : '☁️';




  return (
    <div className="mb-6">

      <div className="flex items-center justify-between mb-2 gap-3">
        {/* LEFT: Weather controls */}
        <div className="flex-1">
          {/* MOBILE: single dropdown */}



{isMobile ? (
  <MobileDropdown
    label="Weather"
    value={weatherLabel}
    icon={weatherIcon}
    compact
    className="w-auto"
  >
    {({ close }) => (
      <div className="divide-y divide-slate-800">
        <MobileDropdownItem
          active={showWeather}
          icon="☀️"
          title="Weather on"
          subtitle="Show weather in day cells"
          onClick={() => { setShowWeather(true); close(); }}
        />
        <MobileDropdownItem
          active={showWeather && forecastDays === 16}
          icon="🗓️"
          title="16-day forecast"
          subtitle="Longer outlook"
          onClick={() => { setShowWeather(true); setForecastDays(16); close(); }}
        />
        <MobileDropdownItem
          active={showWeather && forecastDays === 7}
          icon="📆"
          title="7-day forecast"
          subtitle="Shorter, more relevant"
          onClick={() => { setShowWeather(true); setForecastDays(7); close(); }}
        />
        <MobileDropdownItem
          active={!showWeather}
          icon="☁️"
          title="Weather off"
          subtitle="Hide weather"
          onClick={() => { setShowWeather(false); close(); }}
        />
      </div>
    )}






            </MobileDropdown>
          ) : (
            /* DESKTOP: keep your existing two buttons */
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
            </div>
          )}
        </div>


{/* RIGHT: View controls */}
<div className="flex-1 flex justify-end">
  {isMobile ? (
    <MobileDropdown
      label="View"
      value={currentView.title}
      icon={currentView.icon}
      compact
      className="w-auto"
    >
      {({ close }) => (
        <div className="divide-y divide-slate-800">
          {VIEW_OPTIONS.map((v) => (
            <MobileDropdownItem
              key={v.key}
              active={v.key === activeView}
              icon={v.icon}
              title={v.title}
              subtitle={v.subtitle}
              onClick={() => {
                const api = calRef.current?.getApi?.();
                if (!api) return;
                api.changeView(v.key);
                setActiveView(v.key);
                close();
              }}
            />
          ))}
        </div>
      )}
    </MobileDropdown>
  ) : (
    <div />
  )}
</div>
</div>





{/* Dim + disable calendar interactions while loading */}
<div className={loading ? "opacity-60 pointer-events-none" : ""}>
  <FullCalendar
    ref={calRef}
    key={key}
    plugins={[dayGridPlugin, timeGridPlugin, interactionPlugin]}
    initialView={activeView}

    // ✅ Add a toolbar button right next to "today"
customButtons={{
  refreshIndicator: {
    text: '↻',
    click: () => {
      if (!loading) setKey(k => k + 1);
    },
  },
}}

eventContent={(arg) => {
  const status = String(arg.event.extendedProps?.Status || '').toLowerCase();
  const isCancelled = status === 'cancelled' || status === 'canceled';
  const isProposed = status === 'proposed';
  const isScheduled = !isCancelled && !isProposed; // default bucket

  return (
    <div className="fc-event-content-wrap">
      {isCancelled ? (
        <span className="fc-dot fc-dot-cancel" aria-hidden="true" />
      ) : isProposed ? (
        <span className="fc-dot fc-dot-proposed" aria-hidden="true" />
      ) : isScheduled ? (
        <span className="fc-dot fc-dot-scheduled" aria-hidden="true" />
      ) : null}

      <span className={isCancelled ? 'fc-cancel-text' : ''}>
        {arg.event.title}
      </span>
    </div>
  );
}}

    headerToolbar={
      isMobile
        ? {
            left: 'prev,next today refreshIndicator',
            center: 'title',
            right: '', // hide big Month/Week/Day buttons on mobile
          }
        : {
            left: 'prev,next today refreshIndicator',
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
  <span className="fc-weather-icon" aria-hidden="true">{emoji}</span>
  <span className="fc-weather-temps">{hi}/{lo}</span>
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

<CenterTitleSpinnerPortal show={loading} />

    </div>
  );
}

