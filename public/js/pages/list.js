/** Generic OData list page: search, filters, sorting, paging and CSV export. */

import { icon } from '../icons.js';
import { esc, formatInteger, formatValue, pluralize } from '../format.js';
import {
  columnsFor,
  fieldOf,
  objectHref,
  renderCell,
  sortHeader,
  cellClass
} from '../components.js';
import { canCreate } from '../permissions.js';
import { openCreateDialog } from '../forms.js';
import { odataCollection, escapeODataString, ODATA_ROOT } from '../api.js';
import { buildExplorerPath, buildListPath, navigate } from '../router.js';
import { debounce, downloadText, emptyStateHtml, errorStateHtml, qs, qsa, skeletonRows, toast, setButtonLoading } from '../ui.js';

const PAGE_SIZE = 20;

function parseDefaultOrder(entity) {
  const raw = String(entity.ui?.defaultOrder || '').trim();
  if (!raw) {
    const firstKey = entity.key[0];
    return { field: firstKey, dir: 'asc' };
  }
  const [first] = raw.split(',');
  const [field, dir] = first.trim().split(/\s+/);
  const known = fieldOf(entity, field);
  return {
    field: known ? field : entity.key[0],
    dir: String(dir || 'asc').toLowerCase() === 'desc' ? 'desc' : 'asc'
  };
}

function readState(entity, route) {
  const fallback = parseDefaultOrder(entity);
  const filters = {};
  for (const [key, value] of route.query.entries()) {
    if (key.startsWith('f.') && value !== '') filters[key.slice(2)] = value;
  }
  const sortField = route.query.get('sort');
  const direction = String(route.query.get('dir') || '').toLowerCase();
  return {
    q: route.query.get('q') || '',
    filters,
    sort: sortField && fieldOf(entity, sortField) ? sortField : fallback.field,
    dir: direction === 'desc' || direction === 'asc' ? direction : fallback.dir,
    page: Math.max(1, Number(route.query.get('page')) || 1)
  };
}

function buildFilterExpression(entity, filters) {
  const parts = [];
  for (const [name, value] of Object.entries(filters)) {
    const field = fieldOf(entity, name);
    if (!field) continue;
    if (field.type === 'Edm.Boolean') {
      parts.push(`${field.name} eq ${value === 'true' ? 'true' : 'false'}`);
    } else if (field.type === 'Edm.Decimal' || field.type === 'Edm.Int32') {
      const numeric = Number(value);
      if (Number.isFinite(numeric)) parts.push(`${field.name} eq ${numeric}`);
    } else {
      parts.push(`${field.name} eq '${escapeODataString(value)}'`);
    }
  }
  return parts.join(' and ');
}

function filterLabel(field, value) {
  if (field.type === 'Edm.Boolean') return value === 'true' ? 'Yes' : 'No';
  const option = (field.options || []).find((item) => String(item.value) === String(value));
  return option ? option.label : String(value);
}

function buildParams(entity, state) {
  const columns = columnsFor(entity);
  const select = new Set(columns.map((field) => field.name));
  for (const key of entity.key) select.add(key);
  for (const name of [entity.ui?.title, entity.ui?.subtitle, ...(entity.ui?.headerStatus || [])]) {
    if (name) select.add(name);
  }
  for (const field of entity.fields) {
    if (field.name.endsWith('Currency') || field.name === 'TransactionCurrency') select.add(field.name);
  }
  return {
    search: state.q || undefined,
    filter: buildFilterExpression(entity, state.filters) || undefined,
    orderby: `${state.sort} ${state.dir}`,
    top: PAGE_SIZE,
    skip: (state.page - 1) * PAGE_SIZE,
    count: true,
    select: Array.from(select).join(',')
  };
}

function rowsCsv(entity, rows) {
  const columns = columnsFor(entity);
  const header = columns.map((field) => field.label);
  const lines = [header];
  for (const row of rows) {
    lines.push(
      columns.map((field) => {
        const text = formatValue(row[field.name], field);
        return `"${String(text).replace(/"/g, '""')}"`;
      })
    );
  }
  return lines.map((line) => line.join(',')).join('\r\n');
}

export async function renderList(root, ctx, route) {
  const entity = ctx.index.entities[`${route.service}/${route.entity}`];
  if (!entity) {
    root.innerHTML = `
      <div class="breadcrumbs"><a href="#/">Home</a>${icon('chevron-right', 12)}<span>Unknown entity</span></div>
      ${errorStateHtml(`The entity set ${route.service}/${route.entity} does not exist in the catalog.`, { retry: false })}`;
    return;
  }

  const columns = columnsFor(entity);
  const state = readState(entity, route);
  let requestSeq = 0;
  let rows = [];
  let total = 0;
  let loaded = false;

  const title = entity.ui?.listTitle || entity.label;
  const createAllowed = canCreate(entity, ctx.me);
  const explorerHref = `#${buildExplorerPath(entity.serviceId, entity.name)}`;
  const apiPath = `${ODATA_ROOT}/${entity.serviceId}/${entity.name}`;

  const filterSelects = (entity.ui?.filters || [])
    .map((filter) => {
      const field = fieldOf(entity, filter.field);
      if (!field) return '';
      const value = state.filters[filter.field] ?? '';
      const options = (filter.options || [])
        .map((option) => `<option value="${esc(option.value)}"${String(option.value) === String(value) ? ' selected' : ''}>${esc(option.label)}</option>`)
        .join('');
      return `
        <label class="sr-only" for="filter-${esc(filter.field)}">${esc(filter.label)}</label>
        <select class="select" id="filter-${esc(filter.field)}" data-filter="${esc(filter.field)}">
          <option value="">All ${esc(filter.label)}</option>
          ${options}
        </select>`;
    })
    .join('');

  root.innerHTML = `
    <div class="breadcrumbs">
      <a href="#/">${icon('home', 12)} Home</a>
      ${icon('chevron-right', 12)}
      <span>${esc(entity.group || entity.serviceLabel)}</span>
      ${icon('chevron-right', 12)}
      <span>${esc(title)}</span>
    </div>
    <div class="page-head">
      <div>
        <h1 class="page-head__title">${esc(title)}</h1>
        <div class="page-head__subtitle">${esc(entity.description || entity.serviceLabel)}</div>
      </div>
      <div class="page-head__actions">
        <a class="btn btn--ghost" href="${esc(explorerHref)}" title="Open this entity set in the API explorer">${icon('code', 15)} API</a>
        <button class="btn btn--ghost" type="button" data-refresh title="Reload data">${icon('refresh', 15)} <span>Refresh</span></button>
        <button class="btn" type="button" data-export title="Download the current page as CSV">${icon('download', 15)} Export</button>
        ${createAllowed ? `<button class="btn btn--primary" type="button" data-create>${icon('plus', 15)} ${esc(entity.ui?.createLabel || `Create ${entity.singular || 'record'}`)}</button>` : ''}
      </div>
    </div>

    <div class="toolbar">
      <div class="search-input">
        ${icon('search', 15)}
        <input class="input" type="search" data-search value="${esc(state.q)}"
               placeholder="${esc(entity.ui?.searchPlaceholder || `Search ${title.toLowerCase()}â€¦`)}"
               aria-label="Search ${esc(title)}">
      </div>
      ${filterSelects}
      <div class="toolbar__grow"></div>
      <span class="toolbar__label" data-result-count aria-live="polite">Loadingâ€¦</span>
    </div>
    <div class="chips" data-chips style="margin-bottom:12px"></div>

    <div class="table-wrap">
      <table class="data">
        <thead>
          <tr>${columns.map((field) => sortHeader(entity, field, state.sort, state.dir)).join('')}</tr>
        </thead>
        <tbody data-table-body>${skeletonRows(columns.length, 8)}</tbody>
      </table>
      <div class="table-footer" data-table-footer></div>
    </div>`;

  const tbody = qs('[data-table-body]', root);
  const footer = qs('[data-table-footer]', root);
  const countLabel = qs('[data-result-count]', root);
  const chips = qs('[data-chips]', root);
  const searchInput = qs('[data-search]', root);

  function syncUrl() {
    const query = {};
    if (state.q) query.q = state.q;
    if (state.page > 1) query.page = state.page;
    if (state.sort !== parseDefaultOrder(entity).field) query.sort = state.sort;
    if (state.dir !== parseDefaultOrder(entity).dir) query.dir = state.dir;
    for (const [field, value] of Object.entries(state.filters)) query[`f.${field}`] = value;
    const path = buildListPath(entity.serviceId, entity.name, query);
    window.history.replaceState(null, '', `${window.location.pathname}${window.location.search}#${path}`);
  }

  function renderChips() {
    const items = [];
    if (state.q) {
      items.push(`<span class="chip">${icon('search', 11)} ${esc(state.q)}<button type="button" data-clear-search aria-label="Clear search">${icon('x', 11)}</button></span>`);
    }
    for (const [name, value] of Object.entries(state.filters)) {
      const field = fieldOf(entity, name);
      if (!field) continue;
      const filter = (entity.ui?.filters || []).find((item) => item.field === name);
      items.push(
        `<span class="chip">${esc(filter?.label || field.label)}: ${esc(filterLabel(field, value))}<button type="button" data-clear-filter="${esc(name)}" aria-label="Remove filter">${icon('x', 11)}</button></span>`
      );
    }
    if (items.length > 1) {
      items.push(`<button class="btn btn--ghost btn--sm" type="button" data-clear-all>Clear all</button>`);
    }
    chips.innerHTML = items.join('');
    chips.style.display = items.length ? 'flex' : 'none';
  }

  function renderTable() {
    if (!rows.length) {
      const hasQuery = Boolean(state.q) || Object.keys(state.filters).length;
      tbody.innerHTML = `
        <tr>
          <td colspan="${columns.length}" class="cell-empty">
            <div style="display:flex;flex-direction:column;align-items:center;gap:8px">
              <div class="empty__icon">${icon(hasQuery ? 'search' : 'database', 22)}</div>
              <strong>${hasQuery ? 'No matching records' : 'No records yet'}</strong>
              <span class="muted">${hasQuery
                ? 'Try a different search term or remove the active filters.'
                : canCreate(entity, ctx.me) ? 'Create the first record to get started.' : 'Seed the sandbox data to populate this entity set.'}</span>
              ${hasQuery ? '<button class="btn btn--sm" type="button" data-clear-all>Clear search and filters</button>' : ''}
            </div>
          </td>
        </tr>`;
      return;
    }
    tbody.innerHTML = rows
      .map((row) => {
        const href = objectHref(entity, row);
        const label = (entity.key || []).map((key) => row[key]).join(' / ');
        return `
          <tr class="clickable" tabindex="0" data-href="${esc(href)}" aria-label="Open ${esc(label)}">
            ${columns
              .map((field) => {
                const classes = [cellClass(field)];
                if (field.name === entity.ui?.title) classes.push('cell-strong');
                if (field.type === 'Edm.Decimal') classes.push('num');
                return `<td class="${classes.join(' ').trim()}">${renderCell(row[field.name], field)}</td>`;
              })
              .join('')}
          </tr>`;
      })
      .join('');
  }

  function renderFooter() {
    const start = total === 0 ? 0 : (state.page - 1) * PAGE_SIZE + 1;
    const end = Math.min(state.page * PAGE_SIZE, total);
    const pages = Math.max(1, Math.ceil(total / PAGE_SIZE));
    footer.innerHTML = `
      <span>Showing <strong>${formatInteger(start)}â€“${formatInteger(end)}</strong> of <strong>${formatInteger(total)}</strong></span>
      <div class="pager">
        <button class="pager__btn" type="button" data-page="${state.page - 1}" ${state.page <= 1 ? 'disabled' : ''} aria-label="Previous page">${icon('chevron-left', 13)}</button>
        <span class="pager__info">Page ${formatInteger(state.page)} of ${formatInteger(pages)}</span>
        <button class="pager__btn" type="button" data-page="${state.page + 1}" ${state.page >= pages ? 'disabled' : ''} aria-label="Next page">${icon('chevron-right', 13)}</button>
      </div>`;
    countLabel.textContent = `${formatInteger(total)} ${pluralize(total, 'record')}`;
  }

  function setLoading() {
    tbody.innerHTML = skeletonRows(columns.length, 8);
    footer.innerHTML = `<span>Loading recordsâ€¦</span>`;
    countLabel.textContent = 'Loadingâ€¦';
  }

  async function load() {
    const seq = ++requestSeq;
    setLoading();
    try {
      const result = await odataCollection(entity.serviceId, entity.name, buildParams(entity, state));
      if (seq !== requestSeq) return;
      rows = result.rows;
      total = result.count;
      loaded = true;
      const pages = Math.max(1, Math.ceil(total / PAGE_SIZE));
      if (state.page > pages && total > 0) {
        state.page = pages;
        syncUrl();
        await load();
        return;
      }
      renderTable();
      renderFooter();
      renderChips();
    } catch (error) {
      if (seq !== requestSeq) return;
      tbody.innerHTML = `<tr><td colspan="${columns.length}" class="cell-empty">${errorStateHtml(error.message, { title: 'Could not load records', retry: true })}</td></tr>`;
      qs('[data-retry]', tbody)?.addEventListener('click', load);
      footer.innerHTML = '';
      countLabel.textContent = 'Error';
    }
  }

  const search = debounce(() => {
    state.q = searchInput.value.trim();
    state.page = 1;
    syncUrl();
    load();
  }, 320);

  searchInput.addEventListener('input', search);
  searchInput.addEventListener('keydown', (event) => {
    if (event.key === 'Enter') {
      event.preventDefault();
      search.cancel();
      state.q = searchInput.value.trim();
      state.page = 1;
      syncUrl();
      load();
    }
  });

  qsa('[data-filter]', root).forEach((select) => {
    select.addEventListener('change', () => {
      const field = select.dataset.filter;
      if (select.value) state.filters[field] = select.value;
      else delete state.filters[field];
      state.page = 1;
      syncUrl();
      load();
    });
  });

  root.addEventListener('click', (event) => {
    const clearSearch = event.target.closest('[data-clear-search]');
    if (clearSearch) {
      state.q = '';
      searchInput.value = '';
      state.page = 1;
      syncUrl();
      load();
      return;
    }
    const clearFilter = event.target.closest('[data-clear-filter]');
    if (clearFilter) {
      const field = clearFilter.dataset.clearFilter;
      delete state.filters[field];
      const select = qs(`[data-filter="${field}"]`, root);
      if (select) select.value = '';
      state.page = 1;
      syncUrl();
      load();
      return;
    }
    const clearAll = event.target.closest('[data-clear-all]');
    if (clearAll) {
      state.q = '';
      state.filters = {};
      state.page = 1;
      searchInput.value = '';
      qsa('[data-filter]', root).forEach((select) => { select.value = ''; });
      syncUrl();
      load();
      return;
    }
    const row = event.target.closest('tr[data-href]');
    if (row && !event.target.closest('button, a')) {
      navigate(row.dataset.href.replace(/^#/, ''));
      return;
    }
    const pageButton = event.target.closest('[data-page]');
    if (pageButton && !pageButton.disabled) {
      state.page = Number(pageButton.dataset.page);
      syncUrl();
      load();
      return;
    }
    const sortButton = event.target.closest('[data-sort-field]');
    if (sortButton) {
      state.sort = sortButton.dataset.sortField;
      state.dir = sortButton.dataset.sortDirection === 'desc' ? 'desc' : 'asc';
      state.page = 1;
      syncUrl();
      load();
    }
  });

  tbody.addEventListener('keydown', (event) => {
    if (event.key !== 'Enter' && event.key !== ' ') return;
    const row = event.target.closest('tr[data-href]');
    if (!row) return;
    event.preventDefault();
    navigate(row.dataset.href.replace(/^#/, ''));
  });

  qs('[data-refresh]', root).addEventListener('click', (event) => {
    const button = event.currentTarget;
    setButtonLoading(button, true, 'Loadingâ€¦');
    load().finally(() => setButtonLoading(button, false));
  });

  qs('[data-export]', root).addEventListener('click', () => {
    if (!loaded || !rows.length) {
      toast({ type: 'warning', title: 'Nothing to export', message: 'Load some records first.' });
      return;
    }
    const csv = rowsCsv(entity, rows);
    const stamp = new Date().toISOString().slice(0, 10);
    downloadText(`${entity.name}-${stamp}.csv`, csv, 'text/csv');
    toast({ type: 'success', title: 'Export ready', message: `${rows.length} records downloaded as CSV.` });
  });

  if (createAllowed) {
    qs('[data-create]', root).addEventListener('click', () => {
      openCreateDialog(entity, {
        onCreated(created) {
          const key = {};
          for (const field of entity.key) key[field] = created[field] ?? '';
          const segment = entity.key.map((field) => encodeURIComponent(String(key[field] ?? ''))).join('~');
          navigate(`/object/${encodeURIComponent(entity.serviceId)}/${encodeURIComponent(entity.name)}/${segment}`);
        }
      });
    });
  }

  renderChips();
  await load();
}
