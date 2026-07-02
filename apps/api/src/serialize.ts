import type {
  Article as PArticle,
  CatalogItem as PCatalogItem,
  Comment as PComment,
  PrayMessage as PPray,
  PrayReply as PPrayReply,
  User as PUser,
  WiwonCover as PCover,
  Bookmark as PBookmark,
} from '@prisma/client';
import {
  CR_RESET_HOUR,
  type Article,
  type CatalogItem,
  type Comment,
  type PrayMessage,
  type PublicUser,
  type WiwonCover,
} from '@wiwonanant/shared';

function parseJson<T>(raw: string, fallback: T): T {
  try {
    return JSON.parse(raw) as T;
  } catch {
    return fallback;
  }
}

/** Local "claim day" key — resets at CR_RESET_HOUR (03:00). */
export function claimDayKey(d = new Date()): string {
  const shifted = new Date(d.getTime() - CR_RESET_HOUR * 3600_000);
  return shifted.toISOString().slice(0, 10);
}

export function canClaimCredits(user: Pick<PUser, 'lastCrClaimAt'>): boolean {
  if (!user.lastCrClaimAt) return true;
  return claimDayKey(user.lastCrClaimAt) !== claimDayKey();
}

export function toPublicUser(u: PUser): PublicUser {
  return {
    id: u.id,
    email: u.email,
    displayName: u.displayName,
    role: u.role as PublicUser['role'],
    creditBalance: u.creditBalance,
    canClaimCredits: canClaimCredits(u),
  };
}

export function toArticle(a: PArticle): Article {
  return {
    id: a.id,
    category: a.category as Article['category'],
    wiwonCoverId: a.wiwonCoverId,
    partSection: a.partSection,
    orderIndex: a.orderIndex,
    title: a.title,
    summary: a.summary,
    bodyText: a.bodyText,
    notes: parseJson(a.notes, []),
    tables: parseJson(a.tables, []),
    images: parseJson(a.images, []),
    footnote: a.footnote,
    authorName: a.authorName,
    tags: parseJson(a.tags, []),
    iconLarge: a.iconLarge,
    iconSmall: a.iconSmall,
    status: a.status as Article['status'],
    createdAt: a.createdAt.toISOString(),
    updatedAt: a.updatedAt.toISOString(),
  };
}

export function toCover(c: PCover): WiwonCover {
  return {
    id: c.id,
    name: c.name,
    updateDateLabel: c.updateDateLabel,
    coverImageUrl: c.coverImageUrl,
    heroTitle: c.heroTitle,
    heroSubtitle: c.heroSubtitle,
    heroImageUrl: c.heroImageUrl,
    hasData: c.hasData,
    orderIndex: c.orderIndex,
  };
}

export function toCatalogItem(i: PCatalogItem & { owner?: PUser | null }): CatalogItem {
  return {
    id: i.id,
    category: i.category as CatalogItem['category'],
    isFeature: i.isFeature,
    name: i.name,
    subtitle: i.subtitle,
    fields: parseJson(i.fields, {}),
    description: i.description,
    tags: parseJson(i.tags, []),
    source: i.source,
    isHomebrew: i.isHomebrew,
    ownerUserId: i.ownerUserId,
    ownerName: i.owner?.displayName ?? null,
    isOfficialAdded: i.isOfficialAdded,
    approvedFromHomebrew: i.approvedFromHomebrew,
    iconUrl: i.iconUrl,
    durabilityRemaining: i.durabilityRemaining,
    woundsRemaining: i.woundsRemaining,
    willpowerRemaining: i.willpowerRemaining,
    scratchCurrent: i.scratchCurrent,
    ammoCurrent: i.ammoCurrent,
    manaUsed: i.manaUsed,
    nameCount: i.nameCount,
    createdAt: i.createdAt.toISOString(),
    updatedAt: i.updatedAt.toISOString(),
  };
}

export function toComment(c: PComment & { author: PUser }): Comment {
  return {
    id: c.id,
    authorUserId: c.authorUserId,
    authorName: c.author.displayName,
    authorIsDev: c.author.role === 'dev',
    body: c.body,
    edited: c.edited,
    createdAt: c.createdAt.toISOString(),
    updatedAt: c.updatedAt.toISOString(),
  };
}

export function toPray(
  m: PPray & {
    fromUser: PUser;
    catalogItem?: (PCatalogItem & { owner?: PUser | null }) | null;
    replies: (PPrayReply & { byUser: PUser })[];
  },
): PrayMessage {
  return {
    id: m.id,
    kind: m.kind as PrayMessage['kind'],
    catalogItemId: m.catalogItemId,
    catalogItem: m.catalogItem ? toCatalogItem(m.catalogItem) : null,
    fromUserId: m.fromUserId,
    fromName: m.fromUser.displayName,
    toUserId: m.toUserId,
    subject: m.subject,
    body: m.body,
    readByDev: m.readByDev,
    readByUser: m.readByUser,
    approved: m.approved,
    creditsAwarded: m.creditsAwarded,
    replies: m.replies.map((r) => ({
      id: r.id,
      byUserId: r.byUserId,
      byName: r.byUser.displayName,
      isDev: r.isDev,
      isNotify: r.isNotify,
      body: r.body,
      createdAt: r.createdAt.toISOString(),
    })),
    createdAt: m.createdAt.toISOString(),
  };
}

export type { PBookmark };
