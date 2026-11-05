
import fs from 'fs';
import assert from 'assert';
import { fileURLToPath } from 'url';
import path from 'path';
const dir = path.dirname(fileURLToPath(import.meta.url));
const root = path.resolve(dir, '../..');
const guide = fs.readFileSync(path.join(root, 'guide/course-preview/index.html'), 'utf8');
const lib = fs.readFileSync(path.join(root, 'members/library-preview/index.html'), 'utf8');
const res = fs.readFileSync(path.join(root, 'members/library-preview/resource/index.html'), 'utf8');

function assertIncludes(hay, needles, label){
  for (const n of needles) assert.ok(hay.includes(n), label+': missing '+n);
}

assertIncludes(guide, [
  'id="side"', 'id="crumbs"', 'id="prev"', 'id="next"', 'id="menuBtn"',
  'sessionStorage', 'Preview only', 'noindex',
  'prefers-reduced-motion', 'aria-expanded', 'Chapter', 'Section'
], 'guide');
assert.ok(!/method:\s*['"]POST['"]/.test(guide), 'guide must not POST');
assert.ok(!/welcome_video/.test(guide), 'guide preview must not touch welcome video');
assertIncludes(guide, ['display:flex', 'min-height:0', 'drawer-backdrop'], 'guide layout');
assert.ok(guide.includes("tag==='textarea'"), 'keyboard guard for textarea');

assertIncludes(lib, [
  'grid-template-columns:repeat(5', 'max-height:210px', 'Preview only', 'noindex',
  'anti-fight-plan', 'luv-framework', 'stop-loss-strategy', 'validation-exercise'
], 'library');
assert.ok(!lib.includes('printable-companion-set'), 'must not re-add printable set');
assert.ok(!lib.includes('anti-fight-plan-and-safety-plan'), 'must not re-add safety combo');

assertIncludes(res, ['Back to My Library', 'Open PDF', 'Download', 'view=FitH', 'Preview isn’t available here'], 'resource');
assert.equal((res.match(/Back to My Library/g)||[]).length, 1, 'exactly one Back to My Library');
assert.ok(!res.includes('← Library'), 'no redundant ← Library');
assert.ok(!/Native PDF|Source PDFs|page\+fit|URL params/i.test(res), 'no developer footer copy');
assert.ok(res.includes('fallback'), 'embed fallback present');

const spec = {
  targets: [
    {name:'desktop-1366x768', w:1366, h:768},
    {name:'desktop-1440x900', w:1440, h:900},
    {name:'mobile-390x844', w:390, h:844}
  ],
  library_preview: {
    route: '/members/library-preview/',
    expect: [
      'All five content tiles visible without page scroll when signed-in grid is shown',
      'Preview banner compact',
      'Header + title + grid fit above fold on 1366x768',
      'Tiles are keyboard focusable links'
    ]
  },
  guide_preview: {
    route: '/guide/course-preview/',
    expect: [
      'Chrome always visible: banner, top bar, crumbbar, footer Prev/Next',
      'Only stage-wrap scrolls when content exceeds remaining height',
      'Desktop side nav: Chapter disclosure + nested Section buttons',
      'Mobile drawer via menu button; backdrop closes',
      'One semantic section at a time; arrows skip when typing in fields',
      'No production answer POST'
    ]
  },
  resource_preview: {
    route: '/members/library-preview/resource/?id=anti-fight-plan',
    expect: [
      'Back to library always visible',
      'Open/Download + page/fit controls present',
      'Honest note about native PDF back-link limitation'
    ]
  },
  note: 'Static tests cannot measure pixels. Parent should QA visually on listed viewports.'
};
fs.writeFileSync(path.join(dir, 'viewport-qa-spec.json'), JSON.stringify(spec, null, 2));
console.log('PASS layout-spec');
