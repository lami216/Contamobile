import type { Locale } from '@/domain/types';

let activeLocale:Locale='ar';
export function setActiveLocale(locale:Locale){activeLocale=locale}
export function getActiveLocale(){return activeLocale}
