/** Generic object page: header, detail sections, related entity tables, actions. */

import { icon } from '../icons.js';
import {
  esc,
  formatCurrency,
  formatInteger,
  formatValue,
  isBlank,
  pluralize,
  decodeKey,
  keyString
} from '../format.js';
import {
  detailValue,
  entityHref,
  fieldOf,
  objectHref,
  recordSubtitle,
  recordTitle,
  renderCell,
  statusBadges,
  keySegment
} from '../components.js';
import { canEdit, canDelete } from '../permissions.js';
import { openEditDialog, confirmDelete } from '../forms.js';
import { odataGet, odataRelated, ODATA_ROOT } from '../api.js';
import { buildExplorerPath, buildListPath, navigate, rerenderRoute } from '../router.js';
import {
  errorStateHtml,
  loadingBlock,
  openModal,
  qs,
  qsa,
  toast,
  copyText,
  downloadText
} from '../ui.js';

function sectionFields(entity, section) {
  return (section.fields || [])
    .map((name) => fieldOf(entity, name))
    .filter((field) => field);
}

function allSectionedFields(entity) {
  const names = new Set();
  for (const section of entity.ui?.sections || []) {
    for (const name of section.fields || []) names.add(name);
  }
  return names;
}

function lookupHref(field, value) {
  if (!field?.lookup || isBlank(value)) return null;
  const key = encodeURIComponent(String(value));
  return `#/object/${encodeURIComponent(field.lookup.service)}/${encodeURIComponent(field.lookup.entity)}/${key}`;
}

function detailMarkup(field, record) {
  const valueHtml = detailValue(record[field.name], field);
  const href = lookupHref(field, record[field.name]);
  const content = href ? `<a href="${href}">${valueHtml}</a>` : valueHtml;
  return `
    <div class="detail">
      <div class="detail__label">${esc(field.label)}</div>
      <div>${content}</div>
    </div>`;
}

function amountFact(entity, record) {
  const amountField = ['TotalNetAmount', 'TotalDebitAmount', 'NetAmount']
    .map((name) => fieldOf(entity, name))
    .find((field) => field && !isBlank(record[field.name]));
  if (!amountField) return null;
  const currencyField = ['TransactionCurrency', 'DocumentCurrency'].map((name) => record[name]).find(Boolean);
  return {
    label: amountField.label,
    value: formatCurrency(record[amountField.name], currencyField)
  };
}

function keyFact(entity, record) {
  const keyField = fieldOf(entity, entity.key[0]);
  return {
    label: keyField?.label || entity.key[0],
    value: String(record[entity.key[0]] ?? 'â€”')
  };
}

function dateFact(entity, record) {
  const candidates = ['PostingDate', 'BillingDocumentDate', 'CreationDate', 'PurchaseOrderDate', 'RequestedDeliveryDate'];
  for (const name of candidates) {
    const field = fieldOf(entity, name);
    if (field && !isBlank(record[name])) {
      return { label: field.label, value: formatValue(record[name], field) };
    }
  }
  return null;
}

function relatedColumns(target, config) {
  if (!target) return [];
  const configured = (config?.columns || [])
    .map((name) => fieldOf(target, name))
    .filter(Boolean);
  if (configured.length) return configured;
  const names = new Set([...target.key, target.ui?.title, target.ui?.subtitle]);
  for (const field of target.fields) {
    if (names.size >= 6) break;
    if (!names.has(field.name) && field.ui?.list !== undefined) names.add(field.name);
  }
  return Array.from(names).filter(Boolean).map((name) => fieldOf(target, name)).filter(Boolean);
}

function relatedTable(target, config, rows) {
  const columns = relatedColumns(target, config);
  if (!columns.length) {
    return `<div class="detail__value detail__value--empty" style="padding:16px">${formatInteger(rows.length)} related records</div>`;
  }
  return `
    <div style="overflow:auto">
      <table class="data">
        <thead>
          <tr>${columns.map((field) => `<th scope="col">${esc(field.label)}</th>`).join('')}</tr>
        </thead>
        <tbody>
          ${rows.length
            ? rows
                .map((row) => {
                  const href = target ? objectHref(target, row) : '';
                  return `
                    <tr${href ? ` class="clickable" tabindex="0" data-href="${esc(href)}"` : ''}>
                      ${columns
                        .map((field) => {
                          const classes = field.type === 'Edm.Decimal' ? 'num' : '';
                          return `<td class="${classes}">${renderCell(row[field.name], field)}</td>`;
                        })
                        .join('')}
                    </tr>`;
                })
                .join('')
            : `<tr><td colspan="${columns.length}" class="cell-empty">No related records.</td></tr>`}
        </tbody>
      </table>
    </div>`;
}

function singleRelatedCard(target, config, nav, result) {
  const record = result.record;
  if (!record) {
    return `
      <div class="card">
        <div class="card__head">
          <div class="card__title">${esc(config?.label || nav.label)}</div>
        </div>
        <div class="related-single">
          <div>
            <div class="related-single__title muted">Not assigned</div>
            <div class="related-single__sub">This record has no related ${esc((target?.singular || nav.target).toLowerCase())}.</div>
          </div>
        </div>
      </div>`;
  }
  const href = target ? objectHref(target, record) : '';
  return `
    <div class="card">
      <div class="card__head">
        <div class="card__title">${esc(config?.label || nav.label)}</div>
      </div>
      <div class="related-single">
        <div>
          <div class="related-single__title">${esc(target ? recordTitle(target, record) : nav.label)}</div>
          <div class="related-single__sub">${esc(target ? recordSubtitle(target, record) : '')}</div>
        </div>
        ${href ? `<a class="btn btn--sm" href="${href}">Open ${icon('arrow-right', 14)}</a>` : ''}
      </div>
    </div>`;
}

function relatedCardFor(nav, config, target, result) {
  if (!result || result.error) {
    return `
      <div class="card">
        <div class="card__head"><div class="card__title">${esc(config?.label || nav.label)}</div></div>
        <div class="related-single"><span class="muted">Related records could not be loaded.</span></div>
      </div>`;
  }
  if (!result.many) return singleRelatedCard(target, config, nav, result);
  const rows = result.rows;
  const total = result.count;
  const label = config?.label || nav.label;
  return `
    <div class="card related">
      <div class="card__head">
        <div>
          <div class="card__title">${esc(label)} <span class="badge badge--neutral">${formatInteger(total)}</span></div>
          <div class="card__sub">${rows.length < total
            ? `Showing ${formatInteger(rows.length)} of ${formatInteger(total)}`
            : `${formatInteger(total)} ${esc(pluralize(total, 'record'))}`}</div>
        </div>
        ${target ? `<a class="btn btn--sm" href="${entityHref(target.serviceId, target.name)}">Open ${esc(target.label)} ${icon('arrow-right', 13)}</a>` : ''}
      </div>
      <div class="card__body card__body--flush">${relatedTable(target, config, rows)}</div>
    </div>`;
}

function jsonDialog(entity, record) {
  const json = JSON.stringify(record, null, 2);
  openModal({
    title: 'Record payload',
    subtitle: `${entity.name} Â· OData V2 JSON`,
    wide: true,
    body: `<pre class="response-body" style="border-radius:var(--radius-sm)">${esc(json)}</pre>`,
    footer: `
      <button class="btn" type="button" data-copy>${icon('copy', 14)} Copy JSON</button>
      <button class="btn" type="button" data-download>${icon('download', 14)} Download</button>
      <button class="btn btn--primary" type="button" data-modal-close>Close</button>`,
    onMount({ dialog }) {
      qs('[data-copy]', dialog).addEventListener('click', async () => {
        const ok = await copyText(json);
        toast({ type: ok ? 'success' : 'error', title: ok ? 'Copied' : 'Copy failed', message: ok ? 'Record JSON copied.' : 'Could not copy JSON.' });
      });
      qs('[data-download]', dialog).addEventListener('click', () => {
        downloadText(`${entity.name}-${Object.values(record).slice(0, 1).join('')}.json`, json);
      });
    }
  });
}

export async function renderObject(root, ctx, route) {
  const entity = ctx.index.entities[`${route.service}/${route.entity}`];
  if (!entity) {
    root.innerHTML = errorStateHtml(`The entity set ${route.service}/${route.entity} does not exist in the catalog.`, { retry: false });
    return;
  }

  const values = decodeKey(route.keySegment, entity.key.length);
  const key = Object.fromEntries(entity.key.map((name, index) => [name, values[index] ?? '']));
  const listPath = buildListPath(entity.serviceId, entity.name);
  const explorerPath = buildExplorerPath(entity.serviceId, entity.name);

  root.innerHTML = loadingBlock(`Loading ${entity.singular || entity.label}â€¦`);

  let record;
  try {
    record = await odataGet(entity.serviceId, entity.name, key);
  } catch (error) {
    root.innerHTML = `
      <div class="breadcrumbs">
        <a href="#/">${icon('home', 12)} Home</a>${icon('chevron-right', 12)}
        <a href="#${esc(listPath)}">${esc(entity.label)}</a>${icon('chevron-right', 12)}
        <span>${esc(keyString(key, entity.key))}</span>
      </div>
      ${errorStateHtml(error.message, { title: `Could not load ${entity.singular || entity.label}` })}
      <div style="margin-top:14px"><a class="btn" href="#${esc(listPath)}">${icon('arrow-left', 14)} Back to ${esc(entity.label)}</a></div>`;
    qs('[data-retry]', root)?.addEventListener('click', () => renderObject(root, ctx, route));
    return;
  }

  if (!record) {
    root.innerHTML = `
      ${errorStateHtml(`No ${entity.singular || entity.label} was found for ${keyString(key, entity.key)}.`, { title: 'Record not found' })}
      <div style="margin-top:14px"><a class="btn" href="#${esc(listPath)}">${icon('arrow-left', 14)} Back to ${esc(entity.label)}</a></div>`;
    return;
  }

  const relatedConfig = new Map((entity.ui?.related || []).map((item) => [item.nav, item]));
  const relatedResults = await Promise.all(
    entity.nav.map(async (nav) => {
      const config = relatedConfig.get(nav.name);
      const target = ctx.index.entities[`${nav.targetService}/${nav.target}`] || null;
      const options = { count: Boolean(nav.many), top: nav.many ? 25 : undefined };
      if (nav.many && target) {
        const columns = relatedColumns(target, config);
        const select = new Set([...target.key, ...columns.map((field) => field.name)]);
        if (target.ui?.title) select.add(target.ui.title);
        if (target.ui?.subtitle) select.add(target.ui.subtitle);
        options.select = Array.from(select).join(',');
        options.orderby = target.key.map((name) => `${name} asc`).join(',');
      }
      try {
        const result = await odataRelated(entity.serviceId, entity.name, key, nav.name, options);
        return { nav, config, target, result };
      } catch (error) {
        return { nav, config, target, result: { error } };
      }
    })
  );

  const sectionsHtml = [];
  const sectioned = allSectionedFields(entity);
  for (const section of entity.ui?.sections || []) {
    const fields = sectionFields(entity, section);
    if (!fields.length) continue;
    sectionsHtml.push(`
      <div class="card" style="margin-top:16px">
        <div class="card__head">
          <div class="card__title">${esc(section.label)}</div>
        </div>
        <div class="card__body">
          <div class="detail-grid">
            ${fields.map((field) => detailMarkup(field, record)).join('')}
          </div>
        </div>
      </div>`);
  }
  const leftover = entity.fields.filter((field) => !sectioned.has(field.name));
  if (leftover.length && (!entity.ui?.sections || !entity.ui.sections.length)) {
    sectionsHtml.push(`
      <div class="card" style="margin-top:16px">
        <div class="card__head"><div class="card__title">Details</div></div>
        <div class="card__body"><div class="detail-grid">${leftover.map((field) => detailMarkup(field, record)).join('')}</div></div>
      </div>`);
  }

  const relatedHtml = relatedResults.map(({ nav, config, target, result }) => relatedCardFor(nav, config, target, result)).join('');
  const facts = [keyFact(entity, record), amountFact(entity, record), dateFact(entity, record)].filter(Boolean);

  const editable = canEdit(entity, ctx.me);
  const deletable = canDelete(entity, ctx.me);
  const readOnly = !editable && !deletable;

  root.innerHTML = `
    <div class="breadcrumbs">
      <a href="#/">${icon('home', 12)} Home</a>
      ${icon('chevron-right', 12)}
      <span>${esc(entity.group || entity.serviceLabel)}</span>
      ${icon('chevron-right', 12)}
      <a href="#${esc(listPath)}">${esc(entity.label)}</a>
      ${icon('chevron-right', 12)}
      <span>${esc(keyString(key, entity.key))}</span>
    </div>

    <div class="object-head">
      <div class="object-head__main">
        <div class="object-head__kicker">
          <span>${esc(entity.singular || entity.label)}</span>
          <span class="footer__dot"></span>
          <span class="mono">${esc(entity.ui?.keyLabel || entity.key[0])}: ${esc(keyString(key, entity.key))}</span>
          ${readOnly ? '<span class="badge badge--outline">Read-only</span>' : ''}
        </div>
        <h1 class="object-head__title">${esc(recordTitle(entity, record))}</h1>
        <div class="object-head__subtitle">${esc(recordSubtitle(entity, record))}</div>
        <div class="object-head__badges">${statusBadges(record, entity)}</div>
        <div class="object-facts">
          ${facts.map((fact) => `<div class="object-fact"><span>${esc(fact.label)}</span><strong>${esc(fact.value)}</strong></div>`).join('')}
        </div>
      </div>
      <div class="object-head__actions">
        <a class="btn btn--ghost btn--sm" href="#${esc(listPath)}">${icon('arrow-left', 14)} Back</a>
        <button class="btn btn--ghost btn--sm" type="button" data-json>${icon('code', 14)} JSON</button>
        <a class="btn btn--ghost btn--sm" href="#${esc(explorerPath)}" title="Open in API explorer">${icon('terminal', 14)} API</a>
        ${editable ? `<button class="btn btn--sm" type="button" data-edit>${icon('edit', 14)} Edit</button>` : ''}
        ${deletable ? `<button class="btn btn--danger btn--sm" type="button" data-delete>${icon('trash', 14)} Delete</button>` : ''}
      </div>
    </div>

    ${sectionsHtml.join('')}

    ${relatedResults.length ? `<div class="section"><div class="section__head"><div class="section__title">Related Records</div><div class="section__sub">Document flow and dependent master data</div></div><div class="related-stack">${relatedHtml}</div></div>` : ''}

    <div class="section">
      <div class="card">
        <div class="card__head">
          <div>
            <div class="card__title">OData access</div>
            <div class="card__sub">This record is addressable through the sandbox service</div>
          </div>
          <a class="btn btn--sm" href="#${esc(explorerPath)}">${icon('external-link', 13)} Explorer</a>
        </div>
        <div class="card__body">
          <div class="url-preview">
            <strong>GET</strong>
            <span>${esc(`${ODATA_ROOT}/${entity.serviceId}/${entity.name}(${entity.key.map((name) => `${name}='${record[name]}'`).join(',')})`)}</span>
          </div>
        </div>
      </div>
    </div>`;

  qs('[data-json]', root)?.addEventListener('click', () => jsonDialog(entity, record));

  qs('[data-edit]', root)?.addEventListener('click', () => {
    openEditDialog(entity, record, {
      onUpdated() {
        rerenderRoute();
      }
    });
  });

  qs('[data-delete]', root)?.addEventListener('click', () => {
    confirmDelete(entity, record, {
      onDeleted() {
        navigate(listPath);
      }
    });
  });

  root.addEventListener('click', (event) => {
    const row = event.target.closest('tr[data-href]');
    if (row && !event.target.closest('button, a')) navigate(row.dataset.href.replace(/^#/, ''));
  });
  root.addEventListener('keydown', (event) => {
    if (event.key !== 'Enter' && event.key !== ' ') return;
    const row = event.target.closest('tr[data-href]');
    if (!row) return;
    event.preventDefault();
    navigate(row.dataset.href.replace(/^#/, ''));
  });
}
