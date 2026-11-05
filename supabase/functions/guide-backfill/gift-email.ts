// Past-buyer gift email. Copy: past-buyer-gift-email-v1.md
// Larry approved the copy Nov 5, 2026 (subject: A thank-you gift from Larry & Ro).
// Sending still waits on Larry approving the recipient list and count.
// No em or en dashes.
export const SUBJECT = "A thank-you gift from Larry & Ro";
export const PREHEADER = "You were with us from the start, so this one's on us.";

const esc = (v: string) => String(v ?? "").replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;").replace(/"/g, "&quot;");
const P = (s: string) => `<p style="margin:0 0 16px;">${s}</p>`;

export function giftEmail(o: {
  firstName: string;
  guideUrl: string;
  signinUrl: string;
  forgotUrl: string;
  testPrefix?: string;
}): { subject: string; html: string; text: string } {
  const first = (o.firstName || "").trim();
  const hi = first ? `Hi ${esc(first)},` : "Hi,";
  const a = (href: string, t: string) => `<a href="${esc(href)}" style="color:#8A6330;">${esc(t)}</a>`;
  const subject = `${o.testPrefix ?? ""}${SUBJECT}`;
  const html = `<div style="display:none;max-height:0;overflow:hidden;">${esc(PREHEADER)}</div>
<div style="background:#F7F3EA;padding:32px 16px;font-family:Georgia,'Times New Roman',serif;color:#16261C;">
  <div style="max-width:560px;margin:0 auto;background:#fff;border:1px solid #E4DCCB;padding:32px;">
    <p style="margin:0 0 22px;font-size:12px;letter-spacing:.18em;text-transform:uppercase;color:#8A6330;">Never Fight or Argue Again</p>
    <div style="font-size:16px;line-height:1.6;">
      ${P(hi)}
      ${P("You believed in this book before it was even out, or you were right there with us on launch day. That means more to us than we can say. Thank you.")}
      ${P("So we want to give you something back. The new 12-week Companion Guide is yours, free.")}
      ${P("It walks the two of you through the book one week at a time, with SCIP, L.U.V., the Stop-Loss, the Anti-Fight Plan, the Safety Plan and the Validation Exercise all in one place. It&#39;s made to write in. Type your answers, check the boxes, and sign your Commitment to Peace together. Everything saves as you go, and when you&#39;re ready you can download a PDF with all your answers filled in.")}
      <p style="margin:0 0 16px;"><a href="${esc(o.guideUrl)}" style="display:inline-block;background:#0D2D1D;color:#F8F4E9;padding:10px 18px;text-decoration:none;font-family:Arial,sans-serif;font-weight:bold;">Open my Companion Guide</a></p>
      ${P("The first time you open it, you&#39;ll be asked to create a password. After that, you can sign in on your phone or computer and pick up right where you left off.")}
      ${P(`Sign in: ${a(o.signinUrl, o.signinUrl.replace(/^https?:\/\//, ""))}<br>Forgot your password? ${a(o.forgotUrl, "Reset it here")}`)}
      ${P("Take it one week at a time. We&#39;re praying for you both.")}
      <p style="margin:0;">With love,<br>Larry &amp; Ro</p>
    </div>
  </div>
  <p style="max-width:560px;margin:16px auto 0;font-family:Arial,sans-serif;font-size:12px;line-height:1.5;color:#5C6B60;text-align:center;">You&#39;re receiving this because you bought <i>Never Fight or Argue Again</i> as a preorder or on launch day.<br>Questions? ${a("mailto:hello@neverfightorargue.com", "hello@neverfightorargue.com")}</p>
</div>`;

  const textHi = first ? `Hi ${first},` : "Hi,";
  const text = `${textHi}

You believed in this book before it was even out, or you were right there with us on launch day. That means more to us than we can say. Thank you.

So we want to give you something back. The new 12-week Companion Guide is yours, free.

It walks the two of you through the book one week at a time, with SCIP, L.U.V., the Stop-Loss, the Anti-Fight Plan, the Safety Plan and the Validation Exercise all in one place. It's made to write in. Type your answers, check the boxes, and sign your Commitment to Peace together. Everything saves as you go, and when you're ready you can download a PDF with all your answers filled in.

Open my Companion Guide: ${o.guideUrl}

The first time you open it, you'll be asked to create a password. After that, you can sign in on your phone or computer and pick up right where you left off.

Sign in: ${o.signinUrl}
Forgot your password? ${o.forgotUrl}

Take it one week at a time. We're praying for you both.

With love,
Larry & Ro
`;
  return { subject, html, text };
}
