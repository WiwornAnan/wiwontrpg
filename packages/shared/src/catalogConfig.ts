// Ported from the prototype's catalogCfg() (WiwonAnant.dc.html ~4238-4415).
// Single source of truth for per-category columns, filters, add-form fields, and
// detail-panel keys. Drives both API validation and frontend rendering.
import type { CatalogCategory } from './constants.js';

export type ColumnSort = 'str' | 'num' | 'rarity';

export interface ColumnDef {
  key: string;
  label: string;
  grow?: string;
  sort?: ColumnSort;
  numKey?: string;
}

export type FilterKind = 'select' | 'range' | 'checks';

export interface FilterField {
  key: string;
  label: string;
  kind?: FilterKind; // default 'select'
  any?: string; // "Any Tag" placeholder for select filters
  options?: string[];
  unit?: string; // for range filters
  numKey?: string; // numeric field backing a range filter
}

export type AddFieldKind = 'text' | 'select' | 'radio' | 'checks' | 'textarea';

export interface AddField {
  key: string;
  label: string;
  kind: AddFieldKind;
  options?: string[];
  placeholder?: string;
}

/** A detail-panel row: [display label, data key]. */
export type DetailKey = [string, string];

export interface StatDef {
  label: string;
  // Value is computed live from data in production, but we keep the label ordering here.
  key?: string;
}

export interface CatalogConfig {
  category: CatalogCategory;
  title: string;
  desc: string;
  searchPlaceholder: string;
  listTitle: string;
  tagBg?: string;
  tagColor?: string;
  hasFeature?: boolean;
  statLabels: string[];
  popularTags: string[];
  columns: ColumnDef[];
  detailKeys: DetailKey[];
  subtitleKey: string;
  filterFields: FilterField[];
  addFields: AddField[];
  // Magic-only Feature sub-catalog:
  feature?: {
    title: string;
    columns: ColumnDef[];
    detailKeys: DetailKey[];
    popularTags: string[];
    filterFields: FilterField[];
    addFields: AddField[];
  };
}

const EQUIPMENT: CatalogConfig = {
  category: 'equipment',
  title: 'Equipment & Items',
  desc: 'A comprehensive catalog of weapons, armor, instruments, tools, materials, and unique items found throughout WiwonAnant.',
  searchPlaceholder: 'Search equipment, item, material, or keyword…',
  listTitle: 'List Items',
  statLabels: ['Total Items', 'Categories Tags', 'Other Tags', 'Last Updated'],
  popularTags: ['Armor', 'Weapons', 'Potion', 'Tool', 'Adventuring Gear', 'Vehicle', 'Trinket', 'Artifact', 'Magic'],
  columns: [
    { key: 'name', label: 'Name', grow: '1.6', sort: 'str' },
    { key: 'weight', label: 'Weight', grow: '.8', sort: 'num', numKey: 'weightNum' },
    { key: 'rarity', label: 'Rarity', grow: '.8', sort: 'rarity' },
    { key: 'tag', label: 'Tag', grow: '1', sort: 'str' },
    { key: 'cost', label: 'Cost', grow: '.9', sort: 'num', numKey: 'costNum' },
    { key: 'source', label: 'Sources', grow: '1.3', sort: 'str' },
  ],
  detailKeys: [
    ['Cost', 'cost'],
    ['Type', 'equipType'],
    ['Weight', 'weight'],
    ['Wielding', 'wielding'],
    ['Material', 'material'],
    ['Availability', 'availability'],
    ['Sources', 'source'],
  ],
  subtitleKey: 'type',
  filterFields: [
    { key: 'tag', label: 'Tags', any: 'Any Tag', options: ['Weapon', 'Armor', 'Potion', 'Tool', 'Adventuring Gear', 'Artifact', 'Vehicle', 'Trinket'] },
    { key: 'equipType', label: 'Usage Type', any: 'Any Type', options: ['อาวุธ (Weapon)', 'โล่ (Shield)', 'เกราะ (Armor)'] },
    { key: 'availability', label: 'Availability', any: 'Any Availability', options: ['Kiosk', 'Smithy', 'Vault', 'Quest', 'Common'] },
    { key: 'cost', label: 'Cost', kind: 'range', unit: 'Cr.', numKey: 'costNum' },
    { key: 'material', label: 'Materials', any: 'Any Material', options: ['Wood', 'Metal', 'Cloth', 'Leather', 'Crystal', 'Bone'] },
    { key: 'rarity', label: 'Rarity', any: 'Any Tag', options: ['Poor', 'Common', 'Uncommon', 'Rare', 'Legendary'] },
    { key: 'professionalLevel', label: 'Professional Level', any: 'Any Professional Level', options: ['Amateur', 'Journeyman', 'Expert', 'Master'] },
    { key: 'damage', label: 'Damage', any: 'Any Damage', options: ['Piercing', 'Slashing', 'Bludgeoning', 'None'] },
    { key: 'weight', label: 'Weight', kind: 'range', unit: 'Kg', numKey: 'weightNum' },
    { key: 'requirements', label: 'Requirements', any: 'Any Requirement', options: ['None', 'Strength', 'Dexterity', 'Proficiency'] },
    { key: 'wielding', label: 'Wielding', any: 'Any Wielding', options: ['One-Handed', 'Two-Handed', 'Worn', 'None'] },
    { key: 'source', label: 'Sources', any: 'Any Tag', options: ["Player's Handbook", 'Arcane Compendium', 'GM Guide', 'Homebrew'] },
  ],
  addFields: [
    { key: 'name', label: 'ชื่อ', kind: 'text', placeholder: 'ตั้งชื่อ…' },
    { key: 'tag', label: 'Tags', kind: 'select', options: ['Weapon', 'Armor', 'Potion', 'Tool', 'Adventuring Gear', 'Artifact', 'Vehicle', 'Trinket'] },
    { key: 'equipType', label: 'Usage Type', kind: 'select', options: ['อาวุธ (Weapon)', 'โล่ (Shield)', 'เกราะ (Armor)'] },
    { key: 'availability', label: 'Availability', kind: 'select', options: ['Kiosk', 'Smithy', 'Vault', 'Quest', 'Common'] },
    { key: 'cost', label: 'Cost', kind: 'text', placeholder: 'เช่น 2 Cr.' },
    { key: 'material', label: 'Materials', kind: 'select', options: ['Wood', 'Metal', 'Cloth', 'Leather', 'Crystal', 'Bone'] },
    { key: 'rarity', label: 'Rarity', kind: 'select', options: ['Poor', 'Common', 'Uncommon', 'Rare', 'Legendary'] },
    { key: 'professionalLevel', label: 'Professional Level', kind: 'select', options: ['Amateur', 'Journeyman', 'Expert', 'Master'] },
    { key: 'damage', label: 'Damage', kind: 'select', options: ['Piercing', 'Slashing', 'Bludgeoning', 'None'] },
    { key: 'weight', label: 'Weight', kind: 'text', placeholder: 'เช่น 2 Kg' },
    { key: 'requirements', label: 'Requirements', kind: 'select', options: ['None', 'Strength', 'Dexterity', 'Proficiency'] },
    { key: 'wielding', label: 'Wielding', kind: 'select', options: ['One-Handed', 'Two-Handed', 'Worn', 'None'] },
  ],
};

const MAGIC: CatalogConfig = {
  category: 'magic',
  title: 'Magic & Feature',
  desc: 'A searchable grimoire of every spell, incantation, and special feature powered by the volatile arcane forces of the Wiwon.',
  searchPlaceholder: 'Search spell, school, element, or keyword…',
  listTitle: 'Spell List',
  tagBg: '#ede7f6',
  tagColor: '#5b3fa0',
  hasFeature: true,
  statLabels: ['Total Spells', 'Schools', 'Casting Level', 'Rarity', 'Last Updated'],
  popularTags: ['Pink', 'Silver', 'Blue', 'Purple', 'Yellow', 'Red', 'White', 'Black', 'Cyan', 'Manipulation', 'Restoration', 'Distortion', 'Perception', 'Suppression', 'Manifestation', 'Transformation'],
  columns: [
    { key: 'name', label: 'Name', grow: '1.6', sort: 'str' },
    { key: 'school', label: 'School', grow: '1', sort: 'str' },
    { key: 'rarity', label: 'Rarity', grow: '.8', sort: 'rarity' },
    { key: 'tag', label: 'Color of Ehen', grow: '1', sort: 'str' },
    { key: 'cost', label: 'Magic Slot', grow: '.9', sort: 'num', numKey: 'costNum' },
    { key: 'source', label: 'Sources', grow: '1.3', sort: 'str' },
  ],
  detailKeys: [
    ['Magic Slot', 'cost'],
    ['School', 'school'],
    ['Color of Ehen', 'tag'],
    ['Range', 'range'],
    ['Duration', 'duration'],
    ['Casting Lv.', 'castLevel'],
    ['Quality of Life', 'ql'],
    ['Knowledge Points', 'knowledge'],
    ['Curiosity Point', 'curiosity'],
    ['Sources', 'source'],
  ],
  subtitleKey: 'school',
  filterFields: [
    { key: 'tag', label: 'Color of Ehen', any: 'Any Color', options: ['Pink', 'Silver', 'Blue', 'Purple', 'Yellow', 'Red', 'White', 'Black', 'Cyan'] },
    { key: 'school', label: 'School', any: 'Any School', options: ['Manipulation', 'Restoration', 'Distortion', 'Perception', 'Suppression', 'Manifestation', 'Transformation'] },
    { key: 'castLevel', label: 'Casting Level', any: 'Any Level', options: ['Root Magic', 'Basic Magic', 'Advanced Magic', 'High Magic', 'Ritual Magic', 'Grand Magic'] },
    { key: 'rarity', label: 'Rarity', any: 'Any Rarity', options: ['Poor', 'Common', 'Uncommon', 'Rare', 'Legendary'] },
    { key: 'cost', label: 'Magic Slot', any: 'Any Slot', options: ['1 Slot', '2 Slot', '3 Slot', '4 Slot', '5 Slot'] },
    { key: 'ql', label: 'Quality of Life', any: 'Any QL', options: ['0 QL', '1 QL', '2 QL', '3 QL', '4 QL', '5 QL', '6 QL'] },
    { key: 'knowledge', label: 'Knowledge Points', any: 'Any KP', options: ['1 KP', '2 KP', '3 KP', '4 KP', '5 KP'] },
    { key: 'range', label: 'Range', any: 'Any Range', options: ['Self', 'Touch', '9 m', '18 m', '30 m'] },
    { key: 'duration', label: 'Duration', any: 'Any Duration', options: ['Instant', '1 min', '10 min', '1 hr', 'Concentration'] },
    { key: 'components', label: 'Components', any: 'Any Component', options: ['Verbal', 'Somatic', 'Material', 'Ehen Device', 'Willpower', 'Condition'] },
    { key: 'source', label: 'Sources', any: 'Any Source', options: ['Arcane Compendium', "Player's Handbook", 'GM Guide', 'Homebrew'] },
  ],
  addFields: [
    { key: 'name', label: 'ชื่อ', kind: 'text', placeholder: 'ตั้งชื่อ…' },
    { key: 'tag', label: 'Color of Ehen', kind: 'select', options: ['Pink', 'Silver', 'Blue', 'Purple', 'Yellow', 'Red', 'White', 'Black', 'Cyan'] },
    { key: 'school', label: 'School', kind: 'select', options: ['Manipulation', 'Restoration', 'Distortion', 'Perception', 'Suppression', 'Manifestation', 'Transformation'] },
    { key: 'castLevel', label: 'Casting Level', kind: 'select', options: ['Root Magic', 'Basic Magic', 'Advanced Magic', 'High Magic', 'Ritual Magic', 'Grand Magic'] },
    { key: 'rarity', label: 'Rarity', kind: 'select', options: ['Poor', 'Common', 'Uncommon', 'Rare', 'Legendary'] },
    { key: 'cost', label: 'Magic Slot', kind: 'select', options: ['1 Slot', '2 Slot', '3 Slot', '4 Slot', '5 Slot'] },
    { key: 'ql', label: 'Quality of Life', kind: 'select', options: ['0 QL', '1 QL', '2 QL', '3 QL', '4 QL', '5 QL', '6 QL'] },
    { key: 'knowledge', label: 'Knowledge Points', kind: 'select', options: ['1 KP', '2 KP', '3 KP', '4 KP', '5 KP'] },
    { key: 'range', label: 'Range', kind: 'select', options: ['Self', 'Touch', '9 m', '18 m', '30 m'] },
    { key: 'duration', label: 'Duration', kind: 'select', options: ['Instant', '1 min', '10 min', '1 hr', 'Concentration'] },
    { key: 'components', label: 'Components', kind: 'checks', options: ['Verbal', 'Somatic', 'Material', 'Ehen Device', 'Willpower', 'Condition'] },
  ],
  feature: {
    title: 'Feature List',
    columns: [
      { key: 'name', label: 'Name', grow: '1.6', sort: 'str' },
      { key: 'class', label: 'Class', grow: '1', sort: 'str' },
      { key: 'rarity', label: 'Capacity', grow: '1', sort: 'rarity' },
      { key: 'tag', label: 'Type', grow: '1', sort: 'str' },
      { key: 'cost', label: 'Cost (WP)', grow: '1', sort: 'num', numKey: 'costNum' },
      { key: 'source', label: 'Sources', grow: '1.3', sort: 'str' },
    ],
    detailKeys: [
      ['Cost (WP)', 'cost'],
      ['Class', 'class'],
      ['Mode', 'mode'],
      ['Type', 'tag'],
      ['Capacity', 'rarity'],
      ['Cooldown', 'duration'],
      ['Quality of Life', 'ql'],
      ['Knowledge Points', 'knowledge'],
      ['Curiosity Point', 'curiosity'],
      ['Sources', 'source'],
    ],
    popularTags: ['Active', 'Passive', 'Reaction', 'Stance', 'Life lesson', 'Local Knowledge', 'Species', 'Social'],
    filterFields: [
      { key: 'mode', label: 'รูปแบบ Feature', kind: 'checks', options: ['Active', 'Passive'] },
      { key: 'tag', label: 'Tags', any: 'Any Tag', options: ['Active', 'Passive', 'Reaction', 'Stance', 'Life lesson', 'Local Knowledge', 'Species', 'Social', 'Weapon Arts'] },
      { key: 'class', label: 'Class', any: 'Any Class', options: ['Vanguard', 'Defender', 'Sharpshooter', 'Caster', 'Support', 'Striker', 'Specialist'] },
      { key: 'rarity', label: 'Capacity', any: 'Any Capacity', options: ['Common', 'Uncommon', 'Rare', 'Legendary'] },
      { key: 'cost', label: 'Willpower (WP)', any: 'Any WP', options: ['0 WP', '1 WP', '2 WP', '3 WP', '4 WP', '5 WP'] },
      { key: 'ql', label: 'Quality of Life', any: 'Any QL', options: ['0 QL', '1 QL', '2 QL', '3 QL', '4 QL', '5 QL', '6 QL'] },
      { key: 'knowledge', label: 'Knowledge Points', any: 'Any KP', options: ['1 KP', '2 KP', '3 KP', '4 KP', '5 KP'] },
      { key: 'curiosity', label: 'Curiosity Point', any: 'Any CP', options: ['1 CP', '2 CP', '3 CP', '4 CP', '5 CP'] },
      { key: 'duration', label: 'Cooldown', any: 'Any Cooldown', options: ['None', '1 turn', '1 scene', 'Once/day'] },
      { key: 'requirements', label: 'Requirements', any: 'Any Requirement', options: ['None', 'Proficiency', 'Level 5+'] },
      { key: 'source', label: 'Sources', any: 'Any Source', options: ["Player's Handbook", 'GM Guide', 'Homebrew'] },
    ],
    addFields: [
      { key: 'name', label: 'ชื่อ', kind: 'text', placeholder: 'ตั้งชื่อ…' },
      { key: 'mode', label: 'รูปแบบ Feature', kind: 'radio', options: ['Active', 'Passive'] },
      { key: 'tag', label: 'Tags', kind: 'select', options: ['Active', 'Passive', 'Reaction', 'Stance', 'Life lesson', 'Local Knowledge', 'Species', 'Social', 'Weapon Arts'] },
      { key: 'class', label: 'Class', kind: 'select', options: ['Vanguard', 'Defender', 'Sharpshooter', 'Caster', 'Support', 'Striker', 'Specialist'] },
      { key: 'rarity', label: 'Capacity', kind: 'select', options: ['Common', 'Uncommon', 'Rare', 'Legendary'] },
      { key: 'cost', label: 'Willpower (WP)', kind: 'select', options: ['0 WP', '1 WP', '2 WP', '3 WP', '4 WP', '5 WP'] },
      { key: 'ql', label: 'Quality of Life', kind: 'select', options: ['0 QL', '1 QL', '2 QL', '3 QL', '4 QL', '5 QL', '6 QL'] },
      { key: 'knowledge', label: 'Knowledge Points', kind: 'select', options: ['1 KP', '2 KP', '3 KP', '4 KP', '5 KP'] },
      { key: 'curiosity', label: 'Curiosity Point', kind: 'select', options: ['1 CP', '2 CP', '3 CP', '4 CP', '5 CP'] },
      { key: 'duration', label: 'Cooldown', kind: 'select', options: ['None', '1 turn', '1 scene', 'Once/day'] },
      { key: 'requirements', label: 'Requirements', kind: 'select', options: ['None', 'Proficiency', 'Level 5+'] },
    ],
  },
};

const MONSTER: CatalogConfig = {
  category: 'monster',
  title: 'Monster & Organism',
  desc: 'A bestiary of creatures, aberrations, and organisms that inhabit the many dimensions of the Wiwon — built for GMs designing encounters.',
  searchPlaceholder: 'Search monster, type, habitat, or keyword…',
  listTitle: 'Bestiary List',
  tagBg: '#fbe7d6',
  tagColor: '#b4602a',
  statLabels: ['Total Entries', 'Types', 'Danger Tiers', 'Last Updated'],
  popularTags: ['Beast', 'Aberration', 'Undead', 'Elemental', 'Dragon', 'Humanoid', 'Forest', 'Void', 'Aquatic', 'Celestial', 'Cavern', 'Boss'],
  columns: [
    { key: 'name', label: 'Name', grow: '1.6', sort: 'str' },
    { key: 'type', label: 'Type', grow: '1', sort: 'str' },
    { key: 'dr', label: 'DR', grow: '.8', sort: 'num', numKey: 'drNum' },
    { key: 'tag', label: 'Tag', grow: '1', sort: 'str' },
    { key: 'habitat', label: 'Habitat', grow: '1.1', sort: 'str' },
    { key: 'source', label: 'Sources', grow: '1.3', sort: 'str' },
  ],
  detailKeys: [
    ['Danger Rating (DR)', 'dr'],
    ['Type', 'type'],
    ['Size', 'size'],
    ['Weight', 'weight'],
    ['Habitat', 'habitat'],
    ['Behavior', 'behavior'],
    ['Friendliness', 'friendliness'],
    ['Sources', 'source'],
  ],
  subtitleKey: 'type',
  filterFields: [
    { key: 'tag', label: 'Tags', any: 'Any Tag', options: ['Beast', 'Aberration', 'Undead', 'Elemental', 'Dragon'] },
    { key: 'habitat', label: 'Habitat', any: 'Any Habitat', options: ['Forest', 'Cavern', 'Celestial', 'Void', 'Urban', 'Aquatic'] },
    { key: 'dr', label: 'Danger Rating', any: 'Any DR', options: ['DR 1', 'DR 2', 'DR 3', 'DR 4', 'DR 5', 'DR 6', 'DR 7', 'DR 8', 'DR 9', 'DR 10'] },
    { key: 'type', label: 'Type', any: 'Any Type', options: ['Beast', 'Aberration', 'Undead', 'Elemental', 'Dragon', 'Humanoid'] },
    { key: 'behavior', label: 'Behavior', any: 'Any Behavior', options: ['Passive', 'Territorial', 'Aggressive', 'Cunning'] },
    { key: 'friendliness', label: 'Friendliness', any: 'Any Friendliness', options: ['Hostile', 'Wary', 'Neutral', 'Friendly'] },
    { key: 'size', label: 'Size', any: 'Any Size', options: ['Tiny', 'Small', 'Medium', 'Large', 'Huge', 'Gargantuan'] },
    { key: 'speed', label: 'Speed', any: 'Any Speed', options: ['Slow', 'Normal', 'Fast', 'Very Fast'] },
    { key: 'resistances', label: 'Resistances', any: 'Any Resistance', options: ['Fire', 'Cold', 'Physical', 'Arcane', 'None'] },
    { key: 'source', label: 'Sources', any: 'Any Source', options: ["Player's Handbook", 'GM Guide', 'Arcane Compendium', 'Homebrew'] },
  ],
  addFields: [
    { key: 'name', label: 'ชื่อมอนสเตอร์', kind: 'text', placeholder: 'เช่น Frost Revenant' },
    { key: 'type', label: 'ชนิด', kind: 'select', options: ['Beast', 'Aberration', 'Undead', 'Elemental', 'Dragon', 'Humanoid'] },
    { key: 'dr', label: 'Danger Rating (DR)', kind: 'select', options: ['DR 1', 'DR 2', 'DR 3', 'DR 4', 'DR 5', 'DR 6', 'DR 7', 'DR 8', 'DR 9', 'DR 10'] },
    { key: 'tag', label: 'หมวด', kind: 'select', options: ['Beast', 'Aberration', 'Undead', 'Elemental', 'Dragon'] },
    { key: 'habitat', label: 'ถิ่นอาศัย', kind: 'select', options: ['Forest', 'Cavern', 'Celestial', 'Void', 'Urban', 'Aquatic'] },
    { key: 'size', label: 'ขนาด (เมตร)', kind: 'text', placeholder: 'เช่น 2.4 m' },
    { key: 'weight', label: 'น้ำหนัก', kind: 'text', placeholder: 'เช่น 180 kg' },
    { key: 'behavior', label: 'พฤติกรรม', kind: 'select', options: ['Passive', 'Territorial', 'Aggressive', 'Cunning'] },
    { key: 'friendliness', label: 'ความเป็นมิตร', kind: 'select', options: ['Hostile', 'Wary', 'Neutral', 'Friendly'] },
    { key: 'scratch', label: 'Scratch Points', kind: 'text', placeholder: 'เช่น 34 SP' },
    { key: 'wounds', label: 'Wounds Points', kind: 'text', placeholder: 'เช่น 3 WND' },
    { key: 'wp', label: 'Willpower (WP)', kind: 'text', placeholder: 'เช่น 12 WP' },
    { key: 'tn', label: 'Tame TN', kind: 'text', placeholder: 'เช่น TN 16' },
    { key: 'harvest', label: 'Harvestable Parts', kind: 'text', placeholder: 'เช่น เขี้ยว 2 kg, หนัง 5 kg' },
    { key: 'manaSlot', label: 'จำนวน Mana Slot', kind: 'text', placeholder: 'เช่น 1' },
  ],
};

export const CATALOG_CONFIGS: Record<CatalogCategory, CatalogConfig> = {
  equipment: EQUIPMENT,
  magic: MAGIC,
  monster: MONSTER,
};

export function getCatalogConfig(category: CatalogCategory): CatalogConfig {
  return CATALOG_CONFIGS[category];
}

/** All field keys that are legal to store in a catalog item's `fields` JSON bag,
 *  for a given category + isFeature flag. Used by the API to whitelist writes. */
export function allowedFieldKeys(category: CatalogCategory, isFeature = false): string[] {
  const cfg = CATALOG_CONFIGS[category];
  const source = isFeature && cfg.feature ? cfg.feature : cfg;
  const keys = new Set<string>();
  for (const f of source.addFields) keys.add(f.key);
  for (const f of source.filterFields) {
    keys.add(f.key);
    if (f.numKey) keys.add(f.numKey);
  }
  for (const [, key] of source.detailKeys) keys.add(key);
  for (const c of source.columns) {
    keys.add(c.key);
    if (c.numKey) keys.add(c.numKey);
  }
  // Common extra keys used by seed data / rendering.
  ['type', 'castLevel', 'range', 'duration', 'components', 'curiosity', 'ahenCore', 'resistances', 'behavior', 'friendliness', 'harvest', 'dmgBonus', 'manaSlot', 'scratch', 'wounds', 'wp', 'tn', 'size', 'costCoins', 'availability', 'professionalLevel', 'damage', 'requirements', 'wielding', 'ehenOrgan', 'ehenCore', 'coreRecover', 'engravedSpells', 'weaponArts', 'uses', 'usesPer', 'engraveMax'].forEach((k) => keys.add(k));
  return [...keys];
}
