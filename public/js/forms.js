/** Create, edit and delete dialogs for master data + sales orders. */

import { icon } from './icons.js';
import { esc, formatNumber } from './format.js';
import { openModal, confirmDialog, toast, setButtonLoading, qs, qsa } from './ui.js';
import { odataCreate, odataUpdate, odataDelete, lookupOptions, odataCollection } from './api.js';

const productCache = { promise: null, map: null };

async function loadProducts() {
  if (productCache.map) return productCache.map;
  if (!productCache.promise) {
    productCache.promise = odataCollection('API_PRODUCT_SRV', 'A_Product', {
      select: 'Product,ProductDescription,StandardPrice,BaseUnit,Currency',
      orderby: 'Product asc',
      top: 500
    })
      .then(({ rows }) => {
        const map = new Map();
        for (const row of rows) {
          map.set(String(row.Product), {
            product: String(row.Product),
            description: row.ProductDescription || '',
            price: Number(row.StandardPrice) || 0,
            unit: row.BaseUnit || 'PC',
            currency: row.Currency || 'EUR'
          });
        }
        productCache.map = map;
        return map;
      })
      .catch((error) => {
        productCache.promise = null;
        throw error;
      });
  }
  return productCache.promise;
}

function isRequiredField(entity, field) {
  if (field.key) return false;
  const name = field.name;
  if (name === 'SoldToParty' || name === 'Material' || name === 'BusinessPartnerFullName') return true;
  if (entity.ui?.create?.fields?.includes(name)) {
    return ['SoldToParty', 'Material', 'BusinessPartnerCategory', 'BusinessPartnerName', 'FirstName', 'LastName'].includes(name);
  }
  return false;
}

function optionsMarkup(options, selected, { placeholder = '' } = {}) {
  const items = [];
  if (placeholder !== null) {
    items.push(`<option value="">${esc(placeholder || '— Select —')}</option>`);
  }
  for (const option of options || []) {
    const value = String(option.value);
    items.push(
      `<option value="${esc(value)}"${String(selected ?? '') === value ? ' selected' : ''}>${esc(option.label)}</option>`
    );
  }
  return items.join('');
}

function lookupKey(lookup) {
  return `${lookup.service}/${lookup.entity}/${lookup.key}/${lookup.label || ''}`;
}

function renderField(field, value, { required, lookups, readOnly = false }) {
  const id = `field-${field.name}`;
  const label = `<label class="form-field__label" for="${id}">${esc(field.label)}${required ? '<span class="req" aria-hidden="true">*</span>' : ''}</label>`;
  const disabled = readOnly ? ' disabled' : '';
  let control = '';
  let full = false;

  if (field.type === 'Edm.Boolean') {
    const checked = value === true || value === 'true';
    return `
      <div class="form-field">
        <span class="form-field__label">${esc(field.label)}</span>
        <label class="switch">
          <input type="checkbox" id="${id}" data-field="${esc(field.name)}" data-type="boolean"${checked ? ' checked' : ''}${disabled}>
          <span class="switch__track"></span>
          <span>${checked ? 'Yes' : 'No'}</span>
        </label>
      </div>`;
  }

  if (field.lookup) {
    const key = lookupKey(field.lookup);
    const options = lookups.get(key) || [];
    const list = options
      .map((option) => `<option value="${esc(option.value)}"${String(value ?? '') === String(option.value) ? ' selected' : ''}>${esc(option.label)}</option>`)
      .join('');
    control = `<select class="select" id="${id}" data-field="${esc(field.name)}" data-type="string" data-lookup="${esc(key)}"${disabled}>
      <option value="">— Select —</option>${list}
    </select>`;
    const hint = field.name === 'ShipToParty' ? 'Leave empty to use the sold-to party.' : '';
    return `
      <div class="form-field">
        ${label}
        ${control}
        ${hint ? `<span class="form-field__hint">${esc(hint)}</span>` : ''}
      </div>`;
  }

  if (field.options && field.options.length) {
    control = `<select class="select" id="${id}" data-field="${esc(field.name)}" data-type="string"${disabled}>${optionsMarkup(field.options, value)}</select>`;
  } else if (field.type === 'Edm.Date') {
    control = `<input class="input" type="date" id="${id}" data-field="${esc(field.name)}" data-type="date" value="${esc(value ?? '')}"${disabled}>`;
  } else if (field.type === 'Edm.Decimal') {
    const step = field.scale && field.scale > 2 ? '0.001' : '0.01';
    control = `<input class="input" type="number" inputmode="decimal" step="${step}" id="${id}" data-field="${esc(field.name)}" data-type="decimal" value="${value === null || value === undefined ? '' : esc(value)}"${disabled}>`;
  } else {
    const max = field.maxLength ? ` maxlength="${Number(field.maxLength)}"` : '';
    control = `<input class="input" type="text" id="${id}" data-field="${esc(field.name)}" data-type="string" value="${esc(value ?? '')}"${max}${disabled}>`;
  }

  return `
    <div class="form-field${full ? ' form-field--full' : ''}">
      ${label}
      ${control}
    </div>`;
}

function groupCreateFields(entity, names) {
  const sections = entity.ui?.sections || [];
  const groups = [];
  const used = new Set();
  for (const section of sections) {
    const fields = names
      .filter((name) => section.fields.includes(name) && !used.has(name))
      .map((name) => entity.fields.find((field) => field.name === name))
      .filter(Boolean);
    if (!fields.length) continue;
    fields.forEach((field) => used.add(field.name));
    groups.push({ label: section.label, fields });
  }
  const leftovers = names
    .filter((name) => !used.has(name))
    .map((name) => entity.fields.find((field) => field.name === name))
    .filter(Boolean);
  if (leftovers.length) groups.push({ label: groups.length ? 'Additional Details' : 'Details', fields: leftovers });
  return groups;
}

function todayOffset(days) {
  const date = new Date();
  date.setDate(date.getDate() + days);
  return date.toISOString().slice(0, 10);
}

function applyDefaults(entity, names) {
  const create = entity.ui?.create || {};
  const values = {};
  for (const name of names) {
    if (create.defaults && Object.prototype.hasOwnProperty.call(create.defaults, name)) {
      values[name] = create.defaults[name];
    }
  }
  if (names.includes('RequestedDeliveryDate') && !values.RequestedDeliveryDate) values.RequestedDeliveryDate = todayOffset(14);
  if (names.includes('CustomerPurchaseOrderDate') && !values.CustomerPurchaseOrderDate) values.CustomerPurchaseOrderDate = todayOffset(0);
  return values;
}

function formError(message) {
  return `
    <div class="form-error" role="alert" data-form-error>
      ${icon('alert', 17)}
      <div>${esc(message)}</div>
    </div>`;
}

function showFormError(root, message) {
  const slot = qs('[data-form-error-slot]', root);
  if (slot) slot.innerHTML = formError(message);
}

function clearFormError(root) {
  const slot = qs('[data-form-error-slot]', root);
  if (slot) slot.innerHTML = '';
}

function collectScalarValues(root) {
  const payload = {};
  for (const input of qsa('[data-field]', root)) {
    const name = input.dataset.field;
    const type = input.dataset.type;
    if (input.type === 'checkbox') {
      payload[name] = input.checked;
      continue;
    }
    const value = input.value;
    if (type === 'decimal') {
      if (value === '') continue;
      payload[name] = Number(value);
      continue;
    }
    if (type === 'date') {
      if (value === '') continue;
      payload[name] = value;
      continue;
    }
    if (name === 'ShipToParty' && value === '') continue;
    payload[name] = value;
  }
  return payload;
}

/* -------------------------------------------------------------------------- */
/* Line items                                                                 */
/* -------------------------------------------------------------------------- */

function lineItemRow(index, productMap, defaults) {
  const products = Array.from(productMap.values())
    .sort((a, b) => a.product.localeCompare(b.product))
    .map((product) => `<option value="${esc(product.product)}">${esc(product.product)} – ${esc(product.description)}</option>`)
    .join('');
  const plantOptions = [
    { value: '1010', label: '1010 – Hamburg Plant' },
    { value: '1710', label: '1710 – Austin Plant' },
    { value: '2520', label: '2520 – Manchester Plant' },
    { value: '3000', label: '3000 – Johannesburg Plant' }
  ];
  return `
    <tr data-line-row>
      <td class="muted num" data-line-index>${index + 1}</td>
      <td style="min-width:260px">
        <select class="select li-material" data-li="Material" aria-label="Material">
          <option value="">— Select material —</option>${products}
        </select>
      </td>
      <td style="width:92px"><input class="input num li-qty" data-li="RequestedQuantity" type="number" min="0.001" step="0.001" value="${esc(defaults.RequestedQuantity ?? 1)}" aria-label="Quantity"></td>
      <td class="li-unit mono muted" data-line-unit style="width:64px">—</td>
      <td style="width:120px"><input class="input num li-price" data-li="NetPriceAmount" type="number" min="0" step="0.01" value="" placeholder="Standard" aria-label="Net price"></td>
      <td class="num li-amount" data-line-amount style="width:110px">0.00</td>
      <td style="width:44px"><button class="row-remove" type="button" data-remove-line aria-label="Remove item">${icon('trash', 14)}</button></td>
    </tr>`;
}

function recalcLines(root) {
  let total = 0;
  const rows = qsa('[data-line-row]', root);
  rows.forEach((row, index) => {
    const indexCell = qs('[data-line-index]', row);
    if (indexCell) indexCell.textContent = String(index + 1);
    const qty = Number(qs('.li-qty', row)?.value || 0);
    const price = Number(qs('.li-price', row)?.value || 0);
    const amount = qty * price;
    total += amount;
    const amountCell = qs('[data-line-amount]', row);
    if (amountCell) amountCell.textContent = formatNumber(amount);
  });
  const totalEl = qs('[data-line-total]', root);
  const countEl = qs('[data-line-count]', root);
  if (totalEl) totalEl.textContent = formatNumber(total);
  if (countEl) countEl.textContent = String(rows.length);
  const empty = qs('[data-line-empty]', root);
  if (empty) empty.hidden = rows.length > 0;
}

function bindLineItems(root, productMap) {
  const tbody = qs('[data-line-items]', root);
  if (!tbody) return;

  const applyProduct = (row) => {
    const material = qs('.li-material', row)?.value;
    const product = productMap.get(material);
    const unitCell = qs('[data-line-unit]', row);
    const priceInput = qs('.li-price', row);
    if (unitCell) unitCell.textContent = product ? product.unit : '—';
    if (product && priceInput && (priceInput.value === '' || priceInput.dataset.autofilled === 'true')) {
      priceInput.value = product.price ? String(product.price) : '';
      priceInput.dataset.autofilled = 'true';
      priceInput.placeholder = product.price ? String(product.price) : 'Standard';
    }
    recalcLines(root);
  };

  tbody.addEventListener('change', (event) => {
    const row = event.target.closest('[data-line-row]');
    if (!row) return;
    if (event.target.classList.contains('li-material')) applyProduct(row);
    recalcLines(root);
  });

  tbody.addEventListener('input', (event) => {
    const row = event.target.closest('[data-line-row]');
    if (!row) return;
    if (event.target.classList.contains('li-price')) event.target.dataset.autofilled = 'false';
    recalcLines(root);
  });

  tbody.addEventListener('click', (event) => {
    const remove = event.target.closest('[data-remove-line]');
    if (!remove) return;
    const row = remove.closest('[data-line-row]');
    if (row) row.remove();
    recalcLines(root);
  });

  qs('[data-add-line]', root)?.addEventListener('click', () => {
    const index = qsa('[data-line-row]', root).length;
    const wrapper = qs('[data-line-items]', root);
    wrapper.insertAdjacentHTML('beforeend', lineItemRow(index, productMap, { RequestedQuantity: 1 }));
    recalcLines(root);
  });

  recalcLines(root);
  const first = qs('[data-line-row]', root);
  if (first && !qs('.li-material', first)?.value) qs('.li-material', first)?.focus({ preventScroll: true });
}

function collectLineItems(root) {
  const rows = qsa('[data-line-row]', root);
  const items = [];
  for (const row of rows) {
    const material = qs('.li-material', row)?.value;
    const quantity = Number(qs('.li-qty', row)?.value || 0);
    const priceRaw = qs('.li-price', row)?.value;
    if (!material && !quantity) continue;
    if (!material) throw new Error('Every order item needs a material.');
    if (!(quantity > 0)) throw new Error(`Quantity for material ${material} must be greater than zero.`);
    const item = {
      Material: material,
      RequestedQuantity: quantity
    };
    if (priceRaw !== '' && priceRaw !== undefined && priceRaw !== null) item.NetPriceAmount = Number(priceRaw);
    const plant = qs(`[data-li="Plant"]`, row)?.value;
    if (plant) item.Plant = plant;
    items.push(item);
  }
  if (!items.length) throw new Error('Add at least one order item.');
  return items;
}

/* -------------------------------------------------------------------------- */
/* Create dialog                                                              */
/* -------------------------------------------------------------------------- */

export async function openCreateDialog(entity, { onCreated } = {}) {
  const create = entity.ui?.create;
  if (!create) {
    toast({ type: 'warning', title: 'Not available', message: `${entity.label} cannot be created in this sandbox.` });
    return;
  }

  const fieldNames = create.fields || [];
  const lineConfig = create.lineItems || null;
  const defaults = applyDefaults(entity, fieldNames);

  const lookups = new Map();
  const lookupFields = fieldNames
    .map((name) => entity.fields.find((field) => field.name === name))
    .filter((field) => field && field.lookup);
  let productMap = null;

  try {
    await Promise.all([
      ...lookupFields.map(async (field) => {
        const key = lookupKey(field.lookup);
        const options = await lookupOptions(field.lookup).catch(() => []);
        lookups.set(key, options);
      }),
      lineConfig ? loadProducts().then((map) => { productMap = map; }) : Promise.resolve()
    ]);
  } catch (_) {
    /* lookups degrade to empty selects; the server still validates */
  }

  const groups = groupCreateFields(entity, fieldNames);
  const assignment = create.assignment || null;

  const formSections = groups
    .map((group, index) => `
      <div class="form-section">${esc(index === 0 ? group.label : group.label)}</div>
      ${group.fields.map((field) => renderField(field, defaults[field.name], {
        required: isRequiredField(entity, field),
        lookups
      })).join('')}`)
    .join('');

  const assignmentMarkup = assignment
    ? `
      <div class="form-section">${esc(assignment.label || 'Business Role')}</div>
      <div class="form-field form-field--full">
        <label class="form-field__label" for="field-assignment">${esc(assignment.label || 'Business Role')}</label>
        <select class="select" id="field-assignment" data-assignment>
          ${optionsMarkup(assignment.options || [], assignment.defaultValue ?? '')}
        </select>
        <span class="form-field__hint">Customer and supplier roles automatically create the corresponding master record.</span>
      </div>`
    : '';

  const lineMarkup = lineConfig
    ? `
      <div class="line-items" data-line-items-wrap>
        <div class="line-items__head">
          <div class="line-items__title">${esc(lineConfig.label || 'Items')} <span class="badge badge--neutral" data-line-count>0</span></div>
          <button class="btn btn--sm" type="button" data-add-line>${icon('plus', 14)} Add Item</button>
        </div>
        <div style="overflow:auto">
          <table class="line-items__table">
            <thead>
              <tr>
                <th style="width:34px">#</th>
                <th>${esc((entity.fields.find((f) => f.name === 'Material') || {}).label || 'Material')}</th>
                <th style="width:92px">Qty</th>
                <th style="width:64px">Unit</th>
                <th style="width:120px">Price</th>
                <th style="width:110px;text-align:right">Amount</th>
                <th></th>
              </tr>
            </thead>
            <tbody data-line-items>
              ${lineItemRow(0, productMap || new Map(), lineConfig.defaults || {})}
            </tbody>
          </table>
        </div>
        <div class="line-items__empty" data-line-empty hidden>No items. Use “Add Item” to start.</div>
        <div class="line-items__total">
          <span>Total net amount</span>
          <span class="num" data-line-total>0</span>
        </div>
      </div>`
    : '';

  let submitButton = null;

  const modal = openModal({
    title: create.label || `Create ${entity.singular || entity.label}`,
    subtitle: entity.description,
    wide: Boolean(lineConfig),
    body: `
      <div data-form-error-slot></div>
      <form data-create-form novalidate>
        <div class="form-grid">
          ${formSections}
          ${assignmentMarkup}
          ${lineMarkup}
        </div>
      </form>`,
    footer: `
      <span class="explorer-hint">Fields marked <span class="req" style="color:var(--negative)">*</span> are required by the sandbox.</span>
      <span class="spacer"></span>
      <button class="btn" type="button" data-modal-close>Cancel</button>
      <button class="btn btn--primary" type="button" data-submit>${icon('check', 15)} ${esc(create.label || 'Create')}</button>`,
    onMount({ dialog }) {
      submitButton = qs('[data-submit]', dialog);
      const form = qs('[data-create-form]', dialog);
      if (lineConfig) bindLineItems(dialog, productMap || new Map());

      qsa('.switch input', dialog).forEach((input) => {
        input.addEventListener('change', () => {
          const text = input.closest('.switch')?.querySelector('span:last-child');
          if (text) text.textContent = input.checked ? 'Yes' : 'No';
        });
      });

      const submit = async () => {
        clearFormError(dialog);
        let payload;
        try {
          payload = collectScalarValues(dialog);
          if (assignment) {
            const role = qs('[data-assignment]', dialog)?.value;
            if (role) payload[assignment.nav] = [{ [assignment.navKey]: role }];
          }
          if (lineConfig) payload[lineConfig.nav] = collectLineItems(dialog);
        } catch (error) {
          showFormError(dialog, error.message);
          return;
        }
        setButtonLoading(submitButton, true, 'Creating…');
        try {
          const response = await odataCreate(entity.serviceId, entity.name, payload);
          const created = response?.d || {};
          modal.close();
          toast({
            type: 'success',
            title: `${entityName(entity)} created`,
            message: `${recordLabel(entity, created, payload)} was created successfully.`
          });
          if (typeof onCreated === 'function') onCreated(created, payload);
        } catch (error) {
          setButtonLoading(submitButton, false);
          const hint = error.status === 401
            ? ' Sign in with a write-enabled user (for example DEVELOPER / Password1).'
            : error.status === 403
              ? ' The signed-in user is read-only.'
              : '';
          showFormError(dialog, `${error.message}${hint}`);
          dialog.querySelector('[data-form-error]')?.scrollIntoView({ block: 'nearest', behavior: 'smooth' });
        }
      };

      submitButton.addEventListener('click', submit);
      form.addEventListener('submit', (event) => {
        event.preventDefault();
        submit();
      });
    }
  });

  return modal;
}

function entityName(entity) {
  return entity.singular || entity.label || entity.name;
}

function recordLabel(entity, record, fallback) {
  const titleField = entity.ui?.title;
  if (titleField && record[titleField]) return String(record[titleField]);
  const key = (entity.key || []).map((field) => record[field] ?? fallback?.[field]).filter(Boolean);
  return key.join(' / ') || entityName(entity);
}

/* -------------------------------------------------------------------------- */
/* Edit dialog                                                                */
/* -------------------------------------------------------------------------- */

export async function openEditDialog(entity, record, { onUpdated } = {}) {
  const update = entity.ui?.update;
  if (!update) {
    toast({ type: 'warning', title: 'Not available', message: `${entity.label} cannot be edited in this sandbox.` });
    return;
  }
  const fieldNames = update.fields || [];
  const fields = fieldNames.map((name) => entity.fields.find((field) => field.name === name)).filter(Boolean);
  const lookups = new Map();
  await Promise.all(
    fields
      .filter((field) => field.lookup)
      .map(async (field) => {
        const key = lookupKey(field.lookup);
        lookups.set(key, await lookupOptions(field.lookup).catch(() => []));
      })
  );

  const groups = [];
  const used = new Set();
  for (const section of entity.ui?.sections || []) {
    const sectionFields = fields.filter((field) => section.fields.includes(field.name) && !used.has(field.name));
    if (!sectionFields.length) continue;
    sectionFields.forEach((field) => used.add(field.name));
    groups.push({ label: section.label, fields: sectionFields });
  }
  const leftovers = fields.filter((field) => !used.has(field.name));
  if (leftovers.length) groups.push({ label: groups.length ? 'Additional Details' : 'Details', fields: leftovers });

  let submitButton = null;
  const modal = openModal({
    title: update.label || `Edit ${entityName(entity)}`,
    subtitle: recordLabel(entity, record),
    body: `
      <div data-form-error-slot></div>
      <form data-edit-form novalidate>
        <div class="form-grid">
          ${groups
            .map(
              (group, index) => `
                <div class="form-section">${esc(index === 0 ? group.label : group.label)}</div>
                ${group.fields
                  .map((field) => renderField(field, record[field.name], {
                    required: isRequiredField(entity, field),
                    lookups
                  }))
                  .join('')}`
            )
            .join('')}
        </div>
      </form>`,
    footer: `
      <button class="btn" type="button" data-modal-close>Cancel</button>
      <button class="btn btn--primary" type="button" data-submit>${icon('check', 15)} Save Changes</button>`,
    onMount({ dialog }) {
      submitButton = qs('[data-submit]', dialog);
      qsa('.switch input', dialog).forEach((input) => {
        input.addEventListener('change', () => {
          const text = input.closest('.switch')?.querySelector('span:last-child');
          if (text) text.textContent = input.checked ? 'Yes' : 'No';
        });
      });

      const submit = async () => {
        clearFormError(dialog);
        const payload = collectScalarValues(dialog);
        setButtonLoading(submitButton, true, 'Saving…');
        try {
          await odataUpdate(entity.serviceId, entity.name, Object.fromEntries(entity.key.map((key) => [key, record[key]])), payload);
          modal.close();
          toast({ type: 'success', title: 'Changes saved', message: recordLabel(entity, record) });
          if (typeof onUpdated === 'function') onUpdated(payload);
        } catch (error) {
          setButtonLoading(submitButton, false);
          const hint = error.status === 401
            ? ' Sign in with a write-enabled user.'
            : error.status === 403
              ? ' The signed-in user is read-only.'
              : '';
          showFormError(dialog, `${error.message}${hint}`);
        }
      };

      submitButton.addEventListener('click', submit);
      qs('[data-edit-form]', dialog).addEventListener('submit', (event) => {
        event.preventDefault();
        submit();
      });
    }
  });
  return modal;
}

/* -------------------------------------------------------------------------- */
/* Delete dialog                                                              */
/* -------------------------------------------------------------------------- */

export async function confirmDelete(entity, record, { onDeleted } = {}) {
  const del = entity.ui?.delete;
  if (!del) {
    toast({ type: 'warning', title: 'Not available', message: `${entity.label} is read-only in this sandbox.` });
    return false;
  }
  const label = recordLabel(entity, record);
  const confirmed = await confirmDialog({
    title: del.label || `Delete ${entityName(entity)}`,
    message: `${esc(del.description || `Delete ${entityName(entity)} permanently?`)}<br><br>Record: <strong>${esc(label)}</strong><br><span class="muted">This action cannot be undone.</span>`,
    confirmLabel: 'Delete',
    danger: true
  });
  if (!confirmed) return false;
  try {
    await odataDelete(entity.serviceId, entity.name, Object.fromEntries(entity.key.map((key) => [key, record[key]])));
    toast({ type: 'success', title: 'Deleted', message: `${label} was deleted.` });
    if (typeof onDeleted === 'function') onDeleted(record);
    return true;
  } catch (error) {
    toast({
      type: 'error',
      title: 'Delete failed',
      message: error.status === 409
        ? error.message
        : `${error.message}${error.status === 401 ? ' Sign in with a write-enabled user.' : ''}`,
      duration: 7000
    });
    return false;
  }
}
