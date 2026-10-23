-- Runs once when the dev MySQL container is first created.
CREATE DATABASE IF NOT EXISTS `tzed_test` CHARACTER SET utf8mb4 COLLATE utf8mb4_0900_ai_ci;
GRANT ALL PRIVILEGES ON `tzed_test`.* TO 'tzed'@'%';
-- Prisma Migrate needs to create a temporary shadow database.
GRANT CREATE, DROP ON *.* TO 'tzed'@'%';
FLUSH PRIVILEGES;
