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

  function runBookmarklet() {
    var text = getText(document.body);
    var lines = text.split('\n').map(function (l) { return l.trim(); }).filter(function (l) { return l; });
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
    function ok(s) {
      return s.length >= 8 && s.length <= 120 && !SKIP.test(s) && !/^\d+$/.test(s) && !/^\d+\.\d+$/.test(s) && !/^[¥￥\d\s\/.元,，套件对]+$/.test(s);
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
      var pm = l.match(/^(\d+\.?\d*)\s*元[\/／][件个只条对套组双副片张包盒袋根支块]/) ||
        l.match(/^(\d+\.?\d*)[\/／][件个只条对套组双副片张包盒袋根支块]/) ||
        l.match(/^[¥￥](\d+\.?\d*)[\/／][件个只条对套组双副片张包盒袋根支块]/);
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

    if (!goods.length) {
      var sample = lines.filter(function (ln) { return /\d/.test(ln); }).slice(0, 20).join('\n');
      alert('❌ 未识别到商品\n\n调试-含数字的行：\n' + sample);
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
      return s && s.length >= 8 && s.length <= 200 && !SKIP2.test(s) && !/^\d+$/.test(s) && !/^\d+\.\d+$/.test(s) && !/^[¥￥\d\s\/.元,，套件对]+$/.test(s);
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

    function navigateWithData(data) {
      var enc = encodeURIComponent(JSON.stringify(data));
      var hasB64 = data.goods.some(function (g) { return g.imgB64; });
      if (!hasB64 && enc.length < 90000) {
        window.location.href = TARTGO + '#tartgo=' + enc;
      } else {
        window.name = '__TARTGO_IMPORT__:' + enc;
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
