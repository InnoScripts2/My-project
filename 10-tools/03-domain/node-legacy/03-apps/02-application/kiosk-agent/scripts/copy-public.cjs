// Portable copy of src/public to dist/public without requiring fs.cpSync (Node >= v12)
const fs = require('fs')
const path = require('path')

const src = path.join(__dirname, '..', 'src', 'public')
const dst = path.join(__dirname, '..', 'dist', 'public')

function ensureDir(p){ if(!fs.existsSync(p)) fs.mkdirSync(p, { recursive: true }) }
function copyDir(s, d){
  ensureDir(d)
  for(const ent of fs.readdirSync(s, { withFileTypes: true })){
    const sp = path.join(s, ent.name)
    const dp = path.join(d, ent.name)
    if(ent.isDirectory()) copyDir(sp, dp)
    else fs.copyFileSync(sp, dp)
  }
}
if(fs.existsSync(src)) copyDir(src, dst)
console.log('Copied public to dist/public')
