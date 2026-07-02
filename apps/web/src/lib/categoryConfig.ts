import type { DocCategory } from '@wiwonanant/shared';

// Default hero banner content per doc-category page (dev can override, stored server-side).
export interface CategoryMeta {
  name: string;
  tagline: string;
  updateDate: string;
}

export const CATEGORY_META: Record<DocCategory, CategoryMeta> = {
  'core-rules': {
    name: 'Core Rules',
    tagline:
      'The foundational mechanic that resolves actions and determines outcomes within the game. Everything you need to get started playing WiwonAnant.',
    updateDate: '15/06/2569',
  },
  wiwon: {
    name: 'Wiwon',
    tagline:
      'This section serves as your definitive guide to the cosmos of Wiwon-Anant — a universe forged in the crucible of ancient creation, now perpetually reshaped by the volatile anomalies of the Wiwon.',
    updateDate: '15/06/2569',
  },
  characters: {
    name: 'Characters',
    tagline: 'ฐานข้อมูลตัวละครสำคัญ เผ่าพันธุ์ และสายอาชีพทั้งหมดในจักรวาล WiwonAnant.',
    updateDate: '13/06/2569',
  },
};
