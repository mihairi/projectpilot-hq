#!/usr/bin/env node
/**
 * Emails portal notifications through Microsoft Exchange Online.
 *
 * It does two things on every run:
 *   1. asks the database to queue "deadline approaching" notifications;
 *   2. sends every notification row that has not been emailed yet
 *      (deadline approaching, task status change, project priority update)
 *      and stamps emailed_at so it is never sent twice.
 *
 * Install once:   cd selfhost/scripts && npm install
 * Run:            node selfhost/scripts/notify.mjs
 * Schedule:       see README.md ("Emailing the in-app notifications")
 */
import pg from 'pg';
import nodemailer from 'nodemailer';
import { readFileSync, existsSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { dirname, resolve } from 'node:path';

const here = dirname(fileURLToPath(import.meta.url));
const envFile = resolve(here, '..', '.env');

// Load selfhost/.env without extra dependencies.
if (existsSync(envFile)) {
  for (const line of readFileSync(envFile, 'utf8').split('\n')) {
    const m = line.match(/^\s*([A-Z0-9_]+)\s*=\s*(.*)\s*$/);
    if (m && process.env[m[1]] === undefined) {
      process.env[m[1]] = m[2].replace(/^["']|["']$/g, '');
    }
  }
}

const {
  POSTGRES_PASSWORD,
  POSTGRES_HOST = 'localhost',
  POSTGRES_PORT = '5432',
  POSTGRES_DB = 'postgres',
  POSTGRES_USER = 'postgres',
  SMTP_HOST,
  SMTP_PORT = '587',
  SMTP_USER,
  SMTP_PASS,
  SMTP_FROM,
  SMTP_FROM_NAME = 'Project Portal',
  APP_URL = 'http://localhost:3000',
  NOTIFY_DEADLINE_DAYS = '3',
  NOTIFY_BATCH_SIZE = '200',
  NOTIFY_DRY_RUN = '',
} = process.env;

if (!SMTP_HOST || !SMTP_FROM) {
  console.error('SMTP_HOST and SMTP_FROM must be set in selfhost/.env');
  process.exit(1);
}

const db = new pg.Client({
  host: POSTGRES_HOST,
  port: Number(POSTGRES_PORT),
  database: POSTGRES_DB,
  user: POSTGRES_USER,
  password: POSTGRES_PASSWORD,
});

// Exchange Online: port 587 + STARTTLS, authenticated submission.
// For Direct Send / connector setups leave SMTP_USER and SMTP_PASS empty.
const mailer = nodemailer.createTransport({
  host: SMTP_HOST,
  port: Number(SMTP_PORT),
  secure: false,
  requireTLS: true,
  auth: SMTP_USER ? { user: SMTP_USER, pass: SMTP_PASS } : undefined,
  tls: { minVersion: 'TLSv1.2' },
  pool: true,
  maxConnections: 1,
  maxMessages: 20,
  rateDelta: 60_000, // Exchange Online caps a mailbox at ~30 messages/minute
  rateLimit: 25,
});

const SUBJECTS = {
  deadline: 'Deadline approaching',
  task_status: 'Task status changed',
  priority: 'Project priority updated',
};

const escapeHtml = (s = '') =>
  String(s).replace(/[&<>"']/g, (c) =>
    ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' })[c],
  );

function render({ title, body, link, name }) {
  const url = link ? `${APP_URL.replace(/\/$/, '')}${link}` : APP_URL;
  const text = [
    `Hi ${name || 'there'},`,
    '',
    title,
    body || '',
    '',
    `Open the portal: ${url}`,
  ].join('\n');
  const html = `<!doctype html><html><body style="margin:0;background:#ffffff;font-family:Arial,Helvetica,sans-serif;color:#172b4d">
  <div style="max-width:560px;margin:0 auto;padding:24px">
    <p style="font-size:14px">Hi ${escapeHtml(name || 'there')},</p>
    <h1 style="font-size:18px;margin:16px 0 8px">${escapeHtml(title)}</h1>
    <p style="font-size:14px;line-height:22px">${escapeHtml(body || '')}</p>
    <p style="margin:24px 0">
      <a href="${escapeHtml(url)}" style="background:#0052cc;color:#ffffff;text-decoration:none;padding:10px 18px;border-radius:4px;font-size:14px;display:inline-block">Open in the portal</a>
    </p>
    <p style="font-size:12px;color:#6b778c">You receive this because you are a member of this project.</p>
  </div></body></html>`;
  return { text, html };
}

async function main() {
  await db.connect();

  const queued = await db.query('SELECT public.queue_deadline_notifications($1) AS n', [
    Number(NOTIFY_DEADLINE_DAYS),
  ]);
  console.log(`queued ${queued.rows[0].n} deadline notification(s)`);

  const { rows } = await db.query(
    `SELECT n.id, n.kind, n.title, n.body, n.link, p.email, p.full_name
       FROM public.notifications n
       JOIN public.profiles p ON p.id = n.user_id
      WHERE n.emailed_at IS NULL
        AND p.is_active
        AND p.email IS NOT NULL
        AND n.kind IN ('deadline','task_status','priority')
      ORDER BY n.created_at
      LIMIT $1`,
    [Number(NOTIFY_BATCH_SIZE)],
  );

  let sent = 0;
  for (const row of rows) {
    const { text, html } = render({
      title: row.title,
      body: row.body,
      link: row.link,
      name: row.full_name,
    });
    try {
      if (NOTIFY_DRY_RUN) {
        console.log(`[dry-run] ${row.email}: ${row.title}`);
      } else {
        await mailer.sendMail({
          from: `"${SMTP_FROM_NAME}" <${SMTP_FROM}>`,
          to: row.email,
          subject: `[${SUBJECTS[row.kind] ?? 'Project portal'}] ${row.title}`,
          text,
          html,
        });
      }
      await db.query('UPDATE public.notifications SET emailed_at = now() WHERE id = $1', [row.id]);
      sent += 1;
    } catch (err) {
      // Leave emailed_at null so the next run retries this row.
      console.error(`failed to email notification ${row.id}: ${err.message}`);
    }
  }

  console.log(`emailed ${sent} of ${rows.length} pending notification(s)`);
  mailer.close();
  await db.end();
}

main().catch(async (err) => {
  console.error(err);
  try {
    await db.end();
  } catch {}
  process.exit(1);
});
