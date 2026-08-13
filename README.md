# neverfightorargue.com

Marketing site for **Never Fight or Argue Again** by Larry & Rolanda Beacham.

**Start here: [GO-LIVE-NOW.md](GO-LIVE-NOW.md)** — the 35 minutes that put the site on the internet.
**Then: [LAUNCH-GUIDE.md](LAUNCH-GUIDE.md)** — connecting Supabase and Brevo so the forms work.

## Stack

| Layer | Service |
|---|---|
| Website | GitHub Pages (this repo) |
| Backend | Supabase (database + Edge Functions) |
| Email | Brevo |
| Domain | GoDaddy (DNS stays here) |

## Files

```
index.html              The entire site — every tab is a view inside this one file
unsubscribe/index.html  Unsubscribe page linked from email footers
404.html                Catches stray URLs, routes legacy links to the right tab
CNAME                   Tells GitHub Pages the custom domain
.nojekyll               Stops GitHub processing this as a Jekyll blog
assets/                 Cover, favicons, social share card, author photo
chapters/               The free two-chapter PDF
supabase/schema.sql     Run once in the Supabase SQL editor
supabase/functions/     Two Edge Functions to deploy in the Supabase dashboard
```

## The two settings that make it work

`supabaseProjectRef` and `supabaseAnonKey` appear in **both** `index.html` and
`unsubscribe/index.html`. They must match. Everything else is wired already.

The anon key is safe in public source — Row Level Security blocks it from
reading or writing anything. The Brevo key and service role key live only as
Supabase secrets and never appear in this repo.

## Editing

Open a file → pencil icon → change → **Commit changes**. Live in about a minute.
