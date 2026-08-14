# GoDaddy DNS — Brevo email authentication

Four records. This is the last thing standing between you and working email.

**Where:** godaddy.com → profile icon → **My Products** → find `neverfightorargue.com` → **DNS**

---

## Add these three

Click **Add New Record** for each. Copy and paste the values exactly — a stray space breaks them.

### 1. DKIM (first key)

| Field | Value |
|---|---|
| **Type** | `CNAME` |
| **Name** | `brevo1._domainkey` |
| **Value** | `b1.neverfightorargue-com.dkim.brevo.com` |
| **TTL** | 1 Hour |

### 2. DKIM (second key)

| Field | Value |
|---|---|
| **Type** | `CNAME` |
| **Name** | `brevo2._domainkey` |
| **Value** | `b2.neverfightorargue-com.dkim.brevo.com` |
| **TTL** | 1 Hour |

### 3. Domain ownership

| Field | Value |
|---|---|
| **Type** | `TXT` |
| **Name** | `@` |
| **Value** | `brevo-code:ed0dcf30702f09c240d094f35d28bb18` |
| **TTL** | 1 Hour |

> GoDaddy sometimes rewrites a `@` name to your domain. Both are fine.

---

## Then change the one that already exists

You already have a `_dmarc` TXT record, put there by GoDaddy. It currently reads:

```
v=DMARC1; p=quarantine; adkim=r; aspf=r; rua=mailto:dmarc_rua@onsecureserver.net;
```

**`p=quarantine` is the instruction telling mailbox providers to hold mail from your domain that isn't fully authenticated.** While you're getting set up, that's your own DNS filtering your own launch emails into spam.

Find the `TXT` record named `_dmarc`, click the **pencil** to edit it, and replace the value with:

```
v=DMARC1; p=none; rua=mailto:rua@dmarc.brevo.com
```

`p=none` means *watch and report, don't block*. That's the right setting while a new sending domain builds reputation. Once you've been sending cleanly for a few months, tightening it back up is a good idea — I'll flag it when it's time.

---

## Then tell me

I'll trigger Brevo's verification and confirm from my side. DNS usually propagates within an hour, sometimes ten minutes.

Once it passes, I'll re-send the chapter email to you as a real test — and that one will actually arrive.

---

## What's already done

- Domain registered with Brevo (`neverfightorargue.com`)
- Supabase project, database, and both Edge Functions live
- The site wired and pushed
- Brevo list created
- Chapter PDF live and downloadable

The only thing not working is delivery, and these four records are the reason.
