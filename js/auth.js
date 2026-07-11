/**
 * auth.js — Google Sign-In (Google Identity Services) + session handling.
 * =============================================================================
 * The ID token is kept in memory only (not localStorage), and re-acquired via
 * Google when it expires. The backend re-verifies it on every request, so the
 * front end never makes a trust decision on its own.
 * =============================================================================
 */
window.AUTH = (function () {
  var idToken = null;
  var currentUser = null;      // { email, name, role, crew, capabilities }
  var onSignedIn = null;       // callback set by the app

  /** Called by GIS when the user completes sign-in. */
  function handleCredential(response) {
    idToken = response.credential;
    if (typeof onSignedIn === 'function') onSignedIn();
  }

  /** Initialize GIS and render the sign-in button into an element. */
  function init(signedInCallback) {
    onSignedIn = signedInCallback;
    waitForGis(function () {
      google.accounts.id.initialize({
        client_id: window.CRM_CONFIG.GOOGLE_CLIENT_ID,
        callback: handleCredential,
        auto_select: false,
        cancel_on_tap_outside: true
      });
    });
  }

  /** Render the "Sign in with Google" button into the given container. */
  function renderButton(container) {
    waitForGis(function () {
      google.accounts.id.renderButton(container, {
        theme: 'filled_blue', size: 'large', shape: 'pill',
        text: 'signin_with', logo_alignment: 'left', width: 260
      });
      // Also show the One Tap prompt where allowed.
      try { google.accounts.id.prompt(); } catch (e) { /* ignore */ }
    });
  }

  function waitForGis(cb) {
    if (window.google && google.accounts && google.accounts.id) return cb();
    var tries = 0;
    var t = setInterval(function () {
      if (window.google && google.accounts && google.accounts.id) { clearInterval(t); cb(); }
      else if (++tries > 50) { clearInterval(t); } // ~5s
    }, 100);
  }

  function getToken() { return idToken; }
  function isSignedIn() { return !!idToken; }

  function setUser(u) { currentUser = u; }
  function getUser() { return currentUser; }

  /** Role/capability helpers used to decide what UI to show (backend still enforces). */
  function can(capability) {
    return !!(currentUser && currentUser.capabilities && currentUser.capabilities[capability]);
  }

  function signOut() {
    idToken = null;
    currentUser = null;
    try { google.accounts.id.disableAutoSelect(); } catch (e) {}
    location.hash = '#/login';
  }

  /** Called when the backend rejects our token — force a fresh sign-in. */
  function handleAuthFailure(message) {
    idToken = null;
    currentUser = null;
    location.hash = '#/login';
    if (window.APP && APP.flashLoginMessage) APP.flashLoginMessage(message || 'Please sign in again.');
  }

  return {
    init: init, renderButton: renderButton, getToken: getToken, isSignedIn: isSignedIn,
    setUser: setUser, getUser: getUser, can: can, signOut: signOut, handleAuthFailure: handleAuthFailure
  };
})();
