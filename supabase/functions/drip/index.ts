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
const SUPABASE_URL = Deno.env.get("SUPABASE_URL");
const SERVICE_KEY = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY");
const BREVO_API_KEY = Deno.env.get("BREVO_API_KEY");
const FROM_EMAIL = Deno.env.get("FROM_EMAIL") ?? "hello@neverfightorargue.com";
const FROM_NAME = Deno.env.get("FROM_NAME") ?? "Larry & Ro";
const SITE_URL = Deno.env.get("SITE_URL") ?? "https://neverfightorargue.com";
const CHAPTER_PATH = "/assets/never-fight-or-argue-again-chapter-1.pdf";
// Days after signup that each stage goes out.
const SCHEDULE = {
  1: 2,
  2: 5,
  3: 9
};
const shell = (body, footer)=>`
<!DOCTYPE html><html><body style="margin:0;padding:0;background:#F1EBDD;">
  <table role="presentation" width="100%" cellpadding="0" cellspacing="0" style="background:#F1EBDD;padding:32px 16px;">
    <tr><td align="center">
      <table role="presentation" width="100%" cellpadding="0" cellspacing="0" style="max-width:560px;background:#FFFFFF;border:1px solid #E0D8C4;">
        <tr><td style="background:#0D2D1D;padding:26px 32px;">
          <div style="font-family:Georgia,serif;font-size:17px;letter-spacing:.08em;text-transform:uppercase;color:#F8F4E9;">
            Never Fight <span style="color:#C39A5E;">or Argue</span> Again
          </div>
          <div style="font-family:Helvetica,Arial,sans-serif;font-size:10px;letter-spacing:.2em;text-transform:uppercase;color:rgba(247,243,234,.5);padding-top:6px;">
            Couples Ministry
          </div>
        </td></tr>
        <tr><td style="padding:32px;font-family:Helvetica,Arial,sans-serif;font-size:16px;line-height:1.65;color:#16261C;">
          ${body}
        </td></tr>
        <tr><td style="padding:20px 32px;border-top:1px solid #E0D8C4;font-family:Helvetica,Arial,sans-serif;font-size:12px;line-height:1.6;color:#5C6B60;">
          ${footer}
        </td></tr>
      </table>
    </td></tr>
  </table>
</body></html>`;
const chapterFooter = (token)=>`
  You're receiving this because you asked for a free chapter at ${SITE_URL.replace("https://", "")}.<br>
  <a href="${SITE_URL}/unsubscribe/?t=${token}" style="color:#5C6B60;">Unsubscribe</a>`;
const button = (label, href)=>`
  <p style="margin:26px 0;text-align:center;">
    <a href="${href}" style="display:inline-block;background:#C39A5E;color:#0D2D1D;text-decoration:none;padding:15px 30px;font-weight:bold;font-size:14px;letter-spacing:.06em;text-transform:uppercase;">${label}</a>
  </p>`;
function emailFor(stage, firstName, token) {
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
        ${button("Read it again", SITE_URL + CHAPTER_PATH)}`, chapterFooter(token))
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
        <p style="margin:0;">&mdash; Larry &amp; Ro</p>`, chapterFooter(token))
    };
  }
  return {
    subject: "What Chapter One doesn't tell you",
    html: shell(`
      <p style="margin:0 0 18px;">Hi ${name}</p>
      <p style="margin:0 0 18px;">Chapter One makes the case. It doesn't give you the plan.</p>
      <p style="margin:0 0 18px;">That's on purpose &mdash; the argument has to land first, or the steps just look like more advice. But we don't want to leave you there, so here's the shape of what follows.</p>
      <p style="margin:0 0 18px;">Both spouses prepare separately. Then they meet, and the goal stops being to win and starts being to become one. There's a pause you can call by name when it's going badly &mdash; we call it Stop Loss &mdash; and a way back afterward that doesn't require anyone to grovel.</p>
      <p style="margin:0 0 18px;">That's the rest of the book. And we're not quietly putting it on sale &mdash; we're launching it live, at Grace Family Church, Land O' Lakes Campus, on November 1st. More on that soon.</p>
      <p style="margin:0;">&mdash; Larry &amp; Ro</p>`, chapterFooter(token))
  };
}
async function send(to, subject, html) {
  const res = await fetch("https://api.brevo.com/v3/smtp/email", {
    method: "POST",
    headers: {
      "api-key": BREVO_API_KEY,
      "Content-Type": "application/json",
      accept: "application/json"
    },
    body: JSON.stringify({
      sender: {
        name: FROM_NAME,
        email: FROM_EMAIL
      },
      to: [
        {
          email: to
        }
      ],
      subject,
      htmlContent: html,
      replyTo: {
        email: Deno.env.get("REPLY_TO") ?? "larry@kdmcommunity.com"
      }
    })
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
const GCAL_LAUNCH = "https://calendar.google.com/calendar/render?action=TEMPLATE&text=Never%20Fight%20or%20Argue%20Again%20%E2%80%94%20live%20book%20launch&dates=20261101T223000Z/20261102T003000Z&details=The%20live%20launch%20of%20Never%20Fight%20or%20Argue%20Again%20by%20Larry%20%26%20Rolanda%20Beacham.%0A%0ADoors%205%3A30pm.%20Free%20to%20attend.%0A%0Ahttps%3A//neverfightorargue.com/book-launch/&location=Grace%20Family%20Church%2C%20Land%20O%27%20Lakes%20Campus%2C%2022920%20State%20Road%2054%2C%20Lutz%2C%20FL%2033549&ctz=America/New_York";
const DIRECTIONS = "https://www.google.com/maps/dir/?api=1&destination=22920+State+Road+54%2C+Lutz%2C+FL+33549";
const VENUE_LINES = `
    Sunday, November 1 &middot; 5:30&nbsp;PM<br>
    Grace Family Church, Land O' Lakes Campus<br>
    22920 State Road 54, Lutz, FL 33549<br>
    <a href="${DIRECTIONS}" style="color:#8A6330;">Get directions</a>`;
const HOME_NOTE = `<p style="margin:0 0 22px;">If you call Grace home, just note that we're at the Land O' Lakes Campus that night.</p>`;
const VENUE_HTML = `
  <p style="margin:0 0 18px;">${VENUE_LINES}</p>
  ${HOME_NOTE}`;
const FAQ_HTML = `
  <p style="margin:0 0 10px;font-family:Georgia,serif;font-size:17px;color:#0D2D1D;"><strong>Quick FAQ</strong></p>
  <p style="margin:0 0 10px;"><strong>What should I wear?</strong><br>Semi-formal.</p>
  <p style="margin:0 0 10px;"><strong>Is it free?</strong><br>Yes. Registration is all you need.</p>
  <p style="margin:0 0 10px;"><strong>Can I bring someone?</strong><br>Yes. If they aren't registered yet, send them to the <a href="${SITE_URL}/book-launch/" style="color:#8A6330;">registration page</a> so we save them a seat.</p>
  <p style="margin:0 0 22px;"><strong>Where do I park?</strong><br>Parking is on site.</p>`;
// stage -> the date it becomes due
// stage -> the UTC moment it becomes due (cron runs hourly at :07)
const LAUNCH_SCHEDULE = {
  1: "2026-10-01T00:00:00Z",
  2: "2026-10-25T00:00:00Z", // Sat Oct 24, ~8:07 PM ET
  3: "2026-10-30T00:00:00Z", // Thu Oct 29, ~8:07 PM ET
  4: "2026-11-01T14:00:00Z", // Sun Nov 1, ~9:07 AM EST (DST ends that morning)
  5: "2026-11-03T00:00:00Z"
};
// Beat the Line pre-order block for the reminder emails. level 1 = soft, 2 = push, 3 = last call.
function preorderBox(level) {
  const btn = (label) => `<a href="${SITE_URL}/pre-order/" style="display:inline-block;margin-top:12px;background:#0D2D1D;color:#F7F3EA;text-decoration:none;padding:11px 20px;font-weight:bold;font-size:13px;letter-spacing:.06em;text-transform:uppercase;">${label}</a>`;
  const deal = `<span style="display:inline-block;margin-top:8px;padding:6px 10px;background:#0D2D1D;color:#F7F3EA;font-size:13px;border-radius:3px;">Order more &amp; save: 2 copies $19 each &middot; 3 for $18 &middot; 4 for $16 &middot; <b>5 for $75</b></span>`;
  const inner = level === 1
    ? `<strong style="font-size:16px;">One thing you can do now: beat the line.</strong><br>
       Most people will queue at the book table after the program. Pre-order your signed copy ($20, same as at the table) and yours will be waiting at the <strong>express table</strong> with your name on it &mdash; plus <strong>reserved front-section seating</strong> and the <strong>laminated Frameworks Bundle</strong>, the classroom tools that aren't printed in the book.<br>${deal}<br>${btn("Pre-order &amp; beat the line")}`
    : level === 2
    ? `<strong style="font-size:16px;">Pre-orders: this is the week.</strong><br>
       We sign and bag every pre-ordered copy before the night, so the sooner you order the better. Pre-order now and you skip the book line, sit up front, and take home the <strong>laminated Frameworks Bundle</strong> &mdash; which only pre-orders get.<br>${deal}<br>${btn("Pre-order before the weekend")}`
    : `<strong style="font-size:16px;">Last call to beat the line.</strong><br>
       Pre-orders close Saturday night so we can have every copy signed and at the express table. If you were going to buy the book anyway, this is the moment: same $20, no line, reserved seat, and the Frameworks Bundle.<br>${btn("Pre-order now")}`;
  return `<table role="presentation" cellpadding="0" cellspacing="0" style="width:100%;border:1px solid #D9C7A3;background:#F6EEDC;margin:0 0 22px;">
    <tr><td style="padding:18px 20px;font-family:Helvetica,Arial,sans-serif;font-size:15px;line-height:1.6;color:#16261C;">${inner}</td></tr></table>`;
}
function launchEmail(stage, firstName, inPerson, token) {
  const name = firstName ? `${firstName},` : "there,";
  const cancel = `${SITE_URL}/book-launch/?cancel=${token}`;
  const foot = `You're receiving this because you registered for the launch.<br>
    <a href="${cancel}" style="color:#5C6B60;">Can't make it any more?</a>`;
  if (stage === 1) {
    return {
      subject: "One month until November 1st",
      html: shell(`
        <p style="margin:0 0 18px;">Hi ${name}</p>
        <p style="margin:0 0 18px;">A month from today we'll be at Grace Family Church, Land O Lakes Campus in Lutz launching <em>Never Fight or Argue Again</em>, and you're on the list.</p>
        <p style="margin:0 0 18px;">Here's what the evening actually is, so you know what you're walking into: the case against fighting fair made in person, both plans walked through end to end, and time for the questions people usually only ask us privately. Anonymous cards if you'd rather not raise a hand.</p>
        ${VENUE_HTML}
        <p style="margin:0 0 18px;">Parking is on site. Doors at 5:30 &mdash; come early if you can.</p>
        ${preorderBox(1)}
        <p style="margin:0;">&mdash; Larry &amp; Ro</p>`, foot)
    };
  }
  if (stage === 2) {
    return {
      subject: "One week from tomorrow!",
      html: shell(`
        <p style="margin:0 0 18px;">Hi ${name}</p>
        <p style="margin:0 0 18px;">One week from tomorrow, we get to celebrate with you.</p>
        <p style="margin:0 0 18px;">November 1st is a big night for us. It's the launch of <em>Never Fight or Argue Again</em>, and it's our 30-year anniversary. We've been praying over this night and the people who'll be in that room, and that includes you. We can't wait to see you there.</p>
        <p style="margin:0 0 18px;"><strong>Here's where we'll be:</strong><br>${VENUE_LINES}</p>
        ${HOME_NOTE}
        ${FAQ_HTML}
        <p style="margin:0 0 8px;text-align:center;">
          <a href="${GCAL_LAUNCH}" style="display:inline-block;background:#C39A5E;color:#0D2D1D;text-decoration:none;padding:15px 30px;font-weight:bold;font-size:14px;letter-spacing:.06em;text-transform:uppercase;">Add to Google Calendar</a>
        </p>
        <p style="margin:0 0 22px;text-align:center;font-size:13px;"><a href="${SITE_URL}/assets/launch-nov-1.ics" style="color:#5C6B60;">Other calendars</a></p>
        <p style="margin:0 0 18px;">If your plans have changed, just <a href="${cancel}" style="color:#8A6330;">let us know here</a>. No hard feelings at all. It frees up the seat for someone else.</p>
        <table role="presentation" cellpadding="0" cellspacing="0" style="width:100%;border:1px solid #D9C7A3;background:#F6EEDC;margin:0 0 22px;">
          <tr><td style="padding:18px 20px;font-family:Helvetica,Arial,sans-serif;font-size:15px;line-height:1.6;color:#16261C;">
            <strong style="font-size:16px;">Want to skip the book line?</strong><br>
            We're signing and bagging every pre-ordered copy before the night. Pre-order now and you skip the line, sit up front, and take home the laminated Frameworks Bundle, which only pre-orders get.<br>
            <span style="display:inline-block;margin-top:8px;padding:6px 10px;background:#0D2D1D;color:#F7F3EA;font-size:13px;border-radius:3px;">Order more and save: 2 copies $19 each &middot; 3 for $18 &middot; 4 for $16 &middot; 5 for $75</span><br>
            <a href="${SITE_URL}/pre-order/" style="display:inline-block;margin-top:12px;background:#0D2D1D;color:#F7F3EA;text-decoration:none;padding:11px 20px;font-weight:bold;font-size:13px;letter-spacing:.06em;text-transform:uppercase;">Pre-order your copy</a>
          </td></tr>
        </table>
        <p style="margin:0;">See you next Sunday,<br>Larry &amp; Ro</p>`, foot)
    };
  }
  if (stage === 3) {
    return {
      subject: "Sunday",
      html: shell(`
        <p style="margin:0 0 18px;">Hi ${name}</p>
        <p style="margin:0 0 18px;">This Sunday.</p>
        ${VENUE_HTML}
        ${FAQ_HTML}
        <p style="margin:0 0 18px;">Parking is on site. Come a little early if you can so you can mingle and get a comfortable seat.</p>
        ${preorderBox(3)}
        <p style="margin:0;">&mdash; Larry &amp; Ro</p>`, foot)
    };
  }
  if (stage === 4) {
    return inPerson ? {
      subject: "Tonight",
      html: shell(`
            <p style="margin:0 0 18px;">Hi ${name}</p>
            <p style="margin:0 0 18px;">Today's the day. We're looking forward to meeting you tonight.</p>
            ${VENUE_HTML}
            ${FAQ_HTML}
            <p style="margin:0 0 18px;">Doors at 5:30. Come early if you can.</p>
            <p style="margin:0 0 18px;">If you pre-ordered, your signed copy and the Frameworks Bundle are at the <strong>express table</strong> &mdash; show your pickup pass (it's in your pre-order email). If you didn't, the book table opens after the program and takes cards.</p>
            <p style="margin:0;">See you tonight.<br>&mdash; Larry &amp; Ro</p>`, foot)
    } : {
      subject: "It's out today",
      html: shell(`
            <p style="margin:0 0 18px;">Hi ${name}</p>
            <p style="margin:0 0 18px;"><em>Never Fight or Argue Again</em> is available today.</p>
            <p style="margin:0 0 18px;">You told us you couldn't travel, so this is your copy of the news &mdash; and in a couple of days we'll send you what we taught from the stage tonight.</p>
            <p style="margin:0 0 22px;text-align:center;">
              <a href="${SITE_URL}/book/" style="display:inline-block;background:#C39A5E;color:#0D2D1D;text-decoration:none;padding:15px 30px;font-weight:bold;font-size:14px;letter-spacing:.06em;text-transform:uppercase;">Get the book</a>
            </p>
            <p style="margin:0;">&mdash; Larry &amp; Ro</p>`, foot)
    };
  }
  return {
    subject: "What we said on Sunday",
    html: shell(`
      <p style="margin:0 0 18px;">Hi ${name}</p>
      <p style="margin:0 0 18px;">Sunday was something we'll be thinking about for a long time. Thank you to everyone who came out.</p>
      <p style="margin:0 0 18px;">${inPerson ? "If you were there — thank you for being in the room. It mattered more than we can put in an email." : "You couldn't be in the room, so here's the part we most wanted people to hear."}</p>
      <p style="margin:0 0 18px;">The book is out now, and the invitation in it is the same one we made from the stage: stop trying to fight better. Learn to stop.</p>
      <p style="margin:0;">&mdash; Larry &amp; Ro</p>`, foot)
  };
}
async function runLaunchReminders(db, results) {
  const now = Date.now();
  for (const stage of [
    1,
    2,
    3,
    4,
    5
  ]){
    if (now < Date.parse(LAUNCH_SCHEDULE[stage])) continue; // not due yet
    const { data, error } = await db.from("launch_rsvps").select("email, first_name, attending, manage_token").is("cancelled_at", null).eq("reminder_stage", stage - 1).limit(60);
    if (error) {
      console.error("launch query failed", error);
      continue;
    }
    for (const row of data ?? []){
      const inPerson = row.attending !== "cannot_attend";
      const { subject, html } = launchEmail(stage, row.first_name ?? "", inPerson, row.manage_token);
      const ok = await send(row.email, subject, html);
      if (ok) {
        await db.from("launch_rsvps").update({
          reminder_stage: stage,
          reminder_sent_at: new Date().toISOString()
        }).eq("email", row.email);
        results.launch_sent = (results.launch_sent ?? 0) + 1;
      } else {
        results.launch_failed = (results.launch_failed ?? 0) + 1;
      }
    }
  }
}
Deno.serve(async ()=>{
  const db = createClient(SUPABASE_URL, SERVICE_KEY, {
    auth: {
      persistSession: false
    }
  });
  const results = {
    sent: 0,
    failed: 0
  };
  for (const stage of [
    1,
    2,
    3
  ]){
    const days = SCHEDULE[stage];
    const cutoff = new Date(Date.now() - days * 86400000).toISOString();
    // Anyone who got the chapter, hasn't unsubscribed, is on the previous
    // stage, and signed up longer ago than this stage's delay.
    const { data, error } = await db.from("subscribers").select("email, first_name, unsubscribe_token").is("unsubscribed_at", null).not("chapters_sent_at", "is", null).eq("drip_stage", stage - 1).lte("created_at", cutoff).limit(60);
    if (error) {
      console.error("query failed", error);
      continue;
    }
    for (const row of data ?? []){
      const { subject, html } = emailFor(stage, row.first_name ?? "", row.unsubscribe_token);
      const ok = await send(row.email, subject, html);
      if (ok) {
        await db.from("subscribers").update({
          drip_stage: stage,
          drip_last_sent_at: new Date().toISOString()
        }).eq("email", row.email);
        results.sent++;
      } else {
        results.failed++;
      }
    }
  }
  await runLaunchReminders(db, results);
  return new Response(JSON.stringify({
    ok: true,
    ...results
  }), {
    headers: {
      "Content-Type": "application/json"
    }
  });
});
