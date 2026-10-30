# Data protection: Tanzania and Zambia

How TZed stays compliant with the **Tanzania Personal Data Protection Act, 2022** (Act No. 11 of
2022, now Cap. 44 R.E. 2023, with the Personal Data Protection Regulations of 2023) and the
**Zambia Data Protection Act, 2021** (Act No. 3 of 2021), with a focus on sellers' personal
information.

> **Not legal advice.** This was put together from the Acts as summarised by law firms and
> regulators (sources at the end). The official texts could not be downloaded from the build
> environment, and secondary sources disagree on some numbers (marked _verify_). Have a
> Tanzanian and a Zambian advocate confirm it before launch, and re-check with the PDPC and
> ODPC, whose rules and deadlines are still moving.

## 1. Why both laws apply

- TZed decides why and how buyer and seller data is processed, so it is a **data controller**
  under both Acts. Our hosting, email and (later) payment providers are **data processors**.
- Tanzania's Act covers processing in Tanzania and of Tanzanian residents' data; Zambia's covers
  processing in Zambia and of data subjects there. Every cross-border order shares a Tanzanian's
  data with a Zambian (and the reverse), so **both apply to the same platform**.
- Both regulators are now enforcing:
  - **Tanzania (PDPC):** the voluntary registration window closed on 8 April 2026; fines from
    9 April 2026; nationwide on-site inspections began 28 August 2026.
  - **Zambia (ODPC):** registration was due by 30 April 2025.

## 2. What we hold about sellers (data map)

| Data                                              | Where                           | Who sees it                                                                                                                                                                  | Why (lawful basis)                                              |
| ------------------------------------------------- | ------------------------------- | ---------------------------------------------------------------------------------------------------------------------------------------------------------------------------- | --------------------------------------------------------------- |
| Name, email, password hash, country, consent time | `users`                         | Seller, admins                                                                                                                                                               | Contract (an account)                                           |
| Phone number                                      | `users.phone`                   | The other party of an accepted order **only if the person chose to share it** (sellers: shop contact preference; buyers: `users.sharePhoneOnOrders`, off by default), admins | Consent (an opt-in setting), for arranging delivery and payment |
| Shop name, bio, town, region                      | `seller_profiles`               | Public                                                                                                                                                                       | Contract; the seller publishes it                               |
| Verified-seller check and admin note              | `seller_profiles.verified*`     | Public badge; note admin-only                                                                                                                                                | Legitimate interest (fraud prevention); see §5                  |
| Listings and photos                               | `listings`, uploads             | Public                                                                                                                                                                       | Contract                                                        |
| Orders, order events, buyer and delivery notes    | `orders*`                       | Buyer, seller, admins                                                                                                                                                        | Contract; tax and accounting records                            |
| Messages, problem threads                         | `messages`, `order_disputes`    | The parties, admins (on report or problem)                                                                                                                                   | Contract; legitimate interest (safety, disputes)                |
| Reviews received                                  | `reviews`                       | Public                                                                                                                                                                       | Legitimate interest (marketplace trust)                         |
| Shop analytics (views, cart adds)                 | `analytics` tables              | Seller, admins                                                                                                                                                               | Legitimate interest; no buyer identities shown                  |
| Audit log with IP address and user agent          | `audit_logs`                    | Admins                                                                                                                                                                       | Legitimate interest (security); legal obligation                |
| Session cookie, CSRF cookie                       | `sessions`                      | —                                                                                                                                                                            | Strictly necessary                                              |
| Language, notification history                    | `users.locale`, `notifications` | Seller                                                                                                                                                                       | Contract                                                        |

Photo upload re-encodes every image (sharp), which drops EXIF metadata such as GPS location.
That matters because sellers often photograph items at home. Keep it that way.

**Sensitive data.** We hold none on purpose. Sensitive data includes health, ethnicity, religion,
biometrics, children's data, and (in Zambia) financial details and judicial matters. Two things
to watch:

- **Policy: TZed does not collect national ID numbers (NIDA, NRC), passport numbers, TINs,
  ID photos or selfies.** No form asks for them, and admins and support never request them
  in messages or tickets.
  - If one is ever needed, it is sensitive or biometric data, and under Zambia s.70(3) it
    **must be stored on a server in Zambia**.
  - That means a new impact assessment and a licensed identity provider first, not a field
    in our database.
- **Payment and mobile-money details** are treated as sensitive financial data in Zambia.

Keep those with a licensed provider (identity or payment) rather than in our database.

## 3. Duties side by side

| Duty                       | Tanzania (PDPA 2022)                                                                                                                                         | Zambia (DPA 2021)                                                                                                                                                                                                            |
| -------------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------ | ---------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| Register before processing | Yes, with the PDPC. Valid **5 years** (s.14 bars processing without it)                                                                                      | Yes, with the ODPC (s.19). Certificate valid **1 year**; report changes **within 7 days**                                                                                                                                    |
| Data protection officer    | Required (s.27(3); scope debated, so appoint one)                                                                                                            | Required under ODPC guidelines (s.48, _verify_)                                                                                                                                                                              |
| Lawful basis and consent   | Consent, contract, legal duty, legitimate interest and similar; written consent for sensitive data                                                           | Similar; consent must be specific, informed and withdrawable; extra rules for sensitive data and children                                                                                                                    |
| Notice at collection       | Tell people the purpose, recipients, transfers and their rights                                                                                              | Same                                                                                                                                                                                                                         |
| Rights                     | Access, correction, blocking/erasure (s.38), objection, stop direct marketing, no solely automated decisions, complain to the PDPC                           | Access, rectification, erasure, objection, portability, automated decisions, complain to the ODPC                                                                                                                            |
| Security                   | Appropriate technical and organisational measures                                                                                                            | Same; impact assessment for high-risk processing                                                                                                                                                                             |
| Breach notification        | To the PDPC **without undue delay** (s.27(5)); the 72-hour figure some guides quote is unconfirmed                                                           | To the Commissioner **within 24 hours** (s.49, _verify_); to affected people as soon as practicable                                                                                                                          |
| Data leaving the country   | Only with adequate protection or safeguards, and a **PDPC permit** (s.31–32)                                                                                 | **Localisation:** store and process on a server in Zambia (s.70(1)); sensitive data always (s.70(3)). Transfers otherwise only with consent plus approved contract clauses, or with Minister or Commissioner approval (s.71) |
| Penalties                  | Enforcement notices up to **TZS 100 million**; criminal fines reported **up to TZS 5 billion** and up to 10 years' prison; officers can be personally liable | Up to **100 million penalty units or 2% of turnover** for companies (s.18); unregistered processing up to 500,000 penalty units and/or 5 years (s.19)                                                                        |

**The two hardest points:**

1. Zambia's **localisation rule**: TZed's one database would have to be in Zambia, or hold
   Zambian data there.
2. Tanzania's **transfer permit**: sending Tanzanian data to Zambia, or to any foreign cloud,
   needs PDPC approval.

## 4. The cross-border and hosting problem, and how to solve it

A single MySQL database in, say, a European cloud region would breach Zambia s.70 for Zambian
users and need a Tanzanian transfer permit for Tanzanians. Options, from simplest:

1. **Host in Zambia and apply for a Tanzanian transfer permit (recommended first step).**
   - Put the whole platform (database, uploads, backups) in a Zambian data centre. That
     satisfies s.70 for Zambian users.
   - Apply to the PDPC for permission to transfer Tanzanian users' data to Zambia, backed by a
     data processing agreement with the host.
   - Both countries are in SADC; the PDPC weighs whether the destination has adequate law, and
     Zambia does.
2. **Host in Tanzania and seek ODPC authorisation (s.71).** For Zambian data held in Tanzania,
   obtain consent plus Commissioner-approved contract clauses.
   - Risk: s.70 suggests Zambian data must be stored in Zambia unless the Minister has
     prescribed categories that may go abroad. We could not confirm that any have been
     prescribed, so this route depends on a ruling.
3. **Two regional stores (most robust, most work).** Keep each user's personal data in their
   own country and share only what an order needs (name, phone, town) across the border.
   - Each cross-border order is then a narrow, documented transfer of the minimum data.
   - Consider this if the regulators refuse options 1 or 2.

**Whichever option you choose:**

- **Email.** Pick an email provider that will sign a data processing agreement, and list it as
  a transfer. Every email leaves the country.
- **Backups.** Keep backups in the same country as the primary data (`scripts/backup` already
  writes inside the repo setup; point it at in-country storage in production).
- **Admin access.** Do not use third-party analytics or crash reporting that ships personal data
  abroad without listing it. The current analytics are first-party and stay in our database.

## 5. Sellers specifically

1. **Public vs private.**
   - Public: shop name, town, bio, listings, reviews.
   - Private until an order is accepted: name, phone, email.
   - This is already how the platform works. Say so plainly in the seller notice.
2. **Purpose limitation.** A seller who gets a buyer's phone number may use it only for that
   order. The seller terms must say so, and misuse should be reportable (the report flow exists).
   - This matters because sellers become **controllers themselves** for the buyer data they
     receive.
   - **Done:** masked contact. Numbers are private by default and shared only by the person's own choice; emails are never shown; everyone can talk in TZed messages on each order, and a tip appears when a number or email is typed into a message.
3. **Verification, without ID documents.** The "Verified seller" badge rests on checks that
   need no ID on TZed:
   - **Track record:** completed orders, reviews, reply time and account age (already shown).
   - **Contact check:** a working phone number and confirmed email.
   - **Visible business details:** a registered business name or licence the seller chooses
     to show. These are business records, not personal ID.
   - We store only "verified on date X by admin Y" and a short note. The note must not
     contain ID numbers.
   - **Payments later:** the licensed payment provider does the know-your-customer checks
     before paying a seller out, and holds the ID itself. TZed receives only "verified: yes".
4. **Analytics shown to sellers** are counts only, with no buyer identities. Keep it that way.
   Showing which buyers viewed a shop would need a basis and notice.
5. **Seller terms (data clauses).** Sellers must:
   - Use buyer data only to fulfil the order.
   - Keep it secure.
   - Not keep it after the order and any problem are closed.
   - Not export it.
   - Report suspected leaks to TZed.
6. **Moderation and suspension** are decisions that affect sellers, so a person must review
   every one.
   - We already notify with a reason and allow a support appeal. Nothing is fully automated,
     which keeps us clear of the automated-decision rules.
   - Keep any future automatic spam or fraud flags as "review by a person".
7. **Account deletion.** It exists already: profile and shop are deleted, live listings
   removed, and the user record anonymised. What remains, and why:
   - **Orders and invoices:** kept for tax law (Tanzania Revenue Authority / Zambia Revenue
     Authority), commonly 5–7 years (_verify_ with an accountant).
   - **Audit log:** kept for security.
   - **Messages:** kept until any open problem closes.
     The privacy notice must list these.

## 6. Gaps in the platform today, and the fixes

| #   | Gap                                                | Fix                                                                                                                                                                                                                                                                                                                                                                                                                                                                    | Effort                    |
| --- | -------------------------------------------------- | ---------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- | ------------------------- |
| 1   | Privacy page is a draft (`LegalPage.tsx`)          | Write a real notice in English and Swahili: who we are, DPO contact, what (the data map above), why, recipients (other party to an order, providers), transfers and countries, retention, rights and how to use them, PDPC/ODPC complaint routes                                                                                                                                                                                                                       | Content plus legal review |
| 2   | Consent is one "accept terms" timestamp            | Keep the contract basis for the account. Add separate, optional, withdrawable consent for marketing emails; record which version of the notice was accepted                                                                                                                                                                                                                                                                                                            | Small                     |
| 3   | ~~No self-service access or portability~~ **Done** | "Download my data" on the account page (`GET /me/export`): profile, seller profile, listings, orders with their history, problems, reviews, conversations and messages the person wrote, notifications, tickets, reports, cart, saved items                                                                                                                                                                                                                            | Done                      |
| 4   | Correction                                         | Profile, shop and listing editing exist; add a support topic for anything else                                                                                                                                                                                                                                                                                                                                                                                         | Done or trivial           |
| 5   | ~~No retention rules~~ **Done**                    | Daily job (`src/jobs/retention.ts`, `RETENTION` sets the periods): expired sessions; spent sign-in links after 7 days; audit-log IP and browser after 12 months; notifications after 12 months; listing stats after 24 months; accounts unused for 3 years are warned by email, then anonymised 30 days later unless they come back (never while an order or problem is open; never admins). Still to decide: deleting message bodies some years after an order closes | Done (messages open)      |
| 6   | ~~No breach procedure~~ **Done**                   | `docs/breach-response.md`: roles, containment with `scripts/incident.sh`, risk assessment, ODPC within 24 hours and PDPC without undue delay, notices in English and Swahili, a register template and twice-yearly drills                                                                                                                                                                                                                                              | Fill in contacts          |
| 7   | No register of processing or DPIA                  | Keep the data map above as a living record. Do an impact assessment before adding ID verification, payments or masked contact                                                                                                                                                                                                                                                                                                                                          | Document                  |
| 8   | Hosting location not chosen                        | Decide per §4 before production; get processor agreements with the host and email provider                                                                                                                                                                                                                                                                                                                                                                             | Decision                  |
| 9   | Registration                                       | Register with the **PDPC** (controller) and the **ODPC** (controller; renew yearly); appoint and name a DPO                                                                                                                                                                                                                                                                                                                                                            | Admin task, do first      |
| 10  | Seller terms lack data clauses                     | Add the clauses in §5.5                                                                                                                                                                                                                                                                                                                                                                                                                                                | Content                   |
| 11  | Children                                           | Terms should require users to be 18 or over; add an age confirmation at sign-up                                                                                                                                                                                                                                                                                                                                                                                        | Small                     |
| 12  | Admin access to personal data                      | Admin roles exist and actions are audited. Restrict who is an admin, use strong passwords, and later add two-factor sign-in for admins                                                                                                                                                                                                                                                                                                                                 | Medium                    |

**Suggested order:**

1. Registration and DPO (9).
2. Hosting decision (8).
3. Privacy notice and seller clauses (1, 10).
4. Breach runbook (6).
5. Download-my-data (3) and the retention job (5).
6. Marketing consent and age check (2, 11).

Items 3, 5, 2 and 11 are code we can build next.

## 7. Before launch checklist

- [ ] PDPC registration certificate (Tanzania)
- [ ] ODPC registration certificate (Zambia), renewal date in the calendar
- [ ] DPO named and contact email on the privacy page
- [ ] Hosting country chosen; Tanzanian transfer permit and/or Zambian s.71 approval applied for
- [ ] Processor agreements: hosting, email, backups, later payments and ID
- [ ] Privacy notice (EN and SW) and seller data clauses, reviewed by advocates in both countries
- [ ] Breach runbook and register
- [ ] Retention job running; download-my-data live
- [ ] Record of processing (this file, kept up to date)

## Sources

- PDPC Tanzania: [privacy notice](https://pdpc.go.tz/privacy-notice/), [the Act (GN 395B, 13/6/2023)](https://pdpc.go.tz/documents/3/PERSONAL_DATA_PROTECTION_ACT_2022.pdf)
- [DLA Piper: Tanzania](https://www.dlapiperdataprotection.com/?c=TZ&t=l), [Tanzania breach notification](https://www.dlapiperdataprotection.com/?t=breach-notification&c=TZ), [Zambia](https://www.dlapiperdataprotection.com/index.html?t=law&c=ZM)
- [Future of Privacy Forum: Tanzania overview](https://fpf.org/blog/tanzanias-personal-information-protection-act-overview-key-takeaways-and-context/)
- Clyde & Co: [breach notification in Tanzania (Feb 2026)](https://www.clydeco.com/en/insights/2026/02/notification-obligations-arising-from-personal-dat), [personal data under Tanzanian law (Apr 2026)](https://www.clydeco.com/en/insights/2026/april/personal-data-protection-under-tanzanian-law), [unlawful repurposing (Nov 2025)](https://www.clydeco.com/en/insights/2025/11/protection-of-personal-data-in-tanzania-addressing)
- [Business Insider TZ: enforcement and penalties](https://businessinsider.co.tz/deadline-pressure-mounts-as-commission-moves-to-enforce-data-protection-law-with-heavy-penalties/), [The Respondents: PDPC final warning (Mar 2026)](https://www.therespondents.co.tz/2026/03/pdpc-issues-final-warning-ahead-of-data.html)
- [Baker Tilly Tanzania](https://www.bakertilly.co.tz/insights/personal-data-protection-act-2022), [Governance Atlas: Tanzania](https://atlas.ayoadeabel.tech/countries/tanzania), [dpo360: Tanzania](https://dpo360.africa/countries/tanzania/)
- Zambia Data Protection Act 2021: [ZambiaLII](https://zambialii.org/akn/zm/act/2021/3/eng@2021-03-24), [Parliament PDF](https://www.parliament.gov.zm/sites/default/files/documents/acts/Act%20No.%203%20The%20Data%20Protection%20Act%202021_0.pdf)
- [ODPC registration guide (Mar 2025)](https://www.dataprotection.gov.zm/wp-content/uploads/2025/03/Guide_Registration-of-Data-Controllers-and-Processors.pdf), [ITLawCo: ODPC deadline](https://itlawco.com/zambias-odpc-registration-deadline-30-april-2025/)
- [ALN / Afriwise: Zambian data localisation](https://aln.africa/insight/data-localisation-requirements-under-the-data-protection-act/), [CIPESA brief](https://cipesa.org/download/briefs/Insights-into-Zambias-Data-Protection-Act-2021.pdf), [Securiti: Zambia DPA](https://securiti.ai/zambia-data-protection-act-dpa/), [Bowmans: Zambia](https://bowmanslaw.com/insights/zambia-employers-obligations-under-the-data-protection-act/), [D4D Hub: sensitive data in Zambia](https://cms.d4dhub.eu/assets/Initiatives/Data-Governance-in-Africa/Data-Policies-and-Regulations/Examining-Sensitive-Personal-Data-Protection-and-Data-Sovereignty-in-Zambia.pdf)
