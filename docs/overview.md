# TZed: what's built so far

A marketplace for buyers and sellers in **Tanzania and Zambia**, in **English and Swahili**,
with listings reviewed before they go live, orders across the border, and tools for the TZed
team. This page is the whole picture; `PLAN.md` §7 is the to-do list.

## How it fits together

- **Web app** (`apps/web`): React, works on phones first, English and Swahili.
- **API** (`apps/api`): Node and Express, MySQL database, 22 modules.
- **Shared rules** (`packages/shared`): the same form checks and data shapes on both sides.
- **Production:** one Docker image plus MySQL, with backups, restore and a deploy guide
  (`docs/deploy.md`).

## Modules, by who uses them

### Everyone (guests)

| Module                                   | What it does                                                                                                                              |
| ---------------------------------------- | ----------------------------------------------------------------------------------------------------------------------------------------- |
| Browse and search (`search`, `listings`) | Search by words, category, country, price, condition and delivery; sort; listing pages with photos, seller details and delivery estimates |
| Currency (`geo`)                         | Prices shown in TSh or ZMW with the exchange rate set by admins (1 ZMW = 131.04 TZS); a converter page                                    |
| Shops (`trust`, `reviews`)               | Shop pages with rating, reviews, reply time, completed orders, member since and the "Verified seller" badge                               |
| Help centre (`help`, `support`)          | Articles (prohibited items, customs, safety…), a contact form, and private ticket links for guests                                        |
| Recently viewed                          | Kept in the browser only, shown on the home page                                                                                          |
| Language                                 | English or Swahili, remembered; server messages and emails follow it                                                                      |
| Legal                                    | Terms of use and privacy policy (drafts for legal review)                                                                                 |

### Buyers

| Module                               | What it does                                                                                                                                                                  |
| ------------------------------------ | ----------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| Accounts (`auth`, `users`)           | Sign up, confirm email, sign in, reset password, edit profile, change password, download my data, delete account                                                              |
| Saved items (`saved`)                | Heart a listing; get a notification when its price drops                                                                                                                      |
| Cart (`cart`)                        | Items from several sellers; one checkout creates one order per seller, all or nothing                                                                                         |
| Orders (`orders`)                    | Place an order, see its status and history, "I've paid", "I received it", cancel; customs acknowledgement for cross-border orders; seller contact details shown once accepted |
| Problem with this order (`disputes`) | Report a problem (not received, not as described, damaged, payment, no response); one conversation with the seller and TZed until resolved                                    |
| Messages (`messaging`)               | Chat with a seller about a listing; email for the first unread message                                                                                                        |
| Reviews (`reviews`)                  | Rate the seller once an order is completed                                                                                                                                    |
| Reports (`reports`)                  | Report a listing, user or message                                                                                                                                             |
| Notifications (`notifications`)      | Bell with counts, a notifications page, and emails for the important ones                                                                                                     |

### Sellers

| Module                                    | What it does                                                                                                                                         |
| ----------------------------------------- | ---------------------------------------------------------------------------------------------------------------------------------------------------- |
| Seller profile (`users`)                  | Shop name, town, region, description                                                                                                                 |
| Listings and photos (`listings`, `media`) | Create, edit, submit for review, mark sold, up to 8 photos (resized, location data removed), delivery options and countries, delivery-time estimates |
| Review before going live (`moderation`)   | Every new listing or price change waits for approval; a rejection says what to fix                                                                   |
| Orders                                    | Accept or decline, mark ready, record payment, complete; one place for open orders                                                                   |
| Shop analytics (`analytics`)              | Views, cart adds, orders and sales per listing (numbers only)                                                                                        |

### TZed team (admins)

| Module                                   | What it does                                                                                    |
| ---------------------------------------- | ----------------------------------------------------------------------------------------------- |
| Dashboard                                | What needs attention: listings to review, reports, tickets, problems                            |
| Review queue                             | Approve or reject listings                                                                      |
| Problems                                 | Read both sides, reply, resolve with an outcome                                                 |
| Reports                                  | Dismiss, remove content, or suspend; the people involved are told                               |
| Support tickets                          | Reply and close                                                                                 |
| Users, listings, reviews                 | Search, suspend or reinstate, remove or restore, hide reviews, verify sellers                   |
| Exchange rate, categories, help articles | Keep reference data up to date; large rate changes need confirming                              |
| Marketplace analytics                    | Sales, orders, users, listings, views and cart adds by country, plus top categories and sellers |
| Audit log (`audit`)                      | Every admin action, with who, when and before/after                                             |

### Behind the scenes

| Piece                             | What it does                                                                                                                                                                                                                                                                                |
| --------------------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| Security                          | Two-step sign-in with an authenticator app (required for admins, optional for everyone, backup codes), hashed passwords, sessions in the database, CSRF protection, rate limits on sign-in and forms, security headers, a suspended user is signed out at once (`docs/hardening-review.md`) |
| Server language (`lib/i18n`)      | Errors, notifications and emails in each person's language                                                                                                                                                                                                                                  |
| Data retention (`jobs/retention`) | Daily: old sessions, links, notifications and stats removed; IPs trimmed; unused accounts warned, then closed                                                                                                                                                                               |
| Health check (`health`)           | For uptime monitoring                                                                                                                                                                                                                                                                       |
| Backups                           | Database and photos, with a tested restore                                                                                                                                                                                                                                                  |

## Data protection

- **Policy:** no national ID numbers, ID photos, card numbers or mobile money PINs are
  collected.
- **Already built:**
  - Contact details shared only after an order is accepted.
  - Download my data, and account deletion.
  - Retention periods applied automatically.
- **Plan for both countries' laws:** `docs/data-protection.md`.

## Quality checks

- **Automated tests:** shared rules 26, API 175, web 83.
- **Browser tests** (`scripts/e2e.sh`): sign-up and sign-in, listing, search, messaging, order,
  cart, review, support, problem, admin, and a whole buyer-and-seller journey.
- **Accessibility and phone-layout check:** 74 pages (WCAG 2.1 AA rules, no sideways scrolling
  on phones), in English and Swahili.
- **Production smoke test** against the Docker image.

## Not built yet

See `PLAN.md` §7. The main items:

- **Online payments with escrow:** money is paid offline today.
- **SMS phone check.**
- **Launch prerequisites:** the hosting country, regulator registration, and legal review of
  the terms and privacy policy.
