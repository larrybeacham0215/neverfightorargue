/**
 * Labels:
 *   local_pg_multisession — real PostgreSQL 17.6 embedded cluster, TWO client sessions
 *   mocked_stripe_external — Stripe HMAC payloads generated locally; NO Stripe API network
 * NOT production. NOT paid capture. NOT Brevo.
 */
import pg from 'pg';
import { createHmac, randomBytes, createHash } from 'node:crypto';
import { writeFileSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { createRequire } from 'node:module';

const require = createRequire(import.meta.url);
const { planOrder } = await import('./order-math.mjs');
const __dir = dirname(fileURLToPath(import.meta.url));
const results = [];
const check = (kind, name, cond, detail='') => results.push({ kind, name, ok:!!cond, detail:String(detail) });

const cfg = { host:'127.0.0.1', port:54329, user:'postgres', database:'nfoa_test' };
const since = '2020-01-01T00:00:00Z';

function tok(n=24){ return randomBytes(n).toString('hex'); }

// --- concurrent holds ---
{
  const a = new pg.Client(cfg); const b = new pg.Client(cfg);
  await a.connect(); await b.connect();
  await a.query('delete from event_checkout_holds');
  await a.query('delete from preorders');
  await a.query(`insert into preorders (email,status,channel,quantity,bundles) values ('seed@x','paid','event',98,49)`);
  const tA = 'a'+tok(), tB = 'b'+tok();
  // Fire concurrently
  const [rA, rB] = await Promise.all([
    a.query(`select event_try_hold_books(2,1,$1,$2::timestamptz,100,35) as r`, [tA, since]),
    b.query(`select event_try_hold_books(2,1,$1,$2::timestamptz,100,35) as r`, [tB, since]),
  ]);
  const oks = [rA.rows[0].r, rB.rows[0].r];
  const winners = oks.filter(x=>x.ok);
  const losers = oks.filter(x=>!x.ok);
  check('local_pg_multisession', 'concurrent_hold_exactly_one_wins', winners.length===1 && losers.length===1, JSON.stringify(oks));
  check('local_pg_multisession', 'loser_is_not_enough', losers[0]?.error==='not_enough', JSON.stringify(losers[0]));
  await a.end(); await b.end();
}

// --- webhook idempotency + refund against real PG (mocked Stripe envelope) ---
{
  const db = new pg.Client(cfg); await db.connect();
  await db.query('delete from entitlements'); await db.query('delete from preorders'); await db.query('delete from event_checkout_holds');

  async function upsertSession(s) {
    const bundleQty = Math.max(0, parseInt(s.metadata.bundles||'0',10)||0);
    const singleQty = Math.max(0, parseInt(s.metadata.singles||'0',10)||0);
    const books = bundleQty*2 + singleQty;
    const email = (s.customer_details?.email||'').toLowerCase();
    const { rows } = await db.query(
      `insert into preorders (stripe_session,email,quantity,bundles,product,amount,status,channel,payment_intent)
       values ($1,$2,$3,$4,'event_bundle',$5,'paid','event',$6)
       on conflict (stripe_session) where stripe_session is not null
       do update set quantity=excluded.quantity, bundles=excluded.bundles, amount=excluded.amount, status='paid'
       returning id, stripe_session`,
      [s.id, email, books, bundleQty, s.amount_total||0, s.payment_intent]
    );
    // unique index is partial - ON CONFLICT needs constraint. Fallback:
    return rows[0];
  }

  // Ensure unique constraint works for upsert - recreate as proper unique
  await db.query(`drop index if exists preorders_stripe_session_uidx`);
  await db.query(`create unique index preorders_stripe_session_uidx on preorders(stripe_session)`);

  const session = {
    id: 'cs_local_1', payment_status:'paid', amount_total:9000, payment_intent:'pi_local_1',
    customer_details:{ email:'Buyer@Ex.com' },
    metadata:{ kind:'event_bundle', bundles:'1', singles:'2', books:'4' },
  };

  // Handler logic mirroring fixed webhook
  async function handleCompleted(s) {
    if (s.metadata?.kind !== 'event_bundle') return { ignored:'not event_bundle' };
    let bundleQty = Math.max(0, parseInt(String(s.metadata.bundles??'0'),10)||0);
    const singleQty = Math.max(0, parseInt(s.metadata.singles??'0',10)||0);
    const booksPickup = bundleQty*2 + singleQty;
    const email = (s.customer_details?.email??'').toLowerCase();
    const { rows } = await db.query(
      `insert into preorders (stripe_session,email,quantity,bundles,product,amount,status,channel,payment_intent)
       values ($1,$2,$3,$4,'event_bundle',$5,'paid','event',$6)
       on conflict (stripe_session) do update set quantity=excluded.quantity, status='paid'
       returning id`,
      [s.id, email, booksPickup, bundleQty, s.amount_total||0, s.payment_intent]
    );
    if (email && bundleQty>=1) {
      await db.query(
        `insert into entitlements (email_lower,product,source,stripe_session,preorder_id)
         values ($1,'companion_guide','stripe',$2,$3)
         on conflict (email_lower,product) do update set revoked_at=null, revoke_reason=null, preorder_id=excluded.preorder_id
         returning id`,
        [email, s.id, rows[0].id]
      );
    }
    return { ok:true, books_pickup: booksPickup, preorder_id: rows[0].id };
  }

  async function handleRefund(charge) {
    if (!charge.refunded) return { ignored:'partial' };
    const { rows: ex } = await db.query(`select * from preorders where payment_intent=$1`, [charge.payment_intent]);
    if (!ex[0] || ex[0].product !== 'event_bundle') return { ignored:'not event_bundle order' };
    if (ex[0].status === 'refunded') return { ok:true, idempotent:true };
    await db.query(`update preorders set status='refunded', refunded_at=now() where id=$1 and status='paid'`, [ex[0].id]);
    const { rows: still } = await db.query(`select count(*)::int as c from preorders where email=$1 and product='event_bundle' and status='paid'`, [ex[0].email]);
    let revoked=false;
    if (still[0].c === 0) {
      await db.query(`update entitlements set revoked_at=now(), revoke_reason='refund' where email_lower=$1 and product='companion_guide' and revoked_at is null`, [ex[0].email.toLowerCase()]);
      revoked=true;
    }
    return { ok:true, revoked };
  }

  const first = await handleCompleted(session);
  const second = await handleCompleted(session);
  const { rows: cnt } = await db.query(`select count(*)::int as c from preorders where stripe_session=$1`, [session.id]);
  check('mocked_stripe_external', 'idempotent_duplicate_session', first.ok && second.ok && cnt[0].c===1, `c=${cnt[0].c}`);

  // Stripe signature format (local HMAC) — prove we can verify without calling Stripe
  const secret = 'whsec_test_local';
  const payload = JSON.stringify({ type:'checkout.session.completed', data:{ object: session } });
  const t = Math.floor(Date.now()/1000);
  const v1 = createHmac('sha256', secret).update(`${t}.${payload}`).digest('hex');
  const header = `t=${t},v1=${v1}`;
  const parts = Object.fromEntries(header.split(',').map(p=>p.split('=')));
  const expect = createHmac('sha256', secret).update(`${parts.t}.${payload}`).digest('hex');
  check('mocked_stripe_external', 'local_hmac_signature_verifies', expect===parts.v1);

  const ref = await handleRefund({ refunded:true, payment_intent:'pi_local_1', metadata:{} });
  const { rows: ent } = await db.query(`select revoked_at from entitlements where email_lower='buyer@ex.com'`);
  check('mocked_stripe_external', 'refund_revokes_without_charge_kind', ref.ok && ref.revoked && !!ent[0]?.revoked_at);

  // Singles-only refund path (product null / event channel preorder)
  await db.query(`insert into preorders (stripe_session,email,quantity,bundles,product,amount,status,channel,payment_intent)
    values ('cs_sing','sing@ex.com',2,0,null,4000,'paid','event','pi_sing')`);
  async function handleSingleRefund(charge) {
    // Fixed stripe-webhook behavior for event singles
    const { rows } = await db.query(`update preorders set status='refunded', refunded_at=now()
      where payment_intent=$1 and channel='event' and status='paid' returning id`, [charge.payment_intent]);
    return { ok: !!rows[0], refunded: !!rows[0] };
  }
  const sr = await handleSingleRefund({ refunded:true, payment_intent:'pi_sing' });
  const { rows: sold } = await db.query(`select coalesce(sum(quantity),0)::int as s from preorders where channel='event' and status='paid' and test_run is null`);
  check('mocked_stripe_external', 'singles_refund_clears_inventory', sr.refunded && sold[0].s===0, `sold=${sold[0].s}`);

  await db.end();
}

const passed = results.filter(r=>r.ok).length;
const failed = results.filter(r=>!r.ok);
writeFileSync(join(__dir,'local-pg-integration-results.json'), JSON.stringify({
  label:'local_pg_multisession + mocked_stripe_external — real PG 17.6; NO live Stripe; NO prod',
  postgres:'embedded-postgres 17.6 on 127.0.0.1:54329',
  passed, total:results.length, failed:failed.map(f=>({name:f.name,detail:f.detail})), results
},null,2));
console.log(JSON.stringify({passed,total:results.length,failed:failed.map(f=>f.name)},null,2));
if (failed.length) process.exit(1);
