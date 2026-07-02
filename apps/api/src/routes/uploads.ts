import { Router } from 'express';
import multer from 'multer';
import { prisma } from '../db.js';
import { requireAuth } from '../middleware/auth.js';

// Images are stored in the database (bytes) so they persist across redeploys
// without external object storage. Kept in memory by multer, then written to DB.
const upload = multer({
  storage: multer.memoryStorage(),
  limits: { fileSize: 8 * 1024 * 1024 },
  fileFilter: (_req, file, cb) => cb(null, /^image\//.test(file.mimetype)),
});

export const uploadsRouter = Router();

uploadsRouter.post('/', requireAuth, upload.single('file'), async (req, res) => {
  if (!req.file) {
    res.status(400).json({ error: 'ไม่พบไฟล์รูปภาพ' });
    return;
  }
  const row = await prisma.upload.create({
    data: { mime: req.file.mimetype, data: req.file.buffer },
  });
  res.status(201).json({ url: `/uploads/${row.id}` });
});
