import fs from 'fs';
import assert from 'assert';
import { fileURLToPath } from 'url';
import path from 'path';
const dir = path.dirname(fileURLToPath(import.meta.url));
const sections = JSON.parse(fs.readFileSync(path.join(dir, 'sections.json'), 'utf8'));
function buildModules(sections){
  const out=[]; let cur=null;
  for (const s of sections){
    const cls=s.class||'';
    if (/\bweek\b/.test(cls) && !/\bch\b/.test(cls)){
      if (cur) out.push(cur);
      cur={title:s.title, pages:[s.title]};
      continue;
    }
    if (!cur) cur={title:'Start Here', pages:[]};
    cur.pages.push(s.title);
  }
  if (cur) out.push(cur);
  return out;
}
const modules=buildModules(sections);
assert.equal(sections.length, 66);
assert.ok(modules.length >= 13);
assert.equal(modules[0].title, 'Start Here');
assert.equal(modules.reduce((n,m)=>n+m.pages.length,0), 66);
console.log('PASS', modules.length, 'modules');
