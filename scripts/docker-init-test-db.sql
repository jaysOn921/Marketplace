-- Runs once when the dev MySQL container is first created.
CREATE DATABASE IF NOT EXISTS `tzed_test` CHARACTER SET utf8mb4 COLLATE utf8mb4_0900_ai_ci;
GRANT ALL PRIVILEGES ON `tzed_test`.* TO 'tzed'@'%';
-- Prisma Migrate creates and drops a temporary shadow database named prisma_migrate_shadow_db_*.
GRANT CREATE, DROP ON *.* TO 'tzed'@'%';
GRANT ALL PRIVILEGES ON `prisma\_migrate\_shadow\_db\_%`.* TO 'tzed'@'%';
FLUSH PRIVILEGES;
