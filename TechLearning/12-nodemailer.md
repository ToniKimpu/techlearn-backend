# 12 — Nodemailer

## What is Nodemailer?

Nodemailer is the standard Node.js library for sending emails. It connects to an SMTP server and delivers messages on your behalf.

```
Your app  →  Nodemailer  →  SMTP server  →  Recipient inbox
```

SMTP (Simple Mail Transfer Protocol) is the internet standard for sending email. You can use:
- Your own SMTP server (complex to manage)
- A service like **SendGrid**, **Mailgun**, **AWS SES**, **Resend** (production)
- **Ethereal** — a fake SMTP for testing (no real emails sent)

---

## How this project uses Nodemailer

The transporter is configured in [`src/config/email.ts`](../src/config/email.ts):

```ts
import nodemailer from "nodemailer";

const SMTP_HOST = process.env.SMTP_HOST;
const SMTP_PORT = parseInt(process.env.SMTP_PORT || "587");
const SMTP_USER = process.env.SMTP_USER;
const SMTP_PASS = process.env.SMTP_PASS;
const SMTP_FROM = process.env.SMTP_FROM || "noreply@techlearn.app";

let transporter: nodemailer.Transporter | null = null;

if (SMTP_HOST && SMTP_USER && SMTP_PASS) {
  transporter = nodemailer.createTransport({
    host: SMTP_HOST,
    port: SMTP_PORT,
    secure: SMTP_PORT === 465, // true for port 465 (SSL), false for 587 (TLS)
    auth: {
      user: SMTP_USER,
      pass: SMTP_PASS,
    },
  });
  logger.info("[Email] SMTP transporter configured");
} else {
  logger.warn("[Email] SMTP not configured, email sending disabled");
}

export { transporter, SMTP_FROM };
```

The transporter is `null` if SMTP environment variables are not set — the app works without email configured.

Email is sent inside the BullMQ worker ([`src/config/queue.ts`](../src/config/queue.ts)):

```ts
export async function processEmailJob(job: Job<EmailJobData>): Promise<void> {
  if (!transporter) {
    logger.warn("[Worker] SMTP not configured, skipping email job");
    return;
  }

  const { data } = job;

  switch (data.type) {
    case "welcome": {
      const template = welcomeEmail(data.name);
      await transporter.sendMail({
        from: SMTP_FROM,
        to: data.to,
        subject: template.subject,
        html: template.html,
      });
      break;
    }
  }
}
```

Notice: emails are sent from the **worker**, not from the HTTP handler. The HTTP handler only calls `queueWelcomeEmail(to, name)` and returns immediately. The worker processes the job asynchronously.

---

## The sendMail options

```ts
await transporter.sendMail({
  from: '"TechLearn" <noreply@techlearn.app>', // sender
  to: "user@example.com",                      // recipient
  cc: "manager@example.com",                   // optional CC
  bcc: "audit@example.com",                    // optional BCC
  subject: "Welcome to TechLearn!",
  text: "Plain text fallback",                 // for email clients that don't support HTML
  html: "<h1>Welcome!</h1><p>Thanks for joining.</p>",
  attachments: [                               // optional file attachments
    {
      filename: "invoice.pdf",
      content: pdfBuffer,
      contentType: "application/pdf",
    },
  ],
});
```

---

## Using Ethereal for testing

Ethereal is a free fake SMTP service. Emails sent through it are **not delivered** — they are captured and viewable in a browser. Perfect for development and testing.

```ts
import nodemailer from "nodemailer";

async function createTestTransporter() {
  // Creates a temporary test account
  const testAccount = await nodemailer.createTestAccount();
  console.log("Test account:", testAccount.user, testAccount.pass);

  const transporter = nodemailer.createTransport({
    host: "smtp.ethereal.email",
    port: 587,
    auth: {
      user: testAccount.user,
      pass: testAccount.pass,
    },
  });

  return transporter;
}

const transporter = await createTestTransporter();

const info = await transporter.sendMail({
  from: '"TechLearn" <noreply@techlearn.app>',
  to: "student@example.com",
  subject: "Welcome!",
  html: "<h1>Welcome to TechLearn!</h1>",
});

// This URL opens the email in your browser
console.log("Preview URL:", nodemailer.getTestMessageUrl(info));
// https://ethereal.email/message/...
```

---

## Email templates

A well-structured project separates the email content from the sending logic. In this project, templates are in `src/modules/email/templates.ts`:

```ts
export function welcomeEmail(name: string) {
  return {
    subject: "Welcome to TechLearn!",
    html: `
      <div style="font-family: sans-serif; max-width: 600px; margin: 0 auto;">
        <h1>Welcome, ${name}!</h1>
        <p>Your account has been created successfully.</p>
        <a href="https://techlearn.app/login" style="...">
          Get Started
        </a>
      </div>
    `,
  };
}
```

---

## Step-by-step practice

**Task 1 — Send a test email with Ethereal**

```ts
import nodemailer from "nodemailer";

async function main() {
  // Create a test account (free, no signup needed)
  const account = await nodemailer.createTestAccount();

  const transporter = nodemailer.createTransport({
    host: "smtp.ethereal.email",
    port: 587,
    auth: { user: account.user, pass: account.pass },
  });

  const info = await transporter.sendMail({
    from: '"TechLearn" <noreply@techlearn.app>',
    to: "student@example.com",
    subject: "Welcome to TechLearn!",
    text: "Thanks for joining.",
    html: "<h1>Thanks for joining TechLearn!</h1>",
  });

  console.log("Message sent:", info.messageId);
  console.log("Preview URL:", nodemailer.getTestMessageUrl(info));
  // ↑ Open this URL in your browser to see the email
}

main().catch(console.error);
```

**Task 2 — Build an HTML email template**

```ts
function passwordResetEmail(name: string, resetLink: string): string {
  return `
    <!DOCTYPE html>
    <html>
    <body style="font-family: Arial, sans-serif; background: #f4f4f4; padding: 20px;">
      <div style="max-width: 600px; margin: 0 auto; background: white; padding: 30px; border-radius: 8px;">
        <h2 style="color: #333;">Password Reset Request</h2>
        <p>Hi ${name},</p>
        <p>We received a request to reset your password. Click the button below:</p>
        <a href="${resetLink}"
           style="display: inline-block; background: #4F46E5; color: white;
                  padding: 12px 24px; text-decoration: none; border-radius: 6px;">
          Reset Password
        </a>
        <p style="color: #666; font-size: 14px; margin-top: 20px;">
          This link expires in 1 hour. If you didn't request this, ignore this email.
        </p>
      </div>
    </body>
    </html>
  `;
}
```

**Task 3 — Add email verification to verify your transporter config**

```ts
// Before sending, verify the connection
try {
  await transporter.verify();
  console.log("SMTP connection verified — ready to send");
} catch (err) {
  console.error("SMTP connection failed:", err);
}
```

---

## Key takeaways

- Nodemailer creates a transporter connected to an SMTP server
- In this project, the transporter is created once and reused throughout the app
- Emails are sent from a BullMQ worker, not directly from HTTP handlers (decoupled)
- Use Ethereal (`nodemailer.createTestAccount()`) for development — no real emails sent
- The `getTestMessageUrl(info)` gives you a link to preview the email in the browser
- Always separate email templates from sending logic — easier to maintain and test
