/** Application shell: boot, navigation, global search, theme and routing. */

import { icon } from './icons.js';
import { esc, initials, encodeKey, formatDate, formatInteger, pluralize } from './format.js';
import {
  loadCatalog,
  getMe,
  getStats,
  getAuthToken,
  setAuth,
  setAuthToken,
  clearAuth,
  resetData,
  clearLookupCache,
  search as searchApi
} from './api.js';
import {
  buildListPath,
  buildObjectPath,
  startRouter,
  rerenderRoute
} from './router.js';
import {
  openModal,
  confirmDialog,
  toast,
  qs,
  qsa,
  debounce,
  errorStateHtml,
  loadingBlock,
  setButtonLoading
} from './ui.js';
import { renderLaunchpad } from './pages/launchpad.js';
import { renderList } from './pages/list.js';
import { renderObject } from './pages/object.js';
import { renderExplorer } from './pages/explorer.js';
import { renderSystem } from './pages/system.js';

const THEME_KEY = 's4sandbox.theme';
const DEMO_PASSWORDS = { DEVELOPER: 'Password1', DEMO: 'Demo1234', AUDITOR: 'Audit1234' };

const state = {
  catalog: null,
  index: null,
  me: null,
  stats: null,
  theme: 'light'
};

const ctx = {
  get catalog() { return state.catalog; },
  get index() { return state.index; },
  get me() { return state.me; },
  get stats() { return state.stats; },
  set stats(value) { state.stats = value; },
  openSignIn,
  openReset
};

/* -------------------------------------------------------------------------- */
/* Theme                                                                      */
/* -------------------------------------------------------------------------- */

function preferredTheme() {
  try {
    const stored = window.localStorage.getItem(THEME_KEY);
    if (stored === 'light' || stored === 'dark') return stored;
  } catch (_) {
    /* ignore storage errors */
  }
  return window.matchMedia && window.matchMedia('(prefers-color-scheme: dark)').matches ? 'dark' : 'light';
}

function applyTheme(theme) {
  state.theme = theme === 'dark' ? 'dark' : 'light';
  document.documentElement.dataset.theme = state.theme;
  try {
    window.localStorage.setItem(THEME_KEY, state.theme);
  } catch (_) {
    /* ignore */
  }
  const button = qs('[data-theme-toggle]');
  if (button) {
    button.innerHTML = icon(state.theme === 'dark' ? 'sun' : 'moon', 18);
    button.title = state.theme === 'dark' ? 'Switch to light theme' : 'Switch to dark theme';
    button.setAttribute('aria-label', button.title);
  }
}

/* -------------------------------------------------------------------------- */
/* Layout                                                                     */
/* -------------------------------------------------------------------------- */

function buildLayout() {
  const main = qs('#main');
  main.classList.remove('main');
  main.innerHTML = `
    <div class="layout">
      <aside id="sidebar" class="sidebar" aria-label="Main navigation"></aside>
      <button id="sidebar-backdrop" class="sidebar-backdrop" type="button" aria-label="Close navigation"></button>
      <div class="main">
        <div id="app" class="app"></div>
      </div>
    </div>`;
  qs('#sidebar-backdrop')?.addEventListener('click', closeSidebar);
  bindGlobalEvents();
}

function renderShellPlaceholder() {
  qs('#shell').innerHTML = `
    <a class="brand" href="#/">
      <span class="brand__mark">S4</span>
      <span class="brand__text"><strong>S/4HANA Sandbox</strong><span>Mock system · client 100</span></span>
    </a>
    <div class="shell__spacer"></div>
    <span class="loading" style="padding:0"><span class="spinner spinner--sm"></span> Starting…</span>`;
}

function roleLabel(me) {
  if (!me) return 'Loading';
  if (me.capabilities && !me.capabilities.write) return 'Read-only';
  if (me.anonymous) return 'Anonymous · write';
  if ((me.roles || []).includes('SAP_ALL')) return 'Full access';
  return (me.roles || []).join(', ') || 'Sandbox user';
}

function renderShell() {
  const shell = qs('#shell');
  const me = state.me || { id: '—', name: 'Loading…', roles: [], capabilities: {} };
  const authenticated = Boolean(getAuthToken());
  const name = me.anonymous ? 'Anonymous' : me.name || me.id;
  const menu = `
    <div class="menu" data-user-menu role="menu" hidden>
      <div class="menu__header">
        <strong>${esc(name)}</strong>
        <span>${esc(me.id)} · ${esc(me.anonymous ? 'anonymous sandbox session' : (me.roles || []).join(', '))}</span>
      </div>
      <button class="menu__item" type="button" data-signin role="menuitem">${icon('user', 16)} Sign in / switch user</button>
      <a class="menu__item" href="#/system" role="menuitem">${icon('gauge', 16)} System information</a>
      ${me.capabilities?.reset ? `<button class="menu__item" type="button" data-reset role="menuitem">${icon('reset', 16)} Reset demo data</button>` : ''}
      ${authenticated ? `<div class="menu__sep"></div><button class="menu__item menu__item--danger" type="button" data-signout role="menuitem">${icon('logout', 16)} Sign out</button>` : ''}
      <div class="menu__note">
        ${me.anonymous
          ? 'Writes use anonymous access while it is enabled on the server. Sign in with DEVELOPER for full access.'
          : `Signed in with Basic authentication. Demo password: <code>${esc(DEMO_PASSWORDS[me.id] || '••••••')}</code>`}
      </div>
    </div>`;

  shell.innerHTML = `
    <button class="icon-btn shell__menu" type="button" data-menu aria-label="Open navigation" aria-expanded="false">${icon('menu', 20)}</button>
    <a class="brand" href="#/">
      <span class="brand__mark">S4</span>
      <span class="brand__text"><strong>S/4HANA Sandbox</strong><span>Mock system · client 100</span></span>
    </a>
    <div class="global-search">
      <div class="global-search__field">
        ${icon('search', 16)}
        <input id="global-search-input" type="search" autocomplete="off" spellcheck="false"
               placeholder="Search business partners, products, orders…" aria-label="Global search"
               aria-expanded="false" aria-controls="search-panel">
        <kbd>Ctrl K</kbd>
      </div>
      <div class="search-panel" id="search-panel" role="listbox" aria-label="Search results" hidden></div>
    </div>
    <div class="shell__spacer"></div>
    <div class="shell__actions">
      <button class="icon-btn" type="button" data-theme-toggle title="Toggle colour theme" aria-label="Toggle colour theme">${icon(state.theme === 'dark' ? 'sun' : 'moon', 18)}</button>
      <div class="user-menu">
        <button class="user-chip" type="button" data-user-toggle aria-haspopup="menu" aria-expanded="false" aria-label="Open user menu">
          <span class="avatar">${esc(initials(name))}</span>
          <span class="user-chip__text"><strong>${esc(me.anonymous ? 'Anonymous' : me.id)}</strong><span>${esc(roleLabel(me))}</span></span>
          ${icon('chevron-down', 14)}
        </button>
        ${menu}
      </div>
    </div>`;

  applyTheme(state.theme);
  setupSearch();
  setupShellActions(authenticated);
}

function setupShellActions(authenticated) {
  const toggle = qs('[data-user-toggle]');
  const menu = qs('[data-user-menu]');
  toggle?.addEventListener('click', (event) => {
    event.stopPropagation();
    const willOpen = menu.hidden;
    menu.hidden = !willOpen;
    toggle.setAttribute('aria-expanded', String(willOpen));
  });

  qs('[data-theme-toggle]')?.addEventListener('click', () => {
    applyTheme(state.theme === 'dark' ? 'light' : 'dark');
  });

  qs('[data-menu]')?.addEventListener('click', () => toggleSidebar());

  qs('[data-signin]')?.addEventListener('click', () => {
    closeUserMenu();
    openSignIn(state.me?.anonymous ? '' : state.me?.id);
  });

  qs('[data-reset]')?.addEventListener('click', () => {
    closeUserMenu();
    openReset();
  });

  qs('[data-signout]')?.addEventListener('click', async () => {
    closeUserMenu();
    clearAuth();
    try {
      state.me = normalizeMe(await getMe());
      renderShell();
      renderFooter();
      toast({ type: 'info', title: 'Signed out', message: 'You are now using the anonymous sandbox session.' });
      rerenderRoute();
    } catch (error) {
      toast({ type: 'error', title: 'Sign out failed', message: error.message });
    }
  });

  const sidebar = qs('#sidebar');
  if (sidebar?.classList.contains('is-open')) {
    qs('[data-menu]')?.setAttribute('aria-expanded', 'true');
  }
  void authenticated;
}

/* -------------------------------------------------------------------------- */
/* Sidebar                                                                    */
/* -------------------------------------------------------------------------- */

function renderSidebar() {
  const sidebar = qs('#sidebar');
  if (!sidebar || !state.index) return;
  const groups = new Map();
  for (const service of state.index.services) {
    for (const entity of service.entities) {
      const group = service.group || 'Other';
      if (!groups.has(group)) groups.set(group, []);
      groups.get(group).push({ ...entity, serviceId: service.id, group, serviceLabel: service.label, serviceIcon: service.icon });
    }
  }

  const groupHtml = Array.from(groups.entries())
    .map(([group, entities]) => `
      <div class="side-section">
        <div class="side-section__label">${esc(group)}</div>
        ${entities
          .map(
            (entity) => `
              <a class="side-link" data-nav="${esc(entity.serviceId)}/${esc(entity.name)}"
                 href="#${esc(buildListPath(entity.serviceId, entity.name))}">
                ${icon(entity.ui?.icon || entity.serviceIcon || 'list', 16)}
                <span>${esc(entity.label)}</span>
              </a>`
          )
          .join('')}
      </div>`)
    .join('');

  sidebar.innerHTML = `
    <div class="side-section">
      <div class="side-section__label">Overview</div>
      <a class="side-link" data-nav="home" href="#/">${icon('home', 16)}<span>Launchpad</span></a>
      <a class="side-link" data-nav="explorer" href="#/explorer">${icon('terminal', 16)}<span>API Explorer</span></a>
      <a class="side-link" data-nav="system" href="#/system">${icon('gauge', 16)}<span>System</span></a>
    </div>
    ${groupHtml}
    <div class="side-section">
      <div class="side-section__label">Session</div>
      <div class="side-link" style="cursor:default">
        ${icon('shield', 16)}
        <span>${state.me?.capabilities?.write ? 'Write enabled' : 'Read-only'}</span>
        <span class="badge badge--outline" style="margin-left:auto;font-size:9.5px">${esc(state.me?.anonymous ? 'ANON' : state.me?.id || '—')}</span>
      </div>
    </div>`;
  updateActiveNav(state.lastRoute);
}

function updateActiveNav(route) {
  if (!route) return;
  let key = 'home';
  if (route.name === 'list' || route.name === 'object') key = `${route.service}/${route.entity}`;
  else if (route.name === 'explorer') key = 'explorer';
  else if (route.name === 'system') key = 'system';
  qsa('.side-link', qs('#sidebar')).forEach((link) => {
    link.classList.toggle('is-active', link.dataset.nav === key);
    if (link.dataset.nav === key) link.setAttribute('aria-current', 'page');
    else link.removeAttribute('aria-current');
  });
}

function toggleSidebar(force) {
  const sidebar = qs('#sidebar');
  const backdrop = qs('#sidebar-backdrop');
  if (!sidebar) return;
  const open = force !== undefined ? force : !sidebar.classList.contains('is-open');
  sidebar.classList.toggle('is-open', open);
  backdrop?.classList.toggle('is-open', open);
  qs('[data-menu]')?.setAttribute('aria-expanded', String(open));
}

function closeSidebar() {
  toggleSidebar(false);
}

/* -------------------------------------------------------------------------- */
/* Footer                                                                     */
/* -------------------------------------------------------------------------- */

function renderFooter() {
  const footer = qs('#footer');
  if (!footer) return;
  const total = state.stats?.counts?.total;
  const seeded = state.stats?.seededAt ? formatDate(state.stats.seededAt) : '—';
  footer.innerHTML = `
    <div class="footer__inner">
      <span><span class="brand__mark" style="width:18px;height:18px;border-radius:5px;font-size:6px">S4</span> S/4HANA Sandbox</span>
      <span class="footer__dot"></span>
      <span>Mock data · not affiliated with SAP</span>
      ${total !== undefined ? `<span class="footer__dot"></span><span>${formatInteger(total)} ${esc(pluralize(total, 'record'))} · seeded ${esc(seeded)}</span>` : ''}
      <span style="margin-left:auto">
        <a href="#/system">System</a> · <a href="#/explorer">API Explorer</a> · <a href="#/explorer">OData V2</a>
      </span>
    </div>`;
}

/* -------------------------------------------------------------------------- */
/* Global search                                                              */
/* -------------------------------------------------------------------------- */

let searchSequence = 0;

function hideSearchPanel() {
  const panel = qs('#search-panel');
  const input = qs('#global-search-input');
  if (panel) panel.hidden = true;
  input?.setAttribute('aria-expanded', 'false');
}

function searchHref(group, record) {
  const def = state.index?.entities[`${group.service}/${group.entity}`];
  if (!def) return null;
  const values = def.key.map((name) => record.key?.[name] ?? '');
  if (values.some((value) => value === '')) return null;
  return `#${buildObjectPath(group.service, group.entity, encodeKey(values))}`;
}

function renderSearchResults(data) {
  const panel = qs('#search-panel');
  if (!panel) return;
  if (!data || !data.groups || !data.groups.length) {
    panel.innerHTML = `<div class="search-panel__empty">No matches for “${esc(data?.query || '')}”. Try an ID, name, city or product.</div>`;
    return;
  }
  panel.innerHTML = data.groups
    .map(
      (group) => `
        <div class="search-group">
          <div class="search-group__label">${icon(group.icon || 'search', 13)} ${esc(group.label)}</div>
          ${group.records
            .map((record) => {
              const href = searchHref(group, record);
              if (!href) return '';
              return `
                <button class="search-result" type="button" role="option" data-href="${esc(href)}">
                  <span class="search-result__icon">${icon(group.icon || 'list', 16)}</span>
                  <span class="search-result__body">
                    <span class="search-result__title">${esc(record.title)}</span>
                    <span class="search-result__subtitle">${esc(record.subtitle)}</span>
                  </span>
                  <span class="search-result__key">${esc(Object.values(record.key || {}).join(' / '))}</span>
                </button>`;
            })
            .join('')}
        </div>`
    )
    .join('');
}

function setupSearch() {
  const input = qs('#global-search-input');
  const panel = qs('#search-panel');
  if (!input || !panel) return;

  const run = debounce(async () => {
    const term = input.value.trim();
    if (!term) {
      searchSequence += 1;
      panel.hidden = true;
      input.setAttribute('aria-expanded', 'false');
      return;
    }
    const seq = ++searchSequence;
    panel.hidden = false;
    input.setAttribute('aria-expanded', 'true');
    panel.innerHTML = `<div class="search-panel__hint"><span class="spinner spinner--sm" style="display:inline-block;vertical-align:-2px;margin-right:6px"></span> Searching…</div>`;
    try {
      const data = await searchApi(term, 5);
      if (seq !== searchSequence) return;
      renderSearchResults(data);
    } catch (error) {
      if (seq !== searchSequence) return;
      panel.innerHTML = `<div class="search-panel__empty">${esc(error.message)}</div>`;
    }
  }, 260);

  input.addEventListener('input', run);
  input.addEventListener('focus', () => {
    if (input.value.trim()) run();
  });
  input.addEventListener('keydown', (event) => {
    if (event.key === 'Escape') {
      hideSearchPanel();
      input.blur();
      return;
    }
    if (event.key === 'Enter') {
      event.preventDefault();
      const first = panel.querySelector('.search-result');
      if (first) {
        window.location.hash = first.dataset.href;
        input.value = '';
        hideSearchPanel();
      }
      return;
    }
    if (event.key === 'ArrowDown') {
      const results = qsa('.search-result', panel);
      if (results.length) {
        event.preventDefault();
        results[0].focus();
      }
    }
  });

  panel.addEventListener('keydown', (event) => {
    if (event.key === 'Escape') {
      hideSearchPanel();
      input.focus();
      return;
    }
    if (event.key === 'ArrowDown' || event.key === 'ArrowUp') {
      const results = qsa('.search-result', panel);
      if (!results.length) return;
      event.preventDefault();
      const index = results.indexOf(document.activeElement);
      const next = event.key === 'ArrowDown'
        ? Math.min(results.length - 1, index + 1)
        : Math.max(0, index - 1);
      results[next].focus();
    }
  });

  panel.addEventListener('click', (event) => {
    const result = event.target.closest('.search-result');
    if (!result) return;
    window.location.hash = result.dataset.href;
    input.value = '';
    hideSearchPanel();
    input.blur();
  });

  if (input.value.trim()) run();
}

/* -------------------------------------------------------------------------- */
/* Chrome close helpers                                                       */
/* -------------------------------------------------------------------------- */

function closeUserMenu() {
  const menu = qs('[data-user-menu]');
  const toggle = qs('[data-user-toggle]');
  if (menu) menu.hidden = true;
  toggle?.setAttribute('aria-expanded', 'false');
}

let globalEventsBound = false;
function bindGlobalEvents() {
  if (globalEventsBound) return;
  globalEventsBound = true;
  document.addEventListener('click', (event) => {
    if (!event.target.closest('.user-menu')) closeUserMenu();
    if (!event.target.closest('.global-search')) hideSearchPanel();
  });
  document.addEventListener('keydown', (event) => {
    if ((event.ctrlKey || event.metaKey) && String(event.key).toLowerCase() === 'k') {
      event.preventDefault();
      qs('#global-search-input')?.focus();
      return;
    }
    if (event.key === 'Escape') {
      closeUserMenu();
      hideSearchPanel();
      closeSidebar();
    }
  });
  window.addEventListener('hashchange', closeSidebar);
}

/* -------------------------------------------------------------------------- */
/* Sign-in dialog                                                             */
/* -------------------------------------------------------------------------- */

function signInError(message) {
  return `
    <div class="form-error" role="alert">
      ${icon('alert', 17)}
      <div>${esc(message)}</div>
    </div>`;
}

function openSignIn(preset) {
  const modal = openModal({
    title: 'Sign in to the sandbox',
    subtitle: 'Basic authentication · credentials stay in this browser',
    small: true,
    body: `
      <div data-auth-error></div>
      <form data-signin-form novalidate>
        <div class="form-grid" style="grid-template-columns:minmax(0,1fr)">
          <div class="form-field">
            <label class="form-field__label" for="signin-user">User</label>
            <input class="input" id="signin-user" name="username" autocomplete="username" spellcheck="false" value="${esc(preset || '')}">
          </div>
          <div class="form-field">
            <label class="form-field__label" for="signin-password">Password</label>
            <input class="input" id="signin-password" name="password" type="password" autocomplete="current-password" value="${esc(DEMO_PASSWORDS[preset] || '')}">
          </div>
        </div>
        <div class="chips" style="margin-top:14px">
          ${Object.keys(DEMO_PASSWORDS)
            .map((user) => `<button class="chip" type="button" data-preset="${esc(user)}" style="height:28px">${esc(user)}</button>`)
            .join('')}
        </div>
        <div class="explorer-hint" style="margin-top:12px">
          DEVELOPER has full access. DEMO and AUDITOR are read-only. Anonymous access remains available if enabled on the server.
        </div>
      </form>`,
    footer: `
      <button class="btn btn--ghost" type="button" data-anonymous>Continue anonymously</button>
      <span class="spacer"></span>
      <button class="btn" type="button" data-modal-close>Cancel</button>
      <button class="btn btn--primary" type="button" data-signin-submit>${icon('user', 15)} Sign in</button>`,
    onMount({ dialog, close }) {
      const userInput = qs('#signin-user', dialog);
      const passwordInput = qs('#signin-password', dialog);
      const errorSlot = qs('[data-auth-error]', dialog);
      const submitButton = qs('[data-signin-submit]', dialog);

      qsa('[data-preset]', dialog).forEach((button) => {
        button.addEventListener('click', () => {
          const user = button.dataset.preset;
          userInput.value = user;
          passwordInput.value = DEMO_PASSWORDS[user] || '';
          userInput.focus();
        });
      });

      const finish = (me, message) => {
        state.me = normalizeMe(me);
        renderShell();
        renderFooter();
        close();
        toast({ type: 'success', title: 'Signed in', message });
        rerenderRoute();
      };

      const submit = async () => {
        const user = userInput.value.trim();
        const password = passwordInput.value;
        errorSlot.innerHTML = '';
        if (!user || !password) {
          errorSlot.innerHTML = signInError('Enter both a user name and a password.');
          return;
        }
        const previous = getAuthToken();
        setButtonLoading(submitButton, true, 'Signing in…');
        setAuth(user, password);
        try {
          const me = await getMe();
          finish(me, `Welcome, ${me.user.name}.`);
        } catch (error) {
          setAuthToken(previous);
          setButtonLoading(submitButton, false);
          errorSlot.innerHTML = signInError(
            error.status === 401 ? 'Invalid user name or password.' : error.message
          );
        }
      };

      qs('[data-signin-submit]', dialog).addEventListener('click', submit);
      qs('[data-signin-form]', dialog).addEventListener('submit', (event) => {
        event.preventDefault();
        submit();
      });

      qs('[data-anonymous]', dialog).addEventListener('click', async () => {
        const previous = getAuthToken();
        errorSlot.innerHTML = '';
        clearAuth();
        setButtonLoading(submitButton, true, 'Switching…');
        try {
          const me = await getMe();
          finish(me, 'Using the anonymous sandbox session.');
        } catch (error) {
          setAuthToken(previous);
          setButtonLoading(submitButton, false);
          errorSlot.innerHTML = signInError(error.message);
        }
      });
    }
  });
  return modal;
}

/* -------------------------------------------------------------------------- */
/* Reset demo data                                                            */
/* -------------------------------------------------------------------------- */

async function openReset() {
  const confirmed = await confirmDialog({
    title: 'Reset demo data?',
    message: 'All created or changed records will be replaced by the deterministic seeded dataset.<br><br><strong>This cannot be undone.</strong>',
    confirmLabel: 'Reset data',
    danger: true
  });
  if (!confirmed) return;
  try {
    const result = await resetData();
    clearLookupCache();
    state.stats = null;
    toast({
      type: 'success',
      title: 'Demo data reset',
      message: `${formatInteger(Object.values(result.counts || {}).reduce((total, value) => total + Number(value || 0), 0))} records restored.`
    });
    rerenderRoute();
  } catch (error) {
    toast({ type: 'error', title: 'Reset failed', message: error.message, duration: 7000 });
  }
}

/* -------------------------------------------------------------------------- */
/* Router                                                                     */
/* -------------------------------------------------------------------------- */

function entityFor(route) {
  if (!state.index) return null;
  return state.index.entities[`${route.service}/${route.entity}`] || null;
}

function pageTitle(route) {
  if (route.name === 'launchpad') return 'Launchpad';
  if (route.name === 'explorer') return 'API Explorer';
  if (route.name === 'system') return 'System Information';
  const entity = entityFor(route);
  if (entity) return route.name === 'object' ? (entity.singular || entity.label) : (entity.ui?.listTitle || entity.label);
  return 'S/4HANA Sandbox';
}

function notFoundMarkup(route) {
  return `
    <div class="empty" style="padding-top:80px">
      <div class="empty__icon">${icon('search', 26)}</div>
      <div class="empty__title">Page not found</div>
      <div class="empty__text">The route <span class="mono">#${esc(route.path || '/')}</span> does not exist in this sandbox.</div>
      <div class="chips" style="margin-top:8px">
        <a class="btn btn--primary" href="#/">${icon('home', 15)} Launchpad</a>
        <a class="btn" href="#/explorer">${icon('terminal', 15)} API Explorer</a>
      </div>
    </div>`;
}

async function handleRoute(route) {
  state.lastRoute = route;
  updateActiveNav(route);
  closeSidebar();
  closeUserMenu();
  hideSearchPanel();
  if (route.name !== 'launchpad') window.scrollTo({ top: 0, behavior: 'auto' });

  document.title = `${pageTitle(route)} · S/4HANA Sandbox`;

  const app = qs('#app');
  if (!app) return;
  const pageRoot = document.createElement('div');
  pageRoot.className = 'page';
  app.replaceChildren(pageRoot);
  pageRoot.innerHTML = loadingBlock();

  try {
    switch (route.name) {
      case 'launchpad':
        await renderLaunchpad(pageRoot, ctx);
        break;
      case 'list':
        await renderList(pageRoot, ctx, route);
        break;
      case 'object':
        await renderObject(pageRoot, ctx, route);
        break;
      case 'explorer':
        await renderExplorer(pageRoot, ctx, route);
        break;
      case 'system':
        await renderSystem(pageRoot, ctx);
        break;
      default:
        pageRoot.innerHTML = notFoundMarkup(route);
    }
  } catch (error) {
    pageRoot.innerHTML = errorStateHtml(error.message, { title: 'This page could not be loaded' });
    qs('[data-retry]', pageRoot)?.addEventListener('click', () => rerenderRoute());
  }
}

/* -------------------------------------------------------------------------- */
/* Boot                                                                       */
/* -------------------------------------------------------------------------- */

function normalizeMe(response) {
  if (!response) return null;
  if (response.user) return { ...response.user, capabilities: response.capabilities || {} };
  return response;
}

async function loadMe() {
  try {
    return normalizeMe(await getMe());
  } catch (error) {
    if (error.status === 401) {
      clearAuth();
      return normalizeMe(await getMe());
    }
    throw error;
  }
}

async function boot() {
  state.theme = preferredTheme();
  applyTheme(state.theme);
  buildLayout();
  renderShellPlaceholder();
  renderFooter();

  try {
    const [catalogBundle, me, stats] = await Promise.all([
      loadCatalog(),
      loadMe(),
      getStats().catch(() => null)
    ]);
    state.catalog = catalogBundle.catalog;
    state.index = catalogBundle.index;
    state.me = me;
    state.stats = stats;
    renderShell();
    renderSidebar();
    renderFooter();
    startRouter(handleRoute);
  } catch (error) {
    const app = qs('#app');
    app.innerHTML = `
      <div class="error-box" style="padding-top:80px">
        <div class="error-box__icon">${icon('alert', 26)}</div>
        <div class="error-box__title">The sandbox could not start</div>
        <div class="error-box__text">${esc(error.message)}</div>
        <div class="chips" style="margin-top:8px">
          <button class="btn btn--primary" type="button" onclick="window.location.reload()">${icon('refresh', 15)} Reload</button>
        </div>
      </div>`;
    const shell = qs('#shell');
    if (shell) {
      shell.innerHTML = `
        <a class="brand" href="#/"><span class="brand__mark">S4</span><span class="brand__text"><strong>S/4HANA Sandbox</strong><span>offline</span></span></a>
        <div class="shell__spacer"></div>
        <span class="badge badge--negative">Server unavailable</span>`;
    }
  }
}

boot();
