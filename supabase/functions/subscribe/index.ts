// =====================================================================
// Never Fight or Argue Again — subscribe function
//
// Handles every form on the site:
//   kind: "chapters"  -> save subscriber, email them the free chapter
//   kind: "church"    -> save inquiry, email Larry & Ro
//   kind: "speaking"  -> save inquiry, email Larry & Ro
//
// Deploy:  supabase functions deploy subscribe --no-verify-jwt
// =====================================================================
import { createClient } from "https://esm.sh/@supabase/supabase-js@2";
// ---- environment ----------------------------------------------------
// SUPABASE_URL and SUPABASE_SERVICE_ROLE_KEY are injected automatically.
// The rest you set with: supabase secrets set NAME=value
const SUPABASE_URL = Deno.env.get("SUPABASE_URL");
const SERVICE_KEY = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY");
const BREVO_API_KEY = Deno.env.get("BREVO_API_KEY");
const FROM_EMAIL = Deno.env.get("FROM_EMAIL") ?? "hello@neverfightorargue.com";
const FROM_NAME = Deno.env.get("FROM_NAME") ?? "Larry & Ro";
// Optional: the Brevo list new subscribers get added to, so you can send
// newsletters from Brevo later. Leave unset and they are still saved to
// your own database, just not pushed to Brevo's contact list.
const BREVO_LIST_ID = Deno.env.get("BREVO_LIST_ID");
const NOTIFY_EMAIL = Deno.env.get("NOTIFY_EMAIL") ?? "hello@neverfightorargue.com";
// Reply-To must stay on neverfightorargue.com (not larry@kdmcommunity.com / KDM).
// Optional overrides via secrets; defaults match Larry's Oct 5 inbound-mail decision.
const REPLY_TO = Deno.env.get("REPLY_TO") ?? "hello@neverfightorargue.com";
const REPLY_TO_CHURCHES = Deno.env.get("REPLY_TO_CHURCHES") ?? "churches@neverfightorargue.com";
const REPLY_TO_SPEAKING = Deno.env.get("REPLY_TO_SPEAKING") ?? "speaking@neverfightorargue.com";
const SITE_URL = Deno.env.get("SITE_URL") ?? "https://neverfightorargue.com";
const CHAPTER_PATH = "/assets/never-fight-or-argue-again-chapter-1.pdf?v=2";
const ALLOWED_ORIGINS = [
  "https://neverfightorargue.com",
  "https://www.neverfightorargue.com"
];
function corsHeaders(origin) {
  // github.io is allowed so you can test on the temporary GitHub Pages URL
  // before the custom domain finishes propagating.
  const ok = origin && (ALLOWED_ORIGINS.includes(origin) || origin.endsWith(".github.io") || origin.startsWith("http://localhost"));
  return {
    "Access-Control-Allow-Origin": ok ? origin : ALLOWED_ORIGINS[0],
    "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
    "Access-Control-Allow-Methods": "POST, OPTIONS",
    "Content-Type": "application/json"
  };
}
const EMAIL_RE = /^[^\s@]+@[^\s@]+\.[^\s@]{2,}$/;
const clean = (v, max = 2000)=>typeof v === "string" ? v.trim().slice(0, max) : "";
async function hashIp(ip) {
  const data = new TextEncoder().encode(ip + "|nfoaa");
  const buf = await crypto.subtle.digest("SHA-256", data);
  return [
    ...new Uint8Array(buf)
  ].map((b)=>b.toString(16).padStart(2, "0")).join("").slice(0, 32);
}
async function sendEmail(to, subject, html, replyTo) {
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
      // Replies always go somewhere a human reads. hello@/churches@/speaking@ forward
      // to Brevo Conversations + Gmail via ImprovMX (Oct 5, 2026).
      replyTo: {
        email: replyTo || REPLY_TO,
        ...(replyTo ? {} : { name: FROM_NAME })
      }
    })
  });
  if (!res.ok) {
    console.error("Brevo send error", res.status, await res.text());
    return false;
  }
  return true;
}
// Mirror the subscriber into Brevo's contact list so you can write
// newsletters from Brevo's dashboard later. Never blocks the signup —
// if this fails, the person is still in your database and still gets
// their chapters.
async function addBrevoContact(email, firstName) {
  if (!BREVO_LIST_ID) return;
  try {
    const res = await fetch("https://api.brevo.com/v3/contacts", {
      method: "POST",
      headers: {
        "api-key": BREVO_API_KEY,
        "Content-Type": "application/json",
        accept: "application/json"
      },
      body: JSON.stringify({
        email,
        attributes: firstName ? {
          FIRSTNAME: firstName
        } : {},
        listIds: [
          Number(BREVO_LIST_ID)
        ],
        updateEnabled: true
      })
    });
    if (!res.ok) console.error("Brevo contact error", res.status, await res.text());
  } catch (e) {
    console.error("Brevo contact threw", e);
  }
}
// ---- email templates ------------------------------------------------
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
function chaptersEmail(firstName, token) {
  const name = firstName ? `${firstName},` : "there,";
  return shell(`
    <p style="margin:0 0 18px;">Hi ${name}</p>
    <p style="margin:0 0 18px;">Thank you for requesting a chapter of our book!</p>
    <p style="margin:0 0 18px;">Most marriage advice starts from the assumption that fighting is normal, and the best you can do is fight fair. This chapter explains why we stopped believing that &mdash; and what we found on the other side of it.</p>
    <p style="margin:0 0 26px;">One suggestion: read it on your own first. Don't hand it to your spouse yet. When you're ready, the invitation lands better than the evidence does.</p>
    <p style="margin:0 0 28px;text-align:center;">
      <a href="${SITE_URL}${CHAPTER_PATH}"
         style="display:inline-block;background:#C39A5E;color:#0D2D1D;text-decoration:none;padding:15px 30px;font-weight:bold;font-size:14px;letter-spacing:.06em;text-transform:uppercase;">
        Download the chapter
      </a>
    </p>
    <p style="margin:0;">&mdash; Larry &amp; Ro</p>`, `You're receiving this because you requested a free chapter at ${SITE_URL.replace("https://", "")}.<br>
     <a href="${SITE_URL}/unsubscribe/?t=${token}" style="color:#5C6B60;">Unsubscribe</a>`);
}
// ---------------------------------------------------------------------------
// Launch RSVPs — the 1 November event in Tampa.
// ---------------------------------------------------------------------------
const GCAL_LAUNCH = "https://calendar.google.com/calendar/render?action=TEMPLATE&text=Never%20Fight%20or%20Argue%20Again%20%E2%80%94%20live%20book%20launch&dates=20261101T223000Z/20261102T003000Z&details=The%20live%20launch%20of%20Never%20Fight%20or%20Argue%20Again%20by%20Larry%20%26%20Rolanda%20Beacham.%0A%0ADoors%205%3A30pm.%20Free%20to%20attend.%0A%0Ahttps%3A//neverfightorargue.com/book-launch/&location=Grace%20Family%20Church%2C%2022920%20FL-54%2C%20Lutz%2C%20FL%2033549&ctz=America/New_York";
const DIRECTIONS = "https://www.google.com/maps/dir/?api=1&destination=Grace+Family+Church%2C+22920+FL-54%2C+Lutz%2C+FL+33549";
function launchConfirmEmail(firstName, guests, inPerson, token) {
  const name = firstName ? `${firstName},` : "there,";
  const seats = guests > 1 ? `${guests} seats are` : "a seat is";
  const body = inPerson ? `
      <p style="margin:0 0 18px;">Hi ${name}</p>
      <p style="margin:0 0 18px;">You're registered for the launch of <em>Never Fight or Argue Again</em> &mdash; ${seats} held for you.</p>
      <table role="presentation" cellpadding="0" cellspacing="0" style="width:100%;border:1px solid #E0D8C4;background:#FBF7EE;margin:0 0 22px;">
        <tr><td style="padding:18px 20px;font-family:Helvetica,Arial,sans-serif;font-size:15px;line-height:1.6;color:#16261C;">
          <strong style="font-size:17px;">Sunday, November 1st &middot; 5:30&nbsp;pm</strong><br>
          <strong>Grace Family Church</strong><br>
          22920 FL-54, Lutz, FL 33549<br>
          <a href="${DIRECTIONS}" style="color:#8A6330;">Get directions</a>
        </td></tr>
      </table>
      <p style="margin:0 0 22px;">Doors open at 5:30. Come a little early if you can so you can mingle and get a comfortable seat. Put it somewhere you'll see it:</p>
      <p style="margin:0 0 8px;text-align:center;">
        <a href="${GCAL_LAUNCH}" style="display:inline-block;background:#C39A5E;color:#0D2D1D;text-decoration:none;padding:15px 30px;font-weight:bold;font-size:14px;letter-spacing:.06em;text-transform:uppercase;">Add to Google Calendar</a>
      </p>
      <p style="margin:0 0 26px;text-align:center;font-size:13px;">
        <a href="${SITE_URL}/assets/launch-nov-1.ics" style="color:#5C6B60;">Other calendars (.ics)</a>
      </p>
      <p style="margin:0 0 18px;">If your plans change, just <a href="${SITE_URL}/book-launch/?cancel=${token}" style="color:#8A6330;">let us know here</a>.</p>
      <table role="presentation" cellpadding="0" cellspacing="0" style="width:100%;border:1px solid #D9C7A3;background:#F6EEDC;margin:0 0 22px;">
        <tr><td style="padding:18px 20px;font-family:Helvetica,Arial,sans-serif;font-size:15px;line-height:1.6;color:#16261C;">
          <strong style="font-size:16px;">Beat the line on November 1st.</strong><br>
          Pre-order your signed copy now ($20, same as at the table) and you'll skip the book line entirely: <strong>express pickup</strong> with your name on it, <strong>reserved front-section seating</strong>, and the <strong>laminated Frameworks Bundle</strong> &mdash; the classroom tools that aren't printed in the book.<br>
          <span style="display:inline-block;margin-top:8px;padding:6px 10px;background:#0D2D1D;color:#F7F3EA;font-size:13px;border-radius:3px;">Order more &amp; save: 2 copies $19 each &middot; 3 for $18 &middot; 4 for $16 &middot; <b>5 for $75 ($15 each)</b></span><br>
          <a href="${SITE_URL}/pre-order/" style="display:inline-block;margin-top:12px;background:#0D2D1D;color:#F7F3EA;text-decoration:none;padding:11px 20px;font-weight:bold;font-size:13px;letter-spacing:.06em;text-transform:uppercase;">Pre-order &amp; beat the line</a>
        </td></tr>
      </table>
      <p style="margin:0;">&mdash; Larry &amp; Ro</p>` : `
      <p style="margin:0 0 18px;">Hi ${name}</p>
      <p style="margin:0 0 18px;">You're on the list for November 1st. You told us Tampa isn't reachable, so here's what that means for you.</p>
      <p style="margin:0 0 18px;">On launch day you'll get the book link in the morning. A couple of days later we'll send what we taught from the stage that night, so the evening isn't lost on you just because you couldn't be in the room.</p>
      <p style="margin:0 0 18px;">And if things change and you can make it after all, just reply to this email and we'll add you back to the headcount.</p>
      <p style="margin:0;">&mdash; Larry &amp; Ro</p>`;
  return shell(body, `
    You're receiving this because you registered for the launch at ${SITE_URL.replace("https://", "")}.<br>
    <a href="${SITE_URL}/book-launch/?cancel=${token}" style="color:#5C6B60;">Can't make it any more?</a>`);
}
// ---------------- sponsorship ----------------
const SPONSOR_URL = `${SITE_URL}/sponsor/`;
const SPONSOR_TIERS = {
  presenting: { name: "Presenting Sponsor", amount: 2500 },
  gold:       { name: "Gold Sponsor",       amount: 1000 },
  silver:     { name: "Silver Sponsor",     amount: 500 },
  reception:  { name: "Reception Sponsor",  amount: 1500 },
  gift:       { name: "Guest Gift Sponsor", amount: 750 },
  couple:     { name: "Gift a Signed Copy",  amount: 20 }
};
function sponsorInviteEmail(firstName) {
  const name = firstName ? `${firstName},` : "there,";
  const row = (tier, price, what) => `<tr>
      <td style="padding:10px 12px 10px 0;vertical-align:top;white-space:nowrap;"><b>${tier}</b><br><span style="color:#8A6330;">${price}</span></td>
      <td style="padding:10px 0;vertical-align:top;color:#2E3A47;">${what}</td></tr>`;
  return shell(`
    <p style="margin:0 0 18px;">Hi ${name}</p>
    <p style="margin:0 0 18px;">Thank you for registering for the launch of <em>Never Fight or Argue Again</em> on November 1st &mdash; and thank you for ticking the box about sponsoring. It means a great deal to us that you'd consider putting your business or ministry behind this night.</p>
    <p style="margin:0 0 12px;">Here's what sponsorship looks like. Every level includes reserved seats and recognition on the night; the higher levels put your name in front of more people, more often.</p>
    <table style="width:100%;border-collapse:collapse;font-size:14px;line-height:1.5;margin:0 0 18px;border-top:1px solid #E4DCCB;">
      ${row("Presenting Sponsor", "$2,500 &middot; one available", "Two minutes on stage. Stage banner (provided by you), large featured logo on the screens, thanked by name from the stage, logo on the digital program, reserved front table for 8, table displays on every table, and 10 signed books.")}
      ${row("Reception Sponsor", "$1,500 &middot; one available", "Host the food and drinks. Displays at the food table, thanked by name from the stage, logo on the digital program, reserved front table for 6, and 5 signed books.")}
      ${row("Gold Sponsor", "$1,000 &middot; three available", "Logo on the screens and the digital program, thanked by name from the stage, table display on every table, and 3 signed books.")}
      ${row("Guest Gift Sponsor", "$750 &middot; one available", "Your name on the gift everyone takes home &mdash; a branded card inside every guest gift, logo on the screens and the digital program, thanked from the stage, and 2 signed books.")}
      ${row("Silver Sponsor", "$500 &middot; six available", "Logo on the screens and the digital program, thanked from the stage, and 2 signed books.")}
    </table>
    <p style="margin:0 0 18px;"><b>How it works:</b> choose a level on the page below and tell us who to talk to. <b>No payment is taken on the page</b> &mdash; it's a reservation. We call you within a business day, then collect payment by secure card link, Zelle or check. Logos are due October 18th so they make the printed program.</p>
    <p style="margin:0 0 22px;"><a href="${SPONSOR_URL}" style="display:inline-block;background:#0D2D1D;color:#F7F3EA;text-decoration:none;padding:12px 22px;border-radius:3px;font-weight:700;">Choose a sponsorship level</a></p>
    <p style="margin:0 0 18px;">If it's easier to talk it through first, just reply to this email with a good time and number &mdash; it comes straight to us.</p>
    <p style="margin:0;">&mdash; Larry &amp; Ro</p>`, `This page isn't linked from the site &mdash; it's just for the people who asked.`);
}
function sponsorLeadEmail(first_name, last_name, email, phone, guests, notes) {
  return shell(`<p style="margin:0 0 14px;font-size:15px;color:#5C6B60;">Sponsorship lead &mdash; from the RSVP form</p>
     <p style="margin:0 0 14px;"><b>${first_name} ${last_name}</b> registered for November 1st and ticked <i>&ldquo;I own a business or ministry &mdash; tell me about sponsoring the launch.&rdquo;</i></p>
     <table style="border-collapse:collapse;font-size:14px;">
       <tr><td style="padding:4px 12px 4px 0;color:#5C6B60;">Email</td><td style="padding:4px 0;"><a href="mailto:${email}" style="color:#8A6330;">${email}</a></td></tr>
       <tr><td style="padding:4px 12px 4px 0;color:#5C6B60;">Phone</td><td style="padding:4px 0;"><b>${phone || "—"}</b></td></tr>
       <tr><td style="padding:4px 12px 4px 0;color:#5C6B60;">Seats</td><td style="padding:4px 0;">${guests}</td></tr>
       ${notes ? `<tr><td style="padding:4px 12px 4px 0;color:#5C6B60;vertical-align:top;">Encouragement</td><td style="padding:4px 0;">${String(notes).replace(/</g, "&lt;")}</td></tr>` : ""}
     </table>
     <p style="margin:14px 0 0;font-size:14px;color:#5C6B60;">They've been sent the sponsorship email with the levels and the link to ${SPONSOR_URL}. If they haven't reserved a level within a day or two, this is your cue to reach out &mdash; reply to this email and it goes to them.</p>`,
     `Backup so nobody who asked about sponsoring slips through.`);
}
function sponsorConfirmEmail(contact, tier, amount, qty, payPref) {
  const name = contact ? `${contact.split(" ")[0]},` : "there,";
  const total = amount * (qty || 1);
  const pay = payPref === "card" ? "We'll send a secure card-payment link." : payPref === "zelle" ? "Zelle details are in the invoice." : "We'll send an invoice you can pay by card, Zelle, or check.";
  return shell(`
    <p style="margin:0 0 18px;">Hi ${name}</p>
    <p style="margin:0 0 18px;">Thank you. We've reserved the <strong>${tier}</strong>${qty > 1 ? ` &times; ${qty}` : ""} for you &mdash; <strong>$${total.toLocaleString()}</strong>. Here's what happens next:</p>
    <ol style="margin:0 0 18px;padding-left:20px;">
      <li style="margin-bottom:8px;"><strong>We call you.</strong> Larry or Rolanda will reach out within one business day to say thank you properly and confirm the details.</li>
      <li style="margin-bottom:8px;"><strong>Invoice.</strong> ${pay} Payment within 7 days holds your spot; nothing is final until then.</li>
      <li style="margin-bottom:8px;"><strong>Your logo.</strong> Reply to this email with a logo file (PNG or SVG, the bigger the better) and the name you'd like us to use. We need it by <strong>October 18th</strong> to make the printed materials.</li>
      <li><strong>November 1st.</strong> Your reserved seats will be waiting, and you'll hear from us again the week after with photos and a proper thank-you.</li>
    </ol>
    <p style="margin:0 0 18px;">If anything about this doesn't look right, just reply &mdash; it comes straight to us.</p>
    <p style="margin:0 0 18px;font-size:14px;color:#5C6B60;">One more thing, if you'd like: <a href="https://donate.stripe.com/28E00k71E5usaNs7uz5Vu00" style="color:#8A6330;">$20 gifts a signed copy</a> to another couple &mdash; handed to them on the night.</p>
    <p style="margin:0;">&mdash; Larry &amp; Ro</p>`);
}
function sponsorNotifyEmail(pretty) {
  return shell(`<p style="margin:0 0 18px;font-size:15px;color:#5C6B60;">New sponsorship commitment</p>
     <table style="width:100%;border-collapse:collapse;font-size:14px;">${pretty}</table>
     <p style="margin:18px 0 0;font-size:14px;color:#5C6B60;">Next: call them within a business day, send the invoice, and ask for the logo.</p>`, `Sent from the sponsorship page. Reply to reach them directly.`);
}
function launchNotifyEmail(pretty) {
  return shell(`<p style="margin:0 0 18px;font-size:15px;color:#5C6B60;">New launch registration</p>
     <table style="width:100%;border-collapse:collapse;font-size:14px;">${pretty}</table>`, `Sent from the book launch page. Reply to reach them directly.`);
}
function inquiryReceipt(kind, firstName) {
  const name = firstName ? `${firstName},` : "there,";
  const what = kind === "church" ? "running <em>Never Fight or Argue Again</em> with a group" : "having us speak";
  const next = kind === "church" ? "We'll come back with pricing, what a group your size usually needs, and how the discussion guide works week to week." : "We'll come back with availability, what we'd suggest for your group, and what we'd need from you.";
  return shell(`
    <p style="margin:0 0 18px;">Hi ${name}</p>
    <p style="margin:0 0 18px;">Thank you for reaching out about ${what}. This is just to confirm it reached us &mdash; nothing else is needed from you right now.</p>
    <p style="margin:0 0 18px;">${next} Expect to hear from one of us within two business days, and it will be a real reply, not an automated one.</p>
    <p style="margin:0 0 18px;">If anything changes in the meantime, or you think of something you forgot to mention, just reply to this email. It comes straight to us.</p>
    <p style="margin:0;">&mdash; Larry &amp; Ro</p>`);
}
function inquiryEmail(kind, d, extra) {
  const rows = Object.entries(extra).filter(([, v])=>v).map(([k, v])=>`<tr><td style="padding:6px 14px 6px 0;color:#5C6B60;white-space:nowrap;vertical-align:top;">${k}</td><td style="padding:6px 0;">${String(v).replace(/</g, "&lt;")}</td></tr>`).join("");
  return shell(`
    <p style="margin:0 0 18px;font-size:18px;"><strong>New ${kind} inquiry</strong></p>
    <table style="font-family:Helvetica,Arial,sans-serif;font-size:15px;line-height:1.6;">
      <tr><td style="padding:6px 14px 6px 0;color:#5C6B60;">Name</td><td style="padding:6px 0;">${d.first_name} ${d.last_name}</td></tr>
      <tr><td style="padding:6px 14px 6px 0;color:#5C6B60;">Email</td><td style="padding:6px 0;"><a href="mailto:${d.email}">${d.email}</a></td></tr>
      ${d.organization ? `<tr><td style="padding:6px 14px 6px 0;color:#5C6B60;">Organization</td><td style="padding:6px 0;">${d.organization}</td></tr>` : ""}
      ${rows}
    </table>
    <p style="margin:22px 0 0;color:#5C6B60;font-size:13px;">Reply straight to this email to answer them.</p>`, `Sent automatically from ${SITE_URL.replace("https://", "")}.`);
}
// ---- handler --------------------------------------------------------
Deno.serve(async (req)=>{
  const origin = req.headers.get("origin");
  const headers = corsHeaders(origin);
  if (req.method === "OPTIONS") return new Response("ok", {
    headers
  });
  if (req.method !== "POST") {
    return new Response(JSON.stringify({
      error: "Method not allowed"
    }), {
      status: 405,
      headers
    });
  }
  try {
    const body = await req.json();
    // Honeypot: real people never fill this in.
    if (clean(body["company-website"])) {
      return new Response(JSON.stringify({
        ok: true
      }), {
        headers
      });
    }
    const kind = clean(body.kind, 20) || "chapters";
    const email = clean(body.email, 200).toLowerCase();
    const first_name = clean(body.first_name, 100);
    if (!EMAIL_RE.test(email)) {
      return new Response(JSON.stringify({
        error: "Please enter a valid email address."
      }), {
        status: 400,
        headers
      });
    }
    const db = createClient(SUPABASE_URL, SERVICE_KEY, {
      auth: {
        persistSession: false
      }
    });
    const ip = req.headers.get("x-forwarded-for")?.split(",")[0].trim() ?? "";
    const ip_hash = ip ? await hashIp(ip) : null;
    // ---------------- chapters ----------------
    if (kind === "chapters") {
      const { data: row, error } = await db.from("subscribers").upsert({
        email,
        first_name,
        source: clean(body.source, 60) || "website",
        ip_hash
      }, {
        onConflict: "email",
        ignoreDuplicates: false
      }).select("unsubscribe_token, chapters_sent_at").single();
      if (error) {
        console.error("db error", error);
        return new Response(JSON.stringify({
          error: "Could not save. Please try again."
        }), {
          status: 500,
          headers
        });
      }
      await addBrevoContact(email, first_name);
      const sent = await sendEmail(email, "Your free chapter is here", chaptersEmail(first_name, row.unsubscribe_token), FROM_EMAIL);
      if (sent) {
        await db.from("subscribers").update({
          chapters_sent_at: new Date().toISOString()
        }).eq("email", email);
      }
      return new Response(JSON.stringify({
        ok: true,
        emailed: sent
      }), {
        headers
      });
    }
    // ---------------- sponsorship commitment ----------------
    if (kind === "sponsor") {
      const key = clean(body.tier, 30).toLowerCase();
      const tier = SPONSOR_TIERS[key];
      if (!tier) return new Response(JSON.stringify({ error: "Please choose a sponsorship level." }), { status: 400, headers });
      const qty = key === "couple" ? Math.max(1, Math.min(200, parseInt(String(body.quantity ?? "1"), 10) || 1)) : 1;
      const rec = {
        email,
        contact: clean(body.contact, 120) || `${first_name} ${clean(body.last_name, 100)}`.trim(),
        business: clean(body.business, 200),
        phone: clean(body.phone, 40),
        website: clean(body.website, 200),
        tier: tier.name,
        amount: tier.amount,
        quantity: qty,
        pay_pref: clean(body.pay_pref, 20) || "invoice",
        message: clean(body.message, 1000),
        source: clean(body.source, 60) || "website"
      };
      const { error } = await db.from("sponsor_commitments").insert(rec);
      if (error) {
        console.error("sponsor save failed", error);
        return new Response(JSON.stringify({ error: "Could not save. Please try again." }), { status: 500, headers });
      }
      const total = tier.amount * qty;
      const pretty = Object.entries({
        Level: `${tier.name}${qty > 1 ? ` × ${qty}` : ""} — $${total.toLocaleString()}`,
        Contact: rec.contact,
        Business: rec.business,
        Email: email,
        Phone: rec.phone,
        Website: rec.website,
        "Payment preference": rec.pay_pref,
        Message: rec.message
      }).filter(([, v])=>v).map(([k, v])=>`<tr><td style="padding:6px 12px 6px 0;color:#5C6B60;white-space:nowrap;vertical-align:top;">${k}</td><td style="padding:6px 0;">${String(v).replace(/</g, "&lt;")}</td></tr>`).join("");
      await sendEmail(NOTIFY_EMAIL, `SPONSOR — ${tier.name} — ${rec.business || rec.contact} ($${total.toLocaleString()})`, sponsorNotifyEmail(pretty), email);
      const confirmed = await sendEmail(email, `Thank you — ${tier.name} for November 1st`, sponsorConfirmEmail(rec.contact, tier.name, tier.amount, qty, rec.pay_pref), FROM_EMAIL);
      return new Response(JSON.stringify({ ok: true, confirmed }), { headers });
    }
    // ---------------- church / speaking ----------------
    if (kind === "launch") {
      const guests = Math.max(1, Math.min(20, parseInt(String(body.guests ?? "1"), 10) || 1));
      const inPerson = String(body.attending ?? "in_person") !== "cannot_attend";
      const sponsor = String(body.sponsor_interest ?? "") === "yes";
      const row = {
        email,
        first_name,
        last_name: clean(body.last_name, 100),
        guests,
        attending: inPerson ? "in_person" : "cannot_attend",
        notes: clean(body.notes),
        sponsor_interest: sponsor,
        sponsor_contact: sponsor ? clean(body.sponsor_contact, 120) : "",
        sponsor_business: sponsor ? clean(body.sponsor_business, 200) : "",
        sponsor_phone: sponsor ? clean(body.sponsor_phone, 40) : "",
        sponsor_email: sponsor ? clean(body.sponsor_email, 200) : "",
        sponsor_website: sponsor ? clean(body.sponsor_website, 200) : "",
        sponsor_message: sponsor ? clean(body.sponsor_message, 1000) : "",
        source: clean(body.source, 60) || "website",
        confirmed_at: new Date().toISOString(),
        cancelled_at: null
      };
      const { data: saved, error } = await db.from("launch_rsvps").upsert(row, {
        onConflict: "email"
      }).select("manage_token").single();
      if (error) {
        console.error("launch rsvp save failed", error);
        return new Response(JSON.stringify({
          error: "Could not save. Please try again."
        }), {
          status: 500,
          headers
        });
      }
      const pretty = Object.entries({
        Name: `${first_name} ${clean(body.last_name, 100)}`.trim(),
        Email: email,
        Guests: String(guests),
        Attending: inPerson ? "In person, Tampa" : "Cannot travel",
        Encouragement: clean(body.notes),
        Sponsorship: sponsor ? "Interested" : "",
        "Sponsor contact": sponsor ? clean(body.sponsor_contact, 120) : "",
        "Sponsor business": sponsor ? clean(body.sponsor_business, 200) : "",
        "Sponsor phone": sponsor ? clean(body.sponsor_phone, 40) : "",
        "Sponsor email": sponsor ? clean(body.sponsor_email, 200) : "",
        "Sponsor website": sponsor ? clean(body.sponsor_website, 200) : "",
        "Sponsor message": sponsor ? clean(body.sponsor_message, 1000) : ""
      }).filter(([, v])=>v).map(([k, v])=>`<tr><td style="padding:6px 12px 6px 0;color:#5C6B60;white-space:nowrap;">${k}</td><td style="padding:6px 0;">${v}</td></tr>`).join("");
      await sendEmail(NOTIFY_EMAIL, `Launch RSVP — ${first_name || email}${guests > 1 ? ` (+${guests - 1})` : ""}${inPerson ? "" : " [remote]"}${sponsor ? " [SPONSOR]" : ""}`, launchNotifyEmail(pretty), email);
      const confirmed = await sendEmail(email, inPerson ? "You're registered — November 1st, Tampa" : "You're on the list for November 1st", launchConfirmEmail(first_name, guests, inPerson, saved?.manage_token ?? ""), FROM_EMAIL);
      if (sponsor) {
        await sendEmail(clean(body.sponsor_email, 200) || email, "Thank you — and about sponsoring the launch", sponsorInviteEmail(clean(body.sponsor_contact, 120).split(" ")[0] || first_name), FROM_EMAIL);
        await sendEmail(NOTIFY_EMAIL, `SPONSOR LEAD — ${first_name} ${clean(body.last_name, 100)} (${email})`, sponsorLeadEmail(first_name, clean(body.last_name, 100), email, clean(body.sponsor_phone, 40), guests, clean(body.notes)), email);
      }
      // Keep them on the main list too, so they get the book news.
      await addBrevoContact(email, first_name);
      return new Response(JSON.stringify({
        ok: true,
        confirmed
      }), {
        headers
      });
    }
    if (kind === "church" || kind === "speaking") {
      const details = {};
      for (const k of [
        "interest",
        "group_size",
        "format",
        "event_date",
        "notes"
      ]){
        const v = clean(body[k]);
        if (v) details[k] = v;
      }
      const record = {
        kind,
        first_name,
        last_name: clean(body.last_name, 100),
        email,
        organization: clean(body.organization, 200),
        details
      };
      const { error } = await db.from("inquiries").insert(record);
      if (error) console.error("db error", error);
      const labels = {
        interest: "Interested in",
        group_size: "Approx. couples",
        format: "Format",
        event_date: "Target date",
        notes: "Notes"
      };
      const pretty = {};
      for (const [k, v] of Object.entries(details))pretty[labels[k] ?? k] = v;
      // Notify Larry and Ro. Reply-to is the person who wrote in, so hitting
      // reply goes straight back to them.
      await sendEmail(NOTIFY_EMAIL, `New ${kind} inquiry — ${record.organization || record.first_name || email}`, inquiryEmail(kind, record, pretty), email);
      // Confirm to the person who submitted, so they know it arrived and
      // roughly when to expect a reply. Receipt Reply-To: churches@ or speaking@
      // so replies land in ministry inbound. Notify-to-Larry above keeps Reply-To = submitter.
      const receipted = await sendEmail(email, kind === "church" ? "We got your inquiry — Never Fight or Argue Again" : "We got your speaking inquiry — Larry & Ro", inquiryReceipt(kind, first_name), kind === "church" ? REPLY_TO_CHURCHES : REPLY_TO_SPEAKING);
      return new Response(JSON.stringify({
        ok: true,
        receipted
      }), {
        headers
      });
    }
    return new Response(JSON.stringify({
      error: "Unknown form type."
    }), {
      status: 400,
      headers
    });
  } catch (err) {
    console.error(err);
    return new Response(JSON.stringify({
      error: "Something went wrong."
    }), {
      status: 500,
      headers
    });
  }
});
