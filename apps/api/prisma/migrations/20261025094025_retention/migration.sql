-- AlterTable
ALTER TABLE `users` ADD COLUMN `dormantWarnedAt` DATETIME(3) NULL,
    ADD COLUMN `lastActiveAt` DATETIME(3) NULL;
