import type { NextFunction, Request, Response } from 'express';
import { prisma } from '../db.js';
import type { User } from '@prisma/client';

// Attaches the current user (if any) to req.currentUser.
export async function loadUser(req: Request, _res: Response, next: NextFunction): Promise<void> {
  const userId = req.session.userId;
  if (userId) {
    const user = await prisma.user.findUnique({ where: { id: userId } });
    if (user) req.currentUser = user;
  }
  next();
}

export function requireAuth(req: Request, res: Response, next: NextFunction): void {
  if (!req.currentUser) {
    res.status(401).json({ error: 'ต้องเข้าสู่ระบบก่อน' });
    return;
  }
  next();
}

export function requireDev(req: Request, res: Response, next: NextFunction): void {
  if (!req.currentUser || req.currentUser.role !== 'dev') {
    res.status(403).json({ error: 'ต้องเป็นบัญชีผู้พัฒนา' });
    return;
  }
  next();
}

declare global {
  // eslint-disable-next-line @typescript-eslint/no-namespace
  namespace Express {
    interface Request {
      currentUser?: User;
    }
  }
}
