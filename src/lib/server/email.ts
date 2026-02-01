import { Resend } from 'resend';
import { env } from '$env/dynamic/private';

const resend = new Resend(env.RESEND_API_KEY || '');

export async function sendMagicLinkEmail(email: string, magicLinkUrl: string): Promise<void> {
	await resend.emails.send({
		from: 'GenSprite <noreply@gensprite.ai>',
		to: email,
		subject: 'Sign in to GenSprite',
		html: `
			<div style="font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, sans-serif; max-width: 480px; margin: 0 auto; padding: 40px 20px;">
				<h1 style="font-size: 24px; font-weight: 600; color: #18181b; margin-bottom: 24px;">Sign in to GenSprite</h1>
				<p style="font-size: 16px; color: #3f3f46; line-height: 1.5; margin-bottom: 24px;">
					Click the button below to sign in to your GenSprite account. This link will expire in 15 minutes.
				</p>
				<a href="${magicLinkUrl}" style="display: inline-block; padding: 12px 24px; background-color: #18181b; color: #ffffff; text-decoration: none; border-radius: 8px; font-size: 16px; font-weight: 500;">
					Sign in to GenSprite
				</a>
				<p style="font-size: 14px; color: #71717a; margin-top: 32px; line-height: 1.5;">
					If you didn't request this email, you can safely ignore it.
				</p>
				<p style="font-size: 12px; color: #a1a1aa; margin-top: 32px;">
					<a href="${magicLinkUrl}" style="color: #a1a1aa; word-break: break-all;">${magicLinkUrl}</a>
				</p>
			</div>
		`,
	});
}
