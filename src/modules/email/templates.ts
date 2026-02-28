export interface EmailTemplate {
  subject: string;
  html: string;
}

export function welcomeEmail(name: string): EmailTemplate {
  return {
    subject: "Welcome to TechLearn!",
    html: `
      <div style="font-family: Arial, sans-serif; max-width: 600px; margin: 0 auto;">
        <h1 style="color: #333;">Welcome to TechLearn, ${escapeHtml(name)}!</h1>
        <p>Your account has been created successfully.</p>
        <p>You can now start exploring curriculums, subjects, and chapters.</p>
        <hr style="border: none; border-top: 1px solid #eee;" />
        <p style="color: #999; font-size: 12px;">
          You received this email because you registered at TechLearn.
        </p>
      </div>
    `,
  };
}

function escapeHtml(text: string): string {
  return text
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;");
}
