-- CreateTable
CREATE TABLE `order_disputes` (
    `id` INTEGER NOT NULL AUTO_INCREMENT,
    `orderId` INTEGER NOT NULL,
    `openedById` INTEGER NOT NULL,
    `reason` ENUM('NOT_RECEIVED', 'NOT_AS_DESCRIBED', 'DAMAGED', 'PAYMENT', 'NO_RESPONSE', 'OTHER') NOT NULL,
    `status` ENUM('OPEN', 'RESOLVED') NOT NULL DEFAULT 'OPEN',
    `resolution` VARCHAR(1000) NULL,
    `resolvedById` INTEGER NULL,
    `resolvedAt` DATETIME(3) NULL,
    `createdAt` DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),
    `updatedAt` DATETIME(3) NOT NULL,

    INDEX `order_disputes_orderId_createdAt_idx`(`orderId`, `createdAt`),
    INDEX `order_disputes_status_createdAt_idx`(`status`, `createdAt`),
    PRIMARY KEY (`id`)
) DEFAULT CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci;

-- CreateTable
CREATE TABLE `dispute_messages` (
    `id` INTEGER NOT NULL AUTO_INCREMENT,
    `disputeId` INTEGER NOT NULL,
    `authorId` INTEGER NOT NULL,
    `body` TEXT NOT NULL,
    `createdAt` DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),

    INDEX `dispute_messages_disputeId_createdAt_idx`(`disputeId`, `createdAt`),
    PRIMARY KEY (`id`)
) DEFAULT CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci;

-- AddForeignKey
ALTER TABLE `order_disputes` ADD CONSTRAINT `order_disputes_orderId_fkey` FOREIGN KEY (`orderId`) REFERENCES `orders`(`id`) ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE `order_disputes` ADD CONSTRAINT `order_disputes_openedById_fkey` FOREIGN KEY (`openedById`) REFERENCES `users`(`id`) ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE `order_disputes` ADD CONSTRAINT `order_disputes_resolvedById_fkey` FOREIGN KEY (`resolvedById`) REFERENCES `users`(`id`) ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE `dispute_messages` ADD CONSTRAINT `dispute_messages_disputeId_fkey` FOREIGN KEY (`disputeId`) REFERENCES `order_disputes`(`id`) ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE `dispute_messages` ADD CONSTRAINT `dispute_messages_authorId_fkey` FOREIGN KEY (`authorId`) REFERENCES `users`(`id`) ON DELETE RESTRICT ON UPDATE CASCADE;

