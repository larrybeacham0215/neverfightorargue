# Never Fight or Argue Again — project handoff

Everything needed to pick this up in a new conversation. Written 9 September 2026.

Larry & Rolanda Beacham · Odessa, Florida · Couples Ministry.

---

## 1. What this is

A marketing site for the book *Never Fight or Argue Again: Biblical Conflict
Resolution For Couples Who Have Tried Everything*, with a free-chapter giveaway,
an automated email sequence, and registration for a live launch event.

**Live at https://neverfightorargue.com** — working and collecting signups.

---

## 2. Credentials

All four are already in this project's files. Don't paste them into chat.

| File | What it is |
|---|---|
| `GitHub_key` | GitHub PAT, scoped to the `neverfightorargue` repo. Expires ~90 days from 13 Aug 2026 |
| `Supabase_key` | Supabase account-level access token (`sbp_…`) |
| `Brevo_key` | Brevo API key (`xkeysib-…`) |

**Two API quirks that cost time to discover:**

- Both api.supabase.com and api.brevo.com sit behind Cloudflare and **return 403
  to a plain Python client**. Send a browser `User-Agent` and they work. This
  looks exactly like a permissions error and isn't one.
- GitHub rejects a write whose parent sha has moved, which happens whenever
  several files are pushed quickly. The deploy script retries; don't remove that.

---

## 3. Stack

```
Browser  →  GitHub Pages (static)  →  Supabase Edge Function  →  Brevo  →  inbox
                                            ↓
                                    Supabase Postgres
```

| Piece | Detail |
|---|---|
| Repo | `larrybeacham0215/neverfightorargue`, branch `main`, public |
| Hosting | GitHub Pages, custom domain, HTTPS enforced |
| DNS | GoDaddy. A records → GitHub, `www` → CNAME, Brevo DKIM + DMARC added |
| Database | Supabase project **NFOAA**, ref `zojsascliwlqgxcrqqlo`, us-east-1, free tier |
| Email | Brevo (shared with Kingdom of Disciplined Men — same account) |
| Sender | `hello@neverfightorargue.com`, domain authenticated, DKIM + SPF clean |
| List | `NFOAA — Free Chapter`, **list ID 3** |

**DMARC is currently `p=none`** while the domain builds reputation. Around
January, tightening to `p=quarantine` is worth doing.

---

## 4. Current live state (verified 9 Sep 2026)

**Edge Functions** — `subscribe` v8, `unsubscribe` v1, `drip` v7, all ACTIVE.

**Tables** — `subscribers`, `inquiries`, `launch_rsvps`, plus views
`active_subscribers` and `launch_headcount`.

**Scheduled job** — `nfoaa-drip`, hourly at 7 past, active. Runs via pg_cron +
pg_net calling the `drip` function.

**Real data in the system:**

```
subscribers   44
launch RSVPs  11
inquiries      0
```

That is live audience data. **Don't run destructive SQL without checking first.**
Earlier in the build I cleared test rows freely; that is no longer safe.

Useful reads:
```sql
select * from launch_headcount;          -- parties, seats, remote, cancelled
select * from active_subscribers;        -- export the list
```

---

## 5. Pages

Every route has a real file so it returns HTTP 200 rather than 404 — GitHub
Pages has no server routing, and search engines read the status code.

| URL | Notes |
|---|---|
| `/` | Home. Light hero, opt-in |
| `/book/` | The book |
| `/book-launch/` | Event page, one screen, registration opens in a dialog |
| `/registered/` | After a launch RSVP. Calendar buttons + 10 FAQs. noindex |
| `/churches/` | Bulk & curriculum enquiries |
| `/speaking/` | Speaking enquiries |
| `/about/` | Larry & Ro |
| `/thank-you/` | After a chapter opt-in. noindex |
| `/free-chapter/` | Gated read-in-browser. noindex |
| `/unsubscribe/` | Token-based |

**Held back** — Testimonials and Endorsements. The markup is intact but they
carry placeholder quotes, so they're removed from nav, footer, router, sitemap
and the 404 map. A comment in the code lists the four steps to restore either.

---

## 6. The event

**Sunday 1 November 2026, doors 5:30 pm**
**Grace Family Church, 22920 FL-54, Lutz, FL 33549**

Free, registration required. Pastor Ralph Johnson's church — acknowledged in the
book, which is why it was chosen.

Note: 1 Nov 2026 is the day US clocks go back, so 5:30 pm that evening is
genuinely EST. Calendar links are anchored to America/New_York.

---

## 7. Emails

Eight in total. See **THE-EMAILS.md** for full copy.

**Automatic, running now:**

| When | Subject | Sent by |
|---|---|---|
| On signup | Your free chapter is here | `subscribe` |
| Day 2 | Did you get a chance to read it? | `drip` |
| Day 5 | Which one of you is which? | `drip` |
| Day 9 | What Chapter One doesn't tell you | `drip` |

**Launch reminders to RSVPs, date-driven, also automatic:**

| Date | Subject |
|---|---|
| 1 Oct | One month until November 1st |
| 25 Oct | A week out — here's what you need |
| 30 Oct | Sunday |
| 1 Nov | Tonight (or "It's out today" for remote registrants) |
| 3 Nov | What we said on Sunday |

Each subscriber carries a stage, so a retry can never double-send, and someone
registering late only gets the reminders still ahead of them. Tested by
backdating a stage.

**Inquiries** (church / speaking) send two emails: a notification to Larry with
reply-to set to the sender, and a confirmation to the person who wrote in.

**To change wording:** the copy lives in the function source, not a dashboard —
`supabase/functions/subscribe/index.ts` and `drip/index.ts`. Edit, then redeploy.

**Brevo free tier is 300 emails/day**, shared with KDM. If the list passes ~250
before launch, the 1 Nov email cannot go out in one day. Check the count in
late October.

---

## 8. Deploying

`deploy.py` (rebuild it in a new session; the sandbox resets) does three things:

1. Pushes `index.html`
2. Regenerates every interior page from it, swapping in per-page `<title>`,
   description and canonical URL, and adding `noindex` to the three private ones
3. Pushes any extra files passed as arguments

```
python3 deploy.py "commit message" [assets/foo.jpg ...]
```

**Never push `index.html` alone.** The interior pages are copies; skipping the
regeneration leaves them stale. That has bitten this project twice.

GitHub Pages takes **60–120 seconds** to publish. Always poll for the new bytes
before claiming something is live — several times the site served the old file
for minutes after a successful push.

---

## 9. Design

| | |
|---|---|
| Deep green | `#0D2D1D` — dark bands, nav, buttons on light |
| Gold | `#C39A5E` — accents and buttons on dark |
| Gold ink | `#8A6330` — accents on cream |
| Bronze | `#8F5A2D` — home hero accents, italic *or* |
| Cream | `#FAF6EC` / `#FBF8F1` — light bands, home hero |
| Ink | `#16261C` |

**Fonts** — Marcellus (section headings), **Playfair Display 700–800** (home
hero headline only; Marcellus has no bold weight and faking it looks poor),
Karla (body).

**The home hero is light**; the rest of the site alternates dark green and cream
bands. Mobile home is centred — kicker, headline, supporting line, by-line
between rules, cover, opt-in, three promises.

Opt-in is **first name + email inline** with the button beneath. Both fields
matter — the emails greet people by name.

---

## 10. Assets

| File | What |
|---|---|
| `book-3d.webp/.png` | Current paperback mockup, spine visible, 900×1367 |
| `launch-stage.webp/.jpg` | Staged launch room — **shows the OLD navy cover** |
| `larry-rolanda.jpg` | About page portrait |
| `churches-group.webp/.jpg` | For Churches header |
| `never-fight-or-argue-again-chapter-1.pdf` | The giveaway, 21 pages |
| `og-image.jpg` | Social share card |
| `favicon*`, `icon-*`, `apple-touch-icon` | NF monogram, green + gold |

**If a book cover is uploaded with its own transparency, use it.** Running
background removal on an already-transparent PNG chewed the page edges once.

---

## 11. Outstanding

1. **The staged launch render still shows the old navy cover** on the banner,
   side screens and floor projection. It is the hero of `/book-launch/` and the
   last old branding on the site. Needs re-rendering — can't be edited.
2. **The free-chapter PDF's closing page still says "Time and location coming
   soon."** Both are now known. Worth updating in the source and re-exporting.
3. **Retailer links** — the buy buttons still point at `#`.
4. **Testimonials and endorsements** — real quotes needed before those pages
   can come back.
5. **Childcare** — the launch FAQ says none is provided. Confirm with the church.
6. **Parking on site** — stated on the page; I inferred it, never confirmed.
7. **Tagline** — the site says "Couples Ministry"; a promo graphic used
   "Stronger marriages. Brighter tomorrows." Never resolved.
8. **GitHub token expires ~Nov 2026.** Replace in the project file when it does.

---

## 12. Things learned the hard way

- **Verify against the live site, not the local file.** Several "done" claims
  were wrong because a push half-failed or hadn't published.
- **The user's browser cache is a real diagnosis, but check the server first.**
  Twice it was genuinely cache; once it was a rule I'd written that hid content.
- **Test the link inside the email, not just that the file exists.** A delivery
  email pointed at `/chapters/` after the PDF moved to `/assets/`; every
  automated check passed and a human clicking the button found a 404.
- **A CSS class that sets `display` beats the browser's `[hidden]`.** Cost a bug
  where inquiry visitors were shown a chapter download they never asked for.
- **Grid children default to min-content width.** Long `<select>` options and
  embedded maps pushed pages past the viewport more than once; `min-width:0`
  fixes it.
- **Old media-query rules survive markup rewrites.** Twice a hero redesign broke
  on mobile because grid areas from the previous version still applied.
- **Don't hide content to win a layout constraint.** Rules hiding the supporting
  paragraph on short phones were the wrong trade and had to be undone.
