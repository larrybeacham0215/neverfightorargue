# GO LIVE — the short version

**Goal:** `neverfightorargue.com` loads your site in a browser.

Two tasks, about 35 minutes of clicking, then waiting for DNS. Everything else — Supabase, Brevo, the chapters PDF — can wait until after.

**You need nothing from me for this.** Both tasks require logging into your GitHub and GoDaddy accounts, which only you can do.

---

## TASK 1 — Get the site onto GitHub (15 min)

### 1. Make the repository
- **github.com** → sign up or sign in
- Top right **+** → **New repository**
- Name: `neverfightorargue`
- **Public**
- Do **not** tick "Add a README"
- **Create repository**

### 2. Upload the files
- Download **`nfoaa-github.zip`** and unzip it
- On the empty repo page, click **uploading an existing file**
- Open the unzipped `nfoaa-github` folder, select **everything inside it** (`Cmd + A` on Mac, `Ctrl + A` on Windows), and drag it onto the dashed box
- **Commit changes**

> Select the things **inside** the folder, not the folder itself. Dragging the folder as a whole buries everything one level down and the site won't load.
>
> **Stuck on this step? See `UPLOAD-HELP.md`** — it walks through it with a fallback method if dragging misbehaves.
>
> You do **not** need any hidden files. GitHub creates `CNAME` itself in Step 7, and `.nojekyll` isn't required for this site.

### 3. Switch Pages on
- Repo → **Settings** → **Pages** (left sidebar)
- Source: **Deploy from a branch**
- Branch: **main** · Folder: **/ (root)** → **Save**
- Wait a minute, refresh

You'll see: *Your site is live at `https://YOURNAME.github.io/neverfightorargue/`*

**Click it. The site loads.** It's on the internet now, just not at your domain yet.

> Some images may look wrong on this temporary address because of the subfolder. That fixes itself in Task 2. Ignore it.

Your GitHub username is **larrybeacham0215** — you need it in Step 6.

---

## TASK 2 — Point the domain at it (20 min, then waiting)

### 4. Clear GoDaddy's parking records
**This is the step people skip, and it's why sites randomly bounce back to a GoDaddy page days later.**

- **godaddy.com** → sign in → profile icon (top right) → **My Products**
- Find **neverfightorargue.com** → click **DNS**
- **Delete** any **A** record named `@` (points to a GoDaddy IP, often starts `76.` or `13.`)
- **Delete** any **CNAME** named `www` pointing at `neverfightorargue.com` or something ending `.godaddy.com`
- Scroll to **Forwarding** — if anything is set, **turn it off**

### 5. Add four A records
**Add New Record**, four times. Same type, same name, different values:

| Type | Name | Value | TTL |
|---|---|---|---|
| A | `@` | `185.199.108.153` | 1 Hour |
| A | `@` | `185.199.109.153` | 1 Hour |
| A | `@` | `185.199.110.153` | 1 Hour |
| A | `@` | `185.199.111.153` | 1 Hour |

Four separate records all named `@` is correct — it's how GitHub spreads traffic.

### 6. Add the www record

| Type | Name | Value | TTL |
|---|---|---|---|
| CNAME | `www` | `larrybeacham0215.github.io` | 1 Hour |

Exactly that — your GitHub username followed by `.github.io`. No `https://`, no repo name, no trailing slash.

### 7. Tell GitHub the domain
- Repo → **Settings → Pages**
- **Custom domain:** `neverfightorargue.com` → **Save**
- It runs a DNS check. Complaints at this stage are normal — DNS hasn't spread yet

### 8. Wait, then turn on HTTPS
- Check progress at **dnschecker.org** → enter `neverfightorargue.com` → choose **A** → search
- When the map shows `185.199.x.153`, you're through. Usually under an hour
- Go back to **Settings → Pages** and tick **Enforce HTTPS**

> That box may be greyed out for up to 24 hours while GitHub issues your certificate. Come back and tick it — the site isn't properly secure until you do.

---

## Done

**Type `neverfightorargue.com` into a browser. Your site comes up.**

---

## What works right now, and what doesn't

**Works:** every page, every tab, the video slider, the cover, the chapter gate, mobile, and the link preview when you text it to someone.

**Doesn't work yet:** the forms. Nothing is saved and no email sends, because Supabase and Brevo aren't connected.

I've made the forms say so honestly rather than lie. Submit the opt-in today and you get:

> *Sign-ups aren't switched on quite yet. Please check back shortly.*

Not a fake "check your inbox." Nobody who wanders onto the site early gets promised an email that never arrives.

**Turning the forms on is Steps 3 through 6 of `LAUNCH-GUIDE.md`** — about an hour, and it can happen any time after this.

---

## Then tell me

Once it's up, send me:

1. **The URL, so I can look at it** and check the live version against what I built
2. **Your Supabase project ref and anon key** — I'll wire the forms and hand back the two edited files
3. **The two-chapter PDF**, whenever it's ready

---

## If it doesn't work

**Still shows a GoDaddy parked page** — an old A record or forwarding rule survived Step 4. Go back and delete it. If you're sure they're gone, try a private browsing window or your phone on cellular; your own machine caches DNS aggressively.

**GitHub says "Domain does not resolve"** — DNS hasn't propagated. Wait, then click **Check again**.

**"Not secure" warning** — the Enforce HTTPS box in Step 8. Often greyed out on day one.

**Images missing or site looks unstyled** — the files landed inside a subfolder instead of at the top level. Your repo's main page should show `index.html` directly, not a `nfoaa-github` folder containing it. See `UPLOAD-HELP.md`.
