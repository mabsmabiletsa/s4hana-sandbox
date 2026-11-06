/** Tiny hash router. Routes are declared as #/path/segments?query=value. */

let handler = null;
let current = null;

export function parseHash(hash = window.location.hash) {
  const raw = String(hash || '').replace(/^#/, '');
  const [pathPart, queryPart = ''] = raw.split('?');
  const segments = pathPart.split('/').filter(Boolean).map((segment) => {
    try {
      return decodeURIComponent(segment);
    } catch (_) {
      return segment;
    }
  });
  const query = new URLSearchParams(queryPart);
  const [head, service, entity, key] = segments;

  if (!head || head === 'launchpad' || head === 'home') {
    return { name: 'launchpad', path: pathPart, segments, query };
  }
  if (head === 'list' && service && entity) {
    return { name: 'list', service, entity, path: pathPart, segments, query };
  }
  if (head === 'object' && service && entity && key !== undefined) {
    return { name: 'object', service, entity, keySegment: key, path: pathPart, segments, query };
  }
  if (head === 'explorer') {
    return {
      name: 'explorer',
      service: service || query.get('service') || '',
      entity: entity || query.get('entity') || '',
      path: pathPart,
      segments,
      query
    };
  }
  if (head === 'system') {
    return { name: 'system', path: pathPart, segments, query };
  }
  return { name: 'notfound', path: pathPart, segments, query };
}

export function currentPath() {
  return String(window.location.hash || '').replace(/^#/, '') || '/';
}

export function navigate(path, { replace = false, keepScroll = false } = {}) {
  const target = path.startsWith('#') ? path : `#${path.startsWith('/') ? path : '/' + path}`;
  if (replace) {
    const url = `${window.location.pathname}${window.location.search}${target}`;
    window.history.replaceState(null, '', url);
    dispatchRoute();
  } else if (window.location.hash === target.slice(1)) {
    dispatchRoute();
  } else {
    window.location.hash = target;
  }
  if (!keepScroll) {
    window.scrollTo({ top: 0, behavior: 'auto' });
  }
}

export function buildListPath(service, entity, query = {}) {
  const params = new URLSearchParams();
  for (const [key, value] of Object.entries(query)) {
    if (value !== undefined && value !== null && String(value) !== '') params.set(key, String(value));
  }
  const qs = params.toString();
  return `/list/${encodeURIComponent(service)}/${encodeURIComponent(entity)}${qs ? '?' + qs : ''}`;
}

export function buildObjectPath(service, entity, keySegment) {
  return `/object/${encodeURIComponent(service)}/${encodeURIComponent(entity)}/${keySegment}`;
}

export function buildExplorerPath(service = '', entity = '') {
  const params = new URLSearchParams();
  if (service) params.set('service', service);
  if (entity) params.set('entity', entity);
  const qs = params.toString();
  return `/explorer${qs ? '?' + qs : ''}`;
}

export function startRouter(callback) {
  handler = callback;
  window.addEventListener('hashchange', dispatchRoute);
  if (!window.location.hash) {
    window.history.replaceState(null, '', `${window.location.pathname}${window.location.search}#/`);
  }
  dispatchRoute();
}

export function stopRouter() {
  window.removeEventListener('hashchange', dispatchRoute);
  handler = null;
}

function dispatchRoute({ force = false } = {}) {
  if (!handler) return;
  const route = parseHash();
  const signature = `${route.name}|${route.service || ''}|${route.entity || ''}|${route.keySegment || ''}|${route.query.toString()}`;
  if (!force && current && current.signature === signature) {
    handler(route, { rerender: true });
    return;
  }
  current = { ...route, signature };
  handler(route, { rerender: false });
}

export function rerenderRoute() {
  dispatchRoute({ force: true });
}

export function getCurrentRoute() {
  return current;
}
