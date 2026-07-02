// Generates prisma/schema.prod.prisma from schema.prisma with the datasource
// provider switched to PostgreSQL. Keeps a single source of truth for the models
// (dev uses SQLite, production uses Postgres — models are identical).
import { readFileSync, writeFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import path from 'node:path';

const dir = path.dirname(fileURLToPath(import.meta.url));
const src = readFileSync(path.join(dir, 'schema.prisma'), 'utf8');
const out = src.replace(/provider\s*=\s*"sqlite"/, 'provider = "postgresql"');
writeFileSync(path.join(dir, 'schema.prod.prisma'), out);
console.log('Wrote schema.prod.prisma (provider = postgresql)');
