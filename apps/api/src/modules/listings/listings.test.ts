import { existsSync } from 'node:fs';
import { join } from 'node:path';
import { crc32, deflateSync } from 'node:zlib';
import sharp from 'sharp';
import request from 'supertest';
import { beforeEach, describe, expect, it } from 'vitest';
import { seedReferenceData } from '../../../prisma/seed.js';
import { createApp } from '../../app.js';
import { config } from '../../config.js';
import { prisma } from '../../db.js';
import { testClient } from '../../test/client.js';
import { resetDb } from '../../test/db.js';
import {
  categories,
  createSeller,
  createUser,
  testImage,
  TEST_PASSWORD,
} from '../../test/factories.js';

const app = createApp();

async function signIn(email: string) {
  const client = await testClient(app);
  expect((await client.post('/auth/login', { email, password: TEST_PASSWORD })).status).toBe(200);
  return client;
}

async function sellerClient(countryCode: 'TZ' | 'ZM' = 'TZ') {
  const { user, region } = await createSeller(countryCode);
  return { user, region, client: await signIn(user.email) };
}

async function listingInput(regionId: number, overrides: Record<string, unknown> = {}) {
  const { leafId } = await categories();
  return {
    title: 'Samsung Galaxy A15',
    description: 'Brand new in box, 128GB, black, with charger.',
    categoryId: leafId,
    condition: 'NEW',
    price: 380000,
    quantity: 2,
    regionId,
    town: 'Kariakoo',
    deliveryPickup: true,
    deliveryLocal: false,
    crossBorder: false,
    ...overrides,
  };
}

type Client = Awaited<ReturnType<typeof testClient>>;

async function uploadPhoto(client: Client, id: number, image?: Buffer) {
  const csrf = (await client.get('/auth/csrf')).body.csrfToken;
  return client.agent
    .post(`/api/v1/listings/${id}/images`)
    .set('X-CSRF-Token', csrf)
    .attach('images', image ?? (await testImage()), 'photo.png');
}

/** Creates a listing and makes it live (as if an admin approved it). */
async function liveListing(client: Client, regionId: number) {
  const created = await client.post('/listings', await listingInput(regionId));
  const id = created.body.listing.id as number;
  await uploadPhoto(client, id);
  await prisma.listing.update({
    where: { id },
    data: { status: 'ACTIVE', publishedAt: new Date() },
  });
  return id;
}

/** A PNG that claims the given size but holds only a few bytes of pixel data. */
function pngHeader(width: number, height: number) {
  const chunk = (type: string, data: Buffer) => {
    const body = Buffer.concat([Buffer.from(type), data]);
    const out = Buffer.alloc(body.length + 8);
    out.writeUInt32BE(data.length, 0);
    body.copy(out, 4);
    out.writeUInt32BE(crc32(body), body.length + 4);
    return out;
  };
  const ihdr = Buffer.alloc(13);
  ihdr.writeUInt32BE(width, 0);
  ihdr.writeUInt32BE(height, 4);
  ihdr.set([8, 2, 0, 0, 0], 8); // 8-bit RGB
  return Buffer.concat([
    Buffer.from([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a]),
    chunk('IHDR', ihdr),
    chunk('IDAT', deflateSync(Buffer.alloc(64))),
    chunk('IEND', Buffer.alloc(0)),
  ]);
}

beforeEach(async () => {
  await resetDb();
  await seedReferenceData(prisma);
});

describe('GET /categories', () => {
  it('returns the category tree', async () => {
    const res = await request(app).get('/api/v1/categories');
    expect(res.status).toBe(200);
    const electronics = res.body.categories.find((c: { slug: string }) => c.slug === 'electronics');
    expect(electronics.children.map((c: { slug: string }) => c.slug)).toContain('phones-tablets');
  });
});

describe('creating listings', () => {
  it('requires a confirmed email and a seller profile', async () => {
    const unverified = await createUser({ emailVerifiedAt: null });
    let client = await signIn(unverified.email);
    let res = await client.post('/listings', await listingInput(1));
    expect(res.body.error.code).toBe('EMAIL_NOT_VERIFIED');

    const noProfile = await createUser();
    client = await signIn(noProfile.email);
    res = await client.post('/listings', await listingInput(1));
    expect(res.body.error.code).toBe('NO_SELLER_PROFILE');
  });

  it("creates a draft priced in the seller's currency, available in their country only", async () => {
    const { client, region } = await sellerClient('TZ');
    const res = await client.post('/listings', await listingInput(region.id, { price: 1999.6 }));
    expect(res.status).toBe(201);
    expect(res.body.listing).toMatchObject({
      status: 'DRAFT',
      currency: 'TZS',
      price: 2000, // whole shillings
      countryCode: 'TZ',
      shipTo: ['TZ'],
      crossBorder: false,
      isOwner: true,
    });
  });

  it('keeps ngwee for kwacha prices and opens cross-border listings to both countries', async () => {
    const { client, region } = await sellerClient('ZM');
    const res = await client.post(
      '/listings',
      await listingInput(region.id, { price: 1250.555, crossBorder: true }),
    );
    expect(res.body.listing).toMatchObject({ currency: 'ZMW', price: 1250.56, crossBorder: true });
    expect(res.body.listing.shipTo.sort()).toEqual(['TZ', 'ZM']);
  });

  it('rejects a parent category, a region in the other country and no delivery option', async () => {
    const { client, region } = await sellerClient('TZ');
    const { parentId } = await categories();
    const lusaka = await prisma.region.findFirstOrThrow({ where: { name: 'Lusaka' } });

    let res = await client.post(
      '/listings',
      await listingInput(region.id, { categoryId: parentId }),
    );
    expect(res.body.error.details.fields.categoryId).toMatch(/more specific/);

    res = await client.post('/listings', await listingInput(lusaka.id));
    expect(res.body.error.details.fields.regionId).toBeDefined();

    res = await client.post('/listings', await listingInput(region.id, { deliveryPickup: false }));
    expect(res.status).toBe(400);
    expect(res.body.error.details.fields.deliveryPickup).toBeDefined();
  });
});

describe('visibility', () => {
  it('hides drafts from the public and other users, but not from the owner', async () => {
    const { client, region } = await sellerClient();
    const id = (await client.post('/listings', await listingInput(region.id))).body.listing.id;

    expect((await request(app).get(`/api/v1/listings/${id}`)).status).toBe(404);
    const other = await signIn((await createUser()).email);
    expect((await other.get(`/listings/${id}`)).status).toBe(404);
    expect((await client.get(`/listings/${id}`)).status).toBe(200);
  });

  it('shows live listings to everyone, without moderation details', async () => {
    const { client, region } = await sellerClient();
    const id = await liveListing(client, region.id);
    const res = await request(app).get(`/api/v1/listings/${id}`);
    expect(res.status).toBe(200);
    expect(res.body.listing).toMatchObject({
      isOwner: false,
      submittedAt: null,
      rejectionReason: null,
    });
    expect(res.body.listing.seller.shopName).toMatch(/Shop$/);
  });
});

describe('photos', () => {
  it('stores a resized full image and thumbnail as WebP, without metadata', async () => {
    const { client, region } = await sellerClient();
    const id = (await client.post('/listings', await listingInput(region.id))).body.listing.id;
    const withExif = await sharp(await testImage(3000, 2000, 'jpeg'))
      .withMetadata({ exif: { IFD0: { Copyright: 'secret-gps' } } })
      .jpeg()
      .toBuffer();

    const res = await uploadPhoto(client, id, withExif);
    expect(res.status).toBe(201);
    const [image] = res.body.listing.images;
    expect(image).toMatchObject({ width: 1600, height: 1067 });
    expect(image.url).toMatch(/^\/uploads\/listings\/\d+\/[\w-]+-full\.webp$/);

    const file = join(config.UPLOAD_DIR, image.url.replace('/uploads/', ''));
    expect(existsSync(file)).toBe(true);
    expect(existsSync(file.replace('-full', '-thumb'))).toBe(true);
    const meta = await sharp(file).metadata();
    expect(meta.format).toBe('webp');
    expect(meta.exif).toBeUndefined();

    const served = await request(app).get(image.thumbUrl);
    expect(served.status).toBe(200);
    expect(served.headers['content-type']).toBe('image/webp');
  });

  it('rejects files that are not images, and more than 8 photos', async () => {
    const { client, region } = await sellerClient();
    const id = (await client.post('/listings', await listingInput(region.id))).body.listing.id;
    const fake = await uploadPhoto(client, id, Buffer.from('<?php echo "hi"; ?>'));
    expect(fake.status).toBe(400);

    // A tiny file whose header claims 20000 × 20000 pixels ("decompression bomb").
    const bomb = await uploadPhoto(client, id, pngHeader(20_000, 20_000));
    expect(bomb.status).toBe(400);
    expect(bomb.body.error.message).toMatch(/too large/);
    // A real JPEG cut short.
    const jpeg = await sharp(await testImage(400, 300))
      .jpeg()
      .toBuffer();
    const broken = await uploadPhoto(client, id, jpeg.subarray(0, jpeg.length / 2));
    expect(broken.status).toBe(400);

    for (let i = 0; i < 8; i++)
      expect((await uploadPhoto(client, id, await testImage(100, 100))).status).toBe(201);
    const ninth = await uploadPhoto(client, id, await testImage(100, 100));
    expect(ninth.status).toBe(400);
    expect(ninth.body.error.message).toMatch(/at most 8/);
  });

  it('only lets the owner upload, reorder and delete photos', async () => {
    const { client, region } = await sellerClient();
    const id = (await client.post('/listings', await listingInput(region.id))).body.listing.id;
    await uploadPhoto(client, id);
    const listing = (await uploadPhoto(client, id)).body.listing;
    const [a, b] = listing.images.map((i: { id: number }) => i.id);

    const other = await signIn((await createUser()).email);
    expect((await uploadPhoto(other, id)).status).toBe(403);

    const reordered = await client.put(`/listings/${id}/images/order`, { imageIds: [b, a] });
    expect(reordered.body.listing.images.map((i: { id: number }) => i.id)).toEqual([b, a]);
    expect(reordered.body.listing.coverImage.id).toBe(b);

    const after = await client.delete(`/listings/${id}/images/${a}`);
    expect(after.body.listing.images).toHaveLength(1);
  });
});

describe('review workflow (seller side)', () => {
  it('needs a photo before submitting, then waits for review', async () => {
    const { client, region } = await sellerClient();
    const id = (await client.post('/listings', await listingInput(region.id))).body.listing.id;
    expect((await client.post(`/listings/${id}/submit`)).body.error.message).toMatch(/photo/);

    await uploadPhoto(client, id);
    const res = await client.post(`/listings/${id}/submit`);
    expect(res.body.listing.status).toBe('PENDING_REVIEW');
    expect(
      await prisma.listingReviewEvent.count({ where: { listingId: id, decision: 'SUBMITTED' } }),
    ).toBe(1);
    expect((await client.post(`/listings/${id}/submit`)).status).toBe(409);
  });

  it('sends a live listing back for review when its content changes', async () => {
    const { client, region } = await sellerClient();
    const id = await liveListing(client, region.id);

    const qty = await client.patch(`/listings/${id}`, { quantity: 5 });
    expect(qty.body).toMatchObject({
      sentForReview: false,
      listing: { status: 'ACTIVE', quantity: 5 },
    });

    const samePrice = await client.patch(`/listings/${id}`, { price: 380000 });
    expect(samePrice.body.listing.status).toBe('ACTIVE');

    const title = await client.patch(`/listings/${id}`, { title: 'Samsung Galaxy A15 (sealed)' });
    expect(title.body).toMatchObject({
      sentForReview: true,
      listing: { status: 'PENDING_REVIEW' },
    });
    expect((await request(app).get(`/api/v1/listings/${id}`)).status).toBe(404);
  });

  it('sends a live listing back for review when photos are added', async () => {
    const { client, region } = await sellerClient();
    const id = await liveListing(client, region.id);
    const res = await uploadPhoto(client, id);
    expect(res.body).toMatchObject({ sentForReview: true, listing: { status: 'PENDING_REVIEW' } });
  });

  it('keeps at least one delivery option when updating', async () => {
    const { client, region } = await sellerClient();
    const id = (await client.post('/listings', await listingInput(region.id))).body.listing.id;
    const res = await client.patch(`/listings/${id}`, { deliveryPickup: false });
    expect(res.status).toBe(400);
  });

  it('can mark a live listing sold and available again', async () => {
    const { client, region } = await sellerClient();
    const id = await liveListing(client, region.id);
    expect((await client.post(`/listings/${id}/mark-sold`)).body.listing.status).toBe('SOLD');
    expect((await request(app).get(`/api/v1/listings/${id}`)).status).toBe(200); // sold items stay viewable
    expect((await client.post(`/listings/${id}/mark-available`)).body.listing.status).toBe(
      'ACTIVE',
    );
  });

  it('deletes a listing and its photo files', async () => {
    const { client, region } = await sellerClient();
    const id = (await client.post('/listings', await listingInput(region.id))).body.listing.id;
    await uploadPhoto(client, id);
    expect(existsSync(join(config.UPLOAD_DIR, 'listings', String(id)))).toBe(true);
    expect((await client.delete(`/listings/${id}`)).status).toBe(204);
    expect(await prisma.listing.count({ where: { id } })).toBe(0);
    expect(existsSync(join(config.UPLOAD_DIR, 'listings', String(id)))).toBe(false);
  });

  it('keeps a listing that was ordered, hidden, so the order history still works', async () => {
    const { client, region } = await sellerClient();
    const id = await liveListing(client, region.id);
    const buyer = await signIn((await createUser({ countryCode: 'TZ' })).email);
    const orderId = (
      await buyer.post('/orders', { listingId: id, quantity: 1, deliveryMethod: 'PICKUP' })
    ).body.order.id;

    expect((await client.delete(`/listings/${id}`)).status).toBe(204);
    expect((await prisma.listing.findUniqueOrThrow({ where: { id } })).status).toBe('REMOVED');
    expect((await request(app).get(`/api/v1/listings/${id}`)).status).toBe(404);
    expect(existsSync(join(config.UPLOAD_DIR, 'listings', String(id)))).toBe(true);
    const order = await buyer.get(`/orders/${orderId}`);
    expect(order.status).toBe(200);
    expect(order.body.order.title).toBe('Samsung Galaxy A15');
  });

  it("won't remove the only photo of a submitted listing or apply an out-of-date photo order", async () => {
    const { client, region } = await sellerClient();
    const id = await liveListing(client, region.id);
    const [only] = (await client.get(`/listings/${id}`)).body.listing.images;
    expect((await client.delete(`/listings/${id}/images/${only.id}`)).status).toBe(400);
    expect(
      (await client.put(`/listings/${id}/images/order`, { imageIds: [only.id, only.id + 999] }))
        .status,
    ).toBe(400);
    expect((await client.delete(`/listings/${id}/images/${only.id + 999}`)).status).toBe(404);
  });

  it("lists the seller's own listings with counts per status", async () => {
    const { client, region } = await sellerClient();
    await client.post('/listings', await listingInput(region.id));
    await liveListing(client, region.id);
    const res = await client.get('/listings/mine');
    expect(res.body.listings).toHaveLength(2);
    expect(res.body.counts).toEqual({ DRAFT: 1, ACTIVE: 1 });
    expect((await client.get('/listings/mine?status=ACTIVE')).body.listings).toHaveLength(1);
  });
});
