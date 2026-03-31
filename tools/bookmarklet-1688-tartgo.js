/**
 * 1688 订单详情页 → TARTGO 进货页（可读源码）
 *
 * 单行书签：见同目录 bookmarklet-1688-tartgo-oneline.txt（运行 node tools/pack-bookmarklet.cjs 生成）。
 * 将脚本里 TARTGO 改成你的 GitHub Pages 地址。
 */

(function () {
  var TARTGO = 'https://tartgo315-commits.github.io/inventory/';

  function getText(root) {
    var parts = [];
    if (!root) return '';
    try {
      if (root.shadowRoot) parts.push(getText(root.shadowRoot));
      var nodes = root.childNodes;
      for (var i = 0; i < nodes.length; i++) {
        var c = nodes[i];
        if (c.nodeType === 3) {
          var t = c.textContent.trim();
          if (t) parts.push(t);
        } else if (c.nodeType === 1) {
          if (c.tagName === 'IFRAME') {
            try { parts.push(getText(c.contentDocument.body)); } catch (e) {}
          } else {
            parts.push(getText(c));
          }
        }
      }
    } catch (e) {}
    return parts.filter(Boolean).join('\n');
  }

  /** 同源 iframe 内才是订单正文（外壳页只有导航/CSS 碎片） */
  function mergeAccessibleIframeText(root, arr) {
    if (!root || !root.querySelectorAll) return;
    var frames = root.querySelectorAll('iframe');
    for (var fi = 0; fi < frames.length; fi++) {
      try {
        var doc = frames[fi].contentDocument;
        if (doc && doc.body) {
          var t = (doc.body.innerText || '').replace(/\r\n/g, '\n').replace(/\r/g, '\n');
          if (t.replace(/\s/g, '').length > 60) arr.push(t);
          mergeAccessibleIframeText(doc, arr);
        }
      } catch (e) {}
    }
  }

  /** air.1688 等：可见文字多在 innerText；子树在开放 Shadow 里需单独扫 */
  function appendOpenShadowText(root, arr) {
    if (!root || !root.querySelectorAll) return;
    var all = root.querySelectorAll('*');
    for (var si = 0; si < all.length; si++) {
      try {
        var el = all[si];
        if (el.shadowRoot) arr.push(getText(el.shadowRoot));
      } catch (e) {}
    }
  }

  function buildRawText() {
    var segs = [];
    try {
      var ifrTxt = [];
      mergeAccessibleIframeText(document.documentElement, ifrTxt);
      if (ifrTxt.length) segs.push(ifrTxt.join('\n'));
    } catch (e0) {}
    try {
      if (document.body) {
        var it = (document.body.innerText || '').replace(/\r\n/g, '\n').replace(/\r/g, '\n');
        if (it.trim().length) segs.push(it);
      }
    } catch (e) {}
    try {
      appendOpenShadowText(document.body, segs);
    } catch (e2) {}
    segs.push(getText(document.body));
    return segs.join('\n');
  }

  function toCleanLines(text) {
    return text.split('\n').map(function (l) { return l.trim(); }).filter(function (l) {
      if (!l) return false;
      if (/^with\s*\(\s*document\s*\)/.test(l)) return false;
      if (/aplus_id|exparams|userid=\d+.*aplus|setAttribute\s*\(\s*["']exparams["']/i.test(l)) return false;
      if (l.length > 600 && /createElement\s*\(\s*["']script["']\)/.test(l)) return false;
      return true;
    });
  }

  function normMoney(p) {
    var x = parseFloat(p);
    if (!(x > 0)) return 0;
    if (x > 500 && x === Math.floor(x)) {
      var y = x / 100;
      if (y >= 0.01 && y <= 99999) return y;
    }
    return x;
  }

  function dedupeGoodsArr(arr) {
    var seen = {},
      res = [];
    for (var di = 0; di < arr.length; di++) {
      var g = arr[di];
      var k = (g.name || '').slice(0, 14) + '_' + g.price + '_' + (g.qty || 1);
      if (seen[k]) continue;
      seen[k] = 1;
      res.push(g);
    }
    return res;
  }

  /** 猜测订单明细 iframe，跳转后同页可读到 DOM（跨域 iframe 内书签读不到） */
  function findOrderIframeJumpUrl() {
    var list = document.querySelectorAll('iframe[src]');
    var cur = location.href.replace(/#.*$/, '');
    for (var fi = 0; fi < list.length; fi++) {
      var s = list[fi].getAttribute('src') || '';
      if (!s || /^about:/i.test(s)) continue;
      var u = '';
      try {
        u = new URL(s, location.href).href;
      } catch (e) {
        continue;
      }
      if (!/1688\.com/i.test(u)) continue;
      if (/redirect|trace|spm=/i.test(u) && !/order|trade|detail|offer|purchase|ctf-page/i.test(u)) continue;
      if (!/trade|order|detail|purchase|ctf-page|orderId|offer\/|offer\.html|page\/offer/i.test(u)) continue;
      if (u.split('#')[0] === cur.split('#')[0]) continue;
      return u;
    }
    return '';
  }

  /** 从页面 HTML 内嵌 JSON 抠品名/单价/数量（邻近配对 + 全局兜底） */
  function parseGoodsFromHtmlBlob(html) {
    var out = [];
    if (!html || html.length < 200) return out;
    var h = html.slice(0, 2500000);
    function unesc(s) {
      return s.replace(/\\u([0-9a-fA-F]{4})/g, function (_, x) {
        return String.fromCharCode(parseInt(x, 16));
      });
    }
    function cleanTitle(t) {
      t = unesc(String(t || '').replace(/\\"/g, '"').replace(/\\n/g, ' ')).trim();
      if (t.length < 4 || t.length > 220) return '';
      if (!/[\u4e00-\u9fff]/.test(t)) return '';
      if (/aplus|userid|cookie|exparams|function\s*\(|padding:\s*0|1688首页/i.test(t)) return '';
      return t;
    }
    var m;
    var rePair =
      /"(?:subject|title|skuName|offerTitle|offerSubject|productName|cargoName|cargoTitle|itemName|offerName)"\s*:\s*"((?:[^"\\]|\\.)*)"\s*[\s\S]{0,1800}?"(?:price|unitPrice|salePrice|retailPrice|finalPrice|itemPrice|cargoMoney|consignPrice|entryUnitPrice)"\s*:\s*"?(\d+\.?\d*)"?/gi;
    while ((m = rePair.exec(h)) !== null) {
      var tit = cleanTitle(m[1]);
      var pr = normMoney(m[2]);
      if (!tit || !pr || pr > 999999) continue;
      var chunk = h.slice(m.index, Math.min(h.length, m.index + 2200));
      var qm = chunk.match(/"(?:quantity|num|amount|buyAmount|itemCount|skuAmount)"\s*:\s*(\d+)/);
      var qty = qm ? parseInt(qm[1], 10) : 1;
      if (qty < 1 || qty > 99999) qty = 1;
      out.push({ name: tit, spec: '', price: pr, qty: qty });
    }
    out = dedupeGoodsArr(out);
    if (out.length) return out;

    var titles = [];
    var reT = /"(?:subject|title|skuName|offerTitle|offerSubject|productName|cargoName)"\s*:\s*"((?:[^"\\]|\\.)*)"/g;
    while ((m = reT.exec(h)) !== null) {
      var ct = cleanTitle(m[1]);
      if (ct) titles.push(ct);
    }
    var prices = [];
    var reP = /"(?:price|unitPrice|salePrice|retailPrice|finalPrice|itemPrice)"\s*:\s*"?(\d+\.?\d*)"?/g;
    while ((m = reP.exec(h)) !== null) {
      var p = normMoney(m[1]);
      if (p > 0 && p < 1e7) prices.push(p);
    }
    var qtys = [];
    var reQ = /"(?:quantity|num|amount|buyAmount|itemCount)"\s*:\s*(\d+)/g;
    while ((m = reQ.exec(h)) !== null) {
      var q = parseInt(m[1], 10);
      if (q >= 1 && q <= 99999) qtys.push(q);
    }
    if (!titles.length || !prices.length) return [];
    var title = titles[0];
    var price = 0;
    for (var pi = 0; pi < prices.length; pi++) {
      var pv = prices[pi];
      if (pv >= 0.01 && pv <= 99999) {
        price = pv;
        break;
      }
    }
    if (!price && prices.length) price = prices[0];
    var qty = qtys.length ? qtys[0] : 1;
    if (title && price > 0 && price < 1e6) return [{ name: title, spec: '', price: price, qty: qty }];
    return [];
  }

  function runBookmarklet() {
    var text = buildRawText();
    var lines = toCleanLines(text);
    var oM = text.match(/订单号[：:\s]*(\d{10,25})/);
    var orderId = oM ? oM[1] : '';
    var sM = text.match(/运费[\s\S]{0,10}[¥￥]\s*(\d+\.?\d*)/) || text.match(/[¥￥]\s*(\d+\.?\d*)\s*[\s\S]{0,5}运费/);
    var ship = sM ? parseFloat(sM[1]) : 0;
    var pM = text.match(/实付款?[\s\S]{0,10}[¥￥]\s*(\d+\.?\d*)/);
    var paid = pM ? parseFloat(pM[1]) : 0;
    var sourceLink = location.href;
    var goods = [];
    var skipIdx = new Set();
    var SKIP = /^(规格|颜色|型号|款式|货号|数量|单价|优惠|货品|极速|售后|交期|延期|品质|破损|退货|确认|已发|待发|申请|假一|查看|快递|发货|备注|收货|卖家|买家|支付|配送|手机|电话|地址|订单|交易|物流|等待|当前|如果|原价|实付|合计|运费|48|上门)/;
    /* 含中文的品名常短于 8 字（如「自行车手把包」），单独放宽 */
    function ok(s) {
      var minLen = /[\u4e00-\u9fff]/.test(s) ? 4 : 8;
      return s.length >= minLen && s.length <= 120 && !SKIP.test(s) && !/^\d+$/.test(s) && !/^\d+\.\d+$/.test(s) && !/^[¥￥\d\s\/.元,，套件对]+$/.test(s);
    }

    for (var i = 0; i < lines.length; i++) {
      if (skipIdx.has(i)) continue;
      var l = lines[i];
      var discM = l.match(/优惠后(\d+\.?\d*)元?[\/／]?[件个只条对套组双副片张包盒袋根支块]?/);
      if (discM) {
        var price = parseFloat(discM[1]);
        for (var s2 = i + 1; s2 < Math.min(lines.length, i + 4); s2++) {
          if (lines[s2].match(/^\d+\.?\d*\s*元[\/／][件个只条对套组双副片张包盒袋根支块]/) || lines[s2].match(/^\d+\.?\d*[\/／][件个只条对套组双副片张包盒袋根支块]/)) {
            skipIdx.add(s2);
            break;
          }
        }
        var name = '', spec = '', qty = 1;
        for (var j = i - 1; j >= Math.max(0, i - 40); j--) {
          var lj = lines[j];
          if (/^(极速退款|售后延长|交期保障|延期必赔|品质保障|破损包赔|退货包运费|确认收货|已发货|待发货)/.test(lj)) continue;
          if (/^货号[：:]/.test(lj)) continue;
          if (/^规格[：:]/.test(lj)) {
            spec = lj.replace(/^规格[：:]\s*/, '').trim();
            continue;
          }
          if (ok(lj) && !name) { name = lj; break; }
        }
        for (var k = i + 1; k < Math.min(lines.length, i + 10); k++) {
          if (skipIdx.has(k)) continue;
          if (/^\d+$/.test(lines[k])) {
            var v = parseInt(lines[k], 10);
            if (v >= 1 && v <= 9999) { qty = v; break; }
          }
        }
        if (name && price > 0) goods.push({ name: name, spec: spec, price: price, qty: qty });
        continue;
      }
      var pm = l.match(/^(\d+\.?\d*)\s*元\s*[\/／]\s*[件个只条对套组双副片张包盒袋根支块]/) ||
        l.match(/^(\d+\.?\d*)\s*[\/／]\s*[件个只条对套组双副片张包盒袋根支块]/) ||
        l.match(/^[¥￥]\s*(\d+\.?\d*)\s*[\/／]\s*[件个只条对套组双副片张包盒袋根支块]/);
      if (!pm) continue;
      var price2 = parseFloat(pm[1]);
      if (price2 <= 0 || price2 > 99999) continue;
      var name2 = '', spec2 = '', qty2 = 1;
      for (var j2 = i - 1; j2 >= Math.max(0, i - 40); j2--) {
        var lj2 = lines[j2];
        if (/^(极速退款|售后延长|交期保障|延期必赔|品质保障|破损包赔|退货包运费|确认收货|已发货|待发货)/.test(lj2)) continue;
        if (/^货号[：:]/.test(lj2)) continue;
        if (/^规格[：:]/.test(lj2)) {
          spec2 = lj2.replace(/^规格[：:]\s*/, '').trim();
          continue;
        }
        if (ok(lj2) && !name2) { name2 = lj2; break; }
      }
      for (var k2 = i + 1; k2 < Math.min(lines.length, i + 10); k2++) {
        if (/^\d+$/.test(lines[k2])) {
          var v2 = parseInt(lines[k2], 10);
          if (v2 >= 1 && v2 <= 9999) { qty2 = v2; break; }
        }
      }
      if (name2 && price2 > 0) goods.push({ name: name2, spec: spec2, price: price2, qty: qty2 });
    }

    /* air.1688.com 等新版：单价、价格、数量常分行，无「元/件」连在一起 */
    if (!goods.length) {
      for (var ai = 0; ai < lines.length; ai++) {
        if (skipIdx.has(ai)) continue;
        var al = lines[ai];
        var priceA = 0;
        var anchor = ai;
        var um = al.match(/单价[：:\s]*[¥￥]?\s*(\d+\.?\d*)/) || al.match(/价格[：:\s]*[¥￥]?\s*(\d+\.?\d*)/);
        if (um) {
          priceA = parseFloat(um[1]);
        } else if ((/^单价[：:\s]*$|^单价$/.test(al) || /^价格[：:\s]*$|^价格$/.test(al)) && ai + 1 < lines.length) {
          var nx = lines[ai + 1].match(/^[¥￥]?\s*(\d+\.?\d*)\s*$/);
          if (nx) {
            priceA = parseFloat(nx[1]);
            anchor = ai;
          }
        }
        if (!priceA || priceA <= 0 || priceA > 99999) continue;
        var qtyA = 1;
        for (var aq = anchor + 1; aq < Math.min(lines.length, anchor + 12); aq++) {
          var ql = lines[aq];
          var qm1 = ql.match(/数量[：:\s]*(\d+)/);
          if (qm1) {
            qtyA = parseInt(qm1[1], 10);
            break;
          }
          if (/^数量[：:\s]*$|^数量$/.test(ql) && aq + 1 < lines.length && /^\d+$/.test(lines[aq + 1])) {
            qtyA = parseInt(lines[aq + 1], 10);
            break;
          }
        }
        var nameA = '';
        var specA = '';
        for (var aj = anchor - 1; aj >= Math.max(0, anchor - 55); aj--) {
          if (skipIdx.has(aj)) continue;
          var lja = lines[aj];
          if (/^(极速退款|售后延长|交期保障|延期必赔|品质保障|破损包赔|退货包运费|确认收货|已发货|待发货)/.test(lja)) continue;
          if (/^货号[：:]/.test(lja)) continue;
          if (/^规格[：:]/.test(lja)) {
            specA = lja.replace(/^规格[：:]\s*/, '').trim();
            continue;
          }
          if (ok(lja) && !nameA) {
            nameA = lja;
            break;
          }
        }
        if (nameA && priceA > 0) goods.push({ name: nameA, spec: specA, price: priceA, qty: qtyA });
      }
    }

    if (!goods.length) {
      try {
        goods = parseGoodsFromHtmlBlob(document.documentElement.innerHTML);
      } catch (e3) {}
    }

    /* 一行内：品名 ¥15.00 × 5 或 品名 15.00元 ×5 */
    if (!goods.length) {
      for (var ri = 0; ri < lines.length; ri++) {
        var rl = lines[ri].replace(/\s+/g, ' ').trim();
        var rm =
          rl.match(/^(.{4,72}?)\s+[¥￥]\s*(\d+\.?\d*)\s*[×xX＊*]\s*(\d+)\s*$/) ||
          rl.match(/^(.{4,72}?)\s+(\d+\.?\d*)\s*元\s*[×xX＊*]\s*(\d+)\s*$/);
        if (rm) {
          var tname = rm[1].trim();
          var pRow = parseFloat(rm[2]);
          var qRow = parseInt(rm[3], 10);
          var minLR = /[\u4e00-\u9fff]/.test(tname) ? 4 : 6;
          if (tname.length >= minLR && pRow > 0 && pRow < 99999 && qRow >= 1 && qRow <= 99999 && !SKIP.test(tname)) {
            goods.push({ name: tname, spec: '', price: pRow, qty: qRow });
          }
        }
      }
    }

    /* 有订单内嵌 iframe：跳到内页再点书签，才能读到 DOM */
    if (!goods.length) {
      var jump = findOrderIframeJumpUrl();
      if (jump) {
        if (
          confirm(
            '当前页未识别到商品。\n1688 常把明细放在内嵌框架里，书签读不到。\n\n点「确定」打开订单内页，然后请再点一次本书签。\n点「取消」可改用：本页 Ctrl+A 复制 → TARTGO 进货页粘贴。'
          )
        ) {
          location.href = jump;
        }
      }
    }

    if (!goods.length) {
      var ic = 0,
        ib = 0;
      try {
        var ifrList = document.querySelectorAll('iframe');
        for (var ii = 0; ii < ifrList.length; ii++) {
          try {
            ifrList[ii].contentDocument;
            ib++;
          } catch (e) {
            ic++;
          }
        }
      } catch (e) {}
      var sample = lines.filter(function (ln) { return /\d/.test(ln); }).slice(0, 12).join('\n');
      var hint =
        ic > 0
          ? '\n\n【说明】若存在跨域 iframe，可复制整页到 TARTGO 粘贴；或在上一步同意跳转到内页后再点书签。'
          : '';
      alert('❌ 未识别到商品' + hint + '\n\n调试片段：\n' + sample);
      return;
    }

    var seen = {};
    var unique = goods.filter(function (g) {
      var k = g.name.slice(0, 15) + '_' + g.price + '_' + g.spec;
      if (seen[k]) return false;
      seen[k] = 1;
      return true;
    });

    var SKIP2 = /^(规格|颜色|型号|款式|货号|数量|单价|优惠|货品|极速|售后|交期|延期|品质|破损|退货|确认|已发|待发|申请|假一|查看|快递|发货|备注|收货|卖家|买家|支付|配送|手机|电话|地址|订单|交易|物流|等待|当前|如果|原价|实付|合计|运费|48|上门)/;
    function okLine(s) {
      var minL = s && /[\u4e00-\u9fff]/.test(s) ? 4 : 8;
      return s && s.length >= minL && s.length <= 200 && !SKIP2.test(s) && !/^\d+$/.test(s) && !/^\d+\.\d+$/.test(s) && !/^[¥￥\d\s\/.元,，套件对]+$/.test(s);
    }
    var freq = {}, t, li, L, best = '', bc = 0;
    for (li = 0; li < lines.length; li++) {
      L = lines[li];
      if (okLine(L) && /[\u4e00-\u9fff]{4,}/.test(L)) freq[L] = (freq[L] || 0) + 1;
    }
    for (t in freq) {
      if (freq[t] > bc || (freq[t] === bc && t.length > best.length)) { bc = freq[t]; best = t; }
    }
    if (!best) {
      for (li = 0; li < lines.length; li++) {
        L = lines[li];
        if (okLine(L) && /[\u4e00-\u9fff]{3,}/.test(L) && L.length > best.length) best = L;
      }
    }
    if (best) {
      unique.forEach(function (g) {
        var nm = (g.name || '').trim();
        var sp = (g.spec || '').trim();
        if (/[\u4e00-\u9fff]{5,}/.test(nm) && nm.length >= 14) return;
        if (!sp && nm) g.spec = nm;
        g.name = best;
        g.productName = best;
      });
    }

    function pickProductImageUrls(max) {
      var list = [];
      var seen = {};
      var all = document.querySelectorAll('img[src]');
      for (var i = 0; i < all.length; i++) {
        var el = all[i];
        var src = el.getAttribute('src') || el.src || '';
        if (!/^https?:\/\//i.test(src)) continue;
        if (/avatar|logo|icon|emoji|loading|spacer|1x1|pixel|data:image|qlogo|wx\.qq/i.test(src)) continue;
        var r = el.getBoundingClientRect();
        if (r.width < 28 || r.height < 28) continue;
        var key = src.split('?')[0];
        if (seen[key]) continue;
        seen[key] = 1;
        list.push(src);
        if (list.length >= Math.max(max * 5, 12)) break;
      }
      return list;
    }

    function urlToJpegB64(url, maxSide, q, cb) {
      var img = new Image();
      img.crossOrigin = 'anonymous';
      var done = false;
      function fin(err, b64) {
        if (done) return;
        done = true;
        try { clearTimeout(tmr); } catch (e) {}
        cb(err, b64 || '');
      }
      var tmr = setTimeout(function () { fin(new Error('timeout'), ''); }, 2800);
      img.onload = function () {
        try {
          var c = document.createElement('canvas');
          var w = img.naturalWidth || img.width;
          var h = img.naturalHeight || img.height;
          if (!w || !h) return fin(null, '');
          var sc = Math.min(maxSide / w, maxSide / h, 1);
          c.width = Math.max(1, Math.round(w * sc));
          c.height = Math.max(1, Math.round(h * sc));
          var ctx = c.getContext('2d');
          ctx.drawImage(img, 0, 0, c.width, c.height);
          var s = c.toDataURL('image/jpeg', q);
          fin(null, s.replace(/^data:image\/jpeg;base64,/, ''));
        } catch (err) {
          fin(err, '');
        }
      };
      img.onerror = function () { fin(new Error('load'), ''); };
      img.src = url;
    }

    function jsonToUtf8B64(obj) {
      var json = JSON.stringify(obj);
      try {
        return btoa(unescape(encodeURIComponent(json)));
      } catch (e) {
        try {
          delete obj.rawText;
          return btoa(unescape(encodeURIComponent(JSON.stringify(obj))));
        } catch (e2) {
          return '';
        }
      }
    }

    function navigateWithData(data) {
      var hasImg = data.goods.some(function (g) { return g.imgB64; });
      var b64 = jsonToUtf8B64(data);
      if (!b64) {
        alert('打包数据失败，请去掉图片后重试或使用复制粘贴。');
        return;
      }
      var hashPart = encodeURIComponent(b64);
      if (!hasImg && hashPart.length < 95000) {
        window.location.href = TARTGO + '#tartgo=' + hashPart;
      } else {
        window.name = '__TARTGO_IMPORT__:' + b64;
        window.location.href = TARTGO;
      }
    }

    var imgUrls = pickProductImageUrls(unique.length);
    var gix = 0;
    function attachNext() {
      if (gix >= unique.length) {
        navigateWithData({
          goods: unique,
          ship: ship,
          paid: paid,
          orderId: orderId,
          sourceLink: sourceLink,
          rawText: text.slice(0, 12000)
        });
        return;
      }
      var g = unique[gix];
      var u = imgUrls[gix] || imgUrls[0];
      if (!u) {
        gix++;
        attachNext();
        return;
      }
      urlToJpegB64(u, 220, 0.68, function (err, b64) {
        if (b64) g.imgB64 = b64;
        gix++;
        attachNext();
      });
    }
    attachNext();
  }

  runBookmarklet();
})();
