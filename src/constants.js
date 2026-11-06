'use strict';

/**
 * Static reference data shared by the schema and the seed generator.
 * Kept intentionally small but realistic enough to make the sandbox feel alive.
 */

const COUNTRIES = [
  { code: 'DE', name: 'Germany', language: 'DE', currency: 'EUR', cities: ['Walldorf', 'Berlin', 'Hamburg', 'Munich', 'Stuttgart', 'Cologne'] },
  { code: 'US', name: 'United States', language: 'EN', currency: 'USD', cities: ['New York', 'Chicago', 'Austin', 'Seattle', 'Atlanta', 'Denver'] },
  { code: 'GB', name: 'United Kingdom', language: 'EN', currency: 'GBP', cities: ['London', 'Manchester', 'Birmingham', 'Leeds'] },
  { code: 'NL', name: 'Netherlands', language: 'NL', currency: 'EUR', cities: ['Amsterdam', 'Rotterdam', 'Utrecht'] },
  { code: 'FR', name: 'France', language: 'FR', currency: 'EUR', cities: ['Paris', 'Lyon', 'Toulouse'] },
  { code: 'ZA', name: 'South Africa', language: 'EN', currency: 'ZAR', cities: ['Johannesburg', 'Cape Town', 'Durban', 'Pretoria'] },
  { code: 'IN', name: 'India', language: 'EN', currency: 'INR', cities: ['Bengaluru', 'Mumbai', 'Pune', 'Chennai'] },
  { code: 'JP', name: 'Japan', language: 'JA', currency: 'JPY', cities: ['Tokyo', 'Osaka', 'Yokohama'] },
  { code: 'BR', name: 'Brazil', language: 'PT', currency: 'BRL', cities: ['São Paulo', 'Rio de Janeiro', 'Curitiba'] },
  { code: 'AU', name: 'Australia', language: 'EN', currency: 'AUD', cities: ['Sydney', 'Melbourne', 'Brisbane'] },
  { code: 'CA', name: 'Canada', language: 'EN', currency: 'CAD', cities: ['Toronto', 'Vancouver', 'Montreal'] },
  { code: 'CN', name: 'China', language: 'ZH', currency: 'CNY', cities: ['Shanghai', 'Shenzhen', 'Beijing'] }
];

const COUNTRY_NAME = Object.fromEntries(COUNTRIES.map((c) => [c.code, c.name]));
const COUNTRY_CURRENCY = Object.fromEntries(COUNTRIES.map((c) => [c.code, c.currency]));
const COUNTRY_LANGUAGE = Object.fromEntries(COUNTRIES.map((c) => [c.code, c.language]));

const COMPANY_CODES = [
  { code: '1010', name: 'S4H Sandbox SE', country: 'DE', currency: 'EUR', city: 'Walldorf' },
  { code: '1710', name: 'S4H Sandbox Inc.', country: 'US', currency: 'USD', city: 'Austin' },
  { code: '2520', name: 'S4H Sandbox Ltd.', country: 'GB', currency: 'GBP', city: 'London' },
  { code: '3000', name: 'S4H Sandbox Pty Ltd.', country: 'ZA', currency: 'ZAR', city: 'Johannesburg' }
];

const PLANTS = [
  { code: '1010', name: 'Walldorf Plant', country: 'DE', city: 'Walldorf' },
  { code: '1020', name: 'Hamburg Distribution', country: 'DE', city: 'Hamburg' },
  { code: '1710', name: 'Austin Plant', country: 'US', city: 'Austin' },
  { code: '2520', name: 'London Warehouse', country: 'GB', city: 'London' },
  { code: '3000', name: 'Johannesburg Plant', country: 'ZA', city: 'Johannesburg' }
];

const SALES_ORGS = [
  { code: '1010', name: 'EMEA Sales', country: 'DE' },
  { code: '1710', name: 'Americas Sales', country: 'US' },
  { code: '2520', name: 'UK & Nordics Sales', country: 'GB' },
  { code: '3000', name: 'Africa Sales', country: 'ZA' }
];

const PURCHASING_ORGS = [
  { code: '1010', name: 'EMEA Procurement', companyCode: '1010' },
  { code: '1710', name: 'Americas Procurement', companyCode: '1710' },
  { code: '2520', name: 'UK Procurement', companyCode: '2520' }
];

const CURRENCIES = [
  { code: 'EUR', label: 'Euro' },
  { code: 'USD', label: 'US Dollar' },
  { code: 'GBP', label: 'Pound Sterling' },
  { code: 'ZAR', label: 'South African Rand' },
  { code: 'INR', label: 'Indian Rupee' },
  { code: 'JPY', label: 'Japanese Yen' },
  { code: 'BRL', label: 'Brazilian Real' },
  { code: 'AUD', label: 'Australian Dollar' },
  { code: 'CAD', label: 'Canadian Dollar' },
  { code: 'CNY', label: 'Chinese Yuan' }
];

const PAYMENT_TERMS = [
  { value: '0001', label: 'Pay immediately' },
  { value: '0002', label: '14 days net' },
  { value: '0004', label: '30 days net' },
  { value: '0006', label: '60 days net' }
];

const CUSTOMER_GROUPS = [
  { value: '0001', label: 'Sold-to Party' },
  { value: '0002', label: 'Ship-to Party' },
  { value: '0003', label: 'Payer' },
  { value: '0004', label: 'Bill-to Party' }
];

const SUPPLIER_GROUPS = [
  { value: '0001', label: 'Supplying Vendor' },
  { value: '0002', label: 'Goods Supplier' },
  { value: '0003', label: 'Service Provider' }
];

const DELIVERY_PRIORITIES = [
  { value: '01', label: 'High' },
  { value: '02', label: 'Normal' },
  { value: '03', label: 'Low' }
];

const BP_GROUPS = [
  { value: 'BP01', label: 'Customer' },
  { value: 'BP02', label: 'Supplier' },
  { value: 'BP03', label: 'Employee' },
  { value: 'BP04', label: 'Partner' }
];

const BP_ROLES = [
  { value: 'FLCU00', label: 'Customer' },
  { value: 'FLVN00', label: 'Supplier' },
  { value: 'BUP003', label: 'Employee' },
  { value: 'BUP001', label: 'Contact Person' }
];

const BP_CATEGORIES = [
  { value: '1', label: 'Person' },
  { value: '2', label: 'Organization' },
  { value: '3', label: 'Group' }
];

const PRODUCT_TYPES = [
  { value: 'FERT', label: 'Finished Good', tone: 'info' },
  { value: 'HAWA', label: 'Trading Good', tone: 'neutral' },
  { value: 'ROH', label: 'Raw Material', tone: 'warning' },
  { value: 'HALB', label: 'Semi-Finished', tone: 'neutral' }
];

const PRODUCT_GROUPS = [
  { value: 'L001', label: 'Bicycles' },
  { value: 'L002', label: 'Machinery' },
  { value: 'L003', label: 'Components' },
  { value: 'L004', label: 'Trading Goods' },
  { value: 'L005', label: 'Raw Materials' }
];

const UNITS = [
  { value: 'PC', label: 'Piece' },
  { value: 'KG', label: 'Kilogram' },
  { value: 'L', label: 'Litre' },
  { value: 'M', label: 'Metre' },
  { value: 'SET', label: 'Set' },
  { value: 'BOX', label: 'Box' }
];

const SALES_ORDER_TYPES = [
  { value: 'OR', label: 'Standard Order' },
  { value: 'RE', label: 'Returns Order' },
  { value: 'CR', label: 'Credit Memo Request' }
];

const SALES_ORG_VALUES = SALES_ORGS.map((o) => ({ value: o.code, label: `${o.code} – ${o.name}` }));
const CHANNELS = [
  { value: '10', label: 'Direct Sales' },
  { value: '20', label: 'Retail' },
  { value: '30', label: 'Distributor' }
];
const DIVISIONS = [
  { value: '00', label: 'Cross-Division' },
  { value: '01', label: 'Bicycles' },
  { value: '02', label: 'Machinery' },
  { value: '03', label: 'Components' }
];

const DELIVERY_STATUS = [
  { value: 'A', label: 'Open', tone: 'warning' },
  { value: 'B', label: 'Partially Delivered', tone: 'info' },
  { value: 'C', label: 'Delivered', tone: 'positive' }
];

const BILLING_STATUS = [
  { value: 'A', label: 'Not Billed', tone: 'warning' },
  { value: 'B', label: 'Partially Billed', tone: 'info' },
  { value: 'C', label: 'Fully Billed', tone: 'positive' }
];

const INCOTERMS = [
  { value: 'DAP', label: 'DAP – Delivered at Place' },
  { value: 'FOB', label: 'FOB – Free on Board' },
  { value: 'CIF', label: 'CIF – Cost Insurance Freight' },
  { value: 'EXW', label: 'EXW – Ex Works' },
  { value: 'CPT', label: 'CPT – Carriage Paid To' }
];

const PO_TYPES = [
  { value: 'NB', label: 'Standard PO' },
  { value: 'ZNB', label: 'Custom PO' },
  { value: 'FO', label: 'Framework Order' }
];

const BILLING_TYPES = [
  { value: 'F2', label: 'Invoice', tone: 'positive' },
  { value: 'G2', label: 'Credit Memo', tone: 'warning' },
  { value: 'L2', label: 'Debit Memo', tone: 'info' }
];

const ACCOUNTING_DOC_TYPES = [
  { value: 'RV', label: 'Billing Document', tone: 'positive' },
  { value: 'WE', label: 'Goods Receipt', tone: 'info' },
  { value: 'SA', label: 'G/L Account', tone: 'neutral' },
  { value: 'KR', label: 'Vendor Invoice', tone: 'warning' }
];

const GL_ACCOUNTS = [
  { code: '121000', name: 'Accounts Receivable' },
  { code: '131000', name: 'Inventory – Finished Goods' },
  { code: '191100', name: 'GR/IR Clearing' },
  { code: '175000', name: 'Tax Payable' },
  { code: '800000', name: 'Revenue – Domestic' },
  { code: '810000', name: 'Revenue – Export' }
];

const COST_CENTERS = ['CC1000', 'CC2000', 'CC3000', 'CC4000'];
const PROFIT_CENTERS = ['PC100', 'PC200', 'PC300'];

const USERS = [
  { id: 'DEVELOPER', name: 'Developer', password: 'Password1', roles: ['SAP_ALL'] },
  { id: 'DEMO', name: 'Demo User', password: 'Demo1234', roles: ['READ_ONLY'] },
  { id: 'AUDITOR', name: 'Auditor', password: 'Audit1234', roles: ['READ_ONLY'] }
];

module.exports = {
  COUNTRIES,
  COUNTRY_NAME,
  COUNTRY_CURRENCY,
  COUNTRY_LANGUAGE,
  COMPANY_CODES,
  PLANTS,
  SALES_ORGS,
  PURCHASING_ORGS,
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
  USERS
};
