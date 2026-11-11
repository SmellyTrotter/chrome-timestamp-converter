// ===== 公共转换逻辑（与 popup.js 保持一致）=====
function detectUnit(numStr) {
  const intPart = numStr.split('.')[0].replace('-', '');
  const len = intPart.length;
  if (len >= 13) return 'ms';
  if (len <= 10) return 's';
  return Number(numStr) >= 1e12 ? 'ms' : 's';
}

function formatDate(d) {
  const p = (n) => String(n).padStart(2, '0');
  const p3 = (n) => String(n).padStart(3, '0');
  return `${d.getFullYear()}年${p(d.getMonth() + 1)}月${p(d.getDate())}日 ` +
         `${p(d.getHours())}:${p(d.getMinutes())}:${p(d.getSeconds())}.${p3(d.getMilliseconds())}`;
}

function parseDate(s) {
  let d = new Date(s);
  if (!isNaN(d.getTime())) return d;
  const norm = s.replace(/年/g, '-').replace(/月/g, '-').replace(/日/g, ' ').replace(/\//g, '-');
  d = new Date(norm);
  if (!isNaN(d.getTime())) return d;
  return null;
}

function convert(input, unit) {
  const s = (input || '').trim();
  if (!s) return { ok: false };

  // 含日期分隔符（年/月/日/-/:/空格）的，优先按日期解析
  const dateLike = /[年月日\-\/: ]/.test(s);
  if (dateLike) {
    const dt = parseDate(s);
    if (dt) {
      const ms = dt.getTime();
      return { ok: true, isTimestamp: false, date: formatDate(dt), seconds: Math.floor(ms / 1000), ms: ms };
    }
  }

  // 否则按时间戳解析（自动识别 秒 / 毫秒）
  const m = s.match(/-?\d[\d,]*\.?\d*/);
  if (m) {
    const numStr = m[0].replace(/,/g, '');
    const num = Number(numStr);
    if (isFinite(num)) {
      const u = unit === 'auto' ? detectUnit(numStr) : unit;
      if (u) {
        const ms = u === 's' ? num * 1000 : num;
        const d = new Date(ms);
        if (!isNaN(d.getTime())) {
          return { ok: true, isTimestamp: true, date: formatDate(d), seconds: Math.floor(ms / 1000), ms: Math.round(ms), unit: u };
        }
      }
    }
  }
  return { ok: false };
}

// ===== 右键菜单 =====
chrome.runtime.onInstalled.addListener(() => {
  chrome.contextMenus.removeAll(() => {
    chrome.contextMenus.create({
      id: 'convert-timestamp',
      title: '转换时间戳',
      contexts: ['selection']
    });
  });
});

chrome.contextMenus.onClicked.addListener((info, tab) => {
  if (info.menuItemId !== 'convert-timestamp') return;
  const text = (info.selectionText || '').trim();
  if (!text) return;
  const r = convert(text, 'auto');
  const lines = r.ok
    ? [['日期时间', r.date], ['秒级时间戳', String(r.seconds)], ['毫秒级时间戳', String(r.ms)]]
    : null;
  chrome.scripting.executeScript({
    target: { tabId: tab.id },
    func: showBubble,
    args: [text, r.ok, lines]
  }).catch(() => {});
});

// ===== 注入到页面的浮层（在目标页面上下文执行）=====
function showBubble(input, ok, lines) {
  const old = document.getElementById('ts-convert-bubble');
  if (old) old.remove();

  const b = document.createElement('div');
  b.id = 'ts-convert-bubble';
  b.style.cssText = 'position:fixed;z-index:2147483647;max-width:320px;background:#1a1c2c;color:#f4f4f4;' +
    "font:13px/1.5 'Courier New',ui-monospace,monospace;padding:0;border:3px solid #000;" +
    'box-shadow:4px 4px 0 rgba(0,0,0,.6);cursor:default;';

  const esc = (s) => String(s).replace(/[&<>"']/g, (c) =>
    ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));

  let html = '<div style="background:#29366f;border-bottom:3px solid #000;padding:8px 12px;' +
    'font-weight:700;color:#ffcd75;letter-spacing:1px;">时间戳转换</div>';
  html += '<div style="padding:10px 12px;">';
  if (!ok) {
    html += `<div style="color:#ef7d57;">无法识别：「${esc(input)}」</div>`;
  } else {
    html += `<div style="color:#94b0c2;margin-bottom:8px;word-break:break-all;">输入：${esc(input)}</div>`;
    lines.forEach(([k, v]) => {
      html += `<div class="ts-line" data-v="${encodeURIComponent(v)}" ` +
        'style="display:block;padding:6px 8px;margin-bottom:6px;background:#11132a;border:3px solid #000;cursor:pointer;">' +
        `<div style="font-size:10px;color:#94b0c2;text-transform:uppercase;margin-bottom:2px;">${k}</div>` +
        `<div style="color:#a7f070;font-variant-numeric:tabular-nums;white-space:nowrap;overflow-x:auto;">${esc(v)}</div></div>`;
    });
    html += '<div style="color:#94b0c2;font-size:11px;margin-top:4px;">点击任意行复制 · 点击别处关闭</div>';
  }
  html += '</div>';
  b.innerHTML = html;
  document.body.appendChild(b);

  const sel = window.getSelection();
  let top = 80, left = 80;
  if (sel && sel.rangeCount) {
    const rect = sel.getRangeAt(0).getBoundingClientRect();
    top = rect.bottom + 8;
    left = rect.left;
  }
  top = Math.max(8, Math.min(top, window.innerHeight - b.offsetHeight - 8));
  left = Math.max(8, Math.min(left, window.innerWidth - b.offsetWidth - 8));
  b.style.top = top + 'px';
  b.style.left = left + 'px';

  const cleanup = () => {
    if (document.body.contains(b)) b.remove();
    document.removeEventListener('click', dismiss);
  };
  const dismiss = (e) => { if (!b.contains(e.target)) cleanup(); };

  b.querySelectorAll('.ts-line').forEach((el) => {
    el.addEventListener('click', () => {
      const v = decodeURIComponent(el.dataset.v);
      const ta = document.createElement('textarea');
      ta.value = v;
      document.body.appendChild(ta);
      ta.select();
      try { document.execCommand('copy'); } catch (e) { navigator.clipboard && navigator.clipboard.writeText(v); }
      ta.remove();
      el.style.background = '#ffcd75';
      setTimeout(() => { el.style.background = '#11132a'; }, 600);
    });
  });

  document.addEventListener('click', dismiss);
  setTimeout(cleanup, 10000);
}
