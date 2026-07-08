// Minimal express-session Store backed by the Prisma `Session` table.
// Avoids a fragile third-party store dependency while keeping sessions persistent
// across API restarts (a plain MemoryStore would drop them).
import { Store, type SessionData } from 'express-session';
import { prisma } from './db.js';

export class PrismaSessionStore extends Store {
  get(sid: string, cb: (err: unknown, session?: SessionData | null) => void): void {
    prisma.session
      .findUnique({ where: { sid } })
      .then((row) => {
        if (!row) return cb(null, null);
        if (row.expiresAt.getTime() < Date.now()) {
          prisma.session.delete({ where: { sid } }).catch(() => {});
          return cb(null, null);
        }
        cb(null, JSON.parse(row.data) as SessionData);
      })
      // On a transient DB error, degrade to "no session" (anonymous) instead of
      // propagating the error, which express-session turns into a 500 on every
      // request from a logged-in user. The connection recovers on a later
      // request; the health check forces a reconnect / Render restart.
      .catch((err) => {
        console.error('[sessionStore] get failed, treating as no session', err);
        cb(null, null);
      });
  }

  set(sid: string, session: SessionData, cb?: (err?: unknown) => void): void {
    const expiresAt = session.cookie?.expires
      ? new Date(session.cookie.expires)
      : new Date(Date.now() + 1000 * 60 * 60 * 24 * 30);
    const data = JSON.stringify(session);
    prisma.session
      .upsert({
        where: { sid },
        create: { sid, data, expiresAt },
        update: { data, expiresAt },
      })
      .then(() => cb?.())
      .catch((err) => cb?.(err));
  }

  destroy(sid: string, cb?: (err?: unknown) => void): void {
    prisma.session
      .deleteMany({ where: { sid } })
      .then(() => cb?.())
      .catch((err) => cb?.(err));
  }

  touch(sid: string, session: SessionData, cb?: (err?: unknown) => void): void {
    const expiresAt = session.cookie?.expires
      ? new Date(session.cookie.expires)
      : new Date(Date.now() + 1000 * 60 * 60 * 24 * 30);
    prisma.session
      .updateMany({ where: { sid }, data: { expiresAt } })
      .then(() => cb?.())
      .catch(() => cb?.());
  }
}
