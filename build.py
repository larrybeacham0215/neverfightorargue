#!/usr/bin/env python3
"""Post-launch refresh build (replaces the old deploy.py regeneration step).
src/base.html = the shared single-page app (main's index.html at branch time).
copy/*.json   = all new copy, one file per page. Venture edits those only.
pages.json    = per-page head (title, description, OG image, planned index status).
Writes index.html and every interior copy. Robots meta is copied from each page's
current file on main, so nothing in this branch changes indexing.
Admin and transactional pages keep their original <head> verbatim.
Never pushes anything."""
import json, re, subprocess, html, sys
R = lambda p: open(p, encoding='utf-8').read()
C = {k: json.load(open(f'copy/{k}.json')) for k in ['global','home','book','gift','free-chapter','churches','speaking','downloads','about','thank-you','share']}
G, H, B, GF, FC = C['global'], C['home'], C['book'], C['gift'], C['free-chapter']
CH, SP, AB, TY = C['churches'], C['speaking'], C['about'], C['thank-you']
CHECKOUT = 'https://zojsascliwlqgxcrqqlo.supabase.co/functions/v1/book-checkout'
PAGES = json.load(open('pages.json'))
KEEP_HEAD = {'/express/','/guests/','/readers/','/invoice/','/pickup/','/sponsor-thank-you/','/sponsor-paid/','/sponsor/checkout/','/gift/checkout/','/book/checkout/'}
SITE = 'https://neverfightorargue.com'
s = R('src/base.html')

def rep(old, new, count=1):
    global s
    n = s.count(old)
    if n != count: sys.exit(f'expected {count} of {old[:70]!r}, found {n}')
    s = s.replace(old, new)

def cut(start_marker, end_marker, new):
    """replace from start_marker through end_marker (inclusive)"""
    global s
    i = s.index(start_marker); j = s.index(end_marker, i) + len(end_marker)
    s = s[:i] + new + s[j:]

# ---------- nav and footer ----------
rep('      <a href="/book-launch/" data-tab="launch">Book Launch</a>\n',
    f'      <a href="/downloads/">{G["nav_resources"]}</a>\n')
rep('          <li><a href="/book-launch/" data-tab="launch">Book Launch</a></li>\n',
    f'          <li><a href="/downloads/">{G["nav_resources"]}</a></li>\n          <li><a href="/free-chapter/" data-tab="chapters">{G["nav_cta"]}</a></li>\n')
rep('Biblical conflict resolution for couples who have tried everything. Larry &amp; Rolanda Beacham · Odessa, Florida.', G['footer_tagline'])

# /book-launch/ now opens the book order view
rep("    '/book-launch/':   'launch',", "    '/book-launch/':   'book',")

s = s.replace('href="/book-launch/" data-tab="launch">Back to the launch page</a>', 'href="/book/" data-tab="book">Get the book</a>')

# ---------- launch banners and popups ----------
cut('  <div class="qrbox" id="qrBox"', '</button></div>\n    </div>\n  </div>\n',
    '  <div class="qrbox" id="qrBox" hidden></div>\n')
cut('  <div class="stick" id="stick" hidden>', '</div>\n  </div>\n',
    '  <div class="stick" id="stick" hidden><div class="stick__inner"><button type="button" class="stick__x" id="stickX" aria-label="Dismiss">&times;</button></div></div>\n')
cut('    <a class="hero__banner" href="/book-launch/"', '    </a>\n', '')
rep('    <p class="presby presby--hero"><span>Presented by</span> <b>Replace Your University</b></p>\n', '')

# ---------- home: new resources + speaking bands, churches teaser ----------
band = lambda eyebrow, title, body, href, cta, cls, tab='': (
 f'  <section class="band {cls} refresh-band">\n    <div class="wrap" style="text-align:center;max-width:46rem">\n'
 f'      <p class="eyebrow reveal">{eyebrow}</p>\n      <h2 class="h-lg reveal">{title}</h2>\n'
 f'      <p class="lede center reveal">{body}</p>\n'
 f'      <p class="reveal" style="margin-top:1.75rem"><a class="btn" href="{href}"{tab}>{cta}</a></p>\n    </div>\n  </section>\n\n')
thumbs = ''.join(f'<img src="/downloads/thumbs/{t}.webp" alt="" width="120" loading="lazy" style="width:min(18vw,120px);height:auto;margin:.35rem;border:1px solid #C39A5E;border-radius:4px;background:#fff">' for t in ['anti-fight-plan','anti-fight-plan-and-safety-plan','luv-framework','stop-loss-strategy','validation-exercise'])
res = band(H['resources_eyebrow'], H['resources_title'], H['resources_body'], '/downloads/', H['resources_cta'], 'band--light').replace('    </div>\n  </section>', f'      <p class="reveal" style="margin-top:1.5rem">{thumbs}</p>\n    </div>\n  </section>',1)
anchor = '  <section class="band on-navy">\n    <div class="wrap grid-2 grid-2--center">\n      <div class="reveal">\n        <p class="eyebrow">For churches &amp; ministries</p>'
rep(anchor, res + anchor)
rep('<h2 class="h-lg">Looking for marriage curriculum?</h2>', f'<h2 class="h-lg">{H["churches_title"]}</h2>')
rep('<p class="lede lede--light">The book, the companion workbook, and the full video course work together, so a small group, a marriage ministry, or a whole congregation can walk the plan at the same pace.</p>\n        <p style="margin-top:1.75rem"><a class="btn" href="/churches/" data-tab="churches">See what\'s available</a></p>',
    f'<p class="lede lede--light">{H["churches_body"]}</p>\n        <p style="margin-top:1.75rem"><a class="btn" href="/churches/" data-tab="churches">{H["churches_cta"]}</a></p>')
i = s.index('<div class="view" id="view-book" hidden>'); j = s.rindex('</div>', 0, i)
s = s[:j] + band(H['speaking_eyebrow'], H['speaking_title'], H['speaking_body'], '/speaking/', H['speaking_cta'], 'band--paper', ' data-tab="speaking"') + s[j:]

# ---------- book: evergreen buy or gift ----------
BUY = B['buy_url'] or CHECKOUT
GIFT = B['gift_url'] or GF.get('cta_url') or CHECKOUT
cut('  <section class="band on-navy" id="buy">', '  </section>\n',
f'''  <section class="band on-navy" id="buy">
    <div class="wrap" style="text-align:center">
      <p class="eyebrow reveal">{B["buy_eyebrow"]}</p>
      <h2 class="h-xl reveal">{B["buy_title"]}</h2>
      <div class="orn orn--short orn--center reveal" aria-hidden="true"><span></span></div>
      <p class="lede lede--light center reveal" style="margin-bottom:2rem">{B["buy_body"]}</p>
      <div class="reveal buy__soonBtns" style="justify-content:center">
        <a class="btn" href="{BUY}" data-evergreen-buy>{B["buy_cta"]}</a>
        <a class="btn btn--outline" href="/gift/" data-tab="gift">{B["gift_cta"]}</a>
      </div>
      <div class="reveal buy__stores" id="buyStores" style="margin-top:2rem">
        <a class="btn btn--outline" data-store="amazon" rel="noopener" target="_blank">Amazon</a>
        <a class="btn btn--outline" data-store="kindle" rel="noopener" target="_blank">Kindle</a>
        <a class="btn btn--outline" data-store="bn" rel="noopener" target="_blank">Barnes &amp; Noble</a>
        <a class="btn btn--outline" data-store="apple" rel="noopener" target="_blank">Apple Books</a>
        <a class="btn btn--outline" data-store="christianbook" rel="noopener" target="_blank">Christianbook</a>
      </div>
      <div class="reveal buy__soon" id="buySoon"><p>{B["retail_note"]}</p></div>
      <div class="reveal" style="max-width:34rem;margin:3rem auto 0;padding-top:2.5rem;border-top:1px solid rgba(247,243,234,.14)">
        <h3 class="h-sm" style="margin-bottom:.75rem">{B["group_title"]}</h3>
        <p style="margin-bottom:1.5rem">{B["group_body"]}</p>
        <a class="btn" href="/churches/" data-tab="churches">{B["group_cta"]}</a>
      </div>
    </div>
  </section>
''')

# ---------- free chapter side card ----------
cut('      <div class="ty__side ty__side--invite">', '        </div>\n      </div>\n',
f'''      <div class="ty__side ty__side--invite">
        <div class="ty__card">
          <p class="eyebrow">{FC["side_eyebrow"]}</p>
          <h2 class="ty__h2">{FC["side_title"]}</h2>
          <div class="orn orn--short" aria-hidden="true"><span></span></div>
          <p>{FC["side_body"]}</p>
          <p class="ty__cardCta"><a class="btn" href="/downloads/">{FC["side_cta"]}</a></p>
          <p class="ty__cardAlt"><a href="/churches/" data-tab="churches">{FC["side_alt"]}</a></p>
        </div>
      </div>
''')

# ---------- archive notices on launch-only views (old markup hidden, JS hooks kept) ----------
ARCH = ['launch','registered','preorder-promo','preorder-thanks','preorder-checkout','sponsor']
notice = (f'<section class="band band--paper archive"><div class="wrap" style="text-align:center;max-width:40rem;padding:4rem 0">'
          f'<h1 class="h-lg">{G["archive_title"]}</h1><p class="lede center">{G["archive_body"]}</p>'
          f'<p style="margin-top:1.75rem"><a class="btn" href="/book/" data-tab="book">{G["archive_cta1"]}</a> '
          f'<a class="btn btn--outline" href="/free-chapter/" data-tab="chapters">{G["archive_cta2"]}</a></p></div></section>\n')
for v in ARCH:
    n2 = notice
    if v in ('registered','preorder-thanks'):
        n2 = notice.replace(G['archive_body'], TY['registered' if v=='registered' else 'preorder-thank-you'])
    rep(f'<div class="view" id="view-{v}" hidden>\n', f'<div class="view" id="view-{v}" hidden>\n' + n2)
gift_block = (f'<section class="band band--paper archive"><div class="wrap" style="text-align:center;max-width:40rem;padding:4rem 0">'
  f'<h1 class="h-lg">{GF["title"]}</h1><p class="lede center">{GF["body"]}</p>'
  f'<p style="margin-top:1.75rem"><a class="btn" href="{GIFT}" data-gift>{GF["cta"]}</a></p></div></section>\n')
rep('<div class="view" id="view-gift" hidden>\n', '<div class="view" id="view-gift" hidden>\n' + gift_block)
gt_block = (f'<section class="band band--paper archive"><div class="wrap" style="text-align:center;max-width:40rem;padding:4rem 0">'
  f'<h1 class="h-lg">{GF["thanks_title"]}</h1><p class="lede center">{GF["thanks_body"]}</p>'
  f'<p style="margin-top:1.75rem"><a class="btn" href="/book/" data-tab="book">Back to the book</a></p></div></section>\n')
rep('<div class="view" id="view-gift-thanks" hidden>\n', '<div class="view" id="view-gift-thanks" hidden>\n' + gt_block)
css = ''.join(f'#view-{v}>:not(.archive){{display:none!important}}' for v in ARCH+['gift','gift-thanks'])
css += '#stick,#qrBox{display:none!important}#buyStores:not(:has(a[href])){display:none}#buySoon.is-off{display:none}'
rep('</style>\n<script type="application/ld+json">', css + '\n</style>\n<script type="application/ld+json">')


# ---------- v1 copy wiring (Venture copy, copy-notes-v1.md) ----------
def sec(inner, cls='band--paper'):
    return f'  <section class="band {cls} refresh">\n    <div class="wrap" style="max-width:52rem">\n{inner}    </div>\n  </section>\n'
def ul(items): return '<ul class="ticks">' + ''.join(f'<li>{x}</li>' for x in items) + '</ul>'

# nav order: Home, The Book, For Churches, Speaking, Free Resources, About
NL = G['nav_labels']
rep('''      <a href="/" data-tab="home">Home</a>
      <a href="/book/" data-tab="book">The Book</a>
      <a href="/downloads/">Free Resources</a>
      <a href="/churches/" data-tab="churches">For Churches</a>
      <a href="/speaking/" data-tab="speaking">Speaking</a>
      <a href="/about/" data-tab="about">About Us</a>
''', f'''      <a href="/" data-tab="home">{NL[0]}</a>
      <a href="/book/" data-tab="book">{NL[1]}</a>
      <a href="/churches/" data-tab="churches">{NL[2]}</a>
      <a href="/speaking/" data-tab="speaking">{NL[3]}</a>
      <a href="/downloads/">{NL[4]}</a>
      <a href="/about/" data-tab="about">{NL[5]}</a>
''')
# footer org + socials (brackets stay visible)
rep('<span>Privacy · Terms</span>', f'<span>{G["footer_org"]} · {G["footer_socials"]} · Privacy · Terms</span>')

# evergreen banner on home hero (where the launch banner was)
rep('        <p class="hero__kicker reveal">A happier, stronger marriage is possible</p>\n',
    f'        <p class="hero__kicker reveal"><a href="{G["banner_url"]}" style="color:inherit">{G["banner_text"]}</a></p>\n')
rep('<h1 class="reveal"><span class="hero__lead">Get the First Chapter of</span><span class="hero__title">Never Fight <em>or</em><br>Argue Again &ndash; Free</span></h1>',
    f'<h1 class="reveal"><span class="hero__title">{H["hero_headline"]}</span></h1>')
i = s.index('<p class="hero__sub reveal">'); j = s.index('</p>', i)
s = s[:i] + f'<p class="hero__sub reveal">{H["hero_subhead"]}' + s[j:]
rep('          <p class="hero__fine">Free instant download &bull; No spam &bull; Unsubscribe anytime</p>\n',
    f'          <p class="hero__fine">Free instant download &bull; No spam &bull; Unsubscribe anytime</p>\n          <p class="hero__fine"><a href="/downloads/">{H["hero_secondary_cta"]} &rarr;</a></p>\n')
# home book band, before speaking band
spk = s.index(f'<h2 class="h-lg reveal">{H["speaking_title"]}</h2>'); k = s.rindex('  <section class="band', 0, spk)
s = s[:k] + band('The book', H['book_title'], H['book_body'], BUY, H['book_cta'], 'on-navy') + s[k:]
# polish: live em dash line
s = s.replace("isn't temperament or luck &mdash; it's preparation", "isn't temperament or luck. It's preparation.").replace("isn\u2019t temperament or luck \u2014 it\u2019s preparation","isn\u2019t temperament or luck. It\u2019s preparation.").replace("isn't temperament or luck — it's preparation","isn't temperament or luck. It's preparation.")

# book hero
rep('        <h1>A plan for the conversation, not just advice about the fight.</h1>\n', f'        <h1>{B["hero_title"]}</h1>\n')
i = s.index('<h1>'+B['hero_title']+'</h1>'); a = s.index('<p>', i); z = s.index('</p>', a)+4
s = s[:a] + f'<p>{B["buy_page_line"]}<br><strong style="display:inline-block;margin-top:.75rem">{B["hero_price_line"]}</strong></p>' + s[z:]
rep('          <a class="btn" href="#buy">Where to buy</a>\n          <a class="btn btn--outline" href="/" data-tab="home">Read Chapter One free</a>',
    f'          <a class="btn" href="{BUY}" data-evergreen-buy>{B["buy_cta"]}</a>\n          <a class="btn btn--outline" href="/gift/" data-tab="gift">{B["gift_cta"]}</a>')
i = s.index('<section class="band on-navy" id="buy">')
s = s[:i] + sec(f'      <h2 class="h-lg reveal">{B["gift_title"]}</h2>\n      <p class="lede reveal">{B["gift_body"]}</p>\n      <p class="reveal" style="margin-top:1.5rem"><a class="btn btn--onLight" href="{GIFT}" data-gift>{GF["cta"]}</a></p>\n').replace('  <section','<section',1) + '\n  ' + s[i:]

# churches: new content up top, keep the inquiry form section
faq = ''.join(f'<details style="margin:.75rem 0"><summary><strong>{x["q"]}</strong></summary><p>{x["a"]}</p></details>' for x in CH['faq'])
ch = (f'  <header class="phead refresh"><div class="wrap"><p class="eyebrow">For churches and small groups</p><h1>{CH["hero_title"]}</h1><p>{CH["hero_body"]}</p>'
      f'<p class="phead__cta"><a class="btn" href="#inquire">Tell us about your group</a></p></div></header>\n'
  + sec(f'      <h2 class="h-lg">{CH["what_title"]}</h2><p class="lede">{CH["what_body"]}</p>\n      <h2 class="h-lg" style="margin-top:2.5rem">{CH["pricing_title"]}</h2><p class="lede">{CH["pricing_body"]}</p><p style="margin-top:1.5rem"><a class="btn" href="/churches/#inquire">{CH["pricing_cta"]}</a></p>\n')
  + sec(f'      <h2 class="h-lg">{CH["steps_title"]}</h2><ol class="lede">' + ''.join(f'<li>{x}</li>' for x in CH['steps']) + f'</ol><p style="margin-top:1.5rem"><a class="btn" href="/churches/#inquire">{CH["steps_cta"]}</a></p>\n', 'band--light')
  + sec(f'      <h2 class="h-lg">{CH["leader_title"]}</h2><p class="lede">{CH["leader_body"]}</p><p style="margin-top:1.5rem"><a class="btn" href="/downloads/">{CH["leader_cta"]}</a></p>\n', 'on-navy')
  + sec(f'      <h2 class="h-lg">Questions</h2>{faq}\n'))
rep('<div class="view" id="view-churches" hidden>\n', '<div class="view" id="view-churches" hidden>\n' + ch)
i = s.index('<section class="band band--paper" id="inquire">'); a = s.index('<p class="lede">', i); z = s.index('</ul>', a)+5
s = s[:a] + f'<p class="lede">{CH["form_intro"]}</p>' + s[z:]
s = s.replace('<section class="band band--paper" id="inquire">', '<section class="band band--paper refresh" id="inquire">', 1)

# speaking: new content, press/media, keep the booking form section
sp = (f'  <header class="phead refresh"><div class="wrap"><p class="eyebrow">Speaking</p><h1>{SP["hero_title"]}</h1><p>{SP["hero_body"]}</p>'
      f'<p class="phead__cta"><a class="btn" href="#book-us">{SP["cta"]}</a></p></div></header>\n'
  + sec(f'      <h2 class="h-lg">{SP["formats_title"]}</h2>' + ''.join(f'<h3 class="h-sm" style="margin-top:1.5rem">{x["name"]}</h3><p>{x["body"]}</p>' + (f'<p style="margin-top:1rem"><a class="btn" href="/speaking/#book-us">{x["cta"]}</a></p>' if x.get("cta") else '') for x in SP['formats']) + '\n')
  + sec(f'      <h2 class="h-lg">{SP["process_title"]}</h2><p class="lede">{SP["process_body"]}</p><p class="lede">{SP["fees_body"]}</p><p class="lede">{SP["location_line"]}</p><p style="margin-top:1.5rem"><a class="btn" href="/speaking/#book-us">{SP["process_cta"]}</a></p>\n', 'band--light')
  + sec(f'      <h2 class="h-lg">{SP["press_title"]}</h2><p class="lede">{SP["press_body"]}</p><p style="margin-top:1.5rem"><a class="btn" href="#" data-mail="Press inquiry">Email us</a></p>\n', 'on-navy'))
rep('<div class="view" id="view-speaking" hidden>\n', '<div class="view" id="view-speaking" hidden>\n' + sp)
s = s.replace('<section class="band band--light" id="book-us">', '<section class="band band--light refresh" id="book-us">', 1)

# about: church line, celebration line, launch media bracket. Testimonials HIDE (not rendered).
i = s.index('<div class="view" id="view-about" hidden>'); k = s.index('  <section class="band on-navy">', i)
s = s[:k] + sec(f'      <p class="lede">{AB["church_line"]}</p>\n      <p class="lede">{AB["celebration_line"]}</p>\n      <!-- testimonials: HIDE until real (copy/about.json) -->\n') + s[k:]

# chapter thank-you line
rep('<div class="view" id="view-thanks" hidden>\n', f'<div class="view" id="view-thanks" hidden>\n<p class="refresh-note" style="text-align:center;margin:1.5rem auto 0;max-width:40rem">{TY["thank-you"]}</p>\n')

css2 = ('#view-churches>:not(.refresh),#view-speaking>:not(.refresh){display:none!important}'
        '.refresh details summary{cursor:pointer}')
rep('</style>\n<script type="application/ld+json">', css2 + '\n</style>\n<script type="application/ld+json">')

# ---------- review fixes (Michelangelo + Ray), Nov 2 ----------
SAFETY = ('If you are in an abusive or unsafe relationship, this book is not a substitute for help. '
          'Call the National Domestic Violence Hotline at <a href="tel:+18007997233">1-800-799-7233</a>.')
safety_box = lambda cls='': (f'<p class="safety-note{cls}" role="note" style="max-width:40rem;margin:{"2rem 0 0" if cls else "2rem auto 0"};padding:1rem 1.25rem;'
  f'border:1px solid #C39A5E;border-radius:6px;background:#FAF6EC;color:#16261C;font-size:.95rem;text-align:left">{SAFETY}</p>\n')
# book: under the gift section; churches: under the hero
i = s.index(f'<h2 class="h-lg reveal">{B["gift_title"]}</h2>'); k = s.index('    </div>\n  </section>', i)
s = s[:k] + '      ' + safety_box() + s[k:]
i = s.index(f'<h1>{CH["hero_title"]}</h1>'); k = s.index('</div></header>', i)
s = s[:k] + safety_box(' safety-note--hero') + s[k:]

# delete launch-era "Presented by" lines and the SOLD presenting sponsor card
s, n = re.subn(r'[ \t]*<p class="presby[^"]*"><span>Presented by</span> <b>Replace Your University</b></p>\n', '', s)
print('presby removed:', n)
cut('        <article class="sprow sprow--top sprow--sold"', '        </article>\n', '')
s = re.sub(r'\.presby[^{\n]*\{[^}]*\}\n', '', s)
assert '.presby' not in s
assert 'Replace Your University' not in s and 'Presented by' not in s, 'RYU leftovers remain'

# self-hosted QR scanner for /express/ (was unpkg, no integrity)
rep("sc.src = 'https://unpkg.com/html5-qrcode@2.3.8/html5-qrcode.min.js';",
    "sc.src = '/assets/vendor/html5-qrcode-2.3.8.min.js'; sc.integrity = 'sha384-c9d8RFSL+u3exBOJ4Yp3HUJXS4znl9f+z66d1y54ig+ea249SpqR+w1wyvXz/lk+';")

# Buy and Gift: POST to book-checkout, then go to the returned Stripe url
s = s.replace(f'href="{CHECKOUT}"', 'href="/book/#buy" data-checkout')
POST_JS = '''<script>
/* book-checkout is POST only: create the session, then go to Stripe. */
(function(){
  var URL_ = "%s";
  document.addEventListener("click", function(ev){
    var a = ev.target.closest && ev.target.closest("[data-checkout]");
    if (!a) return;
    ev.preventDefault();
    if (a.getAttribute("aria-busy") === "true") return;
    a.setAttribute("aria-busy", "true");
    var label = a.textContent; a.textContent = "Opening secure checkout\\u2026";
    function fail(){
      a.removeAttribute("aria-busy"); a.textContent = label;
      var m = a.parentNode.querySelector(".checkout-msg");
      if (!m) { m = document.createElement("p"); m.className = "checkout-msg"; m.setAttribute("role","alert"); m.style.marginTop = ".75rem"; a.parentNode.appendChild(m); }
      m.innerHTML = 'Checkout could not open. Please try again, or email <a href="mailto:hello@neverfightorargue.com?subject=Signed%%20copy%%20order">hello@neverfightorargue.com</a> and we will help.';
    }
    fetch(URL_, { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ quantity: 1, gift: a.hasAttribute("data-gift") }) })
      .then(function(r){ return r.json().then(function(j){ return { ok: r.ok, j: j }; }); })
      .then(function(x){ if (x.ok && x.j && typeof x.j.url === "string" && /^https:\\/\\/checkout\\.stripe\\.com\\//.test(x.j.url)) location.href = x.j.url; else fail(); })
      .catch(fail);
  });
})();
</script>
''' % CHECKOUT
rep('</body>', POST_JS + '</body>')

# ---------- runtime titles ----------
T = {'launch':'Order a signed copy | Never Fight or Argue Again','registered':'Order a signed copy | Never Fight or Argue Again',
     'sponsor':'Order a signed copy | Never Fight or Argue Again','preorder-checkout':'Order a signed copy | Never Fight or Argue Again',
     'preorder-promo':'Order a signed copy | Never Fight or Argue Again','preorder-thanks':'Order a signed copy | Never Fight or Argue Again',
     'pass':'Pickup pass | Never Fight or Argue Again','guests':'Guest list | Never Fight or Argue Again'}
for p, d in PAGES.items():
    if d['view'] in ('home','book','churches','speaking','about','chapters','gift'): T[d['view']] = html.unescape(d['title'])
for k, v in T.items():
    s, n = re.subn(r"(\n    '?%s'?: )(['\"]).*?\2(,?\n)" % re.escape(k), lambda m: m.group(1) + json.dumps(v).replace('"',"'") .replace("\\'","\\u2019")+ m.group(3), s, count=1)

# ---------- JSON-LD ----------
LD = {"@context":"https://schema.org","@graph":[
 {"@type":"Organization","@id":SITE+"/#org","name":"Never Fight or Argue Again Couples Ministry","legalName":"Beacham Holdings LLC","url":SITE+"/",
  "logo":SITE+"/assets/icon-512.png","email":"hello@neverfightorargue.com","founder":[{"@id":SITE+"/#larry"},{"@id":SITE+"/#rolanda"}],
  "address":{"@type":"PostalAddress","addressLocality":"Odessa","addressRegion":"FL","addressCountry":"US"}},
 {"@type":"Person","@id":SITE+"/#larry","name":"Larry Beacham","url":SITE+"/about/","spouse":{"@id":SITE+"/#rolanda"},"worksFor":{"@id":SITE+"/#org"},"image":SITE+"/assets/larry-rolanda.jpg"},
 {"@type":"Person","@id":SITE+"/#rolanda","name":"Rolanda Beacham","alternateName":"Ro","url":SITE+"/about/","spouse":{"@id":SITE+"/#larry"},"worksFor":{"@id":SITE+"/#org"},"image":SITE+"/assets/larry-rolanda.jpg"},
 {"@type":"Book","@id":SITE+"/book/#book","name":"Never Fight or Argue Again",
  "alternateName":"Never Fight or Argue Again: Biblical Conflict Resolution for Couples Who Have Tried Everything",
  "author":[{"@id":SITE+"/#larry"},{"@id":SITE+"/#rolanda"}],"publisher":{"@id":SITE+"/#org"},"inLanguage":"en",
  "bookFormat":"https://schema.org/Paperback","image":SITE+"/assets/book-3d.png","url":SITE+"/book/",
  "description":"A Spirit-led plan for conflict resolution in marriage. Most advice teaches couples to fight fair; this book teaches them to stop.",
  "offers":{"@type":"Offer","price":"20.00","priceCurrency":"USD","url":SITE+"/book/","availability":"https://schema.org/InStock","description":"Signed copy, ordered direct"}}
 # TODO(Larry): isbn, datePublished, numberOfPages, publisher confirmation. Not invented.
]}
i = s.index('<script type="application/ld+json">'); j = s.index('</script>', i) + 9
s = s[:i] + '<script type="application/ld+json">\n' + json.dumps(LD, indent=1) + '\n</script>' + s[j:]

# ---------- no em or en dashes in rendered copy (outside script/style/comments) ----------
def undash(t):
    t = re.sub(r'(\d)\s*(?:&ndash;|\u2013)\s*(\d)', r'\1 to \2', t)
    t = re.sub(r'\s*(?:&mdash;|\u2014|&ndash;|\u2013)\s*', ', ', t)
    return t.replace(', ,', ',').replace(',,', ',')
parts = re.split(r'(<script\b.*?</script>|<style\b.*?</style>|<!--.*?-->|<title>.*?</title>)', s, flags=re.S)
s = ''.join(p if i % 2 else undash(p) for i, p in enumerate(parts))
s = s.replace("Thanks — we\\'ve got it.", "Thanks, we\\'ve got it.").replace(" — Never Fight or Argue Again'", " | Never Fight or Argue Again'").replace("'Gift a signed copy — secure payment'", "'Gift a signed copy | Secure payment'")
s = s.replace("(SRC ? ', $' : ' \\u2014 $')", "(SRC ? ', $' : ', $')")
open('src/template.built.html','w').write(s)

# ---------- write pages ----------
def head(path, d, robots):
    og = f'{SITE}/assets/og/{d["og"]}.jpg'
    r = f'\n<meta name="robots" content="{robots}">' if robots else ''
    return (f'<title>{d["title"]}</title>\n<meta name="description" content="{d["desc"]}">{r}\n<link rel="canonical" href="{SITE}{path}">\n\n'
      '<!-- Social share card -->\n<meta property="og:type" content="' + ('book' if d['view']=='book' else 'website') + '">\n'
      '<meta property="og:site_name" content="Never Fight or Argue Again">\n'
      f'<meta property="og:title" content="{d["title"]}">\n<meta property="og:description" content="{d["desc"]}">\n'
      f'<meta property="og:url" content="{SITE}{path}">\n<meta property="og:image" content="{og}">\n'
      '<meta property="og:image:width" content="1200">\n<meta property="og:image:height" content="630">\n'
      '<meta property="og:image:alt" content="Never Fight or Argue Again book cover with Larry and Rolanda Beacham">\n'
      '<meta name="twitter:card" content="summary_large_image">\n'
      f'<meta name="twitter:title" content="{d["title"]}">\n<meta name="twitter:description" content="{d["desc"]}">\n'
      f'<meta name="twitter:image" content="{og}">\n')
HEAD_RE = re.compile(r'<title>.*?(?=<meta name="theme-color")', re.S)
for path, d in PAGES.items():
    f = 'index.html' if path == '/' else path.strip('/') + '/index.html'
    old = subprocess.run(['git','show',f'main:{f}'], capture_output=True, text=True).stdout
    m = re.search(r'<meta name="robots" content="([^"]+)">', old)
    robots = m.group(1) if m else None
    if path in KEEP_HEAD:
        oh = HEAD_RE.search(old).group(0); out = HEAD_RE.sub(lambda _: oh, s, count=1)
    else:
        out = HEAD_RE.sub(lambda _: head(path, d, robots), s, count=1)
    open(f, 'w', encoding='utf-8').write(out)
    print(f'{f:32} robots={robots}')

# post-pass: no em dashes in runtime titles of pages this refresh touches
import glob as _g
for _f in [p for p in _g.glob('**/index.html',recursive=True)]:
    _p='/'+_f[:-len('index.html')] if _f!='index.html' else '/'
    if _p in json.load(open('pages.json')) and _p not in ('/express/','/guests/','/readers/','/invoice/','/pickup/','/sponsor-thank-you/','/sponsor-paid/'):
        _t=open(_f).read()
        for _k in ["'gift-thanks': 'Thank you for your gift","thanks: 'Thank you","'sponsor-thanks': 'Thank you"]:
            _t=_t.replace(_k+" \u2014 Never",_k+" | Never")
        open(_f,'w').write(_t)

# downloads (standalone page): title, description, OG
_d = R('downloads/index.html'); D = C['downloads']
_d = re.sub(r'<title>.*?</title>', f'<title>{D["meta_title"]}</title>', _d, 1)
_d = re.sub(r'<meta name="description" content="[^"]*">', f'<meta name="description" content="{D["meta_description"]}">', _d, 1)
if 'og:image' not in _d:
    og = SITE + '/assets/og/downloads.jpg'
    _d = _d.replace('<meta name="description"', f'<meta property="og:type" content="website">\n<meta property="og:title" content="{D["meta_title"]}">\n<meta property="og:description" content="{D["meta_description"]}">\n<meta property="og:url" content="{SITE}/downloads/">\n<meta property="og:image" content="{og}">\n<meta property="og:image:width" content="1200">\n<meta property="og:image:height" content="630">\n<meta name="twitter:card" content="summary_large_image">\n<meta name="twitter:image" content="{og}">\n<meta name="description"', 1)
open('downloads/index.html','w').write(_d)
