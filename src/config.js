// Configuration for the check-in app.
// TODO: Update these values for your deployment.

// Google Apps Script "web app" URL that writes to your Google Sheet.
export const APP_SCRIPT_URL = 'https://script.google.com/macros/s/AKfycbxFMchEdz2Pk89zP41iAy92RS5D1zfSvDAcQpZ8C3X_nt_tbRySyu2tqFvTiNW61mpz/exec';

// Player access code (simple shared gate).
export const ACCESS_CODE = 'playercode';

// Organizer access code (unlocks admin view).
export const ORGANIZER_CODE = 'organizercode';

// Default payment amount in dollars (total amount the payer is sending).
export const DEFAULT_AMOUNT = 5;

// Venmo handle (e.g., '@John-Doe').
export const VENMO_HANDLE = '@Jay-Torres-367';

// Venmo link (e.g., 'https://venmo.com/John-Doe').
export const VENMO_URL = `https://venmo.com/${VENMO_HANDLE.replace('@', '')}`;
