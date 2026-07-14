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

// Health check — deliberately BEFORE session/loadUser so it never depends on a
// session-store DB read. It does its OWN database ping (with retry) so that:
//   • it keeps the Neon compute + Prisma connection pool warm on each poll, and
//   • it reports 503 when the DB is genuinely unreachable, which makes Render's
//     health check fail and auto-restart the instance — self-healing the
//     "stale connection → 500 on every request" outage without a manual restart.
// The retry means a single stale pooled connection (which Prisma drops and
// reconnects on the next attempt) won't trigger a needless restart.
app.get('/api/health', async (_req, res) => {
  for (let attempt = 1; attempt <= 3; attempt++) {
    try {
      await prisma.$queryRaw`SELECT 1`;
      res.json({ ok: true });
      return;
    } catch (err) {
      if (attempt === 3) {
        console.error('[health] database unreachable', err);
        res.status(503).json({ ok: false, error: 'database unreachable' });
        return;
      }
      await new Promise((r) => setTimeout(r, 500 * attempt));
    }
  }
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

// Serve uploaded images from the DB (persists across redeploys, no object storage).
// NOTE: the standalone /api/health route above is intentionally registered
// earlier, before the session + loadUser middleware.
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
