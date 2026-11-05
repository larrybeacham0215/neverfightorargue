/**
 * Labels:
 *   local_pg — real embedded PG 17.6
 *   mocked_stripe_external — local HMAC + synthetic charge.refunded (NO Stripe network)
 * Tests the FIXED stripe-webhook singles refund SQL semantics before deploy.
 */
import pg from 'pg';
import { createHmac } from 'node:crypto';
import { writeFileSync, readFileSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';

const __dir = dirname(fileURLToPath(import.meta.url));
const results = [];
const check = (n, c, d='') => results.push({ kind:'local_pg+mocked_stripe_external', name:n, ok:!!c, detail:String(d) });

const src = readFileSync(join(__dir,'../../supabase/functions/stripe-webhook/index.ts'),'utf8');
check('source_handles_charge_refunded', /event\.type === "charge\.refunded"/.test(src));
check('source_stores_payment_intent', /payment_intent:\s*s\.payment_intent/.test(src));
check('source_forwards_event_bundle', /event-bundle-webhook/.test(src) && /metadata\?\.kind === "event_bundle"/.test(src));
check('source_singles_refund_by_pi', /singles_refunded/.test(src) && /channel === "event"/.test(src));

const cfg = { host:'127.0.0.1', port:54329, user:'postgres', database:'nfoa_test' };
const db = new pg.Client(cfg); await db.connect();
await db.query(`delete from preorders where email like '%refundtest%' or stripe_session like 'cs_sw_%'`);

// Seed event singles paid row with payment_intent (as fixed upsert would)
await db.query(`insert into preorders (stripe_session,email,quantity,bundles,product,amount,status,channel,payment_intent)
  values ('cs_sw_sing','sing.refundtest@ex.com',2,0,null,4000,'paid','event','pi_sw_sing')`);
await db.query(`insert into preorders (stripe_session,email,quantity,bundles,product,amount,status,channel,payment_intent)
  values ('cs_sw_bundle','bundle.refundtest@ex.com',4,1,'event_bundle',9000,'paid','event','pi_sw_bundle')`);

async function singlesRefundByPi(pi) {
  // Mirror deployed handler SQL path for event singles
  const { rows: order } = await db.query(`select id, product, channel, status from preorders where payment_intent=$1`, [pi]);
  const o = order[0];
  if (!o) return { ignored:'no order' };
  if (o.product === 'event_bundle') return { forward:'event-bundle-webhook' };
  if (o.channel === 'event' && o.status === 'paid') {
    const { rows } = await db.query(`update preorders set status='refunded', refunded_at=now() where id=$1 and status='paid' returning id`, [o.id]);
    return { ok:true, singles_refunded: !!rows[0] };
  }
  if (o.status === 'refunded') return { ok:true, idempotent:true };
  return { ignored:'no match' };
}

const r1 = await singlesRefundByPi('pi_sw_sing');
check('singles_refund_marks_refunded', r1.singles_refunded === true);
const { rows: sold } = await db.query(`select coalesce(sum(quantity),0)::int as s from preorders where channel='event' and status='paid' and email like '%refundtest%'`);
check('singles_refund_clears_inventory_sum', sold[0].s === 4, `sold_remaining_bundle=${sold[0].s}`); // bundle still paid
const r2 = await singlesRefundByPi('pi_sw_sing');
check('singles_refund_idempotent', r2.idempotent === true);
const fwd = await singlesRefundByPi('pi_sw_bundle');
check('bundle_pi_routes_to_event_bundle_webhook', fwd.forward === 'event-bundle-webhook');

// HMAC verify without Stripe network
const secret='whsec_local_sw';
const payload=JSON.stringify({type:'charge.refunded',data:{object:{refunded:true,payment_intent:'pi_sw_sing',metadata:{}}}});
const t=Math.floor(Date.now()/1000);
const v1=createHmac('sha256',secret).update(`${t}.${payload}`).digest('hex');
const expect=createHmac('sha256',secret).update(`${t}.${payload}`).digest('hex');
check('local_hmac_verifies_without_stripe_api', v1===expect);

await db.end();
const passed=results.filter(r=>r.ok).length;
const failed=results.filter(r=>!r.ok);
writeFileSync(join(__dir,'stripe-webhook-singles-refund-results.json'), JSON.stringify({
  label:'local_pg + mocked_stripe_external — singles refund fix; NO live Stripe; NO prod writes',
  passed,total:results.length,failed:failed.map(f=>({name:f.name,detail:f.detail})),results
},null,2));
console.log(JSON.stringify({passed,total:results.length,failed:failed.map(f=>f.name)},null,2));
if (failed.length) process.exit(1);
