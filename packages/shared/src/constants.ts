// Shared constants used across web + api.

export const DOC_CATEGORIES = ['core-rules', 'wiwon', 'characters'] as const;
export type DocCategory = (typeof DOC_CATEGORIES)[number];

export const CATALOG_CATEGORIES = ['equipment', 'magic', 'monster'] as const;
export type CatalogCategory = (typeof CATALOG_CATEGORIES)[number];

export const DOC_CATEGORY_LABELS: Record<DocCategory, string> = {
  'core-rules': 'Core Rules',
  wiwon: 'Wiwon',
  characters: 'Characters',
};

export const CATALOG_CATEGORY_LABELS: Record<CatalogCategory, string> = {
  equipment: 'Equipment & Items',
  magic: 'Magic & Feature',
  monster: 'Monster & Organism',
};

// Navigation order matching the prototype's final navDef.
export const NAV_ITEMS = [
  { id: 'home', label: 'Home', href: '/' },
  { id: 'core-rules', label: 'Core Rules', href: '/core-rules' },
  { id: 'wiwon', label: 'Wiwon', href: '/wiwon' },
  { id: 'characters', label: 'Characters', href: '/characters' },
  { id: 'magic', label: 'Magic & Feature', href: '/magic' },
  { id: 'equipment', label: 'Equipment & Items', href: '/equipment' },
  { id: 'monster', label: 'Monster & Organism', href: '/monster' },
  { id: 'pray', label: 'Pray to the Creator', href: '/pray' },
] as const;

export const USER_ROLES = ['user', 'dev'] as const;
export type UserRole = (typeof USER_ROLES)[number];

export const SCOPE_TABS = ['all', 'official', 'homebrew'] as const;
export type CatalogScope = (typeof SCOPE_TABS)[number];

export const CATALOG_PAGE_SIZE = 15;
export const SUMMARY_MAX_LENGTH = 160;
export const DAILY_CR_AMOUNT = 3;
// Daily Cr. claim resets at 03:00 local time (matches prototype).
export const CR_RESET_HOUR = 3;
export const MAX_POPULAR_TAGS = 10;
