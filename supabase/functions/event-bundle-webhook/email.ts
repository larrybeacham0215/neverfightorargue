// Bundle buyer email. Copy is a PLACEHOLDER until Venture sends the
// congratulations text: replace CONGRATS below. No em or en dashes.
export const CONGRATS = `[PLACEHOLDER, Venture copy coming] Congratulations! You just took a real step toward a home with less fighting and more peace. We are so proud of you, and we are praying for you both.`;
const esc = (v: string) => String(v ?? "").replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;");

export function bundleEmail(o: { name: string; bundles: number; books: number; inscription: string; ticketUrl: string; guideUrl: string }) {
  const qr = `https://api.qrserver.com/v1/create-qr-code/?size=280x280&margin=8&color=0D2D1D&bgcolor=FFFFFF&data=${encodeURIComponent(o.ticketUrl)}`;
  const first = o.name ? esc(o.name.split(" ")[0]) + "," : "there,";
  return `<div style="background:#F7F3EA;padding:32px 16px;font-family:Georgia,'Times New Roman',serif;color:#16261C;">
  <div style="max-width:560px;margin:0 auto;background:#fff;border:1px solid #E4DCCB;padding:32px;">
    <p style="margin:0 0 22px;font-size:12px;letter-spacing:.18em;text-transform:uppercase;color:#8A6330;">Never Fight or Argue Again &middot; Event Bundle</p>
    <div style="font-size:16px;line-height:1.6;">
      <p style="margin:0 0 18px;">Hi ${first}</p>
      <p style="margin:0 0 18px;">${esc(CONGRATS)}</p>
      <p style="margin:0 0 18px;">Your payment went through for <b>${o.bundles} Event Bundle${o.bundles === 1 ? "" : "s"}</b>: ${o.books} signed copies of <i>Never Fight or Argue Again</i> plus the Companion Guide${o.inscription ? `, signed to <i>${esc(o.inscription)}</i>` : ""}.</p>
      <table role="presentation" cellpadding="0" cellspacing="0" style="width:100%;border:2px solid #C39A5E;background:#F7F1E4;margin:0 0 18px;"><tr><td style="padding:18px 20px;text-align:center;">
        <p style="margin:0 0 6px;font-size:12px;letter-spacing:.2em;text-transform:uppercase;color:#8A6330;">Your book table pickup pass</p>
        <a href="${o.ticketUrl}"><img src="${qr}" width="200" height="200" alt="Your pickup QR code" style="display:block;margin:0 auto 10px;border:6px solid #fff;"></a>
        <p style="margin:0 0 8px;font-size:15px;"><b>Show this QR at the book table</b> and we will hand you your ${o.books} books.</p>
        <p style="margin:0;font-size:14px;"><a href="${o.ticketUrl}" style="color:#8A6330;">Open your pickup pass</a></p>
      </td></tr></table>
      <table role="presentation" cellpadding="0" cellspacing="0" style="width:100%;border:1px solid #E4DCCB;margin:0 0 18px;"><tr><td style="padding:18px 20px;">
        <p style="margin:0 0 6px;font-size:12px;letter-spacing:.2em;text-transform:uppercase;color:#8A6330;">Your Companion Guide</p>
        <p style="margin:0 0 10px;">Read it online or download the PDF any time. This link is just for you.</p>
        <p style="margin:0;"><a href="${o.guideUrl}" style="display:inline-block;background:#0D2D1D;color:#F8F4E9;padding:10px 18px;text-decoration:none;font-family:Arial,sans-serif;font-weight:bold;">Open the Companion Guide</a></p>
      </td></tr></table>
      <p style="margin:0 0 18px;">Your Stripe receipt comes in a separate email.</p>
      <p style="margin:0;">Larry &amp; Ro</p>
    </div>
  </div>
</div>`;
}
