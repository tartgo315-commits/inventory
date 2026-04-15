/**
 * 当 Firestore 文档 inventory/main 被写入时，推送到 Server酱微信。
 * 本目录为 Firebase Cloud Functions 代码，勿放在仓库的 functions/ 下——该目录留给 Cloudflare Pages Function（如 api/data.js）。
 *
 * 注意：本仓库 intentionally 不提交本目录的 package.json —— 否则 Cloudflare Pages 构建会对该目录 npm install，
 * 依赖树里的 .d.ts 会触发 Pages Functions 打包报错（如 event-target-shim / EventTarget）。
 * 需要部署到 Firebase 时，在本目录执行：
 *   npm init -y && npm i firebase-functions@^6 firebase-admin@^12
 *
 * 部署前：
 *   1. npm i -g firebase-tools && firebase login
 *   2. 在含 firebase.json 的项目中把 functions 源码目录指向本文件夹（例如 "functions": "firebase-serverchan"）
 *   3. firebase use tartgo-6b2f5
 *   4. firebase functions:secrets:set SERVERCHAN_SENDKEY
 *   5. Blaze 计费后：firebase deploy --only functions
 */

const { onDocumentWritten } = require("firebase-functions/v2/firestore");
const { defineSecret } = require("firebase-functions/params");
const logger = require("firebase-functions/logger");

const SERVERCHAN_SENDKEY = defineSecret("SERVERCHAN_SENDKEY");

function productName(pid, products) {
  const p = (products || []).find((x) => x.id === pid);
  return p ? String(p.name).slice(0, 80) : `#${pid}`;
}

function buildDesp(after, before) {
  const prods = after.products || [];
  const purch = after.purchases || [];
  const beforePurch = before && before.purchases ? before.purchases.length : 0;
  const afterPurch = purch.length;
  const beforeProd = before && before.products ? before.products.length : 0;
  const afterProd = prods.length;

  const lines = [];
  lines.push("【TARTGO】云端库存/进货数据已更新");
  lines.push(`时间: ${new Date().toLocaleString("zh-CN", { timeZone: "Asia/Shanghai" })}`);
  lines.push("");
  lines.push(`商品种类: ${afterProd}`);
  lines.push(`进货记录: ${afterPurch} 条`);
  const transit = purch.filter((r) => r.status === "transit").length;
  const received = purch.filter((r) => r.status === "received").length;
  lines.push(`在途: ${transit} · 已入库: ${received}`);

  if (before && afterPurch > beforePurch) {
    lines.push(`相对上一版: 进货记录 +${afterPurch - beforePurch} 条`);
  }
  if (before && afterProd > beforeProd) {
    lines.push(`相对上一版: 商品种类 +${afterProd - beforeProd}`);
  }

  const recent = [...purch]
    .sort((a, b) => String(b.date || "").localeCompare(String(a.date || "")))
    .slice(0, 5);
  if (recent.length) {
    lines.push("");
    lines.push("最近进货（最多5条）:");
    recent.forEach((r) => {
      const q = r.receivedQty != null ? r.receivedQty : r.qty;
      const st = r.status === "received" ? "已入库" : r.status === "transit" ? "在途" : String(r.status || "");
      const ord = r.order ? ` 单:${String(r.order).slice(0, 40)}` : "";
      lines.push(`· ${r.date || "?"} ${productName(r.pid, prods)} ×${q || 0} ${st}${ord}`);
    });
  }

  return lines.join("\n").slice(0, 32000);
}

async function sendServerChan(sendKey, title, desp) {
  const url = `https://sctapi.ftqq.com/${sendKey}.send`;
  const res = await fetch(url, {
    method: "POST",
    headers: { "Content-Type": "application/json; charset=utf-8" },
    body: JSON.stringify({ title, desp }),
  });
  const text = await res.text();
  if (!res.ok) {
    throw new Error(`Server酱 HTTP ${res.status}: ${text.slice(0, 500)}`);
  }
  try {
    const j = JSON.parse(text);
    const code = j.code;
    const errno = j.errno != null ? j.errno : j.data && j.data.errno;
    const ok =
      (code === 0 || code == null) && (errno === 0 || errno == null);
    if (!ok && (code != null || errno != null)) {
      throw new Error(`Server酱: ${text.slice(0, 500)}`);
    }
  } catch (e) {
    if (e.message && e.message.startsWith("Server酱:")) throw e;
    /* 非 JSON 时只要 HTTP 成功仍视为已投递 */
  }
  return text;
}

exports.notifyInventoryWrite = onDocumentWritten(
  {
    document: "inventory/main",
    region: "asia-east1",
    secrets: [SERVERCHAN_SENDKEY],
    timeoutSeconds: 60,
  },
  async (event) => {
    const key = SERVERCHAN_SENDKEY.value();
    if (!key || !String(key).trim()) {
      logger.warn("SERVERCHAN_SENDKEY 未配置，跳过通知");
      return;
    }

    if (!event.data.after.exists) {
      logger.info("文档已删除，跳过通知");
      return;
    }

    const after = event.data.after.data();
    const before = event.data.before.exists ? event.data.before.data() : null;

    try {
      const desp = buildDesp(after, before);
      await sendServerChan(key, "【TARTGO】库存/进货已更新", desp);
      logger.info("Server酱已发送 inventory/main");
    } catch (e) {
      logger.error("Server酱发送失败", e);
      throw e;
    }
  }
);
