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
const SUPABASE_URL = Deno.env.get("SUPABASE_URL")!;
const SERVICE_KEY = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!;
const BREVO_API_KEY = Deno.env.get("BREVO_API_KEY")!;
const FROM_EMAIL = Deno.env.get("FROM_EMAIL") ?? "hello@neverfightorargue.com";
const FROM_NAME = Deno.env.get("FROM_NAME") ?? "Larry & Ro";
// Optional: the Brevo list new subscribers get added to, so you can send
// newsletters from Brevo later. Leave unset and they are still saved to
// your own database, just not pushed to Brevo's contact list.
const BREVO_LIST_ID = Deno.env.get("BREVO_LIST_ID");
const NOTIFY_EMAIL = Deno.env.get("NOTIFY_EMAIL") ?? "hello@neverfightorargue.com";
const SITE_URL = Deno.env.get("SITE_URL") ?? "https://neverfightorargue.com";
const CHAPTER_PATH = "/assets/never-fight-or-argue-again-chapter-1.pdf";

const ALLOWED_ORIGINS = [
  "https://neverfightorargue.com",
  "https://www.neverfightorargue.com",
];

function corsHeaders(origin: string | null) {
  // github.io is allowed so you can test on the temporary GitHub Pages URL
  // before the custom domain finishes propagating.
  const ok =
    origin &&
    (ALLOWED_ORIGINS.includes(origin) ||
      origin.endsWith(".github.io") ||
      origin.startsWith("http://localhost"));
  return {
    "Access-Control-Allow-Origin": ok ? origin! : ALLOWED_ORIGINS[0],
    "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
    "Access-Control-Allow-Methods": "POST, OPTIONS",
    "Content-Type": "application/json",
  };
}

const EMAIL_RE = /^[^\s@]+@[^\s@]+\.[^\s@]{2,}$/;
const clean = (v: unknown, max = 2000) =>
  typeof v === "string" ? v.trim().slice(0, max) : "";

async function hashIp(ip: string) {
  const data = new TextEncoder().encode(ip + "|nfoaa");
  const buf = await crypto.subtle.digest("SHA-256", data);
  return [...new Uint8Array(buf)].map((b) => b.toString(16).padStart(2, "0")).join("").slice(0, 32);
}

async function sendEmail(to: string, subject: string, html: string, replyTo?: string) {
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
      ...(replyTo ? { replyTo: { email: replyTo } } : {}),
    }),
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
async function addBrevoContact(email: string, firstName: string) {
  if (!BREVO_LIST_ID) return;
  try {
    const res = await fetch("https://api.brevo.com/v3/contacts", {
      method: "POST",
      headers: {
        "api-key": BREVO_API_KEY,
        "Content-Type": "application/json",
        accept: "application/json",
      },
      body: JSON.stringify({
        email,
        attributes: firstName ? { FIRSTNAME: firstName } : {},
        listIds: [Number(BREVO_LIST_ID)],
        updateEnabled: true,
      }),
    });
    if (!res.ok) console.error("Brevo contact error", res.status, await res.text());
  } catch (e) {
    console.error("Brevo contact threw", e);
  }
}

// ---- email templates ------------------------------------------------
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

function chaptersEmail(firstName: string, token: string) {
  const name = firstName ? `${firstName},` : "there,";
  return shell(
    `
    <p style="margin:0 0 18px;">Hi ${name}</p>
    <p style="margin:0 0 18px;">Thank you for requesting a chapter of our book!</p>
    <p style="margin:0 0 18px;">Most marriage advice starts from the assumption that fighting is normal, and the best you can do is fight fair. This chapter explains why we stopped believing that &mdash; and what we found on the other side of it.</p>
    <p style="margin:0 0 26px;">One suggestion: read it on your own first. Don't hand it to your spouse yet. When you're ready, the invitation lands better than the evidence does.</p>
    <p style="margin:0 0 28px;text-align:center;">
      <a href="${SITE_URL}${CHAPTER_PATH}"
         style="display:inline-block;background:#D4A63C;color:#080F1E;text-decoration:none;padding:15px 30px;font-weight:bold;font-size:14px;letter-spacing:.06em;text-transform:uppercase;">
        Download the chapter
      </a>
    </p>
    <p style="margin:0;">&mdash; Larry &amp; Ro</p>`,
    `You're receiving this because you requested a free chapter at ${SITE_URL.replace("https://", "")}.<br>
     <a href="${SITE_URL}/unsubscribe/?t=${token}" style="color:#6B7385;">Unsubscribe</a>`,
  );
}


// ---------------------------------------------------------------------------
// Launch RSVPs — the 1 November event in Tampa.
// ---------------------------------------------------------------------------
const GCAL_LAUNCH = "https://calendar.google.com/calendar/render?action=TEMPLATE&text=Never%20Fight%20or%20Argue%20Again%20%E2%80%94%20live%20book%20launch&dates=20261101/20261102&details=The%20live%20launch%20of%20Never%20Fight%20or%20Argue%20Again%20in%20Tampa%2C%20Florida.%20Time%20and%20venue%20to%20be%20confirmed.%0A%0Ahttps%3A%2F%2Fneverfightorargue.com%2Fbook-launch%2F&location=Tampa%2C%20Florida";

function launchConfirmEmail(firstName: string, guests: number, inPerson: boolean, token: string) {
  const name = firstName ? `${firstName},` : "there,";
  const seats = guests > 1 ? `${guests} seats are` : "a seat is";

  const body = inPerson
    ? `
      <p style="margin:0 0 18px;">Hi ${name}</p>
      <p style="margin:0 0 18px;">You're registered for the launch of <em>Never Fight or Argue Again</em> &mdash; ${seats} held for you on <strong>Sunday, November 1st</strong> in Tampa.</p>
      <p style="margin:0 0 22px;">The time and venue are being finalised. You'll get them by email as soon as they're set, before they go public anywhere else. Put the date somewhere you'll see it in the meantime:</p>
      <p style="margin:0 0 8px;text-align:center;">
        <a href="${GCAL_LAUNCH}" style="display:inline-block;background:#D4A63C;color:#080F1E;text-decoration:none;padding:15px 30px;font-weight:bold;font-size:14px;letter-spacing:.06em;text-transform:uppercase;">Add to Google Calendar</a>
      </p>
      <p style="margin:0 0 26px;text-align:center;font-size:13px;">
        <a href="${SITE_URL}/assets/launch-nov-1.ics" style="color:#6B7385;">Other calendars (.ics)</a>
      </p>
      <p style="margin:0 0 18px;">Come early if you can. We'd rather meet you than start on time.</p>
      <p style="margin:0 0 18px;">If your plans change, just <a href="${SITE_URL}/book-launch/?cancel=${token}" style="color:#9A7A2C;">let us know here</a> &mdash; it frees the seat for someone else, and there's no awkwardness in it.</p>
      <p style="margin:0;">&mdash; Larry &amp; Ro</p>`
    : `
      <p style="margin:0 0 18px;">Hi ${name}</p>
      <p style="margin:0 0 18px;">You're on the list for November 1st. You told us Tampa isn't reachable, so here's what that means for you.</p>
      <p style="margin:0 0 18px;">On launch day you'll get the book link in the morning. A couple of days later we'll send what we taught from the stage that night, so the evening isn't lost on you just because you couldn't be in the room.</p>
      <p style="margin:0 0 18px;">And if things change and you can make it after all, just reply to this email and we'll add you back to the headcount.</p>
      <p style="margin:0;">&mdash; Larry &amp; Ro</p>`;

  return shell(body, `
    You're receiving this because you registered for the launch at ${SITE_URL.replace("https://", "")}.<br>
    <a href="${SITE_URL}/book-launch/?cancel=${token}" style="color:#6B7385;">Can't make it any more?</a>`);
}

function launchNotifyEmail(pretty: string) {
  return shell(
    `<p style="margin:0 0 18px;font-size:15px;color:#6B7385;">New launch registration</p>
     <table style="width:100%;border-collapse:collapse;font-size:14px;">${pretty}</table>`,
    `Sent from the book launch page. Reply to reach them directly.`,
  );
}

function inquiryReceipt(kind: string, firstName: string) {
  const name = firstName ? `${firstName},` : "there,";
  const what = kind === "church"
    ? "running <em>Never Fight or Argue Again</em> with a group"
    : "having us speak";
  const next = kind === "church"
    ? "We'll come back with pricing, what a group your size usually needs, and how the discussion guide works week to week."
    : "We'll come back with availability, what we'd suggest for your group, and what we'd need from you.";

  return shell(`
    <p style="margin:0 0 18px;">Hi ${name}</p>
    <p style="margin:0 0 18px;">Thank you for reaching out about ${what}. This is just to confirm it reached us &mdash; nothing else is needed from you right now.</p>
    <p style="margin:0 0 18px;">${next} Expect to hear from one of us within two business days, and it will be a real reply, not an automated one.</p>
    <p style="margin:0 0 18px;">If anything changes in the meantime, or you think of something you forgot to mention, just reply to this email. It comes straight to us.</p>
    <p style="margin:0;">&mdash; Larry &amp; Ro</p>`);
}

function inquiryEmail(kind: string, d: Record<string, string>, extra: Record<string, unknown>) {
  const rows = Object.entries(extra)
    .filter(([, v]) => v)
    .map(
      ([k, v]) =>
        `<tr><td style="padding:6px 14px 6px 0;color:#6B7385;white-space:nowrap;vertical-align:top;">${k}</td><td style="padding:6px 0;">${String(v).replace(/</g, "&lt;")}</td></tr>`,
    )
    .join("");
  return shell(
    `
    <p style="margin:0 0 18px;font-size:18px;"><strong>New ${kind} inquiry</strong></p>
    <table style="font-family:Helvetica,Arial,sans-serif;font-size:15px;line-height:1.6;">
      <tr><td style="padding:6px 14px 6px 0;color:#6B7385;">Name</td><td style="padding:6px 0;">${d.first_name} ${d.last_name}</td></tr>
      <tr><td style="padding:6px 14px 6px 0;color:#6B7385;">Email</td><td style="padding:6px 0;"><a href="mailto:${d.email}">${d.email}</a></td></tr>
      ${d.organization ? `<tr><td style="padding:6px 14px 6px 0;color:#6B7385;">Organization</td><td style="padding:6px 0;">${d.organization}</td></tr>` : ""}
      ${rows}
    </table>
    <p style="margin:22px 0 0;color:#6B7385;font-size:13px;">Reply straight to this email to answer them.</p>`,
    `Sent automatically from ${SITE_URL.replace("https://", "")}.`,
  );
}

// ---- handler --------------------------------------------------------
Deno.serve(async (req) => {
  const origin = req.headers.get("origin");
  const headers = corsHeaders(origin);

  if (req.method === "OPTIONS") return new Response("ok", { headers });
  if (req.method !== "POST") {
    return new Response(JSON.stringify({ error: "Method not allowed" }), { status: 405, headers });
  }

  try {
    const body = await req.json();

    // Honeypot: real people never fill this in.
    if (clean(body["company-website"])) {
      return new Response(JSON.stringify({ ok: true }), { headers });
    }

    const kind = clean(body.kind, 20) || "chapters";
    const email = clean(body.email, 200).toLowerCase();
    const first_name = clean(body.first_name, 100);

    if (!EMAIL_RE.test(email)) {
      return new Response(JSON.stringify({ error: "Please enter a valid email address." }), {
        status: 400,
        headers,
      });
    }

    const db = createClient(SUPABASE_URL, SERVICE_KEY, { auth: { persistSession: false } });
    const ip = req.headers.get("x-forwarded-for")?.split(",")[0].trim() ?? "";
    const ip_hash = ip ? await hashIp(ip) : null;

    // ---------------- chapters ----------------
    if (kind === "chapters") {
      const { data: row, error } = await db
        .from("subscribers")
        .upsert(
          { email, first_name, source: clean(body.source, 60) || "website", ip_hash },
          { onConflict: "email", ignoreDuplicates: false },
        )
        .select("unsubscribe_token, chapters_sent_at")
        .single();

      if (error) {
        console.error("db error", error);
        return new Response(JSON.stringify({ error: "Could not save. Please try again." }), {
          status: 500,
          headers,
        });
      }

      await addBrevoContact(email, first_name);

      const sent = await sendEmail(
        email,
        "Your free chapter is here",
        chaptersEmail(first_name, row.unsubscribe_token),
      );
      if (sent) {
        await db.from("subscribers").update({ chapters_sent_at: new Date().toISOString() }).eq("email", email);
      }

      return new Response(JSON.stringify({ ok: true, emailed: sent }), { headers });
    }

    // ---------------- church / speaking ----------------
    if (kind === "launch") {
      const guests = Math.max(1, Math.min(20, parseInt(String(body.guests ?? "1"), 10) || 1));
      const inPerson = String(body.attending ?? "in_person") !== "cannot_attend";

      const row = {
        email,
        first_name,
        last_name: clean(body.last_name, 100),
        guests,
        attending: inPerson ? "in_person" : "cannot_attend",
        notes: clean(body.notes),
        source: clean(body.source, 60) || "website",
        confirmed_at: new Date().toISOString(),
        cancelled_at: null,
      };

      const { data: saved, error } = await db
        .from("launch_rsvps")
        .upsert(row, { onConflict: "email" })
        .select("manage_token")
        .single();

      if (error) {
        console.error("launch rsvp save failed", error);
        return new Response(JSON.stringify({ error: "Could not save. Please try again." }), {
          status: 500,
          headers,
        });
      }

      const pretty = Object.entries({
        Name: `${first_name} ${clean(body.last_name, 100)}`.trim(),
        Email: email,
        Guests: String(guests),
        Attending: inPerson ? "In person, Tampa" : "Cannot travel",
        Notes: clean(body.notes),
      })
        .filter(([, v]) => v)
        .map(([k, v]) =>
          `<tr><td style="padding:6px 12px 6px 0;color:#6B7385;white-space:nowrap;">${k}</td><td style="padding:6px 0;">${v}</td></tr>`)
        .join("");

      await sendEmail(
        NOTIFY_EMAIL,
        `Launch RSVP — ${first_name || email}${guests > 1 ? ` (+${guests - 1})` : ""}${inPerson ? "" : " [remote]"}`,
        launchNotifyEmail(pretty),
        email,
      );

      const confirmed = await sendEmail(
        email,
        inPerson
          ? "You're registered — November 1st, Tampa"
          : "You're on the list for November 1st",
        launchConfirmEmail(first_name, guests, inPerson, saved?.manage_token ?? ""),
      );

      // Keep them on the main list too, so they get the book news.
      await addBrevoContact(email, first_name);

      return new Response(JSON.stringify({ ok: true, confirmed }), { headers });
    }

    if (kind === "church" || kind === "speaking") {
      const details: Record<string, string> = {};
      for (const k of ["interest", "group_size", "format", "event_date", "notes"]) {
        const v = clean(body[k]);
        if (v) details[k] = v;
      }

      const record = {
        kind,
        first_name,
        last_name: clean(body.last_name, 100),
        email,
        organization: clean(body.organization, 200),
        details,
      };

      const { error } = await db.from("inquiries").insert(record);
      if (error) console.error("db error", error);

      const labels: Record<string, string> = {
        interest: "Interested in",
        group_size: "Approx. couples",
        format: "Format",
        event_date: "Target date",
        notes: "Notes",
      };
      const pretty: Record<string, string> = {};
      for (const [k, v] of Object.entries(details)) pretty[labels[k] ?? k] = v;

      // Notify Larry and Ro. Reply-to is the person who wrote in, so hitting
      // reply goes straight back to them.
      await sendEmail(
        NOTIFY_EMAIL,
        `New ${kind} inquiry — ${record.organization || record.first_name || email}`,
        inquiryEmail(kind, record as Record<string, string>, pretty),
        email,
      );

      // Confirm to the person who submitted, so they know it arrived and
      // roughly when to expect a reply.
      const receipted = await sendEmail(
        email,
        kind === "church"
          ? "We got your inquiry — Never Fight or Argue Again"
          : "We got your speaking inquiry — Larry & Ro",
        inquiryReceipt(kind, first_name),
      );

      return new Response(JSON.stringify({ ok: true, receipted }), { headers });
    }

    return new Response(JSON.stringify({ error: "Unknown form type." }), { status: 400, headers });
  } catch (err) {
    console.error(err);
    return new Response(JSON.stringify({ error: "Something went wrong." }), { status: 500, headers });
  }
});
