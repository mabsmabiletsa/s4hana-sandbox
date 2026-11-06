/** Launchpad: system overview, KPI cards, app tiles and recent activity. */

import { icon } from '../icons.js';
import { esc, formatAmount, formatCurrency, formatInteger, formatDate, pluralize } from '../format.js';
import { renderCell, fieldOf, objectHref, entityHref } from '../components.js';
import { loadingBlock, errorStateHtml, qs } from '../ui.js';
import { getStats } from '../api.js';

const GROUP_STYLE = {
  'Master Data': { color: 'var(--accent)', bg: 'var(--accent-soft)' },
  Sales: { color: 'var(--teal)', bg: 'var(--teal-soft)' },
  Procurement: { color: 'var(--amber)', bg: 'var(--amber-soft)' },
  Finance: { color: 'var(--violet)', bg: 'var(--violet-soft)' }
};

function tileMarkup(entity, count) {
  const style = GROUP_STYLE[entity.group] || GROUP_STYLE['Master Data'];
  const iconName = entity.ui?.icon || entity.serviceIcon || 'box';
  return `
    <a class="tile" href="${entityHref(entity.serviceId, entity.name)}"
       style="--tile-color:${style.color};--tile-bg:${style.bg}">
      <span class="tile__icon">${icon(iconName, 21)}</span>
      <span class="tile__body">
        <span class="tile__title">${esc(entity.label)}</span>
        <span class="tile__sub">${esc(entity.description || entity.singular || '')}</span>
        <span class="tile__meta">
          <span>${formatInteger(count)} ${esc(pluralize(count, 'record'))}</span>
          <span class="footer__dot"></span>
          <span>${esc(entity.group || '')}</span>
        </span>
      </span>
      <span class="tile__arrow">${icon('arrow-right', 16)}</span>
    </a>`;
}

function kpi({ title, value, meta, iconName, href, style }) {
  return `
    <a class="kpi" href="${esc(href)}"${style ? ` style="${style}"` : ''}>
      <span class="kpi__icon">${icon(iconName, 20)}</span>
      <span class="kpi__body">
        <span class="kpi__value">${esc(value)}</span>
        <span class="kpi__label">${esc(title)}</span>
        <span class="kpi__meta">${esc(meta)}</span>
      </span>
    </a>`;
}

function recentOrders(stats, index) {
  const entity = index.entityByName.A_SalesOrder;
  const rows = stats.sales?.recentOrders || [];
  if (!entity) return '';
  const columns = ['SalesOrder', 'SoldToPartyName', 'TotalNetAmount', 'TransactionCurrency', 'OverallDeliveryStatus', 'CreationDate']
    .map((name) => fieldOf(entity, name))
    .filter(Boolean);
  return `
    <div class="card" style="margin-top:22px">
      <div class="card__head">
        <div>
          <div class="card__title">Recent sales orders</div>
          <div class="card__sub">Newest orders created in the sandbox</div>
        </div>
        <a class="btn btn--sm" href="${entityHref(entity.serviceId, entity.name)}">Open sales orders ${icon('arrow-right', 14)}</a>
      </div>
      <div class="card__body" style="padding:0;overflow:auto">
        <table class="data">
          <thead>
            <tr>${columns.map((field) => `<th scope="col">${esc(field.label)}</th>`).join('')}</tr>
          </thead>
          <tbody>
            ${rows.length
              ? rows
                  .map(
                    (row) => `
                      <tr class="clickable" tabindex="0" data-order="${esc(row.SalesOrder)}">
                        ${columns
                          .map((field) => {
                            if (field.name === 'TotalNetAmount') {
                              return `<td class="num cell-strong">${esc(formatCurrency(row.TotalNetAmount, row.TransactionCurrency))}</td>`;
                            }
                            if (field.name === 'TransactionCurrency') return `<td class="cell-mono">${esc(row.TransactionCurrency || '')}</td>`;
                            return `<td>${renderCell(row[field.name], field)}</td>`;
                          })
                          .join('')}
                      </tr>`
                  )
                  .join('')
              : `<tr><td colspan="${columns.length}" class="cell-empty">No sales orders yet.</td></tr>`}
          </tbody>
        </table>
      </div>
    </div>`;
}

function quickStart() {
  const sample = '/sap/opu/odata/sap/API_BUSINESS_PARTNER/A_BusinessPartner?$top=5&$count=true';
  return `
    <div class="card" style="margin-top:22px">
      <div class="card__head">
        <div>
          <div class="card__title">Try the OData API</div>
          <div class="card__sub">All screens are powered by the same OData V2 services</div>
        </div>
        <a class="btn btn--sm" href="#/explorer">Open API Explorer ${icon('arrow-right', 14)}</a>
      </div>
      <div class="card__body">
        <div class="url-preview" style="align-items:center">
          <strong>GET</strong>
          <span style="flex:1">${esc(sample)}</span>
          <button class="btn btn--sm" type="button" data-copy-sample>${icon('copy', 13)} Copy</button>
        </div>
        <div class="explorer-hint" style="margin-top:10px">
          Requests accept <code>Basic</code> authentication. Anonymous access is write-enabled by default on localhost.
        </div>
      </div>
    </div>`;
}

export async function renderLaunchpad(root, ctx) {
  root.innerHTML = loadingBlock('Preparing launchpadâ€¦');
  let stats = ctx.stats;
  try {
    if (!stats) {
      stats = await getStats();
      ctx.stats = stats;
    }
  } catch (error) {
    root.innerHTML = errorStateHtml(error.message, { title: 'Could not load the sandbox overview' });
    qs('[data-retry]', root)?.addEventListener('click', () => renderLaunchpad(root, { ...ctx, stats: null }));
    return;
  }

  const { index, catalog } = ctx;
  const counts = stats.counts?.byEntity || {};
  const groups = ['Master Data', 'Sales', 'Procurement', 'Finance'];
  const entitiesOrdered = Object.values(index.entities).filter((entity) => entity.ui?.group !== 'Hidden');
  const services = catalog.services || [];
  const totalEntities = Object.keys(index.entities).length;
  const seeded = stats.seededAt ? formatDate(stats.seededAt) : 'â€”';
  const topCurrency = stats.sales?.totalByCurrency?.[0];
  const salesValue = topCurrency ? formatAmount(topCurrency.amount, topCurrency.currency) : 'â€”';

  const kpis = [
    kpi({
      title: 'Business partners',
      value: formatInteger(stats.businessPartners?.total || 0),
      meta: `${formatInteger(stats.businessPartners?.customers || 0)} customers Â· ${formatInteger(stats.businessPartners?.suppliers || 0)} suppliers`,
      iconName: 'people',
      href: entityHref('API_BUSINESS_PARTNER', 'A_BusinessPartner')
    }),
    kpi({
      title: 'Products',
      value: formatInteger(stats.products?.total || 0),
      meta: `${formatInteger(stats.products?.byType?.length || 0)} product types`,
      iconName: 'box',
      href: entityHref('API_PRODUCT_SRV', 'A_Product')
    }),
    kpi({
      title: 'Open sales orders',
      value: formatInteger(stats.sales?.openOrders || 0),
      meta: `${formatInteger(stats.sales?.orders || 0)} orders Â· ${salesValue}`,
      iconName: 'cart',
      href: entityHref('API_SALES_ORDER_SRV', 'A_SalesOrder')
    }),
    kpi({
      title: 'Purchase orders',
      value: formatInteger(stats.procurement?.purchaseOrders || 0),
      meta: stats.procurement?.totalByCurrency?.[0]
        ? formatAmount(stats.procurement.totalByCurrency[0].amount, stats.procurement.totalByCurrency[0].currency)
        : 'Procurement documents',
      iconName: 'shopping-bag',
      href: entityHref('API_PURCHASEORDER_PROCESS_SRV', 'A_PurchaseOrder')
    }),
    kpi({
      title: 'Billing documents',
      value: formatInteger(stats.billing?.documents || 0),
      meta: `${formatInteger(stats.billing?.cancelled || 0)} cancelled`,
      iconName: 'file-text',
      href: entityHref('API_BILLING_DOCUMENT_SRV', 'A_BillingDocument')
    }),
    kpi({
      title: 'Journal entries',
      value: formatInteger(stats.finance?.journalEntries || 0),
      meta: stats.finance?.totalByCurrency?.[0]
        ? formatAmount(stats.finance.totalByCurrency[0].amount, stats.finance.totalByCurrency[0].currency)
        : 'Financial postings',
      iconName: 'landmark',
      href: entityHref('API_JOURNAL_ENTRY_SRV', 'A_JournalEntry')
    })
  ].join('');

  const groupSections = groups
    .map((group) => {
      const items = entitiesOrdered.filter((entity) => (entity.group || entity.ui?.group) === group);
      if (!items.length) return '';
      return `
        <div class="section" id="group-${esc(group.toLowerCase().replace(/[^a-z]+/g, '-'))}">
          <div class="section__head">
            <div class="section__title">${esc(group)}</div>
            <div class="section__sub">${formatInteger(items.length)} ${esc(pluralize(items.length, 'app'))}</div>
          </div>
          <div class="tile-grid">${items.map((entity) => tileMarkup(entity, counts[entity.name] || 0)).join('')}</div>
        </div>`;
    })
    .join('');

  root.innerHTML = `
    <section class="hero">
      <div class="hero__content">
        <div>
          <span class="hero__eyebrow">${icon('sparkles', 13)} Mock S/4HANA system Â· client 100</span>
          <h1>Your S/4HANA sandbox, ready to explore.</h1>
          <p class="hero__sub">
            Browse consistent master data and document flow across six OData V2 services,
            then create a business partner or sales order and watch the related records follow.
          </p>
        </div>
        <div class="hero__actions">
          <a class="btn btn--primary" href="#/explorer">${icon('terminal', 16)} API Explorer</a>
          <a class="btn" href="#/system">${icon('gauge', 16)} System Info</a>
        </div>
      </div>
      <div class="hero__stats">
        <div class="hero__stat"><strong>${formatInteger(stats.counts?.total || 0)}</strong><span>records</span></div>
        <div class="hero__stat"><strong>${formatInteger(services.length)}</strong><span>OData services</span></div>
        <div class="hero__stat"><strong>${formatInteger(totalEntities)}</strong><span>entity sets</span></div>
        <div class="hero__stat"><strong>${esc(seeded)}</strong><span>seeded</span></div>
      </div>
    </section>

    <div class="kpi-grid">${kpis}</div>

    <div class="section" id="apps">
      <div class="section__head">
        <div class="section__title">Apps</div>
        <div class="section__sub">Jump into any entity set â€“ list pages support search, filters, sorting and paging</div>
      </div>
      ${groupSections || `<div class="empty">No apps configured.</div>`}
    </div>

    ${recentOrders(stats, index)}
    ${quickStart()}

    <div class="section">
      <div class="section__head">
        <div class="section__title">About this sandbox</div>
      </div>
      <div class="card">
        <div class="card__body">
          <div class="detail-grid">
            <div class="detail">
              <div class="detail__label">System</div>
              <div class="detail__value">${esc(stats.system?.sid || 'S4H')} / ${esc(stats.system?.client || '100')} Â· ${esc(stats.system?.release || 'mock')}</div>
            </div>
            <div class="detail">
              <div class="detail__label">OData protocol</div>
              <div class="detail__value">V${esc(stats.system?.odataVersion || '2.0')} Â· JSON envelopes with <span class="mono">d.results</span></div>
            </div>
            <div class="detail">
              <div class="detail__label">Persistence</div>
              <div class="detail__value">${esc(stats.system?.database || 'JSON document store')}</div>
            </div>
            <div class="detail">
              <div class="detail__label">Demo users</div>
              <div class="detail__value mono">DEVELOPER / Password1 Â· DEMO / Demo1234</div>
            </div>
          </div>
        </div>
      </div>
    </div>`;

  qsaForOrders(root).forEach((row) => {
    const open = () => {
      const entity = index.entityByName.A_SalesOrder;
      const record = { SalesOrder: row.dataset.order };
      window.location.hash = objectHref(entity, record).slice(1);
    };
    row.addEventListener('click', open);
    row.addEventListener('keydown', (event) => {
      if (event.key === 'Enter' || event.key === ' ') {
        event.preventDefault();
        open();
      }
    });
  });

  qs('[data-copy-sample]', root)?.addEventListener('click', async () => {
    const { copyText, toast } = await import('./ui.js');
    const ok = await copyText('/sap/opu/odata/sap/API_BUSINESS_PARTNER/A_BusinessPartner?$top=5&$count=true');
    toast({
      type: ok ? 'success' : 'error',
      title: ok ? 'Copied' : 'Copy failed',
      message: ok ? 'Sample OData URL copied to the clipboard.' : 'Copy the URL manually from the card.'
    });
  });
}

function qsaForOrders(root) {
  return Array.from(root.querySelectorAll('tr[data-order]'));
}
