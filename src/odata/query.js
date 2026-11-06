'use strict';

const { ApiError } = require('../errors');

/* ------------------------------------------------------------------------- */
/* Tokenizer                                                                 */
/* ------------------------------------------------------------------------- */

function tokenize(input) {
  const tokens = [];
  let i = 0;
  while (i < input.length) {
    const ch = input[i];
    if (/\s/.test(ch)) {
      i++;
      continue;
    }
    if (ch === '(' || ch === ')' || ch === ',') {
      tokens.push({ type: ch, value: ch });
      i++;
      continue;
    }
    if (ch === "'") {
      let j = i + 1;
      let value = '';
      let closed = false;
      while (j < input.length) {
        if (input[j] === "'") {
          if (input[j + 1] === "'") {
            value += "'";
            j += 2;
            continue;
          }
          j++;
          closed = true;
          break;
        }
        value += input[j++];
      }
      if (!closed) throw new ApiError(400, 'Unterminated string literal in $filter.');
      tokens.push({ type: 'literal', value, valueType: 'string' });
      i = j;
      continue;
    }
    const rest = input.slice(i);
    const number = /^-?\d+(?:\.\d+)?(?:[eE][+-]?\d+)?/.exec(rest);
    if (number && (ch === '-' || /[0-9]/.test(ch))) {
      tokens.push({ type: 'literal', value: Number(number[0]), valueType: 'number' });
      i += number[0].length;
      continue;
    }
    const ident = /^[A-Za-z_][A-Za-z0-9_./]*/.exec(rest);
    if (ident) {
      tokens.push({ type: 'ident', value: ident[0] });
      i += ident[0].length;
      continue;
    }
    throw new ApiError(400, `Unexpected character '${ch}' in $filter.`);
  }
  return tokens;
}

/* ------------------------------------------------------------------------- */
/* Recursive descent parser                                                  */
/* ------------------------------------------------------------------------- */

const COMPARISONS = new Set(['eq', 'ne', 'gt', 'ge', 'lt', 'le']);
const LITERAL_PREFIXES = new Set(['datetime', 'date', 'guid', 'time', 'datetimeoffset', 'binary']);

class FilterParser {
  constructor(text) {
    this.tokens = tokenize(text);
    this.index = 0;
  }

  peek(offset = 0) {
    return this.tokens[this.index + offset];
  }

  next() {
    return this.tokens[this.index++];
  }

  match(type, value) {
    const token = this.peek();
    if (!token || token.type !== type) return false;
    if (value !== undefined && token.value !== value) return false;
    this.index++;
    return true;
  }

  matchIdent(value) {
    return this.match('ident', value);
  }

  isIdent(value) {
    const token = this.peek();
    return !!token && token.type === 'ident' && token.value === value;
  }

  expect(type, value) {
    const token = this.next();
    if (!token || token.type !== type || (value !== undefined && token.value !== value)) {
      throw new ApiError(400, `Expected ${value || type} in $filter.`);
    }
    return token;
  }

  parse() {
    if (!this.tokens.length) throw new ApiError(400, '$filter is empty.');
    const ast = this.parseOr();
    if (this.index < this.tokens.length) {
      throw new ApiError(400, `Unexpected token '${this.peek().value}' in $filter.`);
    }
    return ast;
  }

  parseOr() {
    let left = this.parseAnd();
    while (this.matchIdent('or')) {
      left = { type: 'logical', op: 'or', left, right: this.parseAnd() };
    }
    return left;
  }

  parseAnd() {
    let left = this.parseUnary();
    while (this.matchIdent('and')) {
      left = { type: 'logical', op: 'and', left, right: this.parseUnary() };
    }
    return left;
  }

  parseUnary() {
    if (this.matchIdent('not')) {
      return { type: 'not', node: this.parseUnary() };
    }
    return this.parseComparison();
  }

  parseComparison() {
    const left = this.parsePrimary();
    const token = this.peek();
    if (token && token.type === 'ident' && COMPARISONS.has(token.value)) {
      this.next();
      const right = this.parsePrimary();
      return { type: 'comparison', op: token.value, left, right };
    }
    return left;
  }

  parsePrimary() {
    const token = this.peek();
    if (!token) throw new ApiError(400, 'Unexpected end of $filter expression.');
    if (token.type === '(') {
      this.next();
      const expr = this.parseOr();
      this.expect(')');
      return expr;
    }
    if (token.type === 'literal') {
      this.next();
      return { type: 'literal', value: token.value, valueType: token.valueType };
    }
    if (token.type === 'ident') {
      this.next();
      const name = token.value;
      const lower = name.toLowerCase();
      if (lower === 'true' || lower === 'false') {
        return { type: 'literal', value: lower === 'true', valueType: 'boolean' };
      }
      if (lower === 'null') {
        return { type: 'literal', value: null, valueType: 'null' };
      }
      if (LITERAL_PREFIXES.has(lower) && this.peek() && this.peek().type === 'literal') {
        const literal = this.next();
        return { type: 'literal', value: literal.value, valueType: lower === 'datetime' || lower === 'date' ? 'date' : 'string' };
      }
      if (this.peek() && this.peek().type === '(') {
        this.next();
        const args = [];
        if (!(this.peek() && this.peek().type === ')')) {
          do {
            args.push(this.parseOr());
          } while (this.match(','));
        }
        this.expect(')');
        return { type: 'call', name: lower, args };
      }
      return { type: 'path', name };
    }
    throw new ApiError(400, `Unexpected token '${token.value}' in $filter.`);
  }
}

function validateAst(node, entityDef) {
  if (!node) return;
  switch (node.type) {
    case 'path': {
      const root = node.name.split('/')[0];
      const found = entityDef.fieldMap[root]
        || Object.values(entityDef.fieldMap).find((f) => f.name.toLowerCase() === root.toLowerCase());
      if (!found) {
        throw new ApiError(400, `Property '${root}' does not exist on ${entityDef.name}.`);
      }
      break;
    }
    case 'comparison':
      validateAst(node.left, entityDef);
      validateAst(node.right, entityDef);
      break;
    case 'logical':
      validateAst(node.left, entityDef);
      validateAst(node.right, entityDef);
      break;
    case 'not':
      validateAst(node.node, entityDef);
      break;
    case 'call':
      node.args.forEach((arg) => validateAst(arg, entityDef));
      break;
    default:
  }
}

/* ------------------------------------------------------------------------- */
/* Evaluation                                                                */
/* ------------------------------------------------------------------------- */

function getPath(record, path) {
  const parts = path.split('/');
  let value = record;
  for (const part of parts) {
    if (value === null || value === undefined) return undefined;
    if (Object.prototype.hasOwnProperty.call(value, part)) {
      value = value[part];
    } else {
      const key = Object.keys(value).find((k) => k.toLowerCase() === part.toLowerCase());
      if (!key) return undefined;
      value = value[key];
    }
  }
  return value;
}

const normalize = (value) => (value === undefined ? null : value);

function compareValues(a, b) {
  if (a === null && b === null) return 0;
  if (a === null) return 1;
  if (b === null) return -1;
  if (typeof a === 'boolean' || typeof b === 'boolean') {
    return Number(Boolean(a)) - Number(Boolean(b));
  }
  const numberA = typeof a === 'number' ? a : Number(a);
  const numberB = typeof b === 'number' ? b : Number(b);
  if (Number.isFinite(numberA) && Number.isFinite(numberB) && String(a).trim() !== '' && String(b).trim() !== '') {
    return numberA - numberB;
  }
  return String(a).localeCompare(String(b), undefined, { sensitivity: 'base', numeric: true });
}

function equals(a, b) {
  const left = normalize(a);
  const right = normalize(b);
  if (left === null && right === null) return true;
  if (left === null || right === null) return false;
  if (typeof left === 'boolean' || typeof right === 'boolean') return Boolean(left) === Boolean(right);
  if (typeof left === 'number' && typeof right === 'number') return left === right;
  return String(left).toLowerCase() === String(right).toLowerCase();
}

function evaluate(node, record) {
  switch (node.type) {
    case 'literal':
      return node.value;
    case 'path':
      return getPath(record, node.name);
    case 'comparison': {
      const left = evaluate(node.left, record);
      const right = evaluate(node.right, record);
      switch (node.op) {
        case 'eq': return equals(left, right);
        case 'ne': return !equals(left, right);
        case 'gt': return compareValues(normalize(left), normalize(right)) > 0;
        case 'ge': return compareValues(normalize(left), normalize(right)) >= 0;
        case 'lt': return compareValues(normalize(left), normalize(right)) < 0;
        case 'le': return compareValues(normalize(left), normalize(right)) <= 0;
        default: return false;
      }
    }
    case 'logical':
      return node.op === 'and'
        ? Boolean(evaluate(node.left, record)) && Boolean(evaluate(node.right, record))
        : Boolean(evaluate(node.left, record)) || Boolean(evaluate(node.right, record));
    case 'not':
      return !evaluate(node.node, record);
    case 'call':
      return evaluateCall(node, record);
    default:
      return false;
  }
}

function evaluateCall(node, record) {
  const args = node.args.map((arg) => evaluate(arg, record));
  const text = (value) => String(value === null || value === undefined ? '' : value);
  switch (node.name) {
    case 'contains':
      return text(args[0]).toLowerCase().includes(text(args[1]).toLowerCase());
    case 'substringof':
      return text(args[1]).toLowerCase().includes(text(args[0]).toLowerCase());
    case 'startswith':
      return text(args[0]).toLowerCase().startsWith(text(args[1]).toLowerCase());
    case 'endswith':
      return text(args[0]).toLowerCase().endsWith(text(args[1]).toLowerCase());
    case 'tolower':
      return text(args[0]).toLowerCase();
    case 'toupper':
      return text(args[0]).toUpperCase();
    case 'trim':
      return text(args[0]).trim();
    case 'length':
      return text(args[0]).length;
    case 'indexof':
      return text(args[0]).toLowerCase().indexOf(text(args[1]).toLowerCase());
    case 'substring': {
      const value = text(args[0]);
      const start = Number(args[1]) || 0;
      return args.length > 2 ? value.substring(start, start + (Number(args[2]) || 0)) : value.substring(start);
    }
    case 'concat':
      return text(args[0]) + text(args[1]);
    case 'year':
      return Number(text(args[0]).slice(0, 4));
    case 'month':
      return Number(text(args[0]).slice(5, 7));
    case 'day':
      return Number(text(args[0]).slice(8, 10));
    case 'round':
      return Math.round(Number(args[0]));
    case 'floor':
      return Math.floor(Number(args[0]));
    case 'ceiling':
      return Math.ceil(Number(args[0]));
    default:
      throw new ApiError(400, `Unsupported function '${node.name}' in $filter.`);
  }
}

/* ------------------------------------------------------------------------- */
/* Query parsing / application                                               */
/* ------------------------------------------------------------------------- */

function splitTopLevel(text, separator) {
  const parts = [];
  let depth = 0;
  let current = '';
  for (const ch of text) {
    if (ch === '(') depth++;
    if (ch === ')') depth--;
    if (ch === separator && depth === 0) {
      parts.push(current);
      current = '';
    } else {
      current += ch;
    }
  }
  parts.push(current);
  return parts.map((p) => p.trim()).filter(Boolean);
}

function parseSelect(value, entityDef) {
  if (!value) return null;
  const fields = splitTopLevel(value, ',');
  if (fields.includes('*')) return null;
  for (const name of fields) {
    if (!entityDef.fieldMap[name]) {
      throw new ApiError(400, `Property '${name}' cannot be selected from ${entityDef.name}.`);
    }
  }
  return fields;
}

function parseOrderBy(value, entityDef) {
  if (!value) return null;
  return splitTopLevel(value, ',').map((part) => {
    const [name, direction] = part.split(/\s+/);
    if (!entityDef.fieldMap[name]) {
      throw new ApiError(400, `Cannot order by unknown property '${name}'.`);
    }
    return { field: name, direction: (direction || 'asc').toLowerCase() === 'desc' ? 'desc' : 'asc' };
  });
}

function parseExpand(value, entityDef) {
  if (!value) return {};
  const expand = {};
  for (const part of splitTopLevel(value, ',')) {
    if (part === '*') {
      expand.__all = {};
      continue;
    }
    const match = /^([A-Za-z_][A-Za-z0-9_]*)(?:\((.*)\))?$/.exec(part);
    if (!match) throw new ApiError(400, `Invalid $expand expression '${part}'.`);
    const name = match[1];
    if (!entityDef.navMap[name]) {
      throw new ApiError(400, `Navigation property '${name}' does not exist on ${entityDef.name}.`);
    }
    const options = {};
    if (match[2]) {
      for (const option of splitTopLevel(match[2], ';')) {
        const [key, ...rest] = option.split('=');
        const optionValue = rest.join('=');
        if (key === '$top') options.top = Math.max(0, Number(optionValue) || 0);
        else if (key === '$skip') options.skip = Math.max(0, Number(optionValue) || 0);
        else if (key === '$select') options.select = optionValue.split(',').map((s) => s.trim()).filter(Boolean);
        else if (key === '$orderby') options.orderby = optionValue;
      }
    }
    expand[name] = options;
  }
  return expand;
}

function parseInteger(value, name, fallback, max) {
  if (value === undefined) return fallback;
  const number = Number(value);
  if (!Number.isInteger(number) || number < 0) {
    throw new ApiError(400, `$${name} must be a non-negative integer.`);
  }
  return max ? Math.min(number, max) : number;
}

function parseQuery(query, entityDef) {
  const parsed = {
    filter: null,
    select: null,
    orderby: null,
    top: parseInteger(query.$top, 'top', 100, 5000),
    skip: parseInteger(query.$skip, 'skip', 0),
    count: query.$count === 'true' || query.$inlinecount === 'allpages',
    expand: parseExpand(query.$expand, entityDef),
    search: query.$search ? String(query.$search).replace(/^"|"$/g, '') : null
  };

  if (query.$filter) {
    const ast = new FilterParser(String(query.$filter)).parse();
    validateAst(ast, entityDef);
    parsed.filter = ast;
  }
  parsed.select = parseSelect(query.$select, entityDef);
  parsed.orderby = parseOrderBy(query.$orderby, entityDef);
  return parsed;
}

function applyOrder(records, orderby, entityDef) {
  if (!orderby || !orderby.length) return records;
  const sorted = [...records];
  sorted.sort((a, b) => {
    for (const rule of orderby) {
      const field = entityDef.fieldMap[rule.field];
      const aValue = normalize(a[rule.field]);
      const bValue = normalize(b[rule.field]);
      let result;
      if (aValue === null && bValue === null) result = 0;
      else if (aValue === null) result = 1;
      else if (bValue === null) result = -1;
      else if (field && (field.type === 'Edm.Decimal' || field.type === 'Edm.Int32' || field.type === 'Edm.Int64' || field.type === 'Edm.Double')) {
        result = Number(aValue) - Number(bValue);
      } else {
        result = String(aValue).localeCompare(String(bValue), undefined, { sensitivity: 'base', numeric: true });
      }
      if (result !== 0) return rule.direction === 'desc' ? -result : result;
    }
    return 0;
  });
  return sorted;
}

function applySearch(records, term, entityDef) {
  if (!term) return records;
  const needle = String(term).toLowerCase();
  const fields = (entityDef.ui && entityDef.ui.searchFields) || entityDef.fields.map((f) => f.name);
  return records.filter((record) => fields.some((field) => {
    const value = record[field];
    return value !== null && value !== undefined && String(value).toLowerCase().includes(needle);
  }));
}

/**
 * Filters, searches, sorts and pages a collection.
 * Returns the full match count before paging so callers can emit __count.
 */
function applyCollection(records, parsed, entityDef) {
  let result = records;
  if (parsed.filter) result = result.filter((record) => Boolean(evaluate(parsed.filter, record)));
  if (parsed.search) result = applySearch(result, parsed.search, entityDef);
  const count = result.length;
  result = applyOrder(result, parsed.orderby || parseOrderBy(entityDef.ui.defaultOrder, entityDef), entityDef);
  const start = parsed.skip;
  const end = start + parsed.top;
  return { rows: result.slice(start, end), count };
}

function projectRecord(record, parsed, entityDef) {
  if (!parsed || !parsed.select) return { ...record };
  const projected = {};
  const fields = new Set(parsed.select);
  if (entityDef) entityDef.key.forEach((key) => fields.add(key));
  for (const field of fields) projected[field] = record[field];
  return projected;
}

function projectExpanded(record, options) {
  if (!options || !options.select) return record;
  const projected = {};
  for (const field of options.select) projected[field] = record[field];
  return projected;
}

module.exports = {
  parseQuery,
  applyCollection,
  applyOrder,
  projectRecord,
  projectExpanded,
  evaluate,
  compareValues,
  parseOrderBy,
  splitTopLevel
};
