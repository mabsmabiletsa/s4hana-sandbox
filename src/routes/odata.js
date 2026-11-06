'use strict';

const express = require('express');
const store = require('../store');
const { getEntity, services } = require('../schema');
const { parseQuery, applyCollection, applyOrder, projectRecord, parseOrderBy } = require('../odata/query');
const { generateMetadata } = require('../odata/metadata');
const { ApiError } = require('../errors');
const { odataError } = require('../http');
const { pad } = require('../util');

const router = express.Router();

/* ------------------------------------------------------------------------- */
/* Helpers                                                                   */
/* ------------------------------------------------------------------------- */

function serviceOr404(serviceId) {
  const service = services.find((s) => s.id.toLowerCase() === String(serviceId).toLowerCase());
  if (!service) throw new ApiError(404, `Service '${serviceId}' is not registered in this sandbox.`);
  return service;
}

function splitKeyParts(text) {
  const parts = [];
  let current = '';
  let quoted = false;
  for (let i = 0; i < text.length; i++) {
    const ch = text[i];
    if (ch === "'") {
      if (quoted && text[i + 1] === "'") {
        current += "''";
        i++;
        continue;
      }
      quoted = !quoted;
      current += ch;
      continue;
    }
    if (ch === ',' && !quoted) {
      parts.push(current);
      current = '';
      continue;
    }
    current += ch;
  }
  parts.push(current);
  return parts.map((p) => p.trim()).filter(Boolean);
}

function unquote(value) {
  const trimmed = String(value).trim();
  if (trimmed.startsWith("'") && trimmed.endsWith("'") && trimmed.length >= 2) {
    return trimmed.slice(1, -1).replace(/''/g, "'");
  }
  return trimmed;
}

function parseKeyExpression(entityDef, expression) {
  if (!expression || !expression.trim()) return null;
  const parts = splitKeyParts(expression);
  if (parts.length === 1 && !/^[A-Za-z_][A-Za-z0-9_]*\s*=/.test(parts[0])) {
    return { [entityDef.key[0]]: unquote(parts[0]) };
  }
  const key = {};
  for (const part of parts) {
    const equals = part.indexOf('=');
    if (equals === -1) throw new ApiError(400, `Invalid key expression '${part}'. Use Field='value'.`);
    key[part.slice(0, equals).trim()] = unquote(part.slice(equals + 1));
  }
  for (const field of entityDef.key) {
    if (key[field] === undefined) throw new ApiError(400, `Key property '${field}' is missing from the request.`);
  }
  for (const name of Object.keys(key)) {
    if (!entityDef.key.includes(name)) throw new ApiError(400, `'${name}' is not a key property of ${entityDef.name}.`);
  }
  return key;
}

function keyLiteral(entityDef, record) {
  const encode = (value) => encodeURIComponent(String(value));
  if (entityDef.key.length === 1) return `'${encode(record[entityDef.key[0]])}'`;
  return entityDef.key.map((field) => `${field}='${encode(record[field])}'`).join(',');
}

function entityUri(req, serviceId, entityDef, record) {
  const root = `${req.protocol}://${req.get('host')}${req.baseUrl}/${serviceId}`;
  return `${root}/${entityDef.name}(${keyLiteral(entityDef, record)})`;
}

function withMetadata(req, serviceId, entityDef, record) {
  const uri = entityUri(req, serviceId, entityDef, record);
  return {
    __metadata: {
      id: uri,
      uri,
      type: `${serviceId}.${entityDef.name}Type`
    },
    ...record
  };
}

function metadataFor(req, serviceId, entityDef, record) {
  const uri = entityUri(req, serviceId, entityDef, record);
  return {
    __metadata: {
      id: uri,
      uri,
      type: `${serviceId}.${entityDef.name}Type`
    }
  };
}

function findField(entityDef, name) {
  return entityDef.fieldMap[name]
    || Object.values(entityDef.fieldMap).find((field) => field.name.toLowerCase() === String(name).toLowerCase());
}

function findNav(entityDef, name) {
  return entityDef.navMap[name]
    || Object.values(entityDef.navMap).find((nav) => nav.name.toLowerCase() === String(name).toLowerCase());
}

function coerceValue(field, value) {
  if (value === null || value === undefined) return value === undefined ? undefined : null;
  switch (field.type) {
    case 'Edm.Decimal':
    case 'Edm.Double':
    case 'Edm.Int32':
    case 'Edm.Int64': {
      if (value === '') return null;
      const number = Number(value);
      if (!Number.isFinite(number)) throw new ApiError(400, `Property '${field.name}' must be numeric.`);
      return number;
    }
    case 'Edm.Boolean':
      if (typeof value === 'boolean') return value;
      if (value === 'true' || value === 1 || value === '1') return true;
      if (value === 'false' || value === 0 || value === '0') return false;
      throw new ApiError(400, `Property '${field.name}' must be a boolean.`);
    case 'Edm.String':
      return value === null ? null : String(value);
    case 'Edm.Date':
    case 'Edm.DateTime':
    case 'Edm.DateTimeOffset':
      return value === '' ? null : String(value);
    default:
      return value;
  }
}

/** Splits a raw JSON body into known scalar fields and navigation payloads. */
function splitPayload(entityDef, body, mode = 'create') {
  if (!body || typeof body !== 'object' || Array.isArray(body)) {
    throw new ApiError(400, 'Request body must be a JSON object.');
  }
  const fields = {};
  const navs = {};
  for (const [name, value] of Object.entries(body)) {
    if (name === '__metadata' || name === '@odata.etag') continue;
    const field = findField(entityDef, name);
    if (field) {
      if (field.readOnly) {
        if (mode === 'update') throw new ApiError(400, `Property '${field.name}' is read-only and cannot be changed.`);
        continue;
      }
      fields[field.name] = coerceValue(field, value);
      continue;
    }
    const nav = findNav(entityDef, name);
    if (nav) {
      if (value === null) continue;
      navs[nav.name] = Array.isArray(value) ? value : [value];
      continue;
    }
    throw new ApiError(400, `Property '${name}' does not exist on ${entityDef.name}.`);
  }
  return { fields, navs };
}

function childAutoKey(entityDef, field, index) {
  const width = field.maxLength || 6;
  if (entityDef.name === 'A_SalesOrderScheduleLine' && field.name === 'ScheduleLine') {
    return pad(index + 1, width);
  }
  return pad((index + 1) * 10, width);
}

function resolveNavRows(serviceId, entityDef, nav, parent) {
  const targetDef = getEntity(nav.targetService, nav.target);
  if (!targetDef) return [];
  return store.filter(nav.targetService, nav.target, (row) => Object.entries(nav.on).every(
    ([localField, targetField]) => String(parent[localField]) === String(row[targetField])
  ));
}

function insertTree(serviceId, entityDef, rawRecord, ctx, depth = 0) {
  if (depth > 4) throw new ApiError(400, 'Deep insert exceeds the maximum nesting depth of 4.');
  const { fields, navs } = splitPayload(entityDef, rawRecord);

  // Assign primary keys for deep inserts.
  for (const keyField of entityDef.key) {
    if (fields[keyField] === undefined || fields[keyField] === null || fields[keyField] === '') {
      const field = entityDef.fieldMap[keyField];
      fields[keyField] = childAutoKey(entityDef, field, ctx.childIndex || 0);
    }
  }

  if (entityDef.hooks && entityDef.hooks.beforeCreate) {
    entityDef.hooks.beforeCreate(fields, { ...navs }, { ...ctx, service: serviceId, entity: entityDef.name });
  }

  if (store.getByKey(serviceId, entityDef.name, Object.fromEntries(entityDef.key.map((k) => [k, fields[k]])))) {
    throw new ApiError(409, `${entityDef.name} ${entityDef.key.map((k) => fields[k]).join('/')} already exists.`);
  }

  const record = store.insert(serviceId, entityDef.name, fields);

  for (const nav of entityDef.nav) {
    const children = navs[nav.name];
    if (!children || !children.length) continue;
    const targetDef = getEntity(nav.targetService, nav.target);
    if (!targetDef) throw new ApiError(400, `Navigation target for ${nav.name} is not available.`);
    children.forEach((child, index) => {
      const next = { ...child };
      for (const [localField, targetField] of Object.entries(nav.on)) {
        next[targetField] = record[localField];
      }
      insertTree(nav.targetService, targetDef, next, { ...ctx, childIndex: index }, depth + 1);
    });
  }

  if (entityDef.hooks && entityDef.hooks.afterCreate) {
    entityDef.hooks.afterCreate(record, { ...navs }, { ...ctx, service: serviceId, entity: entityDef.name });
  }

  return record;
}

function expandInto(serviceId, entityDef, record, expand, target) {
  if (!expand) return target;
  const names = expand.__all
    ? Object.keys(entityDef.navMap)
    : Object.keys(expand).filter((name) => name !== '__all');
  for (const navName of names) {
    const nav = entityDef.navMap[navName];
    if (!nav) continue;
    const options = expand[navName] || {};
    let related = resolveNavRows(serviceId, entityDef, nav, record);
    if (nav.many) {
      if (options.orderby) {
        const targetDef = getEntity(nav.targetService, nav.target);
        related = applyOrder(related, parseOrderBy(options.orderby, targetDef), targetDef);
      }
      const skip = options.skip || 0;
      const top = options.top === undefined ? related.length : options.top;
      related = related.slice(skip, skip + top);
      if (options.select) {
        related = related.map((row) => {
          const projected = {};
          for (const name of options.select) projected[name] = row[name];
          return projected;
        });
      }
      target[navName] = related;
    } else {
      target[navName] = related[0] || null;
    }
  }
  return target;
}

/* ------------------------------------------------------------------------- */
/* GET                                                                       */
/* ------------------------------------------------------------------------- */

function handleGet(req, res, service, entityDef, key, navNames) {
  const wantsCount = navNames.length > 0 && navNames[navNames.length - 1] === '$count';
  const navChain = navNames.filter((name) => name !== '$count');

  if (!key) {
    if (navChain.length) throw new ApiError(400, 'Navigation properties require a single entity key.');
    const parsed = parseQuery(req.query, entityDef);
    const collection = store.all(service.id, entityDef.name);
    const { rows, count } = applyCollection(collection, parsed, entityDef);
    if (wantsCount) return res.type('text/plain').send(String(count));
    const results = rows.map((row) => {
      const projected = projectRecord(row, parsed, entityDef);
      expandInto(service.id, entityDef, row, parsed.expand, projected);
      return { ...metadataFor(req, service.id, entityDef, row), ...projected };
    });
    const body = { d: { results } };
    if (parsed.count) body.d.__count = String(count);
    return res.json(body);
  }

  const record = store.getByKey(service.id, entityDef.name, key);
  if (!record) {
    throw new ApiError(404, `No ${entityDef.name} found for key ${entityDef.key.map((k) => `${k}=${key[k]}`).join(', ')}.`);
  }

  if (!navChain.length) {
    if (wantsCount) return res.type('text/plain').send('1');
    const parsed = parseQuery(req.query, entityDef);
    const projected = projectRecord(record, parsed, entityDef);
    expandInto(service.id, entityDef, record, parsed.expand, projected);
    return res.json({ d: { ...metadataFor(req, service.id, entityDef, record), ...projected } });
  }

  let context = { serviceId: service.id, entityDef, records: [record], collection: false };
  for (const navName of navChain) {
    const nav = context.entityDef.navMap[navName]
      || Object.values(context.entityDef.navMap).find((item) => item.name.toLowerCase() === navName.toLowerCase());
    if (!nav) throw new ApiError(404, `Navigation property '${navName}' does not exist on ${context.entityDef.name}.`);
    const targetDef = getEntity(nav.targetService, nav.target);
    if (!targetDef) throw new ApiError(404, `Navigation target ${nav.target} is not registered.`);
    const related = [];
    for (const parent of context.records) related.push(...resolveNavRows(context.serviceId, context.entityDef, nav, parent));
    context = {
      serviceId: nav.targetService,
      entityDef: targetDef,
      records: related,
      collection: context.collection || nav.many || related.length > 1
    };
  }

  // Query options are applied to the final navigation target, not to the parent.
  const parsed = parseQuery(req.query, context.entityDef);

  if (context.collection) {
    const { rows, count } = applyCollection(context.records, parsed, context.entityDef);
    if (wantsCount) return res.type('text/plain').send(String(count));
    const results = rows.map((row) => {
      const projected = projectRecord(row, parsed, context.entityDef);
      expandInto(context.serviceId, context.entityDef, row, parsed.expand, projected);
      return { ...metadataFor(req, context.serviceId, context.entityDef, row), ...projected };
    });
    const body = { d: { results } };
    if (parsed.count) body.d.__count = String(count);
    return res.json(body);
  }

  const single = context.records[0] || null;
  if (wantsCount) return res.type('text/plain').send(single ? '1' : '0');
  if (!single) return res.json({ d: null });
  const projected = projectRecord(single, parsed, context.entityDef);
  expandInto(context.serviceId, context.entityDef, single, parsed.expand, projected);
  return res.json({ d: { ...metadataFor(req, context.serviceId, context.entityDef, single), ...projected } });
}

/* ------------------------------------------------------------------------- */
/* Writes                                                                    */
/* ------------------------------------------------------------------------- */

function buildReplacementFields(entityDef, existing, provided) {
  const defaults = store.emptyRecord(entityDef);
  for (const field of entityDef.fields) {
    if (field.key || field.readOnly) defaults[field.name] = existing[field.name];
  }
  for (const keyField of entityDef.key) delete provided[keyField];
  return { ...defaults, ...provided };
}

function handleCreate(req, res, service, entityDef) {
  const body = req.body;
  if (!body || typeof body !== 'object') throw new ApiError(400, 'A JSON body is required.');

  const record = store.transaction(() => {
    const { fields, navs } = splitPayload(entityDef, body);
    const generation = entityDef.keyGeneration;
    for (const keyField of entityDef.key) {
      if (fields[keyField] === undefined || fields[keyField] === null || fields[keyField] === '') {
        if (generation && keyField === entityDef.key[0]) {
          fields[keyField] = store.nextNumericKey(service.id, entityDef.name, generation.start, generation.pad);
        } else {
          throw new ApiError(400, `Key property '${keyField}' is required.`);
        }
      }
    }

    const ctx = { store, user: req.user };
    if (entityDef.hooks && entityDef.hooks.beforeCreate) {
      entityDef.hooks.beforeCreate(fields, { ...navs }, { ...ctx, service: service.id, entity: entityDef.name });
    }

    const key = Object.fromEntries(entityDef.key.map((k) => [k, fields[k]]));
    if (store.getByKey(service.id, entityDef.name, key)) {
      throw new ApiError(409, `${entityDef.name} with key ${entityDef.key.map((k) => fields[k]).join('/')} already exists.`);
    }

    const inserted = store.insert(service.id, entityDef.name, fields);

    for (const nav of entityDef.nav) {
      const children = navs[nav.name];
      if (!children || !children.length) continue;
      const targetDef = getEntity(nav.targetService, nav.target);
      if (!targetDef) continue;
      children.forEach((child, index) => {
        const next = { ...child };
        for (const [localField, targetField] of Object.entries(nav.on)) {
          next[targetField] = inserted[localField];
        }
        insertTree(nav.targetService, targetDef, next, { ...ctx, childIndex: index }, 1);
      });
    }

    if (entityDef.hooks && entityDef.hooks.afterCreate) {
      entityDef.hooks.afterCreate(inserted, { ...navs }, { ...ctx, service: service.id, entity: entityDef.name });
    }
    return inserted;
  });

  res.status(201);
  res.set('Location', entityUri(req, service.id, entityDef, record));
  return res.json({ d: withMetadata(req, service.id, entityDef, record) });
}

function handleUpdate(req, res, service, entityDef, key, replace) {
  const existing = store.getByKey(service.id, entityDef.name, key);
  if (!existing) throw new ApiError(404, `${entityDef.name} not found.`);
  const { fields: provided, navs } = splitPayload(entityDef, req.body || {}, 'update');
  if (Object.keys(navs).length) {
    throw new ApiError(400, `${replace ? 'PUT' : 'PATCH'} cannot update navigation properties. Use the related entity set.`);
  }
  for (const keyField of entityDef.key) {
    if (provided[keyField] !== undefined && String(provided[keyField]) !== String(existing[keyField])) {
      throw new ApiError(400, `Key property '${keyField}' cannot be changed.`);
    }
  }

  store.transaction(() => {
    const fields = replace ? buildReplacementFields(entityDef, existing, provided) : provided;
    const ctx = { store, user: req.user };
    if (entityDef.hooks && entityDef.hooks.beforeUpdate) {
      entityDef.hooks.beforeUpdate(fields, existing, { ...ctx, service: service.id, entity: entityDef.name });
    }
    if (entityDef.fieldMap.LastChangeDate) fields.LastChangeDate = new Date().toISOString().slice(0, 10);
    store.update(service.id, entityDef.name, key, fields);
  });

  res.status(204).end();
}

function handleDelete(req, res, service, entityDef, key) {
  const existing = store.getByKey(service.id, entityDef.name, key);
  if (!existing) throw new ApiError(404, `${entityDef.name} not found.`);
  store.transaction(() => {
    const ctx = { store, user: req.user };
    if (entityDef.hooks && entityDef.hooks.beforeDelete) {
      entityDef.hooks.beforeDelete(existing, { ...ctx, service: service.id, entity: entityDef.name });
    }
    store.remove(service.id, entityDef.name, key);
  });
  res.status(204).end();
}

/* ------------------------------------------------------------------------- */
/* Router                                                                    */
/* ------------------------------------------------------------------------- */

router.get('/', (req, res) => {
  res.json({
    d: {
      services: services.map((service) => ({
        id: service.id,
        label: service.label,
        url: `${req.protocol}://${req.get('host')}${req.baseUrl}/${service.id}`,
        metadata: `${req.protocol}://${req.get('host')}${req.baseUrl}/${service.id}/$metadata`,
        entitySets: Object.keys(service.entities)
      }))
    }
  });
});

router.get('/:service', (req, res, next) => {
  try {
    const service = serviceOr404(req.params.service);
    res.set('DataServiceVersion', '2.0');
    res.json({
      d: {
        EntitySets: Object.keys(service.entities),
        __metadata: {
          uri: `${req.protocol}://${req.get('host')}${req.baseUrl}/${service.id}/`,
          type: `${service.id}.EntityContainer`
        }
      }
    });
  } catch (error) {
    next(error);
  }
});

router.all('/:service/*', (req, res, next) => {
  try {
    const service = serviceOr404(req.params.service);
    const rawPath = String(req.params[0] || '').replace(/^\/+|\/+$/g, '');
    res.set('DataServiceVersion', '2.0');
    res.set('Cache-Control', 'no-store');

    if (rawPath === '$metadata') {
      res.type('application/xml');
      return res.send(generateMetadata(service));
    }

    const segments = rawPath.split('/').filter(Boolean);
    const first = segments.shift();
    const match = /^([A-Za-z_][A-Za-z0-9_]*)(?:\((.*)\))?$/.exec(first);
    if (!match) throw new ApiError(404, `Invalid entity path '${first}'.`);
    const entityDef = getEntity(service.id, match[1]);
    if (!entityDef) throw new ApiError(404, `Entity set '${match[1]}' does not exist in ${service.id}.`);
    const key = parseKeyExpression(entityDef, match[2]);
    const navNames = segments;

    switch (req.method) {
      case 'GET':
        return handleGet(req, res, service, entityDef, key, navNames);
      case 'POST':
        if (key) throw new ApiError(405, 'POST is only allowed on entity collections.');
        if (navNames.length) throw new ApiError(405, 'POST is not allowed on navigation properties.');
        return handleCreate(req, res, service, entityDef);
      case 'PATCH':
        if (!key) throw new ApiError(400, 'PATCH requires an entity key.');
        return handleUpdate(req, res, service, entityDef, key, false);
      case 'PUT':
        if (!key) throw new ApiError(400, 'PUT requires an entity key.');
        return handleUpdate(req, res, service, entityDef, key, true);
      case 'DELETE':
        if (!key) throw new ApiError(400, 'DELETE requires an entity key.');
        return handleDelete(req, res, service, entityDef, key);
      default:
        throw new ApiError(405, `Method ${req.method} is not supported.`);
    }
  } catch (error) {
    if (error instanceof ApiError) return odataError(res, error.status, error.message, error.code);
    return next(error);
  }
});

module.exports = { router };
