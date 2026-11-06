'use strict';

const test = require('node:test');
const assert = require('node:assert/strict');

const { buildSeed } = require('../src/seed');
const { services } = require('../src/schema');

const db = buildSeed();
const e = db.entities;

const EXPECTED_COUNTS = {
  'API_BUSINESS_PARTNER.A_BusinessPartner': 62,
  'API_BUSINESS_PARTNER.A_BusinessPartnerAddress': 77,
  'API_BUSINESS_PARTNER.A_BusinessPartnerRole': 67,
  'API_BUSINESS_PARTNER.A_Customer': 40,
  'API_BUSINESS_PARTNER.A_Supplier': 19,
  'API_PRODUCT_SRV.A_Product': 52,
  'API_SALES_ORDER_SRV.A_SalesOrder': 68,
  'API_SALES_ORDER_SRV.A_SalesOrderItem': 166,
  'API_SALES_ORDER_SRV.A_SalesOrderScheduleLine': 166,
  'API_BILLING_DOCUMENT_SRV.A_BillingDocument': 45,
  'API_BILLING_DOCUMENT_SRV.A_BillingDocumentItem': 97,
  'API_PURCHASEORDER_PROCESS_SRV.A_PurchaseOrder': 40,
  'API_PURCHASEORDER_PROCESS_SRV.A_PurchaseOrderItem': 79,
  'API_JOURNAL_ENTRY_SRV.A_JournalEntry': 85,
  'API_JOURNAL_ENTRY_SRV.A_JournalEntryItem': 215
};

const index = (list, ...fields) => new Set(list.map((row) => fields.map((field) => row[field]).join('|')));
const round2 = (value) => Math.round((Number(value) + Number.EPSILON) * 100) / 100;

test('seed produces the documented record counts for every entity set', () => {
  assert.equal(Object.keys(e).length, Object.keys(EXPECTED_COUNTS).length);
  for (const [key, expected] of Object.entries(EXPECTED_COUNTS)) {
    assert.ok(Array.isArray(e[key]), `${key} should exist`);
    assert.equal(e[key].length, expected, `${key} count`);
  }
  assert.equal(new Set(Object.values(e).flat().map((row) => JSON.stringify(row))).size > 0, true);
});

test('seed is deterministic for entity data', () => {
  const again = buildSeed();
  assert.deepEqual(again.entities, e);
});

test('every entity set has a unique primary key', () => {
  for (const service of services) {
    for (const entity of Object.values(service.entities)) {
      const key = `${service.id}.${entity.name}`;
      const values = index(e[key] || [], ...entity.key);
      assert.equal(values.size, (e[key] || []).length, `${key} has duplicate keys`);
    }
  }
});

test('master data relationships are consistent', () => {
  const bpIds = new Set(e['API_BUSINESS_PARTNER.A_BusinessPartner'].map((row) => row.BusinessPartner));
  const customerIds = new Set(e['API_BUSINESS_PARTNER.A_Customer'].map((row) => row.Customer));
  const supplierIds = new Set(e['API_BUSINESS_PARTNER.A_Supplier'].map((row) => row.Supplier));
  const productIds = new Set(e['API_PRODUCT_SRV.A_Product'].map((row) => row.Product));
  const orderIds = new Set(e['API_SALES_ORDER_SRV.A_SalesOrder'].map((row) => row.SalesOrder));

  for (const address of e['API_BUSINESS_PARTNER.A_BusinessPartnerAddress']) {
    assert.ok(bpIds.has(address.BusinessPartner), `address references ${address.BusinessPartner}`);
  }
  for (const role of e['API_BUSINESS_PARTNER.A_BusinessPartnerRole']) {
    assert.ok(bpIds.has(role.BusinessPartner), `role references ${role.BusinessPartner}`);
  }
  for (const customer of e['API_BUSINESS_PARTNER.A_Customer']) {
    assert.ok(bpIds.has(customer.Customer), `customer ${customer.Customer} has a business partner`);
  }
  for (const supplier of e['API_BUSINESS_PARTNER.A_Supplier']) {
    assert.ok(bpIds.has(supplier.Supplier), `supplier ${supplier.Supplier} has a business partner`);
  }
  for (const order of e['API_SALES_ORDER_SRV.A_SalesOrder']) {
    assert.ok(customerIds.has(order.SoldToParty), `order ${order.SalesOrder} sold-to exists`);
    assert.ok(customerIds.has(order.ShipToParty), `order ${order.SalesOrder} ship-to exists`);
  }
  for (const item of e['API_SALES_ORDER_SRV.A_SalesOrderItem']) {
    assert.ok(orderIds.has(item.SalesOrder), `item references order ${item.SalesOrder}`);
    assert.ok(productIds.has(item.Material), `item references product ${item.Material}`);
  }
  for (const line of e['API_SALES_ORDER_SRV.A_SalesOrderScheduleLine']) {
    assert.ok(orderIds.has(line.SalesOrder), `schedule line references order ${line.SalesOrder}`);
  }
  for (const po of e['API_PURCHASEORDER_PROCESS_SRV.A_PurchaseOrder']) {
    assert.ok(supplierIds.has(po.Supplier), `purchase order references supplier ${po.Supplier}`);
    assert.ok(bpIds.has(po.Supplier), `purchase order supplier ${po.Supplier} has a business partner`);
  }
  for (const poItem of e['API_PURCHASEORDER_PROCESS_SRV.A_PurchaseOrderItem']) {
    assert.ok(productIds.has(poItem.Material), `purchase order item references product ${poItem.Material}`);
  }
});

test('document flow references point at existing documents', () => {
  const orderIds = new Set(e['API_SALES_ORDER_SRV.A_SalesOrder'].map((row) => row.SalesOrder));
  const billingIds = new Set(e['API_BILLING_DOCUMENT_SRV.A_BillingDocument'].map((row) => row.BillingDocument));
  const journalIds = new Set(e['API_JOURNAL_ENTRY_SRV.A_JournalEntry'].map((row) => `${row.CompanyCode}|${row.FiscalYear}|${row.AccountingDocument}`));

  for (const billing of e['API_BILLING_DOCUMENT_SRV.A_BillingDocument']) {
    // A few standalone billing documents intentionally have no sales order reference.
    if (billing.ReferenceDocument) {
      assert.ok(orderIds.has(billing.ReferenceDocument), `billing ${billing.BillingDocument} references a sales order`);
    }
  }
  for (const item of e['API_BILLING_DOCUMENT_SRV.A_BillingDocumentItem']) {
    assert.ok(billingIds.has(item.BillingDocument), `billing item references ${item.BillingDocument}`);
    if (item.ReferenceSDocument) {
      assert.ok(orderIds.has(item.ReferenceSDocument), `billing item references order ${item.ReferenceSDocument}`);
    }
  }
  const purchaseOrderIds = new Set(
    e['API_PURCHASEORDER_PROCESS_SRV.A_PurchaseOrder'].map((row) => row.PurchaseOrder)
  );
  for (const entry of e['API_JOURNAL_ENTRY_SRV.A_JournalEntry']) {
    if (!entry.ReferenceDocument) continue;
    assert.ok(
      billingIds.has(entry.ReferenceDocument) || purchaseOrderIds.has(entry.ReferenceDocument),
      `journal entry references a billing document or purchase order (${entry.ReferenceDocument})`
    );
  }
  for (const line of e['API_JOURNAL_ENTRY_SRV.A_JournalEntryItem']) {
    assert.ok(
      journalIds.has(`${line.CompanyCode}|${line.FiscalYear}|${line.AccountingDocument}`),
      `journal line references ${line.AccountingDocument}`
    );
  }
});

test('sales order totals and item amounts are internally consistent', () => {
  const itemsByOrder = new Map();
  for (const item of e['API_SALES_ORDER_SRV.A_SalesOrderItem']) {
    if (!itemsByOrder.has(item.SalesOrder)) itemsByOrder.set(item.SalesOrder, []);
    itemsByOrder.get(item.SalesOrder).push(item);
    assert.equal(
      round2(item.NetAmount),
      round2(Number(item.RequestedQuantity) * Number(item.NetPriceAmount)),
      `item ${item.SalesOrder}/${item.SalesOrderItem} amount`
    );
  }
  for (const order of e['API_SALES_ORDER_SRV.A_SalesOrder']) {
    const items = itemsByOrder.get(order.SalesOrder) || [];
    assert.ok(items.length > 0, `order ${order.SalesOrder} has items`);
    const total = round2(items.reduce((sum, item) => sum + Number(item.NetAmount), 0));
    assert.equal(round2(order.TotalNetAmount), total, `order ${order.SalesOrder} total`);
  }
});

test('every sales order item has a schedule line', () => {
  const scheduleKeys = index(e['API_SALES_ORDER_SRV.A_SalesOrderScheduleLine'], 'SalesOrder', 'SalesOrderItem');
  for (const item of e['API_SALES_ORDER_SRV.A_SalesOrderItem']) {
    assert.ok(scheduleKeys.has(`${item.SalesOrder}|${item.SalesOrderItem}`), `schedule line for ${item.SalesOrder}/${item.SalesOrderItem}`);
  }
});

test('dates use ISO calendar format', () => {
  const isoDate = /^\d{4}-\d{2}-\d{2}$/;
  for (const order of e['API_SALES_ORDER_SRV.A_SalesOrder']) {
    assert.match(String(order.CreationDate), isoDate);
    assert.match(String(order.RequestedDeliveryDate), isoDate);
  }
  for (const billing of e['API_BILLING_DOCUMENT_SRV.A_BillingDocument']) {
    assert.match(String(billing.BillingDocumentDate), isoDate);
  }
});

test('seed metadata describes the dataset', () => {
  assert.equal(db.meta.generator, 's4hana-sandbox');
  assert.equal(db.meta.version, 1);
  assert.ok(db.meta.seededAt);
  assert.equal(
    Object.values(db.meta.counts).reduce((sum, count) => sum + count, 0),
    Object.values(e).reduce((sum, rows) => sum + rows.length, 0)
  );
});
