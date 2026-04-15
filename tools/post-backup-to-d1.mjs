/**
 * 一次性：把本地 JSON 备份 POST 到 Cloudflare Pages /api/data
 * 用法：node tools/post-backup-to-d1.mjs <备份.json路径> [站点根URL，默认 inventory-016.pages.dev]
 */
import fs from 'fs';
import https from 'https';

const file = process.argv[2];
const base = (process.argv[3] || 'https://inventory-016.pages.dev').replace(/\/$/, '');
if (!file || !fs.existsSync(file)) {
  console.error('用法: node tools/post-backup-to-d1.mjs <backup.json> [https://你的域名]');
  process.exit(1);
}

const body = fs.readFileSync(file, 'utf8');
JSON.parse(body); // 先校验

const url = new URL(base + '/api/data');
const opts = {
  method: 'POST',
  hostname: url.hostname,
  path: url.pathname,
  headers: {
    'Content-Type': 'application/json; charset=utf-8',
    'Content-Length': Buffer.byteLength(body, 'utf8'),
  },
};

const req = https.request(opts, (res) => {
  let chunks = '';
  res.on('data', (d) => (chunks += d));
  res.on('end', () => {
    console.log('HTTP', res.statusCode);
    console.log(chunks.slice(0, 500));
    process.exit(res.statusCode >= 200 && res.statusCode < 300 ? 0 : 1);
  });
});
req.on('error', (e) => {
  console.error(e.message);
  process.exit(1);
});
req.write(body);
req.end();
