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

const shell = (body: string, footer: string) => `
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
          ${footer}
        </td></tr>
      </table>
    </td></tr>
  </table>
</body></html>`;

const chapterFooter = (token: string) => `
  You're receiving this because you asked for a free chapter at ${SITE_URL.replace("https://", "")}.<br>
  <a href="${SITE_URL}/unsubscribe/?t=${token}" style="color:#6B7385;">Unsubscribe</a>`;

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
        ${button("Read it again", SITE_URL + CHAPTER_PATH)}`, chapterFooter(token)),
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
        <p style="margin:0;">&mdash; Larry &amp; Ro</p>`, chapterFooter(token)),
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
      <p style="margin:0;">&mdash; Larry &amp; Ro</p>`, chapterFooter(token)),
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


// ---------------------------------------------------------------------------
// Launch reminders.
//
// These are tied to the calendar rather than to when someone registered, so
// each one has a date it becomes due. A registrant moves up one stage at a
// time and only ever gets the most recent one they've missed, so somebody who
// signs up in late October doesn't receive the whole run at once.
// ---------------------------------------------------------------------------
const GCAL_LAUNCH =
  "https://calendar.google.com/calendar/render?action=TEMPLATE" +
  "&text=Never%20Fight%20or%20Argue%20Again%20%E2%80%94%20live%20book%20launch" +
  "&dates=20261101/20261102" +
  "&location=Tampa%2C%20Florida";

// stage -> the date it becomes due
const LAUNCH_SCHEDULE: Record<number, string> = {
  1: "2026-10-01",  // a month out — what the evening is
  2: "2026-10-25",  // a week out — details and logistics
  3: "2026-10-30",  // two days out — short and practical
  4: "2026-11-01",  // the morning of
  5: "2026-11-03",  // afterwards, and for anyone who couldn't come
};

function launchEmail(stage: number, firstName: string, inPerson: boolean, token: string) {
  const name = firstName ? `${firstName},` : "there,";
  const cancel = `${SITE_URL}/book-launch/?cancel=${token}`;
  const foot = `You're receiving this because you registered for the launch.<br>
    <a href="${cancel}" style="color:#6B7385;">Can't make it any more?</a>`;

  if (stage === 1) {
    return {
      subject: "One month until November 1st",
      html: shell(`
        <p style="margin:0 0 18px;">Hi ${name}</p>
        <p style="margin:0 0 18px;">A month from today we'll be in a room in Tampa launching <em>Never Fight or Argue Again</em>, and you're on the list.</p>
        <p style="margin:0 0 18px;">Here's what the evening actually is, so you know what you're walking into: the case against fighting fair made in person, both plans walked through end to end, and time for the questions people usually only ask us privately. Anonymous cards if you'd rather not raise a hand.</p>
        <p style="margin:0 0 18px;">Venue and time are still being finalised. You'll have them well before the night.</p>
        <p style="margin:0;">&mdash; Larry &amp; Ro</p>`, foot),
    };
  }

  if (stage === 2) {
    return {
      subject: "A week out — here's what you need",
      html: shell(`
        <p style="margin:0 0 18px;">Hi ${name}</p>
        <p style="margin:0 0 18px;">The launch is a week from today, Sunday November 1st.</p>
        <p style="margin:0 0 18px;">Two things worth doing now. Put it in your calendar if you haven't, and if you're bringing anyone who isn't already registered, send them to <a href="${SITE_URL}/book-launch/" style="color:#9A7A2C;">the registration page</a> so we count the chairs right.</p>
        <p style="margin:0 0 8px;text-align:center;">
          <a href="${GCAL_LAUNCH}" style="display:inline-block;background:#D4A63C;color:#080F1E;text-decoration:none;padding:15px 30px;font-weight:bold;font-size:14px;letter-spacing:.06em;text-transform:uppercase;">Add to Google Calendar</a>
        </p>
        <p style="margin:0 0 22px;text-align:center;font-size:13px;"><a href="${SITE_URL}/assets/launch-nov-1.ics" style="color:#6B7385;">Other calendars</a></p>
        <p style="margin:0 0 18px;">If your plans have changed, <a href="${cancel}" style="color:#9A7A2C;">tell us here</a>. Genuinely no hard feelings &mdash; it just frees the seat.</p>
        <p style="margin:0;">&mdash; Larry &amp; Ro</p>`, foot),
    };
  }

  if (stage === 3) {
    return {
      subject: "Sunday",
      html: shell(`
        <p style="margin:0 0 18px;">Hi ${name}</p>
        <p style="margin:0 0 18px;">Two days out. The launch is this Sunday, November 1st, in Tampa.</p>
        <p style="margin:0 0 18px;">Come early if you can &mdash; we'd rather meet you than start on time. Parking and directions are on <a href="${SITE_URL}/book-launch/" style="color:#9A7A2C;">the event page</a>.</p>
        <p style="margin:0;">&mdash; Larry &amp; Ro</p>`, foot),
    };
  }

  if (stage === 4) {
    return inPerson
      ? {
          subject: "Tonight",
          html: shell(`
            <p style="margin:0 0 18px;">Hi ${name}</p>
            <p style="margin:0 0 18px;">Tonight's the night. We're looking forward to meeting you.</p>
            <p style="margin:0 0 18px;">All the details are on <a href="${SITE_URL}/book-launch/" style="color:#9A7A2C;">the event page</a>. Come early if you can.</p>
            <p style="margin:0 0 18px;">One thing: the book is out today too. If you'd rather have your copy before you arrive, it's <a href="${SITE_URL}/book/" style="color:#9A7A2C;">here</a>.</p>
            <p style="margin:0;">See you tonight.<br>&mdash; Larry &amp; Ro</p>`, foot),
        }
      : {
          subject: "It's out today",
          html: shell(`
            <p style="margin:0 0 18px;">Hi ${name}</p>
            <p style="margin:0 0 18px;"><em>Never Fight or Argue Again</em> is available today.</p>
            <p style="margin:0 0 18px;">You told us Tampa wasn't reachable, so this is your copy of the news &mdash; and in a couple of days we'll send you what we taught from the stage tonight.</p>
            <p style="margin:0 0 22px;text-align:center;">
              <a href="${SITE_URL}/book/" style="display:inline-block;background:#D4A63C;color:#080F1E;text-decoration:none;padding:15px 30px;font-weight:bold;font-size:14px;letter-spacing:.06em;text-transform:uppercase;">Get the book</a>
            </p>
            <p style="margin:0;">&mdash; Larry &amp; Ro</p>`, foot),
        };
  }

  return {
    subject: "What we said on Sunday",
    html: shell(`
      <p style="margin:0 0 18px;">Hi ${name}</p>
      <p style="margin:0 0 18px;">Sunday was something we'll be thinking about for a long time. Thank you to everyone who came out.</p>
      <p style="margin:0 0 18px;">${inPerson
        ? "If you were there — thank you for being in the room. It mattered more than we can put in an email."
        : "You couldn't be in the room, so here's the part we most wanted people to hear."}</p>
      <p style="margin:0 0 18px;">The book is out now, and the invitation in it is the same one we made from the stage: stop trying to fight better. Learn to stop.</p>
      <p style="margin:0;">&mdash; Larry &amp; Ro</p>`, foot),
  };
}

async function runLaunchReminders(db: any, results: Record<string, number>) {
  const today = new Date().toISOString().slice(0, 10);

  for (const stage of [1, 2, 3, 4, 5]) {
    if (today < LAUNCH_SCHEDULE[stage]) continue;   // not due yet

    const { data, error } = await db
      .from("launch_rsvps")
      .select("email, first_name, attending, manage_token")
      .is("cancelled_at", null)
      .eq("reminder_stage", stage - 1)
      .limit(60);

    if (error) { console.error("launch query failed", error); continue; }

    for (const row of data ?? []) {
      const inPerson = row.attending !== "cannot_attend";
      const { subject, html } = launchEmail(stage, row.first_name ?? "", inPerson, row.manage_token);
      const ok = await send(row.email, subject, html);
      if (ok) {
        await db.from("launch_rsvps")
          .update({ reminder_stage: stage, reminder_sent_at: new Date().toISOString() })
          .eq("email", row.email);
        results.launch_sent = (results.launch_sent ?? 0) + 1;
      } else {
        results.launch_failed = (results.launch_failed ?? 0) + 1;
      }
    }
  }
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

  await runLaunchReminders(db, results);

  return new Response(JSON.stringify({ ok: true, ...results }), {
    headers: { "Content-Type": "application/json" },
  });
});
