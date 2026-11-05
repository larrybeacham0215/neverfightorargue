// Bundle buyer email. Copy: Venture, buyer-email-v2.md as finalized by Michelangelo
// (Nov 5, 2026), brackets filled by Blackwell. No em or en dashes.
export const SUBJECT = "Your books are ready at the table";
export const PREHEADER = "Show your QR for 2 signed copies, then open your Companion Guide.";
const esc = (v: string) => String(v ?? "").replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;");
const P = (s: string) => `<p style="margin:0 0 16px;">${s}</p>`;
const H = (s: string) => `<p style="margin:26px 0 10px;font-size:17px;font-weight:bold;color:#0D2D1D;">${s}</p>`;

export function bundleEmail(o: { name: string; bundles: number; books: number; inscription: string; ticketUrl: string; guideUrl: string; unsubUrl?: string | null }) {
  const qr = `https://api.qrserver.com/v1/create-qr-code/?size=280x280&margin=8&color=0D2D1D&bgcolor=FFFFFF&data=${encodeURIComponent(o.ticketUrl)}`;
  const first = o.name ? esc(o.name.split(" ")[0]) : "there";
  const a = (href: string, t: string) => `<a href="${href}" style="color:#8A6330;">${t}</a>`;
  return `<div style="display:none;max-height:0;overflow:hidden;">${PREHEADER}</div>
<div style="background:#F7F3EA;padding:32px 16px;font-family:Georgia,'Times New Roman',serif;color:#16261C;">
  <div style="max-width:560px;margin:0 auto;background:#fff;border:1px solid #E4DCCB;padding:32px;">
    <p style="margin:0 0 22px;font-size:12px;letter-spacing:.18em;text-transform:uppercase;color:#8A6330;">Never Fight or Argue Again &middot; Event Bundle</p>
    <div style="font-size:16px;line-height:1.6;">
      ${P(`Hi ${first},`)}
      ${P(`Thank you! We&#39;re so glad you picked up the bundle.`)}
      ${P(`Here is what to do next.`)}
      ${H(`1. Get your ${o.books} signed books`)}
      ${P(`Come to the book table and show the QR code on this email (or on your receipt screen). The team will hand you ${o.books === 2 ? "both" : `all ${o.books}`} signed copies of <i>Never Fight or Argue Again</i>${o.inscription ? `, signed to <i>${esc(o.inscription)}</i>` : ""}.`)}
      <table role="presentation" cellpadding="0" cellspacing="0" style="width:100%;border:2px solid #C39A5E;background:#F7F1E4;margin:0 0 16px;"><tr><td style="padding:18px 20px;text-align:center;">
        <p style="margin:0 0 6px;font-size:12px;letter-spacing:.2em;text-transform:uppercase;color:#8A6330;">Your book table pickup pass</p>
        <a href="${o.ticketUrl}"><img src="${qr}" width="200" height="200" alt="Your pickup QR code" style="display:block;margin:0 auto;border:6px solid #fff;"></a>
      </td></tr></table>
      ${P(`If you do not see a QR here, open your receipt page: ${a(o.ticketUrl, "your pickup pass")}<br>Have a screenshot ready so the line keeps moving.`)}
      ${H(`2. Open your Companion Guide`)}
      ${P(`Your bundle also comes with the 12-week Companion Guide. It walks the two of you through SCIP and L.U.V. week by week, with the Stop-Loss, the Anti-Fight Plan, the Safety Plan and the Validation Exercise in the tools section.`)}
      ${P(`Getting in is easy. Just tap your private link:`)}
      <p style="margin:0 0 16px;"><a href="${o.guideUrl}" style="display:inline-block;background:#0D2D1D;color:#F8F4E9;padding:10px 18px;text-decoration:none;font-family:Arial,sans-serif;font-weight:bold;">Open my Companion Guide</a></p>
      ${P(`On your first visit, the guide will ask you to create a password. After that, you can sign in anytime at <a href="https://neverfightorargue.com/members/" style="color:#8a6a2e;">neverfightorargue.com/members</a> to find your guide and answers on any phone or computer.`)}
      ${P(`Keep this email so you can find your way back. The link is just for you, so please don&#39;t share it.`)}
      ${P(`The guide is made for you to write in. Type your answers, check the boxes, and sign your Commitment to Peace together. Everything saves as you go, so you can stop anytime and pick up right where you left off. When you&#39;re ready, you can download a PDF with all your answers filled in to print or keep.`)}
      ${P(`If anything does not open, stop by the book table or write us at ${a("mailto:hello@neverfightorargue.com", "hello@neverfightorargue.com")}. We will get you in.`)}
      ${P(`We&#39;re praying this guide helps you put what you heard into practice at home.`)}
      <p style="margin:0;">With love,<br>Larry &amp; Ro</p>
    </div>
  </div>
  <p style="max-width:560px;margin:16px auto 0;font-family:Arial,sans-serif;font-size:12px;line-height:1.5;color:#5C6B60;text-align:center;">You're receiving this because you bought the event bundle (2 signed books + Companion Guide) or a book at the table.<br>Questions? ${a("mailto:hello@neverfightorargue.com", "hello@neverfightorargue.com")}${o.unsubUrl ? ` &middot; <a href="${o.unsubUrl}" style="color:#5C6B60;">Unsubscribe from our newsletter emails</a>` : ""}</p>
</div>`;
}
