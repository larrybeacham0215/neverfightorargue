# The Emails — everything that goes out, in order

Eight emails. The first four send automatically already. The last four are
tied to fixed dates and are waiting on your venue and registration link.

Every one is written to sound like the two of you rather than a marketing
department. Read them the way a subscriber would — in order, a few days apart.

---

## 1. On signup — the delivery email

**Status:** live and sending
**Sent by:** `subscribe` function, the instant someone submits the form
**Subject:** `Your free chapter is here`

> Hi Larry,
>
> Thank you for requesting a chapter of our book!
>
> Most marriage advice starts from the assumption that fighting is normal, and the best you can do is fight fair. This chapter explains why we stopped believing that — and what we found on the other side of it.
>
> One suggestion: read it on your own first. Don't hand it to your spouse yet. When you're ready, the invitation lands better than the evidence does.
>
> **[ Download the chapter ]**
>
> — Larry & Ro

---

## 2. Day 2 — the check-in

**Status:** live, sends automatically
**Subject:** `Did you get a chance to read it?`

> Hi Larry,
>
> We sent Chapter One a couple of days ago. No pressure if it's still sitting there — we know what a week looks like.
>
> If you did read it, we'd like to know which part landed. Just hit reply. We read every one.
>
> And if it didn't land at all, tell us that too. That's useful to us.
>
> — Larry & Ro
>
> **[ Read it again ]**

*Why it's here: the reply request isn't only warmth. Replies are the strongest
signal mailbox providers use to decide you're a person rather than a bulk
sender, and early ones improve whether the launch email reaches inboxes.*

---

## 3. Day 5 — the hook into the method

**Status:** live, sends automatically
**Subject:** `Which one of you is which?`

> Hi Larry,
>
> Here's what surprises most couples about this book: there isn't one plan. There are two, and you don't both work the same one.
>
> The spouse carrying the hurt works a **Safety Plan** — how to say the hard thing without being wounded again in the saying of it.
>
> The spouse who caused it works a **Readiness Plan** — how to become someone that's safe to say it to.
>
> Most people know which one they'd be within about a page. The interesting part is when you each pick, separately, and then compare.
>
> — Larry & Ro

*Why it's here: it gives them something to do with their spouse rather than
something to read, and it's the most distinctive idea in the book.*

---

## 4. Day 9 — what's missing, and the first mention of the launch

**Status:** live, sends automatically
**Subject:** `What Chapter One doesn't tell you`

> Hi Larry,
>
> Chapter One makes the case. It doesn't give you the plan.
>
> That's on purpose — the argument has to land first, or the steps just look like more advice. But we don't want to leave you there, so here's the shape of what follows.
>
> Both spouses prepare separately. Then they meet, and the goal stops being to win and starts being to become one. There's a pause you can call by name when it's going badly — we call it Stop Loss — and a way back afterward that doesn't require anyone to grovel.
>
> That's the rest of the book. And we're not quietly putting it on sale — we're launching it live, in a room in Tampa, on November 1st. More on that soon.
>
> — Larry & Ro

*Why it's here: it names Stop Loss and the Anti-Fight Plan without teaching
them, so the book is the obvious next step — and it plants the launch.*

---

# The four dated emails

**Status:** written, not yet scheduled. Both bracketed items below need real
values before these can go out.

---

## 5. October 18 — the invitation

**Subject:** `Can you be in the room?`

> Hi Larry,
>
> On November 1st we're launching *Never Fight or Argue Again* live, in Tampa. Not a webinar. An actual room, with actual couples in it.
>
> We'd love you there. **[ Reserve a seat ]** — it's free, we just need a headcount.
>
> If Tampa isn't reachable for you, stay on this list anyway. You'll get the book link the same day, and we'll send out what we teach from the stage that night.
>
> One more thing: if you're thinking about running this with a small group or a marriage ministry, reply and we'll send you bulk and church pricing before it goes public.
>
> — Larry & Ro

**Needs:** the registration link, and the time and venue once confirmed.

---

## 6. October 30 — the nudge

**Subject:** `Saturday`

> Hi Larry,
>
> The launch is this Saturday, November 1st, in Tampa. **[ Details and directions ]**
>
> If you're coming: come early if you can. We'd rather meet you than start on time.
>
> If you're not: the book goes live the same day and you'll get the link in the morning.
>
> — Larry & Ro

**Needs:** the venue address.

*Short on purpose. Two days out, nobody reads a long email — they want the
time and the place.*

---

## 7. November 1 — the book

**Subject:** `It's out`

> Hi Larry,
>
> *Never Fight or Argue Again* is available today.
>
> **[ Get the book ]**
>
> You've had Chapter One for a while now. The rest is both preparation plans, the Anti-Fight Plan where they meet, what to do when an old habit comes back, and a chapter-by-chapter discussion guide for couples and small groups.
>
> Thank you for reading the first part before there was anything to buy. That mattered to us.
>
> — Larry & Ro

**Needs:** the retailer link.

---

## 8. November 3 — for everyone who couldn't come

**Subject:** `What we said on Saturday`

> Hi Larry,
>
> Saturday's launch was something we'll be thinking about for a long time. Thank you to everyone who came.
>
> For those who couldn't: here's the part we most wanted people to hear. **[ Link or short recap ]**
>
> The book is out now, and the invitation in it is the same one we made from the stage — stop trying to fight better. Learn to stop.
>
> — Larry & Ro

**Needs:** a video clip, a photo, or three sentences of recap.

*This one matters more than it looks. A Tampa event splits your list
geographically — without this email, everyone outside Florida gets a month of
build-up toward something they can't attend, and then silence.*

---

# How to change any of this

**Emails 1–4** live in code. Tell me the change and I'll edit and redeploy —
they're in `supabase/functions/subscribe/index.ts` and
`supabase/functions/drip/index.ts`.

**Emails 5–8** aren't scheduled yet. Send me the venue, the registration link,
and the retailer link, and I'll schedule all four.

Rewriting any of them is fine. They're a starting point, not a finished thing
— you know these couples and I don't.

---

# One gap worth naming

There is nothing written for someone who **doesn't** open anything. After
email 4 on day 9, a quiet subscriber hears nothing until October 18.

That's deliberate — sending more to someone who isn't reading trains mailbox
providers to bury you. But if signups start well before October, a couple of
useful, non-selling emails in that gap would keep the list warm. Worth
revisiting in September once you can see how people are actually behaving.
