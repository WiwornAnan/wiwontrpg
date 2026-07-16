export const ENV = {
  PORT: Number(process.env.PORT || 4000),
  SESSION_SECRET: process.env.SESSION_SECRET || 'dev-secret-change-me',
  DEV_INVITE_CODE: process.env.DEV_INVITE_CODE || 'WIWON-DEV-2569',
  WEB_ORIGIN: process.env.WEB_ORIGIN || 'http://localhost:5173',
  NODE_ENV: process.env.NODE_ENV || 'development',
  // Payment gateway: a real provider (Omise/Stripe/…) verifies webhooks with this
  // secret. Until one is wired, PAYMENTS_MOCK enables a sandbox "mock-pay" path so
  // the top-up flow is testable end-to-end. Mock is on by default off production.
  PAYMENT_WEBHOOK_SECRET: process.env.PAYMENT_WEBHOOK_SECRET || 'dev-webhook-secret-change-me',
  PAYMENTS_MOCK: process.env.PAYMENTS_MOCK
    ? process.env.PAYMENTS_MOCK === 'true'
    : (process.env.NODE_ENV || 'development') !== 'production',
};
