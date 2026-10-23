-- Admins can hide a review: it stays stored but no longer counts or shows on the shop.
-- The seller foreign key relies on the index being replaced, so it is dropped and re-added around it.
ALTER TABLE `reviews` DROP FOREIGN KEY `reviews_sellerId_fkey`;

DROP INDEX `reviews_sellerId_createdAt_idx` ON `reviews`;

ALTER TABLE `reviews` ADD COLUMN `hiddenAt` DATETIME(3) NULL,
    ADD COLUMN `hiddenReason` VARCHAR(500) NULL;

CREATE INDEX `reviews_sellerId_hiddenAt_createdAt_idx` ON `reviews`(`sellerId`, `hiddenAt`, `createdAt`);

ALTER TABLE `reviews` ADD CONSTRAINT `reviews_sellerId_fkey` FOREIGN KEY (`sellerId`) REFERENCES `users`(`id`) ON DELETE RESTRICT ON UPDATE CASCADE;
