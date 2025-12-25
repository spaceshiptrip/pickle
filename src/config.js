// Configuration for the check-in app.
// TODO: Update these values for your deployment.

// Google Apps Script "web app" URL that writes to your Google Sheet.
export const APP_SCRIPT_URL = 'https://script.google.com/macros/s/AKfycbw7UUYtb9S3RtmZW6c2mA6r8xwq9GXfsj6oURMV4kLl5-r_Xs9wyyRht6p_MqoWaQ0h/exec';

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
