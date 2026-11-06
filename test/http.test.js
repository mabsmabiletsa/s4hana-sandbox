'use strict';

const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('fs');
const os = require('os');
const path = require('path');

// Must be configured before server -> store is required.
const dataFile = path.join(os.tmpdir(), `s4-http-test-${process.pid}-${Date.now()}.json`);
process.env.S4_DATA_FILE = dataFile;
process.env.S4_ALLOW_ANONYMOUS_WRITE = 'true';
delete process.env.S4_ALLOW_RESET;

const { createApp } = require('../server');

const USERS = {
  anonymous: null,
  developer: { user: 'DEVELOPER', password: 'Password1' },
  demo: { user: 'DEMO', password: 'Demo1234' }
};

let server;
let base;

function authHeader(user) {
  if (!user) return {};
  return { authorization: `Basic ${Buffer.from(`${user.user}:${user.password}`).toString('base64')}` };
}

async function api(pathname, { method = 'GET', body, user = null, headers = {} } = {}) {
  const init = { method, headers: { ...headers } };
  if (body !== undefined) {
    init.headers['content-type'] = 'application/json';
    init.body = typeof body === 'string' ? body : JSON.stringify(body);
  }
  Object.assign(init.headers, authHeader(user));
  const res = await fetch(base + pathname, init);
  const text = await res.text();
  let json = null;
  try {
    json = text ? JSON.parse(text) : null;
  } catch (_) {
    json = null;
  }
  return { res, status: res.status, headers: res.headers, text, json };
}

const odata = (pathname) => `/sap/opu/odata/sap${pathname}`;

test.before(async () => {
  const app = createApp();
  await new Promise((resolve) => {
    server = app.listen(0, '127.0.0.1', resolve);
  });
  base = `http://127.0.0.1:${server.address().port}`;
});

test.after(async () => {
  if (server) await new Promise((resolve) => server.close(resolve));
  for (const file of [dataFile, `${dataFile}.tmp`]) {
    try {
      if (fs.existsSync(file)) fs.unlinkSync(file);
    } catch (_) {
      /* ignore */
    }
  }
});

test('health, catalog and stats agree on the seeded dataset', async () => {
  const health = await api('/api/health');
  assert.equal(health.status, 200);
  assert.equal(health.json.status, 'ok');
  assert.equal(health.json.records, 1278);
  assert.ok(health.res.headers.get('x-request-id'));

  const catalog = await api('/api/catalog');
  assert.equal(catalog.status, 200);
  assert.equal(catalog.json.services.length, 6);
  const entityCount = catalog.json.services.reduce((sum, service) => sum + service.entities.length, 0);
  assert.equal(entityCount, 15);
  assert.equal(catalog.json.auth.anonymousWrite, true);

  const stats = await api('/api/stats');
  assert.equal(stats.status, 200);
  assert.equal(stats.json.counts.total, 1278);
  assert.equal(stats.json.businessPartners.total, 62);
  assert.equal(stats.json.sales.orders, 68);
  assert.equal(Object.values(stats.json.counts.byEntity).reduce((sum, value) => sum + value, 0), 1278);
});

test('OData service catalog and metadata are available', async () => {
  const catalog = await api(odata(''));
  assert.equal(catalog.status, 200);
  assert.equal(catalog.json.d.services.length, 6);

  const service = await api(odata('/API_SALES_ORDER_SRV'));
  assert.equal(service.status, 200);
  assert.ok(service.json.d.EntitySets.includes('A_SalesOrder'));

  for (const id of ['API_BUSINESS_PARTNER', 'API_PRODUCT_SRV', 'API_SALES_ORDER_SRV', 'API_PURCHASEORDER_PROCESS_SRV', 'API_BILLING_DOCUMENT_SRV', 'API_JOURNAL_ENTRY_SRV']) {
    const metadata = await api(odata(`/${id}/$metadata`));
    assert.equal(metadata.status, 200, `${id} metadata status`);
    assert.match(metadata.headers.get('content-type'), /xml/);
    assert.match(metadata.text, /edmx:Edmx/);
  }

  const missing = await api(odata('/NOPE/A_Thing'));
  assert.equal(missing.status, 404);
  assert.equal(missing.json.error.code, '404');
});

test('collection queries return the OData V2 envelope and honour options', async () => {
  const list = await api(odata('/API_BUSINESS_PARTNER/A_BusinessPartner') + '?$top=5&$count=true&$orderby=BusinessPartner asc');
  assert.equal(list.status, 200);
  assert.equal(list.headers.get('dataserviceversion'), '2.0');
  assert.equal(list.json.d.results.length, 5);
  assert.equal(list.json.d.__count, '62');
  assert.equal(list.json.d.results[0].__metadata.type, 'API_BUSINESS_PARTNER.A_BusinessPartnerType');
  assert.ok(list.json.d.results[0].__metadata.uri.includes('/A_BusinessPartner('));

  const filtered = await api(
    odata('/API_SALES_ORDER_SRV/A_SalesOrder') +
      `?$filter=${encodeURIComponent("OverallDeliveryStatus eq 'A'")}&$select=SalesOrder,OverallDeliveryStatus&$top=4`
  );
  assert.equal(filtered.status, 200);
  assert.ok(filtered.json.d.results.length > 0);
  for (const row of filtered.json.d.results) {
    assert.equal(row.OverallDeliveryStatus, 'A');
    assert.ok(row.SalesOrder);
    assert.equal(row.SoldToParty, undefined);
  }

  const invalid = await api(odata('/API_SALES_ORDER_SRV/A_SalesOrder') + '?$filter=NoSuchField%20eq%201');
  assert.equal(invalid.status, 400);
  assert.equal(invalid.json.error.code, '400');
});

test('single entities and navigation properties resolve', async () => {
  const order = await api(odata("/API_SALES_ORDER_SRV/A_SalesOrder('0000001001')"));
  assert.equal(order.status, 200);
  assert.equal(order.json.d.SalesOrder, '0000001001');

  const items = await api(odata("/API_SALES_ORDER_SRV/A_SalesOrder('0000001001')/to_Items") + '?$count=true');
  assert.equal(items.status, 200);
  assert.ok(Array.isArray(items.json.d.results));
  assert.equal(Number(items.json.d.__count), items.json.d.results.length);
  assert.ok(items.json.d.results.length >= 1);

  const count = await api(odata("/API_SALES_ORDER_SRV/A_SalesOrder('0000001001')/to_Items/$count"));
  assert.equal(count.status, 200);
  assert.equal(Number(count.text), items.json.d.results.length);

  const product = await api(odata("/API_SALES_ORDER_SRV/A_SalesOrderItem(SalesOrder='0000001001',SalesOrderItem='000010')/to_Product"));
  assert.equal(product.status, 200);
  assert.ok(product.json.d.Product);

  const missing = await api(odata("/API_SALES_ORDER_SRV/A_SalesOrder('9999999999')"));
  assert.equal(missing.status, 404);
});

test('business partner create, address/role propagation, patch, put and delete', async () => {
  const created = await api(odata('/API_BUSINESS_PARTNER/A_BusinessPartner'), {
    method: 'POST',
    body: {
      BusinessPartnerName: 'Test Cooperative Ltd',
      BusinessPartnerCategory: '2',
      Country: 'DE',
      CityName: 'Hamburg',
      StreetName: 'Testweg',
      HouseNumber: '12',
      to_Roles: [{ BusinessPartnerRole: 'FLCU00' }]
    }
  });
  assert.equal(created.status, 201);
  const bp = created.json.d;
  const bpKey = bp.BusinessPartner;
  assert.match(bpKey, /^\d{7}$/);
  assert.equal(created.headers.get('location').endsWith(`A_BusinessPartner('${bpKey}')`), true);
  assert.equal(bp.CountryName, 'Germany');
  assert.equal(bp.BusinessPartnerFullName, 'Test Cooperative Ltd');
  assert.match(bp.CreationDate, /^\d{4}-\d{2}-\d{2}$/);

  const customer = await api(odata(`/API_BUSINESS_PARTNER/A_Customer('${bpKey}')`));
  assert.equal(customer.status, 200);
  assert.equal(customer.json.d.CustomerName, 'Test Cooperative Ltd');

  const addresses = await api(odata(`/API_BUSINESS_PARTNER/A_BusinessPartner('${bpKey}')/to_Addresses`));
  assert.equal(addresses.json.d.results.length, 1);
  assert.equal(addresses.json.d.results[0].CityName, 'Hamburg');
  assert.equal(addresses.json.d.results[0].IsDefaultAddress, true);

  const roles = await api(odata(`/API_BUSINESS_PARTNER/A_BusinessPartner('${bpKey}')/to_Roles`));
  assert.equal(roles.json.d.results.length, 1);
  assert.equal(roles.json.d.results[0].BusinessPartnerRole, 'FLCU00');

  const patched = await api(odata(`/API_BUSINESS_PARTNER/A_BusinessPartner('${bpKey}')`), {
    method: 'PATCH',
    body: { CityName: 'Bremen' }
  });
  assert.equal(patched.status, 204);
  const afterPatch = await api(odata(`/API_BUSINESS_PARTNER/A_BusinessPartner('${bpKey}')`));
  assert.equal(afterPatch.json.d.CityName, 'Bremen');
  assert.equal(afterPatch.json.d.BusinessPartnerFullName, 'Test Cooperative Ltd');

  const readOnlyPatch = await api(odata(`/API_BUSINESS_PARTNER/A_BusinessPartner('${bpKey}')`), {
    method: 'PATCH',
    body: { CountryName: 'Germany' }
  });
  assert.equal(readOnlyPatch.status, 400);

  const replaced = await api(odata(`/API_BUSINESS_PARTNER/A_BusinessPartner('${bpKey}')`), {
    method: 'PUT',
    body: { BusinessPartnerName: 'Test Cooperative Renamed', BusinessPartnerCategory: '2' }
  });
  assert.equal(replaced.status, 204);
  const afterPut = await api(odata(`/API_BUSINESS_PARTNER/A_BusinessPartner('${bpKey}')`));
  assert.equal(afterPut.json.d.BusinessPartnerFullName, 'Test Cooperative Renamed');
  assert.equal(afterPut.json.d.CityName, '');
  const renamedCustomer = await api(odata(`/API_BUSINESS_PARTNER/A_Customer('${bpKey}')`));
  assert.equal(renamedCustomer.json.d.CustomerName, 'Test Cooperative Renamed');

  const deleted = await api(odata(`/API_BUSINESS_PARTNER/A_BusinessPartner('${bpKey}')`), { method: 'DELETE' });
  assert.equal(deleted.status, 204);
  const gone = await api(odata(`/API_BUSINESS_PARTNER/A_BusinessPartner('${bpKey}')`));
  assert.equal(gone.status, 404);
  const customerGone = await api(odata(`/API_BUSINESS_PARTNER/A_Customer('${bpKey}')`));
  assert.equal(customerGone.status, 404);
  const addressesGone = await api(odata(`/API_BUSINESS_PARTNER/A_BusinessPartnerAddress?$filter=${encodeURIComponent(`BusinessPartner eq '${bpKey}'`)}&$count=true`));
  assert.equal(addressesGone.json.d.__count, '0');
});

test('business partner deletion is blocked while sales orders reference it', async () => {
  const order = await api(odata('/API_SALES_ORDER_SRV/A_SalesOrder') + '?$top=1&$select=SoldToParty');
  const soldTo = order.json.d.results[0].SoldToParty;
  const conflict = await api(odata(`/API_BUSINESS_PARTNER/A_BusinessPartner('${soldTo}')`), { method: 'DELETE' });
  assert.equal(conflict.status, 409);
  assert.match(conflict.json.error.message.value, /cannot be deleted/);
});

test('sales order deep insert creates items and schedule lines', async () => {
  const products = await api(odata('/API_PRODUCT_SRV/A_Product') + '?$top=1&$orderby=Product asc');
  const product = products.json.d.results[0];
  const customers = await api(odata('/API_BUSINESS_PARTNER/A_Customer') + '?$top=1&$orderby=Customer asc');
  const customer = customers.json.d.results[0];

  const created = await api(odata('/API_SALES_ORDER_SRV/A_SalesOrder'), {
    method: 'POST',
    body: {
      SalesOrderType: 'OR',
      SoldToParty: customer.Customer,
      to_Items: [{ Material: product.Product, RequestedQuantity: 2 }]
    }
  });
  assert.equal(created.status, 201);
  const order = created.json.d;
  const orderKey = order.SalesOrder;
  assert.match(orderKey, /^\d{10}$/);
  assert.equal(order.ShipToParty, customer.Customer);
  assert.equal(order.OverallDeliveryStatus, 'A');
  assert.equal(order.OverallBillingStatus, 'A');
  assert.equal(order.TotalNetAmount, Math.round(Number(product.StandardPrice) * 2 * 100) / 100);

  const items = await api(odata(`/API_SALES_ORDER_SRV/A_SalesOrder('${orderKey}')/to_Items`));
  assert.equal(items.status, 200);
  assert.equal(items.json.d.results.length, 1);
  const item = items.json.d.results[0];
  assert.equal(item.Material, product.Product);
  assert.equal(item.SalesOrderItem, '000010');
  assert.equal(item.RequestedQuantity, 2);
  assert.equal(item.NetAmount, order.TotalNetAmount);

  const schedules = await api(odata(`/API_SALES_ORDER_SRV/A_SalesOrderItem(SalesOrder='${orderKey}',SalesOrderItem='000010')/to_ScheduleLines`));
  assert.equal(schedules.status, 200);
  assert.equal(schedules.json.d.results.length, 1);
  assert.equal(schedules.json.d.results[0].ConfirmedQuantity, Math.round(2 * 0.8 * 1000) / 1000);

  const noItems = await api(odata('/API_SALES_ORDER_SRV/A_SalesOrder'), {
    method: 'POST',
    body: { SoldToParty: customer.Customer, to_Items: [] }
  });
  assert.equal(noItems.status, 400);

  const badCustomer = await api(odata('/API_SALES_ORDER_SRV/A_SalesOrder'), {
    method: 'POST',
    body: { SoldToParty: '9999999', to_Items: [{ Material: product.Product, RequestedQuantity: 1 }] }
  });
  assert.equal(badCustomer.status, 400);

  const badMaterial = await api(odata('/API_SALES_ORDER_SRV/A_SalesOrder'), {
    method: 'POST',
    body: { SoldToParty: customer.Customer, to_Items: [{ Material: 'NOPE', RequestedQuantity: 1 }] }
  });
  assert.equal(badMaterial.status, 400);

  const duplicate = await api(odata('/API_SALES_ORDER_SRV/A_SalesOrder'), {
    method: 'POST',
    body: { SalesOrder: '0000001001', SoldToParty: customer.Customer, to_Items: [{ Material: product.Product, RequestedQuantity: 1 }] }
  });
  assert.equal(duplicate.status, 409);

  const deleted = await api(odata(`/API_SALES_ORDER_SRV/A_SalesOrder('${orderKey}')`), { method: 'DELETE' });
  assert.equal(deleted.status, 204);
  const itemCount = await api(
    odata('/API_SALES_ORDER_SRV/A_SalesOrderItem') +
      `?$filter=${encodeURIComponent(`SalesOrder eq '${orderKey}'`)}&$count=true`
  );
  assert.equal(itemCount.json.d.__count, '0');
  const scheduleCount = await api(
    odata('/API_SALES_ORDER_SRV/A_SalesOrderScheduleLine') +
      `?$filter=${encodeURIComponent(`SalesOrder eq '${orderKey}'`)}&$count=true`
  );
  assert.equal(scheduleCount.json.d.__count, '0');
});

test('authentication gates writes and exposes capabilities', async () => {
  const anonymous = await api('/api/me');
  assert.equal(anonymous.json.user.anonymous, true);
  assert.equal(anonymous.json.capabilities.write, true);

  const demo = await api('/api/me', { user: USERS.demo });
  assert.equal(demo.json.user.id, 'DEMO');
  assert.equal(demo.json.capabilities.write, false);
  assert.equal(demo.json.capabilities.reset, false);

  const developer = await api('/api/me', { user: USERS.developer });
  assert.equal(developer.json.capabilities.write, true);

  const denied = await api(odata('/API_BUSINESS_PARTNER/A_BusinessPartner'), {
    method: 'POST',
    user: USERS.demo,
    body: { BusinessPartnerName: 'Should Not Exist' }
  });
  assert.equal(denied.status, 403);
  assert.match(denied.json.error.message.value, /read-only/);

  const stillReads = await api(odata('/API_BUSINESS_PARTNER/A_BusinessPartner') + '?$top=1', { user: USERS.demo });
  assert.equal(stillReads.status, 200);

  const badPassword = await fetch(base + '/api/me', {
    headers: { authorization: `Basic ${Buffer.from('DEMO:wrong').toString('base64')}` }
  });
  assert.equal(badPassword.status, 401);
  assert.match(badPassword.headers.get('www-authenticate'), /Basic realm=/);
});

test('reset restores the seed and requires the confirmation header', async () => {
  const blocked = await api('/api/reset', { method: 'POST' });
  assert.equal(blocked.status, 400);

  const wrongHeader = await api('/api/reset', { method: 'POST', headers: { 'x-confirm-reset': 'nope' } });
  assert.equal(wrongHeader.status, 400);

  const reset = await api('/api/reset', { method: 'POST', headers: { 'x-confirm-reset': 'reset' } });
  assert.equal(reset.status, 200);
  assert.equal(reset.json.status, 'reset');
  assert.equal(Object.values(reset.json.counts).reduce((sum, value) => sum + value, 0), 1278);

  const stats = await api('/api/stats');
  assert.equal(stats.json.counts.total, 1278);
});

test('search endpoint and static UI are served', async () => {
  const results = await api('/api/search?q=orion&limit=3');
  assert.equal(results.status, 200);
  assert.ok(results.json.total >= 1);
  assert.ok(results.json.groups.every((group) => group.records.length <= 3));

  const index = await api('/');
  assert.equal(index.status, 200);
  assert.match(index.headers.get('content-type'), /text\/html/);
  assert.match(index.text, /S\/4HANA Sandbox/);
  assert.match(index.text, /\/js\/app\.js/);

  const css = await api('/css/app.css');
  assert.equal(css.status, 200);
  assert.match(css.headers.get('content-type'), /text\/css/);

  const fallback = await api('/some/deep/link');
  assert.equal(fallback.status, 200);
  assert.match(fallback.text, /id="app"/);
});
