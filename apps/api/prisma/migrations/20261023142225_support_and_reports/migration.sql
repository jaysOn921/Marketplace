-- AlterTable
ALTER TABLE `messages` ADD COLUMN `removedAt` DATETIME(3) NULL;

-- AlterTable
ALTER TABLE `support_tickets` ADD COLUMN `accessTokenHash` CHAR(64) NULL;

-- CreateIndex
CREATE UNIQUE INDEX `support_tickets_accessTokenHash_key` ON `support_tickets`(`accessTokenHash`);

