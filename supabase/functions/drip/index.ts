// =====================================================================
// Never Fight or Argue Again — drip
//
// Sends the timed welcome emails (day 2, day 5, day 9) to anyone who is
// due one. Called every hour by a scheduled job in the database, so the
// sequence runs without an automation built by hand in Brevo.
//
// Each subscriber carries a drip_stage. The function moves them one step
// at a time and never sends the same email twice, so a double-run or a
// retry is harmless.
//
// Deploy:  supabase functions deploy drip --no-verify-jwt
// =====================================================================

import { createClient } from "https://esm.sh/@supabase/supabase-js@2";

const SUPABASE_URL = Deno.env.get("SUPABASE_URL")!;
const SERVICE_KEY = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!;
const BREVO_API_KEY = Deno.env.get("BREVO_API_KEY")!;
const FROM_EMAIL = Deno.env.get("FROM_EMAIL") ?? "hello@neverfightorargue.com";
const FROM_NAME = Deno.env.get("FROM_NAME") ?? "Larry & Ro";
const SITE_URL = Deno.env.get("SITE_URL") ?? "https://neverfightorargue.com";
const CHAPTER_PATH = "/assets/never-fight-or-argue-again-chapter-1.pdf";

// Days after signup that each stage goes out.
const SCHEDULE: Record<number, number> = { 1: 2, 2: 5, 3: 9 };

const shell = (body: string, token: string) => `
<!DOCTYPE html><html><body style="margin:0;padding:0;background:#EEEDE3;">
  <table role="presentation" width="100%" cellpadding="0" cellspacing="0" style="background:#EEEDE3;padding:32px 16px;">
    <tr><td align="center">
      <table role="presentation" width="100%" cellpadding="0" cellspacing="0" style="max-width:560px;background:#FFFFFF;border:1px solid #E0DCCF;">
        <tr><td style="background:#080F1E;padding:26px 32px;">
          <div style="font-family:Georgia,serif;font-size:17px;letter-spacing:.08em;text-transform:uppercase;color:#F7F4EC;">
            Never Fight <span style="color:#D4A63C;">or Argue</span> Again
          </div>
          <div style="font-family:Helvetica,Arial,sans-serif;font-size:10px;letter-spacing:.2em;text-transform:uppercase;color:rgba(247,244,236,.5);padding-top:6px;">
            Couples Ministry
          </div>
        </td></tr>
        <tr><td style="padding:32px;font-family:Helvetica,Arial,sans-serif;font-size:16px;line-height:1.65;color:#141C2E;">
          ${body}
        </td></tr>
        <tr><td style="padding:20px 32px;border-top:1px solid #E0DCCF;font-family:Helvetica,Arial,sans-serif;font-size:12px;line-height:1.6;color:#6B7385;">
          You're receiving this because you asked for a free chapter at ${SITE_URL.replace("https://", "")}.<br>
          <a href="${SITE_URL}/unsubscribe/?t=${token}" style="color:#6B7385;">Unsubscribe</a>
        </td></tr>
      </table>
    </td></tr>
  </table>
</body></html>`;

const button = (label: string, href: string) => `
  <p style="margin:26px 0;text-align:center;">
    <a href="${href}" style="display:inline-block;background:#D4A63C;color:#080F1E;text-decoration:none;padding:15px 30px;font-weight:bold;font-size:14px;letter-spacing:.06em;text-transform:uppercase;">${label}</a>
  </p>`;

function emailFor(stage: number, firstName: string, token: string) {
  const name = firstName ? `${firstName},` : "there,";

  if (stage === 1) {
    return {
      subject: "Did you get a chance to read it?",
      html: shell(`
        <p style="margin:0 0 18px;">Hi ${name}</p>
        <p style="margin:0 0 18px;">We sent Chapter One a couple of days ago. No pressure if it's still sitting there &mdash; we know what a week looks like.</p>
        <p style="margin:0 0 18px;">If you did read it, we'd like to know which part landed. Just hit reply. We read every one.</p>
        <p style="margin:0 0 18px;">And if it didn't land at all, tell us that too. That's useful to us.</p>
        <p style="margin:0;">&mdash; Larry &amp; Ro</p>
        ${button("Read it again", SITE_URL + CHAPTER_PATH)}`, token),
    };
  }

  if (stage === 2) {
    return {
      subject: "Which one of you is which?",
      html: shell(`
        <p style="margin:0 0 18px;">Hi ${name}</p>
        <p style="margin:0 0 18px;">Here's what surprises most couples about this book: there isn't one plan. There are two, and you don't both work the same one.</p>
        <p style="margin:0 0 18px;">The spouse carrying the hurt works a <strong>Safety Plan</strong> &mdash; how to say the hard thing without being wounded again in the saying of it.</p>
        <p style="margin:0 0 18px;">The spouse who caused it works a <strong>Readiness Plan</strong> &mdash; how to become someone that's safe to say it to.</p>
        <p style="margin:0 0 18px;">Most people know which one they'd be within about a page. The interesting part is when you each pick, separately, and then compare.</p>
        <p style="margin:0;">&mdash; Larry &amp; Ro</p>`, token),
    };
  }

  return {
    subject: "What Chapter One doesn't tell you",
    html: shell(`
      <p style="margin:0 0 18px;">Hi ${name}</p>
      <p style="margin:0 0 18px;">Chapter One makes the case. It doesn't give you the plan.</p>
      <p style="margin:0 0 18px;">That's on purpose &mdash; the argument has to land first, or the steps just look like more advice. But we don't want to leave you there, so here's the shape of what follows.</p>
      <p style="margin:0 0 18px;">Both spouses prepare separately. Then they meet, and the goal stops being to win and starts being to become one. There's a pause you can call by name when it's going badly &mdash; we call it Stop Loss &mdash; and a way back afterward that doesn't require anyone to grovel.</p>
      <p style="margin:0 0 18px;">That's the rest of the book. And we're not quietly putting it on sale &mdash; we're launching it live, in a room in Tampa, on November 1st. More on that soon.</p>
      <p style="margin:0;">&mdash; Larry &amp; Ro</p>`, token),
  };
}

async function send(to: string, subject: string, html: string) {
  const res = await fetch("https://api.brevo.com/v3/smtp/email", {
    method: "POST",
    headers: {
      "api-key": BREVO_API_KEY,
      "Content-Type": "application/json",
      accept: "application/json",
    },
    body: JSON.stringify({
      sender: { name: FROM_NAME, email: FROM_EMAIL },
      to: [{ email: to }],
      subject,
      htmlContent: html,
      replyTo: { email: FROM_EMAIL },
    }),
  });
  if (!res.ok) console.error("Brevo error", res.status, await res.text());
  return res.ok;
}

Deno.serve(async () => {
  const db = createClient(SUPABASE_URL, SERVICE_KEY, { auth: { persistSession: false } });
  const results: Record<string, number> = { sent: 0, failed: 0 };

  for (const stage of [1, 2, 3]) {
    const days = SCHEDULE[stage];
    const cutoff = new Date(Date.now() - days * 86400000).toISOString();

    // Anyone who got the chapter, hasn't unsubscribed, is on the previous
    // stage, and signed up longer ago than this stage's delay.
    const { data, error } = await db
      .from("subscribers")
      .select("email, first_name, unsubscribe_token")
      .is("unsubscribed_at", null)
      .not("chapters_sent_at", "is", null)
      .eq("drip_stage", stage - 1)
      .lte("created_at", cutoff)
      .limit(60);

    if (error) {
      console.error("query failed", error);
      continue;
    }

    for (const row of data ?? []) {
      const { subject, html } = emailFor(stage, row.first_name ?? "", row.unsubscribe_token);
      const ok = await send(row.email, subject, html);
      if (ok) {
        await db.from("subscribers")
          .update({ drip_stage: stage, drip_last_sent_at: new Date().toISOString() })
          .eq("email", row.email);
        results.sent++;
      } else {
        results.failed++;
      }
    }
  }

  return new Response(JSON.stringify({ ok: true, ...results }), {
    headers: { "Content-Type": "application/json" },
  });
});
