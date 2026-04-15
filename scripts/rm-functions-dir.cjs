#!/usr/bin/env node
/**
 * Cloudflare Pages 在部分 wrangler 版本下仍会扫描/生成 functions/ 并触发 esbuild 对 .d.ts 的报错。
 * 在 npm run build 阶段删掉源码里的 functions（我们已改用根目录 _worker.js）。
 */
const fs = require('fs');
const path = require('path');
const root = process.cwd();
const target = path.join(root, 'functions');
try {
  fs.rmSync(target, { recursive: true, force: true });
  console.log('[cf-build] removed', target);
} catch (e) {
  console.log('[cf-build] skip remove functions:', e && e.message);
}
