'use strict';

const fs = require('fs');
const path = require('path');
const { getEntity } = require('./schema');
const { buildSeed } = require('./seed');
const { deepClone } = require('./util');

const DATA_FILE = process.env.S4_DATA_FILE
  ? path.resolve(process.env.S4_DATA_FILE)
  : path.join(__dirname, '..', 'data', 'database.json');

let database = null;

function emptyRecord(entityDef) {
  const record = {};
  for (const field of entityDef.fields) {
    if (field.key) continue;
    if (field.type === 'Edm.Boolean') record[field.name] = false;
    else if (field.type === 'Edm.Decimal' || field.type === 'Edm.Int32' || field.type === 'Edm.Int64') record[field.name] = 0;
    else if (field.type === 'Edm.Date' || field.type === 'Edm.DateTimeOffset' || field.type === 'Edm.DateTime') record[field.name] = null;
    else record[field.name] = '';
  }
  return record;
}

function ensureShape(db) {
  if (!db.entities) db.entities = {};
  for (const service of require('./schema').services) {
    for (const entityName of Object.keys(service.entities)) {
      const key = `${service.id}.${entityName}`;
      if (!Array.isArray(db.entities[key])) db.entities[key] = [];
    }
  }
  return db;
}

function loadDatabase() {
  if (database) return database;
  if (fs.existsSync(DATA_FILE)) {
    try {
      const raw = fs.readFileSync(DATA_FILE, 'utf8');
      database = ensureShape(JSON.parse(raw));
      return database;
    } catch (error) {
      const backup = `${DATA_FILE}.corrupt-${Date.now()}`;
      try {
        fs.renameSync(DATA_FILE, backup);
      } catch (_) {
        /* ignore */
      }
      console.warn(`[store] Could not read ${DATA_FILE} (${error.message}). Re-seeding.`);
    }
  }
  database = buildSeed();
  save();
  return database;
}

function save() {
  if (!database) return;
  if (transactionDepth > 0) return;
  const dir = path.dirname(DATA_FILE);
  fs.mkdirSync(dir, { recursive: true });
  const tmp = `${DATA_FILE}.tmp`;
  fs.writeFileSync(tmp, JSON.stringify(database, null, 2), 'utf8');
  fs.renameSync(tmp, DATA_FILE);
}

/* ------------------------------------------------------------------------- */
/* Transactions                                                              */
/* ------------------------------------------------------------------------- */

let transactionDepth = 0;
let transactionSnapshot = null;

/**
 * Runs a set of store mutations atomically. Writes are deferred until the
 * outermost transaction commits; any exception restores the previous snapshot.
 */
function transaction(work) {
  loadDatabase();
  if (transactionDepth === 0) transactionSnapshot = JSON.stringify(database);
  transactionDepth++;
  try {
    const result = work();
    transactionDepth--;
    if (transactionDepth === 0) {
      transactionSnapshot = null;
      save();
    }
    return result;
  } catch (error) {
    transactionDepth--;
    if (transactionDepth === 0 && transactionSnapshot) {
      database = JSON.parse(transactionSnapshot);
      transactionSnapshot = null;
    }
    throw error;
  }
}

function rows(serviceId, entityName) {
  const db = loadDatabase();
  const key = `${serviceId}.${entityName}`;
  if (!db.entities[key]) db.entities[key] = [];
  return db.entities[key];
}

function all(serviceId, entityName) {
  return rows(serviceId, entityName);
}

function filter(serviceId, entityName, predicate) {
  return rows(serviceId, entityName).filter(predicate);
}

function find(serviceId, entityName, predicate) {
  return rows(serviceId, entityName).find(predicate);
}

function keyOf(entityDef, record) {
  const key = {};
  for (const field of entityDef.key) key[field] = record[field];
  return key;
}

function sameKey(entityDef, record, key) {
  return entityDef.key.every((field) => String(record[field]) === String(key[field]));
}

function getByKey(serviceId, entityName, key) {
  const entityDef = getEntity(serviceId, entityName);
  if (!entityDef) return null;
  return find(serviceId, entityName, (record) => sameKey(entityDef, record, key)) || null;
}

function insert(serviceId, entityName, input) {
  const entityDef = getEntity(serviceId, entityName);
  if (!entityDef) throw new Error(`Unknown entity ${serviceId}.${entityName}`);
  const record = { ...emptyRecord(entityDef), ...deepClone(input) };
  for (const keyField of entityDef.key) {
    if (record[keyField] === undefined || record[keyField] === null || record[keyField] === '') {
      throw new Error(`Missing key field ${keyField} for ${entityName}`);
    }
  }
  rows(serviceId, entityName).push(record);
  save();
  return record;
}

function update(serviceId, entityName, key, patch) {
  const entityDef = getEntity(serviceId, entityName);
  const list = rows(serviceId, entityName);
  const index = list.findIndex((record) => sameKey(entityDef, record, key));
  if (index === -1) return null;
  const next = { ...list[index], ...deepClone(patch) };
  for (const field of entityDef.key) next[field] = list[index][field];
  list[index] = next;
  save();
  return next;
}

function remove(serviceId, entityName, key) {
  const entityDef = getEntity(serviceId, entityName);
  const list = rows(serviceId, entityName);
  const index = list.findIndex((record) => sameKey(entityDef, record, key));
  if (index === -1) return null;
  const [removed] = list.splice(index, 1);
  save();
  return removed;
}

function removeWhere(serviceId, entityName, predicate) {
  const list = rows(serviceId, entityName);
  let removed = 0;
  for (let i = list.length - 1; i >= 0; i--) {
    if (predicate(list[i])) {
      list.splice(i, 1);
      removed++;
    }
  }
  if (removed) save();
  return removed;
}

function nextNumericKey(serviceId, entityName, start, width) {
  const entityDef = getEntity(serviceId, entityName);
  const list = rows(serviceId, entityName);
  let max = start - 1;
  for (const record of list) {
    const raw = String(record[entityDef.key[0]]);
    const match = /^0*(\d+)$/.exec(raw);
    if (!match) continue;
    const value = Number(match[1]);
    if (Number.isFinite(value) && value > max) max = value;
  }
  const next = Math.max(start, max + 1);
  const text = width ? String(next).padStart(width, '0') : String(next);
  return text;
}

function reset() {
  database = buildSeed();
  save();
  return database;
}

function meta() {
  return loadDatabase().meta;
}

function counts() {
  const db = loadDatabase();
  const result = {};
  for (const [key, value] of Object.entries(db.entities)) result[key] = value.length;
  return result;
}

function info() {
  const db = loadDatabase();
  return { file: DATA_FILE, meta: db.meta, counts: counts() };
}

function flush() {
  save();
}

module.exports = {
  DATA_FILE,
  loadDatabase,
  save,
  all,
  filter,
  find,
  getByKey,
  insert,
  update,
  remove,
  removeWhere,
  nextNumericKey,
  transaction,
  emptyRecord,
  reset,
  meta,
  counts,
  info,
  flush,
  keyOf
};
