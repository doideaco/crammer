/**
 * Points a Supabase project's auth emails at a real SMTP provider.
 *
 * Supabase's built-in sender is rate limited to a handful of messages an hour and is
 * explicitly not for production — magic links simply stop arriving, with no error
 * anywhere, which is a miserable thing to debug during a demo.
 *
 * Usage:
 *   SUPABASE_PROJECT_REF=<ref> RESEND_API_KEY=<key> CRAMMER_EMAIL_FROM="Crammer <no-reply@yourdomain>" \
 *     pnpm tsx scripts/set-supabase-smtp.ts
 *
 * The access token comes from the Supabase CLI's keychain entry, so run
 * `supabase login` first.
 */
import { execFileSync } from "node:child_process";

function accessToken(): string {
  if (process.env.SUPABASE_ACCESS_TOKEN) return process.env.SUPABASE_ACCESS_TOKEN;
  try {
    const raw = execFileSync("security", [
      "find-generic-password",
      "-s",
      "Supabase CLI",
      "-w",
    ]).toString().trim();
    const value = raw.startsWith("go-keyring-base64:")
      ? Buffer.from(raw.slice("go-keyring-base64:".length), "base64").toString()
      : raw;
    if (value) return value;
  } catch {
    // Fall through to the error below.
  }
  throw new Error("No Supabase access token. Run `supabase login`, or set SUPABASE_ACCESS_TOKEN.");
}

const ref = required("SUPABASE_PROJECT_REF");
const apiKey = required("RESEND_API_KEY");
const from = process.env.CRAMMER_EMAIL_FROM ?? "Crammer <onboarding@resend.dev>";

// "Name <address>" or a bare address.
const match = /^\s*(?:(.*?)\s*<\s*(.+?)\s*>|(.+?))\s*$/.exec(from);
const senderName = match?.[1] || "Crammer";
const senderEmail = match?.[2] || match?.[3];
if (!senderEmail) throw new Error(`Could not read an address out of CRAMMER_EMAIL_FROM: "${from}"`);

const response = await fetch(`https://api.supabase.com/v1/projects/${ref}/config/auth`, {
  method: "PATCH",
  headers: {
    Authorization: `Bearer ${accessToken()}`,
    "Content-Type": "application/json",
  },
  body: JSON.stringify({
    external_email_enabled: true,
    smtp_admin_email: senderEmail,
    smtp_sender_name: senderName,
    smtp_host: "smtp.resend.com",
    // The API wants this as a string, despite being a port number.
    smtp_port: "465",
    smtp_user: "resend",
    smtp_pass: apiKey,
    // The built-in sender's 1-per-minute cap is what makes testing painful; a real
    // provider can take far more, but this still throttles an abusive client.
    rate_limit_email_sent: 30,
  }),
});

if (!response.ok) {
  throw new Error(`Supabase refused the change (${response.status}): ${await response.text()}`);
}

const config = (await response.json()) as Record<string, unknown>;
console.log("SMTP configured:");
console.log(`  host   ${config.smtp_host}:${config.smtp_port}`);
console.log(`  from   ${config.smtp_sender_name} <${config.smtp_admin_email}>`);
console.log(`  limit  ${config.rate_limit_email_sent} messages/hour`);
console.log("\nSend yourself a magic link to check it arrives.");

function required(name: string): string {
  const value = process.env[name];
  if (!value) throw new Error(`${name} is not set.`);
  return value;
}
