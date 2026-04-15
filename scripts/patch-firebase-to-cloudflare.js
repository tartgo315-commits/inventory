/**
 * 可选：从仍含 Firebase 的 index.html 做一次性迁移（与手动迁移结果等价思路）。
 * 在仓库根目录运行：node scripts/patch-firebase-to-cloudflare.js
 *
 * 若已迁移（无 firebase import / 无 setDoc），会提示并退出，不写文件。
 */
const fs = require('fs');
const path = require('path');

const root = path.join(__dirname, '..');
const htmlPath = path.join(root, 'index.html');

if (!fs.existsSync(htmlPath)) {
  console.error('找不到 index.html（应在仓库根目录的上一级通过 scripts/ 定位）');
  process.exit(1);
}

let html = fs.readFileSync(htmlPath, 'utf8');

if (!html.includes('gstatic.com/firebasejs') && !html.includes('await setDoc(')) {
  console.log('当前 index.html 看起来已不含 Firebase 迁移目标，无需运行本脚本。');
  process.exit(0);
}

const original = html;

html = html.replace(
  /import\s+\{[^}]+\}\s+from\s+'https:\/\/www\.gstatic\.com\/firebasejs\/[^']+\.js'\s*;?\n?/g,
  ''
);
console.log('已删除 Firebase import 行');

html = html.replace(/(?:const|let|var)\s+\w+\s*=\s*initializeApp\([^)]+\)\s*;?\n?/g, '');
html = html.replace(/(?:const|let|var)\s+\w+\s*=\s*getFirestore\([^)]+\)\s*;?\n?/g, '');
html = html.replace(/(?:const|let|var)\s+docRef\s*=\s*doc\([^)]+\)\s*;?\n?/g, '');
console.log('已删除 initializeApp / getFirestore / docRef 行');

const setDocIdx = html.indexOf('await setDoc(');
if (setDocIdx > -1) {
  const lineEnd = html.indexOf(';', setDocIdx) + 1;
  const setDocLine = html.substring(setDocIdx, lineEnd);
  html = html.replace(
    setDocLine,
    `await fetch('/api/data',{method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify(JSON.parse(JSON.stringify(D)))});`
  );
  console.log('已替换 setDoc → fetch POST');
} else {
  console.log('未找到 await setDoc(，跳过');
}

const snIdx = html.indexOf('onSnapshot(');
if (snIdx > -1) {
  let depth = 0;
  let end = snIdx;
  for (let i = snIdx; i < Math.min(html.length, snIdx + 8000); i++) {
    if (html[i] === '(') depth++;
    if (html[i] === ')') {
      depth--;
      if (depth === 0) {
        end = i + 1;
        break;
      }
    }
  }
  const snapCall = html.substring(snIdx, end);
  const cloudLoader = `
async function loadFromCloud() {
  try {
    const r = await fetch('/api/data');
    if (!r.ok) return;
    const remote = await r.json();
    if (remote && remote.products) {
      D = { ...defaultData(), ...remote };
      if (!D.outbounds) D.outbounds = [];
      if (!D.purchases) D.purchases = [];
      if (!D.sales) D.sales = [];
      if (!D.products) D.products = [];
      if (!D.trash) D.trash = [];
      if (D.settings && D.settings.confirmQuantityChange === undefined) D.settings.confirmQuantityChange = true;
      render();
    }
  } catch (e) { console.log('Offline mode'); }
}
loadFromCloud();
setInterval(loadFromCloud, 30000);`;
  html = html.replace(snapCall, cloudLoader);
  console.log('已替换 onSnapshot → loadFromCloud 轮询（使用 render()、与 defaultData 合并）');
} else {
  console.log('未找到 onSnapshot(，跳过');
}

fs.writeFileSync(htmlPath, html, 'utf8');
console.log('\n完成。原约', (original.length / 1024).toFixed(0), 'KB → 现约', (html.length / 1024).toFixed(0), 'KB');
console.log('请自行检查：initFirebase / FIREBASE_CFG 等若仍存在需手工删除，并部署 functions/api/data.js + D1。');
