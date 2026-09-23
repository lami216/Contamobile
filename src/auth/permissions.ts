export const CAPABILITIES = [
  'pos.view','pos.create','pos.edit','pos.delete',
  'purchases.view','purchases.create','purchases.edit','purchases.delete','records.view',
  'products.view','products.create','products.edit','products.delete',
  'customers.view','customers.create','customers.edit','customers.delete','customers.collect',
  'suppliers.view','suppliers.create','suppliers.edit','suppliers.delete','suppliers.pay',
  'warehouses.view','warehouses.create','warehouses.edit','warehouses.delete','warehouses.inventory.view','warehouses.transfer','warehouses.adjust',
  'banks.view','banks.create','banks.edit','banks.delete','banks.movements.view','banks.transfer','banks.deposit_withdraw','banks.balance_correct',
  'expenses.view','expenses.create','expenses.edit','expenses.delete','reports.view','settings.view','settings.branding.manage','settings.backup.manage','settings.legacy.import','settings.users.manage',
] as const;
export type Capability = typeof CAPABILITIES[number];

export const permissionPresets: Record<'manager'|'accountant'|'sales', Capability[]> = {
  manager: [...CAPABILITIES],
  accountant: [
    'pos.view','purchases.view','purchases.create','purchases.edit','records.view','products.view',
    'customers.view','customers.collect','suppliers.view','suppliers.pay','warehouses.view','warehouses.inventory.view',
    'banks.view','banks.movements.view','banks.transfer','banks.deposit_withdraw','expenses.view','expenses.create','expenses.edit','reports.view','settings.view',
  ],
  sales: ['pos.view','pos.create','customers.create'],
};

const prerequisites: Partial<Record<Capability, readonly Capability[]>> = {
  'pos.edit':['pos.view'],'pos.delete':['pos.view'],
  'purchases.edit':['purchases.view'],'purchases.delete':['purchases.view'],
  'products.edit':['products.view'],'products.delete':['products.view'],
  'customers.edit':['customers.view'],'customers.delete':['customers.view'],
  'suppliers.edit':['suppliers.view'],'suppliers.delete':['suppliers.view'],
  'warehouses.edit':['warehouses.view'],'warehouses.delete':['warehouses.view'],
  'banks.edit':['banks.view'],'banks.delete':['banks.view'],'banks.balance_correct':['banks.view'],
  'expenses.edit':['expenses.view'],'expenses.delete':['expenses.view'],
};

export function expandPermissionDependencies(permissions: readonly Capability[]) {
  const expanded=new Set<Capability>(permissions);let changed=true;
  while(changed){changed=false;for(const permission of [...expanded])for(const prerequisite of prerequisites[permission]??[])if(!expanded.has(prerequisite)){expanded.add(prerequisite);changed=true}}
  return [...expanded];
}

export function removePermissionAndDependents(permissions: readonly Capability[], permission: Capability) {
  const remaining=new Set<Capability>(permissions),queue=[permission];
  while(queue.length){const removed=queue.shift()!;remaining.delete(removed);for(const candidate of [...remaining])if((prerequisites[candidate]??[]).includes(removed))queue.push(candidate)}
  return [...remaining];
}

export function sanitizePermissions(value: unknown): Capability[] {
  if (!Array.isArray(value)) return [];
  const valid=[...new Set(value.filter((item): item is Capability => typeof item === 'string' && CAPABILITIES.includes(item as Capability)))];
  return expandPermissionDependencies(valid);
}
export function normalizeUsername(value: string) { return value.trim().toLocaleLowerCase('en-US'); }
