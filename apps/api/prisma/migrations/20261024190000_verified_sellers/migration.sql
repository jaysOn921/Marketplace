-- AlterTable
ALTER TABLE `seller_profiles` ADD COLUMN `verifiedAt` DATETIME(3) NULL,
    ADD COLUMN `verifiedNote` VARCHAR(500) NULL;

