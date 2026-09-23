/**
 * "Your video is ready" mail.
 *
 * Behind an interface for the same reason the pipeline providers are: so a local run
 * needs no account, and so tests can assert on what would have been sent.
 */
export interface Mailer {
  readonly name: string;
  send(message: { to: string; subject: string; html: string; text: string }): Promise<void>;
}

/** Writes to the log instead of sending. The default when Resend is not configured. */
export class ConsoleMailer implements Mailer {
  readonly name = "console";
  readonly sent: { to: string; subject: string }[] = [];

  async send(message: { to: string; subject: string; text: string }): Promise<void> {
    this.sent.push({ to: message.to, subject: message.subject });
    console.log(`[email] to=${message.to} subject="${message.subject}"\n${message.text}`);
  }
}

export class ResendMailer implements Mailer {
  readonly name = "resend";
  private readonly from: string;
  private readonly apiKey: string;

  constructor(options: { apiKey?: string; from?: string } = {}) {
    const apiKey = options.apiKey ?? process.env.RESEND_API_KEY;
    if (!apiKey) throw new Error("RESEND_API_KEY is not set.");
    this.apiKey = apiKey;
    this.from = options.from ?? process.env.CRAMMER_EMAIL_FROM ?? "Crammer <onboarding@resend.dev>";
  }

  async send(message: {
    to: string;
    subject: string;
    html: string;
    text: string;
  }): Promise<void> {
    // Imported lazily so the package is only loaded when mail is actually configured.
    const { Resend } = await import("resend");
    const resend = new Resend(this.apiKey);
    const { error } = await resend.emails.send({
      from: this.from,
      to: message.to,
      subject: message.subject,
      html: message.html,
      text: message.text,
    });
    if (error) throw new Error(`Resend refused the message: ${error.message}`);
  }
}

export function createMailer(): Mailer {
  return process.env.RESEND_API_KEY ? new ResendMailer() : new ConsoleMailer();
}

/** The one message M2 sends. */
export function readyEmail(input: { topic: string; title: string; url: string }): {
  subject: string;
  html: string;
  text: string;
} {
  const subject = `Your explainer is ready: ${input.title}`;
  const text = `Your Crammer explainer on "${input.topic}" is ready.\n\nWatch it: ${input.url}\n\nThe sources are listed under the video.`;
  const html = `<p>Your Crammer explainer on <strong>${escapeHtml(input.topic)}</strong> is ready.</p>
<p><a href="${input.url}">Watch it</a></p>
<p style="color:#6E6E7A">The sources are listed under the video.</p>`;
  return { subject, html, text };
}

function escapeHtml(value: string): string {
  return value.replace(
    /[&<>"']/g,
    (c) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" })[c]!,
  );
}
