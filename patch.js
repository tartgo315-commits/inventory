/**
 * TARTGO 迁移脚本：Firebase → Cloudflare
 * 在你的 inventory 项目文件夹里运行：  node patch.js
 */
const fs = require('fs');
const path = require('path');

const htmlPath = path.join(__dirname, 'index.html');
if (!fs.existsSync(htmlPath)) {
  console.error('❌ 找不到 index.html，请确认在正确的文件夹里运行');
  process.exit(1);
}

console.log('📖 读取 index.html...');
let html = fs.readFileSync(htmlPath, 'utf8');
const original = html;

// 1. 删除 Firebase imports
html = html.replace(
  /import\s+\{[^}]+\}\s+from\s+'https:\/\/www\.gstatic\.com\/firebasejs\/[^']+\.js'\s*;?\n?/g,
  ''
);
console.log('✅ 删除 Firebase import 语句');

// 2. 删除 firebaseConfig 对象
html = html.replace(
  /(?:const|let|var)\s+\w+\s*=\s*\{\s*\n?\s*apiKey:[^}]+\}\s*;?\n?/gs,
  ''
);
console.log('✅ 删除 Firebase 配置对象');

// 3. 删除初始化代码
html = html.replace(/(?:const|let|var)\s+\w+\s*=\s*initializeApp\([^)]+\)\s*;?\n?/g, '');
html = html.replace(/(?:const|let|var)\s+\w+\s*=\s*getFirestore\([^)]+\)\s*;?\n?/g, '');
html = html.replace(/(?:const|let|var)\s+docRef\s*=\s*doc\([^)]+\)\s*;?\n?/g, '');
console.log('✅ 删除 Firebase 初始化代码');

// 4. 替换 setDoc → fetch POST
const setDocIdx = html.indexOf('await setDoc(');
if (setDocIdx > -1) {
  const lineEnd = html.indexOf(';', setDocIdx) + 1;
  const setDocLine = html.substring(setDocIdx, lineEnd);
  html = html.replace(
    setDocLine,
    `await fetch('/api/data',{method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify(D)});`
  );
  console.log('✅ 替换 setDoc → fetch POST');
} else {
  console.log('⚠️  未找到 setDoc，跳过');
}

// 5. 替换 onSnapshot → 轮询 loadFromCloud
const snIdx = html.indexOf('onSnapshot(');
if (snIdx > -1) {
  let depth = 0, end = snIdx;
  for (let i = snIdx; i < Math.min(html.length, snIdx + 5000); i++) {
    if (html[i] === '(') depth++;
    if (html[i] === ')') { depth--; if (depth === 0) { end = i + 1; break; } }
  }
  const snapCall = html.substring(snIdx, end);
  const cloudLoader = `
// === Cloudflare D1 云同步（替换 Firebase onSnapshot）===
async function loadFromCloud() {
  try {
    const r = await fetch('/api/data');
    if (!r.ok) return;
    const remote = await r.json();
    if (remote && remote.products && remote.products.length > 0) {
      Object.assign(D, remote);
      try { renderAll(); } catch(e) {}
    }
  } catch(e) { console.log('离线模式'); }
}
loadFromCloud();
setInterval(loadFromCloud, 30000);`;
  html = html.replace(snapCall, cloudLoader);
  console.log('✅ 替换 onSnapshot → loadFromCloud 轮询');
} else {
  console.log('⚠️  未找到 onSnapshot，跳过');
}

// 保存
fs.writeFileSync(htmlPath, html, 'utf8');
console.log('\n🎉 完成！index.html 已更新');
console.log('   原始大小：', (original.length / 1024).toFixed(0), 'KB');
console.log('   新文件大小：', (html.length / 1024).toFixed(0), 'KB');
console.log('\n下一步：');
console.log('  1. git add .');
console.log('  2. git commit -m "migrate to Cloudflare"');
console.log('  3. git push origin main');
