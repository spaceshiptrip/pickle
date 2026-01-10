// Configuration for the check-in app.
// TODO: Update these values for your deployment.

// Google Apps Script "web app" URL that writes to your Google Sheet.
export const APP_SCRIPT_URL =
  'https://script.google.com/macros/s/AKfycbzynLglhzqWx7Eil8xH1f-giNrkMppwFwuyL3Li2iKovVqw11qMybr-fC16B5VNAg7Q/exec';

// Venmo handle (e.g., '@John-Doe').
export const VENMO_HANDLE = '@Jay-Torres-367';

// Venmo link (e.g., 'https://venmo.com/John-Doe').
export const VENMO_URL = `https://venmo.com/${VENMO_HANDLE.replace('@', '')}`;

// Admin contact (E.164 format)
export const JAY_PHONE_E164 = '+18186539874';

// src/config.js

export const COURT_LAT = 34.1478;
export const COURT_LON = -118.1445;

// optional: for clarity / future
export const COURT_CITY = 'Pasadena, CA';
export const COURT_TIMEZONE = 'America/Los_Angeles';
