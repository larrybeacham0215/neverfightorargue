# GoDaddy DNS — exactly what to change

**Why you're seeing "DNS check unsuccessful":** GitHub is looking at your domain and finding GoDaddy's parking page instead of itself. Nothing is broken. You just haven't done the GoDaddy half yet.

I checked your domain a moment ago:

```
neverfightorargue.com      →  13.248.243.5, 76.223.105.230   ← GoDaddy parking
www.neverfightorargue.com  →  13.248.243.5, 76.223.105.230   ← GoDaddy parking

larrybeacham0215.github.io →  185.199.108-111.153            ← GitHub, working
```

Your GitHub side is done and correct. Only the signpost needs moving.

---

## Get to the right screen

1. **godaddy.com** → sign in
2. Profile icon, top right → **My Products**
3. Find **neverfightorargue.com** → click the **DNS** button beside it

You're now looking at a list of DNS records.

---

## Your current records, row by row

| Type | Name | Data | What to do |
|---|---|---|---|
| **A** | `@` | WebsiteBuilder Site | **CHANGE** → `185.199.108.153` |
| NS | `@` | ns39.domaincontrol.com | Leave alone |
| NS | `@` | ns40.domaincontrol.com | Leave alone |
| **CNAME** | `www` | neverfightorargue.com | **CHANGE** → `larrybeacham0215.github.io` |
| CNAME | `_domainconnect` | _domainconnect.gd.domaincontrol.com | Leave alone |
| SOA | `@` | Primary nameserver: ns39... | Leave alone |
| TXT | `_dmarc` | v=DMARC1; p=quarantine... | Leave alone for now |

Only two rows change. Then you add three more.

---

## Part 1 — Edit the two existing records

**Edit rather than delete.** That `A @ WebsiteBuilder Site` row is tied to a GoDaddy Website Builder site, and if you delete it GoDaddy often puts it back within minutes. Overwriting the value sidesteps that entirely.

### 1a. The A record

- Click the **pencil (Edit)** icon on the `A / @ / WebsiteBuilder Site` row
- Change the **Value** field to `185.199.108.153`
- **Save**

> **If the Value field is locked or greyed out**, the Website Builder site has a hold on it. Go to **My Products → Website Builder** (or "Websites + Marketing") and **unpublish or remove** that site. Come back and the field will be editable. You aren't losing anything — that's the placeholder page currently sitting on your domain.

### 1b. The www CNAME

- Click the **pencil** icon on the `CNAME / www / neverfightorargue.com` row
- Change the **Value** to `larrybeacham0215.github.io`
- **Save**

No `https://`, no `/neverfightorargue`, no trailing slash or dot.

---

## Part 2 — Add three more A records

GitHub uses four addresses. You've set one; add the other three.

Click **Add New Record** three times:

| Type | Name | Value | TTL |
|---|---|---|---|
| A | `@` | `185.199.109.153` | 1 Hour |
| A | `@` | `185.199.110.153` | 1 Hour |
| A | `@` | `185.199.111.153` | 1 Hour |

You'll end up with four A records all named `@`. That looks wrong and is completely correct — it's how GitHub spreads traffic across its servers.

Only the third number changes: **108, 109, 110, 111.** The last number is `153` every time.

---

## Part 2b — Check Forwarding

Scroll to the bottom of the DNS page for a **Forwarding** section. If anything is set there, **turn it off.** Forwarding overrides your records and quietly undoes all of the above.

---

## Part 3 — Wait, then tell GitHub to look again

DNS takes anywhere from ten minutes to a few hours. Usually under an hour.

**Watch it happen:** go to **dnschecker.org**, enter `neverfightorargue.com`, choose **A** from the dropdown, search. When the map fills with `185.199.x.153` instead of `13.248.243.5`, you're through.

Then back in **GitHub → Settings → Pages**, click **Check again**. The red box turns into a green checkmark.

---

## Part 4 — Turn on HTTPS

Once the check passes, a checkbox appears: **Enforce HTTPS**. Tick it.

It may be greyed out for up to 24 hours while GitHub issues your security certificate. Come back and tick it — the site isn't properly secure until you do.

---

## Done

**Type `neverfightorargue.com` into a browser. Your site comes up.**

---

## While you wait

Your site is already live at:

```
https://larrybeacham0215.github.io/neverfightorargue/
```

Open that now and look around. Some images may be missing on this temporary address, because the site expects to live at the root of a domain rather than in a `/neverfightorargue/` subfolder. That corrects itself the moment the custom domain takes over — don't chase it.

---

## If "Check again" keeps failing

**Give it more time first.** GitHub caches its DNS lookups, so it can lag behind reality by an hour or so even after dnschecker looks right.

**Then verify in this order:**

1. Are all four A records showing `@` as the name? Not `neverfightorargue.com`, not blank — `@`
2. Did the `WebsiteBuilder Site` value actually change, or did GoDaddy put it back? If it reappeared, unpublish the Website Builder site under My Products
3. Is Forwarding definitely off?
4. Is the CNAME value exactly `larrybeacham0215.github.io` with no trailing dot or slash?

**Your own browser will lie to you.** Mac and Windows both cache DNS hard. If dnschecker shows the new records but your browser still shows the parking page, try a private window, or your phone on cellular data instead of wifi.
