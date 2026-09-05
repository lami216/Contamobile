export const CAPABILITIES = [
  'pos.view','pos.create','pos.edit','pos.delete',
  'purchases.view','purchases.create','purchases.edit','purchases.delete','records.view',
  'products.view','products.create','products.edit','products.delete',
  'customers.view','customers.create','customers.edit','customers.collect',
  'suppliers.view','suppliers.create','suppliers.edit','suppliers.pay',
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

export function sanitizePermissions(value: unknown): Capability[] {
  if (!Array.isArray(value)) return [];
  return [...new Set(value.filter((item): item is Capability => typeof item === 'string' && CAPABILITIES.includes(item as Capability)))];
}
export function normalizeUsername(value: string) { return value.trim().toLocaleLowerCase('en-US'); }
