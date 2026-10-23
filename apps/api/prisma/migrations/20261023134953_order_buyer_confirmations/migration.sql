-- AlterTable
ALTER TABLE `orders` ADD COLUMN `buyerPaidAt` DATETIME(3) NULL,
    ADD COLUMN `receivedAt` DATETIME(3) NULL;
