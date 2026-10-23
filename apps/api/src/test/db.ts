import { prisma } from '../db.js';

/**
 * Empties every table (except the migrations table) so each test starts clean.
 * DELETE rather than TRUNCATE: on small tables it is far faster (TRUNCATE recreates the table).
 */
export async function resetDb() {
  const tables = await prisma.$queryRaw<{ name: string }[]>`
    SELECT TABLE_NAME AS name FROM information_schema.TABLES
    WHERE TABLE_SCHEMA = DATABASE() AND TABLE_NAME <> '_prisma_migrations'`;
  await prisma.$transaction([
    prisma.$executeRawUnsafe('SET FOREIGN_KEY_CHECKS = 0'),
    ...tables.map((t) => prisma.$executeRawUnsafe(`DELETE FROM \`${t.name}\``)),
    prisma.$executeRawUnsafe('SET FOREIGN_KEY_CHECKS = 1'),
  ]);
}
