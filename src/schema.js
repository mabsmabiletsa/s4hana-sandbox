'use strict';

const {
  COUNTRIES,
  COUNTRY_NAME,
  COUNTRY_CURRENCY,
  CURRENCIES,
  PAYMENT_TERMS,
  CUSTOMER_GROUPS,
  SUPPLIER_GROUPS,
  DELIVERY_PRIORITIES,
  BP_GROUPS,
  BP_ROLES,
  BP_CATEGORIES,
  PRODUCT_TYPES,
  PRODUCT_GROUPS,
  UNITS,
  SALES_ORDER_TYPES,
  SALES_ORG_VALUES,
  CHANNELS,
  DIVISIONS,
  DELIVERY_STATUS,
  BILLING_STATUS,
  INCOTERMS,
  PO_TYPES,
  BILLING_TYPES,
  ACCOUNTING_DOC_TYPES,
  GL_ACCOUNTS,
  COST_CENTERS,
  PROFIT_CENTERS,
  PLANTS,
  COMPANY_CODES,
  PURCHASING_ORGS
} = require('./constants');
const { pad, round2, round3, isoDate } = require('./util');
const { ApiError } = require('./errors');

const countryOptions = COUNTRIES.map((c) => ({ value: c.code, label: `${c.code} – ${c.name}` }));
const currencyOptions = CURRENCIES.map((c) => ({ value: c.code, label: `${c.code} – ${c.label}` }));
const plantOptions = PLANTS.map((p) => ({ value: p.code, label: `${p.code} – ${p.name}` }));
const companyOptions = COMPANY_CODES.map((c) => ({ value: c.code, label: `${c.code} – ${c.name}` }));
const purchasingOrgOptions = PURCHASING_ORGS.map((o) => ({ value: o.code, label: `${o.code} – ${o.name}` }));
const glOptions = GL_ACCOUNTS.map((a) => ({ value: a.code, label: `${a.code} – ${a.name}` }));
const costCenterOptions = COST_CENTERS.map((c) => ({ value: c, label: c }));
const profitCenterOptions = PROFIT_CENTERS.map((c) => ({ value: c, label: c }));
const purchasingGroupOptions = ['001', '002', '003'].map((v) => ({ value: v, label: `Group ${v}` }));

const entitySets = {};
const serviceMap = {};

function service(id, label, description, group, icon, entities) {
  const set = {
    id,
    label,
    description,
    group,
    icon,
    entities: {}
  };
  for (const entity of entities) {
    entity.service = id;
    set.entities[entity.name] = entity;
    entitySets[`${id}.${entity.name}`] = entity;
    serviceMap[entity.name] = id;
  }
  return set;
}

function entity(spec) {
  const fields = spec.fields.map((f) => ({ nullable: true, ...f }));
  const fieldMap = Object.fromEntries(fields.map((f) => [f.name, f]));
  const navs = (spec.nav || []).map((n) => ({ many: false, ...n }));
  const key = fields.filter((f) => f.key).map((f) => f.name);
  if (!key.length) throw new Error(`Entity ${spec.name} has no key`);
  return {
    ...spec,
    fields,
    fieldMap,
    nav: navs,
    navMap: Object.fromEntries(navs.map((n) => [n.name, n])),
    key,
    ui: {
      listTitle: spec.label,
      createLabel: `Create ${spec.singular || spec.label}`,
      keyLabel: fieldMap[key[0]]?.label || key[0],
      ...spec.ui
    }
  };
}

/* ------------------------------------------------------------------------- */
/* Business Partner                                                          */
/* ------------------------------------------------------------------------- */

const businessPartner = entity({
  name: 'A_BusinessPartner',
  label: 'Business Partners',
  singular: 'Business Partner',
  description: 'Central business partner master data with roles, addresses, and communication data.',
  keyLabel: 'Business Partner',
  fields: [
    { name: 'BusinessPartner', label: 'Business Partner', type: 'Edm.String', maxLength: 10, key: true, ui: { list: 140, mono: true, form: false } },
    { name: 'BusinessPartnerCategory', label: 'Category', type: 'Edm.String', maxLength: 1, options: BP_CATEGORIES, ui: { list: 110 } },
    { name: 'BusinessPartnerFullName', label: 'Name', type: 'Edm.String', maxLength: 120, ui: { list: 270 } },
    { name: 'BusinessPartnerName', label: 'Organization Name', type: 'Edm.String', maxLength: 80 },
    { name: 'FirstName', label: 'First Name', type: 'Edm.String', maxLength: 40 },
    { name: 'LastName', label: 'Last Name', type: 'Edm.String', maxLength: 40 },
    { name: 'BusinessPartnerGrouping', label: 'Grouping', type: 'Edm.String', maxLength: 4, options: BP_GROUPS },
    { name: 'SearchTerm1', label: 'Search Term', type: 'Edm.String', maxLength: 20, ui: { list: 140 } },
    { name: 'Country', label: 'Country/Region Key', type: 'Edm.String', maxLength: 3, options: countryOptions, ui: { list: 90, mono: true } },
    { name: 'CountryName', label: 'Country', type: 'Edm.String', maxLength: 60, readOnly: true, ui: { list: 130, form: false } },
    { name: 'Region', label: 'Region', type: 'Edm.String', maxLength: 3 },
    { name: 'CityName', label: 'City', type: 'Edm.String', maxLength: 40, ui: { list: 150 } },
    { name: 'PostalCode', label: 'Postal Code', type: 'Edm.String', maxLength: 10, ui: { width: 110 } },
    { name: 'StreetName', label: 'Street', type: 'Edm.String', maxLength: 60 },
    { name: 'HouseNumber', label: 'House Number', type: 'Edm.String', maxLength: 10, ui: { width: 110 } },
    { name: 'Language', label: 'Language', type: 'Edm.String', maxLength: 2 },
    { name: 'PhoneNumber', label: 'Phone', type: 'Edm.String', maxLength: 30 },
    { name: 'MobilePhoneNumber', label: 'Mobile', type: 'Edm.String', maxLength: 30 },
    { name: 'EmailAddress', label: 'Email', type: 'Edm.String', maxLength: 254 },
    { name: 'FaxNumber', label: 'Fax', type: 'Edm.String', maxLength: 30 },
    { name: 'VATRegistration', label: 'VAT Registration', type: 'Edm.String', maxLength: 20 },
    { name: 'TaxNumber1', label: 'Tax Number', type: 'Edm.String', maxLength: 16 },
    { name: 'LegalForm', label: 'Legal Form', type: 'Edm.String', maxLength: 20 },
    { name: 'IsBlocked', label: 'Blocked', type: 'Edm.Boolean', ui: { list: 100, trueLabel: 'Blocked', falseLabel: 'Active', trueTone: 'critical', falseTone: 'positive' } },
    { name: 'CreatedByUser', label: 'Created By', type: 'Edm.String', maxLength: 12, readOnly: true, ui: { form: false } },
    { name: 'CreationDate', label: 'Created On', type: 'Edm.Date', readOnly: true, ui: { list: 120, form: false } },
    { name: 'LastChangeDate', label: 'Last Changed On', type: 'Edm.Date', readOnly: true, ui: { form: false } }
  ],
  nav: [
    { name: 'to_Addresses', label: 'Addresses', target: 'A_BusinessPartnerAddress', many: true, on: { BusinessPartner: 'BusinessPartner' } },
    { name: 'to_Roles', label: 'Roles', target: 'A_BusinessPartnerRole', many: true, on: { BusinessPartner: 'BusinessPartner' } },
    { name: 'to_Customer', label: 'Customer', target: 'A_Customer', many: false, on: { BusinessPartner: 'Customer' } },
    { name: 'to_Supplier', label: 'Supplier', target: 'A_Supplier', many: false, on: { BusinessPartner: 'Supplier' } }
  ],
  ui: {
    icon: 'people',
    group: 'Master Data',
    title: 'BusinessPartnerFullName',
    subtitle: 'BusinessPartner',
    keyLabel: 'Business Partner',
    headerStatus: ['IsBlocked'],
    defaultOrder: 'BusinessPartner asc',
    searchFields: ['BusinessPartner', 'BusinessPartnerFullName', 'BusinessPartnerName', 'SearchTerm1', 'CityName', 'EmailAddress'],
    searchPlaceholder: 'Search by ID, name, city or email…',
    list: ['BusinessPartner', 'BusinessPartnerFullName', 'BusinessPartnerCategory', 'CountryName', 'CityName', 'IsBlocked'],
    filters: [
      { field: 'BusinessPartnerCategory', label: 'Category', options: BP_CATEGORIES },
      { field: 'Country', label: 'Country', options: countryOptions },
      { field: 'IsBlocked', label: 'Status', options: [{ value: 'false', label: 'Active' }, { value: 'true', label: 'Blocked' }] }
    ],
    sections: [
      { label: 'Identification', fields: ['BusinessPartner', 'BusinessPartnerCategory', 'BusinessPartnerGrouping', 'BusinessPartnerFullName', 'BusinessPartnerName', 'FirstName', 'LastName', 'SearchTerm1'] },
      { label: 'Address', fields: ['CountryName', 'Region', 'CityName', 'PostalCode', 'StreetName', 'HouseNumber'] },
      { label: 'Communication', fields: ['PhoneNumber', 'MobilePhoneNumber', 'EmailAddress', 'FaxNumber', 'Language'] },
      { label: 'Tax & Administration', fields: ['VATRegistration', 'TaxNumber1', 'LegalForm', 'IsBlocked', 'CreatedByUser', 'CreationDate', 'LastChangeDate'] }
    ],
    related: [
      { nav: 'to_Addresses', label: 'Addresses', columns: ['AddressID', 'AddressType', 'StreetName', 'CityName', 'PostalCode', 'CountryName', 'IsDefaultAddress'] },
      { nav: 'to_Roles', label: 'Roles', columns: ['BusinessPartnerRole', 'ValidFrom', 'ValidTo', 'IsDefaultRole'] },
      { nav: 'to_Customer', label: 'Customer Data' },
      { nav: 'to_Supplier', label: 'Supplier Data' }
    ],
    create: {
      label: 'Create Business Partner',
      fields: ['BusinessPartnerCategory', 'BusinessPartnerName', 'FirstName', 'LastName', 'Country', 'CityName', 'PostalCode', 'StreetName', 'HouseNumber', 'PhoneNumber', 'EmailAddress', 'Language', 'VATRegistration', 'IsBlocked'],
      defaults: { BusinessPartnerCategory: '2', Country: 'DE', Language: 'EN', IsBlocked: false },
      assignment: {
        label: 'Create As',
        field: 'BusinessPartnerRole',
        options: [
          { value: '', label: 'No business role' },
          { value: 'FLCU00', label: 'Customer (FLCU00)' },
          { value: 'FLVN00', label: 'Supplier (FLVN00)' },
          { value: 'BUP003', label: 'Employee (BUP003)' }
        ],
        defaultValue: 'FLCU00',
        nav: 'to_Roles',
        navKey: 'BusinessPartnerRole'
      }
    },
    update: {
      label: 'Edit Business Partner',
      fields: ['BusinessPartnerFullName', 'BusinessPartnerName', 'FirstName', 'LastName', 'BusinessPartnerGrouping', 'Country', 'CityName', 'PostalCode', 'StreetName', 'HouseNumber', 'PhoneNumber', 'MobilePhoneNumber', 'EmailAddress', 'FaxNumber', 'Language', 'VATRegistration', 'TaxNumber1', 'LegalForm', 'IsBlocked']
    },
    delete: { label: 'Delete Business Partner', description: 'Deletes the business partner together with its addresses and roles.' }
  },
  keyGeneration: { strategy: 'numeric', start: 1000001, pad: 7 },
  hooks: {
    beforeCreate(record, payload) {
      record.BusinessPartnerCategory = record.BusinessPartnerCategory || '2';
      if (!['1', '2', '3'].includes(record.BusinessPartnerCategory)) {
        throw new ApiError(400, "BusinessPartnerCategory must be '1' (person), '2' (organization) or '3' (group).");
      }
      record.BusinessPartnerFullName = record.BusinessPartnerFullName || resolveFullName(record, record.BusinessPartnerCategory);
      if (!record.BusinessPartnerFullName) {
        throw new ApiError(400, 'A business partner name (organization name or first/last name) is required.');
      }
      if (record.Country && !COUNTRY_NAME[record.Country]) {
        throw new ApiError(400, `Country '${record.Country}' is not part of the sandbox country list.`);
      }
      record.BusinessPartnerName = record.BusinessPartnerName || (record.BusinessPartnerCategory === '2' ? record.BusinessPartnerFullName : '');
      record.BusinessPartnerGrouping = record.BusinessPartnerGrouping || (record.BusinessPartnerCategory === '1' ? 'BP03' : 'BP04');
      record.SearchTerm1 = record.SearchTerm1 || String(record.BusinessPartnerFullName || '').split(/\s+/)[0].slice(0, 20);
      record.CountryName = record.CountryName || COUNTRY_NAME[record.Country] || '';
      record.Language = record.Language || 'EN';
      record.IsBlocked = !!record.IsBlocked;
      record.CreationDate = record.CreationDate || isoDate(new Date());
      record.LastChangeDate = record.LastChangeDate || record.CreationDate;
      for (const role of payload.to_Roles || []) {
        role.ValidFrom = role.ValidFrom || record.CreationDate;
        role.ValidTo = role.ValidTo ?? null;
        role.IsDefaultRole = role.IsDefaultRole ?? true;
      }
    },
    afterCreate(record, payload, ctx) {
      const { store, service: svc } = ctx;
      const hasAddress = (payload.to_Addresses || []).length > 0;
      if (!hasAddress) {
        store.insert(svc, 'A_BusinessPartnerAddress', {
          BusinessPartner: record.BusinessPartner,
          AddressID: '0000000001',
          AddressType: '01',
          Country: record.Country,
          CountryName: record.CountryName || COUNTRY_NAME[record.Country] || '',
          Region: record.Region || '',
          CityName: record.CityName || '',
          PostalCode: record.PostalCode || '',
          StreetName: record.StreetName || '',
          HouseNumber: record.HouseNumber || '',
          PhoneNumber: record.PhoneNumber || '',
          EmailAddress: record.EmailAddress || '',
          IsDefaultAddress: true
        });
      }
      const roles = payload.to_Roles || [];
      const roleCodes = roles.map((r) => r.BusinessPartnerRole);
      if (roleCodes.includes('FLCU00') && !store.getByKey(svc, 'A_Customer', { Customer: record.BusinessPartner })) {
        store.insert(svc, 'A_Customer', {
          Customer: record.BusinessPartner,
          CustomerName: record.BusinessPartnerFullName,
          CustomerAccountGroup: '0001',
          CountryName: record.CountryName || COUNTRY_NAME[record.Country] || '',
          CityName: record.CityName || '',
          SalesOrganization: '1010',
          DistributionChannel: '10',
          Division: '00',
          Currency: COUNTRY_CURRENCY[record.Country] || 'EUR',
          PaymentTerms: '0004',
          DeliveryPriority: '02',
          IsBlocked: !!record.IsBlocked,
          CreationDate: record.CreationDate
        });
      }
      if (roleCodes.includes('FLVN00') && !store.getByKey(svc, 'A_Supplier', { Supplier: record.BusinessPartner })) {
        store.insert(svc, 'A_Supplier', {
          Supplier: record.BusinessPartner,
          SupplierName: record.BusinessPartnerFullName,
          SupplierAccountGroup: '0001',
          CountryName: record.CountryName || COUNTRY_NAME[record.Country] || '',
          CityName: record.CityName || '',
          Currency: COUNTRY_CURRENCY[record.Country] || 'EUR',
          PaymentTerms: '0004',
          PhoneNumber: record.PhoneNumber || '',
          EmailAddress: record.EmailAddress || '',
          IsBlocked: !!record.IsBlocked,
          CreationDate: record.CreationDate
        });
      }
    },
    beforeUpdate(patch, existing, ctx) {
      if (patch.Country && !COUNTRY_NAME[patch.Country]) {
        throw new ApiError(400, `Country '${patch.Country}' is not part of the sandbox country list.`);
      }
      if (patch.Country && !patch.CountryName) {
        patch.CountryName = COUNTRY_NAME[patch.Country] || existing.CountryName;
      }
      if (patch.BusinessPartnerName || patch.FirstName || patch.LastName) {
        const category = patch.BusinessPartnerCategory || existing.BusinessPartnerCategory;
        patch.BusinessPartnerFullName = resolveFullName({ ...existing, ...patch }, category);
      }
      if (patch.IsBlocked !== undefined) patch.IsBlocked = Boolean(patch.IsBlocked);
      const merged = { ...existing, ...patch };
      const { store, service: svc } = ctx;
      const customer = store.getByKey(svc, 'A_Customer', { Customer: existing.BusinessPartner });
      if (customer) {
        store.update(svc, 'A_Customer', { Customer: customer.Customer }, {
          CustomerName: merged.BusinessPartnerFullName,
          CountryName: merged.CountryName,
          CityName: merged.CityName,
          IsBlocked: merged.IsBlocked
        });
      }
      const supplier = store.getByKey(svc, 'A_Supplier', { Supplier: existing.BusinessPartner });
      if (supplier) {
        store.update(svc, 'A_Supplier', { Supplier: supplier.Supplier }, {
          SupplierName: merged.BusinessPartnerFullName,
          CountryName: merged.CountryName,
          CityName: merged.CityName,
          PhoneNumber: merged.PhoneNumber,
          EmailAddress: merged.EmailAddress,
          IsBlocked: merged.IsBlocked
        });
      }
    },
    beforeDelete(record, ctx) {
      const { store, service: svc } = ctx;
      const refs = [
        { service: 'API_SALES_ORDER_SRV', entity: 'A_SalesOrder', field: 'SoldToParty' },
        { service: 'API_SALES_ORDER_SRV', entity: 'A_SalesOrder', field: 'ShipToParty' },
        { service: 'API_PURCHASEORDER_PROCESS_SRV', entity: 'A_PurchaseOrder', field: 'Supplier' },
        { service: 'API_BILLING_DOCUMENT_SRV', entity: 'A_BillingDocument', field: 'SoldToParty' }
      ];
      for (const ref of refs) {
        const found = store.all(ref.service, ref.entity).find((r) => r[ref.field] === record.BusinessPartner);
        if (found) {
          throw new ApiError(409, `Business partner ${record.BusinessPartner} cannot be deleted: it is referenced by ${ref.entity} ${found[Object.keys(found)[0]]}.`);
        }
      }
      // Owned master data is deleted together with the business partner.
      store.removeWhere(svc, 'A_BusinessPartnerAddress', (row) => row.BusinessPartner === record.BusinessPartner);
      store.removeWhere(svc, 'A_BusinessPartnerRole', (row) => row.BusinessPartner === record.BusinessPartner);
      store.removeWhere(svc, 'A_Customer', (row) => row.Customer === record.BusinessPartner);
      store.removeWhere(svc, 'A_Supplier', (row) => row.Supplier === record.BusinessPartner);
    }
  }
});

function resolveFullName(record, category) {
  if (category === '2' || category === '3') {
    return record.BusinessPartnerName || record.BusinessPartnerFullName || '';
  }
  return [record.FirstName, record.LastName].filter(Boolean).join(' ') || record.BusinessPartnerName || record.BusinessPartnerFullName || '';
}

const businessPartnerAddress = entity({
  name: 'A_BusinessPartnerAddress',
  label: 'Business Partner Addresses',
  singular: 'Address',
  description: 'Address data for business partners.',
  fields: [
    { name: 'BusinessPartner', label: 'Business Partner', type: 'Edm.String', maxLength: 10, key: true, ui: { mono: true } },
    { name: 'AddressID', label: 'Address ID', type: 'Edm.String', maxLength: 10, key: true, ui: { list: 130, mono: true } },
    { name: 'AddressType', label: 'Address Type', type: 'Edm.String', maxLength: 2, options: [{ value: '01', label: 'Legal Address' }, { value: '02', label: 'Delivery Address' }], ui: { list: 140 } },
    { name: 'Country', label: 'Country/Region Key', type: 'Edm.String', maxLength: 3, options: countryOptions, ui: { mono: true } },
    { name: 'CountryName', label: 'Country', type: 'Edm.String', maxLength: 60, readOnly: true, ui: { list: 130 } },
    { name: 'Region', label: 'Region', type: 'Edm.String', maxLength: 3 },
    { name: 'CityName', label: 'City', type: 'Edm.String', maxLength: 40, ui: { list: 150 } },
    { name: 'PostalCode', label: 'Postal Code', type: 'Edm.String', maxLength: 10, ui: { list: 120 } },
    { name: 'StreetName', label: 'Street', type: 'Edm.String', maxLength: 60, ui: { list: 180 } },
    { name: 'HouseNumber', label: 'House Number', type: 'Edm.String', maxLength: 10 },
    { name: 'PhoneNumber', label: 'Phone', type: 'Edm.String', maxLength: 30 },
    { name: 'EmailAddress', label: 'Email', type: 'Edm.String', maxLength: 254 },
    { name: 'IsDefaultAddress', label: 'Default', type: 'Edm.Boolean', ui: { list: 100, trueLabel: 'Default', falseLabel: 'No', trueTone: 'positive', falseTone: 'neutral' } }
  ],
  ui: {
    icon: 'map-pin',
    group: 'Master Data',
    title: 'StreetName',
    subtitle: 'AddressID',
    defaultOrder: 'AddressID asc',
    searchFields: ['BusinessPartner', 'CityName', 'PostalCode', 'StreetName'],
    list: ['AddressID', 'AddressType', 'StreetName', 'CityName', 'PostalCode', 'CountryName', 'IsDefaultAddress'],
    sections: [
      { label: 'Address', fields: ['BusinessPartner', 'AddressID', 'AddressType', 'CountryName', 'Region', 'CityName', 'PostalCode', 'StreetName', 'HouseNumber'] },
      { label: 'Communication', fields: ['PhoneNumber', 'EmailAddress', 'IsDefaultAddress'] }
    ]
  }
});

const businessPartnerRole = entity({
  name: 'A_BusinessPartnerRole',
  label: 'Business Partner Roles',
  singular: 'Business Partner Role',
  description: 'Business roles assigned to a business partner.',
  fields: [
    { name: 'BusinessPartner', label: 'Business Partner', type: 'Edm.String', maxLength: 10, key: true, ui: { mono: true } },
    { name: 'BusinessPartnerRole', label: 'Role', type: 'Edm.String', maxLength: 10, key: true, options: BP_ROLES, ui: { list: 180, badge: true } },
    { name: 'ValidFrom', label: 'Valid From', type: 'Edm.Date', ui: { list: 130 } },
    { name: 'ValidTo', label: 'Valid To', type: 'Edm.Date' },
    { name: 'IsDefaultRole', label: 'Default Role', type: 'Edm.Boolean', ui: { list: 120 } }
  ],
  ui: {
    icon: 'shield',
    group: 'Master Data',
    title: 'BusinessPartnerRole',
    subtitle: 'BusinessPartner',
    list: ['BusinessPartner', 'BusinessPartnerRole', 'ValidFrom', 'ValidTo', 'IsDefaultRole'],
    sections: [{ label: 'Role', fields: ['BusinessPartner', 'BusinessPartnerRole', 'ValidFrom', 'ValidTo', 'IsDefaultRole'] }]
  }
});

const customer = entity({
  name: 'A_Customer',
  label: 'Customers',
  singular: 'Customer',
  description: 'Customer master data in the sales area.',
  fields: [
    { name: 'Customer', label: 'Customer', type: 'Edm.String', maxLength: 10, key: true, ui: { list: 130, mono: true, form: false } },
    { name: 'CustomerName', label: 'Customer Name', type: 'Edm.String', maxLength: 120, ui: { list: 270 } },
    { name: 'CustomerAccountGroup', label: 'Account Group', type: 'Edm.String', maxLength: 4, options: CUSTOMER_GROUPS, ui: { list: 150 } },
    { name: 'CountryName', label: 'Country', type: 'Edm.String', maxLength: 60, readOnly: true, ui: { list: 130 } },
    { name: 'CityName', label: 'City', type: 'Edm.String', maxLength: 40, ui: { list: 150 } },
    { name: 'SalesOrganization', label: 'Sales Organization', type: 'Edm.String', maxLength: 4, options: SALES_ORG_VALUES, ui: { list: 150 } },
    { name: 'DistributionChannel', label: 'Distribution Channel', type: 'Edm.String', maxLength: 2, options: CHANNELS },
    { name: 'Division', label: 'Division', type: 'Edm.String', maxLength: 2, options: DIVISIONS },
    { name: 'Currency', label: 'Currency', type: 'Edm.String', maxLength: 3, options: currencyOptions, ui: { list: 100, mono: true } },
    { name: 'PaymentTerms', label: 'Payment Terms', type: 'Edm.String', maxLength: 4, options: PAYMENT_TERMS, ui: { list: 160 } },
    { name: 'DeliveryPriority', label: 'Delivery Priority', type: 'Edm.String', maxLength: 2, options: DELIVERY_PRIORITIES },
    { name: 'IsBlocked', label: 'Blocked', type: 'Edm.Boolean', ui: { list: 100, trueLabel: 'Blocked', falseLabel: 'Active', trueTone: 'critical', falseTone: 'positive' } },
    { name: 'CreationDate', label: 'Created On', type: 'Edm.Date', readOnly: true }
  ],
  nav: [{ name: 'to_BusinessPartner', label: 'Business Partner', target: 'A_BusinessPartner', many: false, on: { Customer: 'BusinessPartner' } }],
  ui: {
    icon: 'contact',
    group: 'Master Data',
    title: 'CustomerName',
    subtitle: 'Customer',
    defaultOrder: 'Customer asc',
    searchFields: ['Customer', 'CustomerName', 'CityName', 'CountryName'],
    list: ['Customer', 'CustomerName', 'SalesOrganization', 'Currency', 'PaymentTerms', 'IsBlocked'],
    filters: [
      { field: 'SalesOrganization', label: 'Sales Org', options: SALES_ORG_VALUES },
      { field: 'PaymentTerms', label: 'Payment Terms', options: PAYMENT_TERMS },
      { field: 'IsBlocked', label: 'Status', options: [{ value: 'false', label: 'Active' }, { value: 'true', label: 'Blocked' }] }
    ],
    sections: [
      { label: 'General', fields: ['Customer', 'CustomerName', 'CustomerAccountGroup', 'CountryName', 'CityName'] },
      { label: 'Sales Area', fields: ['SalesOrganization', 'DistributionChannel', 'Division', 'Currency', 'PaymentTerms', 'DeliveryPriority'] },
      { label: 'Administration', fields: ['IsBlocked', 'CreationDate'] }
    ],
    related: [{ nav: 'to_BusinessPartner', label: 'Business Partner' }]
  },
  keyGeneration: { strategy: 'numeric', start: 1000001, pad: 7 }
});

const supplier = entity({
  name: 'A_Supplier',
  label: 'Suppliers',
  singular: 'Supplier',
  description: 'Supplier master data used by purchasing.',
  fields: [
    { name: 'Supplier', label: 'Supplier', type: 'Edm.String', maxLength: 10, key: true, ui: { list: 140, mono: true, form: false } },
    { name: 'SupplierName', label: 'Supplier Name', type: 'Edm.String', maxLength: 120, ui: { list: 280 } },
    { name: 'SupplierAccountGroup', label: 'Account Group', type: 'Edm.String', maxLength: 4, options: SUPPLIER_GROUPS, ui: { list: 160 } },
    { name: 'CountryName', label: 'Country', type: 'Edm.String', maxLength: 60, readOnly: true, ui: { list: 130 } },
    { name: 'CityName', label: 'City', type: 'Edm.String', maxLength: 40, ui: { list: 150 } },
    { name: 'Currency', label: 'Currency', type: 'Edm.String', maxLength: 3, options: currencyOptions, ui: { list: 100, mono: true } },
    { name: 'PaymentTerms', label: 'Payment Terms', type: 'Edm.String', maxLength: 4, options: PAYMENT_TERMS, ui: { list: 160 } },
    { name: 'PhoneNumber', label: 'Phone', type: 'Edm.String', maxLength: 30 },
    { name: 'EmailAddress', label: 'Email', type: 'Edm.String', maxLength: 254 },
    { name: 'IsBlocked', label: 'Blocked', type: 'Edm.Boolean', ui: { list: 100, trueLabel: 'Blocked', falseLabel: 'Active', trueTone: 'critical', falseTone: 'positive' } },
    { name: 'CreationDate', label: 'Created On', type: 'Edm.Date', readOnly: true }
  ],
  nav: [{ name: 'to_BusinessPartner', label: 'Business Partner', target: 'A_BusinessPartner', many: false, on: { Supplier: 'BusinessPartner' } }],
  ui: {
    icon: 'truck',
    group: 'Master Data',
    title: 'SupplierName',
    subtitle: 'Supplier',
    defaultOrder: 'Supplier asc',
    searchFields: ['Supplier', 'SupplierName', 'CityName', 'CountryName'],
    list: ['Supplier', 'SupplierName', 'CountryName', 'Currency', 'PaymentTerms', 'IsBlocked'],
    filters: [
      { field: 'CountryName', label: 'Country', options: COUNTRIES.map((c) => ({ value: c.name, label: c.name })) },
      { field: 'IsBlocked', label: 'Status', options: [{ value: 'false', label: 'Active' }, { value: 'true', label: 'Blocked' }] }
    ],
    sections: [
      { label: 'General', fields: ['Supplier', 'SupplierName', 'SupplierAccountGroup', 'CountryName', 'CityName'] },
      { label: 'Communication', fields: ['PhoneNumber', 'EmailAddress'] },
      { label: 'Finance & Administration', fields: ['Currency', 'PaymentTerms', 'IsBlocked', 'CreationDate'] }
    ],
    related: [{ nav: 'to_BusinessPartner', label: 'Business Partner' }]
  },
  keyGeneration: { strategy: 'numeric', start: 1000001, pad: 7 }
});

/* ------------------------------------------------------------------------- */
/* Products                                                                  */
/* ------------------------------------------------------------------------- */

const product = entity({
  name: 'A_Product',
  label: 'Products',
  singular: 'Product',
  description: 'Material master data including valuation and dimensions.',
  fields: [
    { name: 'Product', label: 'Product', type: 'Edm.String', maxLength: 18, key: true, ui: { list: 130, mono: true, form: false } },
    { name: 'ProductDescription', label: 'Description', type: 'Edm.String', maxLength: 120, ui: { list: 280 } },
    { name: 'ProductType', label: 'Product Type', type: 'Edm.String', maxLength: 4, options: PRODUCT_TYPES, ui: { list: 130, badge: true } },
    { name: 'ProductGroup', label: 'Product Group', type: 'Edm.String', maxLength: 4, options: PRODUCT_GROUPS, ui: { list: 150 } },
    { name: 'BaseUnit', label: 'Base Unit', type: 'Edm.String', maxLength: 3, options: UNITS, ui: { list: 100 } },
    { name: 'Division', label: 'Division', type: 'Edm.String', maxLength: 2, options: DIVISIONS },
    { name: 'GrossWeight', label: 'Gross Weight', type: 'Edm.Decimal', precision: 13, scale: 3, ui: { quantity: true } },
    { name: 'NetWeight', label: 'Net Weight', type: 'Edm.Decimal', precision: 13, scale: 3, ui: { quantity: true } },
    { name: 'WeightUnit', label: 'Weight Unit', type: 'Edm.String', maxLength: 3, options: [{ value: 'KG', label: 'KG' }, { value: 'G', label: 'G' }, { value: 'LB', label: 'LB' }] },
    { name: 'StandardPrice', label: 'Standard Price', type: 'Edm.Decimal', precision: 15, scale: 2, ui: { list: 140, money: true } },
    { name: 'Currency', label: 'Currency', type: 'Edm.String', maxLength: 3, options: currencyOptions, ui: { list: 90, mono: true } },
    { name: 'CountryOfOrigin', label: 'Country of Origin', type: 'Edm.String', maxLength: 3, options: countryOptions },
    { name: 'IsMarkedForDeletion', label: 'Deletion Flag', type: 'Edm.Boolean', ui: { list: 120, trueLabel: 'To Delete', falseLabel: 'Active', trueTone: 'critical', falseTone: 'positive' } },
    { name: 'CreationDate', label: 'Created On', type: 'Edm.Date', readOnly: true },
    { name: 'LastChangeDate', label: 'Last Changed On', type: 'Edm.Date', readOnly: true }
  ],
  nav: [
    { name: 'to_SalesOrderItems', label: 'Sales Order Items', target: 'A_SalesOrderItem', targetService: 'API_SALES_ORDER_SRV', many: true, on: { Product: 'Material' } },
    { name: 'to_PurchaseOrderItems', label: 'Purchase Order Items', target: 'A_PurchaseOrderItem', targetService: 'API_PURCHASEORDER_PROCESS_SRV', many: true, on: { Product: 'Material' } }
  ],
  ui: {
    icon: 'box',
    group: 'Master Data',
    title: 'ProductDescription',
    subtitle: 'Product',
    defaultOrder: 'Product asc',
    searchFields: ['Product', 'ProductDescription', 'ProductGroup'],
    list: ['Product', 'ProductDescription', 'ProductType', 'ProductGroup', 'StandardPrice', 'Currency'],
    filters: [
      { field: 'ProductType', label: 'Type', options: PRODUCT_TYPES },
      { field: 'ProductGroup', label: 'Group', options: PRODUCT_GROUPS }
    ],
    sections: [
      { label: 'General', fields: ['Product', 'ProductDescription', 'ProductType', 'ProductGroup', 'BaseUnit', 'Division', 'CountryOfOrigin'] },
      { label: 'Dimensions', fields: ['GrossWeight', 'NetWeight', 'WeightUnit'] },
      { label: 'Valuation', fields: ['StandardPrice', 'Currency'] },
      { label: 'Administration', fields: ['IsMarkedForDeletion', 'CreationDate', 'LastChangeDate'] }
    ],
    related: [
      { nav: 'to_SalesOrderItems', label: 'Sales Order Items', columns: ['SalesOrder', 'SalesOrderItem', 'RequestedQuantity', 'RequestedQuantityUnit', 'NetAmount', 'DeliveryStatus'] },
      { nav: 'to_PurchaseOrderItems', label: 'Purchase Order Items', columns: ['PurchaseOrder', 'PurchaseOrderItem', 'OrderQuantity', 'NetAmount', 'DeliveryDate'] }
    ]
  }
});

/* ------------------------------------------------------------------------- */
/* Sales                                                                     */
/* ------------------------------------------------------------------------- */

const salesOrder = entity({
  name: 'A_SalesOrder',
  label: 'Sales Orders',
  singular: 'Sales Order',
  description: 'Sales order headers with items, schedule lines, and billing references.',
  fields: [
    { name: 'SalesOrder', label: 'Sales Order', type: 'Edm.String', maxLength: 10, key: true, ui: { list: 150, mono: true, form: false } },
    { name: 'SalesOrderType', label: 'Order Type', type: 'Edm.String', maxLength: 4, options: SALES_ORDER_TYPES, ui: { list: 130 } },
    { name: 'SalesOrganization', label: 'Sales Organization', type: 'Edm.String', maxLength: 4, options: SALES_ORG_VALUES, ui: { list: 140 } },
    { name: 'DistributionChannel', label: 'Distribution Channel', type: 'Edm.String', maxLength: 2, options: CHANNELS },
    { name: 'Division', label: 'Division', type: 'Edm.String', maxLength: 2, options: DIVISIONS },
    { name: 'SoldToParty', label: 'Sold-to Party', type: 'Edm.String', maxLength: 10, lookup: { service: 'API_BUSINESS_PARTNER', entity: 'A_Customer', key: 'Customer', label: 'CustomerName' }, ui: { list: 130, mono: true } },
    { name: 'SoldToPartyName', label: 'Sold-to Party Name', type: 'Edm.String', maxLength: 120, readOnly: true, ui: { list: 240, form: false } },
    { name: 'ShipToParty', label: 'Ship-to Party', type: 'Edm.String', maxLength: 10, lookup: { service: 'API_BUSINESS_PARTNER', entity: 'A_Customer', key: 'Customer', label: 'CustomerName' }, ui: { mono: true } },
    { name: 'ShipToPartyName', label: 'Ship-to Party Name', type: 'Edm.String', maxLength: 120, readOnly: true, ui: { form: false } },
    { name: 'CustomerPurchaseOrderDate', label: 'Customer PO Date', type: 'Edm.Date' },
    { name: 'PurchaseOrderByCustomer', label: 'Customer Reference', type: 'Edm.String', maxLength: 35, ui: { list: 170 } },
    { name: 'TotalNetAmount', label: 'Net Amount', type: 'Edm.Decimal', precision: 15, scale: 2, readOnly: true, ui: { list: 150, money: true } },
    { name: 'TransactionCurrency', label: 'Currency', type: 'Edm.String', maxLength: 3, options: currencyOptions, ui: { list: 90, mono: true } },
    { name: 'OverallDeliveryStatus', label: 'Delivery Status', type: 'Edm.String', maxLength: 1, options: DELIVERY_STATUS, readOnly: true, ui: { list: 150, badge: true, form: false } },
    { name: 'OverallBillingStatus', label: 'Billing Status', type: 'Edm.String', maxLength: 1, options: BILLING_STATUS, readOnly: true, ui: { list: 150, badge: true, form: false } },
    { name: 'CreationDate', label: 'Created On', type: 'Edm.Date', readOnly: true, ui: { list: 120, form: false } },
    { name: 'CreatedByUser', label: 'Created By', type: 'Edm.String', maxLength: 12, readOnly: true, ui: { form: false } },
    { name: 'RequestedDeliveryDate', label: 'Requested Delivery', type: 'Edm.Date' },
    { name: 'IncotermsClassification', label: 'Incoterms', type: 'Edm.String', maxLength: 3, options: INCOTERMS },
    { name: 'IncotermsLocation1', label: 'Incoterms Location', type: 'Edm.String', maxLength: 30 }
  ],
  nav: [
    { name: 'to_Items', label: 'Items', target: 'A_SalesOrderItem', many: true, on: { SalesOrder: 'SalesOrder' } },
    { name: 'to_SoldToParty', label: 'Sold-to Party', target: 'A_BusinessPartner', targetService: 'API_BUSINESS_PARTNER', many: false, on: { SoldToParty: 'BusinessPartner' } },
    { name: 'to_ShipToParty', label: 'Ship-to Party', target: 'A_BusinessPartner', targetService: 'API_BUSINESS_PARTNER', many: false, on: { ShipToParty: 'BusinessPartner' } },
    { name: 'to_Billings', label: 'Billing Documents', target: 'A_BillingDocument', targetService: 'API_BILLING_DOCUMENT_SRV', many: true, on: { SalesOrder: 'ReferenceDocument' } }
  ],
  ui: {
    icon: 'cart',
    group: 'Sales',
    title: 'SalesOrder',
    subtitle: 'SoldToPartyName',
    keyLabel: 'Sales Order',
    headerStatus: ['OverallDeliveryStatus', 'OverallBillingStatus'],
    defaultOrder: 'SalesOrder desc',
    searchFields: ['SalesOrder', 'SoldToPartyName', 'PurchaseOrderByCustomer', 'SalesOrderType'],
    list: ['SalesOrder', 'SoldToPartyName', 'SalesOrderType', 'TotalNetAmount', 'TransactionCurrency', 'OverallDeliveryStatus', 'CreationDate'],
    filters: [
      { field: 'OverallDeliveryStatus', label: 'Delivery Status', options: DELIVERY_STATUS },
      { field: 'SalesOrderType', label: 'Order Type', options: SALES_ORDER_TYPES },
      { field: 'SalesOrganization', label: 'Sales Org', options: SALES_ORG_VALUES }
    ],
    sections: [
      { label: 'General', fields: ['SalesOrder', 'SalesOrderType', 'SalesOrganization', 'DistributionChannel', 'Division', 'TotalNetAmount', 'TransactionCurrency'] },
      { label: 'Parties', fields: ['SoldToParty', 'SoldToPartyName', 'ShipToParty', 'ShipToPartyName'] },
      { label: 'Dates & Terms', fields: ['CreationDate', 'RequestedDeliveryDate', 'CustomerPurchaseOrderDate', 'PurchaseOrderByCustomer', 'IncotermsClassification', 'IncotermsLocation1'] },
      { label: 'Status', fields: ['OverallDeliveryStatus', 'OverallBillingStatus', 'CreatedByUser'] }
    ],
    related: [
      { nav: 'to_Items', label: 'Items', columns: ['SalesOrderItem', 'Material', 'ProductDescription', 'RequestedQuantity', 'RequestedQuantityUnit', 'NetAmount', 'Plant', 'DeliveryStatus'] },
      { nav: 'to_Billings', label: 'Billing Documents', columns: ['BillingDocument', 'BillingDocumentType', 'BillingDocumentDate', 'TotalNetAmount', 'TransactionCurrency', 'BillingDocumentIsCancelled'] }
    ],
    create: {
      label: 'Create Sales Order',
      fields: ['SalesOrderType', 'SoldToParty', 'ShipToParty', 'SalesOrganization', 'DistributionChannel', 'Division', 'TransactionCurrency', 'CustomerPurchaseOrderDate', 'PurchaseOrderByCustomer', 'RequestedDeliveryDate', 'IncotermsClassification', 'IncotermsLocation1'],
      defaults: { SalesOrderType: 'OR', SalesOrganization: '1010', DistributionChannel: '10', Division: '00', TransactionCurrency: 'EUR', IncotermsClassification: 'DAP' },
      lineItems: {
        nav: 'to_Items',
        label: 'Order Items',
        fields: ['Material', 'RequestedQuantity', 'NetPriceAmount', 'Plant'],
        defaults: { RequestedQuantity: 1, Plant: '1010' },
        unitField: 'RequestedQuantityUnit',
        amountField: 'NetAmount'
      }
    },
    update: {
      label: 'Edit Sales Order',
      fields: ['ShipToParty', 'CustomerPurchaseOrderDate', 'PurchaseOrderByCustomer', 'RequestedDeliveryDate', 'IncotermsClassification', 'IncotermsLocation1']
    },
    delete: { label: 'Delete Sales Order', description: 'Deletes the sales order together with its items and schedule lines.' }
  },
  keyGeneration: { strategy: 'numeric', start: 1001, pad: 10 },
  hooks: {
    beforeCreate(record, payload, ctx) {
      const today = isoDate(new Date());
      const { store } = ctx;
      if (!record.SoldToParty) throw new ApiError(400, 'SoldToParty is required.');
      const customer = store.getByKey('API_BUSINESS_PARTNER', 'A_Customer', { Customer: record.SoldToParty });
      if (!customer) {
        throw new ApiError(400, `SoldToParty '${record.SoldToParty}' is not a customer in the sandbox. Create the customer role first.`);
      }
      if (!record.ShipToParty) record.ShipToParty = record.SoldToParty;
      const shipTo = store.getByKey('API_BUSINESS_PARTNER', 'A_Customer', { Customer: record.ShipToParty });
      if (!shipTo) {
        throw new ApiError(400, `ShipToParty '${record.ShipToParty}' is not a customer in the sandbox.`);
      }
      const itemPayload = payload.to_Items || [];
      if (!itemPayload.length) throw new ApiError(400, 'A sales order needs at least one item.');
      record.CreationDate = record.CreationDate || today;
      record.CreatedByUser = ctx.user?.id || record.CreatedByUser || 'DEVELOPER';
      record.OverallDeliveryStatus = 'A';
      record.OverallBillingStatus = 'A';
      record.SalesOrderType = record.SalesOrderType || 'OR';
      record.TransactionCurrency = record.TransactionCurrency || customer.Currency || 'EUR';
      let total = 0;
      itemPayload.forEach((item, index) => {
        if (!item.Material) throw new ApiError(400, 'Every sales order item needs a Material.');
        const product = store.find('API_PRODUCT_SRV', 'A_Product', (p) => p.Product === item.Material);
        if (!product) throw new ApiError(400, `Material '${item.Material}' does not exist in the sandbox.`);
        item.SalesOrder = record.SalesOrder;
        item.SalesOrderItem = item.SalesOrderItem || pad((index + 1) * 10, 6);
        item.SalesOrderItemCategory = item.SalesOrderItemCategory || 'TAN';
        item.RequestedQuantity = round3(item.RequestedQuantity ?? 1);
        if (!(item.RequestedQuantity > 0)) throw new ApiError(400, `RequestedQuantity for item ${item.SalesOrderItem} must be greater than zero.`);
        item.RequestedQuantityUnit = item.RequestedQuantityUnit || product.BaseUnit || 'PC';
        item.NetPriceAmount = round2(item.NetPriceAmount ?? product.StandardPrice ?? 0);
        if (item.NetPriceAmount < 0) throw new ApiError(400, `NetPriceAmount for item ${item.SalesOrderItem} must not be negative.`);
        item.NetAmount = round2(item.RequestedQuantity * item.NetPriceAmount);
        item.SalesOrderItemText = item.SalesOrderItemText || product.ProductDescription || item.Material;
        item.ProductDescription = product.ProductDescription || item.SalesOrderItemText;
        item.TransactionCurrency = record.TransactionCurrency;
        item.Plant = item.Plant || '1010';
        item.DeliveryStatus = 'A';
        total += item.NetAmount;
      });
      record.TotalNetAmount = round2(total);
      record.SoldToPartyName = customer.CustomerName;
      record.ShipToPartyName = shipTo.CustomerName;
    },
    beforeUpdate(patch, existing, ctx) {
      const { store } = ctx;
      if (patch.SoldToParty) {
        const soldTo = store.getByKey('API_BUSINESS_PARTNER', 'A_Customer', { Customer: patch.SoldToParty });
        if (!soldTo) throw new ApiError(400, `SoldToParty '${patch.SoldToParty}' is not a customer in the sandbox.`);
        patch.SoldToPartyName = soldTo.CustomerName;
      }
      if (patch.ShipToParty) {
        const shipTo = store.getByKey('API_BUSINESS_PARTNER', 'A_Customer', { Customer: patch.ShipToParty });
        if (!shipTo) throw new ApiError(400, `ShipToParty '${patch.ShipToParty}' is not a customer in the sandbox.`);
        patch.ShipToPartyName = shipTo.CustomerName;
      }
    },
    afterCreate(record, payload, ctx) {
      const { store, service: svc } = ctx;
      const items = store.filter(svc, 'A_SalesOrderItem', (i) => i.SalesOrder === record.SalesOrder);
      for (const item of items) {
        const requested = item.ScheduleLineDate || record.RequestedDeliveryDate || isoDate(new Date());
        const confirmed = new Date(new Date(requested).getTime() + 3 * 86400000);
        store.insert(svc, 'A_SalesOrderScheduleLine', {
          SalesOrder: record.SalesOrder,
          SalesOrderItem: item.SalesOrderItem,
          ScheduleLine: '0001',
          RequestedDeliveryDate: requested,
          ConfirmedDeliveryDate: isoDate(confirmed),
          ConfirmedQuantity: round3(item.RequestedQuantity * 0.8)
        });
      }
    },
    beforeDelete(record, ctx) {
      const { store, service: svc } = ctx;
      for (const item of store.filter(svc, 'A_SalesOrderItem', (i) => i.SalesOrder === record.SalesOrder)) {
        store.removeWhere(svc, 'A_SalesOrderScheduleLine', (s) => s.SalesOrder === record.SalesOrder && s.SalesOrderItem === item.SalesOrderItem);
        store.removeWhere(svc, 'A_SalesOrderItem', (i) => i.SalesOrder === record.SalesOrder && i.SalesOrderItem === item.SalesOrderItem);
      }
    }
  }
});

const salesOrderItem = entity({
  name: 'A_SalesOrderItem',
  label: 'Sales Order Items',
  singular: 'Sales Order Item',
  description: 'Line items of sales orders.',
  fields: [
    { name: 'SalesOrder', label: 'Sales Order', type: 'Edm.String', maxLength: 10, key: true, ui: { list: 140, mono: true } },
    { name: 'SalesOrderItem', label: 'Item', type: 'Edm.String', maxLength: 6, key: true, ui: { list: 90, mono: true } },
    { name: 'SalesOrderItemCategory', label: 'Item Category', type: 'Edm.String', maxLength: 4, options: [{ value: 'TAN', label: 'Standard Item' }, { value: 'TANN', label: 'Free Item' }] },
    { name: 'SalesOrderItemText', label: 'Item Text', type: 'Edm.String', maxLength: 40 },
    { name: 'Material', label: 'Material', type: 'Edm.String', maxLength: 18, lookup: { service: 'API_PRODUCT_SRV', entity: 'A_Product', key: 'Product', label: 'ProductDescription' }, ui: { list: 130, mono: true } },
    { name: 'ProductDescription', label: 'Material Description', type: 'Edm.String', maxLength: 120, readOnly: true, ui: { list: 260, form: false } },
    { name: 'RequestedQuantity', label: 'Quantity', type: 'Edm.Decimal', precision: 15, scale: 3, ui: { list: 110, quantity: true } },
    { name: 'RequestedQuantityUnit', label: 'Unit', type: 'Edm.String', maxLength: 3, options: UNITS, ui: { list: 80 } },
    { name: 'NetPriceAmount', label: 'Net Price', type: 'Edm.Decimal', precision: 15, scale: 2 },
    { name: 'NetAmount', label: 'Net Amount', type: 'Edm.Decimal', precision: 15, scale: 2, readOnly: true, ui: { list: 140, money: true } },
    { name: 'TransactionCurrency', label: 'Currency', type: 'Edm.String', maxLength: 3, options: currencyOptions, ui: { list: 90, mono: true } },
    { name: 'Plant', label: 'Plant', type: 'Edm.String', maxLength: 4, options: plantOptions, ui: { list: 120 } },
    { name: 'DeliveryStatus', label: 'Delivery Status', type: 'Edm.String', maxLength: 1, options: DELIVERY_STATUS, ui: { list: 130, badge: true } }
  ],
  nav: [
    { name: 'to_ScheduleLines', label: 'Schedule Lines', target: 'A_SalesOrderScheduleLine', many: true, on: { SalesOrder: 'SalesOrder', SalesOrderItem: 'SalesOrderItem' } },
    { name: 'to_SalesOrder', label: 'Sales Order', target: 'A_SalesOrder', many: false, on: { SalesOrder: 'SalesOrder' } },
    { name: 'to_Product', label: 'Product', target: 'A_Product', targetService: 'API_PRODUCT_SRV', many: false, on: { Material: 'Product' } }
  ],
  ui: {
    icon: 'list',
    group: 'Sales',
    title: 'SalesOrderItemText',
    subtitle: 'SalesOrder',
    defaultOrder: 'SalesOrder desc, SalesOrderItem asc',
    searchFields: ['SalesOrder', 'SalesOrderItem', 'Material', 'ProductDescription'],
    list: ['SalesOrder', 'SalesOrderItem', 'Material', 'ProductDescription', 'RequestedQuantity', 'RequestedQuantityUnit', 'NetAmount', 'DeliveryStatus'],
    sections: [
      { label: 'General', fields: ['SalesOrder', 'SalesOrderItem', 'SalesOrderItemCategory', 'SalesOrderItemText', 'Material', 'ProductDescription'] },
      { label: 'Quantities & Amounts', fields: ['RequestedQuantity', 'RequestedQuantityUnit', 'NetPriceAmount', 'NetAmount', 'TransactionCurrency', 'Plant'] },
      { label: 'Status', fields: ['DeliveryStatus'] }
    ],
    related: [
      { nav: 'to_ScheduleLines', label: 'Schedule Lines', columns: ['ScheduleLine', 'RequestedDeliveryDate', 'ConfirmedDeliveryDate', 'ConfirmedQuantity'] },
      { nav: 'to_Product', label: 'Product' }
    ]
  },
  hooks: {
    /**
     * Items are usually created through the sales order deep insert. Read-only
     * fields such as NetAmount are stripped from the payload by the OData layer,
     * so the item recomputes them here from the material master.
     */
    beforeCreate(record, payload, ctx) {
      const { store } = ctx;
      if (record.Material) {
        const product = store.find('API_PRODUCT_SRV', 'A_Product', (row) => row.Product === record.Material);
        if (product) {
          record.ProductDescription = product.ProductDescription || '';
          record.RequestedQuantityUnit = record.RequestedQuantityUnit || product.BaseUnit || 'PC';
          if (record.NetPriceAmount === undefined) {
            record.NetPriceAmount = product.StandardPrice ?? 0;
          }
        }
      }
      record.RequestedQuantity = round3(record.RequestedQuantity ?? 1);
      if (!(record.RequestedQuantity > 0)) {
        throw new ApiError(400, 'RequestedQuantity must be greater than zero.');
      }
      record.NetPriceAmount = round2(record.NetPriceAmount ?? 0);
      if (record.NetPriceAmount < 0) {
        throw new ApiError(400, 'NetPriceAmount must not be negative.');
      }
      record.NetAmount = round2(record.RequestedQuantity * record.NetPriceAmount);
      record.SalesOrderItemCategory = record.SalesOrderItemCategory || 'TAN';
      record.SalesOrderItemText = record.SalesOrderItemText || record.ProductDescription || record.Material || '';
      record.DeliveryStatus = record.DeliveryStatus || 'A';
    }
  }
});

const salesOrderScheduleLine = entity({
  name: 'A_SalesOrderScheduleLine',
  label: 'Schedule Lines',
  singular: 'Schedule Line',
  description: 'Delivery schedule lines for sales order items.',
  fields: [
    { name: 'SalesOrder', label: 'Sales Order', type: 'Edm.String', maxLength: 10, key: true, ui: { list: 140, mono: true } },
    { name: 'SalesOrderItem', label: 'Item', type: 'Edm.String', maxLength: 6, key: true, ui: { list: 80, mono: true } },
    { name: 'ScheduleLine', label: 'Schedule Line', type: 'Edm.String', maxLength: 4, key: true, ui: { list: 120, mono: true } },
    { name: 'RequestedDeliveryDate', label: 'Requested Date', type: 'Edm.Date', ui: { list: 140 } },
    { name: 'ConfirmedDeliveryDate', label: 'Confirmed Date', type: 'Edm.Date', ui: { list: 140 } },
    { name: 'ConfirmedQuantity', label: 'Confirmed Qty', type: 'Edm.Decimal', precision: 15, scale: 3, ui: { list: 130, quantity: true } }
  ],
  nav: [{ name: 'to_SalesOrderItem', label: 'Sales Order Item', target: 'A_SalesOrderItem', many: false, on: { SalesOrder: 'SalesOrder', SalesOrderItem: 'SalesOrderItem' } }],
  ui: {
    icon: 'calendar',
    group: 'Sales',
    title: 'ScheduleLine',
    subtitle: 'SalesOrder',
    list: ['SalesOrder', 'SalesOrderItem', 'ScheduleLine', 'RequestedDeliveryDate', 'ConfirmedDeliveryDate', 'ConfirmedQuantity'],
    sections: [{ label: 'Schedule', fields: ['SalesOrder', 'SalesOrderItem', 'ScheduleLine', 'RequestedDeliveryDate', 'ConfirmedDeliveryDate', 'ConfirmedQuantity'] }],
    related: [{ nav: 'to_SalesOrderItem', label: 'Sales Order Item' }]
  }
});

/* ------------------------------------------------------------------------- */
/* Procurement                                                               */
/* ------------------------------------------------------------------------- */

const purchaseOrder = entity({
  name: 'A_PurchaseOrder',
  label: 'Purchase Orders',
  singular: 'Purchase Order',
  description: 'Purchase order headers with supplier and item details.',
  fields: [
    { name: 'PurchaseOrder', label: 'Purchase Order', type: 'Edm.String', maxLength: 10, key: true, ui: { list: 150, mono: true, form: false } },
    { name: 'PurchaseOrderType', label: 'PO Type', type: 'Edm.String', maxLength: 4, options: PO_TYPES, ui: { list: 110 } },
    { name: 'Supplier', label: 'Supplier', type: 'Edm.String', maxLength: 10, lookup: { service: 'API_BUSINESS_PARTNER', entity: 'A_Supplier', key: 'Supplier', label: 'SupplierName' }, ui: { list: 130, mono: true } },
    { name: 'SupplierName', label: 'Supplier Name', type: 'Edm.String', maxLength: 120, readOnly: true, ui: { list: 260, form: false } },
    { name: 'CompanyCode', label: 'Company Code', type: 'Edm.String', maxLength: 4, options: companyOptions, ui: { list: 110 } },
    { name: 'PurchasingOrganization', label: 'Purchasing Org', type: 'Edm.String', maxLength: 4, options: purchasingOrgOptions },
    { name: 'PurchasingGroup', label: 'Purchasing Group', type: 'Edm.String', maxLength: 3, options: purchasingGroupOptions },
    { name: 'DocumentCurrency', label: 'Currency', type: 'Edm.String', maxLength: 3, options: currencyOptions, ui: { list: 90, mono: true } },
    { name: 'TotalNetAmount', label: 'Net Amount', type: 'Edm.Decimal', precision: 15, scale: 2, readOnly: true, ui: { list: 150, money: true } },
    { name: 'CreationDate', label: 'Created On', type: 'Edm.Date', readOnly: true, ui: { list: 120 } },
    { name: 'PurchaseOrderDate', label: 'Document Date', type: 'Edm.Date' },
    { name: 'IncotermsClassification', label: 'Incoterms', type: 'Edm.String', maxLength: 3, options: INCOTERMS },
    { name: 'IncotermsLocation1', label: 'Incoterms Location', type: 'Edm.String', maxLength: 30 }
  ],
  nav: [
    { name: 'to_Items', label: 'Items', target: 'A_PurchaseOrderItem', many: true, on: { PurchaseOrder: 'PurchaseOrder' } },
    { name: 'to_Supplier', label: 'Supplier', target: 'A_Supplier', targetService: 'API_BUSINESS_PARTNER', many: false, on: { Supplier: 'Supplier' } }
  ],
  ui: {
    icon: 'shopping-bag',
    group: 'Procurement',
    title: 'PurchaseOrder',
    subtitle: 'SupplierName',
    keyLabel: 'Purchase Order',
    headerStatus: ['PurchaseOrderType'],
    defaultOrder: 'PurchaseOrder desc',
    searchFields: ['PurchaseOrder', 'SupplierName', 'PurchaseOrderType'],
    list: ['PurchaseOrder', 'SupplierName', 'PurchaseOrderType', 'TotalNetAmount', 'DocumentCurrency', 'CreationDate'],
    filters: [
      { field: 'PurchaseOrderType', label: 'PO Type', options: PO_TYPES },
      { field: 'CompanyCode', label: 'Company Code', options: companyOptions }
    ],
    sections: [
      { label: 'General', fields: ['PurchaseOrder', 'PurchaseOrderType', 'CompanyCode', 'TotalNetAmount', 'DocumentCurrency'] },
      { label: 'Supplier & Organization', fields: ['Supplier', 'SupplierName', 'PurchasingOrganization', 'PurchasingGroup'] },
      { label: 'Dates & Terms', fields: ['PurchaseOrderDate', 'CreationDate', 'IncotermsClassification', 'IncotermsLocation1'] }
    ],
    related: [{ nav: 'to_Items', label: 'Items', columns: ['PurchaseOrderItem', 'Material', 'PurchaseOrderItemText', 'OrderQuantity', 'PurchaseOrderQuantityUnit', 'NetAmount', 'Plant', 'DeliveryDate'] }]
  },
  keyGeneration: { strategy: 'numeric', start: 4500000001, pad: 10 }
});

const purchaseOrderItem = entity({
  name: 'A_PurchaseOrderItem',
  label: 'Purchase Order Items',
  singular: 'Purchase Order Item',
  description: 'Line items of purchase orders.',
  fields: [
    { name: 'PurchaseOrder', label: 'Purchase Order', type: 'Edm.String', maxLength: 10, key: true, ui: { list: 140, mono: true } },
    { name: 'PurchaseOrderItem', label: 'Item', type: 'Edm.String', maxLength: 5, key: true, ui: { list: 80, mono: true } },
    { name: 'PurchaseOrderItemText', label: 'Item Text', type: 'Edm.String', maxLength: 40 },
    { name: 'Material', label: 'Material', type: 'Edm.String', maxLength: 18, lookup: { service: 'API_PRODUCT_SRV', entity: 'A_Product', key: 'Product', label: 'ProductDescription' }, ui: { list: 130, mono: true } },
    { name: 'OrderQuantity', label: 'Quantity', type: 'Edm.Decimal', precision: 15, scale: 3, ui: { list: 110, quantity: true } },
    { name: 'PurchaseOrderQuantityUnit', label: 'Unit', type: 'Edm.String', maxLength: 3, options: UNITS, ui: { list: 80 } },
    { name: 'NetPriceAmount', label: 'Net Price', type: 'Edm.Decimal', precision: 15, scale: 2 },
    { name: 'NetAmount', label: 'Net Amount', type: 'Edm.Decimal', precision: 15, scale: 2, readOnly: true, ui: { list: 140, money: true } },
    { name: 'DocumentCurrency', label: 'Currency', type: 'Edm.String', maxLength: 3, options: currencyOptions, ui: { list: 90, mono: true } },
    { name: 'Plant', label: 'Plant', type: 'Edm.String', maxLength: 4, options: plantOptions, ui: { list: 120 } },
    { name: 'DeliveryDate', label: 'Delivery Date', type: 'Edm.Date', ui: { list: 130 } },
    { name: 'ItemCategory', label: 'Item Category', type: 'Edm.String', maxLength: 4, options: [{ value: '0', label: 'Standard' }, { value: '2', label: 'Consignment' }] }
  ],
  nav: [
    { name: 'to_PurchaseOrder', label: 'Purchase Order', target: 'A_PurchaseOrder', many: false, on: { PurchaseOrder: 'PurchaseOrder' } },
    { name: 'to_Product', label: 'Product', target: 'A_Product', targetService: 'API_PRODUCT_SRV', many: false, on: { Material: 'Product' } }
  ],
  ui: {
    icon: 'list',
    group: 'Procurement',
    title: 'PurchaseOrderItemText',
    subtitle: 'PurchaseOrder',
    defaultOrder: 'PurchaseOrder desc, PurchaseOrderItem asc',
    searchFields: ['PurchaseOrder', 'PurchaseOrderItem', 'Material', 'PurchaseOrderItemText'],
    list: ['PurchaseOrder', 'PurchaseOrderItem', 'Material', 'PurchaseOrderItemText', 'OrderQuantity', 'NetAmount', 'Plant', 'DeliveryDate'],
    sections: [
      { label: 'General', fields: ['PurchaseOrder', 'PurchaseOrderItem', 'ItemCategory', 'Material', 'PurchaseOrderItemText'] },
      { label: 'Quantities & Amounts', fields: ['OrderQuantity', 'PurchaseOrderQuantityUnit', 'NetPriceAmount', 'NetAmount', 'DocumentCurrency', 'Plant', 'DeliveryDate'] }
    ],
    related: [{ nav: 'to_Product', label: 'Product' }]
  }
});

/* ------------------------------------------------------------------------- */
/* Billing                                                                   */
/* ------------------------------------------------------------------------- */

const billingDocument = entity({
  name: 'A_BillingDocument',
  label: 'Billing Documents',
  singular: 'Billing Document',
  description: 'Customer invoices, credit memos and debit memos.',
  fields: [
    { name: 'BillingDocument', label: 'Billing Document', type: 'Edm.String', maxLength: 10, key: true, ui: { list: 150, mono: true, form: false } },
    { name: 'BillingDocumentType', label: 'Type', type: 'Edm.String', maxLength: 4, options: BILLING_TYPES, ui: { list: 130, badge: true } },
    { name: 'BillingDocumentDate', label: 'Document Date', type: 'Edm.Date', ui: { list: 130 } },
    { name: 'BillingDocumentIsCancelled', label: 'Cancelled', type: 'Edm.Boolean', ui: { list: 110, trueLabel: 'Cancelled', falseLabel: 'Active', trueTone: 'critical', falseTone: 'positive' } },
    { name: 'SoldToParty', label: 'Sold-to Party', type: 'Edm.String', maxLength: 10, lookup: { service: 'API_BUSINESS_PARTNER', entity: 'A_Customer', key: 'Customer', label: 'CustomerName' }, ui: { mono: true } },
    { name: 'SoldToPartyName', label: 'Sold-to Party Name', type: 'Edm.String', maxLength: 120, readOnly: true, ui: { list: 250, form: false } },
    { name: 'CompanyCode', label: 'Company Code', type: 'Edm.String', maxLength: 4, options: companyOptions, ui: { list: 110 } },
    { name: 'TotalNetAmount', label: 'Net Amount', type: 'Edm.Decimal', precision: 15, scale: 2, readOnly: true, ui: { list: 150, money: true } },
    { name: 'TransactionCurrency', label: 'Currency', type: 'Edm.String', maxLength: 3, options: currencyOptions, ui: { list: 90, mono: true } },
    { name: 'ReferenceDocument', label: 'Reference Document', type: 'Edm.String', maxLength: 10, ui: { list: 150, mono: true } },
    { name: 'CreationDate', label: 'Created On', type: 'Edm.Date', readOnly: true },
    { name: 'CreatedByUser', label: 'Created By', type: 'Edm.String', maxLength: 12, readOnly: true }
  ],
  nav: [
    { name: 'to_Items', label: 'Items', target: 'A_BillingDocumentItem', many: true, on: { BillingDocument: 'BillingDocument' } },
    { name: 'to_SoldToParty', label: 'Sold-to Party', target: 'A_BusinessPartner', targetService: 'API_BUSINESS_PARTNER', many: false, on: { SoldToParty: 'BusinessPartner' } }
  ],
  ui: {
    icon: 'file-text',
    group: 'Sales',
    title: 'BillingDocument',
    subtitle: 'SoldToPartyName',
    keyLabel: 'Billing Document',
    headerStatus: ['BillingDocumentType', 'BillingDocumentIsCancelled'],
    defaultOrder: 'BillingDocumentDate desc',
    searchFields: ['BillingDocument', 'SoldToPartyName', 'ReferenceDocument'],
    list: ['BillingDocument', 'BillingDocumentType', 'BillingDocumentDate', 'SoldToPartyName', 'TotalNetAmount', 'TransactionCurrency', 'BillingDocumentIsCancelled'],
    filters: [
      { field: 'BillingDocumentType', label: 'Type', options: BILLING_TYPES },
      { field: 'CompanyCode', label: 'Company Code', options: companyOptions },
      { field: 'BillingDocumentIsCancelled', label: 'Status', options: [{ value: 'false', label: 'Active' }, { value: 'true', label: 'Cancelled' }] }
    ],
    sections: [
      { label: 'General', fields: ['BillingDocument', 'BillingDocumentType', 'BillingDocumentDate', 'BillingDocumentIsCancelled', 'TotalNetAmount', 'TransactionCurrency'] },
      { label: 'Parties & Organization', fields: ['SoldToParty', 'SoldToPartyName', 'CompanyCode'] },
      { label: 'Reference', fields: ['ReferenceDocument', 'CreationDate', 'CreatedByUser'] }
    ],
    related: [{ nav: 'to_Items', label: 'Items', columns: ['BillingDocumentItem', 'Material', 'ProductDescription', 'BillingQuantity', 'BillingQuantityUnit', 'NetAmount', 'ReferenceSDocument', 'ReferenceSDocumentItem'] }]
  },
  keyGeneration: { strategy: 'numeric', start: 90000001, pad: 8 }
});

const billingDocumentItem = entity({
  name: 'A_BillingDocumentItem',
  label: 'Billing Document Items',
  singular: 'Billing Document Item',
  description: 'Line items of billing documents.',
  fields: [
    { name: 'BillingDocument', label: 'Billing Document', type: 'Edm.String', maxLength: 10, key: true, ui: { list: 140, mono: true } },
    { name: 'BillingDocumentItem', label: 'Item', type: 'Edm.String', maxLength: 6, key: true, ui: { list: 80, mono: true } },
    { name: 'Material', label: 'Material', type: 'Edm.String', maxLength: 18, lookup: { service: 'API_PRODUCT_SRV', entity: 'A_Product', key: 'Product', label: 'ProductDescription' }, ui: { list: 130, mono: true } },
    { name: 'ProductDescription', label: 'Material Description', type: 'Edm.String', maxLength: 120, readOnly: true, ui: { list: 250, form: false } },
    { name: 'BillingQuantity', label: 'Quantity', type: 'Edm.Decimal', precision: 15, scale: 3, ui: { list: 110, quantity: true } },
    { name: 'BillingQuantityUnit', label: 'Unit', type: 'Edm.String', maxLength: 3, options: UNITS, ui: { list: 80 } },
    { name: 'NetAmount', label: 'Net Amount', type: 'Edm.Decimal', precision: 15, scale: 2, ui: { list: 140, money: true } },
    { name: 'TransactionCurrency', label: 'Currency', type: 'Edm.String', maxLength: 3, options: currencyOptions, ui: { list: 90, mono: true } },
    { name: 'ReferenceSDocument', label: 'Sales Order', type: 'Edm.String', maxLength: 10, ui: { list: 140, mono: true } },
    { name: 'ReferenceSDocumentItem', label: 'SO Item', type: 'Edm.String', maxLength: 6, ui: { list: 90, mono: true } },
    { name: 'Plant', label: 'Plant', type: 'Edm.String', maxLength: 4, options: plantOptions }
  ],
  nav: [
    { name: 'to_BillingDocument', label: 'Billing Document', target: 'A_BillingDocument', many: false, on: { BillingDocument: 'BillingDocument' } },
    { name: 'to_Product', label: 'Product', target: 'A_Product', targetService: 'API_PRODUCT_SRV', many: false, on: { Material: 'Product' } }
  ],
  ui: {
    icon: 'list',
    group: 'Sales',
    title: 'ProductDescription',
    subtitle: 'BillingDocument',
    defaultOrder: 'BillingDocument desc, BillingDocumentItem asc',
    searchFields: ['BillingDocument', 'Material', 'ProductDescription'],
    list: ['BillingDocument', 'BillingDocumentItem', 'Material', 'ProductDescription', 'BillingQuantity', 'NetAmount', 'ReferenceSDocument'],
    sections: [
      { label: 'General', fields: ['BillingDocument', 'BillingDocumentItem', 'Material', 'ProductDescription'] },
      { label: 'Quantities & Amounts', fields: ['BillingQuantity', 'BillingQuantityUnit', 'NetAmount', 'TransactionCurrency', 'Plant'] },
      { label: 'Reference', fields: ['ReferenceSDocument', 'ReferenceSDocumentItem'] }
    ],
    related: [{ nav: 'to_Product', label: 'Product' }]
  }
});

/* ------------------------------------------------------------------------- */
/* Finance                                                                   */
/* ------------------------------------------------------------------------- */

const journalEntry = entity({
  name: 'A_JournalEntry',
  label: 'Journal Entries',
  singular: 'Journal Entry',
  description: 'Accounting documents posted from billing and goods receipt.',
  fields: [
    { name: 'CompanyCode', label: 'Company Code', type: 'Edm.String', maxLength: 4, key: true, options: companyOptions, ui: { list: 110 } },
    { name: 'FiscalYear', label: 'Fiscal Year', type: 'Edm.String', maxLength: 4, key: true, ui: { list: 100, mono: true } },
    { name: 'AccountingDocument', label: 'Document', type: 'Edm.String', maxLength: 10, key: true, ui: { list: 140, mono: true } },
    { name: 'AccountingDocumentType', label: 'Type', type: 'Edm.String', maxLength: 2, options: ACCOUNTING_DOC_TYPES, ui: { list: 140, badge: true } },
    { name: 'PostingDate', label: 'Posting Date', type: 'Edm.Date', ui: { list: 130 } },
    { name: 'DocumentDate', label: 'Document Date', type: 'Edm.Date' },
    { name: 'DocumentCurrency', label: 'Currency', type: 'Edm.String', maxLength: 3, options: currencyOptions, ui: { list: 90, mono: true } },
    { name: 'TotalDebitAmount', label: 'Total Amount', type: 'Edm.Decimal', precision: 15, scale: 2, readOnly: true, ui: { list: 150, money: true } },
    { name: 'TaxAmount', label: 'Tax Amount', type: 'Edm.Decimal', precision: 15, scale: 2, readOnly: true },
    { name: 'ReferenceDocument', label: 'Reference', type: 'Edm.String', maxLength: 10, ui: { list: 140, mono: true } },
    { name: 'CreatedByUser', label: 'Created By', type: 'Edm.String', maxLength: 12, readOnly: true }
  ],
  nav: [{ name: 'to_Items', label: 'Line Items', target: 'A_JournalEntryItem', many: true, on: { CompanyCode: 'CompanyCode', FiscalYear: 'FiscalYear', AccountingDocument: 'AccountingDocument' } }],
  ui: {
    icon: 'landmark',
    group: 'Finance',
    title: 'AccountingDocument',
    subtitle: 'AccountingDocumentType',
    keyLabel: 'Accounting Document',
    headerStatus: ['AccountingDocumentType'],
    defaultOrder: 'PostingDate desc, AccountingDocument desc',
    searchFields: ['AccountingDocument', 'ReferenceDocument', 'AccountingDocumentType'],
    list: ['CompanyCode', 'FiscalYear', 'AccountingDocument', 'AccountingDocumentType', 'PostingDate', 'DocumentCurrency', 'TotalDebitAmount'],
    filters: [
      { field: 'AccountingDocumentType', label: 'Type', options: ACCOUNTING_DOC_TYPES },
      { field: 'CompanyCode', label: 'Company Code', options: companyOptions }
    ],
    sections: [
      { label: 'General', fields: ['CompanyCode', 'FiscalYear', 'AccountingDocument', 'AccountingDocumentType', 'PostingDate', 'DocumentDate', 'DocumentCurrency', 'TotalDebitAmount', 'TaxAmount'] },
      { label: 'Reference', fields: ['ReferenceDocument', 'CreatedByUser'] }
    ],
    related: [{ nav: 'to_Items', label: 'Line Items', columns: ['JournalEntryItem', 'GLAccount', 'GLAccountName', 'DebitAmount', 'CreditAmount', 'CostCenter', 'ItemText'] }]
  },
  keyGeneration: { strategy: 'numeric', start: 5100000001, pad: 10 }
});

const journalEntryItem = entity({
  name: 'A_JournalEntryItem',
  label: 'Journal Entry Items',
  singular: 'Journal Entry Item',
  description: 'Line items of accounting documents.',
  fields: [
    { name: 'CompanyCode', label: 'Company Code', type: 'Edm.String', maxLength: 4, key: true, options: companyOptions, ui: { list: 110 } },
    { name: 'FiscalYear', label: 'Fiscal Year', type: 'Edm.String', maxLength: 4, key: true, ui: { list: 90, mono: true } },
    { name: 'AccountingDocument', label: 'Document', type: 'Edm.String', maxLength: 10, key: true, ui: { list: 140, mono: true } },
    { name: 'JournalEntryItem', label: 'Line', type: 'Edm.String', maxLength: 3, key: true, ui: { list: 80, mono: true } },
    { name: 'GLAccount', label: 'G/L Account', type: 'Edm.String', maxLength: 6, options: glOptions, ui: { list: 110, mono: true } },
    { name: 'GLAccountName', label: 'G/L Account Name', type: 'Edm.String', maxLength: 60, readOnly: true, ui: { list: 200 } },
    { name: 'DebitAmount', label: 'Debit', type: 'Edm.Decimal', precision: 15, scale: 2, ui: { list: 130, money: true } },
    { name: 'CreditAmount', label: 'Credit', type: 'Edm.Decimal', precision: 15, scale: 2, ui: { list: 130, money: true } },
    { name: 'DocumentCurrency', label: 'Currency', type: 'Edm.String', maxLength: 3, options: currencyOptions, ui: { list: 90, mono: true } },
    { name: 'CostCenter', label: 'Cost Center', type: 'Edm.String', maxLength: 8, options: costCenterOptions, ui: { list: 120 } },
    { name: 'ProfitCenter', label: 'Profit Center', type: 'Edm.String', maxLength: 6, options: profitCenterOptions, ui: { list: 120 } },
    { name: 'ItemText', label: 'Item Text', type: 'Edm.String', maxLength: 80, ui: { list: 240 } }
  ],
  nav: [{ name: 'to_JournalEntry', label: 'Journal Entry', target: 'A_JournalEntry', many: false, on: { CompanyCode: 'CompanyCode', FiscalYear: 'FiscalYear', AccountingDocument: 'AccountingDocument' } }],
  ui: {
    icon: 'list',
    group: 'Finance',
    title: 'GLAccountName',
    subtitle: 'AccountingDocument',
    defaultOrder: 'AccountingDocument desc, JournalEntryItem asc',
    searchFields: ['AccountingDocument', 'GLAccount', 'GLAccountName', 'ItemText'],
    list: ['CompanyCode', 'FiscalYear', 'AccountingDocument', 'JournalEntryItem', 'GLAccount', 'GLAccountName', 'DebitAmount', 'CreditAmount'],
    sections: [
      { label: 'Account Assignment', fields: ['CompanyCode', 'FiscalYear', 'AccountingDocument', 'JournalEntryItem', 'GLAccount', 'GLAccountName'] },
      { label: 'Amounts', fields: ['DebitAmount', 'CreditAmount', 'DocumentCurrency'] },
      { label: 'Additional Assignment', fields: ['CostCenter', 'ProfitCenter', 'ItemText'] }
    ],
    related: [{ nav: 'to_JournalEntry', label: 'Journal Entry' }]
  }
});

/* ------------------------------------------------------------------------- */
/* Service catalog                                                           */
/* ------------------------------------------------------------------------- */

const services = [
  service('API_BUSINESS_PARTNER', 'Business Partner', 'Business partner master data, roles, addresses, customers and suppliers.', 'Master Data', 'people', [
    businessPartner,
    businessPartnerAddress,
    businessPartnerRole,
    customer,
    supplier
  ]),
  service('API_PRODUCT_SRV', 'Product Master Data', 'Material master data with descriptions, dimensions, and valuation.', 'Master Data', 'box', [product]),
  service('API_SALES_ORDER_SRV', 'Sales Order', 'Sales order headers, items, and delivery schedule lines.', 'Sales', 'cart', [
    salesOrder,
    salesOrderItem,
    salesOrderScheduleLine
  ]),
  service('API_PURCHASEORDER_PROCESS_SRV', 'Purchase Order', 'Purchase orders and line items for procurement.', 'Procurement', 'shopping-bag', [
    purchaseOrder,
    purchaseOrderItem
  ]),
  service('API_BILLING_DOCUMENT_SRV', 'Billing Document', 'Customer invoices, credit memos and their line items.', 'Sales', 'file-text', [
    billingDocument,
    billingDocumentItem
  ]),
  service('API_JOURNAL_ENTRY_SRV', 'Journal Entry', 'Accounting documents and G/L line items posted from logistics.', 'Finance', 'landmark', [
    journalEntry,
    journalEntryItem
  ])
];

// Resolve navigation target services now that every entity set is registered.
for (const svc of services) {
  for (const ent of Object.values(svc.entities)) {
    for (const nav of ent.nav) {
      nav.targetService = nav.targetService || serviceMap[nav.target];
      if (!nav.targetService) throw new Error(`Unknown nav target ${nav.target} on ${ent.name}`);
      ent.navMap[nav.name] = nav;
    }
  }
}

const serviceMapById = Object.fromEntries(services.map((s) => [s.id, s]));

function getEntity(serviceId, entityName) {
  const svc = serviceMapById[serviceId];
  if (!svc) return null;
  const key = Object.keys(svc.entities).find((k) => k.toLowerCase() === String(entityName).toLowerCase());
  return key ? svc.entities[key] : null;
}

function getEntityById(entityName) {
  const id = serviceMap[entityName];
  return id ? getEntity(id, entityName) : null;
}

module.exports = {
  services,
  serviceMapById,
  entitySets,
  getEntity,
  getEntityById,
  resolveFullName
};
