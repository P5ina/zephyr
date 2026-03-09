import 'dotenv/config';
import { neon } from '@neondatabase/serverless';
import { Resend } from 'resend';

// ── Config ──
const FROM = 'GenSprite <founders@gensprite.ai>';
const REPLY_TO = 'timur@triangleint.com';
const SUBJECT = 'Stripe is live — buy tokens instantly';
const BATCH_SIZE = 50; // Resend batch limit
const DELAY_MS = 1_500; // pause between batches to respect rate limits

// ── Clients ──
const DATABASE_URL = process.env.DATABASE_URL;
const RESEND_API_KEY = process.env.RESEND_API_KEY;

if (!DATABASE_URL) {
	console.error('Missing DATABASE_URL');
	process.exit(1);
}
if (!RESEND_API_KEY) {
	console.error('Missing RESEND_API_KEY');
	process.exit(1);
}

const sql = neon(DATABASE_URL);
const resend = new Resend(RESEND_API_KEY);

// ── Email template ──
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
    <img src="https://gensprite.ai/icon-192.png" alt="" width="28" height="28" style="display:block; border-radius:6px;" />
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

function buildEmailHtml(username: string | null) {
	const greeting = username ? `Hey ${username}` : 'Hey';

	return emailShell(`
  <!-- Tag -->
  <table cellpadding="0" cellspacing="0" border="0">
  <tr><td style="padding:4px 12px; background:rgba(245,158,11,.1); border:1px solid rgba(245,158,11,.2); border-radius:999px; font-family:'DM Sans',system-ui,sans-serif; font-size:11px; font-weight:600; color:#fbbf24; letter-spacing:0.04em; text-transform:uppercase;">
    Update
  </td></tr>
  </table>

  <h1 style="margin:20px 0 0; font-family:'Syne',system-ui,sans-serif; font-weight:800; font-size:26px; color:#ffffff; line-height:1.15; letter-spacing:-0.02em;">
    Stripe payments are here
  </h1>

  <p style="margin:16px 0 0; font-family:'DM Sans',system-ui,sans-serif; font-size:15px; color:#a1a1aa; line-height:1.7;">
    ${greeting}, thanks for being part of GenSprite! We really appreciate you using our platform to create game assets.
  </p>

  <p style="margin:12px 0 0; font-family:'DM Sans',system-ui,sans-serif; font-size:15px; color:#a1a1aa; line-height:1.7;">
    We're excited to announce that <strong style="color:#ffffff;">Stripe payments are now live</strong>. You can purchase token packs instantly with a credit card &mdash; no more waitlists, no more waiting.
  </p>

  <p style="margin:12px 0 0; font-family:'DM Sans',system-ui,sans-serif; font-size:15px; color:#a1a1aa; line-height:1.7;">
    Tokens never expire and failed generations are always refunded automatically.
  </p>

  <!-- CTA -->
  <table cellpadding="0" cellspacing="0" border="0" style="margin-top:28px;">
  <tr><td style="padding:12px 28px; background:linear-gradient(135deg,#fbbf24,#f59e0b); border-radius:10px; box-shadow:0 0 24px rgba(245,158,11,.18);">
    <a href="https://gensprite.ai/app/billing" style="font-family:'DM Sans',system-ui,sans-serif; font-size:15px; font-weight:600; color:#18181b; text-decoration:none; display:inline-block;">
      Get tokens &rarr;
    </a>
  </td></tr>
  </table>

  <!-- Feedback ask -->
  <p style="margin:28px 0 0; padding-top:20px; border-top:1px solid rgba(63,63,70,.3); font-family:'DM Sans',system-ui,sans-serif; font-size:14px; color:#a1a1aa; line-height:1.7;">
    We'd love to hear from you &mdash; what's working, what's not, what you'd want us to build next. Just <strong style="color:#ffffff;">reply to this email</strong> with any feedback. We read every message.
  </p>
	`);
}

// ── Main ──
async function main() {
	console.log('Fetching users...');
	const EXCLUDE_DOMAINS = ['.local', 'uiemail.com', 'juhxs.com'];
	const allUsers =
		await sql`SELECT id, email, username FROM "user" ORDER BY created_at`;
	const users = allUsers.filter(
		(u) => !EXCLUDE_DOMAINS.some((d) => (u.email as string).endsWith(d)),
	);
	console.log(
		`Found ${allUsers.length} users, ${users.length} after filtering (excluded ${allUsers.length - users.length} test/disposable)`,
	);

	if (users.length === 0) {
		console.log('No users to email. Exiting.');
		return;
	}

	// DRY RUN check
	if (process.argv.includes('--dry-run')) {
		console.log('\n--- DRY RUN ---');
		for (const u of users) {
			console.log(
				`  Would send to: ${u.email} (${u.username || 'no username'})`,
			);
		}
		console.log(`\nTotal: ${users.length} emails`);
		return;
	}

	let sent = 0;
	let failed = 0;

	// Send in batches
	for (let i = 0; i < users.length; i += BATCH_SIZE) {
		const batch = users.slice(i, i + BATCH_SIZE);

		const emails = batch.map((u) => ({
			from: FROM,
			to: u.email as string,
			replyTo: REPLY_TO,
			subject: SUBJECT,
			html: buildEmailHtml(u.username as string | null),
		}));

		try {
			const { error } = await resend.batch.send(emails);
			if (error) {
				console.error(`Batch ${i / BATCH_SIZE + 1} error:`, error);
				failed += batch.length;
			} else {
				sent += batch.length;
				console.log(
					`Batch ${i / BATCH_SIZE + 1}: sent ${batch.length} emails (${sent}/${users.length})`,
				);
			}
		} catch (err) {
			console.error(`Batch ${i / BATCH_SIZE + 1} exception:`, err);
			failed += batch.length;
		}

		// Rate limit pause between batches
		if (i + BATCH_SIZE < users.length) {
			await new Promise((r) => setTimeout(r, DELAY_MS));
		}
	}

	console.log(`\nDone! Sent: ${sent}, Failed: ${failed}`);
}

main().catch((err) => {
	console.error('Fatal error:', err);
	process.exit(1);
});
