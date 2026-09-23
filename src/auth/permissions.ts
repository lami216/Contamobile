export const CAPABILITIES = [
  'pos.view','pos.create','pos.edit','pos.delete',
  'purchases.view','purchases.create','purchases.edit','purchases.delete','records.view',
  'products.view','products.create','products.edit','products.delete',
  'customers.view','customers.create','customers.edit','customers.delete','customers.collect','customers.collect.edit','customers.collect.delete',
  'suppliers.view','suppliers.create','suppliers.edit','suppliers.delete','suppliers.pay','suppliers.pay.edit','suppliers.pay.delete',
  'warehouses.view','warehouses.create','warehouses.edit','warehouses.delete','warehouses.inventory.view',
  'warehouses.transfer','warehouses.transfer.edit','warehouses.transfer.delete',
  'warehouses.adjust','warehouses.adjust.edit','warehouses.adjust.delete',
  'banks.view','banks.create','banks.edit','banks.delete','banks.movements.view',
  'banks.transfer','banks.transfer.edit','banks.transfer.delete',
  'banks.deposit_withdraw','banks.deposit_withdraw.edit','banks.deposit_withdraw.delete',
  'banks.balance_correct','banks.balance_correct.edit','banks.balance_correct.delete',
  'expenses.view','expenses.create','expenses.edit','expenses.delete','reports.view',
  'settings.view','settings.branding.manage','settings.backup.manage','settings.legacy.import','settings.users.manage',
] as const;
export type Capability = typeof CAPABILITIES[number];

const prerequisites:Partial<Record<Capability,readonly Capability[]>>={
  'pos.edit':['pos.view'],'pos.delete':['pos.view'],
  'purchases.edit':['purchases.view'],'purchases.delete':['purchases.view'],
  'products.edit':['products.view'],'products.delete':['products.view'],
  'customers.edit':['customers.view'],'customers.delete':['customers.view'],
  'customers.collect.edit':['customers.view'],'customers.collect.delete':['customers.view'],
  'suppliers.edit':['suppliers.view'],'suppliers.delete':['suppliers.view'],
  'suppliers.pay.edit':['suppliers.view'],'suppliers.pay.delete':['suppliers.view'],
  'warehouses.edit':['warehouses.view'],'warehouses.delete':['warehouses.view'],
  'warehouses.transfer.edit':['warehouses.transfer'],'warehouses.transfer.delete':['warehouses.transfer'],
  'warehouses.adjust.edit':['warehouses.adjust'],'warehouses.adjust.delete':['warehouses.adjust'],
  'banks.edit':['banks.view'],'banks.delete':['banks.view'],
  'banks.transfer.edit':['banks.view'],'banks.transfer.delete':['banks.view'],
  'banks.deposit_withdraw.edit':['banks.view'],'banks.deposit_withdraw.delete':['banks.view'],
  'banks.balance_correct':['banks.view'],'banks.balance_correct.edit':['banks.view'],'banks.balance_correct.delete':['banks.view'],
  'expenses.edit':['expenses.view'],'expenses.delete':['expenses.view'],
};

export function expandPermissionDependencies(permissions:readonly Capability[]):Capability[]{
  const expanded=new Set<Capability>(permissions);
  let changed=true;
  while(changed){changed=false;for(const permission of [...expanded])for(const dependency of prerequisites[permission]??[])if(!expanded.has(dependency)){expanded.add(dependency);changed=true}}
  return CAPABILITIES.filter(capability=>expanded.has(capability));
}
export function removePermissionAndDependents(permissions:readonly Capability[],permission:Capability):Capability[]{
  const remaining=new Set<Capability>(permissions),queue=[permission];
  while(queue.length){const removed=queue.shift()!;remaining.delete(removed);for(const candidate of [...remaining])if((prerequisites[candidate]??[]).includes(removed))queue.push(candidate)}
  return expandPermissionDependencies([...remaining]);
}

export const permissionPresets: Record<'manager'|'accountant'|'sales', Capability[]> = {
  manager: [...CAPABILITIES],
  accountant: expandPermissionDependencies([
    'purchases.view','purchases.create','purchases.edit','records.view','products.view',
    'customers.view','customers.collect','customers.collect.edit',
    'suppliers.view','suppliers.pay','suppliers.pay.edit',
    'warehouses.view','warehouses.inventory.view','warehouses.transfer','warehouses.transfer.edit','warehouses.adjust','warehouses.adjust.edit',
    'banks.view','banks.movements.view','banks.transfer','banks.transfer.edit','banks.deposit_withdraw','banks.deposit_withdraw.edit',
    'expenses.view','expenses.create','expenses.edit','reports.view','settings.view',
  ]),
  sales: ['pos.view','pos.create','customers.create'],
};

export function sanitizePermissions(value: unknown): Capability[] {
  if (!Array.isArray(value)) return [];
  return expandPermissionDependencies([...new Set(value.filter((item): item is Capability => typeof item === 'string' && CAPABILITIES.includes(item as Capability)))]);
}
export function normalizeUsername(value: string) { return value.trim().toLocaleLowerCase('en-US'); }
