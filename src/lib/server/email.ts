import { Resend } from 'resend';
import { env } from '$env/dynamic/private';

const resend = new Resend(env.RESEND_API_KEY || '');

// ─── Shared email shell matching landing page aesthetic ───
function emailShell(content: string) {
	return `
<!DOCTYPE html>
<html lang="en">
<head>
<meta charset="utf-8" />
<meta name="viewport" content="width=device-width, initial-scale=1" />
<meta name="color-scheme" content="dark" />
<meta name="supported-color-schemes" content="dark" />
<link href="https://fonts.googleapis.com/css2?family=Syne:wght@700;800&family=DM+Sans:wght@400;500;600&display=swap" rel="stylesheet" />
<style>
  @media (prefers-color-scheme: light) {
    .email-body { background-color: #09090b !important; }
  }
</style>
</head>
<body style="margin:0; padding:0; background-color:#09090b; -webkit-font-smoothing:antialiased;">
<div class="email-body" style="background-color:#09090b; min-height:100%; width:100%;">

<!-- Dot grid overlay -->
<table width="100%" cellpadding="0" cellspacing="0" border="0" style="background-image:radial-gradient(rgba(255,255,255,.03) 1px, transparent 1px); background-size:28px 28px;">
<tr><td align="center" style="padding:48px 16px 56px;">

<!-- Container -->
<table width="100%" cellpadding="0" cellspacing="0" border="0" style="max-width:480px;">
<tr><td>

<!-- Logo -->
<table width="100%" cellpadding="0" cellspacing="0" border="0">
<tr><td style="padding-bottom:36px;">
  <a href="https://gensprite.ai" style="text-decoration:none; display:inline-flex; align-items:center; gap:8px;">
    <img src="https://gensprite.ai/icon-64.png" alt="" width="28" height="28" style="display:block; border-radius:6px;" />
    <span style="font-family:'Syne',system-ui,sans-serif; font-weight:800; font-size:18px; color:#ffffff; letter-spacing:-0.01em;">GenSprite</span>
  </a>
</td></tr>
</table>

<!-- Card -->
<table width="100%" cellpadding="0" cellspacing="0" border="0" style="background:rgba(24,24,27,.65); border:1px solid rgba(63,63,70,.35); border-radius:16px; overflow:hidden;">
<!-- Ambient glow -->
<tr><td style="height:3px; background:linear-gradient(90deg, transparent, rgba(245,158,11,.4), rgba(249,115,22,.3), transparent);"></td></tr>
<tr><td style="padding:36px 32px 40px;">
${content}
</td></tr>
</table>

<!-- Footer -->
<table width="100%" cellpadding="0" cellspacing="0" border="0">
<tr><td style="padding-top:32px; text-align:center;">
  <p style="margin:0; font-family:'DM Sans',system-ui,sans-serif; font-size:12px; color:#52525b; line-height:1.6;">
    GenSprite &middot; AI game asset generation
  </p>
  <p style="margin:6px 0 0; font-family:'DM Sans',system-ui,sans-serif; font-size:11px; color:#3f3f46;">
    <a href="https://gensprite.ai/terms" style="color:#52525b; text-decoration:underline;">Terms</a>
    &nbsp;&middot;&nbsp;
    <a href="https://gensprite.ai/privacy" style="color:#52525b; text-decoration:underline;">Privacy</a>
  </p>
</td></tr>
</table>

</td></tr>
</table>

</td></tr>
</table>

</div>
</body>
</html>`;
}

// ─── Waitlist ───
export async function addToWaitlist(email: string, firstName?: string) {
	const segmentId = env.RESEND_SEGMENT_ID;
	if (!segmentId) throw new Error('RESEND_SEGMENT_ID not configured');

	const { data, error } = await resend.contacts.create({
		email,
		firstName: firstName || undefined,
		unsubscribed: false,
		segments: [{ id: segmentId }],
	});

	if (error) {
		throw error;
	}

	const greeting = firstName ? `, ${firstName}` : '';

	await resend.emails.send({
		from: 'GenSprite <noreply@gensprite.ai>',
		to: email,
		subject: "You're on the waitlist!",
		html: emailShell(`
  <!-- Tag -->
  <table cellpadding="0" cellspacing="0" border="0">
  <tr><td style="padding:4px 12px; background:rgba(245,158,11,.1); border:1px solid rgba(245,158,11,.2); border-radius:999px; font-family:'DM Sans',system-ui,sans-serif; font-size:11px; font-weight:600; color:#fbbf24; letter-spacing:0.04em; text-transform:uppercase;">
    Waitlist confirmed
  </td></tr>
  </table>

  <h1 style="margin:20px 0 0; font-family:'Syne',system-ui,sans-serif; font-weight:800; font-size:26px; color:#ffffff; line-height:1.15; letter-spacing:-0.02em;">
    You're on the list${greeting}!
  </h1>

  <p style="margin:16px 0 0; font-family:'DM Sans',system-ui,sans-serif; font-size:15px; color:#a1a1aa; line-height:1.7;">
    Thanks for joining the GenSprite waitlist. We're setting up Stripe payments and will email you the moment token packs are available.
  </p>
  <p style="margin:12px 0 0; font-family:'DM Sans',system-ui,sans-serif; font-size:15px; color:#a1a1aa; line-height:1.7;">
    In the meantime, you still have your free tokens to generate sprites, textures, and rotations.
  </p>

  <!-- CTA -->
  <table cellpadding="0" cellspacing="0" border="0" style="margin-top:28px;">
  <tr><td style="padding:12px 28px; background:linear-gradient(135deg,#fbbf24,#f59e0b); border-radius:10px; box-shadow:0 0 24px rgba(245,158,11,.18);">
    <a href="https://gensprite.ai/app" style="font-family:'DM Sans',system-ui,sans-serif; font-size:15px; font-weight:600; color:#18181b; text-decoration:none; display:inline-block;">
      Go to GenSprite &rarr;
    </a>
  </td></tr>
  </table>
		`),
	});

	return data;
}

// ─── Magic link ───
export async function sendMagicLinkEmail(email: string, magicLinkUrl: string): Promise<void> {
	await resend.emails.send({
		from: 'GenSprite <noreply@gensprite.ai>',
		to: email,
		subject: 'Sign in to GenSprite',
		html: emailShell(`
  <h1 style="margin:0 0 0; font-family:'Syne',system-ui,sans-serif; font-weight:800; font-size:26px; color:#ffffff; line-height:1.15; letter-spacing:-0.02em;">
    Sign in to GenSprite
  </h1>

  <p style="margin:16px 0 0; font-family:'DM Sans',system-ui,sans-serif; font-size:15px; color:#a1a1aa; line-height:1.7;">
    Click the button below to sign in. This link expires in 15 minutes.
  </p>

  <!-- CTA -->
  <table cellpadding="0" cellspacing="0" border="0" style="margin-top:28px;">
  <tr><td style="padding:12px 28px; background:linear-gradient(135deg,#fbbf24,#f59e0b); border-radius:10px; box-shadow:0 0 24px rgba(245,158,11,.18);">
    <a href="${magicLinkUrl}" style="font-family:'DM Sans',system-ui,sans-serif; font-size:15px; font-weight:600; color:#18181b; text-decoration:none; display:inline-block;">
      Sign in &rarr;
    </a>
  </td></tr>
  </table>

  <!-- Fallback URL -->
  <p style="margin:28px 0 0; font-family:'DM Sans',system-ui,sans-serif; font-size:12px; color:#52525b; line-height:1.6;">
    Or copy this link:
  </p>
  <p style="margin:4px 0 0; font-family:'DM Sans',system-ui,sans-serif; font-size:12px; line-height:1.5;">
    <a href="${magicLinkUrl}" style="color:#71717a; word-break:break-all; text-decoration:underline;">${magicLinkUrl}</a>
  </p>

  <!-- Disclaimer -->
  <p style="margin:28px 0 0; padding-top:20px; border-top:1px solid rgba(63,63,70,.3); font-family:'DM Sans',system-ui,sans-serif; font-size:12px; color:#52525b; line-height:1.6;">
    If you didn't request this, you can safely ignore this email.
  </p>
		`),
	});
}
