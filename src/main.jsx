import React from 'react';
import ReactDOM from 'react-dom/client';
import App from './App';
import './index.css';                 // Tailwind
import './styles/App.css';            // custom styles
import './styles/fullcalendar-dark.css'; // FullCalendar dark fixes

ReactDOM.createRoot(document.getElementById('root')).render(
  <React.StrictMode>
    <App />
  </React.StrictMode>,
);

