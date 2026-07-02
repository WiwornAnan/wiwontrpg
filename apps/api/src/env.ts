export const ENV = {
  PORT: Number(process.env.PORT || 4000),
  SESSION_SECRET: process.env.SESSION_SECRET || 'dev-secret-change-me',
  DEV_INVITE_CODE: process.env.DEV_INVITE_CODE || 'WIWON-DEV-2569',
  WEB_ORIGIN: process.env.WEB_ORIGIN || 'http://localhost:5173',
  NODE_ENV: process.env.NODE_ENV || 'development',
};
