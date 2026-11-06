/** Reusable render helpers shared by list, object and launchpad pages. */

import { icon } from './icons.js';
import {
  esc,
  formatDate,
  formatNumber,
  formatValue,
  isBlank,
  isCodeField,
  statusOf,
  encodeKey
} from './format.js';
import { buildObjectPath } from './router.js';

export function fieldOf(entity, name) {
  return (entity.fields || []).find((field) => field.name === name) || null;
}

export function columnsFor(entity) {
  const configured = (entity.ui && entity.ui.list) || [];
  const names = configured.length
    ? configured
    : [...entity.key, ...entity.fields.map((field) => field.name)].slice(0, 6);
  return names.map((name) => fieldOf(entity, name)).filter(Boolean);
}

export function keyValues(entity, record) {
  return Object.fromEntries((entity.key || []).map((field) => [field, record?.[field]]));
}

export function keySegment(entity, record) {
  return encodeKey((entity.key || []).map((field) => record?.[field]));
}

export function objectHref(entity, record) {
  if (!entity || !record) return '#/';
  return `#${buildObjectPath(entity.serviceId, entity.name, keySegment(entity, record))}`;
}

export function entityHref(serviceId, entityName) {
  return `#/list/${encodeURIComponent(serviceId)}/${encodeURIComponent(entityName)}`;
}

export function listHref(entity, query) {
  const params = new URLSearchParams();
  for (const [key, value] of Object.entries(query || {})) {
    if (value !== undefined && value !== null && value !== '') params.set(key, String(value));
  }
  const qs = params.toString();
  return `#/list/${encodeURIComponent(entity.serviceId)}/${encodeURIComponent(entity.name)}${qs ? '?' + qs : ''}`;
}

export function isStatusField(field) {
  if (!field) return false;
  if (field.type === 'Edm.Boolean') return true;
  if (field.options && field.options.length) return true;
  return /Status|IsBlocked|IsCancelled|IsMarkedForDeletion|IsDefault/.test(field.name);
}

/** Table cell renderer: badges for status/option values, numbers, dates. */
export function renderCell(value, field, { compact = false } = {}) {
  if (isBlank(value)) return '<span class="muted">—</span>';
  if (field && isStatusField(field)) {
    const status = statusOf(value, field);
    if (status) {
      if (compact) return `<span class="badge badge--${esc(status.tone)}">${esc(status.label)}</span>`;
      return `<span class="badge badge--${esc(status.tone)}">${esc(status.label)}</span>`;
    }
  }
  if (field?.type === 'Edm.Date') return esc(formatDate(value));
  if (field?.type === 'Edm.Decimal') {
    return `<span class="num">${esc(formatNumber(value))}</span>`;
  }
  if (field && isCodeField(field)) {
    return `<span class="cell-mono">${esc(value)}</span>`;
  }
  const text = formatValue(value, field);
  const title = String(text).length > 42 ? ` title="${esc(text)}"` : '';
  return `<span${title}>${esc(text)}</span>`;
}

export function cellClass(field) {
  if (!field) return '';
  const classes = [];
  if (field.type === 'Edm.Decimal') classes.push('num');
  if (field.key) classes.push('cell-key');
  return classes.join(' ');
}

export function sortHeader(entity, field, sort, direction) {
  const active = sort === field.name;
  const nextDirection = active && direction === 'asc' ? 'desc' : 'asc';
  return `
    <th class="sortable${active ? ' is-sorted' : ''}" scope="col"
        data-sort-field="${esc(field.name)}" data-sort-direction="${active ? nextDirection : 'asc'}"
        aria-sort="${active ? (direction === 'asc' ? 'ascending' : 'descending') : 'none'}"
        title="Sort by ${esc(field.label)}">
      <span class="th-inner">${esc(field.label)}${icon(active ? (direction === 'asc' ? 'chevron-up' : 'chevron-down') : 'arrow-up-down', 12)}</span>
    </th>`;
}

export function detailValue(value, field) {
  if (isBlank(value)) return '<span class="detail__value detail__value--empty">—</span>';
  if (field?.type === 'Edm.Boolean') {
    const status = statusOf(value, field);
    return status
      ? `<span class="badge badge--${esc(status.tone)}">${esc(status.label)}</span>`
      : esc(String(value));
  }
  const badgeWorthy = field && /Status|IsBlocked|IsCancelled|IsMarkedForDeletion/.test(field.name);
  if (badgeWorthy) {
    const status = statusOf(value, field);
    if (status) return `<span class="badge badge--${esc(status.tone)}">${esc(status.label)}</span>`;
  }
  const text = field?.type === 'Edm.Date' ? formatDate(value) : formatValue(value, field);
  const mono = field && isCodeField(field) ? ' detail__value--mono' : '';
  return `<span class="detail__value${mono}">${esc(text)}</span>`;
}

export function statusBadges(record, entity) {
  const fields = (entity.ui?.headerStatus || []).map((name) => fieldOf(entity, name)).filter(Boolean);
  return fields
    .map((field) => {
      const value = record[field.name];
      if (isBlank(value)) return '';
      if (field.type === 'Edm.Boolean') {
        const status = statusOf(value, field);
        return status ? `<span class="badge badge--${esc(status.tone)}">${esc(status.label)}</span>` : '';
      }
      const status = statusOf(value, field);
      if (!status) return '';
      return `<span class="badge badge--${esc(status.tone)}">${esc(status.label)}</span>`;
    })
    .join('');
}

export function entityName(entity) {
  return entity?.singular || entity?.label || entity?.name || 'Record';
}

export function recordTitle(entity, record) {
  const fieldName = entity.ui?.title;
  if (fieldName && !isBlank(record?.[fieldName])) return String(record[fieldName]);
  const key = (entity.key || []).map((name) => record?.[name]).filter((value) => !isBlank(value));
  return key.join(' / ') || entityName(entity);
}

export function recordSubtitle(entity, record) {
  const fieldName = entity.ui?.subtitle;
  if (fieldName && !isBlank(record?.[fieldName])) return String(record[fieldName]);
  const key = (entity.key || []).map((name) => record?.[name]).filter((value) => !isBlank(value));
  return `${entityName(entity)} · ${key.join(' / ')}`;
}
