/**
 * api.js — the single channel to the Apps Script backend.
 * =============================================================================
 * All calls are POST with Content-Type text/plain (a CORS "simple" request, so
 * the browser sends no preflight — which Apps Script can't answer). The body is
 * a JSON string { action, token, params }. The signed Google token is what the
 * backend verifies; it is never a cookie, so there's no CSRF surface.
 * =============================================================================
 */
window.API = (function () {

  /**
   * Call a backend action. Returns the backend's JSON envelope
   * { success, data, message } or { success:false, errorCode, message }.
   * On an authentication error it triggers re-sign-in and rejects.
   */
  async function call(action, params) {
    var url = window.CRM_CONFIG.API_URL;
    if (!url || url.indexOf('PASTE_') === 0) {
      throw apiError('CONFIG', 'The site is not configured yet (API_URL is missing in config.js).');
    }

    var token = window.AUTH ? window.AUTH.getToken() : null;
    var body = JSON.stringify({ action: action, token: token, params: params || {} });

    var res;
    try {
      res = await fetch(url, {
        method: 'POST',
        // text/plain keeps this a "simple" request (no OPTIONS preflight).
        headers: { 'Content-Type': 'text/plain;charset=utf-8' },
        body: body,
        redirect: 'follow'
      });
    } catch (networkErr) {
      throw apiError('NETWORK', 'Can’t reach the server. Check your connection and try again.');
    }

    var json;
    try {
      json = await res.json();
    } catch (parseErr) {
      // Usually means the deployment settings are wrong (returned HTML, not JSON).
      throw apiError('BAD_RESPONSE', 'The server sent an unexpected response. (Check the Web App deployment.)');
    }

    if (json && json.success === false) {
      var code = json.errorCode || 'ERROR';
      if (['NOT_AUTHENTICATED', 'EXPIRED', 'BAD_TOKEN', 'NO_TOKEN', 'NOT_APPROVED',
           'WRONG_DOMAIN', 'INACTIVE', 'BAD_AUDIENCE'].indexOf(code) !== -1) {
        if (window.AUTH) window.AUTH.handleAuthFailure(json.message);
        throw apiError(code, json.message);
      }
      throw apiError(code, json.message || 'Something went wrong.');
    }
    return json;
  }

  function apiError(code, message) {
    var e = new Error(message);
    e.errorCode = code;
    return e;
  }

  return { call: call };
})();
