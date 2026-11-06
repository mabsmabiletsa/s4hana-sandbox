/** Shared UI primitives: badges, dialogs, toasts, states and small helpers. */

import { icon } from './icons.js';
import { esc } from './format.js';

export function qs(selector, root = document) {
  return root.querySelector(selector);
}

export function qsa(selector, root = document) {
  return Array.from(root.querySelectorAll(selector));
}

export function debounce(fn, wait = 250) {
  let timer = null;
  const debounced = (...args) => {
    window.clearTimeout(timer);
    timer = window.setTimeout(() => fn(...args), wait);
  };
  debounced.cancel = () => window.clearTimeout(timer);
  return debounced;
}

export function clearNode(node) {
  while (node && node.firstChild) node.removeChild(node.firstChild);
}

/* -------------------------------------------------------------------------- */
/* Badges & states                                                            */
/* -------------------------------------------------------------------------- */

export function badge(label, tone = 'neutral', withDot = false) {
  return `<span class="badge badge--${esc(tone)}">${withDot ? '<span class="badge__dot"></span>' : ''}${esc(label)}</span>`;
}

export function loadingBlock(label = 'Loading…', compact = false) {
  return `<div class="loading"${compact ? ' style="padding:24px 12px"' : ''}><span class="spinner" role="status" aria-label="${esc(label)}"></span><span>${esc(label)}</span></div>`;
}

export function emptyStateHtml({ iconName = 'search', title = 'Nothing found', text = '', action = '' } = {}) {
  return `
    <div class="empty">
      <div class="empty__icon">${icon(iconName, 24)}</div>
      <div class="empty__title">${esc(title)}</div>
      ${text ? `<div class="empty__text">${esc(text)}</div>` : ''}
      ${action || ''}
    </div>`;
}

export function errorStateHtml(message, { title = 'Something went wrong', retry = true } = {}) {
  return `
    <div class="error-box">
      <div class="error-box__icon">${icon('alert', 24)}</div>
      <div class="error-box__title">${esc(title)}</div>
      <div class="error-box__text">${esc(message || 'Unknown error')}</div>
      ${retry ? `<button class="btn btn--sm" type="button" data-retry>${icon('refresh', 14)} Try again</button>` : ''}
    </div>`;
}

export function skeletonRows(columns = 5, rows = 8) {
  let html = '';
  for (let r = 0; r < rows; r += 1) {
    html += '<tr>';
    for (let c = 0; c < columns; c += 1) {
      const width = 45 + ((r * 7 + c * 13) % 45);
      html += `<td><span class="skeleton" style="display:block;height:12px;width:${width}%"></span></td>`;
    }
    html += '</tr>';
  }
  return html;
}

export function setButtonLoading(button, busy, busyLabel = 'Working…') {
  if (!button) return;
  if (busy) {
    if (!button.dataset.originalHtml) button.dataset.originalHtml = button.innerHTML;
    button.disabled = true;
    button.innerHTML = `<span class="spinner spinner--sm"></span>${esc(busyLabel)}`;
  } else {
    button.disabled = false;
    if (button.dataset.originalHtml) {
      button.innerHTML = button.dataset.originalHtml;
      delete button.dataset.originalHtml;
    }
  }
}

/* -------------------------------------------------------------------------- */
/* Toasts                                                                     */
/* -------------------------------------------------------------------------- */

const TOAST_ICONS = {
  success: 'check-circle',
  error: 'alert',
  warning: 'alert',
  info: 'info'
};

export function toast({ title, message = '', type = 'info', duration = 4200 } = {}) {
  const root = qs('#toasts');
  if (!root) return null;
  const node = document.createElement('div');
  node.className = `toast toast--${type}`;
  node.setAttribute('role', type === 'error' ? 'alert' : 'status');
  node.innerHTML = `
    <span class="toast__icon">${icon(TOAST_ICONS[type] || 'info', 18)}</span>
    <div class="toast__body">
      <div class="toast__title">${esc(title || '')}</div>
      ${message ? `<div class="toast__msg">${esc(message)}</div>` : ''}
    </div>
    <button class="toast__close" type="button" aria-label="Dismiss notification">${icon('x', 14)}</button>`;
  const remove = () => {
    node.style.opacity = '0';
    node.style.transform = 'translateY(6px)';
    window.setTimeout(() => node.remove(), 180);
  };
  node.querySelector('.toast__close').addEventListener('click', remove);
  root.appendChild(node);
  if (duration > 0) window.setTimeout(remove, duration);
  return { close: remove, node };
}

/* -------------------------------------------------------------------------- */
/* Modal dialogs                                                              */
/* -------------------------------------------------------------------------- */

let openModalCount = 0;

export function openModal({
  title,
  subtitle = '',
  body = '',
  footer = '',
  wide = false,
  small = false,
  closable = true,
  onMount,
  onClose
} = {}) {
  const root = qs('#modal-root');
  const previouslyFocused = document.activeElement;
  const overlay = document.createElement('div');
  overlay.className = 'overlay';
  overlay.innerHTML = `
    <div class="dialog${wide ? ' dialog--wide' : ''}${small ? ' dialog--sm' : ''}" role="dialog" aria-modal="true" aria-labelledby="dialog-title">
      <div class="dialog__head">
        <div>
          <div class="dialog__title" id="dialog-title">${esc(title || '')}</div>
          ${subtitle ? `<div class="dialog__sub">${esc(subtitle)}</div>` : ''}
        </div>
        ${closable ? `<button class="icon-btn" type="button" data-modal-close aria-label="Close dialog">${icon('x', 18)}</button>` : ''}
      </div>
      <div class="dialog__body" data-modal-body>${body}</div>
      ${footer ? `<div class="dialog__foot" data-modal-foot>${footer}</div>` : ''}
    </div>`;
  const dialog = overlay.querySelector('.dialog');
  const bodyEl = overlay.querySelector('[data-modal-body]');

  const close = (result) => {
    if (!overlay.isConnected) return;
    document.removeEventListener('keydown', onKeydown);
    overlay.remove();
    openModalCount = Math.max(0, openModalCount - 1);
    if (!openModalCount) document.body.style.overflow = '';
    if (previouslyFocused && typeof previouslyFocused.focus === 'function') {
      previouslyFocused.focus({ preventScroll: true });
    }
    if (typeof onClose === 'function') onClose(result);
  };

  const focusables = () =>
    qsa(
      'button:not([disabled]), [href], input:not([disabled]), select:not([disabled]), textarea:not([disabled]), [tabindex]:not([tabindex="-1"])',
      dialog
    ).filter((node) => node.offsetParent !== null);

  function onKeydown(event) {
    if (event.key === 'Escape' && closable) {
      event.stopPropagation();
      close();
      return;
    }
    if (event.key !== 'Tab') return;
    const items = focusables();
    if (!items.length) return;
    const first = items[0];
    const last = items[items.length - 1];
    if (event.shiftKey && document.activeElement === first) {
      event.preventDefault();
      last.focus();
    } else if (!event.shiftKey && document.activeElement === last) {
      event.preventDefault();
      first.focus();
    }
  }

  overlay.addEventListener('mousedown', (event) => {
    if (event.target === overlay && closable) close();
  });
  overlay.addEventListener('click', (event) => {
    if (event.target.closest('[data-modal-close]')) close();
  });
  document.addEventListener('keydown', onKeydown);
  document.body.style.overflow = 'hidden';
  openModalCount += 1;
  root.appendChild(overlay);

  const api = { overlay, dialog, body: bodyEl, close, setBody: (html) => { bodyEl.innerHTML = html; } };
  if (typeof onMount === 'function') onMount(api);
  window.setTimeout(() => {
    const auto = dialog.querySelector('[data-autofocus]');
    if (auto) {
      auto.focus({ preventScroll: true });
      return;
    }
    const firstInput = dialog.querySelector('input, select, textarea');
    if (firstInput) firstInput.focus({ preventScroll: true });
    else dialog.querySelector('[data-modal-close]')?.focus({ preventScroll: true });
  }, 30);

  return api;
}

export function confirmDialog({
  title = 'Are you sure?',
  message = '',
  confirmLabel = 'Confirm',
  cancelLabel = 'Cancel',
  danger = false
} = {}) {
  return new Promise((resolve) => {
    let settled = false;
    const finish = (value) => {
      if (settled) return;
      settled = true;
      resolve(value);
    };
    const modal = openModal({
      title,
      small: true,
      body: `<p class="confirm-text">${message}</p>`,
      footer: `
        <button class="btn" type="button" data-cancel>${esc(cancelLabel)}</button>
        <button class="btn ${danger ? 'btn--danger' : 'btn--primary'}" type="button" data-confirm ${danger ? 'data-autofocus' : ''}>${esc(confirmLabel)}</button>`,
      onMount({ dialog, close }) {
        dialog.querySelector('[data-cancel]').addEventListener('click', () => {
          finish(false);
          close();
        });
        dialog.querySelector('[data-confirm]').addEventListener('click', () => {
          finish(true);
          close();
        });
      },
      onClose() {
        finish(false);
      }
    });
    return modal;
  });
}

/* -------------------------------------------------------------------------- */
/* Small utilities                                                            */
/* -------------------------------------------------------------------------- */

export async function copyText(text) {
  try {
    if (navigator.clipboard && window.isSecureContext) {
      await navigator.clipboard.writeText(text);
      return true;
    }
  } catch (_) {
    /* fall through to legacy path */
  }
  try {
    const area = document.createElement('textarea');
    area.value = text;
    area.style.position = 'fixed';
    area.style.opacity = '0';
    document.body.appendChild(area);
    area.select();
    const ok = document.execCommand('copy');
    area.remove();
    return ok;
  } catch (_) {
    return false;
  }
}

export function downloadText(filename, text, type = 'application/json') {
  const blob = new Blob([text], { type });
  const url = URL.createObjectURL(blob);
  const anchor = document.createElement('a');
  anchor.href = url;
  anchor.download = filename;
  document.body.appendChild(anchor);
  anchor.click();
  anchor.remove();
  window.setTimeout(() => URL.revokeObjectURL(url), 1000);
}

export function formatBytes(bytes) {
  const value = Number(bytes);
  if (!Number.isFinite(value)) return '—';
  if (value < 1024) return `${value} B`;
  if (value < 1024 * 1024) return `${(value / 1024).toFixed(1)} KB`;
  return `${(value / (1024 * 1024)).toFixed(1)} MB`;
}

export function timeAgo(dateValue) {
  const date = dateValue instanceof Date ? dateValue : new Date(dateValue);
  if (Number.isNaN(date.getTime())) return '—';
  const seconds = Math.round((Date.now() - date.getTime()) / 1000);
  if (seconds < 60) return 'just now';
  if (seconds < 3600) return `${Math.floor(seconds / 60)} min ago`;
  if (seconds < 86400) return `${Math.floor(seconds / 3600)} h ago`;
  return `${Math.floor(seconds / 86400)} d ago`;
}

export function scrollToTop() {
  window.scrollTo({ top: 0, behavior: 'auto' });
}
