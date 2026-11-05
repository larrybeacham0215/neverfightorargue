/** sql_pglite — real local Postgres WASM for event inventory holds. NOT live Supabase. */
import { PGlite } from "@electric-sql/pglite";
import { readFileSync, writeFileSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";
const __dir = dirname(fileURLToPath(import.meta.url));
const root = join(__dir, "../..");
const results = [];
const check = (n, c, d = "") => results.push({ kind: "sql_pglite", name: n, ok: !!c, detail: String(d) });

const db = new PGlite();
await db.exec(`
do $$ begin create role anon; exception when duplicate_object then null; end $$;
do $$ begin create role authenticated; exception when duplicate_object then null; end $$;
create table preorders (
  id uuid primary key default gen_random_uuid(),
  email text, status text default 'paid', channel text default 'event',
  quantity int default 0, bundles int default 0, test_run text,
  created_at timestamptz default now(), stripe_session text, product text, payment_intent text
);
`);
await db.exec(readFileSync(join(root, "supabase/sql/2026-11-05-event-inventory-holds.sql"), "utf8"));

const since = "2020-01-01T00:00:00Z";
// seed 98 sold
await db.query(`insert into preorders (email, status, channel, quantity, bundles) values ('x@y.z','paid','event',98,49)`);

const a = await db.query(`select event_try_hold_books(2,1,$1,$2::timestamptz,100,35) as r`, ["tokenA"+ "x".repeat(20), since]);
const b = await db.query(`select event_try_hold_books(2,1,$1,$2::timestamptz,100,35) as r`, ["tokenB"+ "x".repeat(20), since]);
check("first_hold_ok", a.rows[0].r.ok === true, JSON.stringify(a.rows[0].r));
check("second_hold_blocked", b.rows[0].r.ok === false && b.rows[0].r.error === "not_enough", JSON.stringify(b.rows[0].r));

await db.query(`select event_attach_hold_session($1,$2)`, ["tokenA"+ "x".repeat(20), "cs_test"]);
await db.query(`insert into preorders (email,status,channel,quantity,bundles,stripe_session,product) values ('p@y.z','paid','event',2,1,'cs_test','event_bundle')`);
await db.query(`select event_release_hold($1,$2)`, ["tokenA"+ "x".repeat(20), "cs_test"]);
const held = await db.query(`select event_active_held_books($1::timestamptz) as h`, [since]);
check("hold_released_after_pay", held.rows[0].h === 0);

// after 100 sold, no more
await db.query(`insert into preorders (email,status,channel,quantity,bundles) values ('z@y.z','paid','event',0,0)`); // noop
const sold = await db.query(`select coalesce(sum(quantity),0)::int as s from preorders where channel='event' and status='paid' and test_run is null`);
check("sold_at_cap", sold.rows[0].s === 100, String(sold.rows[0].s));
const c = await db.query(`select event_try_hold_books(1,0,$1,$2::timestamptz,100,35) as r`, ["tokenC"+ "x".repeat(20), since]);
check("at_cap_blocked", c.rows[0].r.ok === false);

await db.close();
const passed = results.filter(r=>r.ok).length;
const failed = results.filter(r=>!r.ok);
writeFileSync(join(__dir,"holds-pglite-results.json"), JSON.stringify({label:"sql_pglite event holds",passed,total:results.length,failed:failed.map(f=>f.name),results},null,2));
console.log(JSON.stringify({passed,total:results.length,failed:failed.map(f=>f.name)},null,2));
if(failed.length) process.exit(1);
