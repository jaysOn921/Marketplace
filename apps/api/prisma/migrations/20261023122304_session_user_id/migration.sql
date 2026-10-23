-- AlterTable
ALTER TABLE `sessions` ADD COLUMN `userId` INTEGER NULL;

-- CreateIndex
CREATE INDEX `sessions_userId_idx` ON `sessions`(`userId`);
