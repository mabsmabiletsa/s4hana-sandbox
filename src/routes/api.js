'use strict';

const express = require('express');
const store = require('../store');
const { services, getEntity } = require('../schema');
const { requireWrite } = require('../auth');
const { round2 } = require('../util');
const {
  DELIVERY_STATUS,
  BILLING_STATUS,
  PRODUCT_TYPES,
  BP_CATEGORIES
} = require('../constants');

const router = express.Router();

const labelOf = (options, value) => (options.find((item) => item.value === value) || {}).label || value;

function serializeEntity(entity) {
  return {
    name: entity.name,
    label: entity.label,
    singular: entity.singular,
    description: entity.description,
    service: entity.service,
    key: entity.key,
    fields: entity.fields.map((field) => ({
      name: field.name,
      label: field.label,
      type: field.type,
      maxLength: field.maxLength,
      precision: field.precision,
      scale: field.scale,
      key: Boolean(field.key),
      readOnly: Boolean(field.readOnly),
      options: field.options || null,
      lookup: field.lookup || null,
      ui: field.ui || {}
    })),
    nav: entity.nav.map((nav) => ({
      name: nav.name,
      label: nav.label,
      target: nav.target,
      targetService: nav.targetService,
      many: Boolean(nav.many)
    })),
    ui: entity.ui
  };
}

function catalog() {
  return {
    version: 1,
    generatedAt: new Date().toISOString(),
    services: services.map((service) => ({
      id: service.id,
      label: service.label,
      description: service.description,
      group: service.group,
      icon: service.icon,
      entities: Object.values(service.entities).map(serializeEntity)
    })),
    auth: {
      anonymousWrite: process.env.S4_ALLOW_ANONYMOUS_WRITE !== 'false'
    }
  };
}

function sumByCurrency(rows, amountField, currencyField) {
  const totals = {};
  for (const row of rows) {
    const currency = row[currencyField] || 'EUR';
    totals[currency] = round2((totals[currency] || 0) + Number(row[amountField] || 0));
  }
  return Object.entries(totals)
    .map(([currency, amount]) => ({ currency, amount }))
    .sort((a, b) => b.amount - a.amount);
}

function countBy(rows, field) {
  const counts = {};
  for (const row of rows) {
    const key = row[field] === null || row[field] === undefined || row[field] === '' ? '—' : String(row[field]);
    counts[key] = (counts[key] || 0) + 1;
  }
  return counts;
}

function stats() {
  const businessPartners = store.all('API_BUSINESS_PARTNER', 'A_BusinessPartner');
  const customers = store.all('API_BUSINESS_PARTNER', 'A_Customer');
  const suppliers = store.all('API_BUSINESS_PARTNER', 'A_Supplier');
  const products = store.all('API_PRODUCT_SRV', 'A_Product');
  const orders = store.all('API_SALES_ORDER_SRV', 'A_SalesOrder');
  const purchaseOrders = store.all('API_PURCHASEORDER_PROCESS_SRV', 'A_PurchaseOrder');
  const billing = store.all('API_BILLING_DOCUMENT_SRV', 'A_BillingDocument');
  const journal = store.all('API_JOURNAL_ENTRY_SRV', 'A_JournalEntry');

  const countsByEntity = {};
  let totalRecords = 0;
  for (const service of services) {
    for (const entityName of Object.keys(service.entities)) {
      const count = store.all(service.id, entityName).length;
      countsByEntity[entityName] = count;
      totalRecords += count;
    }
  }

  const recentOrders = [...orders]
    .sort((a, b) => String(b.CreationDate).localeCompare(String(a.CreationDate)) || String(b.SalesOrder).localeCompare(String(a.SalesOrder)))
    .slice(0, 6)
    .map((order) => ({
      SalesOrder: order.SalesOrder,
      SoldToParty: order.SoldToParty,
      SoldToPartyName: order.SoldToPartyName,
      TotalNetAmount: order.TotalNetAmount,
      TransactionCurrency: order.TransactionCurrency,
      OverallDeliveryStatus: order.OverallDeliveryStatus,
      OverallBillingStatus: order.OverallBillingStatus,
      CreationDate: order.CreationDate
    }));

  const deliveryCounts = countBy(orders, 'OverallDeliveryStatus');
  const billingCounts = countBy(billing, 'BillingDocumentType');
  const productCounts = countBy(products, 'ProductType');

  return {
    generatedAt: new Date().toISOString(),
    seededAt: store.meta().seededAt,
    system: {
      sid: 'S4H',
      client: '100',
      release: '2023 (mock)',
      odataVersion: '2.0',
      database: 'JSON document store',
      dataFile: store.DATA_FILE,
      uptimeSeconds: Math.round(process.uptime())
    },
    counts: {
      total: totalRecords,
      byEntity: countsByEntity
    },
    businessPartners: {
      total: businessPartners.length,
      customers: customers.length,
      suppliers: suppliers.length,
      blocked: businessPartners.filter((bp) => bp.IsBlocked).length,
      byCategory: BP_CATEGORIES.map((category) => ({
        value: category.value,
        label: category.label,
        count: businessPartners.filter((bp) => bp.BusinessPartnerCategory === category.value).length
      }))
    },
    products: {
      total: products.length,
      byType: PRODUCT_TYPES.map((type) => ({
        value: type.value,
        label: type.label,
        tone: type.tone,
        count: productCounts[type.value] || 0
      }))
    },
    sales: {
      orders: orders.length,
      openOrders: orders.filter((order) => order.OverallDeliveryStatus !== 'C').length,
      deliveredOrders: deliveryCounts.C || 0,
      totalByCurrency: sumByCurrency(orders, 'TotalNetAmount', 'TransactionCurrency'),
      deliveryBreakdown: DELIVERY_STATUS.map((status) => ({
        value: status.value,
        label: status.label,
        tone: status.tone,
        count: deliveryCounts[status.value] || 0
      })),
      billingBreakdown: [
        { value: 'F2', label: 'Invoices', count: billingCounts.F2 || 0 },
        { value: 'G2', label: 'Credit Memos', count: billingCounts.G2 || 0 },
        { value: 'L2', label: 'Debit Memos', count: billingCounts.L2 || 0 }
      ],
      recentOrders
    },
    procurement: {
      purchaseOrders: purchaseOrders.length,
      totalByCurrency: sumByCurrency(purchaseOrders, 'TotalNetAmount', 'DocumentCurrency')
    },
    billing: {
      documents: billing.length,
      cancelled: billing.filter((doc) => doc.BillingDocumentIsCancelled).length,
      totalByCurrency: sumByCurrency(billing, 'TotalNetAmount', 'TransactionCurrency')
    },
    finance: {
      journalEntries: journal.length,
      totalByCurrency: sumByCurrency(journal, 'TotalDebitAmount', 'DocumentCurrency')
    }
  };
}

const SEARCH_GROUPS = [
  {
    service: 'API_BUSINESS_PARTNER',
    entity: 'A_BusinessPartner',
    title: (row) => row.BusinessPartnerFullName,
    subtitle: (row) => `${row.BusinessPartner} · ${[row.CityName, row.CountryName].filter(Boolean).join(', ')}`
  },
  {
    service: 'API_PRODUCT_SRV',
    entity: 'A_Product',
    title: (row) => row.ProductDescription,
    subtitle: (row) => `${row.Product} · ${labelOf(PRODUCT_TYPES, row.ProductType)}`
  },
  {
    service: 'API_SALES_ORDER_SRV',
    entity: 'A_SalesOrder',
    title: (row) => `Sales Order ${row.SalesOrder}`,
    subtitle: (row) => `${row.SoldToPartyName} · ${row.TotalNetAmount} ${row.TransactionCurrency} · ${labelOf(DELIVERY_STATUS, row.OverallDeliveryStatus)}`
  },
  {
    service: 'API_PURCHASEORDER_PROCESS_SRV',
    entity: 'A_PurchaseOrder',
    title: (row) => `Purchase Order ${row.PurchaseOrder}`,
    subtitle: (row) => `${row.SupplierName} · ${row.TotalNetAmount} ${row.DocumentCurrency}`
  },
  {
    service: 'API_BILLING_DOCUMENT_SRV',
    entity: 'A_BillingDocument',
    title: (row) => `Billing Document ${row.BillingDocument}`,
    subtitle: (row) => `${row.SoldToPartyName} · ${row.TotalNetAmount} ${row.TransactionCurrency} · ${row.BillingDocumentDate}`
  }
];

function search(term, limitPerGroup = 5) {
  const needle = String(term || '').trim().toLowerCase();
  if (!needle) return { query: '', total: 0, groups: [] };
  const groups = [];
  for (const group of SEARCH_GROUPS) {
    const entityDef = getEntity(group.service, group.entity);
    const fields = entityDef.ui.searchFields || entityDef.fields.map((field) => field.name);
    const matches = store.filter(group.service, group.entity, (row) => fields.some((field) => {
      const value = row[field];
      return value !== null && value !== undefined && String(value).toLowerCase().includes(needle);
    })).slice(0, limitPerGroup);
    if (!matches.length) continue;
    groups.push({
      service: group.service,
      entity: group.entity,
      label: entityDef.label,
      icon: entityDef.ui.icon,
      records: matches.map((row) => ({
        key: Object.fromEntries(entityDef.key.map((field) => [field, row[field]])),
        title: group.title(row),
        subtitle: group.subtitle(row)
      }))
    });
  }
  return {
    query: term,
    total: groups.reduce((sum, group) => sum + group.records.length, 0),
    groups
  };
}

router.get('/health', (req, res) => {
  const counts = store.counts();
  res.json({
    status: 'ok',
    uptimeSeconds: Math.round(process.uptime()),
    version: require('../../package.json').version,
    dataFile: store.DATA_FILE,
    seededAt: store.meta().seededAt,
    records: Object.values(counts).reduce((sum, count) => sum + count, 0)
  });
});

router.get('/catalog', (req, res) => {
  res.json(catalog());
});

router.get('/stats', (req, res) => {
  res.json(stats());
});

router.get('/search', (req, res) => {
  const term = String(req.query.q || '').trim();
  if (term.length < 1) return res.json({ query: '', total: 0, groups: [] });
  res.json(search(term, Math.min(Number(req.query.limit) || 5, 20)));
});

router.get('/me', (req, res) => {
  res.json({
    user: {
      id: req.user.id,
      name: req.user.name,
      roles: req.user.roles,
      anonymous: Boolean(req.user.anonymous)
    },
    capabilities: {
      read: true,
      write: !req.user.roles.includes('READ_ONLY'),
      reset: !req.user.roles.includes('READ_ONLY') && process.env.S4_ALLOW_RESET !== 'false'
    }
  });
});

router.post('/reset', requireWrite, (req, res) => {
  if (process.env.S4_ALLOW_RESET === 'false') {
    return res.status(403).json({ error: { code: '403', message: 'Demo data reset is disabled on this system.' } });
  }
  if (String(req.headers['x-confirm-reset'] || '').toLowerCase() !== 'reset') {
    return res.status(400).json({
      error: { code: '400', message: 'Send the header "x-confirm-reset: reset" to confirm the data reset.' }
    });
  }
  store.reset();
  res.json({
    status: 'reset',
    seededAt: store.meta().seededAt,
    counts: store.counts()
  });
});

module.exports = { router, catalog, stats, search };
