import path from 'node:path';
import fs from 'node:fs';
import { fileURLToPath } from 'node:url';
import express from 'express';
import session from 'express-session';
import cors from 'cors';
import cookieParser from 'cookie-parser';
import { ENV } from './env.js';
import { prisma } from './db.js';
import { PrismaSessionStore } from './sessionStore.js';
import { loadUser } from './middleware/auth.js';
import { authRouter } from './routes/auth.js';
import { articlesRouter } from './routes/articles.js';
import { coversRouter } from './routes/covers.js';
import { charactersRouter } from './routes/characters.js';
import { campaignsRouter } from './routes/campaigns.js';
import { boardsRouter } from './routes/boards.js';
import { wizardRouter } from './routes/wizard.js';
import { catalogRouter } from './routes/catalog.js';
import { tagsRouter } from './routes/tags.js';
import { prayRouter } from './routes/pray.js';
import { creditsRouter } from './routes/credits.js';
import { walletRouter } from './routes/wallet.js';
import { commentsRouter } from './routes/comments.js';
import { bookmarksRouter } from './routes/bookmarks.js';
import { uploadsRouter } from './routes/uploads.js';
import { searchRouter } from './routes/search.js';
import { announcementsRouter } from './routes/announcements.js';
import { heroesRouter } from './routes/heroes.js';
import { statsRouter } from './routes/stats.js';

const __dirname = path.dirname(fileURLToPath(import.meta.url));

const app = express();

const isProd = ENV.NODE_ENV === 'production';
// Behind Render/any reverse proxy: trust it so secure cookies + protocol work.
if (isProd) app.set('trust proxy', 1);

// CORS only matters when the frontend is served from a different origin (dev).
// In production the SPA is served same-origin by this server, so CORS is a no-op.
app.use(cors({ origin: ENV.WEB_ORIGIN, credentials: true }));
app.use(express.json({ limit: '12mb' }));
app.use(cookieParser());

// Liveness check — is the web process up? It deliberately does NOT touch the
// database: Render polls this frequently, and a per-poll `SELECT 1` would keep
// the serverless Postgres (Neon) compute awake 24/7, burning compute-hours and
// egress even with zero users. Letting the DB auto-suspend while idle is the
// single biggest cost saver. Prisma reconnects lazily on the next real query,
// and loadUser already degrades to "anonymous" on a transient DB error, so we
// don't need a health-check-driven restart to self-heal.
app.get('/api/health', (_req, res) => {
  res.json({ ok: true });
});

// Opt-in readiness probe that DOES hit the DB — for manual checks only. Nothing
// polls this, so it never keeps the compute warm.
app.get('/api/ready', async (_req, res) => {
  try {
    await prisma.$queryRaw`SELECT 1`;
    res.json({ ok: true, db: 'up' });
  } catch (err) {
    console.error('[ready] database unreachable', err);
    res.status(503).json({ ok: false, db: 'down' });
  }
});

// Serve uploaded images from the DB. Registered BEFORE session + loadUser so an
// image request skips the session-store read and the user lookup (two DB reads
// it never needs) — images are public and immutable, and the browser caches them
// for a year, so this route hits the DB only on a genuine first load.
app.get('/uploads/:id', async (req, res) => {
  const row = await prisma.upload.findUnique({ where: { id: req.params.id } });
  if (!row) {
    res.status(404).end();
    return;
  }
  res.setHeader('Content-Type', row.mime);
  res.setHeader('Cache-Control', 'public, max-age=31536000, immutable');
  res.end(Buffer.from(row.data));
});

app.use(
  session({
    name: 'wiwon.sid',
    secret: ENV.SESSION_SECRET,
    resave: false,
    saveUninitialized: false,
    store: new PrismaSessionStore(),
    cookie: {
      httpOnly: true,
      sameSite: 'lax',
      secure: isProd,
      maxAge: 1000 * 60 * 60 * 24 * 30,
    },
  }),
);
app.use(loadUser);

app.use('/api/auth', authRouter);
app.use('/api/articles', articlesRouter);
app.use('/api/wiwon-covers', coversRouter);
app.use('/api/characters', charactersRouter);
app.use('/api/campaigns', campaignsRouter);
app.use('/api/campaigns', boardsRouter); // hex battle maps (/:id/maps…)
app.use('/api/wizard', wizardRouter);
app.use('/api/catalog', catalogRouter);
app.use('/api/tags', tagsRouter);
app.use('/api/pray', prayRouter);
app.use('/api/credits', creditsRouter);
app.use('/api/wallet', walletRouter);
app.use('/api/comments', commentsRouter);
app.use('/api/bookmarks', bookmarksRouter);
app.use('/api/uploads', uploadsRouter);
app.use('/api/search', searchRouter);
app.use('/api/announcements', announcementsRouter);
app.use('/api/heroes', heroesRouter);
app.use('/api/stats', statsRouter);

// Serve the built frontend (single-port deployment). SPA fallback for client routes.
const webDist = path.join(__dirname, '..', '..', 'web', 'dist');
if (fs.existsSync(webDist)) {
  app.use(express.static(webDist));
  app.get('*', (req, res, next) => {
    if (req.path.startsWith('/api') || req.path.startsWith('/uploads')) return next();
    res.sendFile(path.join(webDist, 'index.html'));
  });
  console.log('[api] serving built frontend from', webDist);
}

// Central error handler.
app.use(
  (err: unknown, _req: express.Request, res: express.Response, _next: express.NextFunction) => {
    console.error(err);
    res.status(500).json({ error: 'เกิดข้อผิดพลาดภายในระบบ' });
  },
);

app.listen(ENV.PORT, () => {
  console.log(`[api] listening on http://localhost:${ENV.PORT}`);
});
