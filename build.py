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
C = {k: json.load(open(f'copy/{k}.json')) for k in ['global','home','book','gift','free-chapter']}
G, H, B, GF, FC = C['global'], C['home'], C['book'], C['gift'], C['free-chapter']
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
BUY = B['buy_url'] or 'mailto:hello@neverfightorargue.com?subject=Signed%20copy%20order'
GIFT = B['gift_url'] or GF.get('cta_url') or 'mailto:hello@neverfightorargue.com?subject=Gift%20a%20signed%20copy'
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
    rep(f'<div class="view" id="view-{v}" hidden>\n', f'<div class="view" id="view-{v}" hidden>\n' + notice)
gift_block = (f'<section class="band band--paper archive"><div class="wrap" style="text-align:center;max-width:40rem;padding:4rem 0">'
  f'<h1 class="h-lg">{GF["title"]}</h1><p class="lede center">{GF["body"]}</p>'
  f'<p style="margin-top:1.75rem"><a class="btn" href="{GIFT}">{GF["cta"]}</a></p></div></section>\n')
rep('<div class="view" id="view-gift" hidden>\n', '<div class="view" id="view-gift" hidden>\n' + gift_block)
gt_block = (f'<section class="band band--paper archive"><div class="wrap" style="text-align:center;max-width:40rem;padding:4rem 0">'
  f'<h1 class="h-lg">{GF["thanks_title"]}</h1><p class="lede center">{GF["thanks_body"]}</p>'
  f'<p style="margin-top:1.75rem"><a class="btn" href="/book/" data-tab="book">Back to the book</a></p></div></section>\n')
rep('<div class="view" id="view-gift-thanks" hidden>\n', '<div class="view" id="view-gift-thanks" hidden>\n' + gt_block)
css = ''.join(f'#view-{v}>:not(.archive){{display:none!important}}' for v in ARCH+['gift','gift-thanks'])
css += '#stick,#qrBox{display:none!important}#buyStores:not(:has(a[href])){display:none}#buySoon.is-off{display:none}'
rep('</style>\n<script type="application/ld+json">', css + '\n</style>\n<script type="application/ld+json">')


# ---------- runtime titles ----------
T = {'launch':'Book Launch (past event) | Never Fight or Argue Again','registered':'Book Launch (past event) | Never Fight or Argue Again',
     'sponsor':'Launch sponsorship (closed) | Never Fight or Argue Again','preorder-checkout':'Pre-orders closed | Never Fight or Argue Again',
     'preorder-promo':'Pre-orders closed | Never Fight or Argue Again','preorder-thanks':'Pre-orders closed | Never Fight or Argue Again',
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
