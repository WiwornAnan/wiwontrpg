import { Router } from 'express';
import bcrypt from 'bcryptjs';
import { z } from 'zod';
import { prisma } from '../db.js';
import { ENV } from '../env.js';
import { requireAuth } from '../middleware/auth.js';
import { toPublicUser } from '../serialize.js';

export const authRouter = Router();

const signupSchema = z.object({
  email: z.string().email('อีเมลไม่ถูกต้อง'),
  password: z.string().min(6, 'รหัสผ่านอย่างน้อย 6 ตัวอักษร'),
  displayName: z.string().min(1, 'กรุณากรอกชื่อ').max(60),
  role: z.enum(['user', 'dev']).default('user'),
  devCode: z.string().optional(),
});

authRouter.post('/signup', async (req, res) => {
  const parsed = signupSchema.safeParse(req.body);
  if (!parsed.success) {
    res.status(400).json({ error: parsed.error.issues[0]?.message ?? 'ข้อมูลไม่ถูกต้อง' });
    return;
  }
  const { email, password, displayName, role, devCode } = parsed.data;

  // Developer role is gated by a server-side invite code — never trust the client role alone.
  if (role === 'dev' && devCode !== ENV.DEV_INVITE_CODE) {
    res.status(403).json({ error: 'รหัสผู้พัฒนาไม่ถูกต้อง' });
    return;
  }

  const existing = await prisma.user.findUnique({ where: { email } });
  if (existing) {
    res.status(409).json({ error: 'อีเมลนี้ถูกใช้งานแล้ว' });
    return;
  }

  const passwordHash = await bcrypt.hash(password, 10);
  const user = await prisma.user.create({
    data: {
      email,
      passwordHash,
      displayName,
      role,
      devCodeVerifiedAt: role === 'dev' ? new Date() : null,
    },
  });

  req.session.userId = user.id;
  res.status(201).json({ user: toPublicUser(user) });
});

const loginSchema = z.object({
  email: z.string().email(),
  password: z.string().min(1),
});

authRouter.post('/login', async (req, res) => {
  const parsed = loginSchema.safeParse(req.body);
  if (!parsed.success) {
    res.status(400).json({ error: 'กรุณากรอกอีเมลและรหัสผ่าน' });
    return;
  }
  const { email, password } = parsed.data;
  const user = await prisma.user.findUnique({ where: { email } });
  if (!user || !(await bcrypt.compare(password, user.passwordHash))) {
    res.status(401).json({ error: 'อีเมลหรือรหัสผ่านไม่ถูกต้อง' });
    return;
  }
  req.session.userId = user.id;
  res.json({ user: toPublicUser(user) });
});

authRouter.post('/logout', (req, res) => {
  req.session.destroy(() => {
    res.clearCookie('wiwon.sid');
    res.json({ ok: true });
  });
});

authRouter.get('/me', requireAuth, (req, res) => {
  res.json({ user: toPublicUser(req.currentUser!) });
});

// Update own profile (display name for now; email is the login key, left alone).
const profileSchema = z.object({ displayName: z.string().min(1, 'กรุณากรอกชื่อ').max(60) });
authRouter.patch('/profile', requireAuth, async (req, res) => {
  const parsed = profileSchema.safeParse(req.body);
  if (!parsed.success) { res.status(400).json({ error: parsed.error.issues[0]?.message ?? 'ข้อมูลไม่ถูกต้อง' }); return; }
  const user = await prisma.user.update({ where: { id: req.currentUser!.id }, data: { displayName: parsed.data.displayName.trim() } });
  res.json({ user: toPublicUser(user) });
});

// Change own password — verifies the current one first, then rehashes.
const passwordSchema = z.object({
  currentPassword: z.string().min(1, 'กรอกรหัสผ่านปัจจุบัน'),
  newPassword: z.string().min(6, 'รหัสผ่านใหม่อย่างน้อย 6 ตัวอักษร'),
});
authRouter.post('/change-password', requireAuth, async (req, res) => {
  const parsed = passwordSchema.safeParse(req.body);
  if (!parsed.success) { res.status(400).json({ error: parsed.error.issues[0]?.message ?? 'ข้อมูลไม่ถูกต้อง' }); return; }
  const user = await prisma.user.findUnique({ where: { id: req.currentUser!.id } });
  if (!user || !(await bcrypt.compare(parsed.data.currentPassword, user.passwordHash))) {
    res.status(401).json({ error: 'รหัสผ่านปัจจุบันไม่ถูกต้อง' });
    return;
  }
  const passwordHash = await bcrypt.hash(parsed.data.newPassword, 10);
  await prisma.user.update({ where: { id: user.id }, data: { passwordHash } });
  res.json({ ok: true });
});
