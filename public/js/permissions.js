/**
 * UI write scope. The sandbox API is more permissive, but the demo experience
 * intentionally keeps procurement, billing and finance read-only.
 */

const CREATE_ENTITIES = new Set(['A_BusinessPartner', 'A_SalesOrder']);
const EDIT_ENTITIES = new Set(['A_BusinessPartner']);
const DELETE_ENTITIES = new Set(['A_BusinessPartner']);

function canWrite(me) {
  return Boolean(me?.capabilities?.write);
}

export function canCreate(entity, me) {
  if (!entity?.ui?.create) return false;
  if (!CREATE_ENTITIES.has(entity.name)) return false;
  return canWrite(me);
}

export function canEdit(entity, me) {
  if (!entity?.ui?.update) return false;
  if (!EDIT_ENTITIES.has(entity.name)) return false;
  return canWrite(me);
}

export function canDelete(entity, me) {
  if (!entity?.ui?.delete) return false;
  if (!DELETE_ENTITIES.has(entity.name)) return false;
  return canWrite(me);
}
