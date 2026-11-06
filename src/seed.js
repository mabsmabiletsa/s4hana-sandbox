'use strict';

const {
  COUNTRIES,
  COUNTRY_NAME,
  COUNTRY_CURRENCY,
  COUNTRY_LANGUAGE,
  COMPANY_CODES,
  PLANTS,
  SALES_ORGS,
  GL_ACCOUNTS,
  COST_CENTERS,
  PROFIT_CENTERS
} = require('./constants');
const {
  mulberry32,
  pick,
  randInt,
  chance,
  round2,
  round3,
  addDays,
  isoDate,
  pad,
  slug
} = require('./util');

const DIAL_CODES = {
  DE: '+49', US: '+1', GB: '+44', NL: '+31', FR: '+33', ZA: '+27',
  IN: '+91', JP: '+81', BR: '+55', AU: '+61', CA: '+1', CN: '+86'
};

const REGIONS = {
  US: ['TX', 'IL', 'NY', 'WA', 'GA', 'CO'],
  DE: ['BW', 'BE', 'HH', 'BY', 'NW', 'HE'],
  GB: ['ENG', 'SCT', 'WLS'],
  ZA: ['GP', 'WC', 'KZN'],
  NL: ['NH', 'ZH', 'UT'],
  FR: ['IDF', 'ARA', 'OCC'],
  IN: ['KA', 'MH', 'TN'],
  JP: ['13', '27', '14'],
  BR: ['SP', 'RJ', 'PR'],
  AU: ['NSW', 'VIC', 'QLD'],
  CA: ['ON', 'BC', 'QC'],
  CN: ['SH', 'GD', 'BJ']
};

const LEGAL_FORMS = {
  DE: ['GmbH', 'AG', 'GmbH & Co. KG'],
  US: ['Inc.', 'LLC', 'Corp.'],
  GB: ['Ltd.', 'PLC'],
  NL: ['B.V.', 'N.V.'],
  FR: ['SARL', 'S.A.'],
  ZA: ['(Pty) Ltd.'],
  IN: ['Pvt. Ltd.'],
  JP: ['K.K.'],
  BR: ['Ltda.'],
  AU: ['Pty Ltd.'],
  CA: ['Inc.'],
  CN: ['Co., Ltd.']
};

const STREETS = [
  'Hauptstrasse', 'Lindenweg', 'Industrial Road', 'Market Street', 'Park Avenue',
  'Station Road', 'Harbour Drive', 'Innovation Way', 'Kaiserstrasse', 'Oak Lane',
  'Riverside Drive', 'Trade Park', 'Gartenstrasse', 'Mill Road', 'Sunrise Boulevard'
];

const CUSTOMER_BASES = [
  'Northwind', 'Acme', 'Globex', 'Initech', 'Umbrella', 'Stark', 'Wayne', 'Contoso',
  'Fabrikam', 'Tailspin', 'Litware', 'Proseware', 'Adventure Works', 'Blue Yonder', 'Coho',
  'Wingtip', 'Alpine', 'Aurora', 'Vertex', 'Quantum', 'Nova', 'Meridian', 'Cascade', 'Summit',
  'Orion', 'Pinnacle', 'Evergreen', 'Redwood', 'Silverline', 'Ironbridge', 'Clearwater',
  'Brightstar', 'Copperfield', 'Granite', 'Harbor', 'Juniper', 'Kestrel', 'Lakeside', 'Monarch', 'Regency'
];

const CUSTOMER_SUFFIXES = [
  'Industries', 'Trading GmbH', 'Logistics', 'Manufacturing', 'Retail Group', 'Solutions',
  'Systems', 'Motors', 'Foods', 'Pharma', 'Energy', 'Aerospace', 'Consulting', 'Distribution',
  'Technologies', 'Materials'
];

const SUPPLIER_BASES = [
  'Metalworks', 'Polymer', 'Semiconductor', 'Precision', 'Packaging', 'Electro', 'Steel',
  'Components', 'Materials', 'Tooling', 'Forge', 'Alloy', 'Polyplast', 'Circuitry', 'Fibre', 'Chemie'
];

const SUPPLIER_SUFFIXES = ['AG', 'GmbH', 'Ltd.', 'Inc.', 'Co.', 'Group', 'Supply', 'Partners'];

const FIRST_NAMES = [
  'Anna', 'Ben', 'Chloe', 'David', 'Elena', 'Farhan', 'Grace', 'Hiro', 'Isabel', 'James',
  'Karabo', 'Liam', 'Maya', 'Noah', 'Olivia', 'Priya', 'Quinn', 'Rafael', 'Sofia', 'Thabo',
  'Uma', 'Victor', 'Wendy', 'Yusuf'
];

const LAST_NAMES = [
  'Anderson', 'Baker', 'Chen', 'Dlamini', 'Evans', 'Fischer', 'Garcia', 'Hassan', 'Ito',
  'Jansen', 'Khan', 'Lopez', 'Meyer', 'Nakamura', 'Okafor', 'Patel', 'Quist', 'Rossi',
  'Silva', 'Tanaka', 'Underwood', 'Visser', 'Wang', 'Young'
];

const FINISHED_PRODUCTS = [
  { base: 'Trail Bike', group: 'L001', division: '01', unit: 'PC', min: 650, max: 2400, weight: [12, 18] },
  { base: 'City Bike', group: 'L001', division: '01', unit: 'PC', min: 450, max: 1200, weight: [10, 16] },
  { base: 'E-Bike', group: 'L001', division: '01', unit: 'PC', min: 1800, max: 5200, weight: [22, 32] },
  { base: 'Road Bike', group: 'L001', division: '01', unit: 'PC', min: 900, max: 4600, weight: [7, 11] },
  { base: 'Cargo Bike', group: 'L001', division: '01', unit: 'PC', min: 1400, max: 3900, weight: [28, 42] },
  { base: 'Hydraulic Pump', group: 'L002', division: '02', unit: 'PC', min: 1200, max: 7800, weight: [35, 120] },
  { base: 'Air Compressor', group: 'L002', division: '02', unit: 'PC', min: 2400, max: 12500, weight: [80, 320] },
  { base: 'Industrial Robot', group: 'L002', division: '02', unit: 'PC', min: 18000, max: 64000, weight: [280, 900] },
  { base: 'Conveyor Belt', group: 'L002', division: '02', unit: 'M', min: 340, max: 1450, weight: [18, 55] },
  { base: 'CNC Machine', group: 'L002', division: '02', unit: 'PC', min: 24000, max: 94000, weight: [1200, 3400] },
  { base: 'Gearbox', group: 'L003', division: '03', unit: 'PC', min: 380, max: 2600, weight: [15, 70] },
  { base: 'Servo Motor', group: 'L003', division: '03', unit: 'PC', min: 190, max: 1850, weight: [3, 24] },
  { base: 'Control Panel', group: 'L003', division: '03', unit: 'PC', min: 240, max: 2900, weight: [4, 28] },
  { base: 'Forklift', group: 'L002', division: '02', unit: 'PC', min: 9800, max: 34000, weight: [1600, 4200] },
  { base: 'Pallet Truck', group: 'L002', division: '02', unit: 'PC', min: 280, max: 1400, weight: [55, 180] }
];

const TRADING_PRODUCTS = [
  { base: 'Helmet', unit: 'PC', min: 25, max: 210, weight: [0.4, 1.2] },
  { base: 'Cycling Gloves', unit: 'PC', min: 8, max: 65, weight: [0.1, 0.3] },
  { base: 'Chain Lubricant', unit: 'L', min: 6, max: 45, weight: [0.9, 1.1] },
  { base: 'Battery Pack', unit: 'PC', min: 120, max: 980, weight: [1.5, 6] },
  { base: 'Fast Charger', unit: 'PC', min: 45, max: 260, weight: [0.5, 1.4] },
  { base: 'Toolkit', unit: 'SET', min: 35, max: 320, weight: [1, 4] },
  { base: 'Safety Vest', unit: 'PC', min: 9, max: 54, weight: [0.2, 0.5] },
  { base: 'Spare Tyre', unit: 'PC', min: 18, max: 120, weight: [0.8, 2.4] },
  { base: 'LED Work Lamp', unit: 'PC', min: 15, max: 150, weight: [0.3, 1.1] },
  { base: 'Fastener Set', unit: 'BOX', min: 4, max: 38, weight: [0.4, 2] },
  { base: 'Hydraulic Oil', unit: 'L', min: 12, max: 85, weight: [0.85, 1] },
  { base: 'Sealing Kit', unit: 'SET', min: 22, max: 180, weight: [0.2, 1.6] },
  { base: 'Display Cover', unit: 'PC', min: 18, max: 95, weight: [0.1, 0.4] },
  { base: 'Brake Pad Set', unit: 'SET', min: 12, max: 88, weight: [0.2, 0.8] },
  { base: 'Steel Cable', unit: 'M', min: 2, max: 20, weight: [0.1, 0.6] },
  { base: 'Paint Marker', unit: 'BOX', min: 6, max: 42, weight: [0.2, 0.7] }
];

const RAW_PRODUCTS = [
  { base: 'Steel Sheet', unit: 'KG', min: 1.2, max: 8.5, weight: [1, 1] },
  { base: 'Aluminium Bar', unit: 'KG', min: 2.4, max: 12, weight: [1, 1] },
  { base: 'Copper Wire', unit: 'KG', min: 6, max: 24, weight: [1, 1] },
  { base: 'Rubber Compound', unit: 'KG', min: 1.8, max: 7.5, weight: [1, 1] },
  { base: 'Polymer Granulate', unit: 'KG', min: 1.5, max: 6.2, weight: [1, 1] },
  { base: 'Glass Panel', unit: 'PC', min: 18, max: 140, weight: [2, 18] },
  { base: 'Paint Base', unit: 'L', min: 4, max: 28, weight: [0.9, 1.4] },
  { base: 'O-Ring Kit', unit: 'SET', min: 3, max: 36, weight: [0.1, 0.5] },
  { base: 'Bearing Steel', unit: 'KG', min: 3, max: 16, weight: [1, 1] },
  { base: 'Carbon Fibre Mat', unit: 'M', min: 14, max: 95, weight: [0.3, 1.2] },
  { base: 'Industrial Adhesive', unit: 'L', min: 7, max: 48, weight: [0.9, 1.3] },
  { base: 'Nickel Alloy', unit: 'KG', min: 14, max: 68, weight: [1, 1] }
];

const MODELS = ['X100', 'X200', 'Pro', 'Compact', 'Heavy Duty', 'Eco', 'Precision', 'Max'];

function buildSeed() {
  const rnd = mulberry32(0x5a17c0de);
  const now = new Date();
  const today = new Date(now.getFullYear(), now.getMonth(), now.getDate());
  const data = {};
  const meta = {};

  function add(service, entity, rows) {
    const key = `${service}.${entity}`;
    if (!data[key]) data[key] = [];
    if (Array.isArray(rows)) data[key].push(...rows);
    else data[key].push(rows);
  }

  const usedNames = new Set();
  const usedEmails = new Set();

  function uniqueOrgName(bases, suffixes) {
    for (let i = 0; i < 500; i++) {
      const name = `${pick(rnd, bases)} ${pick(rnd, suffixes)}`;
      if (!usedNames.has(name)) {
        usedNames.add(name);
        return name;
      }
    }
    const fallback = `${pick(rnd, bases)} ${pick(rnd, suffixes)} ${usedNames.size}`;
    usedNames.add(fallback);
    return fallback;
  }

  function uniqueEmail(prefix, domain) {
    let email = `${prefix}@${domain}`;
    let n = 1;
    while (usedEmails.has(email)) email = `${prefix}${n++}@${domain}`;
    usedEmails.add(email);
    return email;
  }

  /* ---------------------------------------------------------------- */
  /* Business partners, addresses, roles, customers, suppliers         */
  /* ---------------------------------------------------------------- */

  const businessPartners = [];
  const addresses = [];
  const bpRoles = [];
  const customers = [];
  const suppliers = [];

  const CUSTOMER_COUNT = 40;
  const SUPPLIER_COUNT = 14;
  const PERSON_COUNT = 8;

  let bpNumber = 1000001;
  const orgRecords = [];

  for (let i = 0; i < CUSTOMER_COUNT + SUPPLIER_COUNT; i++) {
    const isCustomer = i < CUSTOMER_COUNT;
    const name = isCustomer
      ? uniqueOrgName(CUSTOMER_BASES, CUSTOMER_SUFFIXES)
      : uniqueOrgName(SUPPLIER_BASES, SUPPLIER_SUFFIXES);
    const country = pick(rnd, COUNTRIES);
    const city = pick(rnd, country.cities);
    const region = pick(rnd, REGIONS[country.code] || ['']);
    const street = pick(rnd, STREETS);
    const houseNumber = String(randInt(rnd, 1, 240));
    const postalCode = pad(randInt(rnd, 1000, 99999), country.code === 'DE' ? 5 : 5);
    const creationDate = isoDate(addDays(today, -randInt(rnd, 40, 1500)));
    const bpn = String(bpNumber++);
    const email = uniqueEmail(`info.${slug(name).toLowerCase().slice(0, 14)}`, `${slug(name).toLowerCase().slice(0, 20)}.example`);
    const record = {
      BusinessPartner: bpn,
      BusinessPartnerCategory: '2',
      BusinessPartnerFullName: name,
      BusinessPartnerName: name,
      FirstName: '',
      LastName: '',
      BusinessPartnerGrouping: isCustomer ? 'BP01' : 'BP02',
      SearchTerm1: name.split(/\s+/)[0].toUpperCase().slice(0, 20),
      Country: country.code,
      CountryName: country.name,
      Region: region,
      CityName: city,
      PostalCode: postalCode,
      StreetName: street,
      HouseNumber: houseNumber,
      Language: country.language,
      PhoneNumber: `${DIAL_CODES[country.code] || '+1'} ${randInt(rnd, 10, 99)} ${randInt(rnd, 100, 999)} ${randInt(rnd, 1000, 9999)}`,
      MobilePhoneNumber: chance(rnd, 0.45) ? `${DIAL_CODES[country.code] || '+1'} ${randInt(rnd, 60, 79)} ${randInt(rnd, 100, 999)} ${randInt(rnd, 1000, 9999)}` : '',
      EmailAddress: email,
      FaxNumber: chance(rnd, 0.25) ? `${DIAL_CODES[country.code] || '+1'} ${randInt(rnd, 10, 99)} ${randInt(rnd, 100, 999)} ${randInt(rnd, 1000, 9999)}` : '',
      VATRegistration: `${country.code}${randInt(rnd, 100000000, 999999999)}`,
      TaxNumber1: `${country.code}-${randInt(rnd, 10, 99)}-${randInt(rnd, 100, 999)}-${randInt(rnd, 1000, 9999)}`,
      LegalForm: pick(rnd, LEGAL_FORMS[country.code] || ['Ltd.']),
      IsBlocked: chance(rnd, 0.04),
      CreatedByUser: pick(rnd, ['DEVELOPER', 'JSMITH', 'AKHAN', 'MLOPEZ', 'TNKOSI']),
      CreationDate: creationDate,
      LastChangeDate: isoDate(addDays(new Date(creationDate), randInt(rnd, 0, 300)))
    };

    businessPartners.push(record);
    orgRecords.push(record);

    addresses.push({
      BusinessPartner: bpn,
      AddressID: '0000000001',
      AddressType: '01',
      Country: country.code,
      CountryName: country.name,
      Region: region,
      CityName: city,
      PostalCode: postalCode,
      StreetName: street,
      HouseNumber: houseNumber,
      PhoneNumber: record.PhoneNumber,
      EmailAddress: email,
      IsDefaultAddress: true
    });

    if (chance(rnd, 0.28)) {
      addresses.push({
        BusinessPartner: bpn,
        AddressID: '0000000002',
        AddressType: '02',
        Country: country.code,
        CountryName: country.name,
        Region: region,
        CityName: chance(rnd, 0.4) ? pick(rnd, country.cities) : city,
        PostalCode: pad(randInt(rnd, 1000, 99999), 5),
        StreetName: pick(rnd, STREETS),
        HouseNumber: String(randInt(rnd, 1, 180)),
        PhoneNumber: `${DIAL_CODES[country.code] || '+1'} ${randInt(rnd, 10, 99)} ${randInt(rnd, 100, 999)} ${randInt(rnd, 1000, 9999)}`,
        EmailAddress: '',
        IsDefaultAddress: false
      });
    }

    if (isCustomer) {
      bpRoles.push({
        BusinessPartner: bpn,
        BusinessPartnerRole: 'FLCU00',
        ValidFrom: creationDate,
        ValidTo: null,
        IsDefaultRole: true
      });
      const salesOrg = pick(rnd, SALES_ORGS);
      customers.push({
        Customer: bpn,
        CustomerName: name,
        CustomerAccountGroup: chance(rnd, 0.85) ? '0001' : '0002',
        CountryName: country.name,
        CityName: city,
        SalesOrganization: salesOrg.code,
        DistributionChannel: pick(rnd, ['10', '10', '20', '30']),
        Division: pick(rnd, ['00', '01', '02', '03']),
        Currency: country.currency,
        PaymentTerms: pick(rnd, ['0001', '0002', '0004', '0004', '0006']),
        DeliveryPriority: pick(rnd, ['01', '02', '02', '03']),
        IsBlocked: record.IsBlocked,
        CreationDate: creationDate
      });
    } else {
      bpRoles.push({
        BusinessPartner: bpn,
        BusinessPartnerRole: 'FLVN00',
        ValidFrom: creationDate,
        ValidTo: null,
        IsDefaultRole: true
      });
      suppliers.push({
        Supplier: bpn,
        SupplierName: name,
        SupplierAccountGroup: pick(rnd, ['0001', '0001', '0002']),
        CountryName: country.name,
        CityName: city,
        Currency: country.currency,
        PaymentTerms: pick(rnd, ['0002', '0004', '0004', '0006']),
        PhoneNumber: record.PhoneNumber,
        EmailAddress: email,
        IsBlocked: record.IsBlocked,
        CreationDate: creationDate
      });
    }
  }

  // A handful of organisations act as both customer and supplier.
  for (let i = 0; i < 5; i++) {
    const customer = customers[i * 3];
    if (!customer) continue;
    const bp = businessPartners.find((b) => b.BusinessPartner === customer.Customer);
    if (!bp) continue;
    if (bpRoles.some((r) => r.BusinessPartner === bp.BusinessPartner && r.BusinessPartnerRole === 'FLVN00')) continue;
    bpRoles.push({
      BusinessPartner: bp.BusinessPartner,
      BusinessPartnerRole: 'FLVN00',
      ValidFrom: bp.CreationDate,
      ValidTo: null,
      IsDefaultRole: false
    });
    suppliers.push({
      Supplier: bp.BusinessPartner,
      SupplierName: bp.BusinessPartnerFullName,
      SupplierAccountGroup: '0002',
      CountryName: bp.CountryName,
      CityName: bp.CityName,
      Currency: COUNTRY_CURRENCY[bp.Country] || 'EUR',
      PaymentTerms: '0004',
      PhoneNumber: bp.PhoneNumber,
      EmailAddress: bp.EmailAddress,
      IsBlocked: bp.IsBlocked,
      CreationDate: bp.CreationDate
    });
  }

  // Natural persons (employees / contact persons).
  for (let i = 0; i < PERSON_COUNT; i++) {
    const firstName = pick(rnd, FIRST_NAMES);
    const lastName = pick(rnd, LAST_NAMES);
    const fullName = `${firstName} ${lastName}`;
    const country = pick(rnd, COUNTRIES);
    const city = pick(rnd, country.cities);
    const bpn = String(bpNumber++);
    const creationDate = isoDate(addDays(today, -randInt(rnd, 30, 900)));
    const email = uniqueEmail(`${firstName}.${lastName}`.toLowerCase(), 'example');
    const record = {
      BusinessPartner: bpn,
      BusinessPartnerCategory: '1',
      BusinessPartnerFullName: fullName,
      BusinessPartnerName: '',
      FirstName: firstName,
      LastName: lastName,
      BusinessPartnerGrouping: 'BP03',
      SearchTerm1: lastName.toUpperCase().slice(0, 20),
      Country: country.code,
      CountryName: country.name,
      Region: pick(rnd, REGIONS[country.code] || ['']),
      CityName: city,
      PostalCode: pad(randInt(rnd, 1000, 99999), 5),
      StreetName: pick(rnd, STREETS),
      HouseNumber: String(randInt(rnd, 1, 120)),
      Language: country.language,
      PhoneNumber: `${DIAL_CODES[country.code] || '+1'} ${randInt(rnd, 10, 99)} ${randInt(rnd, 100, 999)} ${randInt(rnd, 1000, 9999)}`,
      MobilePhoneNumber: `${DIAL_CODES[country.code] || '+1'} ${randInt(rnd, 60, 79)} ${randInt(rnd, 100, 999)} ${randInt(rnd, 1000, 9999)}`,
      EmailAddress: email,
      FaxNumber: '',
      VATRegistration: '',
      TaxNumber1: '',
      LegalForm: '',
      IsBlocked: false,
      CreatedByUser: 'DEVELOPER',
      CreationDate: creationDate,
      LastChangeDate: creationDate
    };
    businessPartners.push(record);
    addresses.push({
      BusinessPartner: bpn,
      AddressID: '0000000001',
      AddressType: '01',
      Country: country.code,
      CountryName: country.name,
      Region: record.Region,
      CityName: city,
      PostalCode: record.PostalCode,
      StreetName: record.StreetName,
      HouseNumber: record.HouseNumber,
      PhoneNumber: record.PhoneNumber,
      EmailAddress: email,
      IsDefaultAddress: true
    });
    bpRoles.push({
      BusinessPartner: bpn,
      BusinessPartnerRole: 'BUP003',
      ValidFrom: creationDate,
      ValidTo: null,
      IsDefaultRole: true
    });
  }

  add('API_BUSINESS_PARTNER', 'A_BusinessPartner', businessPartners);
  add('API_BUSINESS_PARTNER', 'A_BusinessPartnerAddress', addresses);
  add('API_BUSINESS_PARTNER', 'A_BusinessPartnerRole', bpRoles);
  add('API_BUSINESS_PARTNER', 'A_Customer', customers);
  add('API_BUSINESS_PARTNER', 'A_Supplier', suppliers);

  /* ---------------------------------------------------------------- */
  /* Products                                                          */
  /* ---------------------------------------------------------------- */

  const products = [];
  let finishedIndex = 0;
  let tradingIndex = 0;
  let rawIndex = 0;

  function productRecord(base, opts) {
    const description = `${base.base} ${pick(rnd, MODELS)}`;
    const weight = round3(opts.minWeight + rnd() * (opts.maxWeight - opts.minWeight));
    const price = round2(base.min + rnd() * (base.max - base.min));
    const created = isoDate(addDays(today, -randInt(rnd, 60, 1600)));
    return {
      Product: opts.key,
      ProductDescription: description,
      ProductType: opts.type,
      ProductGroup: base.group || opts.group,
      BaseUnit: base.unit,
      Division: base.division || opts.division,
      GrossWeight: round3(weight * 1.08),
      NetWeight: weight,
      WeightUnit: 'KG',
      StandardPrice: price,
      Currency: 'EUR',
      CountryOfOrigin: pick(rnd, COUNTRIES).code,
      IsMarkedForDeletion: chance(rnd, 0.02),
      CreationDate: created,
      LastChangeDate: isoDate(addDays(new Date(created), randInt(rnd, 0, 240)))
    };
  }

  for (const base of FINISHED_PRODUCTS) {
    const variants = finishedIndex < 10 ? 2 : 1;
    for (let v = 0; v < variants; v++) {
      finishedIndex++;
      products.push(productRecord(base, {
        key: `FG-${1000 + finishedIndex}`,
        type: 'FERT',
        group: base.group,
        division: base.division,
        minWeight: base.weight[0],
        maxWeight: base.weight[1]
      }));
    }
  }
  // Fill up to 24 finished products with extra variants of core lines.
  while (finishedIndex < 24) {
    const base = FINISHED_PRODUCTS[finishedIndex % FINISHED_PRODUCTS.length];
    finishedIndex++;
    products.push(productRecord(base, {
      key: `FG-${1000 + finishedIndex}`,
      type: 'FERT',
      group: base.group,
      division: base.division,
      minWeight: base.weight[0],
      maxWeight: base.weight[1]
    }));
  }

  for (const base of TRADING_PRODUCTS) {
    tradingIndex++;
    products.push(productRecord(base, {
      key: `TG-${2000 + tradingIndex}`,
      type: 'HAWA',
      group: 'L004',
      division: '03',
      minWeight: base.weight[0],
      maxWeight: base.weight[1]
    }));
  }

  for (const base of RAW_PRODUCTS) {
    rawIndex++;
    products.push(productRecord(base, {
      key: `RM-${3000 + rawIndex}`,
      type: 'ROH',
      group: 'L005',
      division: '03',
      minWeight: base.weight[0],
      maxWeight: base.weight[1]
    }));
  }

  add('API_PRODUCT_SRV', 'A_Product', products);

  const productByKey = Object.fromEntries(products.map((p) => [p.Product, p]));
  const productsByType = {
    FERT: products.filter((p) => p.ProductType === 'FERT'),
    HAWA: products.filter((p) => p.ProductType === 'HAWA'),
    ROH: products.filter((p) => p.ProductType === 'ROH')
  };

  /* ---------------------------------------------------------------- */
  /* Sales orders, items, schedule lines                               */
  /* ---------------------------------------------------------------- */

  const salesOrders = [];
  const salesOrderItems = [];
  const scheduleLines = [];
  const plantCodes = PLANTS.map((p) => p.code);

  function quantityFor(product) {
    if (product.ProductType === 'ROH') return randInt(rnd, 20, 400);
    if (product.ProductType === 'HAWA') return randInt(rnd, 2, 80);
    return randInt(rnd, 1, 22);
  }

  for (let i = 0; i < 68; i++) {
    const customer = pick(rnd, customers);
    const ageDays = randInt(rnd, 2, 540);
    const orderDate = addDays(today, -ageDays);
    let overall;
    if (ageDays > 240) overall = chance(rnd, 0.85) ? 'C' : chance(rnd, 0.6) ? 'B' : 'A';
    else if (ageDays > 90) overall = chance(rnd, 0.45) ? 'C' : chance(rnd, 0.65) ? 'B' : 'A';
    else overall = chance(rnd, 0.45) ? 'A' : chance(rnd, 0.6) ? 'B' : 'C';

    const type = chance(rnd, 0.92) ? 'OR' : chance(rnd, 0.6) ? 'RE' : 'CR';
    const salesOrder = pad(1001 + i, 10);
    const itemCount = randInt(rnd, 1, 4);
    const chosen = new Set();
    const items = [];
    let total = 0;

    for (let j = 0; j < itemCount; j++) {
      const pool = chance(rnd, 0.68) ? productsByType.FERT : chance(rnd, 0.6) ? productsByType.HAWA : productsByType.ROH;
      let product = pick(rnd, pool);
      let guard = 0;
      while (chosen.has(product.Product) && guard++ < 20) product = pick(rnd, pool);
      chosen.add(product.Product);
      const qty = quantityFor(product);
      const unitPrice = round2(product.StandardPrice * (0.92 + rnd() * 0.16));
      const netAmount = round2(qty * unitPrice);
      const itemStatus = overall === 'C' ? 'C' : overall === 'B' && j === 0 ? 'C' : overall === 'B' ? 'A' : 'A';
      const item = {
        SalesOrder: salesOrder,
        SalesOrderItem: pad((j + 1) * 10, 6),
        SalesOrderItemCategory: 'TAN',
        SalesOrderItemText: product.ProductDescription,
        Material: product.Product,
        ProductDescription: product.ProductDescription,
        RequestedQuantity: qty,
        RequestedQuantityUnit: product.BaseUnit,
        NetPriceAmount: unitPrice,
        NetAmount: netAmount,
        TransactionCurrency: customer.Currency,
        Plant: pick(rnd, plantCodes),
        DeliveryStatus: itemStatus
      };
      items.push(item);
      salesOrderItems.push(item);
      total += netAmount;

      const requestedDate = isoDate(addDays(orderDate, 14));
      if (itemStatus === 'C') {
        scheduleLines.push({
          SalesOrder: salesOrder,
          SalesOrderItem: item.SalesOrderItem,
          ScheduleLine: '0001',
          RequestedDeliveryDate: requestedDate,
          ConfirmedDeliveryDate: isoDate(addDays(orderDate, randInt(rnd, 8, 20))),
          ConfirmedQuantity: qty
        });
      } else if (itemStatus === 'B') {
        const partial = round3(qty * (0.45 + rnd() * 0.4));
        scheduleLines.push({
          SalesOrder: salesOrder,
          SalesOrderItem: item.SalesOrderItem,
          ScheduleLine: '0001',
          RequestedDeliveryDate: requestedDate,
          ConfirmedDeliveryDate: isoDate(addDays(orderDate, randInt(rnd, 10, 28))),
          ConfirmedQuantity: partial
        });
        if (chance(rnd, 0.5)) {
          scheduleLines.push({
            SalesOrder: salesOrder,
            SalesOrderItem: item.SalesOrderItem,
            ScheduleLine: '0002',
            RequestedDeliveryDate: isoDate(addDays(orderDate, 30)),
            ConfirmedDeliveryDate: null,
            ConfirmedQuantity: round3(qty - partial)
          });
        }
      } else {
        scheduleLines.push({
          SalesOrder: salesOrder,
          SalesOrderItem: item.SalesOrderItem,
          ScheduleLine: '0001',
          RequestedDeliveryDate: requestedDate,
          ConfirmedDeliveryDate: null,
          ConfirmedQuantity: 0
        });
      }
    }

    salesOrders.push({
      SalesOrder: salesOrder,
      SalesOrderType: type,
      SalesOrganization: customer.SalesOrganization,
      DistributionChannel: customer.DistributionChannel,
      Division: customer.Division,
      SoldToParty: customer.Customer,
      SoldToPartyName: customer.CustomerName,
      ShipToParty: customer.Customer,
      ShipToPartyName: customer.CustomerName,
      CustomerPurchaseOrderDate: chance(rnd, 0.6) ? isoDate(addDays(orderDate, -randInt(rnd, 1, 20))) : null,
      PurchaseOrderByCustomer: chance(rnd, 0.7) ? `PO-${orderDate.getFullYear()}-${randInt(rnd, 1000, 9999)}` : '',
      TotalNetAmount: round2(total),
      TransactionCurrency: customer.Currency,
      OverallDeliveryStatus: overall,
      OverallBillingStatus: 'A',
      CreationDate: isoDate(orderDate),
      CreatedByUser: pick(rnd, ['DEVELOPER', 'JSMITH', 'AKHAN', 'MLOPEZ', 'TNKOSI']),
      RequestedDeliveryDate: isoDate(addDays(orderDate, 14)),
      IncotermsClassification: pick(rnd, ['DAP', 'FOB', 'CIF', 'EXW', 'CPT']),
      IncotermsLocation1: customer.CityName
    });
  }

  add('API_SALES_ORDER_SRV', 'A_SalesOrder', salesOrders);
  add('API_SALES_ORDER_SRV', 'A_SalesOrderItem', salesOrderItems);
  add('API_SALES_ORDER_SRV', 'A_SalesOrderScheduleLine', scheduleLines);

  const orderByNumber = Object.fromEntries(salesOrders.map((o) => [o.SalesOrder, o]));
  const orderItemsByOrder = {};
  for (const item of salesOrderItems) {
    (orderItemsByOrder[item.SalesOrder] ||= []).push(item);
  }

  /* ---------------------------------------------------------------- */
  /* Billing documents                                                 */
  /* ---------------------------------------------------------------- */

  const billingDocuments = [];
  const billingItems = [];
  let billingNumber = 90000001;

  for (const order of salesOrders) {
    const eligible = order.OverallDeliveryStatus === 'C'
      || (order.OverallDeliveryStatus === 'B' && chance(rnd, 0.7));
    if (!eligible || !chance(rnd, 0.82)) continue;
    const items = orderItemsByOrder[order.SalesOrder] || [];
    if (!items.length) continue;
    const billedItems = order.OverallDeliveryStatus === 'C'
      ? items
      : items.slice(0, Math.max(1, items.length - 1));
    const docDate = addDays(new Date(order.CreationDate), randInt(rnd, 3, 26));
    const postingDate = docDate > today ? today : docDate;
    const billingDocument = String(billingNumber++);
    const docType = order.SalesOrderType === 'RE' ? 'G2' : order.SalesOrderType === 'CR' ? 'L2' : 'F2';
    let total = 0;
    let line = 0;
    for (const item of billedItems) {
      line++;
      const qty = order.OverallDeliveryStatus === 'C'
        ? item.RequestedQuantity
        : round3(item.RequestedQuantity * (0.5 + rnd() * 0.4));
      const net = round2(qty * item.NetPriceAmount);
      total += net;
      billingItems.push({
        BillingDocument: billingDocument,
        BillingDocumentItem: pad(line * 10, 6),
        Material: item.Material,
        ProductDescription: item.ProductDescription,
        BillingQuantity: round3(qty),
        BillingQuantityUnit: item.RequestedQuantityUnit,
        NetAmount: net,
        TransactionCurrency: order.TransactionCurrency,
        ReferenceSDocument: order.SalesOrder,
        ReferenceSDocumentItem: item.SalesOrderItem,
        Plant: item.Plant
      });
    }
    const cancelled = chance(rnd, 0.04);
    billingDocuments.push({
      BillingDocument: billingDocument,
      BillingDocumentType: docType,
      BillingDocumentDate: isoDate(postingDate),
      BillingDocumentIsCancelled: cancelled,
      SoldToParty: order.SoldToParty,
      SoldToPartyName: order.SoldToPartyName,
      CompanyCode: companyCodeForCountry(customerCountry(order.SoldToParty, businessPartners)) || '1010',
      TotalNetAmount: round2(total),
      TransactionCurrency: order.TransactionCurrency,
      ReferenceDocument: order.SalesOrder,
      CreationDate: isoDate(postingDate),
      CreatedByUser: order.CreatedByUser
    });

    const billedValue = billingDocuments
      .filter((d) => d.ReferenceDocument === order.SalesOrder && !d.BillingDocumentIsCancelled)
      .reduce((sum, d) => sum + d.TotalNetAmount, 0);
    order.OverallBillingStatus = billedValue >= order.TotalNetAmount * 0.98 ? 'C' : 'B';
  }

  // Standalone billing documents without a sales order reference.
  for (let i = 0; i < 6; i++) {
    const customer = pick(rnd, customers);
    const docDate = addDays(today, -randInt(rnd, 3, 300));
    const billingDocument = String(billingNumber++);
    const lineCount = randInt(rnd, 1, 2);
    let total = 0;
    for (let j = 0; j < lineCount; j++) {
      const product = pick(rnd, products);
      const qty = quantityFor(product);
      const price = round2(product.StandardPrice * (0.95 + rnd() * 0.2));
      const net = round2(qty * price);
      total += net;
      billingItems.push({
        BillingDocument: billingDocument,
        BillingDocumentItem: pad((j + 1) * 10, 6),
        Material: product.Product,
        ProductDescription: product.ProductDescription,
        BillingQuantity: qty,
        BillingQuantityUnit: product.BaseUnit,
        NetAmount: net,
        TransactionCurrency: customer.Currency,
        ReferenceSDocument: '',
        ReferenceSDocumentItem: '',
        Plant: pick(rnd, plantCodes)
      });
    }
    billingDocuments.push({
      BillingDocument: billingDocument,
      BillingDocumentType: chance(rnd, 0.85) ? 'F2' : 'G2',
      BillingDocumentDate: isoDate(docDate),
      BillingDocumentIsCancelled: chance(rnd, 0.06),
      SoldToParty: customer.Customer,
      SoldToPartyName: customer.CustomerName,
      CompanyCode: companyCodeForCountry(customerCountry(customer.Customer, businessPartners)) || '1010',
      TotalNetAmount: round2(total),
      TransactionCurrency: customer.Currency,
      ReferenceDocument: '',
      CreationDate: isoDate(docDate),
      CreatedByUser: 'BATCH'
    });
  }

  add('API_BILLING_DOCUMENT_SRV', 'A_BillingDocument', billingDocuments);
  add('API_BILLING_DOCUMENT_SRV', 'A_BillingDocumentItem', billingItems);

  /* ---------------------------------------------------------------- */
  /* Purchase orders                                                   */
  /* ---------------------------------------------------------------- */

  const purchaseOrders = [];
  const purchaseOrderItems = [];
  const supplierByKey = Object.fromEntries(suppliers.map((s) => [s.Supplier, s]));

  for (let i = 0; i < 40; i++) {
    const supplier = pick(rnd, suppliers);
    const orderDate = addDays(today, -randInt(rnd, 20, 500));
    const purchaseOrder = pad(4500000001 + i, 10);
    const companyCode = companyCodeForCountry(supplierCountry(supplier.Supplier, businessPartners)) || '1010';
    const purchasingOrg = companyCode === '1710' ? '1710' : companyCode === '2520' ? '2520' : '1010';
    const itemCount = randInt(rnd, 1, 3);
    const chosen = new Set();
    let total = 0;
    for (let j = 0; j < itemCount; j++) {
      const pool = chance(rnd, 0.55) ? productsByType.ROH : chance(rnd, 0.6) ? productsByType.HAWA : productsByType.FERT;
      let product = pick(rnd, pool);
      let guard = 0;
      while (chosen.has(product.Product) && guard++ < 20) product = pick(rnd, pool);
      chosen.add(product.Product);
      const qty = product.ProductType === 'ROH' ? randInt(rnd, 100, 800) : randInt(rnd, 2, 60);
      const unitPrice = round2(product.StandardPrice * (0.72 + rnd() * 0.2));
      const net = round2(qty * unitPrice);
      total += net;
      purchaseOrderItems.push({
        PurchaseOrder: purchaseOrder,
        PurchaseOrderItem: pad((j + 1) * 10, 5),
        PurchaseOrderItemText: product.ProductDescription,
        Material: product.Product,
        OrderQuantity: qty,
        PurchaseOrderQuantityUnit: product.BaseUnit,
        NetPriceAmount: unitPrice,
        NetAmount: net,
        DocumentCurrency: supplier.Currency,
        Plant: pick(rnd, plantCodes),
        DeliveryDate: isoDate(addDays(orderDate, randInt(rnd, 15, 60))),
        ItemCategory: '0'
      });
    }
    purchaseOrders.push({
      PurchaseOrder: purchaseOrder,
      PurchaseOrderType: chance(rnd, 0.9) ? 'NB' : 'ZNB',
      Supplier: supplier.Supplier,
      SupplierName: supplier.SupplierName,
      CompanyCode: companyCode,
      PurchasingOrganization: purchasingOrg,
      PurchasingGroup: pick(rnd, ['001', '002', '003']),
      DocumentCurrency: supplier.Currency,
      TotalNetAmount: round2(total),
      CreationDate: isoDate(orderDate),
      PurchaseOrderDate: isoDate(orderDate),
      IncotermsClassification: pick(rnd, ['DAP', 'FOB', 'CIF', 'EXW']),
      IncotermsLocation1: supplier.CityName
    });
  }

  add('API_PURCHASEORDER_PROCESS_SRV', 'A_PurchaseOrder', purchaseOrders);
  add('API_PURCHASEORDER_PROCESS_SRV', 'A_PurchaseOrderItem', purchaseOrderItems);

  /* ---------------------------------------------------------------- */
  /* Journal entries                                                   */
  /* ---------------------------------------------------------------- */

  const journalEntries = [];
  const journalEntryItems = [];
  const glByCode = Object.fromEntries(GL_ACCOUNTS.map((g) => [g.code, g]));
  let journalNumber = 5100000001;

  function addJournalEntry(header, lines) {
    const accountingDocument = String(journalNumber++);
    const fiscalYear = header.PostingDate.slice(0, 4);
    const key = {
      CompanyCode: header.CompanyCode,
      FiscalYear: fiscalYear,
      AccountingDocument: accountingDocument
    };
    let totalDebit = 0;
    let taxAmount = 0;
    lines.forEach((line, index) => {
      const gl = glByCode[line.GLAccount];
      totalDebit += line.DebitAmount || 0;
      if (line.GLAccount === '175000') taxAmount += line.CreditAmount || line.DebitAmount || 0;
      journalEntryItems.push({
        ...key,
        JournalEntryItem: pad(index + 1, 3),
        GLAccount: line.GLAccount,
        GLAccountName: gl ? gl.name : '',
        DebitAmount: round2(line.DebitAmount || 0),
        CreditAmount: round2(line.CreditAmount || 0),
        DocumentCurrency: header.DocumentCurrency,
        CostCenter: line.CostCenter || '',
        ProfitCenter: line.ProfitCenter || '',
        ItemText: line.ItemText || ''
      });
    });
    journalEntries.push({
      ...key,
      AccountingDocumentType: header.AccountingDocumentType,
      PostingDate: header.PostingDate,
      DocumentDate: header.DocumentDate,
      DocumentCurrency: header.DocumentCurrency,
      TotalDebitAmount: round2(totalDebit),
      TaxAmount: round2(taxAmount),
      ReferenceDocument: header.ReferenceDocument || '',
      CreatedByUser: header.CreatedByUser || 'BATCH'
    });
  }

  for (const doc of billingDocuments) {
    if (doc.BillingDocumentIsCancelled) continue;
    const net = doc.TotalNetAmount;
    const tax = round2(net * 0.19);
    const total = round2(net + tax);
    const revenueAccount = doc.TransactionCurrency === 'EUR' ? '800000' : '810000';
    const isCredit = doc.BillingDocumentType === 'G2';
    const postingDate = doc.BillingDocumentDate;
    const costCenter = pick(rnd, COST_CENTERS);
    const profitCenter = pick(rnd, PROFIT_CENTERS);
    const lines = isCredit
      ? [
          { GLAccount: revenueAccount, DebitAmount: net, CostCenter: costCenter, ProfitCenter: profitCenter, ItemText: `Credit memo ${doc.BillingDocument}` },
          { GLAccount: '175000', DebitAmount: tax, ItemText: 'Tax adjustment' },
          { GLAccount: '121000', CreditAmount: total, ItemText: `Customer ${doc.SoldToParty}` }
        ]
      : [
          { GLAccount: '121000', DebitAmount: total, ItemText: `Customer ${doc.SoldToParty}` },
          { GLAccount: revenueAccount, CreditAmount: net, CostCenter: costCenter, ProfitCenter: profitCenter, ItemText: `Billing document ${doc.BillingDocument}` },
          { GLAccount: '175000', CreditAmount: tax, ItemText: 'Output tax 19%' }
        ];
    addJournalEntry({
      CompanyCode: doc.CompanyCode,
      AccountingDocumentType: 'RV',
      PostingDate: postingDate,
      DocumentDate: postingDate,
      DocumentCurrency: doc.TransactionCurrency,
      ReferenceDocument: doc.BillingDocument,
      CreatedByUser: 'BATCH'
    }, lines);
  }

  for (const po of purchaseOrders) {
    const candidate = addDays(new Date(po.PurchaseOrderDate), randInt(rnd, 2, 18));
    const postingDate = isoDate(candidate > today ? today : candidate);
    addJournalEntry({
      CompanyCode: po.CompanyCode,
      AccountingDocumentType: 'WE',
      PostingDate: postingDate,
      DocumentDate: po.PurchaseOrderDate,
      DocumentCurrency: po.DocumentCurrency,
      ReferenceDocument: po.PurchaseOrder,
      CreatedByUser: 'BATCH'
    }, [
      { GLAccount: '131000', DebitAmount: po.TotalNetAmount, ItemText: `Goods receipt ${po.PurchaseOrder}` },
      { GLAccount: '191100', CreditAmount: po.TotalNetAmount, ItemText: `GR/IR clearing ${po.SupplierName}` }
    ]);
  }

  add('API_JOURNAL_ENTRY_SRV', 'A_JournalEntry', journalEntries);
  add('API_JOURNAL_ENTRY_SRV', 'A_JournalEntryItem', journalEntryItems);

  /* ---------------------------------------------------------------- */

  meta.seededAt = new Date().toISOString();
  meta.generator = 's4hana-sandbox';
  meta.version = 1;
  meta.counts = Object.fromEntries(Object.entries(data).map(([key, rows]) => [key, rows.length]));

  return { meta, entities: data };
}

function customerCountry(bpId, businessPartners) {
  const bp = businessPartners.find((b) => b.BusinessPartner === bpId);
  return bp ? bp.Country : null;
}

function supplierCountry(supplierId, businessPartners) {
  return customerCountry(supplierId, businessPartners);
}

function companyCodeForCountry(country) {
  if (!country) return '1010';
  if (['DE', 'NL', 'FR', 'IN', 'JP', 'BR', 'CN'].includes(country)) return '1010';
  if (['US', 'CA'].includes(country)) return '1710';
  if (country === 'GB') return '2520';
  if (country === 'ZA') return '3000';
  return '1010';
}

module.exports = { buildSeed };
