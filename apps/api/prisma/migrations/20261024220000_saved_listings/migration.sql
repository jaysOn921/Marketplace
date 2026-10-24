-- CreateTable
CREATE TABLE `saved_listings` (
    `userId` INTEGER NOT NULL,
    `listingId` INTEGER NOT NULL,
    `createdAt` DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),

    INDEX `saved_listings_listingId_idx`(`listingId`),
    INDEX `saved_listings_userId_createdAt_idx`(`userId`, `createdAt`),
    PRIMARY KEY (`userId`, `listingId`)
) DEFAULT CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci;

-- AddForeignKey
ALTER TABLE `saved_listings` ADD CONSTRAINT `saved_listings_userId_fkey` FOREIGN KEY (`userId`) REFERENCES `users`(`id`) ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE `saved_listings` ADD CONSTRAINT `saved_listings_listingId_fkey` FOREIGN KEY (`listingId`) REFERENCES `listings`(`id`) ON DELETE CASCADE ON UPDATE CASCADE;

