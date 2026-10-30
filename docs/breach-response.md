# Data breach response plan

What to do if personal data on TZed may have been lost, stolen, seen by the wrong person,
changed or destroyed. It covers both laws: Tanzania's Personal Data Protection Act 2022 and
Zambia's Data Protection Act 2021 (`docs/data-protection.md`).

> **Not legal advice.** The deadlines below come from the Acts as summarised by law firms;
> confirm them with your advocates, and check the PDPC and ODPC sites for their current
> reporting forms. Fill in the [bracketed] contacts before launch.

## The short version

1. **Contain first, investigate second.** Stop the leak (§3), and keep evidence
   (`scripts/incident.sh evidence`).
2. **Start the clock.** Write down when you became aware. Zambian data: tell the
   **Commissioner within 24 hours**. Tanzanian data: tell the **PDPC without undue delay**;
   aim for the same 24 hours, 72 at most.
3. **Decide who else to tell** (§5). Tell the people affected when it's likely to harm them,
   in their language.
4. **Record everything** in the breach register (§8), even incidents that turn out minor.

## 1. What counts as a breach

Any security incident that affects personal data, whether by accident or on purpose:

- **Confidentiality:** someone sees data they shouldn't. Examples:
  - a stolen database copy or backup
  - an admin account taken over
  - an email sent to the wrong person
  - a seller publishing a buyer's number
- **Integrity:** data changed without permission. Examples: listings or payouts edited by an
  attacker, or an account's email changed.
- **Availability:** data lost or locked. Examples: a server wiped with no restorable backup,
  or ransomware.

**Not a breach, but still worth a register entry:**

- a blocked attack, such as thousands of failed sign-ins that never got in;
- a laptop lost with an encrypted disk and nothing of TZed's on it.

## 2. Roles

Small team, so one person can hold several roles, but name them now.

| Role                        | Who                                | Does                                                           |
| --------------------------- | ---------------------------------- | -------------------------------------------------------------- |
| **Incident lead**           | [name, phone]                      | Runs the response, makes the calls, keeps the timeline         |
| **Data protection officer** | [name, privacy@domain]             | Judges the risk, talks to the PDPC and ODPC, signs off notices |
| **Technical lead**          | [name, phone]                      | Contains, investigates, restores, fixes                        |
| **Communications**          | [name]                             | Messages to users, sellers and, if needed, the press           |
| **Legal**                   | [advocate in TZ], [advocate in ZM] | Checks duties and wording                                      |

**Out of hours:** whoever notices first calls the incident lead, then the technical lead.
**Anyone at TZed who suspects a breach reports it at once.** Don't wait to be sure.

## 3. Contain (first hours)

Pick what fits. Every command below runs from the repo folder on the server. Add `--local`
for an install without Docker. Each command is logged in `incidents/actions.log`.

| Situation                                    | Do this                                                                                                                                                                                                                    |
| -------------------------------------------- | -------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| **Always, first**                            | `scripts/incident.sh evidence --since <date before it started>`. It saves the audit log, failed sign-ins by IP, admin actions, the admin list and a labelled backup to `incidents/`. Do this **before** changing anything. |
| Someone may be signed in who shouldn't be    | `scripts/incident.sh sign-out-all` signs everyone out at once                                                                                                                                                              |
| An admin account was taken over              | Sign everyone out. Another admin then suspends that account (Admin → Users) or resets its two-step. Change that person's password. Check `admin-actions.tsv` for what was done.                                            |
| Passwords may have leaked                    | `scripts/incident.sh reset-passwords --ids affected.txt` (or `--all`). Their passwords stop working until they use "Forgot password". Passwords are stored as Argon2 hashes, but act anyway.                               |
| The server itself may be compromised         | Take a backup copy off the server. Rotate every secret (below). Rebuild on a fresh server from the image and the last clean backup (`docs/deploy.md` §5).                                                                  |
| A secret leaked                              | **Rotate it.** See the secrets list below.                                                                                                                                                                                 |
| A seller or buyer is misusing someone's data | Suspend the account (Admin → Users). Remove the content, and ask them in writing to delete the data.                                                                                                                       |
| An email went to the wrong person            | Ask the recipient to delete it and confirm. Note it in the register.                                                                                                                                                       |
| A provider (hosting, email) reports a breach | Get their report in writing, find out what TZed data was involved, then continue at §4                                                                                                                                     |

**Secrets to rotate** (all in `.env`; restart with `docker compose up -d` afterwards):

- **`SESSION_SECRET`:** everyone is signed out.
- **`TWO_STEP_KEY`:** if this changes, existing two-step keys can't be read. Before rotating,
  ask everyone with two-step to turn it off and on again, or reset them in the database
  (`docs/deploy.md`).
- **`MYSQL_PASSWORD` and `MYSQL_ROOT_PASSWORD`:** change them in MySQL too.
- **`SMTP_URL`:** the email provider password.
- **Server access:** SSH keys and the hosting account password. Turn on two-step there too.

## 4. Assess (within the first day)

Answer these, and write the answers in the register:

1. **What happened**, and when did it start and end? Use the audit log and server logs.
2. **What data?** Use the data map in `docs/data-protection.md` §2. Pay most attention to:
   - phone numbers and email addresses
   - messages
   - two-step keys and password hashes
   - anything sensitive
3. **Whose, and from which country?** Count Tanzanian and Zambian people separately: it
   decides which regulator you tell. Find them with
   `scripts/incident.sh contacts --ids affected.txt`.
4. **How bad could it be for them?** Weigh up:

   | Likely harm | Examples                                                                                                                                            |
   | ----------- | --------------------------------------------------------------------------------------------------------------------------------------------------- |
   | **Low**     | Encrypted or hashed data with the key safe; public shop details; an email to the wrong admin who deleted it                                         |
   | **Medium**  | Names, emails, phone numbers; order history; one person's messages                                                                                  |
   | **High**    | Many people's contact details plus messages or addresses; account takeover; anything that enables fraud (fake payment requests, SIM-swap targeting) |

5. **Is it still going on?** If yes, go back to §3.

## 5. Notify

**Regulators.** Report unless the breach is unlikely to put anyone at risk. When unsure,
report. Late reporting is a bigger problem than over-reporting.

|      | Zambia                                                                                                 | Tanzania                                                              |
| ---- | ------------------------------------------------------------------------------------------------------ | --------------------------------------------------------------------- |
| Who  | Office of the Data Protection Commissioner, [dataprotection.gov.zm](https://www.dataprotection.gov.zm) | Personal Data Protection Commission, [pdpc.go.tz](https://pdpc.go.tz) |
| When | **Within 24 hours** of becoming aware (DPA 2021 s.49, _verify_)                                        | **Without undue delay** (PDPA 2022 s.27(5)); aim for 24–72 hours      |
| How  | Their reporting form or email, [contact]                                                               | Their reporting form or email, [contact]                              |

If not everything is known yet, **report what you know on time** and send the rest later.

**What to tell the regulator:**

- who you are, and your registration number and data protection officer;
- what happened, when, and how you found out;
- what data, and roughly how many people from each country;
- the likely consequences;
- what you have done and will do;
- who to contact.

**The people affected.** Tell them directly, by email in their language and with an in-app
notice, when the harm is medium or high. Write plainly:

- what happened;
- what data;
- what TZed has done;
- what they should do;
- how to reach the data protection officer.

**Others, when relevant:**

- the police, for theft or fraud;
- the hosting or email provider;
- banks or mobile-money providers, if payment fraud is likely.

### Template: email to affected people (English)

> **Subject:** Important: a security problem affecting your TZed account
>
> Hi {name},
>
> On {date} we found that {plain description, e.g. "someone got into one of our admin
> accounts"}. This may have exposed your {data, e.g. "name, phone number and messages"}.
> Your password {was / was not} affected. TZed does not hold card numbers, mobile-money PINs
> or national ID numbers.
>
> What we've done: {e.g. "signed everyone out, locked the account, and reported this to the
> Data Protection Commissioner"}.
>
> What you should do: {e.g. "choose a new password with Forgot password; turn on two-step
> sign-in in My account; be wary of calls or messages asking for payment or codes. TZed
> will never ask for your PIN"}.
>
> Questions: {DPO name}, privacy@{domain}. We're sorry this happened.
>
> — The TZed team

### Kiolezo: barua pepe kwa walioathirika (Kiswahili)

> **Kichwa:** Muhimu: tatizo la usalama linalohusu akaunti yako ya TZed
>
> Habari {name},
>
> Tarehe {date} tuligundua kwamba {maelezo rahisi, k.m. "mtu aliingia kwenye mojawapo ya
> akaunti zetu za wasimamizi"}. Hili huenda limefichua {taarifa, k.m. "jina lako, namba ya
> simu na jumbe"}. Nenosiri lako {limeathirika / halijaathirika}. TZed haihifadhi namba za
> kadi, namba za siri za pesa za simu wala namba za vitambulisho vya taifa.
>
> Tulichofanya: {k.m. "tumewatoa watu wote kwenye akaunti, tumefunga akaunti husika, na
> tumeripoti kwa Tume ya Ulinzi wa Taarifa Binafsi"}.
>
> Unachopaswa kufanya: {k.m. "chagua nenosiri jipya kupitia Umesahau nenosiri; washa
> kuingia kwa hatua mbili kwenye Akaunti yangu; kuwa makini na simu au jumbe zinazoomba
> malipo au namba za siri. TZed haitakuomba namba yako ya siri kamwe"}.
>
> Maswali: {DPO name}, privacy@{domain}. Tunasikitika kwa hili kutokea.
>
> — Timu ya TZed

## 6. Recover

- **Fix the cause:**
  - patch the code or server;
  - remove the access that was abused;
  - add a test or a check so it can't happen the same way again.
- **Restore** data from the last good backup if anything was lost or altered
  (`scripts/restore-db.sh`, `docs/deploy.md` §5).
- **Watch closely** for two weeks:
  - failed sign-ins (`incident.sh evidence`)
  - new admin actions
  - reports from users

## 7. Learn (within two weeks)

Hold a short, blame-free review:

- what happened and when;
- what went well;
- what was slow;
- what to change, with an owner and a date for each.

Update this plan and the data map. Close the register entry. Delete the files in
`incidents/` once nobody needs them, and record the deletion.

## 8. Breach register

Keep it **outside this repository**, for example as a shared spreadsheet with restricted
access. It should hold no more personal data than needed: counts and IDs, not lists of names.
Both regulators can ask to see it. One row per incident, including minor ones and ones you
decided not to report:

| Field                                | Example                                                                   |
| ------------------------------------ | ------------------------------------------------------------------------- |
| Number                               | 2026-001                                                                  |
| Found (date, time, by whom)          | 2026-11-03 07:40, technical lead, from failed sign-in alerts              |
| Started / ended                      | 2026-11-02 22:10 / 2026-11-03 08:05                                       |
| What happened                        | Password-guessing against admin accounts; none got in (two-step)          |
| Data and people affected             | None; or "emails and phone numbers of 120 TZ and 45 ZM users"             |
| Harm (low/medium/high) and why       | Low: no access gained                                                     |
| Contained by (what, when)            | Blocked the IPs at the firewall, 08:05                                    |
| ODPC told? when, reference           | Not needed: no personal data affected                                     |
| PDPC told? when, reference           | Not needed                                                                |
| People told? when, how               | No                                                                        |
| Follow-up actions, owners, due dates | Add an alert on 20+ failed admin sign-ins an hour (tech lead, 2026-11-10) |
| Closed                               | 2026-11-10                                                                |

## 9. Drills

Twice a year, run a 30-minute drill on a test copy of the stack. Pick one scenario from §3,
such as "an admin's laptop was stolen", and walk through it:

- run `incident.sh evidence` and `sign-out-all` against the test copy;
- draft both notices;
- time each step.

Record the drill in the register as "Drill", and fix whatever was slow or unclear.

## What TZed already has that helps

- **Two-step sign-in:** required for admins; a stolen password alone isn't enough.
- **Passwords:** hashed with Argon2.
- **Two-step keys:** encrypted at rest.
- **Audit log:** every sign-in, failure and admin action, with IP and browser (kept 12
  months).
- **Sessions:** kept in the database, so one command signs everyone out.
- **Backups:** scripted, with a tested restore.
- **Data minimisation:** no national IDs, card numbers or PINs. Phone numbers are private by
  default, emails are never shown to other users, and photos have their location data
  removed.
- **Retention:** old data is deleted on a schedule, so there's less to lose.
