# Email system — what's built, what's left

This file used to be a setup guide. It isn't any more, because the setup is
done. This is a status page.

**You have nothing to do here except the four items at the bottom.**

---

## Working right now, verified

| | Status |
|---|---|
| Supabase project `NFOAA` | Live, separate from your KDM project |
| Database — `subscribers`, `inquiries` | Created, row-level security on |
| `subscribe` function | Deployed, v2 |
| `unsubscribe` function | Deployed, v1 |
| `drip` function | Deployed, v1 |
| Hourly scheduled job | Active, runs at 7 past the hour |
| Brevo domain `neverfightorargue.com` | Authenticated and verified |
| Sender `hello@neverfightorargue.com` | Active, no DKIM or SPF errors |
| Brevo list `NFOAA — Free Chapter` | Created, list ID 3 |
| Chapter PDF | Live and downloading |
| Site wired to the backend | Pushed and confirmed |
| Subscribers | 0 — all test data cleared |

Tested end to end on the live site: form submitted, row saved, chapter email
**delivered and opened**, contact added to the Brevo list, thank-you page and
instant download working, unsubscribe link working.

---

## What happens when someone signs up

```
Submits the form on neverfightorargue.com
        ↓  instantly
   Saved to your database
   Chapter One email sent
   Added to the Brevo list
        ↓  automatically, hourly job
   Day 2   Did you get a chance to read it?
   Day 5   Which one of you is which?
   Day 9   What Chapter One doesn't tell you
        ↓  not scheduled yet — see below
   Oct 18  Can you be in the room?
   Oct 30  Saturday
   Nov 1   It's out
   Nov 3   What we said on Saturday
```

The four timed emails run from code, not from a Brevo automation. Each
subscriber carries a stage, so a retry or a double-run can never send the same
email twice — tested.

---

## The four things still outstanding

Everything else is finished. These need information only you have.

**1. Venue and time for November 1st.**
The October 18 and October 30 emails reference a room with no address yet.

**2. A registration link.**
Send me an Eventbrite private token and I'll create the event and produce the
link. Or say the word and I'll build the RSVP form on your own site instead.

**3. Retailer links for the book.**
The five buy buttons on the Book page still point nowhere, and the November 1
email needs somewhere to send people.

**4. Something for the November 3 recap.**
A video clip, a photo, or three sentences about what you said from the stage.

Send any of these and I'll wire them up and schedule the emails.

---

## Where to look once people start signing up

| What | Where |
|---|---|
| Who signed up | Supabase → Table Editor → `subscribers` |
| Church and speaking inquiries | Supabase → Table Editor → `inquiries` |
| Whether emails delivered | Brevo → Transactional → Logs |
| Errors | Supabase → Edge Functions → Logs |
| Contacts for newsletters | Brevo → Contacts → `NFOAA — Free Chapter` |

Export your list any time: **SQL Editor** → `select * from active_subscribers;`
→ Download CSV.

---

## Two things to watch before November

**Brevo's free tier is 300 emails a day**, shared with anything KDM sends from
the same account. If your list passes about 250 by launch, the November 1 email
can't go out in a single day. Check the count around October 20th.

**DMARC is set to `p=none`** so nothing gets held while the domain is new.
Around January, once you've been sending cleanly for a few months, tightening
it to `p=quarantine` is worth doing. Ask me and I'll handle it.

---

## To change any email wording

The emails live in code, not in a dashboard:

- Delivery email → `supabase/functions/subscribe/index.ts`
- Day 2, 5 and 9 → `supabase/functions/drip/index.ts`

Tell me what you want changed and I'll edit and redeploy. Read them first in
**THE-EMAILS.md**, which has all eight in plain language.
