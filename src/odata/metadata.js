'use strict';

const { escapeXml } = require('../util');

const EDMX_NS = 'http://schemas.microsoft.com/ado/2007/06/edmx';
const EDM_NS = 'http://schemas.microsoft.com/ado/2008/09/edm';
const M_NS = 'http://schemas.microsoft.com/ado/2007/08/dataservices/metadata';
const SAP_NS = 'http://www.sap.com/Protocols/SAPData';

function typeAttributes(field) {
  const parts = [`Type="${field.type}"`];
  parts.push(`Nullable="${field.key ? 'false' : 'true'}"`);
  if (field.maxLength) parts.push(`MaxLength="${field.maxLength}"`);
  if (field.precision) parts.push(`Precision="${field.precision}"`);
  if (field.scale !== undefined) parts.push(`Scale="${field.scale}"`);
  parts.push(`sap:label="${escapeXml(field.label)}"`);
  return parts.join(' ');
}

function generateMetadata(service) {
  const namespace = service.id;
  const entities = Object.values(service.entities);
  const lines = [];
  lines.push('<?xml version="1.0" encoding="utf-8"?>');
  lines.push(`<edmx:Edmx Version="1.0" xmlns:edmx="${EDMX_NS}" xmlns:m="${M_NS}" xmlns:sap="${SAP_NS}">`);
  lines.push('  <edmx:DataServices m:DataServiceVersion="2.0">');
  lines.push(`    <Schema Namespace="${namespace}" xmlns="${EDM_NS}">`);

  for (const entity of entities) {
    lines.push(`      <EntityType Name="${entity.name}Type" sap:content-version="1">`);
    lines.push('        <Key>');
    for (const keyField of entity.key) lines.push(`          <PropertyRef Name="${keyField}"/>`);
    lines.push('        </Key>');
    for (const field of entity.fields) {
      lines.push(`        <Property Name="${field.name}" ${typeAttributes(field)}/>`);
    }
    for (const nav of entity.nav) {
      if (nav.targetService !== service.id) continue;
      lines.push(`        <NavigationProperty Name="${nav.name}" Relationship="${namespace}.${entity.name}_${nav.name}" FromRole="${entity.name}" ToRole="${nav.target}"/>`);
    }
    lines.push('      </EntityType>');
  }

  for (const entity of entities) {
    for (const nav of entity.nav) {
      if (nav.targetService !== service.id) continue;
      const associationName = `${entity.name}_${nav.name}`;
      const sourceMultiplicity = nav.many ? '1' : '0..1';
      const targetMultiplicity = nav.many ? '*' : '1';
      lines.push(`      <Association Name="${associationName}">`);
      lines.push(`        <End Type="${namespace}.${entity.name}Type" Role="${entity.name}" Multiplicity="${sourceMultiplicity}"/>`);
      lines.push(`        <End Type="${namespace}.${nav.target}Type" Role="${nav.target}" Multiplicity="${targetMultiplicity}"/>`);
      const principalRole = nav.many ? entity.name : nav.target;
      const dependentRole = nav.many ? nav.target : entity.name;
      const mappings = Object.entries(nav.on);
      if (mappings.length) {
        lines.push('        <ReferentialConstraint>');
        lines.push(`          <Principal Role="${principalRole}">`);
        for (const [, targetField] of mappings) lines.push(`            <PropertyRef Name="${targetField}"/>`);
        lines.push('          </Principal>');
        lines.push(`          <Dependent Role="${dependentRole}">`);
        for (const [localField] of mappings) lines.push(`            <PropertyRef Name="${localField}"/>`);
        lines.push('          </Dependent>');
        lines.push('        </ReferentialConstraint>');
      }
      lines.push('      </Association>');
    }
  }

  lines.push(`      <EntityContainer Name="${namespace}_Entities" m:IsDefaultEntityContainer="true">`);
  for (const entity of entities) {
    lines.push(`        <EntitySet Name="${entity.name}" EntityType="${namespace}.${entity.name}Type" sap:label="${escapeXml(entity.label)}"/>`);
  }
  for (const entity of entities) {
    for (const nav of entity.nav) {
      if (nav.targetService !== service.id) continue;
      lines.push(`        <AssociationSet Name="${entity.name}_${nav.name}" Association="${namespace}.${entity.name}_${nav.name}">`);
      lines.push(`          <End Role="${entity.name}" EntitySet="${entity.name}"/>`);
      lines.push(`          <End Role="${nav.target}" EntitySet="${nav.target}"/>`);
      lines.push('        </AssociationSet>');
    }
  }
  lines.push('      </EntityContainer>');
  lines.push('    </Schema>');
  lines.push('  </edmx:DataServices>');
  lines.push('</edmx:Edmx>');
  return lines.join('\n');
}

module.exports = { generateMetadata };
