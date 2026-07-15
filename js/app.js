/**
 * app.js — router, views, and rendering for the Terrapin Solar CRM.
 * =============================================================================
 * Plain DOM (no framework). All values coming from the backend are inserted as
 * TEXT (never innerHTML), so Sheet data can't inject markup. External links are
 * validated to http(s) before use. Every data view shows loading, empty, and
 * error states, and important actions ask for confirmation.
 * =============================================================================
 */
window.APP = (function () {

  var appEl, toastEl, loginMsg = null;

  /* --------------------------- tiny DOM helpers -------------------------- */

  // el('div', {class:'x', onclick:fn}, ['text', childNode])
  function el(tag, attrs, children) {
    var n = document.createElement(tag);
    attrs = attrs || {};
    Object.keys(attrs).forEach(function (k) {
      var v = attrs[k];
      if (v === null || v === undefined || v === false) return;
      if (k === 'class') n.className = v;
      else if (k === 'html') { /* intentionally unused — we avoid innerHTML */ }
      else if (k.slice(0, 2) === 'on' && typeof v === 'function') n.addEventListener(k.slice(2), v);
      else if (k === 'href') {
        // In-app hash routes (e.g. "#/job/TS-2026-0001") are built internally by
        // linkBtn() and are safe by construction — the dynamic part is always
        // encodeURIComponent()'d first. Only externally-sourced links (job data:
        // Maps, PDFs, customer folders) need the http/https/mailto/tel filter.
        if (typeof v === 'string' && v.charAt(0) === '#') { n.setAttribute('href', v); }
        else { var u = safeUrl(v); if (u) n.setAttribute('href', u); }
      }
      else n.setAttribute(k, v);
    });
    appendChildren(n, children);
    return n;
  }
  function appendChildren(n, children) {
    if (children === null || children === undefined) return;
    if (!Array.isArray(children)) children = [children];
    children.forEach(function (c) {
      if (c === null || c === undefined || c === false) return;
      n.appendChild(typeof c === 'string' || typeof c === 'number'
        ? document.createTextNode(String(c)) : c);
    });
  }
  function clear(n) { while (n.firstChild) n.removeChild(n.firstChild); }

  // Only allow http/https/mailto/tel links (block javascript: etc.)
  function safeUrl(u) {
    if (!u) return null;
    var s = String(u).trim();
    if (/^(https?:|mailto:|tel:)/i.test(s)) return s;
    return null;
  }

  function mapsUrl(query) {
    return 'https://www.google.com/maps/search/?api=1&query=' + encodeURIComponent(query || '');
  }

  function toast(message, kind) {
    toastEl.textContent = message;
    toastEl.className = 'toast show ' + (kind || 'info');
    toastEl.hidden = false;
    clearTimeout(toast._t);
    toast._t = setTimeout(function () { toastEl.hidden = true; }, 4000);
  }

  function loadingBlock(label) {
    return el('div', { class: 'state loading' }, [el('div', { class: 'spinner' }), label || 'Loading…']);
  }
  function emptyBlock(label) {
    return el('div', { class: 'state empty' }, label || 'Nothing to show yet.');
  }
  function errorBlock(message, retryFn) {
    return el('div', { class: 'state error' }, [
      el('div', {}, message || 'Something went wrong.'),
      retryFn ? el('button', { class: 'btn small', onclick: retryFn }, 'Try again') : null
    ]);
  }

  /* ------------------------------ app chrome ---------------------------- */

  function setChrome(signedIn) {
    document.getElementById('appbar').hidden = !signedIn;
    var u = AUTH.getUser();
    var chip = document.getElementById('userChip');
    if (u) chip.textContent = (u.name || u.email) + ' · ' + u.role;
    // Hide admin-only nav links.
    document.querySelectorAll('[data-admin-only]').forEach(function (a) {
      a.style.display = AUTH.can('adminConfig') ? '' : 'none';
    });
    // Hide the Drafts & Cancelled cleanup link from anyone who can't archive.
    document.querySelectorAll('[data-cleanup-only]').forEach(function (a) {
      a.style.display = AUTH.can('archiveJobs') ? '' : 'none';
    });
  }

  function initChrome() {
    document.getElementById('signOutBtn').addEventListener('click', function () { AUTH.signOut(); });
    var drawer = document.getElementById('drawer'), scrim = document.getElementById('scrim');
    function closeDrawer() { drawer.hidden = true; scrim.hidden = true; }
    document.getElementById('navToggle').addEventListener('click', function () {
      var open = drawer.hidden; drawer.hidden = !open; scrim.hidden = !open;
    });
    scrim.addEventListener('click', closeDrawer);
    drawer.querySelectorAll('[data-nav]').forEach(function (a) { a.addEventListener('click', closeDrawer); });
  }

  /* ------------------------------- router ------------------------------- */

  function route() {
    var hash = location.hash || '#/dashboard';
    var parts = hash.replace(/^#\//, '').split('/');
    var view = parts[0] || 'dashboard';

    // Gate everything except login behind sign-in.
    if (!AUTH.isSignedIn() && view !== 'login') { location.hash = '#/login'; return; }
    if (AUTH.isSignedIn() && view === 'login') { location.hash = '#/dashboard'; return; }

    setChrome(AUTH.isSignedIn());
    clear(appEl);
    window.scrollTo(0, 0);

    switch (view) {
      case 'login':     return viewLogin();
      case 'dashboard': return viewDashboard();
      case 'search':    return viewSearch();
      case 'calendar':  return viewUpcoming();
      case 'myjobs':    return viewMyJobs();
      case 'job':       return viewJob(decodeURIComponent(parts[1] || ''));
      case 'admin':     return viewAdmin();
      case 'cleanup':   return viewCleanup();
      default:          return viewDashboard();
    }
  }

  /* ------------------------------- login -------------------------------- */

  function viewLogin() {
    var btnHolder = el('div', { class: 'gbtn' });
    appEl.appendChild(el('section', { class: 'login' }, [
      el('img', { class: 'login-mark', src: 'img/logo-512.png', width: '96', height: '96', alt: 'Terrapin Solar' }),
      el('h1', {}, 'Terrapin Solar CRM'),
      el('p', { class: 'muted' }, 'Sign in with your Terrapin Solar Google account.'),
      loginMsg ? el('div', { class: 'notice' }, loginMsg) : null,
      btnHolder,
      el('p', { class: 'fineprint' }, 'Access is limited to approved company accounts.')
    ]));
    loginMsg = null;
    AUTH.renderButton(btnHolder);
  }

  function flashLoginMessage(msg) { loginMsg = msg; }

  /* ----------------------------- dashboard ------------------------------ */

  async function viewDashboard() {
    var u = AUTH.getUser();
    var wrap = el('section', { class: 'view' }, [
      el('h2', { class: 'greeting' }, 'Hi, ' + firstName(u) + ' 👋'),
      searchBar(),
      quickActions(),
      el('h3', {}, 'Upcoming jobs'),
      el('div', { id: 'dashUpcoming' }, loadingBlock()),
      isField() ? el('h3', {}, 'My assigned jobs') : null,
      isField() ? el('div', { id: 'dashMine' }, loadingBlock()) : null
    ]);
    appEl.appendChild(wrap);

    loadInto('dashUpcoming', function () { return API.call('getUpcomingJobs', { days: 30 }); },
      function (data) { return jobList(asArray(data), 'No upcoming jobs in the next 30 days.'); });

    if (isField()) {
      loadInto('dashMine', function () { return API.call('getAssignedJobs', {}); },
        function (data) { return jobList(asArray(data), 'No jobs assigned to you yet.'); });
    }
  }

  function quickActions() {
    var actions = [linkBtn('Search jobs', '#/search', 'primary'),
                   linkBtn('Upcoming', '#/calendar')];
    if (AUTH.can('createOrEditJob')) actions.push(linkBtn('New job', '#/admin'));
    if (AUTH.can('archiveJobs')) actions.push(linkBtn('Drafts & Cancelled', '#/cleanup'));
    return el('div', { class: 'quick-actions' }, actions);
  }

  /* ------------------------------- search ------------------------------- */

  function viewSearch() {
    var input = el('input', {
      type: 'search', id: 'searchInput', placeholder: 'Site ID, name, address, phone…',
      autocomplete: 'off', 'aria-label': 'Search jobs', enterkeyhint: 'search'
    });
    var results = el('div', { id: 'searchResults' }, emptyBlock('Start typing to search.'));
    appEl.appendChild(el('section', { class: 'view' }, [
      el('h2', {}, 'Search'),
      el('div', { class: 'searchbox' }, [input]),
      results
    ]));
    input.focus();

    var timer;
    input.addEventListener('input', function () {
      clearTimeout(timer);
      var q = input.value.trim();
      if (!q) { clear(results); results.appendChild(emptyBlock('Start typing to search.')); return; }
      timer = setTimeout(function () { doSearch(q, results); }, window.CRM_CONFIG.SEARCH_DEBOUNCE_MS);
    });
  }

  async function doSearch(text, container) {
    clear(container); container.appendChild(loadingBlock('Searching…'));
    try {
      var resp = await API.call('searchJobs', { text: text });
      var rows = (resp.data && resp.data.results) || [];
      clear(container);
      if (!rows.length) { container.appendChild(emptyBlock('No matches for “' + text + '”.')); return; }
      container.appendChild(el('div', { class: 'muted small' }, rows.length + ' result' + (rows.length === 1 ? '' : 's')));
      container.appendChild(el('div', { class: 'list' }, rows.map(searchRow)));
    } catch (e) {
      clear(container); container.appendChild(errorBlock(e.message, function () { doSearch(text, container); }));
    }
  }

  function searchRow(r) {
    return el('div', { class: 'card jobrow' }, [
      el('div', { class: 'jobrow-main' }, [
        el('div', { class: 'siteid' }, r['Site ID']),
        el('div', { class: 'strong' }, r['Homeowner'] || '—'),
        el('div', { class: 'muted small' }, r['Property Address'] || ''),
        el('div', { class: 'badges' }, [
          badge(r['Job Status']), badge(r['Current Job Stage'], 'stage')
        ])
      ]),
      el('div', { class: 'jobrow-actions' }, [
        linkBtn('Open', '#/job/' + encodeURIComponent(r['Site ID']), 'primary small'),
        extLinkBtn('Maps', mapsUrl(r['MapsQuery']), 'small')
      ])
    ]);
  }

  /* ---------------------------- upcoming / mine ------------------------- */

  function viewUpcoming() {
    appEl.appendChild(el('section', { class: 'view' }, [
      el('h2', {}, 'Upcoming jobs'),
      el('div', { class: 'muted small' }, 'Next 30 days'),
      el('div', { id: 'upcomingList' }, loadingBlock())
    ]));
    loadInto('upcomingList', function () { return API.call('getUpcomingJobs', { days: 30 }); },
      function (data) { return jobList(asArray(data), 'No upcoming jobs.'); });
  }

  function viewMyJobs() {
    appEl.appendChild(el('section', { class: 'view' }, [
      el('h2', {}, 'My jobs'),
      el('div', { id: 'myList' }, loadingBlock())
    ]));
    loadInto('myList', function () { return API.call('getAssignedJobs', {}); },
      function (data) { return jobList(asArray(data), 'No jobs assigned to you.'); });
  }

  /* ----------------------- drafts & cancelled cleanup --------------------- */

  /**
   * The one-stop list this whole feature exists for: every non-archived Draft
   * or Cancelled job, with Archive/Delete right on the row — no need to open
   * each one individually just to clear it out.
   */
  function viewCleanup() {
    if (!AUTH.can('archiveJobs')) {
      appEl.appendChild(el('section', { class: 'view' }, [errorBlock('This view is limited to owner/admin users.')]));
      return;
    }
    appEl.appendChild(el('section', { class: 'view' }, [
      el('h2', {}, 'Drafts & Cancelled'),
      el('div', { class: 'muted small' }, 'Unsent drafts and cancelled jobs, not yet archived — clear them out here.'),
      el('div', { id: 'cleanupList' }, loadingBlock())
    ]));
    loadCleanupList();
  }

  function loadCleanupList() {
    loadInto('cleanupList', function () { return API.call('getCleanupCandidates', {}); },
      function (data) {
        var rows = asArray(data);
        if (!rows.length) return emptyBlock('Nothing to clean up — no Draft or Cancelled jobs outside the archive.');
        return el('div', { class: 'list' }, rows.map(cleanupRow));
      });
  }

  function cleanupRow(r) {
    var siteId = r['Site ID'];
    return el('div', { class: 'card jobrow' }, [
      el('div', { class: 'jobrow-main' }, [
        el('div', { class: 'siteid' }, siteId),
        el('div', { class: 'strong' }, r['Homeowner'] || '—'),
        el('div', { class: 'muted small' }, r['Property Address'] || ''),
        el('div', { class: 'badges' }, [badge(r['Job Status'])])
      ]),
      el('div', { class: 'jobrow-actions' }, [
        linkBtn('Open', '#/job/' + encodeURIComponent(siteId), 'small'),
        el('button', { class: 'btn small warn', onclick: function () { archiveFromCleanup(siteId); } }, 'Archive'),
        el('button', { class: 'btn small danger', onclick: function () { deleteFromCleanup(siteId); } }, 'Delete')
      ])
    ]);
  }

  async function archiveFromCleanup(siteId) {
    if (!window.confirm('Archive ' + siteId + '? Hidden from lists, fully reversible.')) return;
    try {
      await API.call('archiveJob', { siteId: siteId, archived: true });
      toast('Job archived.', 'success');
      loadCleanupList();
    } catch (e) { toast(e.message, 'error'); }
  }

  async function deleteFromCleanup(siteId) {
    var typed = window.prompt(
      'This PERMANENTLY deletes job ' + siteId + ' — this cannot be undone.\n\n' +
      'Type the Site ID exactly (' + siteId + ') to confirm:'
    );
    if (typed === null) return;
    if (typed.trim().toUpperCase() !== String(siteId).toUpperCase()) {
      toast('Site ID didn’t match — nothing was deleted.', 'error');
      return;
    }
    try {
      var resp = await API.call('deleteJob', { siteId: siteId, confirmSiteId: typed.trim() });
      toast(resp.message || (siteId + ' permanently deleted.'), 'success');
      loadCleanupList();
    } catch (e) { toast(e.message, 'error'); }
  }

  /* -------------------------------- job --------------------------------- */

  async function viewJob(siteId) {
    var container = el('section', { class: 'view' }, [loadingBlock('Loading job…')]);
    appEl.appendChild(container);
    try {
      // Status options are only needed for the lifecycle status-changer, which
      // only management can see/use — skip the extra call for field roles.
      var calls = [API.call('getJobById', { siteId: siteId })];
      if (AUTH.can('createOrEditJob')) calls.push(API.call('getOptions', {}));
      var results = await Promise.all(calls);
      var j = results[0].data || {};
      var statuses = (results[1] && results[1].data && results[1].data.Statuses) || [];
      clear(container);
      renderJob(container, j, statuses);
    } catch (e) {
      clear(container);
      container.appendChild(errorBlock(e.message, function () { viewJob(siteId); }));
    }
  }

  function renderJob(container, j, statuses) {
    statuses = statuses || [];
    var name = ((j['Homeowner First Name'] || '') + ' ' + (j['Homeowner Last Name'] || '')).trim() || '—';
    var mapsQ = [j['Property Address'], j['City'], j['State'], j['ZIP']].filter(Boolean).join(', ');

    // Sticky header always shows the Site ID.
    container.appendChild(el('div', { class: 'job-header' }, [
      el('div', { class: 'siteid big' }, j['Site ID'] || '—'),
      el('div', { class: 'strong' }, name),
      el('div', { class: 'muted' }, mapsQ),
      el('div', { class: 'badges' }, [badge(j['Job Status']), badge(j['Current Job Stage'], 'stage'),
        String(j['Archived']).toLowerCase() === 'yes' ? badge('Archived', 'archived') : null])
    ]));

    // Safety notes banner (prominent).
    if (j['Safety Notes']) {
      container.appendChild(el('div', { class: 'safety' }, ['⚠ Safety: ', j['Safety Notes']]));
    }
    if (j['Special Instructions']) {
      container.appendChild(el('div', { class: 'notice' }, ['Instructions: ', j['Special Instructions']]));
    }

    // Big action buttons (only when the action/URL is available).
    // Anything that leaves the app (Maps, PDFs, the customer folder) is a real
    // <a target="_blank"> anchor, not a JS-triggered window.open(). A native
    // anchor click is a single, well-defined browser action — window.open()
    // triggered from a synthetic click can leave a stray blank tab behind on
    // some mobile browsers (that's the extra blank-page bug). A click listener
    // on the anchor still fires for logging; it just doesn't control navigation.
    var actions = el('div', { class: 'actions-grid' });
    actions.appendChild(extActionBtn('🗺 Open in Maps', mapsUrl(mapsQ)));
    actions.appendChild(actionBtn('📋 Start Deinstall Form', function () { startForm(j['Site ID'], 'deinstall'); }));
    actions.appendChild(actionBtn('🔧 Start Reinstall Form', function () { startForm(j['Site ID'], 'reinstall'); }));
    if (safeUrl(j['Customer Drive Folder URL'])) actions.appendChild(extActionBtn('📁 Customer Folder', j['Customer Drive Folder URL'], function () { logView(j, 'Opened customer folder'); }));
    if (safeUrl(j['Proposal PDF URL'])) actions.appendChild(extActionBtn('📄 Proposal PDF', j['Proposal PDF URL'], function () { logView(j, 'Viewed PDF'); }));
    if (safeUrl(j['Deinstall PDF URL'])) actions.appendChild(extActionBtn('📄 Deinstall PDF', j['Deinstall PDF URL'], function () { logView(j, 'Viewed PDF'); }));
    if (safeUrl(j['Reinstall PDF URL'])) actions.appendChild(extActionBtn('📄 Reinstall PDF', j['Reinstall PDF URL'], function () { logView(j, 'Viewed PDF'); }));
    actions.appendChild(actionBtn('🖼 View Job Photos', function () { viewPhotos(j['Site ID']); }));
    actions.appendChild(actionBtn('⚑ Report a Problem', function () { reportProblem(j['Site ID']); }));
    actions.appendChild(actionBtn('✔ Mark Stage Complete', function () { markStage(j['Site ID'], j['Current Job Stage']); }));
    container.appendChild(actions);

    // Filled in by startForm() once a prefilled form link is ready — a real,
    // tappable link (not an auto-opened window), so it can never be blocked
    // by a popup blocker on any browser.
    container.appendChild(el('div', { id: 'formLinkArea', class: 'form-link-area' }));

    // Photos container (filled on demand).
    container.appendChild(el('div', { id: 'jobPhotos' }));

    // Details.
    container.appendChild(detailSection('Schedule', [
      ['Deinstall date', j['Deinstall Date']], ['Reinstall date', j['Reinstall Date']],
      ['Inspection date', j['Inspection Date']], ['Assigned installers', j['Assigned Installers']],
      ['Crew', j['Assigned Crew']]
    ]));
    container.appendChild(detailSection('System & roof', [
      ['Panel count', j['Panel Count']], ['System size (kW)', j['System Size (kW)']],
      ['Module', join_(j['Module Manufacturer'], j['Module Model'])],
      ['Inverter', join_(j['Inverter Manufacturer'], j['Inverter Model'])],
      ['Inverter type', j['Inverter Type']], ['Racking', j['Racking Type']],
      ['Roof type', j['Roof Type']], ['Arrays', j['Number of Arrays']],
      ['Stories', j['Number of Stories']], ['Roofing company', j['Roofing Company']]
    ]));
    container.appendChild(detailSection('Documentation', [
      ['Status', j['Missing Documentation Status']],
      ['Last submission', j['Last Documentation Submission']]
    ]));
    // Financials (only present in payload for management — the backend strips it otherwise).
    if ('Grand Total' in j) {
      container.appendChild(detailSection('Financial', [['Grand total', j['Grand Total']]]));
    }

    // Job lifecycle: change status, archive/restore, permanently delete.
    // Kept visually separate (its own bordered section, buttons color-coded
    // amber/red) from the big action grid above so it's never one mis-tap
    // away from "Open in Maps" — see .lifecycle-section in styles.css.
    if (AUTH.can('createOrEditJob') || AUTH.can('archiveJobs') || AUTH.can('hardDeleteJobs')) {
      var lifecycle = el('div', { class: 'detail-section lifecycle-section' }, [el('h3', {}, 'Job lifecycle')]);
      var controls = el('div', { class: 'lifecycle-controls' });

      if (AUTH.can('createOrEditJob') && statuses.length) {
        var statusSelect = el('select', {}, statuses.map(function (s) {
          var opt = el('option', { value: s }, s);
          if (s === j['Job Status']) opt.setAttribute('selected', 'selected');
          return opt;
        }));
        controls.appendChild(el('label', { class: 'field inline' }, [
          el('span', {}, 'Status'),
          statusSelect,
          el('button', {
            class: 'btn small',
            onclick: function () { changeStatus(j['Site ID'], statusSelect.value); }
          }, 'Update')
        ]));
      }

      if (AUTH.can('archiveJobs')) {
        var isArchived = String(j['Archived']).toLowerCase() === 'yes';
        controls.appendChild(el('button', {
          class: 'btn small warn',
          onclick: function () { toggleArchive(j['Site ID'], !isArchived); }
        }, isArchived ? '♻ Restore job' : '🗄 Archive job'));
      }

      if (AUTH.can('hardDeleteJobs')) {
        controls.appendChild(el('button', {
          class: 'btn small danger',
          onclick: function () { hardDeleteJob(j['Site ID']); }
        }, '🗑 Permanently delete'));
      }

      lifecycle.appendChild(controls);
      container.appendChild(lifecycle);
    }
  }

  /** updateJobStatus from the job page's lifecycle controls. */
  async function changeStatus(siteId, newStatus) {
    try {
      var resp = await API.call('updateJobStatus', { siteId: siteId, status: newStatus });
      toast('Status updated to “' + (resp.data['Job Status'] || newStatus) + '”.', 'success');
      viewJob(siteId);
    } catch (e) { toast(e.message, 'error'); }
  }

  /** Archive (soft-delete) or restore a job. Reversible — confirm, then call. */
  async function toggleArchive(siteId, archive) {
    var msg = archive
      ? 'Archive ' + siteId + '? It disappears from Search, Upcoming, and My Jobs, but nothing is deleted — you can restore it any time.'
      : 'Restore ' + siteId + ' back into normal lists?';
    if (!window.confirm(msg)) return;
    try {
      await API.call('archiveJob', { siteId: siteId, archived: archive });
      toast(archive ? 'Job archived.' : 'Job restored.', 'success');
      viewJob(siteId);
    } catch (e) { toast(e.message, 'error'); }
  }

  /**
   * Permanently delete a job. This is the one truly irreversible action in the
   * app, so on top of the backend's own safety rails (Draft/Cancelled/Archived
   * only, exact Site ID match) the user must type the Site ID here — a plain
   * confirm() dialog is too easy to reflexively click through.
   */
  async function hardDeleteJob(siteId) {
    var typed = window.prompt(
      'This PERMANENTLY deletes job ' + siteId + ' — this cannot be undone.\n' +
      'Only Draft, Cancelled, or Archived jobs can be deleted this way.\n\n' +
      'Type the Site ID exactly (' + siteId + ') to confirm:'
    );
    if (typed === null) return; // cancelled
    if (typed.trim().toUpperCase() !== String(siteId).toUpperCase()) {
      toast('Site ID didn’t match — nothing was deleted.', 'error');
      return;
    }
    try {
      var resp = await API.call('deleteJob', { siteId: siteId, confirmSiteId: typed.trim() });
      toast(resp.message || ('Job ' + siteId + ' permanently deleted.'), 'success');
      location.hash = '#/dashboard';
    } catch (e) { toast(e.message, 'error'); }
  }

  // Popup blockers on mobile Chrome/Safari are unreliable about honoring
  // "allow popups for this site" for windows opened after an await, even
  // when the click handler calls window.open() synchronously first (some
  // mobile browsers block the redirect of that pre-opened blank tab too,
  // leaving a dead about:blank tab behind). Rather than fight browser-
  // specific popup heuristics, we don't auto-open anything. We fetch the
  // prefilled URL, then render a real, visible <a target="_blank"> link in
  // the job page. A direct tap on a real link is never treated as a popup
  // by any browser, so this always works.
  async function startForm(siteId, which) {
    var label = which === 'reinstall' ? 'Reinstall' : 'Deinstall';
    toast('Preparing ' + label.toLowerCase() + ' form…');
    try {
      var resp = await API.call('generatePrefilledFormUrls', { siteId: siteId });
      var url = which === 'reinstall' ? resp.data.reinstallUrl : resp.data.deinstallUrl;
      if (safeUrl(url)) {
        showFormLink(which, label, url);
        API.call('logUserAction', { action: 'Opened form', siteId: siteId });
      } else {
        toast('That form link is not available.', 'error');
      }
    } catch (e) { toast(e.message, 'error'); }
  }

  function showFormLink(which, label, url) {
    var box = document.getElementById('formLinkArea');
    if (!box) return;
    var existing = document.getElementById('formLink-' + which);
    if (existing) existing.remove();
    var link = el('a', {
      id: 'formLink-' + which,
      class: 'form-ready-link',
      href: url,
      target: '_blank',
      rel: 'noopener'
    }, '✅ Tap to open ' + label + ' Form ↗');
    box.appendChild(link);
    toast(label + ' form is ready — tap the link below to open it.', 'success');
    link.scrollIntoView({ behavior: 'smooth', block: 'center' });
  }

  async function viewPhotos(siteId) {
    var box = document.getElementById('jobPhotos');
    clear(box); box.appendChild(loadingBlock('Loading photos…'));
    try {
      var resp = await API.call('getApprovedJobFiles', { siteId: siteId });
      var files = (resp.data && resp.data.files) || [];
      clear(box);
      if (!files.length) { box.appendChild(emptyBlock('No documentation filed for this job yet.')); return; }
      box.appendChild(el('h3', {}, 'Job photos & files (' + files.length + ')'));
      box.appendChild(el('div', { class: 'photo-list' }, files.map(function (f) {
        return el('a', { class: 'photo-item', href: f.url, target: '_blank', rel: 'noopener' }, [
          el('span', { class: 'photo-doc' }, f.documentType || 'File'),
          el('span', { class: 'muted small' }, (f.stage || '') + ' · ' + (f.name || ''))
        ]);
      })));
    } catch (e) { clear(box); box.appendChild(errorBlock(e.message, function () { viewPhotos(siteId); })); }
  }

  async function reportProblem(siteId) {
    var note = window.prompt('Describe the problem or change-order condition:');
    if (note === null || !note.trim()) return;
    try {
      await API.call('reportProblem', { siteId: siteId, note: note.trim() });
      toast('Problem reported. The office will see it on the job.', 'success');
    } catch (e) { toast(e.message, 'error'); }
  }

  async function markStage(siteId, currentStage) {
    if (!window.confirm('Mark the current stage (“' + (currentStage || '') + '”) complete and advance to the next stage?')) return;
    try {
      var resp = await API.call('markStageComplete', { siteId: siteId });
      toast('Stage updated to “' + (resp.data['Current Job Stage'] || '') + '”.', 'success');
      viewJob(siteId);
    } catch (e) { toast(e.message, 'error'); }
  }

  function logView(job, action) {
    API.call('logUserAction', { action: action, siteId: job['Site ID'] }).catch(function () {});
  }

  /* ------------------------------- admin -------------------------------- */

  function viewAdmin() {
    if (!AUTH.can('createOrEditJob')) {
      appEl.appendChild(el('section', { class: 'view' }, [errorBlock('Admin tools are limited to office/admin users.')]));
      return;
    }
    var container = el('section', { class: 'view' }, [loadingBlock('Loading pricing options…')]);
    appEl.appendChild(container);
    API.call('getOptions', {}).then(function (resp) {
      clear(container);
      buildNewJobForm(container, resp.data || {});
    }).catch(function (e) {
      clear(container);
      container.appendChild(errorBlock(e.message, viewAdmin));
    });
  }

  /** Build the New Job form: job info + a live pricing builder + proposal generation. */
  function buildNewJobForm(container, options) {
    var catalog = options.PricingCatalog || [];
    var defaultDeposit = options.DefaultDepositPercent || 50;
    var f = {};       // job-info inputs, keyed by Jobs header name
    var rows = [];     // pricing row state: { include, description, qty, unit, unitPrice, catalog, qtyTouched }

    function field(label, key, opts) {
      opts = opts || {};
      var input = opts.options
        ? el('select', { id: 'f_' + key }, opts.options.map(function (o) { return el('option', {}, o); }))
        : el('input', { id: 'f_' + key, type: opts.type || 'text', placeholder: label });
      f[key] = input;
      return el('label', { class: 'field' }, [el('span', {}, label), input]);
    }

    // ---- Job info fields ----
    var panelCountField = field('Panel count', 'Panel Count', { type: 'number' });
    var panelCountInput = f['Panel Count']; // the actual <input>; panelCountField is its wrapping <label>
    panelCountInput.addEventListener('input', function () { recalcPanelDrivenQty(); });

    var infoFields = [
      field('Job type', 'Job Type', { options: options['Job Types'] || ['Detach & Reinstall'] }),
      field('Homeowner first name', 'Homeowner First Name'),
      field('Homeowner last name', 'Homeowner Last Name'),
      field('Property address', 'Property Address'),
      field('City', 'City'), field('State', 'State'), field('ZIP', 'ZIP'),
      field('Phone', 'Phone', { type: 'tel' }), field('Email', 'Email', { type: 'email' }),
      field('Insurance claim #', 'Insurance Claim #'),
      field('Roofing company', 'Roofing Company'),
      field('Roofer contact', 'Roofer Contact'),
      field('Roofer phone/email', 'Roofer Phone/Email'),
      panelCountField,
      field('System size (kW)', 'System Size (kW)', { type: 'number' }),
      field('Inverter manufacturer', 'Inverter Manufacturer'),
      field('Roof type', 'Roof Type', { options: options['Roof Types'] || ['Comp Shingle'] }),
      field('Stories', 'Number of Stories', { options: ['1', '2', '3+'] }),
      field('Detach date', 'Deinstall Date', { type: 'date' }),
      field('Reinstall date', 'Reinstall Date', { type: 'date' }),
      field('Assigned installers (emails)', 'Assigned Installers'),
      field('Crew', 'Assigned Crew', { options: ['RTC'] })
    ];

    // ---- Pricing builder ----
    var pricingBody = el('div', { class: 'list' });
    var subtotalEl = el('span', { class: 'strong' }, '$0.00');
    var grandTotalEl = el('span', { class: 'strong' }, '$0.00');
    var depositDueEl = el('span', { class: 'strong' }, '$0.00');
    var balanceDueEl = el('span', { class: 'strong' }, '$0.00');
    var discountInput = el('input', { type: 'number', step: '0.01', value: '0', oninput: recalcTotals });
    var taxInput = el('input', { type: 'number', step: '0.01', value: '0', oninput: recalcTotals });
    var depositPctInput = el('input', { type: 'number', step: '1', value: String(defaultDeposit), oninput: recalcTotals });

    catalog.forEach(function (cat) {
      var include = el('input', { type: 'checkbox', onchange: recalcTotals });
      include.checked = !!cat.defaultInclude;
      var desc = el('input', { type: 'text', value: cat.description || '' });
      var qty = el('input', { type: 'number', step: '0.01', oninput: function () { row.qtyTouched = true; recalcTotals(); } });
      var unit = el('input', { type: 'text', value: cat.unit || '', class: 'small' });
      var price = el('input', { type: 'number', step: '0.01', value: String(cat.unitPrice || 0), oninput: recalcTotals });
      var lineTotalEl = el('span', {}, '$0.00');

      var row = { catalog: cat, include: include, desc: desc, qty: qty, unit: unit, price: price, lineTotalEl: lineTotalEl, qtyTouched: false };
      qty.value = cat.qtyMode === 'panelCount' ? (Number(panelCountInput.value) || 0) : (cat.qty || 0);
      rows.push(row);

      pricingBody.appendChild(el('div', { class: 'card' }, [
        el('div', { class: 'form', style: 'gap:6px' }, [
          el('label', { class: 'field', style: 'flex-direction:row; align-items:center; gap:8px' }, [
            include, el('span', { class: 'strong' }, cat.item)
          ]),
          el('label', { class: 'field' }, [el('span', {}, 'Description'), desc]),
          el('div', { class: 'quick-actions' }, [
            el('label', { class: 'field', style: 'flex:1' }, [el('span', {}, 'Qty'), qty]),
            el('label', { class: 'field', style: 'flex:1' }, [el('span', {}, 'Unit'), unit]),
            el('label', { class: 'field', style: 'flex:1' }, [el('span', {}, 'Unit price ($)'), price])
          ]),
          el('div', { class: 'muted small' }, ['Line total: ', lineTotalEl])
        ])
      ]));
    });

    function recalcPanelDrivenQty() {
      rows.forEach(function (row) {
        if (row.catalog.qtyMode === 'panelCount' && !row.qtyTouched) {
          row.qty.value = Number(panelCountInput.value) || 0;
        }
      });
      recalcTotals();
    }

    function money(n) { return '$' + (Number(n) || 0).toFixed(2); }

    function recalcTotals() {
      var subtotal = 0;
      rows.forEach(function (row) {
        var qty = Number(row.qty.value) || 0;
        var price = Number(row.price.value) || 0;
        var lineTotal = row.include.checked ? qty * price : 0;
        row.lineTotalEl.textContent = money(lineTotal);
        subtotal += lineTotal;
      });
      var discount = Number(discountInput.value) || 0;
      var tax = Number(taxInput.value) || 0;
      var grandTotal = subtotal + discount + tax;
      var depositPct = Number(depositPctInput.value) || 0;
      var depositDue = Math.round(grandTotal * (depositPct / 100) * 100) / 100;
      var balanceDue = Math.round((grandTotal - depositDue) * 100) / 100;
      subtotalEl.textContent = money(subtotal);
      grandTotalEl.textContent = money(grandTotal);
      depositDueEl.textContent = money(depositDue);
      balanceDueEl.textContent = money(balanceDue);
    }
    recalcTotals();

    var resultBox = el('div', { id: 'adminResult' });

    container.appendChild(el('div', { class: 'view' }, [
      el('h2', {}, 'New job & proposal'),
      el('p', { class: 'muted small' }, 'Creates the job, assigns the next Site ID, and generates the Proposal PDF — same document you already use, filled in automatically. Every price below is a starting default; change anything as needed.'),
      el('h3', {}, 'Job info'),
      el('div', { class: 'form' }, infoFields),
      el('h3', {}, 'Pricing schedule'),
      el('p', { class: 'muted small' }, 'Check "Include" for every line that applies to this job. Qty for panel-based rows follows Panel Count above until you edit that row’s Qty directly.'),
      pricingBody,
      el('div', { class: 'detail-section' }, [
        el('div', { class: 'detail-row' }, [el('span', { class: 'detail-k' }, 'Subtotal'), subtotalEl]),
        el('label', { class: 'field' }, [el('span', {}, 'Discount (enter negative to reduce total, e.g. -100)'), discountInput]),
        el('label', { class: 'field' }, [el('span', {}, 'Tax / Fees ($)'), taxInput]),
        el('div', { class: 'detail-row' }, [el('span', { class: 'detail-k strong' }, 'Grand total'), grandTotalEl]),
        el('label', { class: 'field' }, [el('span', {}, 'Deposit %'), depositPctInput]),
        el('div', { class: 'detail-row' }, [el('span', { class: 'detail-k' }, 'Deposit due'), depositDueEl]),
        el('div', { class: 'detail-row' }, [el('span', { class: 'detail-k' }, 'Balance due'), balanceDueEl])
      ]),
      el('button', {
        class: 'btn primary', onclick: function () { submitNewJobWithProposal(f, rows, discountInput, taxInput, depositPctInput, resultBox); }
      }, 'Create job & generate proposal'),
      resultBox
    ]));
  }

  async function submitNewJobWithProposal(f, rows, discountInput, taxInput, depositPctInput, resultBox) {
    var payload = {};
    Object.keys(f).forEach(function (k) { payload[k] = f[k].value; });
    if (!payload['Property Address']) { toast('Property address is required.', 'error'); return; }

    clear(resultBox);
    resultBox.appendChild(loadingBlock('Creating job…'));
    try {
      var createResp = await API.call('createJob', { job: payload });
      var sid = createResp.data['Site ID'];

      resultBox.textContent = '';
      resultBox.appendChild(loadingBlock('Generating proposal PDF…'));

      var lineItems = rows.map(function (row) {
        return {
          item: row.catalog.item,
          description: row.desc.value,
          qty: Number(row.qty.value) || 0,
          unit: row.unit.value,
          unitPrice: Number(row.price.value) || 0,
          include: row.include.checked
        };
      });

      var proposalResp = await API.call('generateProposalPdf', {
        siteId: sid,
        jobType: payload['Job Type'],
        insuranceClaim: payload['Insurance Claim #'],
        rooferContact: payload['Roofer Contact'],
        rooferPhone: payload['Roofer Phone/Email'],
        panelCount: payload['Panel Count'],
        systemSizeKw: payload['System Size (kW)'],
        inverterManufacturer: payload['Inverter Manufacturer'],
        roofType: payload['Roof Type'],
        stories: payload['Number of Stories'],
        detachDate: payload['Deinstall Date'],
        reinstallDate: payload['Reinstall Date'],
        lineItems: lineItems,
        discount: Number(discountInput.value) || 0,
        taxFees: Number(taxInput.value) || 0,
        depositPercent: Number(depositPctInput.value) || 0
      });

      toast('Created ' + sid + ' and generated the proposal.', 'success');
      clear(resultBox);
      resultBox.appendChild(el('div', { class: 'notice' }, [
        'Created ', el('strong', {}, sid), ' — Grand total ' +
          '$' + Number(proposalResp.data.grandTotal).toFixed(2) + '. ',
        el('div', { class: 'quick-actions' }, [
          linkBtn('Open job', '#/job/' + encodeURIComponent(sid), 'small'),
          extLinkBtn('Proposal PDF', proposalResp.data.pdfUrl, 'small'),
          extLinkBtn('Calculator sheet', proposalResp.data.calculatorUrl, 'small')
        ])
      ]));
    } catch (e) {
      clear(resultBox);
      resultBox.appendChild(errorBlock(e.message));
      toast(e.message, 'error');
    }
  }

  /* ---------------------------- shared pieces --------------------------- */

  function searchBar() {
    var input = el('input', { type: 'search', placeholder: 'Quick search…', 'aria-label': 'Quick search',
      onkeydown: function (ev) { if (ev.key === 'Enter' && input.value.trim()) location.hash = '#/search'; } });
    return el('div', { class: 'searchbox' }, [
      input, el('button', { class: 'btn', onclick: function () { location.hash = '#/search'; } }, 'Search')
    ]);
  }

  function jobList(rows, emptyMsg) {
    if (!rows || !rows.length) return emptyBlock(emptyMsg);
    return el('div', { class: 'list' }, rows.map(function (j) {
      var name = ((j['Homeowner First Name'] || '') + ' ' + (j['Homeowner Last Name'] || '')).trim();
      var mapsQ = [j['Property Address'], j['City'], j['State'], j['ZIP']].filter(Boolean).join(', ');
      var next = j['Deinstall Date'] || j['Reinstall Date'] || j['Inspection Date'] || '';
      return el('div', { class: 'card jobrow' }, [
        el('div', { class: 'jobrow-main' }, [
          el('div', { class: 'siteid' }, j['Site ID']),
          el('div', { class: 'strong' }, name || '—'),
          el('div', { class: 'muted small' }, j['Property Address'] || ''),
          el('div', { class: 'badges' }, [badge(j['Job Status']), badge(j['Current Job Stage'], 'stage'),
            next ? badge(next, 'date') : null])
        ]),
        el('div', { class: 'jobrow-actions' }, [
          linkBtn('Open', '#/job/' + encodeURIComponent(j['Site ID']), 'primary small'),
          extLinkBtn('Maps', mapsUrl(mapsQ), 'small')
        ])
      ]);
    }));
  }

  function detailSection(title, rows) {
    var body = rows.filter(function (r) { return r[1] !== '' && r[1] !== null && r[1] !== undefined; })
      .map(function (r) {
        return el('div', { class: 'detail-row' }, [
          el('span', { class: 'detail-k' }, r[0]), el('span', { class: 'detail-v' }, String(r[1]))
        ]);
      });
    if (!body.length) return document.createComment('');
    return el('div', { class: 'detail-section' }, [el('h3', {}, title), el('div', {}, body)]);
  }

  function badge(text, kind) { return text ? el('span', { class: 'badge ' + (kind || '') }, String(text)) : null; }
  function actionBtn(label, onClick) { return el('button', { class: 'action-btn', onclick: onClick }, label); }
  function linkBtn(label, href, cls) { return el('a', { class: 'btn ' + (cls || ''), href: href }, label); }
  function extLinkBtn(label, href, cls) { return el('a', { class: 'btn ' + (cls || ''), href: href, target: '_blank', rel: 'noopener' }, label); }
  // Big action-grid button that opens an external URL (Maps, PDFs, Drive
  // folders). A real anchor, styled like actionBtn — not a JS window.open()
  // call — so the browser's native single-tab link behavior is what runs.
  // onClick (optional) fires alongside the navigation, purely for logging.
  function extActionBtn(label, href, onClick) {
    return el('a', { class: 'action-btn', href: href, target: '_blank', rel: 'noopener', onclick: onClick }, label);
  }

  function join_(a, b) { return [a, b].filter(Boolean).join(' '); }
  function asArray(data) { return Array.isArray(data) ? data : (data && data.results) || []; }
  function isField() { var u = AUTH.getUser(); return u && (u.role === 'Installer' || u.role === 'Lead Installer'); }
  function firstName(u) { return u ? String(u.name || u.email).split(/[ @]/)[0] : ''; }

  /** Generic "load into an element with states" helper. */
  async function loadInto(elId, fetcher, renderer) {
    var box = document.getElementById(elId);
    if (!box) return;
    try {
      var resp = await fetcher();
      clear(box);
      box.appendChild(renderer(resp.data));
    } catch (e) {
      clear(box);
      box.appendChild(errorBlock(e.message, function () { loadInto(elId, fetcher, renderer); }));
    }
  }

  /* ------------------------------- boot --------------------------------- */

  async function afterSignIn() {
    try {
      var resp = await API.call('getCurrentUser', {});
      AUTH.setUser(resp.data);
      location.hash = '#/dashboard';
      route();
    } catch (e) {
      // token rejected (not approved, wrong domain, etc.)
      flashLoginMessage(e.message);
      location.hash = '#/login';
      route();
    }
  }

  function boot() {
    appEl = document.getElementById('app');
    toastEl = document.getElementById('toast');
    initChrome();
    AUTH.init(afterSignIn);
    window.addEventListener('hashchange', route);
    // Configuration sanity check.
    if (!window.CRM_CONFIG || String(window.CRM_CONFIG.GOOGLE_CLIENT_ID).indexOf('PASTE_') === 0) {
      appEl.appendChild(errorBlock('This site isn’t configured yet. Add your API URL and Client ID in js/config.js.'));
      return;
    }
    route();
  }

  document.addEventListener('DOMContentLoaded', boot);

  return { flashLoginMessage: flashLoginMessage, toast: toast };
})();
