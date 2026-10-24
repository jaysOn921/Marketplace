-- AlterTable
ALTER TABLE `listings` ADD COLUMN `crossBorderDaysMax` SMALLINT NULL,
    ADD COLUMN `crossBorderDaysMin` SMALLINT NULL,
    ADD COLUMN `localDaysMax` SMALLINT NULL,
    ADD COLUMN `localDaysMin` SMALLINT NULL;

-- AlterTable
ALTER TABLE `orders` ADD COLUMN `deliveryDaysMax` SMALLINT NULL,
    ADD COLUMN `deliveryDaysMin` SMALLINT NULL;

