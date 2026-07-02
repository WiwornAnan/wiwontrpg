import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { Router } from 'express';
import multer from 'multer';
import { nanoid } from 'nanoid';
import { requireAuth } from '../middleware/auth.js';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const UPLOAD_DIR = path.join(__dirname, '..', '..', 'uploads');

const storage = multer.diskStorage({
  destination: (_req, _file, cb) => cb(null, UPLOAD_DIR),
  filename: (_req, file, cb) => {
    const ext = path.extname(file.originalname).toLowerCase() || '.bin';
    cb(null, `${nanoid(16)}${ext}`);
  },
});

const upload = multer({
  storage,
  limits: { fileSize: 8 * 1024 * 1024 },
  fileFilter: (_req, file, cb) => {
    cb(null, /^image\//.test(file.mimetype));
  },
});

export const uploadsRouter = Router();

// Returns the public URL of the stored file. Isolated here so a future S3 swap
// only touches this handler.
uploadsRouter.post('/', requireAuth, upload.single('file'), (req, res) => {
  if (!req.file) {
    res.status(400).json({ error: 'ไม่พบไฟล์รูปภาพ' });
    return;
  }
  res.status(201).json({ url: `/uploads/${req.file.filename}` });
});
