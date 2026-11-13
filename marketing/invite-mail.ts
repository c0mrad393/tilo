// The waiting-list invite email as Tilo sends it (server/api/src/waitlist.ts), with a plain
// mail-app header above it, for the sign-up video. The code is a made-up one.
import { writeFileSync } from "node:fs";
import { join } from "node:path";
import { inviteMail } from "../server/api/src/waitlist.ts";

const mail = inviteMail("https://tiloart.com", "you@example.com", "TILO-ABCD-2345");
const head = `<div style="font-family:-apple-system,'Helvetica Neue',Arial,sans-serif;padding:18px 18px 14px;border-bottom:1px solid #ddd;background:#fff;color:#111">
  <div style="font-size:13px;color:#777;margin-bottom:10px">Inbox</div>
  <div style="font-size:21px;font-weight:700;margin-bottom:12px">${mail.subject}</div>
  <div style="display:flex;align-items:center;gap:10px"><div style="width:36px;height:36px;border-radius:50%;background:#2d4bb3;color:#fff;display:grid;place-items:center;font-weight:800">t</div>
  <div><div style="font-weight:700;font-size:15px">Tilo</div><div style="font-size:13px;color:#777">to you@example.com</div></div></div></div>`;
const html = mail.html.replace(/<body([^>]*)>/, `<head><meta name="viewport" content="width=device-width,initial-scale=1"></head><body style="margin:0;background:#fff">${head}<div$1>`).replace("</body>", "</div></body>");
writeFileSync(join(import.meta.dirname, "shots", "invite-mail.html"), html);
console.log("wrote shots/invite-mail.html");
