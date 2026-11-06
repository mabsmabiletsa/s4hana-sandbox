'use strict';

const test = require('node:test');
const assert = require('node:assert/strict');

const { buildSeed } = require('../src/seed');
const { getEntity } = require('../src/schema');
const { ApiError } = require('../src/errors');
const {
  parseQuery,
  applyCollection,
  parseOrderBy,
  projectRecord
} = require('../src/odata/query');

const db = buildSeed();
const orders = db.entities['API_SALES_ORDER_SRV.A_SalesOrder'];
const entity = getEntity('API_SALES_ORDER_SRV', 'A_SalesOrder');

const run = (query, records = orders) => {
  const parsed = parseQuery(query, entity);
  return { parsed, ...applyCollection(records, parsed, entity) };
};

test('$filter equality returns the same rows as a manual filter', () => {
  const soldTo = orders[0].SoldToParty;
  const expected = orders.filter((row) => row.SoldToParty === soldTo).length;
  const { rows, count } = run({ $filter: `SoldToParty eq '${soldTo}'` });
  assert.equal(count, expected);
  assert.equal(rows.length, expected);
  assert.ok(rows.every((row) => row.SoldToParty === soldTo));
});

test('$filter supports numeric comparison and boolean combination', () => {
  const threshold = 20000;
  const expected = orders.filter(
    (row) => Number(row.TotalNetAmount) > threshold && row.OverallDeliveryStatus !== 'C'
  ).length;
  const { count } = run({
    $filter: `TotalNetAmount gt ${threshold} and OverallDeliveryStatus ne 'C'`
  });
  assert.equal(count, expected);
});

test('$filter supports string functions', () => {
  const token = orders[0].SoldToPartyName.slice(0, 4).toLowerCase();
  const expected = orders.filter((row) =>
    String(row.SoldToPartyName).toLowerCase().includes(token)
  ).length;
  const { count } = run({ $filter: `contains(tolower(SoldToPartyName),'${token}')` });
  assert.equal(count, expected);
});

test('$orderby sorts numerically and in the requested direction', () => {
  const { rows } = run({ $orderby: 'TotalNetAmount desc', $top: '12' });
  assert.equal(rows.length, 12);
  for (let i = 1; i < rows.length; i += 1) {
    assert.ok(Number(rows[i - 1].TotalNetAmount) >= Number(rows[i].TotalNetAmount));
  }
});

test('$top and $skip page without changing the total count', () => {
  const all = run({ $orderby: 'SalesOrder asc' });
  const page = run({ $orderby: 'SalesOrder asc', $top: '7', $skip: '5' });
  assert.equal(page.count, all.count);
  assert.deepEqual(
    page.rows.map((row) => row.SalesOrder),
    all.rows.slice(5, 12).map((row) => row.SalesOrder)
  );
});

test('$count exposes the pre-paging count', () => {
  const { count, rows } = run({ $top: '3', $count: 'true' });
  assert.equal(rows.length, 3);
  assert.equal(count, orders.length);
});

test('$select projects requested fields but always keeps the key', () => {
  const { parsed, rows } = run({ $select: 'TotalNetAmount', $top: '1' });
  const projected = projectRecord(rows[0], parsed, entity);
  assert.equal(projected.SalesOrder, rows[0].SalesOrder);
  assert.equal(projected.TotalNetAmount, rows[0].TotalNetAmount);
  assert.equal(projected.SoldToParty, undefined);
});

test('$search matches configured search fields case-insensitively', () => {
  const token = orders[0].SoldToPartyName.split(/\s+/)[0];
  const { rows, count } = run({ $search: `"${token}"` });
  assert.ok(count >= 1);
  const searchFields = entity.ui.searchFields;
  for (const row of rows) {
    assert.ok(
      searchFields.some((field) => String(row[field] || '').toLowerCase().includes(token.toLowerCase())),
      `row ${row.SalesOrder} should match ${token}`
    );
  }
});

test('unknown filter fields and malformed paging are rejected with 400', () => {
  assert.throws(() => parseQuery({ $filter: 'NoSuchField eq 1' }, entity), (error) => {
    assert.ok(error instanceof ApiError);
    assert.equal(error.status, 400);
    return true;
  });
  assert.throws(() => parseQuery({ $top: 'many' }, entity), (error) => {
    assert.equal(error.status, 400);
    return true;
  });
  assert.throws(() => parseQuery({ $orderby: 'NoSuchField desc' }, entity), (error) => {
    assert.equal(error.status, 400);
    return true;
  });
  assert.throws(() => parseQuery({ $expand: 'NoSuchNav' }, entity), (error) => {
    assert.equal(error.status, 400);
    return true;
  });
});

test('parseOrderBy honours multiple sort keys and direction', () => {
  const parsed = parseOrderBy('OverallDeliveryStatus asc, TotalNetAmount desc', entity);
  assert.deepEqual(parsed, [
    { field: 'OverallDeliveryStatus', direction: 'asc' },
    { field: 'TotalNetAmount', direction: 'desc' }
  ]);
});
