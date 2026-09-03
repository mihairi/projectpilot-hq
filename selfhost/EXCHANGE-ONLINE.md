# Sending mail through Microsoft Exchange Online

The local stack sends mail over SMTP, so it works with Exchange Online without any
extra service. Two decisions in Microsoft 365 have to be made first.

## Option A — SMTP AUTH from a licensed mailbox (simplest)

Best when you have a normal licensed mailbox such as `projectportal@yourcompany.com`.

1. In the Microsoft 365 admin center, create (or pick) the sending mailbox and give it a
   license. Unlicensed / shared mailboxes cannot authenticate for SMTP submission.
2. Enable SMTP AUTH for that mailbox only:
   Exchange admin center → Recipients → Mailboxes → mailbox → Manage email apps →
   tick **Authenticated SMTP**.
   Or with PowerShell:
   `Set-CASMailbox -Identity projectportal@yourcompany.com -SmtpClientAuthenticationDisabled $false`
3. Security defaults / conditional access block basic SMTP AUTH. Either exclude this
   mailbox from the blocking policy, or (recommended) keep MFA on the account and create
   an **app password** for it, and use that app password as `SMTP_PASS`.
4. Fill in `selfhost/.env`:

   ```
   SMTP_HOST=smtp.office365.com
   SMTP_PORT=587
   SMTP_USER=projectportal@yourcompany.com
   SMTP_PASS=<mailbox or app password>
   SMTP_FROM=projectportal@yourcompany.com
   SMTP_FROM_NAME=Project Portal
   ```

   Port 587 with STARTTLS is required; Exchange Online does not accept port 465.
   `SMTP_FROM` must match `SMTP_USER`, or the mailbox needs *Send As* rights on it.

## Option B — Direct Send / connector (no mailbox password)

Best when IT refuses SMTP AUTH.

1. Exchange admin center → Mail flow → Connectors → **Add a connector**,
   from *Your organization's email server* to *Office 365*, and authenticate the
   connector by the static public IP of the server running this stack.
2. Point the stack at your tenant's MX endpoint
   (`yourcompany-com.mail.protection.outlook.com`), port `25`, with empty
   `SMTP_USER` / `SMTP_PASS`.
3. This only delivers to recipients inside your own tenant unless the connector is
   explicitly configured for external relay.

## DNS, so mail is not treated as spam

Add these at your public DNS provider for the sending domain:

- **SPF**: `v=spf1 include:spf.protection.outlook.com -all`
- **DKIM**: enable both selectors in the Microsoft 365 Defender portal
  (Email & collaboration → Policies → Email authentication → DKIM) and publish the two
  CNAME records it shows.
- **DMARC**: `v=DMARC1; p=quarantine; rua=mailto:dmarc@yourcompany.com`

## What gets sent

The auth service sends account invitations, password resets and email-change
confirmations through this SMTP configuration as soon as it is filled in.

Application notifications — **deadline approaching**, **task status change** and
**project priority update** — are emailed by `selfhost/scripts/notify.mjs`, which reads
the same SMTP settings from `selfhost/.env`. Install its two dependencies once
(`cd selfhost/scripts && npm install`), test with `npm run notify:dry`, then schedule
`node notify.mjs` every 10 minutes as shown in `README.md`. It marks each row as emailed
after a successful send and retries failures on the next run, so Exchange throttling or a
short outage never loses a message.

## Testing the configuration

```bash
docker compose exec auth sh -c "nc -zv smtp.office365.com 587"     # reachability
swaks --to you@yourcompany.com --from projectportal@yourcompany.com \
      --server smtp.office365.com:587 -tls -au $SMTP_USER -ap $SMTP_PASS
```

Common failures:

| Message | Cause |
| --- | --- |
| `535 5.7.139 Authentication unsuccessful` | SMTP AUTH disabled for the mailbox, or security defaults are blocking it |
| `550 5.7.60 SMTP; Client does not have permissions to send as this sender` | `SMTP_FROM` differs from the authenticated mailbox |
| `454 4.7.0 Too many concurrent connections` | Exchange Online caps at 30 messages/minute per mailbox — throttle the job |
