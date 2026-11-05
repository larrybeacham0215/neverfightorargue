
import fs from 'fs';
import assert from 'assert';
import { fileURLToPath } from 'url';
import path from 'path';
const dir = path.dirname(fileURLToPath(import.meta.url));
const sections = JSON.parse(fs.readFileSync(path.join(dir, 'sections.json'), 'utf8'));

function buildChapters(sections){
  const out=[]; let cur=null; let weekNo=0;
  for (const s of sections){
    const cls=s.class||'';
    if (/\bweek\b/.test(cls) && !/\bch\b/.test(cls)){
      if (cur) out.push(cur);
      weekNo += 1;
      const label = weekNo<=12 ? ('Chapter '+weekNo) : 'Toolkit';
      cur = {label, title:s.title, sections:[{title:s.title}]};
      // week divider is one section; chunks ignored (always 1)
      continue;
    }
    if (!cur) cur = {label:'Getting Started', title:'Getting Started', sections:[]};
    const n = Math.max(1, s.chunks||1);
    for (let i=0;i<n;i++) cur.sections.push({title:s.title + (n>1?(' · part '+(i+1)):'')});
  }
  if (cur) out.push(cur);
  return out;
}
const chapters = buildChapters(sections);
assert.equal(sections.length, 66);
assert.ok(chapters.length >= 13);
assert.equal(chapters[0].label, 'Getting Started');
assert.equal(chapters[1].label, 'Chapter 1');
assert.match(chapters[1].title, /Naming/);
const total = chapters.reduce((n,c)=>n+c.sections.length,0);
assert.ok(total > 66, 'chunking should create more steps than raw pages');
assert.ok(total < 400);
// no scripture "Verse" nav labels in our builder labels
for (const c of chapters){
  assert.ok(!/^Verse\b/i.test(c.label));
}
console.log('PASS chapters', chapters.length, 'sections', total);
