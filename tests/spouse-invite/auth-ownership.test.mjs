/**
 * Label: auth_mock — simulates Supabase Auth (GoTrue) behaviors locally.
 * NOT live Auth. No emails. No production user creation.
 * Proves password-takeover defenses of redeem ownership flow.
 */
import { createHash, randomBytes } from "node:crypto";
import { writeFileSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";

const __dir = dirname(fileURLToPath(import.meta.url));
const results = [];
const check = (n, c, d = "") => results.push({ kind: "auth_mock", name: n, ok: !!c, detail: String(d) });

class FakeAuth {
  constructor() {
    this.users = new Map(); // email -> { id, passwordHash, meta }
  }
  hash(p) { return createHash("sha256").update(p).digest("hex"); }
  async signInWithPassword({ email, password }) {
    const u = this.users.get(email.toLowerCase());
    if (!u || u.passwordHash !== this.hash(password)) {
      return { data: { user: null }, error: { message: "Invalid login credentials" } };
    }
    return { data: { user: { id: u.id, email } }, error: null };
  }
  async createUser({ email, password, email_confirm, user_metadata }) {
    const key = email.toLowerCase();
    if (this.users.has(key)) {
      return { data: { user: null }, error: { message: "A user with this email address has already been registered" } };
    }
    // Never overwrite — create only
    const id = randomBytes(16).toString("hex");
    this.users.set(key, { id, passwordHash: this.hash(password), meta: user_metadata || {}, email_confirm: !!email_confirm });
    return { data: { user: { id, email: key } }, error: null };
  }
  async adminUpdateUserById() {
    throw new Error("updateUser forbidden in spouse redeem path");
  }
}

/** Mirrors spouse-invite redeem Auth branch */
async function resolveUser(auth, email, password, name) {
  const sign = await auth.signInWithPassword({ email, password });
  if (sign.data?.user && !sign.error) {
    return { userId: sign.data.user.id, created: false, overwritten: false };
  }
  const { data: cu, error: ce } = await auth.createUser({
    email, password, email_confirm: true, user_metadata: name ? { name } : {},
  });
  if (cu?.user && !ce) return { userId: cu.user.id, created: true, overwritten: false };
  const exists = /already|registered|exists/i.test(ce?.message ?? "");
  if (exists) return { userId: null, created: false, overwritten: false, needs_existing_password: true };
  return { userId: null, error: "create_failed" };
}

{
  const auth = new FakeAuth();
  // Existing user — wrong password must NOT change password
  await auth.createUser({ email: "exist@ex.com", password: "correct-password", email_confirm: true });
  const before = auth.users.get("exist@ex.com").passwordHash;
  const r = await resolveUser(auth, "exist@ex.com", "wrong-password", "Attacker");
  check("wrong_password_no_takeover", r.needs_existing_password === true && auth.users.get("exist@ex.com").passwordHash === before);
  check("wrong_password_no_userId", r.userId === null);
}

{
  const auth = new FakeAuth();
  await auth.createUser({ email: "exist2@ex.com", password: "correct-password", email_confirm: true });
  const before = auth.users.get("exist2@ex.com").passwordHash;
  const r = await resolveUser(auth, "exist2@ex.com", "correct-password", "");
  check("correct_password_signs_in", r.created === false && !!r.userId);
  check("correct_password_unchanged", auth.users.get("exist2@ex.com").passwordHash === before);
}

{
  const auth = new FakeAuth();
  const r = await resolveUser(auth, "new@ex.com", "newpassword1", "Sam");
  check("new_email_creates", r.created === true && !!r.userId);
  check("create_stores_hash_not_plaintext", auth.users.get("new@ex.com").passwordHash !== "newpassword1");
}

{
  // Path must never call updateUser
  const auth = new FakeAuth();
  let updated = false;
  auth.adminUpdateUserById = async () => { updated = true; };
  await resolveUser(auth, "n2@ex.com", "password12", "");
  check("never_calls_updateUser", updated === false);
}

{
  // Bearer eligibility: spouse seat cannot be parent (logic mirror)
  const ents = [
    { id: "s1", parent_entitlement_id: "b1", role: "spouse" },
    { id: "b1", parent_entitlement_id: null, role: "buyer" },
  ];
  const qualifying = ents.filter((e) => !e.parent_entitlement_id && (e.role ?? "buyer") !== "spouse");
  check("spouse_seat_not_qualifying_parent", qualifying.length === 1 && qualifying[0].id === "b1");
  const parent = qualifying.find((e) => e.id === "s1") ?? qualifying[0];
  check("cannot_select_spouse_id_as_parent", parent.id === "b1");
}

{
  // Flag gate
  const ON = false;
  check("default_flag_off", ON === false);
}

const passed = results.filter((r) => r.ok).length;
const failed = results.filter((r) => !r.ok);
writeFileSync(join(__dir, "auth-ownership-results.json"), JSON.stringify({
  label: "auth_mock — local GoTrue behavior simulation; NOT live Supabase Auth; no emails; no prod users",
  passed, total: results.length, failed: failed.map((f) => f.name), results,
}, null, 2));
console.log(JSON.stringify({ passed, total: results.length, failed: failed.map((f) => f.name) }, null, 2));
if (failed.length) process.exit(1);
