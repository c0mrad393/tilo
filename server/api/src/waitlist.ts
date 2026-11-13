import { Hono } from "hono";
import { createTransport } from "nodemailer";
import type { Sql } from "postgres";
import { newCode } from "./invites.ts";

/* /api/waitlist: while joining needs an invite code, anyone can leave their email address
   here, and an admin sends them a code from the admin panel (/api/admin/waitlist, in
   admin.ts) when there is room. The code goes out by email with a link that fills it in.
   The privacy policy says what is kept and for how long (migrations/0014_waitlist.sql). */

/** sign-ups one address may send in an hour, and all addresses together in a day */
const PER_HOUR = 5;
const PER_DAY = 300;
const EMAIL = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
const SOURCES = new Set(["join", "account", "sign-in"]);
const text = (v: unknown, max: number) => String(v ?? "").trim().slice(0, max);
const isOpen = async (sql: Sql) =>
  (await sql`select value from tilo_meta.settings where key = 'invites_required'`)[0]?.value !== "true";

export function waitlist(sql: Sql) {
  const app = new Hono();
  // in memory: a restart forgets, which is fine for keeping one sender from flooding
  const sent = new Map<string, number[]>();

  // whether the list is needed at all: with sign-up open, anyone can join straight away
  app.get("/", async (c) => c.json({ open: await isOpen(sql) }));

  app.post("/", async (c) => {
    if (await isOpen(sql)) return c.json({ error: "Sign-up is open just now: sign in and you can join straight away.", open: true }, 409);
    // the Worker passes the visitor's address on; Caddy lets nothing else in on the server
    const ip = c.req.header("x-tilo-client-ip") || c.req.header("cf-connecting-ip") || c.req.header("x-forwarded-for")?.split(",")[0].trim() || "?";
    const now = Date.now();
    const recent = (sent.get(ip) ?? []).filter((t) => now - t < 3600_000);
    if (recent.length >= PER_HOUR) return c.json({ error: "Too many sign-ups from here in an hour. Try again later." }, 429);
    const [{ n }] = await sql`select count(*)::int as n from public.waitlist where created > now() - interval '1 day'`;
    if (n >= PER_DAY) return c.json({ error: "The list is busy today. Try again tomorrow, or write to hello@tiloart.com." }, 429);

    const body = await c.req.json().catch(() => null);
    // a field people never see; only a bot fills it in, and it is told all is well
    if (text(body?.website, 200)) return c.json({ ok: true }, 201);
    const email = text(body?.email, 254);
    if (!EMAIL.test(email)) return c.json({ error: "Give an email address the code can go to.", field: "email" }, 400);
    const note = text(body?.note, 300);
    const source = SOURCES.has(body?.source) ? body.source : "";

    // an address already on the list gets the same answer, so the form can't be used to
    // find out who has signed up
    await sql`
      insert into public.waitlist (email, note, source) values (${email}, ${note}, ${source})
      on conflict (lower(email)) do nothing`;
    sent.set(ip, [...recent, now]);
    return c.json({ ok: true }, 201);
  });

  return app;
}

// ---- the invite email ----

export interface Mailer {
  /** sends a code to one address; throws when the mail server refuses or isn't set up */
  invite(to: string, code: string): Promise<void>;
}

const esc = (s: string) => s.replace(/[&<>"']/g, (ch) => `&#${ch.charCodeAt(0)};`);

/** The invite email, in the look of Auth's own emails (server/mail/). */
export function inviteMail(site: string, to: string, code: string) {
  const link = `${site}/account?invite=${encodeURIComponent(code)}`;
  const subject = "Your invite to Tilo";
  const plain = [
    "A place on Tilo is yours.",
    "",
    `Open this link, sign in with this email address, and your invite code is filled in for you:`,
    link,
    "",
    `Your code: ${code}. It works once.`,
    "",
    "You asked to join Tilo's waiting list. If that wasn't you, ignore this email; your address is deleted within 90 days.",
  ].join("\n");
  const html = `<!doctype html>
<html lang="en">
<body style="margin:0;padding:32px 16px;background:#eee8da;color:#1d1b19;font-family:Georgia,'Times New Roman',serif;">
  <table role="presentation" width="100%" cellspacing="0" cellpadding="0"><tr><td align="center">
    <table role="presentation" width="100%" cellspacing="0" cellpadding="0" style="max-width:520px;">
      <tr><td style="padding:0 0 18px;font-family:'Helvetica Neue',Arial,sans-serif;font-weight:800;font-size:28px;letter-spacing:-0.02em;color:#2d4bb3;">tilo</td></tr>
      <tr><td style="background:#fbfaf5;border:1.5px solid #1d1b19;padding:32px 28px;">
        <h1 style="margin:0 0 14px;font-family:'Helvetica Neue',Arial,sans-serif;font-size:24px;line-height:1.15;">A place on Tilo is yours</h1>
        <p style="margin:0 0 24px;font-size:17px;line-height:1.5;">Press the button and sign in with this email address. Your invite code is filled in for you, and you pick your handle.</p>
        <p style="margin:0 0 24px;"><a href="${esc(link)}" style="display:inline-block;padding:14px 22px;background:#1d1b19;color:#eee8da;font-family:'Helvetica Neue',Arial,sans-serif;font-weight:700;font-size:15px;text-decoration:none;">Join Tilo</a></p>
        <p style="margin:0 0 8px;font-size:15px;line-height:1.5;">Or type the code yourself when Tilo asks for it:</p>
        <p style="margin:0 0 24px;font-family:Menlo,Consolas,monospace;font-size:18px;letter-spacing:0.06em;">${esc(code)}</p>
        <p style="margin:0;font-size:14px;line-height:1.5;color:#5e574c;">The code works once. You asked to join Tilo's waiting list; if that wasn't you, ignore this email, and your address is deleted within 90 days.</p>
      </td></tr>
      <tr><td style="padding:18px 0 0;font-size:13px;line-height:1.5;color:#5e574c;">Tilo is a free studio and gallery for art drawn by hand. This email went to ${esc(to)}.</td></tr>
    </table>
  </td></tr></table>
</body>
</html>`;
  return { subject, text: plain, html };
}

/** Sends through the same SMTP server as Auth (SMTP_* in server/.env): Mailpit on this
    computer, the mail provider on the server. */
export function mailer(env: NodeJS.ProcessEnv, site: string): Mailer {
  const host = env.SMTP_HOST;
  const port = Number(env.SMTP_PORT || 587);
  const from = env.SMTP_ADMIN_EMAIL;
  const transport = host && from
    ? createTransport({
        host,
        port,
        secure: port === 465 || port === 2465,
        // a provider with a password always speaks TLS; Mailpit here doesn't
        requireTLS: !!env.SMTP_PASS,
        auth: env.SMTP_USER ? { user: env.SMTP_USER, pass: env.SMTP_PASS ?? "" } : undefined,
      })
    : null;
  return {
    async invite(to, code) {
      if (!transport) throw new Error("Email isn't set up on the server (SMTP_HOST).");
      const mail = inviteMail(site, to, code);
      await transport.sendMail({ from: { name: env.SMTP_SENDER_NAME || "Tilo", address: from! }, to, ...mail });
    },
  };
}

// ---- for admins ----

export interface WaitRow {
  id: number;
  email: string;
  note: string;
  source: string;
  created: string;
  invite: string | null;
  invited_at: string | null;
  used_at: string | null;
  used_by: string | null;
}

/** sends a code to each of these people; one already sent a code that is still unused gets
    the same code again, and one whose code was used is left alone */
export async function sendInvites(sql: Sql, mail: Mailer, me: string, ids: number[]) {
  const rows = await sql<{ id: number; email: string; invite: string | null; used: boolean }[]>`
    select w.id::int, w.email, w.invite, (i.used_at is not null) as used
    from public.waitlist w left join public.invites i on i.code = w.invite
    where w.id in ${sql(ids)}`;
  let sent = 0;
  const failed: string[] = [];
  let fault = "";
  for (const r of rows) {
    if (r.used) continue;
    const code = r.invite ?? newCode();
    if (!r.invite) await sql`insert into public.invites (code, note, made_by) values (${code}, ${`waiting list: ${r.email}`.slice(0, 120)}, ${me})`;
    try {
      await mail.invite(r.email, code);
    } catch (e) {
      // a code that never reached anyone isn't left lying about
      if (!r.invite) await sql`delete from public.invites where code = ${code} and used_at is null`;
      failed.push(r.email);
      fault ||= e instanceof Error ? e.message : String(e);
      continue;
    }
    await sql`update public.waitlist set invite = ${code}, invited_at = now(), invited_by = ${me} where id = ${r.id}`;
    sent++;
  }
  if (sent) await sql`insert into public.mod_log (mod, action, note) values (${me}, 'waitlist', ${`sent ${sent} code${sent > 1 ? "s" : ""} from the waiting list`})`;
  return { sent, failed, fault };
}
