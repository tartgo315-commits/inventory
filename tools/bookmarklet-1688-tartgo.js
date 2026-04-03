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
          var tag = c.tagName;
          if (tag === 'STYLE' || tag === 'SCRIPT' || tag === 'NOSCRIPT' || tag === 'TEMPLATE') {
            continue;
          }
          if (tag === 'IFRAME') {
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
      if (/!important/i.test(l)) return false;
      if (
        /^\s*(?:padding|margin|border(?:-[a-zA-Z]+)*|color|fill|transition|background(?:-[a-z]+)?|display|position|width|height|font|line-height|text-(?:align|decoration|shadow)?|flex|align-(?:items|self)?|justify-(?:content)?|box-(?:shadow|sizing)|transform|opacity|z-index|overflow(?:-[xy])?|cursor|outline)\s*:/i.test(
          l
        )
      ) {
        return false;
      }
      return true;
    });
  }

  /** 整段少换行时在关键标签前插换行，与站点 split1688TextToLines 一致 */
  function split1688TextToLines(text) {
    var t = String(text || '')
      .replace(/[\u200b-\u200d\ufeff]/g, '')
      .replace(/\r\n/g, '\n')
      .replace(/\r/g, '\n')
      .replace(/[\t\f\v]+/g, '\n');
    t = t.replace(/([^\n])(规格型号\s*[：:])/g, '$1\n$2');
    t = t.replace(/([^\n])(优惠后\s*\d)/g, '$1\n$2');
    t = t.replace(/([^\n])(假一赔[三四九十])/g, '$1\n$2');
    return t
      .split('\n')
      .map(function (l) {
        return l.trim();
      })
      .filter(Boolean);
  }

  /** 把「长标题 + 颜色：值」挤在同一行的复制结果拆成多行 */
  function expandGlued1688Lines(rawLines) {
    var out = [];
    for (var i = 0; i < rawLines.length; i++) {
      var L = rawLines[i];
      if (!L) continue;
      var splitM = L.match(/^(.{10,200}?)\s+(规格型号|规格|颜色|颜色分类|型号|款式)[：:]\s*(.+)$/);
      if (splitM && splitM[1].trim().length >= 8 && splitM[3].trim().length >= 1) {
        out.push(splitM[1].trim());
        out.push(splitM[2] + '：' + splitM[3].trim());
        continue;
      }
      out.push(L);
    }
    return out;
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

  /** 1688 服务话术，勿当型号/品名 */
  function junk1688AttrValue(v) {
    v = String(v || '').replace(/\s+/g, ' ').trim();
    if (!v) return true;
    var compact = v.replace(/\s/g, '');
    if (/无忧/.test(compact)) {
      if (/螺纹|齿|寸|码|×|mm|M\d|\d+mm|黑色|白色|红色|蓝色|绿色|黄色|灰色|紫色|橙色|粉色|卡其|咖啡|银色|金色|透明/.test(compact)) return false;
      if (compact.length <= 14) return true;
    }
    if (/规格无忧|交期无忧|品质无忧|无忧购|7天无理由|15天包换|晚发必赔|破损包赔|退货包运|极速退款|延期必赔|假一赔|包邮|现货|库存|售后无忧|跨境无忧|发货无忧|采购无忧|退换无忧|源头工厂|实力商家/.test(compact)) return true;
    if (v.length <= 8 && /^(无忧|规格|保障|包赔|承诺|服务|认证)$/.test(compact)) return true;
    return false;
  }

  /** 不可当品名行的营销/保障短句（含手机阿里整行服务保障） */
  function isBad1688TitleLine(l) {
    l = String(l || '').trim();
    if (!l) return false;
    var c = l.replace(/\s/g, '');
    var svcKw = [
      '7天无理由',
      '无理由退货',
      '极速退款',
      '48小时发货',
      '小时发货',
      '售后延长',
      '跨境无忧',
      '退货包运费',
      '晚发必赔',
      '破损包赔',
      '交期保障',
      '品质保障',
      '延期必赔',
      '假货包赔',
      '假一赔四',
      '假一赔三'
    ];
    var hits = 0;
    for (var si = 0; si < svcKw.length; si++) {
      if (c.indexOf(svcKw[si]) >= 0) hits++;
    }
    if (hits >= 2) return true;
    if (/7天无理由|无理由退货/.test(c) && (/极速退款|小时发货|跨境无忧|退货包运费/.test(c))) return true;
    if (/无忧/.test(c) && c.length <= 14) return true;
    if (/无理由|包赔|必赔|保障$|认证$|包邮$|疯抢|热卖|限购|券后|到手价|立即|抢购/.test(c) && c.length <= 18) return true;
    return false;
  }

  function findColorLineAbove(lines, startIdx, maxBack) {
    var lim = Math.max(0, startIdx - (maxBack || 55));
    for (var j = startIdx; j >= lim; j--) {
      var raw = lines[j];
      var cm =
        raw.match(/(?:颜色|颜色分类)\s*[：:]\s*(.+)$/) ||
        raw.match(/规格型号\s*[：:]\s*(.+)$/) ||
        raw.match(/颜色\s+([^：:\s].{0,60})$/);
      if (cm) {
        var cv = cm[1].replace(/\s+/g, ' ').trim();
        if (cv && !junk1688AttrValue(cv)) return cv;
      }
    }
    return '';
  }

  /** 从单价/优惠后行向上扫：跳过货号，收集 规格/颜色/型号/款式，最近一条可读标题为品名 */
  function scan1688RowNameSpec(lines, startIdx, maxBack) {
    var SKIP_BADGE = /^(极速退款|售后延长|交期保障|延期必赔|品质保障|破损包赔|退货包运费|确认收货|已发货|待发货|申请)/;
    var specParts = [];
    var name = '';
    var lim = Math.max(0, startIdx - (maxBack || 55));
    for (var j = startIdx; j >= lim; j--) {
      var l = lines[j];
      if (SKIP_BADGE.test(l)) continue;
      if (isBad1688TitleLine(l)) continue;
      if (/^货号\s*[：:]/.test(l)) continue;
      var am = l.match(/^(规格型号|规格|颜色|颜色分类|型号|款式)\s*[：:]\s*(.+)$/);
      if (am) {
        var v = am[2].trim();
        if (v && !junk1688AttrValue(v)) specParts.unshift(v);
        continue;
      }
      var minName = /[\u4e00-\u9fff]/.test(l) ? 4 : 6;
      var tail = l.match(/^(.{6,200}?)\s+(规格型号|规格|颜色|颜色分类|型号|款式)\s*[：:]\s*(.+)$/);
      if (tail) {
        var tv = tail[3].trim();
        if (tv && !junk1688AttrValue(tv)) specParts.unshift(tv);
        l = tail[1].trim();
      }
      if (
        l.length >= minName &&
        l.length <= 200 &&
        !/^[\d\s¥￥元\.\/×xX＊*,，。]+$/.test(l) &&
        !/^(规格型号|规格|颜色|颜色分类|型号|款式|货号|数量|优惠|运费|单价|价格|原价|实付|合计|破损|品质|延期|交期|申请|查看|快递|发货|待发|已发|备注|收货|极速|退款|投诉|闪电|超时|卖家|买家|订单|支付|配送|手机|电话|地址|交易|物流|等待|当前|如果)/.test(l) &&
        !isBad1688TitleLine(l)
      ) {
        name = l;
        break;
      }
    }
    var filtered = specParts.filter(function (p) {
      return p && !junk1688AttrValue(p);
    });
    var spec = filtered.join(' · ');
    if (!spec || junk1688AttrValue(spec)) {
      var col = findColorLineAbove(lines, startIdx, maxBack);
      if (col) spec = col;
    }
    if (junk1688AttrValue(spec)) spec = '';
    if (isBad1688TitleLine(name)) name = '';
    return { name: name, spec: spec };
  }

  /** 规格行可能在「优惠后」下方（手机端 DOM 顺序），向下有限行内补抓 */
  function scan1688SpecForwardFrom(lines, fromIdx, maxLines) {
    var end = Math.min(lines.length, fromIdx + (maxLines || 12));
    for (var fj = fromIdx; fj < end; fj++) {
      var l = lines[fj];
      if (fj > fromIdx && /优惠后\s*\d+\.?\d*\s*元/.test(l)) return '';
      var am = l.match(/^(规格型号|规格|颜色|颜色分类|型号|款式)\s*[：:]\s*(.+)$/);
      if (am) {
        var v = am[2].trim();
        if (v && !junk1688AttrValue(v)) return v;
      }
    }
    return '';
  }

  function scan1688RowNameSpecForPrice(lines, priceLineIdx, maxBack, maxFwd) {
    var back = scan1688RowNameSpec(lines, priceLineIdx - 1, maxBack);
    var spec = back.spec;
    if (!spec) {
      var fw = scan1688SpecForwardFrom(lines, priceLineIdx + 1, maxFwd || 12);
      if (fw) spec = fw;
    }
    return { name: back.name, spec: spec };
  }

  /** 同一 SKU 在页面里「单价」等出现两次时，按 品名+价+件+型号 合并 */
  function dedupe1688GoodsRows(arr) {
    function stripInv(s) {
      return String(s || '')
        .replace(/[\u200b-\u200d\ufeff\u00a0]/g, '')
        .replace(/\s+/g, ' ')
        .trim();
    }
    var seen = {};
    var out = [];
    for (var di = 0; di < arr.length; di++) {
      var g = arr[di];
      var nm = stripInv(g.name || '').replace(/\s/g, '');
      var sp = stripInv(g.spec || '').replace(/\s/g, '');
      var k = nm.slice(0, 40) + '_' + g.price + '_' + (g.qty || 1) + '_' + sp.slice(0, 48);
      if (seen[k]) continue;
      seen[k] = 1;
      out.push(g);
    }
    return out;
  }

  function dedupeGoodsArr(arr) {
    var seen = {},
      res = [];
    for (var di = 0; di < arr.length; di++) {
      var g = arr[di];
      var specK = String(g.spec || '')
        .replace(/\s+/g, ' ')
        .trim()
        .slice(0, 48);
      var k = (g.name || '').slice(0, 14) + '_' + g.price + '_' + (g.qty || 1) + '_' + specK;
      if (!specK) k += '_' + di;
      if (seen[k]) continue;
      seen[k] = 1;
      res.push(g);
    }
    return res;
  }

  /** 收集可打开的订单内嵌页地址（书签在外壳页读不到 iframe 内 DOM 时用） */
  function findOrderIframeJumpUrls() {
    var list = document.querySelectorAll('iframe[src]');
    var cur = location.href.replace(/#.*$/, '');
    var oid = '';
    var om = cur.match(/orderId=(\d{8,30})/i);
    if (om) oid = om[1];
    var out = [];
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
      if (/redirect|trace/i.test(u) && !/order|trade|detail|offer|purchase|ctf-page/i.test(u)) continue;
      if (!/trade|order|detail|purchase|ctf-page|orderId|offer\/|offer\.html|page\/offer|buyer\.1688/i.test(u)) continue;
      if (u.split('#')[0] === cur.split('#')[0]) continue;
      out.push(u);
    }
    if (!out.length) return [];
    if (oid) {
      var withOid = out.filter(function (x) {
        return x.indexOf(oid) >= 0;
      });
      if (withOid.length) return withOid;
    }
    return out;
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
    var lines = expandGlued1688Lines(toCleanLines(split1688TextToLines(text).join('\n')));
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

    for (var i = 0; i < lines.length; i++) {
      if (skipIdx.has(i)) continue;
      var l = lines[i];
      var discM = l.match(/优惠后(\d+\.?\d*)元?[\/／]?[件个只条对套组双副片张包盒袋根支块付辆台箱瓶把卷米克]?/);
      if (discM) {
        var price = parseFloat(discM[1]);
        for (var s2 = i + 1; s2 < Math.min(lines.length, i + 4); s2++) {
          if (lines[s2].match(/^\d+\.?\d*\s*元[\/／][件个只条对套组双副片张包盒袋根支块付辆台箱瓶把卷米克]/) || lines[s2].match(/^\d+\.?\d*[\/／][件个只条对套组双副片张包盒袋根支块付辆台箱瓶把卷米克]/)) {
            skipIdx.add(s2);
            break;
          }
        }
        var qty = 1;
        var _rowDisc = scan1688RowNameSpecForPrice(lines, i, 45, 14);
        var name = _rowDisc.name;
        var spec = _rowDisc.spec;
        for (var k = i + 1; k < Math.min(lines.length, i + 10); k++) {
          if (skipIdx.has(k)) continue;
          if (/^\d+$/.test(lines[k])) {
            var v = parseInt(lines[k], 10);
            if (v >= 1 && v <= 9999) { qty = v; break; }
          }
        }
        if (name && price > 0) goods.push({ name: name, spec: spec, price: price, qty: qty, _anchorLine: i });
        continue;
      }
      var pm = l.match(/^(\d+\.?\d*)\s*元\s*[\/／]\s*[件个只条对套组双副片张包盒袋根支块付辆台箱瓶把卷米克]/) ||
        l.match(/^(\d+\.?\d*)\s*[\/／]\s*[件个只条对套组双副片张包盒袋根支块付辆台箱瓶把卷米克]/) ||
        l.match(/^[¥￥]\s*(\d+\.?\d*)\s*[\/／]\s*[件个只条对套组双副片张包盒袋根支块付辆台箱瓶把卷米克]/);
      if (!pm) continue;
      var price2 = parseFloat(pm[1]);
      if (price2 <= 0 || price2 > 99999) continue;
      /* 同一表格行常同时出现「优惠后13元」+「13.00元/个」，避免重复计一条商品 */
      var skipDupYuan = false;
      for (var yi = Math.max(0, i - 5); yi < i; yi++) {
        var ydm = lines[yi].match(/优惠后(\d+\.?\d*)元?/);
        if (ydm && Math.abs(parseFloat(ydm[1]) - price2) < 0.001) {
          skipDupYuan = true;
          break;
        }
      }
      if (skipDupYuan) continue;
      var qty2 = 1;
      var _rowPm = scan1688RowNameSpecForPrice(lines, i, 45, 14);
      var name2 = _rowPm.name;
      var spec2 = _rowPm.spec;
      for (var k2 = i + 1; k2 < Math.min(lines.length, i + 10); k2++) {
        if (/^\d+$/.test(lines[k2])) {
          var v2 = parseInt(lines[k2], 10);
          if (v2 >= 1 && v2 <= 9999) { qty2 = v2; break; }
        }
      }
      if (name2 && price2 > 0) goods.push({ name: name2, spec: spec2, price: price2, qty: qty2, _anchorLine: i });
    }

    /* air.1688.com 等新版：单价、价格、数量常分行，无「元/件」连在一起 */
    if (!goods.length) {
      var lastAirIdx = -99;
      var lastAirP = 0;
      var lastAirQ = 0;
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
        /* 详情页/订单里同一区块重复出现「单价+同价+同数量」，只保留第一条 */
        if (ai - lastAirIdx <= 8 && Math.abs(priceA - lastAirP) < 0.001 && qtyA === lastAirQ) continue;
        var _rowAir = scan1688RowNameSpecForPrice(lines, anchor, 60, 16);
        var nameA = _rowAir.name;
        var specA = _rowAir.spec;
        if (nameA && priceA > 0) {
          goods.push({ name: nameA, spec: specA, price: priceA, qty: qtyA, _anchorLine: ai });
          lastAirIdx = ai;
          lastAirP = priceA;
          lastAirQ = qtyA;
        }
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

    /* 明细在内嵌框架里：新标签打开内页（避免关掉当前页），再点一次本书签 */
    if (!goods.length) {
      var jumps = findOrderIframeJumpUrls();
      var jump = jumps.length ? jumps[0] : '';
      if (jump) {
        if (
          confirm(
            '【为什么失败】浏览器规定：书签只能读「当前这一层」网页。1688 把订单明细放在内嵌框架里时，这里读不到里面的字。\n\n【怎么解决】\n1）点「确定」→ 会在新标签打开内嵌订单页 → 切到那个标签 → 再点一次本书签；\n2）点「取消」→ 在本页 Ctrl+A 全选、Ctrl+C，到 TARTGO 进货页粘贴。\n\n（若浏览器拦截弹窗，请允许 1688 弹窗后重试，或改用复制粘贴。）'
          )
        ) {
          var w = null;
          try {
            w = window.open(jump, '_blank', 'noopener,noreferrer');
          } catch (e) {}
          if (!w) {
            if (confirm('无法打开新标签（可能被拦截）。是否改为在本窗口打开内页？（会离开当前页）')) location.href = jump;
          }
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

    goods = dedupe1688GoodsRows(goods);

    var seenU = {};
    var unique = [];
    goods.forEach(function (g, gi) {
      var specK = String(g.spec || '')
        .replace(/\s+/g, ' ')
        .trim();
      var k = (g.name || '').slice(0, 15) + '_' + g.price + '_' + (g.qty || 1) + '_' + specK;
      if (!specK) k += '__r' + gi;
      if (seenU[k]) return;
      seenU[k] = 1;
      unique.push(g);
    });

    var SKIP2 = /^(规格|颜色|型号|款式|货号|数量|单价|优惠|货品|极速|售后|交期|延期|品质|破损|退货|确认|已发|待发|申请|假一|查看|快递|发货|备注|收货|卖家|买家|支付|配送|手机|电话|地址|订单|交易|物流|等待|当前|如果|原价|实付|合计|运费|48|上门)/;
    function okLine(s) {
      var minL = s && /[\u4e00-\u9fff]/.test(s) ? 4 : 8;
      return (
        s &&
        s.length >= minL &&
        s.length <= 200 &&
        !SKIP2.test(s) &&
        !isBad1688TitleLine(s) &&
        !/^\d+$/.test(s) &&
        !/^\d+\.\d+$/.test(s) &&
        !/^[¥￥\d\s\/.元,，套件对]+$/.test(s)
      );
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
        if (!sp && nm && nm.length <= 16 && !junk1688AttrValue(nm) && !isBad1688TitleLine(nm)) g.spec = nm;
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
        unique.forEach(function (g) {
          delete g._anchorLine;
        });
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
