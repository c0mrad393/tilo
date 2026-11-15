// The emails the sign-up videos show, as Tilo sends them, each under a plain mail-app header:
// the waiting-list invite (server/api/src/waitlist.ts; the code is a made-up one) and the link
// Auth sends a new address to join (server/mail/confirmation.html).
import { readFileSync, writeFileSync } from "node:fs";
import { join } from "node:path";
import { inviteMail } from "../server/api/src/waitlist.ts";

const page = (mail: { subject: string; html: string }) => {
  const head = `<div style="font-family:-apple-system,'Helvetica Neue',Arial,sans-serif;padding:18px 18px 14px;border-bottom:1px solid #ddd;background:#fff;color:#111">
  <div style="font-size:13px;color:#777;margin-bottom:10px">Inbox</div>
  <div style="font-size:21px;font-weight:700;margin-bottom:12px">${mail.subject}</div>
  <div style="display:flex;align-items:center;gap:10px"><div style="width:36px;height:36px;border-radius:50%;background:#2d4bb3;color:#fff;display:grid;place-items:center;font-weight:800">t</div>
  <div><div style="font-weight:700;font-size:15px">Tilo</div><div style="font-size:13px;color:#777">to you@example.com</div></div></div></div>`;
  return mail.html.replace(/<body([^>]*)>/, `<head><meta name="viewport" content="width=device-width,initial-scale=1"></head><body style="margin:0;background:#fff">${head}<div$1>`).replace("</body>", "</div></body>");
};
const write = (name: string, html: string) => {
  writeFileSync(join(import.meta.dirname, "shots", name), html);
  console.log(`wrote shots/${name}`);
};
write("invite-mail.html", page(inviteMail("https://tiloart.com", "you@example.com", "TILO-ABCD-2345")));
const confirmation = readFileSync(join(import.meta.dirname, "..", "server", "mail", "confirmation.html"), "utf8")
  .replaceAll("{{ .ConfirmationURL }}", "https://tiloart.com/account")
  .replaceAll("{{ .Email }}", "you@example.com");
write("signin-mail.html", page({ subject: "Your link to join Tilo", html: confirmation }));
