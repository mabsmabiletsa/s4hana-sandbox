/** Formatting, status and key helper functions shared by all pages. */

const numberFormatter = new Intl.NumberFormat('en-US', {
  minimumFractionDigits: 0,
  maximumFractionDigits: 2
});

const integerFormatter = new Intl.NumberFormat('en-US', {
  maximumFractionDigits: 0
});

const dateFormatter = new Intl.DateTimeFormat('en-GB', {
  day: '2-digit',
  month: 'short',
  year: 'numeric'
});

const dateTimeFormatter = new Intl.DateTimeFormat('en-GB', {
  day: '2-digit',
  month: 'short',
  year: 'numeric',
  hour: '2-digit',
  minute: '2-digit'
});

export function esc(value) {
  return String(value ?? '')
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
    .replace(/'/g, '&#39;');
}

export function isBlank(value) {
  return value === null || value === undefined || value === '';
}

export function formatNumber(value) {
  const numeric = Number(value);
  if (!Number.isFinite(numeric)) return isBlank(value) ? '—' : String(value);
  return numberFormatter.format(numeric);
}

export function formatInteger(value) {
  const numeric = Number(value);
  if (!Number.isFinite(numeric)) return '—';
  return integerFormatter.format(numeric);
}

export function formatCurrency(value, currency) {
  const numeric = Number(value);
  if (!Number.isFinite(numeric)) return '—';
  if (!currency) return formatNumber(numeric);
  try {
    return new Intl.NumberFormat('en-US', {
      style: 'currency',
      currency,
      minimumFractionDigits: 2,
      maximumFractionDigits: 2
    }).format(numeric);
  } catch (_) {
    return `${formatNumber(numeric)} ${currency}`;
  }
}

export function formatAmount(value, currency) {
  const numeric = Number(value);
  if (!Number.isFinite(numeric)) return '—';
  return `${numberFormatter.format(numeric)}${currency ? ' ' + currency : ''}`;
}

export function parseDate(value) {
  if (isBlank(value)) return null;
  if (value instanceof Date) return Number.isNaN(value.getTime()) ? null : value;
  const text = String(value);
  const dateOnly = /^(\d{4})-(\d{2})-(\d{2})$/.exec(text);
  if (dateOnly) {
    return new Date(Number(dateOnly[1]), Number(dateOnly[2]) - 1, Number(dateOnly[3]));
  }
  const parsed = new Date(text);
  return Number.isNaN(parsed.getTime()) ? null : parsed;
}

export function formatDate(value) {
  const date = parseDate(value);
  return date ? dateFormatter.format(date) : '—';
}

export function formatDateTime(value) {
  const date = parseDate(value);
  return date ? dateTimeFormatter.format(date) : '—';
}

export function formatDuration(seconds) {
  const value = Number(seconds);
  if (!Number.isFinite(value) || value < 0) return '—';
  if (value < 60) return `${Math.round(value)}s`;
  if (value < 3600) return `${Math.floor(value / 60)}m ${Math.round(value % 60)}s`;
  if (value < 86400) return `${Math.floor(value / 3600)}h ${Math.floor((value % 3600) / 60)}m`;
  return `${Math.floor(value / 86400)}d ${Math.floor((value % 86400) / 3600)}h`;
}

export function humanize(name) {
  return String(name || '')
    .replace(/([a-z0-9])([A-Z])/g, '$1 $2')
    .replace(/_/g, ' ')
    .replace(/\bID\b/g, 'ID')
    .trim();
}

export function initials(name) {
  const parts = String(name || '?').trim().split(/\s+/).filter(Boolean);
  if (!parts.length) return '?';
  if (parts.length === 1) return parts[0].slice(0, 2).toUpperCase();
  return (parts[0][0] + parts[parts.length - 1][0]).toUpperCase();
}

export function pluralize(count, singular, plural) {
  return Number(count) === 1 ? singular : plural || `${singular}s`;
}

const BOOLEAN_LABELS = {
  IsBlocked: { true: 'Blocked', false: 'Active' },
  BillingDocumentIsCancelled: { true: 'Cancelled', false: 'Active' },
  IsMarkedForDeletion: { true: 'Marked', false: 'Active' },
  IsDefaultAddress: { true: 'Yes', false: 'No' },
  IsDefaultRole: { true: 'Yes', false: 'No' }
};

const STATUS_LABELS = {
  A: { label: 'Open', tone: 'warning' },
  B: { label: 'Partially Delivered', tone: 'info' },
  C: { label: 'Delivered', tone: 'positive' }
};

const BILLING_STATUS_LABELS = {
  A: { label: 'Open', tone: 'warning' },
  B: { label: 'Partially Billed', tone: 'info' },
  C: { label: 'Fully Billed', tone: 'positive' }
};

const EXTRA_TONES = {
  F2: 'positive',
  G2: 'warning',
  L2: 'info',
  RV: 'positive',
  WE: 'info',
  KR: 'warning',
  SA: 'neutral',
  NB: 'info',
  ZNB: 'neutral',
  FO: 'warning',
  OR: 'info',
  RE: 'warning',
  CR: 'violet',
  FERT: 'info',
  HAWA: 'neutral',
  ROH: 'warning',
  HALB: 'neutral'
};

/** Resolves a badge label/tone for a value, honouring field metadata. */
export function statusOf(value, field) {
  if (isBlank(value)) return null;
  const name = field?.name || '';
  if (typeof value === 'boolean' || value === 'true' || value === 'false') {
    const bool = value === true || value === 'true';
    const labels = BOOLEAN_LABELS[name];
    if (labels) {
      return {
        label: labels[bool],
        tone: name === 'IsBlocked' || name === 'BillingDocumentIsCancelled' || name === 'IsMarkedForDeletion'
          ? (bool ? 'negative' : 'positive')
          : (bool ? 'info' : 'neutral')
      };
    }
    return { label: bool ? 'Yes' : 'No', tone: bool ? 'info' : 'neutral' };
  }
  if (field?.options) {
    const option = field.options.find((item) => String(item.value) === String(value));
    if (option) {
      return {
        label: option.label,
        tone: option.tone || EXTRA_TONES[option.value] || 'neutral'
      };
    }
  }
  if (name === 'OverallDeliveryStatus') {
    const status = STATUS_LABELS[String(value).toUpperCase()];
    if (status) return status;
  }
  if (name === 'OverallBillingStatus') {
    const status = BILLING_STATUS_LABELS[String(value).toUpperCase()];
    if (status) return status;
  }
  return { label: String(value), tone: EXTRA_TONES[String(value)] || 'neutral' };
}

/** Plain-text value used for titles and detail fields. */
export function formatValue(value, field) {
  if (isBlank(value)) return '—';
  if (typeof value === 'boolean') {
    const status = statusOf(value, field);
    return status ? status.label : value ? 'Yes' : 'No';
  }
  const type = field?.type || '';
  if (type === 'Edm.Date') return formatDate(value);
  if (type === 'Edm.Decimal') {
    const numeric = Number(value);
    if (!Number.isFinite(numeric)) return String(value);
    return numeric.toLocaleString('en-US', { minimumFractionDigits: 0, maximumFractionDigits: 3 });
  }
  if (field?.options) {
    const status = statusOf(value, field);
    if (status && status.label !== String(value)) return status.label;
  }
  return String(value);
}

/** Returns true when the value should be shown with key/monospace styling. */
export function isCodeField(field) {
  if (!field) return false;
  if (field.key) return true;
  return /(?:^|_)(?:ID|Id|No|Number|Code|Key)$/.test(field.name) || /^(?:id|code)$/i.test(field.name);
}

/** Encodes one or more key values into a URL-safe path segment. */
export function encodeKey(...values) {
  const list = Array.isArray(values[0]) ? values[0] : values;
  return list.map((value) => encodeURIComponent(String(value ?? ''))).join('~');
}

export function decodeKey(segment, count = 1) {
  const parts = String(segment || '').split('~').map((part) => {
    try {
      return decodeURIComponent(part);
    } catch (_) {
      return part;
    }
  });
  if (count === 1) return [parts[0] ?? ''];
  return parts;
}

export function keyString(record, keyFields) {
  return (keyFields || []).map((name) => record?.[name] ?? '').join(' / ');
}

export function sum(values) {
  return values.reduce((total, value) => total + (Number(value) || 0), 0);
}

export function pct(part, total) {
  if (!total) return 0;
  return Math.round((Number(part) / Number(total)) * 100);
}
