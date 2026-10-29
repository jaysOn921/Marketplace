-- AlterTable
ALTER TABLE `users` ADD COLUMN `twoStepEnabledAt` DATETIME(3) NULL,
    ADD COLUMN `twoStepLastStep` INTEGER NULL,
    ADD COLUMN `twoStepSecret` VARCHAR(255) NULL;

-- CreateTable
CREATE TABLE `two_step_backup_codes` (
    `id` INTEGER NOT NULL AUTO_INCREMENT,
    `userId` INTEGER NOT NULL,
    `codeHash` CHAR(64) NOT NULL,
    `usedAt` DATETIME(3) NULL,

    INDEX `two_step_backup_codes_userId_idx`(`userId`),
    PRIMARY KEY (`id`)
) DEFAULT CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci;

-- AddForeignKey
ALTER TABLE `two_step_backup_codes` ADD CONSTRAINT `two_step_backup_codes_userId_fkey` FOREIGN KEY (`userId`) REFERENCES `users`(`id`) ON DELETE CASCADE ON UPDATE CASCADE;
