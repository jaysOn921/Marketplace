// Runs the retention job once, e.g. from a scheduler instead of the API process: npm run retention -w @tzed/api
import { prisma } from '../db.js';
import { runRetention } from './retention.js';

try {
  console.log(await runRetention());
} finally {
  await prisma.$disconnect();
}
