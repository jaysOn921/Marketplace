-- AlterTable
ALTER TABLE `listings` ADD COLUMN `approvedPrice` DECIMAL(14, 2) NULL;


-- Live listings were approved at their current price.
UPDATE `listings` SET `approvedPrice` = `price` WHERE `publishedAt` IS NOT NULL;
