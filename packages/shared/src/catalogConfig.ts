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
  /** Only show this field when another field's value is one of these (e.g. bagCapacity only for Bag tag). */
  showWhen?: { key: string; in: string[] };
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
    ['+ Natural Defense', 'natDefBonus'],
    ['Ehen / ครั้ง', 'ehenPerUse'],
    ['ความทนทาน (DUR)', 'durability'],
    ['Bag Capacity (kg)', 'bagCapacity'],
    ['ปริมาณที่ขนได้ (kg)', 'vehicleCapacity'],
    ['Specialization', 'toolSpec'],
    ['Wielding', 'wielding'],
    ['Material', 'material'],
    ['Availability', 'availability'],
  ],
  subtitleKey: 'type',
  filterFields: [
    { key: 'tag', label: 'Tags', any: 'Any Tag', options: ['Weapon', 'Armor', 'Shields', 'Clothing', 'Potion', 'Tool', 'Adventuring Gear', 'Artifact', 'Vehicle', 'Trinket', 'Bag Category'] },
    { key: 'equipType', label: 'Usage Type', any: 'Any Type', options: ['อาวุธ (Weapon)', 'โล่ (Shield)', 'เกราะ (Armor)'] },
    { key: 'availability', label: 'Availability', any: 'Any Availability', options: ['Kiosk', 'Smithy', 'Vault', 'Quest', 'Common'] },
    { key: 'cost', label: 'Cost', kind: 'range', unit: 'Cr.', numKey: 'costNum' },
    { key: 'material', label: 'Materials', any: 'Any Material', options: ['Wood', 'Metal', 'Bone', 'Glass', 'Crystal', 'Cloth', 'Leather', 'Biomaterials', 'Rare Earth', 'Monster Parts'] },
    { key: 'rarity', label: 'Rarity', any: 'Any Tag', options: ['Poor', 'Common', 'Uncommon', 'Rare', 'Legendary'] },
    { key: 'professionalLevel', label: 'Professional Level', any: 'Any Professional Level', options: ['Amateur', 'Journeyman', 'Expert', 'Master'] },
    { key: 'damage', label: 'Damage', any: 'Any Damage', options: ['Piercing', 'Slashing', 'Bludgeoning', 'None'] },
    { key: 'weight', label: 'Weight', kind: 'range', unit: 'Kg', numKey: 'weightNum' },
    { key: 'reqAttr', label: 'Requirements (Core Attribute)', any: 'Any Requirement', options: ['None', 'STR', 'DEX', 'END', 'PER', 'INT', 'AUT', 'CVN'] },
    { key: 'wielding', label: 'Wielding', any: 'Any Wielding', options: ['One-Handed', 'Two-Handed', 'Worn', 'None'] },
    { key: 'source', label: 'Sources', any: 'Any Tag', options: ["Player's Handbook", 'Arcane Compendium', 'GM Guide', 'Homebrew'] },
  ],
  addFields: [
    { key: 'name', label: 'ชื่อ', kind: 'text', placeholder: 'ตั้งชื่อ…' },
    { key: 'tag', label: 'Tags', kind: 'select', options: ['Weapon', 'Armor', 'Shields', 'Clothing', 'Potion', 'Tool', 'Adventuring Gear', 'Artifact', 'Vehicle', 'Trinket', 'Bag Category'] },
    { key: 'equipType', label: 'Usage Type', kind: 'select', options: ['อาวุธ (Weapon)', 'โล่ (Shield)', 'เกราะ (Armor)'] },
    { key: 'availability', label: 'Availability', kind: 'select', options: ['Kiosk', 'Smithy', 'Vault', 'Quest', 'Common'] },
    // Cost in real coins (Platinum/Gold/Silver/Copper/Iron); costNum (IC total) is derived on save.
    { key: 'costPC', label: 'ราคา Platinum', kind: 'text', placeholder: '0' },
    { key: 'costGC', label: 'ราคา Gold', kind: 'text', placeholder: '0' },
    { key: 'costSC', label: 'ราคา Silver', kind: 'text', placeholder: '0' },
    { key: 'costCC', label: 'ราคา Copper', kind: 'text', placeholder: '0' },
    { key: 'costIC', label: 'ราคา Iron', kind: 'text', placeholder: '0' },
    { key: 'material', label: 'Materials', kind: 'select', options: ['Wood', 'Metal', 'Bone', 'Glass', 'Crystal', 'Cloth', 'Leather', 'Biomaterials', 'Rare Earth', 'Monster Parts'] },
    { key: 'materialDmgBonus', label: 'ค่า + ดาเมจของวัสดุ (ระบุเอง)', kind: 'text', placeholder: 'เช่น 2', showWhen: { key: 'material', in: ['Rare Earth', 'Monster Parts'] } },
    { key: 'rarity', label: 'Rarity', kind: 'select', options: ['Poor', 'Common', 'Uncommon', 'Rare', 'Legendary'] },
    { key: 'professionalLevel', label: 'Professional Level', kind: 'select', options: ['Amateur', 'Journeyman', 'Expert', 'Master'] },
    { key: 'damage', label: 'Damage', kind: 'select', options: ['Piercing', 'Slashing', 'Bludgeoning', 'None'] },
    { key: 'weight', label: 'Weight', kind: 'text', placeholder: 'เช่น 2 Kg' },
    { key: 'natDefBonus', label: '+ Natural Defense', kind: 'text', placeholder: 'เช่น 2', showWhen: { key: 'tag', in: ['Armor', 'Shields'] } },
    { key: 'ehenPerUse', label: 'ปริมาณเอเฮนที่ใช้ / ครั้ง', kind: 'text', placeholder: 'เช่น 1', showWhen: { key: 'tag', in: ['Artifact'] } },
    { key: 'durability', label: 'ความทนทาน (DUR)', kind: 'text', placeholder: 'เช่น 10', showWhen: { key: 'tag', in: ['Adventuring Gear'] } },
    { key: 'bagCapacity', label: 'ความจุกระเป๋า (kg)', kind: 'text', placeholder: 'เช่น 15', showWhen: { key: 'tag', in: ['Bag Category'] } },
    { key: 'vehicleCapacity', label: 'ปริมาณที่ขนได้ (kg)', kind: 'text', placeholder: 'เช่น 100', showWhen: { key: 'tag', in: ['Vehicle'] } },
    { key: 'toolSpec', label: 'Specialization ที่ต้องใช้', kind: 'text', placeholder: 'ชื่อ Feature: Specialization', showWhen: { key: 'tag', in: ['Tool'] } },
    { key: 'reqAttr', label: 'Requirements (Core Attribute)', kind: 'select', options: ['None', 'STR', 'DEX', 'END', 'PER', 'INT', 'AUT', 'CVN'] },
    { key: 'reqGrade', label: 'เกรดขั้นต่ำ', kind: 'select', options: ['A', 'B', 'C', 'D', 'X'], showWhen: { key: 'reqAttr', in: ['STR', 'DEX', 'END', 'PER', 'INT', 'AUT', 'CVN'] } },
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
    { key: 'knowledge', label: 'Knowledge Points', any: 'Any KP', options: ['8 KP', '13 KP', '15 KP', '20 KP', '30 KP', '40 KP', '70 KP', '80 KP', '100 KP', '120 KP'] },
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
    { key: 'knowledge', label: 'Knowledge Points', kind: 'select', options: ['8 KP', '13 KP', '15 KP', '20 KP', '30 KP', '40 KP', '70 KP', '80 KP', '100 KP', '120 KP'] },
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
      ['จำนวนครั้งที่ใช้ได้', 'uses'],
      ['Cooldown', 'duration'],
      ['Quality of Life', 'ql'],
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
      { key: 'curiosity', label: 'Curiosity Point', any: 'Any CP', options: ['8 CP', '13 CP', '15 CP', '20 CP', '30 CP', '40 CP', '70 CP', '80 CP', '100 CP', '120 CP'] },
      { key: 'duration', label: 'Cooldown', any: 'Any Cooldown', options: ['None', '1 turn', '1 scene', 'Once/day'] },
      { key: 'requirements', label: 'Requirements', any: 'Any Requirement', options: ['None', 'Proficiency', 'Level 5+'] },
      { key: 'source', label: 'Sources', any: 'Any Source', options: ["Player's Handbook", 'GM Guide', 'Homebrew'] },
    ],
    addFields: [
      { key: 'name', label: 'ชื่อ', kind: 'text', placeholder: 'ตั้งชื่อ…' },
      { key: 'mode', label: 'รูปแบบ Feature', kind: 'radio', options: ['Active', 'Passive'] },
      { key: 'uses', label: 'จำนวนครั้งที่ใช้ได้ (ต่อ Long Rest)', kind: 'text', placeholder: 'เฉพาะ Active เช่น 3 (เว้นว่าง = ไม่จำกัด)', showWhen: { key: 'mode', in: ['Active'] } },
      { key: 'tag', label: 'Tags', kind: 'select', options: ['Active', 'Passive', 'Reaction', 'Stance', 'Life lesson', 'Local Knowledge', 'Species', 'Social', 'Weapon Arts'] },
      { key: 'class', label: 'Class', kind: 'select', options: ['Vanguard', 'Defender', 'Sharpshooter', 'Caster', 'Support', 'Striker', 'Specialist'] },
      { key: 'rarity', label: 'Capacity', kind: 'select', options: ['Common', 'Uncommon', 'Rare', 'Legendary'] },
      { key: 'cost', label: 'Willpower (WP)', kind: 'select', options: ['0 WP', '1 WP', '2 WP', '3 WP', '4 WP', '5 WP'] },
      { key: 'ql', label: 'Quality of Life', kind: 'select', options: ['0 QL', '1 QL', '2 QL', '3 QL', '4 QL', '5 QL', '6 QL'] },
      { key: 'curiosity', label: 'Curiosity Point', kind: 'select', options: ['8 CP', '13 CP', '15 CP', '20 CP', '30 CP', '40 CP', '70 CP', '80 CP', '100 CP', '120 CP'] },
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
    ['STR', 'coreSTR'],
    ['DEX', 'coreDEX'],
    ['END', 'coreEND'],
    ['PER', 'corePER'],
    ['INT', 'coreINT'],
    ['AUT', 'coreAUT'],
    ['CVN', 'coreCVN'],
    ['Sources', 'source'],
  ],
  subtitleKey: 'type',
  filterFields: [
    { key: 'tag', label: 'Tags', any: 'Any Tag', options: ['Beast', 'Aberration', 'Undead', 'Elemental', 'Dragon'] },
    { key: 'coreSTR', label: 'STR', any: 'Any STR', options: ['A', 'B', 'C', 'D', 'X'] },
    { key: 'coreDEX', label: 'DEX', any: 'Any DEX', options: ['A', 'B', 'C', 'D', 'X'] },
    { key: 'coreEND', label: 'END', any: 'Any END', options: ['A', 'B', 'C', 'D', 'X'] },
    { key: 'corePER', label: 'PER', any: 'Any PER', options: ['A', 'B', 'C', 'D', 'X'] },
    { key: 'coreINT', label: 'INT', any: 'Any INT', options: ['A', 'B', 'C', 'D', 'X'] },
    { key: 'coreAUT', label: 'AUT', any: 'Any AUT', options: ['A', 'B', 'C', 'D', 'X'] },
    { key: 'coreCVN', label: 'CVN', any: 'Any CVN', options: ['A', 'B', 'C', 'D', 'X'] },
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
    { key: 'coreSTR', label: 'STR (Strength)', kind: 'select', options: ['A', 'B', 'C', 'D', 'X'] },
    { key: 'coreDEX', label: 'DEX (Dexterity)', kind: 'select', options: ['A', 'B', 'C', 'D', 'X'] },
    { key: 'coreEND', label: 'END (Endurance)', kind: 'select', options: ['A', 'B', 'C', 'D', 'X'] },
    { key: 'corePER', label: 'PER (Perception)', kind: 'select', options: ['A', 'B', 'C', 'D', 'X'] },
    { key: 'coreINT', label: 'INT (Intelligence)', kind: 'select', options: ['A', 'B', 'C', 'D', 'X'] },
    { key: 'coreAUT', label: 'AUT (Authority)', kind: 'select', options: ['A', 'B', 'C', 'D', 'X'] },
    { key: 'coreCVN', label: 'CVN (Conviction)', kind: 'select', options: ['A', 'B', 'C', 'D', 'X'] },
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

// ---- Equipment: coin cost + weapon damage bonus + requirements ------------
// Real-coin denominations → Iron (IC) value. Item cost is entered per coin and
// stored as costNum (total IC); the detail view decomposes it back into coins.
export const COIN_IC: Record<string, number> = { costPC: 10000, costGC: 1000, costSC: 100, costCC: 10, costIC: 1 };
export function costFieldsToIC(fields: Record<string, unknown>): number {
  return Object.entries(COIN_IC).reduce((s, [k, ic]) => s + (Number(fields[k]) || 0) * ic, 0);
}

// #13 — weapon "+ Damage" is derived: Material + Professional Level + Rarity +
// Wielding, shown only when the Damage type is Piercing/Slashing/Bludgeoning.
export const MATERIAL_DMG: Record<string, number> = {
  Wood: 1, Metal: 1, Bone: 1, Glass: 1, Crystal: 1,
  Cloth: 0, Leather: 0, Biomaterials: 0,
  // 'Rare Earth' / 'Monster Parts' use the dev-entered materialDmgBonus.
};
export const PROF_DMG: Record<string, number> = { Amateur: 0, Journeyman: 1, Expert: 2, Master: 3 };
export const RARITY_DMG: Record<string, number> = { Poor: -2, Common: -1, Uncommon: 0, Rare: 1, Legendary: 2 };
const DMG_TYPES = ['Piercing', 'Slashing', 'Bludgeoning'];
export function weaponDamageBonus(fields: Record<string, unknown>): number | null {
  if (!DMG_TYPES.includes(String(fields.damage ?? ''))) return null;
  const mat = String(fields.material ?? '');
  const matBonus = mat in MATERIAL_DMG ? MATERIAL_DMG[mat] : (['Rare Earth', 'Monster Parts'].includes(mat) ? (Number(fields.materialDmgBonus) || 0) : 0);
  const prof = PROF_DMG[String(fields.professionalLevel ?? '')] ?? 0;
  const rar = RARITY_DMG[String(fields.rarity ?? '')] ?? 0;
  const wield = /two/i.test(String(fields.wielding ?? '')) ? 2 : 0;
  return matBonus + prof + rar + wield;
}

// #14 — Requirements are a Core Attribute grade. A = highest … X = lowest.
export const GRADE_RANK: Record<string, number> = { X: 0, D: 1, C: 2, B: 3, A: 4 };
// Returns how a character's grade compares to the requirement:
//  'ok' (meets/exceeds), 'disadvantage' (1 tier below), 'blocked' (2+ below), null (no requirement).
export function requirementCheck(reqAttr: string, reqGrade: string, charGrade: string): 'ok' | 'disadvantage' | 'blocked' | null {
  if (!reqAttr || reqAttr === 'None' || !(reqGrade in GRADE_RANK)) return null;
  const need = GRADE_RANK[reqGrade];
  const have = GRADE_RANK[charGrade] ?? 0;
  const gap = need - have;
  if (gap <= 0) return 'ok';
  if (gap === 1) return 'disadvantage';
  return 'blocked';
}

// ---- Magic spell Target Number (TN) ---------------------------------------
// A spell's casting TN is derived, never stored: a base set by its Casting Level
// plus a modifier that grows with the Knowledge Points it demands. Kept here so
// the same formula backs the detail display (and any future server-side use).
export const MAGIC_BASE_TN: Record<string, number> = {
  'Root Magic': 9,
  'Basic Magic': 11,
  'Advanced Magic': 15,
  'High Magic': 18,
  'Ritual Magic': 20,
  'Grand Magic': 15,
};

// KP → TN modifier, by range: 8–20 → +0, 21–70 → +2, 71+ → +3.
export function magicKpModifier(kp: number): number {
  if (!Number.isFinite(kp) || kp <= 20) return 0;
  if (kp <= 70) return 2;
  return 3;
}

// Returns { base, mod, tn } for a spell, or null when the Casting Level is
// unknown (e.g. features, which have no casting level and therefore no TN).
export function computeMagicTN(
  castLevel: string | undefined,
  kpValue: string | number | undefined,
): { base: number; mod: number; tn: number } | null {
  const base = castLevel ? MAGIC_BASE_TN[castLevel] : undefined;
  if (base == null) return null;
  const kp = typeof kpValue === 'number' ? kpValue : parseInt(String(kpValue ?? ''), 10);
  const mod = magicKpModifier(kp);
  return { base, mod, tn: base + mod };
}

// ---- Feature Target Number (TN) -------------------------------------------
// A Feature is checked on d8 + d8 + d10 (sum 3–26, mean ~14.5). Its TN is a base
// set by Capacity — centred on that curve so no tier is trivial or impossible —
// plus a Curiosity Point modifier that uses the same scale/ranges as a spell's
// Knowledge Points (8–20 → +0, 21–70 → +2, 71+ → +3). Base success before the
// modifier: Common 12 ≈ 75% · Uncommon 14 ≈ 59% · Rare 16 ≈ 41% · Legendary 18 ≈ 26%.
export const FEATURE_BASE_TN: Record<string, number> = {
  Common: 12,
  Uncommon: 14,
  Rare: 16,
  Legendary: 18,
};

// Returns { base, mod, tn } for a feature, or null when the Capacity is unknown.
export function computeFeatureTN(
  capacity: string | undefined,
  curiosityValue: string | number | undefined,
): { base: number; mod: number; tn: number } | null {
  const base = capacity ? FEATURE_BASE_TN[capacity] : undefined;
  if (base == null) return null;
  const cp = typeof curiosityValue === 'number' ? curiosityValue : parseInt(String(curiosityValue ?? ''), 10);
  const mod = magicKpModifier(cp); // same ranges as Knowledge Points
  return { base, mod, tn: base + mod };
}
