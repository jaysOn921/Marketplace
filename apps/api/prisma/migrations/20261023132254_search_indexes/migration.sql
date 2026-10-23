-- CreateIndex
CREATE INDEX `listings_status_publishedAt_idx` ON `listings`(`status`, `publishedAt`);

-- CreateIndex
CREATE INDEX `listings_status_currency_price_idx` ON `listings`(`status`, `currency`, `price`);
