# Phase 10: hardening review

What was checked before deploying, what was found and fixed, and what is left as a known
limit. Re-run the checks with the commands at the end.

## Security

**In place and covered by tests**

- **Authentication**
  - Passwords are hashed with argon2id.
  - When an email isn't registered, sign-in still checks a dummy hash, so the response time doesn't reveal which emails have accounts.
  - The session ID is regenerated at sign-in.
  - A password reset ends every session for the account. A password change ends all the others.
- **Session cookie:** `httpOnly`, `SameSite=Lax`, and `Secure` in production. Sessions are stored in MySQL and suspending a user ends their sessions.
- **CSRF:** every state-changing request must send the session's token in the `X-CSRF-Token` header. Tests cover a missing token and a wrong one.
- **Access control**
  - Admin and moderation routes sit behind `requireAdmin`. A test checks that normal users get 403 and guests get 401.
  - Orders, conversations, notifications, listings and reviews check who owns them. Strangers get 404, so they can't learn whether an ID exists. Each module's tests cover this.
  - Guest support tickets need the ticket's 32-byte random token.
- **SQL:** all raw queries are Prisma tagged templates, so every value is a bound parameter. No `Prisma.raw` or `$queryRawUnsafe` anywhere.
- **XSS:** React escapes all output, and there is no `dangerouslySetInnerHTML`. Email HTML escapes every value. The sign-in `?next=` redirect only allows paths on this site.
- **Headers:** helmet sets CSP (`script-src 'self'`), `nosniff`, `frame-ancestors 'self'`, HSTS and `Referrer-Policy: no-referrer`. `X-Powered-By` is off.
- **Rate limits:** on registration, sign-in, emails, support tickets, reports and messages.
- **Uploads**
  - Photos are decoded to check they really are images, whatever the file says.
  - They are re-encoded to WebP, which strips EXIF data such as GPS location, and stored under random names.
  - Limits: 10 MB per file and 8 photos per listing.
- **Dependencies:** `npm audit --omit=dev` reports 0 vulnerabilities.

**Fixed in this phase**

| Finding                                                                                                                             | Fix                                                                                                                                             |
| ----------------------------------------------------------------------------------------------------------------------------------- | ----------------------------------------------------------------------------------------------------------------------------------------------- |
| Image "decompression bombs": a small PNG claiming a huge size could make sharp decode up to ~268 megapixels (around 1 GB of memory) | The size is read from the header first and anything over 60 MP is rejected before decoding. Decoding is also capped at 60 MP, first frame only. |
| A photo with a valid header but damaged data caused a 500 error                                                                     | Now returns a 400 with "This photo could not be read".                                                                                          |
| Guest ticket links (`?token=…`) were written to the request log in full                                                             | The token is redacted from the logged URL and query. The CSRF header is redacted too.                                                           |

**Known limits (fine for v1, worth revisiting)**

- **Registration shows when an email is already registered.** Most marketplaces work this way, and registration is rate limited.
- **Rate limits are counted in memory.** That's fine for the single-server Docker setup. With more than one server they would need a shared store such as Redis.
- **Short search words (under 3 letters) match anywhere inside titles.** "tv" also matches "tvs". This is a search-quality trade-off, not a security risk.

## Accessibility and mobile

`tests/e2e/a11y.mjs` runs axe-core with the WCAG 2.1 A/AA rules on 32 pages, as a guest, buyer, seller and admin, at both phone and desktop sizes. That's 64 page checks. It also checks that no page scrolls sideways on a phone.

The first run found 70 serious or critical problems. All are now fixed, and the latest run reports 0 findings of any severity.

- **Amber stars failed contrast.** They are now SVG icons with a dark amber outline (3:1 for graphics).
- **The logo's "ed" failed contrast.** It now uses a darker amber, enough for large text.
- **Light grey `stone-400` text failed contrast.** It is now `stone-500` (4.5:1).
- **The help-centre search box had dark text on green.** It now has a white background.
- **The sign-up consent checkbox had no label.** Its text is now its label.
- **The review queue's photo links had no name.** They now read "Open photo N full size (new tab)".
- **Shop links in the admin users list were marked by colour alone.** They are now underlined.

## Search performance

`scripts/perf-search.sh` builds a separate `tzed_perf` database with 20,000 generated listings (18,000 live, 400 sellers) and times typical searches over 15 runs each.

| Query                                      | Before p50 | After p50 | After p95 |
| ------------------------------------------ | ---------: | --------: | --------: |
| Browse, newest first                       |      69 ms |     38 ms |     49 ms |
| Keyword "phone" (2,000 results)            |      77 ms |     54 ms |     66 ms |
| Two keywords "solar panel"                 |      54 ms |     33 ms |     40 ms |
| Short word "tv"                            |     290 ms |    139 ms |    178 ms |
| Keyword + available in Zambia + price in K |      66 ms |     45 ms |     49 ms |
| Category + condition, price high→low       |      84 ms |     63 ms |     91 ms |
| Deep page (page 40)                        |     102 ms |     70 ms |     83 ms |
| Suggestions "sam"                          |      11 ms |     10 ms |     17 ms |

**Changes:**

- The page of results and the two filter-count queries now run in parallel.
- The lookups before the search (rate, category, countries, seller) also run in parallel.
- Words under 3 letters are matched against titles only. Scanning every description was slow, and a two-letter substring there mostly matched inside unrelated words.

**When it will need more:**

- Short-word searches still read every title, so their time grows with the number of listings. Expect roughly 0.7 s at 100,000 listings.
- If that matters, set MySQL's `innodb_ft_min_token_size=2` in the production MySQL config and rebuild the index (`scripts/rebuild-search-index.sh`). Short words would then use the full-text index too.
- Deep pages use `OFFSET`. Pages are capped at 500, which keeps this bounded.

## Tests

API line coverage is about 95% (`npx vitest run --coverage` in `apps/api`). New tests in this phase cover:

- Deleting a listing that has orders: it is hidden, not deleted, so the order history still works.
- The last-photo guard, and a stale photo reorder.
- Oversized and corrupt images.
- Token redaction in logs.

The rest of the uncovered lines are mostly the real SMTP path and production config checks.

`tests/e2e/journey.mjs` runs the whole marketplace in a browser with brand-new accounts:

1. A Tanzanian seller registers and confirms their email.
2. They open a shop and list an item with a photo.
3. The admin approves it.
4. A Zambian buyer registers and finds it in search, priced in kwacha.
5. The buyer messages the seller and orders cross-border. The seller replies.
6. The order goes accepted → sent → paid → received → completed.
7. The buyer leaves a 4-star review.
8. The buyer reports the listing, and the admin removes it.
9. Both sides are notified, and the audit log shows the approval, the removal and the report decision.

## Re-running the checks

```bash
npm run lint && npm run typecheck && npm test   # unit + integration
scripts/e2e.sh                                   # all browser tests, incl. journey and a11y
scripts/perf-search.sh                           # search timings on 20k listings
npm audit --omit=dev                             # dependency vulnerabilities
```
