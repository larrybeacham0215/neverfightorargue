# Email Delivery & Sequence — Setup

Everything here assumes the November 1st launch. Total setup time: **about two hours**, most of it waiting on DNS.

---

## The decision you're actually making

You have two services and they do different jobs. It's worth being clear about which does what, because it's the thing that confuses people setting this up.

| | Job | Why it |
|---|---|---|
| **Supabase** | Stores every subscriber in your own database. Runs the code that fires the instant the form is submitted. | You own the list outright. Nobody can price you out of it. |
| **Brevo** | Actually delivers mail. Holds the follow-up sequence. | Edge Functions can't schedule "send this in three days." Brevo's automation builder can, and it's where you'll write future emails. |

**They work together, not instead of each other.** The form posts to Supabase, which saves the person, sends the chapter email immediately through Brevo, and adds them to a Brevo list. That list membership is what triggers everything after.

You don't have to choose. The code for both is already written.

---

## What sends when

```
Person submits the form
        ↓  (instant)
   Chapter One email          ← Supabase Edge Function, via Brevo
   Added to "Free Chapter" list
        ↓
   Day 2   Did you read it?           ← Brevo automation
   Day 5   Which plan are you on?
   Day 9   What Chapter One left out
   Oct 25  Launching in one week
   Nov 1   It's live
```

Six emails. The first is transactional and fires from your code. The other five live in one Brevo automation and you can edit them any time without touching the site.

---

# Part 1 — Setup, in order

### Step 1: Supabase project (10 min)

1. **supabase.com → New project.** Name it `nfoaa`. Save the database password.
2. **SQL Editor → New query.** Paste all of `supabase/schema.sql` from this folder → **Run.**
3. **Project Settings → API.** Copy your **Project URL** and **anon key** — you'll need both in Step 5.

### Step 2: Brevo — authenticate the domain (15 min, then wait)

**Brevo → Senders, Domains & Dedicated IPs → Domains → Add a domain** → `neverfightorargue.com`.

Brevo gives you DNS records. Add each in **GoDaddy → DNS → Add New Record**. Then click **Authenticate**.

> **Don't skip this and don't rush past it.** Unauthenticated mail gets filtered or rejected outright. Your domain also already carries a `_dmarc` record set to `p=quarantine`, which tells mailbox providers to hold anything that doesn't pass. Until Brevo's records are verified, that's your own mail being held. If Brevo offers to replace that record, let it.

### Step 3: Brevo — API key and list (5 min)

**Profile menu → SMTP & API → API Keys tab → Generate a new API key.** Name it `nfoaa-site`. Copy it.

> The **API Keys** tab, not SMTP. Different credential; the SMTP one won't work here. This is the single most common mistake with Brevo.

**Already done.** The list `NFOAA — Free Chapter` exists, **list ID 3**. Use that for `BREVO_LIST_ID`.

### Step 4: Deploy the two functions (20 min, all in the browser)

**Supabase → Edge Functions → Secrets.** Add:

| Name | Value |
|---|---|
| `BREVO_API_KEY` | From Step 3 |
| `FROM_EMAIL` | `hello@neverfightorargue.com` |
| `FROM_NAME` | `Larry & Ro` |
| `NOTIFY_EMAIL` | Your everyday inbox |
| `SITE_URL` | `https://neverfightorargue.com` |
| `BREVO_LIST_ID` | `3` |

Then **Edge Functions → Deploy a new function → Via Editor**, twice:

- Name it **`subscribe`**, paste `supabase/functions/subscribe/index.ts`, **turn OFF Verify JWT**, deploy.
- Name it **`unsubscribe`**, paste `supabase/functions/unsubscribe/index.ts`, **Verify JWT off**, deploy.

### Step 5: Connect the site (5 min)

Send me your **project ref** (the subdomain of your Project URL) and **anon key** and I'll wire it and push.

Or do it yourself: search `SETTINGS` in `index.html`, fill in `supabaseProjectRef` and `supabaseAnonKey`. The same two values also go in `unsubscribe/index.html`.

### Step 6: The chapter PDF (5 min)

Export the introduction and Chapter One as one PDF named exactly:

```
never-fight-or-argue-again-chapter-1.pdf
```

It goes in **`assets/`** — note, not `chapters/`. The thank-you page download button and the email both point there.

### Step 7: Build the follow-up sequence (30 min)

**Brevo → Automations → Create an automation → Start from scratch.**

- **Entry point:** *A contact is added to a list* → `Free Chapter`
- Then alternate **Wait** steps and **Send an email** steps using the copy in Part 3 below.

Set each email's **sender** to `Larry & Ro <hello@neverfightorargue.com>` and **reply-to** the same, so replies reach you.

---

# Part 2 — The delivery email

This one is already written into `supabase/functions/subscribe/index.ts` and sends automatically. You don't build it in Brevo. If you want to change the wording, edit the `chaptersEmail` function in that file and redeploy.

**Subject:** Your free chapter is here

> Hi [first name],
>
> Thanks for asking for this.
>
> Most marriage advice starts from the assumption that fighting is normal, and the best you can do is fight fair. This chapter explains why we stopped believing that — and what we found on the other side of it.
>
> One suggestion: read it on your own first. Don't hand it to your spouse yet. When you're ready, the invitation lands better than the evidence does.
>
> **[Download the chapter]**
>
> — Larry & Ro

---

# Part 3 — The follow-up sequence

Copy these into Brevo. Every one is written to sound like the two of you, not a marketing department.

### Email 2 — Day 2

**Subject:** Did you get a chance to read it?

> Hi [first name],
>
> We sent Chapter One a couple of days ago. No pressure if it's still sitting there — we know what a week looks like.
>
> If you did read it, we'd genuinely like to know which part landed. Just hit reply. We read every one.
>
> And if it didn't land at all, tell us that too. That's useful to us.
>
> — Larry & Ro
>
> *[Download it again]*

### Email 3 — Day 5

**Subject:** Which one of you is which?

> Hi [first name],
>
> Here's the thing that surprises most couples about this book: there isn't one plan. There are two, and you don't both work the same one.
>
> The spouse carrying the hurt works a **Safety Plan** — how to say the hard thing without being wounded again in the saying of it.
>
> The spouse who caused it works a **Readiness Plan** — how to become someone that's safe to say to.
>
> Most people know which one they'd be within about a page. The interesting part is when you each pick, separately, and compare.
>
> — Larry & Ro

### Email 4 — Day 9

**Subject:** What Chapter One doesn't tell you

> Hi [first name],
>
> Chapter One makes the case. It doesn't give you the plan.
>
> That's on purpose — the argument has to land first, or the steps just look like more advice. But we don't want to leave you there, so here's the shape of what follows.
>
> Both spouses prepare separately. Then they meet, and the goal stops being to win and starts being to become one. There's a pause you can call by name when it's going badly — we call it Stop Loss — and a way back afterward that doesn't require anyone to grovel.
>
> That's the rest of the book. It's out November 1st.
>
> — Larry & Ro

### Email 5 — October 25

**Subject:** One week out

> Hi [first name],
>
> *Never Fight or Argue Again* is out a week from today.
>
> Two things worth knowing now. If you're thinking about running it with a small group or a marriage ministry, there's bulk and church pricing — reply and we'll send it before it goes public.
>
> And if Chapter One was useful to you, the most helpful thing you could do on launch day is tell one other couple. Not share a link. Tell them.
>
> — Larry & Ro

### Email 6 — November 1

**Subject:** It's out

> Hi [first name],
>
> *Never Fight or Argue Again* is available today.
>
> **[Get the book]**
>
> You've had Chapter One for a while now. The rest is both preparation plans, the Anti-Fight Plan where they meet, what to do when an old habit comes back, and a chapter-by-chapter discussion guide for couples and small groups.
>
> Thank you for reading the first part before there was anything to buy. That mattered to us.
>
> — Larry & Ro

---

# Part 4 — What's on the thank-you page now

Live already, no setup needed:

- **Download Chapter One now** — the PDF, immediately, no waiting for email
- **Read it in your browser** — for anyone on a phone who'd rather not download
- **Check your inbox** instructions, including the Promotions/Spam note
- **A launch card** announcing November 1st, with an **Add to calendar** button that drops the date straight into Apple or Google Calendar with a reminder the day before
- The three-step suggestion for how to read it
- A line asking them to reply and tell you where their marriage is

**Why the reply request matters more than it looks.** Replies are the strongest signal mailbox providers use to decide you're a real person rather than a bulk sender. A handful of replies early materially improves whether your launch email lands in the inbox on November 1st. It also tells you who's actually reading.

---

# Part 5 — Testing before anyone sees it

- [ ] Submit the form with your own address
- [ ] You land on the thank-you page
- [ ] **Download Chapter One now** downloads the right PDF
- [ ] **Add to calendar** opens November 1st in your calendar
- [ ] The email arrives (check spam)
- [ ] The download button in the email works
- [ ] Your row is in Supabase → `subscribers`, with `chapters_sent_at` filled in
- [ ] You appear in Brevo → Contacts → Free Chapter
- [ ] The Day 2 email is queued in the automation
- [ ] The unsubscribe link at the bottom works
- [ ] Reply to the email — does it reach your inbox?

**If the email doesn't arrive:** Supabase → Edge Functions → `subscribe` → **Logs**. The error will be in plain language.

---

# One thing to decide before November 1st

Brevo's free tier is **300 emails a day**, shared between these automatic deliveries and any campaign you send.

If you have 400 subscribers by launch, the November 1st email cannot go out in a single day on the free plan. It would take two.

Two options: watch the list and upgrade before launch if it passes about 250, or schedule the launch email in batches. Worth checking your subscriber count around October 20th so it isn't a surprise on the day.
