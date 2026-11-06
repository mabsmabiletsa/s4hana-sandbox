/** OData V2 + BFF client used by every page. */

const ODATA_ROOT = '/sap/opu/odata/sap';
const AUTH_STORAGE_KEY = 's4sandbox.basicAuth';

export class ApiError extends Error {
  constructor(message, options = {}) {
    super(message);
    this.name = 'ApiError';
    this.status = options.status || 0;
    this.code = options.code || String(options.status || '');
    this.details = options.details || null;
    this.url = options.url || '';
  }
}

/* -------------------------------------------------------------------------- */
/* Authentication helpers                                                     */
/* -------------------------------------------------------------------------- */

export function getAuthToken() {
  try {
    return window.localStorage.getItem(AUTH_STORAGE_KEY) || '';
  } catch (_) {
    return '';
  }
}

export function setAuth(user, password) {
  const token = window.btoa(`${user}:${password}`);
  window.localStorage.setItem(AUTH_STORAGE_KEY, token);
  return token;
}

export function setAuthToken(token) {
  if (token) window.localStorage.setItem(AUTH_STORAGE_KEY, token);
  else window.localStorage.removeItem(AUTH_STORAGE_KEY);
}

export function clearAuth() {
  window.localStorage.removeItem(AUTH_STORAGE_KEY);
}

function authHeaders(headers = {}) {
  const token = getAuthToken();
  if (!token) return headers;
  return { ...headers, Authorization: `Basic ${token}` };
}

/* -------------------------------------------------------------------------- */
/* Low-level request                                                          */
/* -------------------------------------------------------------------------- */

function parseJson(text) {
  if (!text) return null;
  try {
    return JSON.parse(text);
  } catch (_) {
    return null;
  }
}

function errorFromResponse(data, text, status) {
  const body = data && data.error;
  let message = '';
  let code = String(status);
  if (body) {
    message = typeof body.message === 'string' ? body.message : body.message?.value || '';
    code = body.code || code;
  }
  if (!message && text) message = text.slice(0, 400);
  if (!message) message = `Request failed with status ${status}.`;
  return { message, code, details: body || null };
}

async function request(path, options = {}) {
  const { method = 'GET', body, headers = {}, expect = 'json' } = options;
  const init = {
    method,
    headers: authHeaders({
      Accept: 'application/json',
      ...headers
    }),
    credentials: 'same-origin'
  };
  if (body !== undefined && body !== null) {
    init.headers['Content-Type'] = init.headers['Content-Type'] || 'application/json';
    init.body = typeof body === 'string' ? body : JSON.stringify(body);
  }
  let response;
  try {
    response = await fetch(path, init);
  } catch (error) {
    throw new ApiError('Could not reach the sandbox server. Is it still running?', {
      status: 0,
      code: 'NETWORK',
      url: path,
      details: error
    });
  }
  const text = await response.text();
  const data = parseJson(text);
  if (!response.ok) {
    const parsed = errorFromResponse(data, text, response.status);
    throw new ApiError(parsed.message, {
      status: response.status,
      code: parsed.code,
      details: parsed.details,
      url: path
    });
  }
  if (expect === 'text') return { text, data, response };
  return data;
}

/* -------------------------------------------------------------------------- */
/* BFF endpoints                                                              */
/* -------------------------------------------------------------------------- */

let catalogPromise = null;
let catalogValue = null;

export function indexCatalog(catalog) {
  const services = catalog.services || [];
  const serviceMap = {};
  const entities = {};
  const entityByName = {};
  for (const service of services) {
    serviceMap[service.id] = service;
    for (const entity of service.entities) {
      const enriched = {
        ...entity,
        serviceId: service.id,
        serviceLabel: service.label,
        group: service.group,
        serviceIcon: service.icon
      };
      entities[`${service.id}/${entity.name}`] = enriched;
      if (!entityByName[entity.name]) entityByName[entity.name] = enriched;
    }
  }
  return { services, serviceMap, entities, entityByName };
}

export async function loadCatalog() {
  if (catalogValue) return catalogValue;
  if (!catalogPromise) {
    catalogPromise = request('/api/catalog')
      .then((catalog) => {
        catalogValue = { catalog, index: indexCatalog(catalog) };
        return catalogValue;
      })
      .catch((error) => {
        catalogPromise = null;
        throw error;
      });
  }
  return catalogPromise;
}

export async function getMe() {
  return request('/api/me');
}

export async function getHealth() {
  return request('/api/health');
}

export async function getStats() {
  return request('/api/stats');
}

export async function search(term, limit = 5) {
  const query = new URLSearchParams({ q: term, limit: String(limit) });
  return request(`/api/search?${query.toString()}`);
}

export async function resetData() {
  return request('/api/reset', {
    method: 'POST',
    headers: { 'x-confirm-reset': 'reset' }
  });
}

/* -------------------------------------------------------------------------- */
/* OData helpers                                                              */
/* -------------------------------------------------------------------------- */

export function escapeODataString(value) {
  return String(value ?? '').replace(/'/g, "''");
}

export function keyPath(entity, key) {
  const keyFields = entity.key || [];
  const parts = keyFields.map((field) => `${field}='${escapeODataString(key[field])}'`);
  return `(${parts.join(',')})`;
}

export function entityUrl(serviceId, entityName, key, extraPath = '') {
  const base = `${ODATA_ROOT}/${serviceId}/${entityName}`;
  const keyPart = key ? keyPath({ key: Object.keys(key) }, key) : '';
  return `${base}${keyPart}${extraPath}`;
}

export function odataUrl(serviceId, path = '') {
  const cleaned = String(path || '').replace(/^\/+/, '');
  return `${ODATA_ROOT}/${serviceId}${cleaned ? '/' + cleaned : ''}`;
}

function buildParams(options = {}) {
  const params = new URLSearchParams();
  const mapping = {
    search: '$search',
    filter: '$filter',
    orderby: '$orderby',
    top: '$top',
    skip: '$skip',
    select: '$select',
    expand: '$expand'
  };
  for (const [key, param] of Object.entries(mapping)) {
    const value = options[key];
    if (value === undefined || value === null || value === '') continue;
    params.set(param, String(value));
  }
  if (options.count) params.set('$count', 'true');
  return params;
}

function collectionResult(body) {
  const payload = body?.d;
  if (Array.isArray(payload?.results)) {
    return {
      rows: payload.results,
      count: payload.__count !== undefined ? Number(payload.__count) : payload.results.length,
      raw: body
    };
  }
  if (Array.isArray(payload)) {
    return { rows: payload, count: payload.length, raw: body };
  }
  return { rows: [], count: 0, raw: body };
}

export async function odataCollection(serviceId, entityName, options = {}) {
  const params = buildParams(options);
  const query = params.toString();
  const url = `${ODATA_ROOT}/${serviceId}/${entityName}${query ? '?' + query : ''}`;
  const body = await request(url);
  return collectionResult(body);
}

export async function odataGet(serviceId, entityName, key, options = {}) {
  const entity = { key: Object.keys(key || {}) };
  const params = buildParams(options).toString();
  const url = `${ODATA_ROOT}/${serviceId}/${entityName}${keyPath(entity, key)}${params ? '?' + params : ''}`;
  const body = await request(url);
  return body?.d ?? null;
}

/** Fetches one navigation property for a parent key. */
export async function odataRelated(serviceId, entityName, key, nav, options = {}) {
  const entity = { key: Object.keys(key || {}) };
  const params = buildParams(options).toString();
  const url = `${ODATA_ROOT}/${serviceId}/${entityName}${keyPath(entity, key)}/${nav}${params ? '?' + params : ''}`;
  const body = await request(url);
  const payload = body?.d;
  if (payload && Array.isArray(payload.results)) {
    return { many: true, rows: payload.results, count: Number(payload.__count ?? payload.results.length) };
  }
  return { many: false, record: payload ?? null, rows: payload ? [payload] : [], count: payload ? 1 : 0 };
}

export async function odataCreate(serviceId, entityName, body) {
  return request(`${ODATA_ROOT}/${serviceId}/${entityName}`, {
    method: 'POST',
    body
  });
}

export async function odataUpdate(serviceId, entityName, key, body, replace = false) {
  const entity = { key: Object.keys(key || {}) };
  const url = `${ODATA_ROOT}/${serviceId}/${entityName}${keyPath(entity, key)}`;
  return request(url, { method: replace ? 'PUT' : 'PATCH', body, expect: 'text' });
}

export async function odataDelete(serviceId, entityName, key) {
  const entity = { key: Object.keys(key || {}) };
  const url = `${ODATA_ROOT}/${serviceId}/${entityName}${keyPath(entity, key)}`;
  return request(url, { method: 'DELETE', expect: 'text' });
}

export async function getMetadata(serviceId) {
  const result = await request(`${ODATA_ROOT}/${serviceId}/$metadata`, { expect: 'text' });
  return result.text;
}

/* -------------------------------------------------------------------------- */
/* Lookup (value help) support                                                */
/* -------------------------------------------------------------------------- */

const lookupCache = new Map();

export async function lookupOptions(lookup, searchTerm = '') {
  if (!lookup) return [];
  const cacheKey = `${lookup.service}/${lookup.entity}/${lookup.key}/${lookup.label || ''}`;
  let promise = lookupCache.get(cacheKey);
  if (!promise) {
    promise = odataCollection(lookup.service, lookup.entity, {
      select: [lookup.key, lookup.label && lookup.label !== lookup.key ? lookup.label : null]
        .filter(Boolean)
        .join(','),
      orderby: `${lookup.key} asc`,
      top: 500
    })
      .then(({ rows }) => rows.map((row) => ({
        value: String(row[lookup.key] ?? ''),
        label: lookup.label && lookup.label !== lookup.key
          ? `${row[lookup.key]} – ${row[lookup.label] ?? ''}`
          : String(row[lookup.key] ?? '')
      })))
      .catch((error) => {
        lookupCache.delete(cacheKey);
        throw error;
      });
    lookupCache.set(cacheKey, promise);
  }
  const options = await promise;
  const needle = String(searchTerm || '').trim().toLowerCase();
  if (!needle) return options;
  return options.filter((option) =>
    option.label.toLowerCase().includes(needle) || option.value.toLowerCase().includes(needle)
  );
}

export function clearLookupCache() {
  lookupCache.clear();
}

/* -------------------------------------------------------------------------- */
/* Raw request for the API explorer                                           */
/* -------------------------------------------------------------------------- */

export async function rawRequest(url, { method = 'GET', body, headers = {} } = {}) {
  const init = {
    method,
    headers: authHeaders({ Accept: 'application/json, text/plain, */*', ...headers }),
    credentials: 'same-origin'
  };
  if (body !== undefined && body !== null && body !== '') {
    init.headers['Content-Type'] = init.headers['Content-Type'] || 'application/json';
    init.body = body;
  }
  const started = performance.now();
  let response;
  try {
    response = await fetch(url, init);
  } catch (error) {
    return {
      ok: false,
      status: 0,
      statusText: 'Network error',
      headers: {},
      text: error.message,
      data: null,
      durationMs: Math.round(performance.now() - started),
      url
    };
  }
  const text = await response.text();
  const responseHeaders = {};
  response.headers.forEach((value, key) => {
    responseHeaders[key] = value;
  });
  return {
    ok: response.ok,
    status: response.status,
    statusText: response.statusText,
    headers: responseHeaders,
    text,
    data: parseJson(text),
    durationMs: Math.round(performance.now() - started),
    url
  };
}

export { ODATA_ROOT };
