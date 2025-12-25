import React from 'react';
import ReactDOM from 'react-dom/client';
import App from './App';
import './style.css';        // <-- Tailwind CDN (must be imported)
import './styles/App.css';   // <-- your existing custom styles

ReactDOM.createRoot(document.getElementById('root')).render(
  <React.StrictMode>
    <App />
  </React.StrictMode>,
);
