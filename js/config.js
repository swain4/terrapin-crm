/**
 * config.js — the ONLY file you edit to point the site at your backend.
 * =============================================================================
 * There are NO secrets here. Both values below are safe to have in a public
 * repo: the Web App URL rejects any request without a valid Google token, and
 * the OAuth Client ID is a public identifier by design.
 *
 * Fill in the two PLACEHOLDER values (see README_FRONTEND.md for where each
 * comes from), then commit. Do not put Script Properties, Sheet IDs, folder
 * IDs, or the OAuth *secret* here — none of those belong in the front end.
 * =============================================================================
 */
window.CRM_CONFIG = {

  // 1) Your Apps Script Web App URL — Deploy > Manage deployments > copy the
  //    URL that ends in "/exec". Example:
  //    https://script.google.com/macros/s/AKfycb.../exec
  API_URL: 'https://script.google.com/macros/s/AKfycbyD4QFTVNeFEhdKRhI4Rbnr4owmHr-P1z8PcS8qDjlAD2CNkfvVwIzWOKMIPM40yk3J/exec',

  // 2) Your Google OAuth Client ID (Web application) from Google Cloud Console.
  //    Ends in ".apps.googleusercontent.com".
  GOOGLE_CLIENT_ID: '170901133606-ffqpc8kbkknknc4hs3p40ah1bo6do36s.apps.googleusercontent.com',

  // Cosmetic only.
  COMPANY_NAME: 'Terrapin Solar',

  // How long (ms) to debounce the search box.
  SEARCH_DEBOUNCE_MS: 350
};
