# Launch Guide — neverfightorargue.com

**Your stack:** GitHub Pages (website) · Supabase (backend) · Brevo (email) · GoDaddy (domain)

That works, and it's cheaper than what I'd set up before — GitHub Pages is free with no bandwidth cap. Everything below is already built for it.

---

## How the pieces connect

```
    GoDaddy DNS
   (the signpost)
         │
         ▼
   GitHub Pages ──────► the website people see
         │
         │  visitor fills in a form
         ▼
  Supabase Edge Function  (your code, your server)
         │
    ┌────┴────┐
    ▼         ▼
Supabase    Brevo ──────► the email lands in their inbox
database
(your list)
```

**What each one does, plainly:**

- **GoDaddy** holds the domain and, in this setup, also runs your DNS. Nothing changes hands — you just edit records there.
- **GitHub Pages** serves the site files. Free, fast, HTTPS included.
- **Supabase** stores every subscriber and inquiry in your own database, and runs the small piece of code that decides what to do with each form.
- **Brevo** actually delivers the email, and gives you a newsletter composer for later.

**The important design point:** your Brevo key and database key never appear in the website. They live as secrets on Supabase. The website only carries a public key that is blocked from reading or writing anything. This is why the form posts to Supabase rather than to Brevo directly.

---

## Three things to know before you start

**1. Your repository has to be public.** GitHub Pages on a free account only serves public repos; private ones need GitHub Pro at $4/month. Public means anyone can browse the site's source code. There are no secrets in it, so that's fine — but it also means **your two-chapter PDF will be downloadable by anyone who finds the repo**, not just people who opt in. It's already a free giveaway, so this is probably acceptable. If it isn't, tell me and I'll move the PDF delivery behind Supabase Storage with signed links instead.

**2. GitHub Pages can't do redirects or custom headers.** I've already worked around this — the unsubscribe link is now a real page on your site, and a 404 page catches stray URLs and sends them to the right tab.

**3. Brevo's free tier is 300 emails a day**, shared between chapter deliveries and any newsletter you send. Send a campaign to 250 people in the morning and you have 50 chapter deliveries left that day. Worth planning around during a launch push.

---

## What to acquire

| # | What | Where | Cost | Status |
|---|------|-------|------|--------|
| 1 | Domain | GoDaddy | Paid | ✅ Yours |
| 2 | GitHub account | github.com | Free | Needed |
| 3 | Supabase project | You have Supabase | Free | New project needed |
| 4 | Brevo API key | You have Brevo | Free | Needed |
| 5 | Two-chapter PDF | You export it | Free | Needed |

Ongoing cost after launch: **the domain renewal, and nothing else.**

---

# Step 1 — Put the site on GitHub (15 minutes)

### 1a. Create the repository

1. **github.com** → sign up or sign in
2. Top right **+** → **New repository**
3. Repository name: `neverfightorargue`
4. **Public** (required — see the note above)
5. Do **not** tick "Add a README"
6. **Create repository**

### 1b. Upload the files

On the empty repo page, click **uploading an existing file**.

Now open the `nfoaa-github` folder on your computer, select **everything inside it** — not the folder itself — and drag it into the browser window.

> **Two files are easy to miss because they're hidden.** `.nojekyll` and `CNAME` have no icon or extension. On Mac press `Cmd + Shift + .` to reveal hidden files; on Windows, View → Show → Hidden items. Both must be uploaded.
>
> `.nojekyll` stops GitHub from trying to process your site as a blog. `CNAME` is what tells GitHub your custom domain.

At the bottom, click **Commit changes**.

### 1c. Turn on Pages

1. In the repo, click **Settings** (top bar)
2. **Pages** (left sidebar)
3. Under **Build and deployment → Source**, choose **Deploy from a branch**
4. Branch: **main**, folder: **/ (root)** → **Save**
5. Wait a minute or two, then refresh

You'll see: *Your site is live at `https://YOURNAME.github.io/neverfightorargue/`*

**Click it.** The site loads. Some images may look off on this temporary address because of the subfolder — that resolves once the custom domain is connected. Don't worry about it.

---

# Step 2 — Point the domain at it (20 minutes, then waiting)

Everything stays at GoDaddy. No nameserver changes, which also means nothing you might already have on this domain breaks.

### 2a. Clear out GoDaddy's parking records first

**This is the step people skip, and it's why sites randomly bounce back to a GoDaddy lander page days later.**

1. **godaddy.com** → sign in → profile icon (top right) → **My Products**
2. Find **neverfightorargue.com** → click **DNS**
3. Delete these if present:
   - Any **A** record with Name `@` (it'll point at a GoDaddy IP, often starting `76.` or `13.`)
   - Any **CNAME** with Name `www` pointing at `neverfightorargue.com` or something ending `.godaddy.com`
4. Scroll to **Forwarding** — if anything is set there, **turn it off**

### 2b. Add four A records

Click **Add New Record** and create each of these. Same type, same name, four different values:

| Type | Name | Value | TTL |
|---|---|---|---|
| A | `@` | `185.199.108.153` | 1 Hour |
| A | `@` | `185.199.109.153` | 1 Hour |
| A | `@` | `185.199.110.153` | 1 Hour |
| A | `@` | `185.199.111.153` | 1 Hour |

Four separate records, all with `@` as the name. That's correct and expected — it's how GitHub spreads traffic.

### 2c. Add the www record

| Type | Name | Value | TTL |
|---|---|---|---|
| CNAME | `www` | `YOURNAME.github.io` | 1 Hour |

Use your GitHub username, all lowercase. No `https://`, no repo name, no trailing slash. Just `yourname.github.io`.

### 2d. Tell GitHub about the domain

1. Repo → **Settings → Pages**
2. Under **Custom domain**, type `neverfightorargue.com` → **Save**
3. GitHub runs a DNS check. If it complains at first, that's normal — DNS hasn't propagated yet
4. Once the check passes, tick **Enforce HTTPS**

> **The HTTPS box may be greyed out for up to 24 hours.** GitHub issues the certificate itself once DNS is confirmed. Come back and tick it — the site won't be properly secure until you do.

### 2e. Watch it propagate

Go to **dnschecker.org**, enter `neverfightorargue.com`, choose **A** from the dropdown, search. When the map shows `185.199.x.153` addresses, you're through. Usually under an hour.

**Then type `neverfightorargue.com` into a browser. Your site comes up.**

---

# Step 3 — Set up the database (10 minutes)

Use a **new Supabase project**, separate from your Kingdom of Disciplined Men one. Free tier allows two, and keeping them apart means one project's problems never become the other's.

1. **supabase.com → New project.** Name it `nfoaa`. Save the database password somewhere safe
2. Wait ~2 minutes for provisioning
3. **SQL Editor → New query**
4. Open `supabase/schema.sql` from this folder, copy all of it, paste, **Run**

You should see "Success. No rows returned." Check **Table Editor** — you'll have `subscribers` and `inquiries`.

**Why the tables look locked:** Row Level Security is on with no public policies. Even though your website carries a Supabase key in its source, that key cannot touch these tables. Only the Edge Function can, using a separate server-side key. This is correct — don't "fix" it later when something seems blocked.

---

# Step 4 — Set up Brevo sending (15 minutes)

Do this **after Step 2 finishes**, since Brevo needs to add records to your domain.

### 4a. Authenticate the domain

**Brevo → Senders, Domains & Dedicated IPs → Domains → Add a domain →** `neverfightorargue.com`

Brevo gives you DNS records — usually a DKIM record, an SPF/TXT record, and a `_dmarc` record. Add each one in **GoDaddy → DNS → Add New Record**, alongside the A records from Step 2.

Back in Brevo, click **Authenticate**. Usually a few minutes.

**Don't skip this.** Without it your emails get rejected or land in spam, and you'll spend an afternoon debugging the wrong thing.

### 4b. Get an API key

**Brevo → profile menu (top right) → SMTP & API → API Keys tab → Generate a new API key.** Name it `nfoaa-site`. Copy it — shown once.

> Make sure you're on the **API Keys** tab, not **SMTP**. Different credentials; the SMTP one won't work here. This is the single most common setup mistake with Brevo.

### 4c. Create a contact list (optional, but do it)

**Brevo → Contacts → Lists → Add a list.** Name it `Free Chapters`. Open it and note the **list ID** — a number, visible in the URL.

Set this and every subscriber flows into Brevo automatically, ready for newsletters. Skip it and subscribers still land safely in your own database.

---

# Step 5 — Deploy the two functions (20 minutes)

All in the browser. No terminal.

### 5a. Set the secrets

**Supabase → Edge Functions → Secrets** (or Project Settings → Edge Functions):

| Name | Value |
|---|---|
| `BREVO_API_KEY` | The key from Step 4b |
| `FROM_EMAIL` | `hello@neverfightorargue.com` |
| `FROM_NAME` | `Larry & Ro` |
| `NOTIFY_EMAIL` | Your everyday inbox — where inquiries land |
| `SITE_URL` | `https://neverfightorargue.com` |
| `BREVO_LIST_ID` | The list ID from Step 4c — omit if you skipped it |

`FROM_EMAIL` is the bare address; the display name goes in `FROM_NAME`. Brevo wants them separate.

These live on the server and never appear in your website. That's the whole point.

### 5b. Deploy `subscribe`

**Edge Functions → Deploy a new function → Via Editor**

- Name it exactly **`subscribe`**
- Delete the sample code
- Paste all of `supabase/functions/subscribe/index.ts`
- **Turn OFF "Verify JWT"** — visitors aren't logged in
- Deploy

### 5c. Deploy `unsubscribe`

Same again:

- Name it exactly **`unsubscribe`**
- Paste all of `supabase/functions/unsubscribe/index.ts`
- **Verify JWT off**
- Deploy

---

# Step 6 — Connect the site to the backend (5 minutes)

**Supabase → Project Settings → API.** You need the **Project URL** and the **anon / publishable key**.

You're editing **two files**, and they must match.

### File 1: `index.html`

Search for `SETTINGS`:

```javascript
var CONFIG = {
  supabaseProjectRef: '',
  supabaseAnonKey: '',
  ...
};
```

Fill in:

```javascript
  supabaseProjectRef: 'xyzabc123',
  supabaseAnonKey: 'eyJhbGciOiJIUzI1NiIsInR5cCI6...',
```

The project ref is just the subdomain of your Project URL — if it's `https://xyzabc123.supabase.co`, the ref is `xyzabc123`.

### File 2: `unsubscribe/index.html`

Near the bottom, the same two values. Paste them identically.

> **That anon key sitting in public source is fine.** It's designed to be public; Step 3's security settings are what protect your data. Never put the **service role** key in either file — that one is server-only.

### Upload the changes

In your GitHub repo, click the file → the **pencil icon** → paste the updated contents → **Commit changes**. Or drag the edited files in via **Add file → Upload files**.

GitHub Pages rebuilds automatically, usually within a minute.

---

# Step 7 — Add the chapters PDF (5 minutes)

Export the introduction, chapter one, and chapter two as one PDF named exactly:

```
never-fight-or-argue-again-chapters-1-2.pdf
```

In your repo, open the `chapters` folder → **Add file → Upload files** → drag it in → **Commit changes**. Delete the placeholder text file while you're there.

Keep it under about 10 MB so it opens quickly on a phone. Worth adding a final page pointing readers to the full book — right when they finish is the best moment you'll get.

---

# Step 8 — Test it properly (15 minutes)

Use your real email. Do this before telling anyone the site exists.

- [ ] `neverfightorargue.com` loads with a padlock in the address bar
- [ ] `www.neverfightorargue.com` also works
- [ ] Fill in the chapter form with your real email
- [ ] You land on "Check your inbox"
- [ ] "Or start reading right now" downloads the PDF
- [ ] **The email actually arrives** (check spam)
- [ ] The download button in that email works
- [ ] Your row appears in Supabase → Table Editor → `subscribers`
- [ ] `chapters_sent_at` on that row is filled in, not null
- [ ] Your address appears in Brevo → Contacts (if you set `BREVO_LIST_ID`)
- [ ] Submit a church inquiry — notification arrives at your `NOTIFY_EMAIL`
- [ ] That inquiry appears in the `inquiries` table
- [ ] The unsubscribe link at the bottom of the email works and says "You're unsubscribed"
- [ ] The site looks right on your phone, opt-in visible without scrolling
- [ ] Text yourself the link — the cover preview appears

**If the email doesn't arrive:** Supabase → Edge Functions → `subscribe` → **Logs**. The error is there in plain language.

**If nothing happens when you submit:** browser console (F12). A 401 means Verify JWT is still on.

---

# What to send me

1. **The two-chapter PDF** — I'll check it opens cleanly and confirm the filename
2. **A photo of you and Rolanda** — replaces the "Author photo" placeholder
3. **Retailer links** — the five buy buttons still go nowhere
4. **The current 20-chapter manuscript** — I still need the real names for Readiness Plan steps 5 and 6

Send me your Supabase project ref and anon key and I'll do Step 6 for you, though it's a genuine two-line edit in each file.

---

# Still placeholder — read before sending traffic

| Where | What's fake |
|---|---|
| Buy buttons | All five link to nothing |
| Testimonials | 5 video slots, 3 written quotes |
| Endorsements | 5 endorsements |
| About | "Author photo" box |
| Readiness Plan | Steps 5 and 6 are my guesses |

**My recommendation still stands:** hide the Testimonials and Endorsements tabs until you have real content. A page of visible placeholders costs more trust than a missing tab. One line each — say the word.

The Readiness Plan steps are the one thing I'd fix before anyone reads the site, since it's your own material being described wrongly.

---

# Where things live, once you're running

| What | Where to look |
|---|---|
| Who signed up | Supabase → Table Editor → `subscribers` |
| Church & speaking inquiries | Supabase → Table Editor → `inquiries` |
| Whether emails sent | Brevo → Transactional → Logs |
| Errors | Supabase → Edge Functions → Logs |
| Site deploy status | GitHub repo → Actions tab |
| Roll back a bad change | GitHub → Commits → revert |

Export your list: **SQL Editor →** `select * from active_subscribers;` **→ Download CSV.**

---

# Making changes later

Every edit is: open the file in GitHub → pencil icon → change it → **Commit changes**. Live in about a minute.

To add your video testimonials, find the comment marked `SWAP` above each video block in `index.html` and replace the placeholder with:

```html
<div class="vid">
  <iframe src="https://player.vimeo.com/video/YOUR_VIDEO_ID"
          title="The Harrisons"
          allow="autoplay; fullscreen; picture-in-picture"
          allowfullscreen loading="lazy"></iframe>
</div>
```

Use Vimeo over YouTube — no ads, no "recommended videos" pulling people off your page. Set each to **Privacy → Hide from Vimeo**.

---

# If something breaks

**Site shows a GoDaddy parked page** — the old A record or a forwarding rule survived Step 2a. Go back and delete them.

**GitHub Pages says "Domain does not resolve"** — DNS hasn't propagated. Wait, then click **Check again**.

**"Not secure" warning** — the Enforce HTTPS box in Settings → Pages. It's often greyed out for the first day; come back and tick it.

**Form does nothing** — wrong project ref or anon key, or Verify JWT still on.

**Saved to the database but no email** — Brevo domain not authenticated, SMTP key used instead of API key, or you've hit 300/day.

**Download 404s** — filename must match exactly, hyphens and all lowercase.

**Emails landing in spam** — normal for a new sending domain; it settles as real people open them. Confirm the Brevo DNS records are still in GoDaddy. Brevo's free plan also adds a small "Sent with Brevo" line; paid plans remove it.
