// Shared DTO/domain types used by both web and api.
import type { CatalogCategory, DocCategory, UserRole } from './constants.js';

export interface PublicUser {
  id: string;
  email: string;
  displayName: string;
  role: UserRole;
  creditBalance: number;
  canClaimCredits: boolean;
}

export type DocStatus = 'draft' | 'published';
export type ImageLayout = 'full' | 'left' | 'right';

export interface ArticleImage {
  id: string;
  url: string;
  layout: ImageLayout;
  afterParagraph: number; // insert after paragraph N (0 = before body)
  order: number;
}

export interface StickyNote {
  id: string;
  text: string;
  afterParagraph?: number;
}

export interface ArticleTable {
  id: string;
  headCells: string[];
  rows: string[][];
  afterParagraph?: number;
}

export interface Article {
  id: string;
  category: DocCategory;
  wiwonCoverId: string | null;
  partSection: string;
  orderIndex: number;
  title: string;
  summary: string;
  bodyText: string;
  notes: StickyNote[];
  tables: ArticleTable[];
  images: ArticleImage[];
  footnote: string | null;
  authorName: string | null;
  tags: string[];
  iconLarge: string | null;
  iconSmall: string | null;
  status: DocStatus;
  createdAt: string;
  updatedAt: string;
}

export interface WiwonCover {
  id: string;
  name: string;
  updateDateLabel: string | null;
  coverImageUrl: string | null;
  heroTitle: string | null;
  heroSubtitle: string | null;
  heroImageUrl: string | null;
  hasData: boolean;
  orderIndex: number;
}

export interface CatalogItem {
  id: string;
  category: CatalogCategory;
  isFeature: boolean;
  name: string;
  subtitle: string | null;
  fields: Record<string, unknown>;
  description: string; // sanitized HTML
  tags: string[];
  source: string;
  isHomebrew: boolean;
  ownerUserId: string | null;
  ownerName?: string | null;
  isOfficialAdded: boolean;
  approvedFromHomebrew: boolean;
  iconUrl: string | null;
  // live trackers
  durabilityRemaining: number | null;
  woundsRemaining: number | null;
  willpowerRemaining: number | null;
  scratchCurrent: number | null;
  ammoCurrent: number | null;
  manaUsed: number | null;
  nameCount: number | null;
  createdAt: string;
  updatedAt: string;
}

export type PrayKind = 'general' | 'official-request';

export interface PrayReply {
  id: string;
  byUserId: string;
  byName: string;
  isDev: boolean;
  isNotify: boolean;
  body: string;
  createdAt: string;
}

export interface PrayMessage {
  id: string;
  kind: PrayKind;
  catalogItemId: string | null;
  catalogItem?: CatalogItem | null;
  fromUserId: string;
  fromName: string;
  toUserId: string | null;
  subject: string;
  body: string;
  readByDev: boolean;
  readByUser: boolean;
  approved: boolean;
  creditsAwarded: number | null;
  replies: PrayReply[];
  createdAt: string;
}

export interface Comment {
  id: string;
  authorUserId: string;
  authorName: string;
  authorIsDev: boolean;
  body: string;
  edited: boolean;
  createdAt: string;
  updatedAt: string;
}

export interface Bookmark {
  id: string;
  articleId: string | null;
  catalogItemId: string | null;
  category: string; // resolved source category for grouping on Home
  title: string;
  href: string;
  createdAt: string;
}

export interface Announcement {
  id: string;
  body: string;
  createdAt: string;
  updatedAt: string;
}

export interface SearchHit {
  kind: 'article' | 'catalog';
  id: string;
  title: string;
  categoryLabel: string;
  href: string;
}
