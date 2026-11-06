/** System information, health, data status and demo reset. */

import { icon } from '../icons.js';
import { esc, formatDate, formatDuration, formatInteger, pluralize } from '../format.js';
import { entityHref } from '../components.js';
import { getHealth, getStats, resetData, clearLookupCache, ODATA_ROOT } from '../api.js';
import { confirmDialog, errorStateHtml, loadingBlock, qs, qsa, toast, copyText } from '../ui.js';
import { rerenderRoute } from '../router.js';

const ENDPOINTS = [
  { method: 'GET', path: '/api/health', label: 'Health check', icon: 'activity' },
  { method: 'GET', path: '/api/catalog', label: 'UI catalog & metadata', icon: 'layers' },
  { method: 'GET', path: '/api/stats', label: 'Aggregated KPIs', icon: 'gauge' },
  { method: 'GET', path: '/api/search?q=orion', label: 'Global search', icon: 'search' },
  { method: 'GET', path: '/sap/opu/odata/sap', label: 'OData service catalog', icon: 'database' }
];

const DEMO_USERS = [
  { id: 'DEVELOPER', password: 'Password1', role: 'Full access', tone: 'positive' },
  { id: 'DEMO', password: 'Demo1234', role: 'Read-only', tone: 'info' },
  { id: 'AUDITOR', password: 'Audit1234', role: 'Read-only', tone: 'neutral' }
];

export async function renderSystem(root, ctx) {
  root.innerHTML = loadingBlock('Reading system informationâ€¦');
  let health;
  let stats;
  try {
    [health, stats] = await Promise.all([getHealth(), getStats()]);
    ctx.stats = stats;
  } catch (error) {
    root.innerHTML = errorStateHtml(error.message, { title: 'Could not read system information' });
    qs('[data-retry]', root)?.addEventListener('click', () => renderSystem(root, ctx));
    return;
  }

  const counts = stats.counts?.byEntity || {};
  const entities = Object.values(ctx.index.entities);
  const serviceRows = ctx.index.services
    .map((service) => {
      const entityCount = service.entities.length;
      return `
        <tr>
          <td class="cell-strong">${esc(service.label)}</td>
          <td class="cell-mono">${esc(service.id)}</td>
          <td class="num">${formatInteger(entityCount)}</td>
          <td><a class="mono" href="${ODATA_ROOT}/${esc(service.id)}/$metadata" target="_blank" rel="noopener">$metadata</a></td>
        </tr>`;
    })
    .join('');

  const countRows = entities
    .map(
      (entity) => `
        <tr>
          <td><a href="${entityHref(entity.serviceId, entity.name)}">${esc(entity.label)}</a></td>
          <td class="cell-mono">${esc(entity.serviceId)}</td>
          <td class="cell-mono">${esc(entity.name)}</td>
          <td class="num">${formatInteger(counts[entity.name] || 0)}</td>
        </tr>`
    )
    .join('');

  root.innerHTML = `
    <div class="breadcrumbs">
      <a href="#/">${icon('home', 12)} Home</a>${icon('chevron-right', 12)}<span>System</span>
    </div>
    <div class="page-head">
      <div>
        <h1 class="page-head__title">System Information</h1>
        <div class="page-head__subtitle">Runtime, service catalog and demo data controls.</div>
      </div>
      <div class="page-head__actions">
        <button class="btn btn--ghost" type="button" data-refresh>${icon('refresh', 15)} Refresh</button>
        <a class="btn" href="#/explorer">${icon('terminal', 15)} API Explorer</a>
      </div>
    </div>

    <div class="kpi-grid" style="margin-top:0">
      <div class="kpi" style="cursor:default">
        <span class="kpi__icon" style="background:var(--positive-soft);color:var(--positive)">${icon('check-circle', 20)}</span>
        <span class="kpi__body">
          <span class="kpi__value" style="font-size:19px">${esc(health.status || 'ok')}</span>
          <span class="kpi__label">System status</span>
          <span class="kpi__meta">Up ${esc(formatDuration(health.uptimeSeconds))}</span>
        </span>
      </div>
      <div class="kpi" style="cursor:default">
        <span class="kpi__icon">${icon('database', 20)}</span>
        <span class="kpi__body">
          <span class="kpi__value">${formatInteger(stats.counts?.total || 0)}</span>
          <span class="kpi__label">Stored records</span>
          <span class="kpi__meta">${formatInteger(entities.length)} entity sets</span>
        </span>
      </div>
      <div class="kpi" style="cursor:default">
        <span class="kpi__icon">${icon('layers', 20)}</span>
        <span class="kpi__body">
          <span class="kpi__value">${formatInteger(ctx.index.services.length)}</span>
          <span class="kpi__label">OData services</span>
          <span class="kpi__meta">Protocol V${esc(stats.system?.odataVersion || '2.0')}</span>
        </span>
      </div>
      <div class="kpi" style="cursor:default">
        <span class="kpi__icon" style="background:var(--violet-soft);color:var(--violet)">${icon('clock', 20)}</span>
        <span class="kpi__body">
          <span class="kpi__value" style="font-size:15px;padding-top:4px">${esc(stats.seededAt ? formatDate(stats.seededAt) : 'â€”')}</span>
          <span class="kpi__label">Demo data seeded</span>
          <span class="kpi__meta">Version ${esc(health.version || 'â€”')}</span>
        </span>
      </div>
    </div>

    <div class="section">
      <div class="section__head">
        <div class="section__title">Runtime</div>
      </div>
      <div class="card">
        <div class="card__body">
          <div class="detail-grid">
            <div class="detail">
              <div class="detail__label">System ID / client</div>
              <div class="detail__value mono">${esc(stats.system?.sid || 'S4H')} / ${esc(stats.system?.client || '100')}</div>
            </div>
            <div class="detail">
              <div class="detail__label">Release</div>
              <div class="detail__value">${esc(stats.system?.release || 'mock')}</div>
            </div>
            <div class="detail">
              <div class="detail__label">Persistence</div>
              <div class="detail__value">${esc(stats.system?.database || 'JSON document store')}</div>
            </div>
            <div class="detail">
              <div class="detail__label">Data file</div>
              <div class="detail__value mono" style="font-size:12px">${esc(health.dataFile || stats.system?.dataFile || 'â€”')}</div>
            </div>
            <div class="detail">
              <div class="detail__label">Anonymous writes</div>
              <div class="detail__value">${ctx.catalog.auth?.anonymousWrite ? '<span class="badge badge--warning">Enabled</span>' : '<span class="badge badge--positive">Disabled</span>'}</div>
            </div>
            <div class="detail">
              <div class="detail__label">Server uptime</div>
              <div class="detail__value">${esc(formatDuration(health.uptimeSeconds))}</div>
            </div>
          </div>
        </div>
      </div>
    </div>

    <div class="section">
      <div class="section__head">
        <div class="section__title">OData services</div>
        <div class="section__sub">Each service exposes a $metadata document and JSON collections</div>
      </div>
      <div class="table-wrap">
        <table class="data">
          <thead><tr><th>Service</th><th>Service ID</th><th class="num">Entity sets</th><th>Metadata</th></tr></thead>
          <tbody>${serviceRows}</tbody>
        </table>
      </div>
    </div>

    <div class="section">
      <div class="section__head">
        <div class="section__title">Record counts</div>
        <div class="section__sub">${formatInteger(stats.counts?.total || 0)} ${pluralize(stats.counts?.total || 0, 'record')} across ${formatInteger(entities.length)} entity sets</div>
      </div>
      <div class="table-wrap">
        <table class="data">
          <thead><tr><th>Entity</th><th>Service</th><th>Entity set</th><th class="num">Records</th></tr></thead>
          <tbody>${countRows}</tbody>
        </table>
      </div>
    </div>

    <div class="section">
      <div class="section__head">
        <div class="section__title">Demo users & sign-in</div>
        <div class="section__sub">Basic authentication Â· anonymous access is available when enabled on the server</div>
      </div>
      <div class="table-wrap">
        <table class="data">
          <thead><tr><th>User</th><th>Password</th><th>Role</th><th></th></tr></thead>
          <tbody>
            ${DEMO_USERS.map(
              (user) => `
                <tr>
                  <td class="cell-mono cell-strong">${esc(user.id)}</td>
                  <td class="cell-mono">${esc(user.password)}</td>
                  <td><span class="badge badge--${esc(user.tone)}">${esc(user.role)}</span></td>
                  <td style="text-align:right"><button class="btn btn--sm" type="button" data-signin="${esc(user.id)}">${icon('user', 13)} Sign in</button></td>
                </tr>`
            ).join('')}
          </tbody>
        </table>
      </div>
      <div class="explorer-hint" style="margin-top:8px">
        Credentials are stored in this browser only. Signing in as <code>DEMO</code> or <code>AUDITOR</code> hides create/edit actions.
      </div>
    </div>

    <div class="section">
      <div class="section__head">
        <div class="section__title">Useful endpoints</div>
      </div>
      <div class="card">
        <div class="card__body" style="display:flex;flex-direction:column;gap:8px">
          ${ENDPOINTS.map(
            (endpoint) => `
              <div class="url-preview" style="align-items:center">
                <strong>${esc(endpoint.method)}</strong>
                <span style="flex:1">${esc(endpoint.path)}</span>
                <button class="btn btn--sm" type="button" data-copy="${esc(endpoint.path)}">${icon('copy', 12)} Copy</button>
                <a class="btn btn--sm" href="${esc(endpoint.path)}" target="_blank" rel="noopener">${icon('external-link', 12)} Open</a>
              </div>`
          ).join('')}
        </div>
      </div>
    </div>

    <div class="section">
      <div class="section__head">
        <div class="section__title">Demo data</div>
        <div class="section__sub">Reset restores the deterministic seeded dataset</div>
      </div>
      <div class="card">
        <div class="card__body" style="display:flex;flex-wrap:wrap;align-items:center;justify-content:space-between;gap:16px">
          <div>
            <div class="card__title" style="font-size:13.5px">Reset sandbox data</div>
            <div class="card__sub">Deletes all created records and reloads the fixture data. The server reseeds on the next write if needed.</div>
          </div>
          <button class="btn btn--danger" type="button" data-reset-data>${icon('reset', 15)} Reset Demo Data</button>
        </div>
      </div>
    </div>`;

  qs('[data-refresh]', root).addEventListener('click', () => renderSystem(root, ctx));

  qsa('[data-copy]', root).forEach((button) => {
    button.addEventListener('click', async () => {
      const ok = await copyText(button.dataset.copy);
      toast({ type: ok ? 'success' : 'error', title: ok ? 'Copied' : 'Copy failed', message: button.dataset.copy });
    });
  });

  qsa('[data-signin]', root).forEach((button) => {
    button.addEventListener('click', () => {
      if (typeof ctx.openSignIn === 'function') ctx.openSignIn(button.dataset.signin);
    });
  });

  qs('[data-reset-data]', root).addEventListener('click', async () => {
    const confirmed = await confirmDialog({
      title: 'Reset demo data?',
      message: 'All records you created or changed will be replaced by the seeded dataset.<br><br><strong>This cannot be undone.</strong>',
      confirmLabel: 'Reset data',
      danger: true
    });
    if (!confirmed) return;
    try {
      const result = await resetData();
      clearLookupCache();
      ctx.stats = null;
      toast({
        type: 'success',
        title: 'Demo data reset',
        message: `${formatInteger(Object.values(result.counts || {}).reduce((total, value) => total + Number(value || 0), 0))} records restored.`
      });
      rerenderRoute();
    } catch (error) {
      toast({ type: 'error', title: 'Reset failed', message: error.message, duration: 7000 });
    }
  });
}
