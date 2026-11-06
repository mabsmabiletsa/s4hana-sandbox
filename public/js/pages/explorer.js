/** Interactive OData API explorer. */

import { icon } from '../icons.js';
import { esc, formatInteger, encodeKey } from '../format.js';
import { entityHref } from '../components.js';
import { buildExplorerPath, buildObjectPath, buildListPath } from '../router.js';
import { ODATA_ROOT, rawRequest } from '../api.js';
import { copyText, downloadText, qs, qsa, setButtonLoading, toast } from '../ui.js';

function highlightJson(json) {
  const pattern = /("(?:\\u[a-fA-F0-9]{4}|\\[^u]|[^\\"])*"\s*:|"(?:\\u[a-fA-F0-9]{4}|\\[^u]|[^\\"])*"|\b(?:true|false|null)\b|-?\d+(?:\.\d+)?(?:[eE][+\-]?\d+)?)/g;
  let result = '';
  let last = 0;
  for (const match of json.matchAll(pattern)) {
    result += esc(json.slice(last, match.index));
    const token = match[0];
    let cls = 'json-number';
    if (token.startsWith('"')) cls = /:\s*$/.test(token) ? 'json-key' : 'json-string';
    else if (token === 'true' || token === 'false') cls = 'json-bool';
    else if (token === 'null') cls = 'json-null';
    result += `<span class="${cls}">${esc(token)}</span>`;
    last = match.index + token.length;
  }
  result += esc(json.slice(last));
  return result;
}

function requestSamples(entity) {
  return [
    { label: 'Top 5 + count', patch: { top: '5', count: true, path: entity } },
    { label: 'Count only', patch: { path: `${entity}/$count`, top: '', count: false } }
  ];
}

function openRecordLink(serviceId, entity, data) {
  const record = data?.d;
  if (!record || Array.isArray(record.results) || !record[entity.key[0]]) return null;
  const values = entity.key.map((name) => record[name]);
  return `#${buildObjectPath(serviceId, entity.name, encodeKey(values))}`;
}

export async function renderExplorer(root, ctx, route) {
  const services = ctx.index.services;
  if (!services.length) {
    root.innerHTML = `<div class="empty">No services are registered.</div>`;
    return;
  }

  const serviceId = route.service && ctx.index.serviceMap[route.service]
    ? route.service
    : services[0].id;
  const service = ctx.index.serviceMap[serviceId];
  const entityName = route.entity && service.entities.some((item) => item.name === route.entity)
    ? route.entity
    : service.entities[0]?.name;
  const entity = service.entities.find((item) => item.name === entityName) || service.entities[0];
  if (!entity) {
    root.innerHTML = `<div class="empty">Service ${esc(serviceId)} has no entity sets.</div>`;
    return;
  }

  const navHtml = services
    .map(
      (item) => `
        <div class="explorer-nav__service">${esc(item.label)}</div>
        ${item.entities
          .map(
            (entry) => `
              <a class="explorer-nav__link${entry.name === entity.name && item.id === service.id ? ' is-active' : ''}"
                 href="#${esc(buildExplorerPath(item.id, entry.name))}">
                ${icon(entry.ui?.icon || item.icon || 'list', 14)} ${esc(entry.label)}
              </a>`
          )
          .join('')}`
    )
    .join('');

  const sampleButtons = requestSamples(entity.name)
    .map((sample) => `<button class="btn btn--ghost btn--sm" type="button" data-sample="${esc(sample.label)}">${esc(sample.label)}</button>`)
    .join('');

  root.innerHTML = `
    <div class="page-head">
      <div>
        <h1 class="page-head__title">API Explorer</h1>
        <div class="page-head__subtitle">Send OData V2 requests against the sandbox and inspect the raw responses.</div>
      </div>
      <div class="page-head__actions">
        <a class="btn btn--ghost" href="${ODATA_ROOT}/${esc(serviceId)}/$metadata" target="_blank" rel="noopener">${icon('file-text', 15)} $metadata</a>
        <a class="btn" href="${entityHref(serviceId, entity.name)}">${icon('external-link', 15)} Open list</a>
      </div>
    </div>

    <div class="explorer">
      <aside class="explorer-nav card">${navHtml}</aside>
      <div class="explorer-main">
        <div class="card">
          <div class="card__head">
            <div>
              <div class="card__title">${esc(service.label)}</div>
              <div class="card__sub">${esc(entity.description || entity.label)}</div>
            </div>
            <span class="badge badge--outline mono">${esc(entity.name)}</span>
          </div>
          <div class="card__body">
            <div class="request-row">
              <select class="select" data-method aria-label="HTTP method">
                <option>GET</option>
                <option>POST</option>
                <option>PATCH</option>
                <option>PUT</option>
                <option>DELETE</option>
              </select>
              <input class="input" data-path value="${esc(entity.name)}" spellcheck="false" aria-label="Resource path">
            </div>
            <div class="url-preview"><strong data-url-method>GET</strong><span data-url-preview></span></div>

            <div class="request-grid" style="margin-top:14px">
              <div class="form-field">
                <label class="form-field__label" for="qp-filter">$filter</label>
                <input class="input" id="qp-filter" data-qp="filter" placeholder="DeliveryStatus eq 'A'" spellcheck="false">
              </div>
              <div class="form-field">
                <label class="form-field__label" for="qp-select">$select</label>
                <input class="input" id="qp-select" data-qp="select" placeholder="SalesOrder,SoldToPartyName" spellcheck="false">
              </div>
              <div class="form-field">
                <label class="form-field__label" for="qp-orderby">$orderby</label>
                <input class="input" id="qp-orderby" data-qp="orderby" placeholder="CreationDate desc" spellcheck="false">
              </div>
              <div class="form-field">
                <label class="form-field__label" for="qp-expand">$expand</label>
                <input class="input" id="qp-expand" data-qp="expand" placeholder="to_Items" spellcheck="false">
              </div>
              <div class="form-field">
                <label class="form-field__label" for="qp-top">$top</label>
                <input class="input" id="qp-top" data-qp="top" placeholder="10" inputmode="numeric" spellcheck="false">
              </div>
              <div class="form-field">
                <label class="form-field__label" for="qp-skip">$skip</label>
                <input class="input" id="qp-skip" data-qp="skip" placeholder="0" inputmode="numeric" spellcheck="false">
              </div>
            </div>

            <div style="display:flex;flex-wrap:wrap;align-items:center;gap:14px;margin-top:12px">
              <label class="checkbox"><input type="checkbox" data-count> $count=true</label>
              <span class="explorer-hint">Use <code>(${entity.key.map((name) => `${name}='â€¦'`).join(',')})</code> after the entity set to address one record.</span>
            </div>

            <div data-body-wrap hidden style="margin-top:12px">
              <div class="form-field">
                <label class="form-field__label" for="request-body">Request body (JSON)</label>
                <textarea class="textarea" id="request-body" data-body spellcheck="false" placeholder='{ "SoldToParty": "1000001", "to_Items": [ { "Material": "FG-1001", "RequestedQuantity": 1 } ] }'></textarea>
              </div>
            </div>

            <div style="display:flex;flex-wrap:wrap;align-items:center;gap:8px;margin-top:16px">
              <button class="btn btn--primary" type="button" data-send>${icon('play', 15)} Send Request</button>
              <button class="btn btn--ghost" type="button" data-reset>${icon('reset', 14)} Reset</button>
              <span class="toolbar__grow"></span>
              <span class="explorer-hint">${formatInteger(service.entities.length)} entity set(s) in service</span>
            </div>

            <div style="display:flex;flex-wrap:wrap;align-items:center;gap:8px;margin-top:12px;padding-top:12px;border-top:1px solid var(--border)">
              <span class="explorer-hint">Presets:</span>
              ${sampleButtons}
            </div>
          </div>
        </div>

        <div class="card" data-response-card>
          <div class="response-head">
            <span class="response-status" data-status>Not sent</span>
            <span class="response-meta" data-response-meta></span>
            <span class="toolbar__grow"></span>
            <div class="explorer-actions">
              <button class="btn btn--ghost btn--sm" type="button" data-open-ui hidden>${icon('external-link', 13)} Open record</button>
              <button class="btn btn--ghost btn--sm" type="button" data-copy-url>${icon('copy', 13)} Copy URL</button>
              <button class="btn btn--ghost btn--sm" type="button" data-copy-response disabled>${icon('copy', 13)} Copy</button>
              <button class="btn btn--ghost btn--sm" type="button" data-download-response disabled>${icon('download', 13)} Download</button>
            </div>
          </div>
          <div class="response-body is-empty" data-response>Send a request to see the response.</div>
          <div data-headers-wrap hidden style="border-top:1px solid var(--border)">
            <div class="card__head" style="padding:10px 16px">
              <div class="card__title" style="font-size:12px">Response headers</div>
            </div>
            <div class="card__body" style="padding:0">
              <pre class="response-body" data-headers style="max-height:220px;background:var(--surface-2);color:var(--text-2)"></pre>
            </div>
          </div>
        </div>
      </div>
    </div>`;

  const methodSelect = qs('[data-method]', root);
  const pathInput = qs('[data-path]', root);
  const urlPreview = qs('[data-url-preview]', root);
  const urlMethod = qs('[data-url-method]', root);
  const countCheckbox = qs('[data-count]', root);
  const bodyWrap = qs('[data-body-wrap]', root);
  const bodyInput = qs('[data-body]', root);
  const sendButton = qs('[data-send]', root);
  const responseEl = qs('[data-response]', root);
  const statusEl = qs('[data-status]', root);
  const metaEl = qs('[data-response-meta]', root);
  const headersWrap = qs('[data-headers-wrap]', root);
  const headersEl = qs('[data-headers]', root);
  const openUi = qs('[data-open-ui]', root);
  const copyResponse = qs('[data-copy-response]', root);
  const downloadResponse = qs('[data-download-response]', root);
  let lastResponse = null;

  function currentPath() {
    return pathInput.value.trim().replace(/^\/+/, '');
  }

  function queryParams() {
    const params = new URLSearchParams();
    for (const input of qsa('[data-qp]', root)) {
      const value = input.value.trim();
      if (value) params.set(`$${input.dataset.qp}`, value);
    }
    if (countCheckbox.checked) params.set('$count', 'true');
    return params;
  }

  function buildUrl() {
    const params = queryParams().toString();
    return `${ODATA_ROOT}/${serviceId}/${currentPath()}${params ? '?' + params : ''}`;
  }

  function updatePreview() {
    urlMethod.textContent = methodSelect.value;
    urlPreview.textContent = buildUrl();
    bodyWrap.hidden = methodSelect.value === 'GET' || methodSelect.value === 'DELETE';
  }

  function resetForm() {
    methodSelect.value = 'GET';
    pathInput.value = entity.name;
    qsa('[data-qp]', root).forEach((input) => { input.value = ''; });
    countCheckbox.checked = false;
    bodyInput.value = '';
    updatePreview();
  }

  function setResponse(result) {
    lastResponse = result;
    const ok = result.status >= 200 && result.status < 300;
    statusEl.textContent = result.status === 0 ? 'Network error' : `${result.status} ${result.statusText}`;
    statusEl.classList.toggle('is-error', !ok);
    metaEl.innerHTML = `
      <span>${formatInteger(result.durationMs)} ms</span>
      <span>${new Blob([result.text || '']).size.toLocaleString('en-US')} bytes</span>
      <span class="mono">${esc(result.url)}</span>`;
    if (result.data !== null && result.data !== undefined) {
      responseEl.innerHTML = highlightJson(JSON.stringify(result.data, null, 2));
      responseEl.classList.remove('is-empty');
    } else if (result.text) {
      responseEl.textContent = result.text;
      responseEl.classList.remove('is-empty');
    } else {
      responseEl.textContent = result.status === 204 ? '204 No Content' : '(empty response body)';
      responseEl.classList.add('is-empty');
    }
    headersEl.textContent = Object.entries(result.headers)
      .map(([key, value]) => `${key}: ${value}`)
      .join('\n') || '(no headers)';
    headersWrap.hidden = false;
    copyResponse.disabled = false;
    downloadResponse.disabled = false;

    const recordHref = ok && methodSelect.value === 'GET'
      ? openRecordLink(serviceId, entity, result.data)
      : null;
    if (recordHref) {
      openUi.hidden = false;
      openUi.dataset.href = recordHref;
    } else {
      openUi.hidden = true;
      openUi.dataset.href = '';
    }
  }

  async function send() {
    updatePreview();
    const url = buildUrl();
    setButtonLoading(sendButton, true, 'Sendingâ€¦');
    statusEl.textContent = 'Sendingâ€¦';
    statusEl.classList.remove('is-error');
    metaEl.textContent = '';
    try {
      const result = await rawRequest(url, {
        method: methodSelect.value,
        body: methodSelect.value === 'GET' || methodSelect.value === 'DELETE' ? undefined : bodyInput.value
      });
      setResponse(result);
      if (!result.ok) {
        toast({
          type: 'warning',
          title: `HTTP ${result.status || 'network error'}`,
          message: result.data?.error?.message?.value || result.data?.error?.message || result.statusText || 'Request failed.'
        });
      }
    } finally {
      setButtonLoading(sendButton, false);
    }
  }

  methodSelect.addEventListener('change', updatePreview);
  pathInput.addEventListener('input', updatePreview);
  qsa('[data-qp]', root).forEach((input) => input.addEventListener('input', updatePreview));
  countCheckbox.addEventListener('change', updatePreview);

  sendButton.addEventListener('click', send);
  qs('[data-reset]', root).addEventListener('click', resetForm);

  qs('[data-copy-url]', root).addEventListener('click', async () => {
    const ok = await copyText(buildUrl());
    toast({ type: ok ? 'success' : 'error', title: ok ? 'URL copied' : 'Copy failed', message: buildUrl() });
  });

  copyResponse.addEventListener('click', async () => {
    if (!lastResponse) return;
    const text = lastResponse.data ? JSON.stringify(lastResponse.data, null, 2) : lastResponse.text;
    const ok = await copyText(text);
    toast({ type: ok ? 'success' : 'error', title: ok ? 'Response copied' : 'Copy failed' });
  });

  downloadResponse.addEventListener('click', () => {
    if (!lastResponse) return;
    const isJson = lastResponse.data !== null && lastResponse.data !== undefined;
    const text = isJson ? JSON.stringify(lastResponse.data, null, 2) : lastResponse.text;
    downloadText(`odata-response-${Date.now()}.${isJson ? 'json' : 'txt'}`, text, isJson ? 'application/json' : 'text/plain');
  });

  openUi.addEventListener('click', () => {
    if (openUi.dataset.href) window.location.hash = openUi.dataset.href;
  });

  qsa('[data-sample]', root).forEach((button) => {
    button.addEventListener('click', () => {
      const sample = requestSamples(entity.name).find((item) => item.label === button.dataset.sample);
      if (!sample) return;
      pathInput.value = sample.patch.path;
      qs('[data-qp="top"]', root).value = sample.patch.top;
      countCheckbox.checked = sample.patch.count;
      if (sample.label.startsWith('Count')) {
        qsa('[data-qp]', root).forEach((input) => { if (input.dataset.qp !== 'top') input.value = ''; });
      }
      updatePreview();
    });
  });

  // Initial sample request.
  qs('[data-qp="top"]', root).value = '5';
  countCheckbox.checked = true;
  updatePreview();
  await send();
}
