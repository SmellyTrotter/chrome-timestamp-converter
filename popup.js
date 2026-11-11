// ===== 公共转换逻辑 =====
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

  const dateLike = /[年月日\-\/: ]/.test(s);
  if (dateLike) {
    const dt = parseDate(s);
    if (dt) {
      const ms = dt.getTime();
      return { ok: true, isTimestamp: false, date: formatDate(dt), seconds: Math.floor(ms / 1000), ms: ms };
    }
  }

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

// 日历选中的日期 + 0点/24点 → 时间戳（按浏览器本地时区）
function dateToTs(dateStr, point) {
  const parts = (dateStr || '').split('-').map(Number);
  if (parts.length !== 3 || parts.some((n) => isNaN(n))) return null;
  const [y, m, d] = parts;
  let base = new Date(y, m - 1, d, 0, 0, 0, 0);
  if (point === '24') {
    base = new Date(y, m - 1, d + 1, 0, 0, 0, 0); // 次日 0 点（即当日 24:00）
  }
  const ms = base.getTime();
  if (isNaN(ms)) return null;
  return { ms, seconds: Math.floor(ms / 1000), date: formatDate(base) };
}

// ===== 公共 UI =====
function copy(text) {
  navigator.clipboard.writeText(String(text)).catch(() => {
    const ta = document.createElement('textarea');
    ta.value = text;
    document.body.appendChild(ta);
    ta.select();
    try { document.execCommand('copy'); } catch (e) {}
    ta.remove();
  });
}

function flash(el) {
  const c = el.querySelector('.copy');
  const o = c.textContent;
  c.textContent = '已复制';
  setTimeout(() => { c.textContent = o; }, 1000);
}

function renderLines(container, lines) {
  container.innerHTML = lines.map(([k, v]) =>
    `<div class="line" data-v="${encodeURIComponent(v)}">` +
    `<div class="line-top"><span class="k">${k}</span><span class="copy">复制</span></div>` +
    `<span class="v">${v}</span></div>`
  ).join('');
  container.querySelectorAll('.line').forEach((el) => {
    el.addEventListener('click', () => {
      copy(decodeURIComponent(el.dataset.v));
      flash(el);
    });
  });
}

// ===== 区块一：时间戳 → 日期 =====
const inputEl = document.getElementById('input');
const unitEl = document.getElementById('unit');
const outputEl = document.getElementById('output');

function renderTs() {
  const text = inputEl.value;
  if (!text.trim()) {
    outputEl.innerHTML = '<span class="muted">等待输入…</span>';
    return;
  }
  const r = convert(text, unitEl.value);
  if (!r.ok) {
    outputEl.innerHTML = '<span class="err">无法识别为时间戳</span>';
    return;
  }
  renderLines(outputEl, [
    ['日期时间', r.date],
    ['秒级时间戳', String(r.seconds)],
    ['毫秒级时间戳', String(r.ms)]
  ]);
}

inputEl.addEventListener('input', renderTs);
unitEl.addEventListener('change', renderTs);
renderTs();

// ===== 区块二：日期 → 时间戳（自绘像素日历 + 0点/24点）=====
const calGrid = document.getElementById('calGrid');
const calTitle = document.getElementById('calTitle');
const prevM = document.getElementById('prevM');
const nextM = document.getElementById('nextM');
const pointSeg = document.getElementById('pointSeg');
const calCaption = document.getElementById('calCaption');
const dateOutputEl = document.getElementById('dateOutput');
let point = '0';
let viewY, viewM;   // 当前展示的年月（viewM: 0-11）
let sel = null;     // 选中的日期 {y,m,d}

function renderCalendar() {
  calTitle.textContent = `${viewY}年${String(viewM + 1).padStart(2, '0')}月`;
  const today = new Date();
  const start = new Date(viewY, viewM, 1 - new Date(viewY, viewM, 1).getDay());
  let html = '';
  for (let i = 0; i < 42; i++) {
    const d = new Date(start.getFullYear(), start.getMonth(), start.getDate() + i);
    const cls = ['cal-cell'];
    if (d.getMonth() !== viewM) cls.push('out');
    if (d.getFullYear() === today.getFullYear() && d.getMonth() === today.getMonth() && d.getDate() === today.getDate()) cls.push('today');
    if (sel && d.getFullYear() === sel.y && d.getMonth() === sel.m && d.getDate() === sel.d) cls.push('sel');
    html += `<div class="${cls.join(' ')}" data-y="${d.getFullYear()}" data-m="${d.getMonth()}" data-d="${d.getDate()}">${d.getDate()}</div>`;
  }
  calGrid.innerHTML = html;
  calGrid.querySelectorAll('.cal-cell').forEach((cell) => {
    cell.addEventListener('click', () => {
      sel = { y: +cell.dataset.y, m: +cell.dataset.m, d: +cell.dataset.d };
      renderCalendar();
      renderDate();
    });
  });
}

prevM.addEventListener('click', () => {
  viewM--;
  if (viewM < 0) { viewM = 11; viewY--; }
  renderCalendar();
});
nextM.addEventListener('click', () => {
  viewM++;
  if (viewM > 11) { viewM = 0; viewY++; }
  renderCalendar();
});

pointSeg.querySelectorAll('button').forEach((btn) => {
  btn.addEventListener('click', () => {
    pointSeg.querySelectorAll('button').forEach((b) => b.classList.remove('active'));
    btn.classList.add('active');
    point = btn.dataset.point;
    renderDate();
  });
});

function renderDate() {
  if (!sel) {
    dateOutputEl.innerHTML = '<span class="muted">请选择日期</span>';
    return;
  }
  const ds = `${sel.y}-${String(sel.m + 1).padStart(2, '0')}-${String(sel.d).padStart(2, '0')}`;
  const r = dateToTs(ds, point);
  if (!r) {
    dateOutputEl.innerHTML = '<span class="err">日期无效</span>';
    return;
  }
  const label = point === '24' ? '次日 0 点（即当日 24:00）' : '当日 0 点（当日开始）';
  calCaption.textContent = '当前：' + label;
  renderLines(dateOutputEl, [
    ['日期时间', r.date],
    ['秒级时间戳', String(r.seconds)],
    ['毫秒级时间戳', String(r.ms)]
  ]);
}

// 初始化：展示当月，默认选中今天
(function init() {
  const t = new Date();
  viewY = t.getFullYear();
  viewM = t.getMonth();
  sel = { y: viewY, m: viewM, d: t.getDate() };
  renderCalendar();
  renderDate();
})();

// ===== 小螃蟹动画（悬浮于功能层之下，自由溜达 + 可拖动）=====
(function () {
  const crab = document.getElementById('crab');
  if (!crab) return;

  // 两套螃蟹形象，出场时随机选一只
  const CRAB_A = `
    <svg viewBox="0 0 48 44" shape-rendering="crispEdges" xmlns="http://www.w3.org/2000/svg">
      <g fill="#ef7d57">
        <rect x="10" y="31" width="3" height="4"/><rect x="14" y="34" width="3" height="4"/>
        <rect x="35" y="31" width="3" height="4"/><rect x="31" y="34" width="3" height="4"/>
      </g>
      <rect x="18" y="12" width="2" height="8" fill="#ef7d57"/>
      <rect x="28" y="12" width="2" height="8" fill="#ef7d57"/>
      <g class="eyes">
        <rect x="15" y="6" width="7" height="7" fill="#fff" stroke="#1a1c2c" stroke-width="1.5"/>
        <rect x="26" y="6" width="7" height="7" fill="#fff" stroke="#1a1c2c" stroke-width="1.5"/>
        <rect x="18" y="9" width="3" height="3" fill="#1a1c2c"/><rect x="29" y="9" width="3" height="3" fill="#1a1c2c"/>
        <rect x="19" y="10" width="1" height="1" fill="#fff"/><rect x="30" y="10" width="1" height="1" fill="#fff"/>
      </g>
      <rect x="12" y="20" width="24" height="16" fill="#ef7d57" stroke="#1a1c2c" stroke-width="2"/>
      <rect x="12" y="28" width="24" height="8" fill="#d85a3a"/>
      <rect x="14" y="24" width="3" height="2" fill="#f4a6c0"/><rect x="31" y="24" width="3" height="2" fill="#f4a6c0"/>
      <rect x="20" y="26" width="8" height="2" fill="#1a1c2c"/><rect x="20" y="26" width="8" height="1" fill="#ef7d57"/>
      <g class="claw claw-l">
        <rect x="3" y="22" width="9" height="9" fill="#ef7d57" stroke="#1a1c2c" stroke-width="2"/>
        <rect x="3" y="22" width="4" height="9" fill="#d85a3a"/>
      </g>
      <g class="claw claw-r">
        <rect x="36" y="22" width="9" height="9" fill="#ef7d57" stroke="#1a1c2c" stroke-width="2"/>
        <rect x="41" y="22" width="4" height="9" fill="#d85a3a"/>
      </g>
      <g class="sparkle" fill="#ffcd75">
        <rect x="44" y="6" width="2" height="2"/><rect x="43" y="7" width="4" height="1"/><rect x="44" y="5" width="2" height="4"/>
      </g>
    </svg>`;

  const CRAB_B = `
    <svg viewBox="0 0 48 44" shape-rendering="crispEdges" xmlns="http://www.w3.org/2000/svg">
      <g fill="#41a6f6">
        <rect x="10" y="36" width="3" height="4"/><rect x="14" y="38" width="3" height="4"/>
        <rect x="35" y="36" width="3" height="4"/><rect x="31" y="38" width="3" height="4"/>
      </g>
      <rect x="8" y="18" width="32" height="18" fill="#41a6f6" stroke="#1a1c2c" stroke-width="2"/>
      <rect x="10" y="14" width="28" height="6" fill="#41a6f6" stroke="#1a1c2c" stroke-width="2"/>
      <rect x="18" y="22" width="2" height="2" fill="#2b6cb0"/><rect x="28" y="22" width="2" height="2" fill="#2b6cb0"/>
      <g class="eyes">
        <rect x="14" y="5" width="8" height="8" fill="#fff" stroke="#1a1c2c" stroke-width="1.5"/>
        <rect x="26" y="5" width="8" height="8" fill="#fff" stroke="#1a1c2c" stroke-width="1.5"/>
        <rect x="17" y="8" width="3" height="3" fill="#1a1c2c"/><rect x="29" y="8" width="3" height="3" fill="#1a1c2c"/>
        <rect x="18" y="9" width="1" height="1" fill="#fff"/><rect x="30" y="9" width="1" height="1" fill="#fff"/>
      </g>
      <rect x="12" y="22" width="3" height="2" fill="#f4a6c0"/><rect x="33" y="22" width="3" height="2" fill="#f4a6c0"/>
      <rect x="20" y="26" width="8" height="2" fill="#1a1c2c"/><rect x="20" y="26" width="8" height="1" fill="#41a6f6"/>
      <g class="claw claw-l">
        <rect x="2" y="20" width="8" height="8" fill="#41a6f6" stroke="#1a1c2c" stroke-width="2"/>
        <rect x="2" y="20" width="3" height="8" fill="#2b6cb0"/>
      </g>
      <g class="claw claw-r">
        <rect x="38" y="20" width="8" height="8" fill="#41a6f6" stroke="#1a1c2c" stroke-width="2"/>
        <rect x="43" y="20" width="3" height="8" fill="#2b6cb0"/>
      </g>
      <g class="sparkle" fill="#ffcd75">
        <rect x="44" y="6" width="2" height="2"/><rect x="43" y="7" width="4" height="1"/><rect x="44" y="5" width="2" height="4"/>
      </g>
    </svg>`;

  // 第三只：紫色、举钳欢呼、头顶星星、张嘴大笑（体型改动最大）
  const CRAB_C = `
    <svg viewBox="0 0 48 44" shape-rendering="crispEdges" xmlns="http://www.w3.org/2000/svg">
      <g fill="#b180d7">
        <rect x="9" y="30" width="3" height="5"/><rect x="14" y="33" width="3" height="5"/>
        <rect x="36" y="30" width="3" height="5"/><rect x="31" y="33" width="3" height="5"/>
        <rect x="18" y="16" width="2" height="5"/><rect x="28" y="16" width="2" height="5"/>
      </g>
      <g class="claw claw-l">
        <rect x="2" y="8" width="9" height="9" fill="#b180d7" stroke="#1a1c2c" stroke-width="2"/>
        <rect x="2" y="8" width="4" height="9" fill="#7a4fa3"/>
      </g>
      <g class="claw claw-r">
        <rect x="37" y="8" width="9" height="9" fill="#b180d7" stroke="#1a1c2c" stroke-width="2"/>
        <rect x="42" y="8" width="4" height="9" fill="#7a4fa3"/>
      </g>
      <g fill="#ffcd75">
        <rect x="23" y="2" width="2" height="2"/><rect x="22" y="3" width="4" height="1"/><rect x="23" y="1" width="2" height="4"/>
      </g>
      <g class="eyes">
        <rect x="15" y="9" width="7" height="7" fill="#fff" stroke="#1a1c2c" stroke-width="1.5"/>
        <rect x="26" y="9" width="7" height="7" fill="#fff" stroke="#1a1c2c" stroke-width="1.5"/>
        <rect x="18" y="12" width="3" height="3" fill="#1a1c2c"/><rect x="29" y="12" width="3" height="3" fill="#1a1c2c"/>
        <rect x="19" y="13" width="1" height="1" fill="#fff"/><rect x="30" y="13" width="1" height="1" fill="#fff"/>
      </g>
      <rect x="12" y="20" width="24" height="16" fill="#b180d7" stroke="#1a1c2c" stroke-width="2"/>
      <rect x="12" y="28" width="24" height="8" fill="#7a4fa3"/>
      <rect x="14" y="24" width="3" height="2" fill="#f4a6c0"/><rect x="31" y="24" width="3" height="2" fill="#f4a6c0"/>
      <rect x="20" y="24" width="8" height="3" fill="#1a1c2c"/><rect x="21" y="26" width="6" height="1" fill="#ef7d57"/>
      <g class="sparkle" fill="#ffcd75">
        <rect x="44" y="14" width="2" height="2"/><rect x="43" y="15" width="4" height="1"/><rect x="44" y="13" width="2" height="4"/>
      </g>
    </svg>`;

  // 三只螃蟹轮流出场
  const CRABS = [CRAB_A, CRAB_B, CRAB_C];
  let crabIndex = Math.floor(Math.random() * CRABS.length);  // 随机起点，但依旧轮流

  const app = crab.parentElement;            // .app
  const W = () => app.clientWidth;
  const H = () => app.clientHeight;
  const CRAB_W = 48, CRAB_H = 44;
  let x = -CRAB_W - 4, y = 8, dirX = 1, dirY = 1, dragging = false, raf = null;
  let showTimer = null, exitTimer = null;

  function step() {
    if (!dragging) {
      x += dirX * 0.35;                       // 左右慢走（更慢）
      y += dirY * 0.18;                       // 上下在小范围内漂移，尽量待在可见区
      const maxX = W() - CRAB_W - 4;
      const maxY = 34;                        // 顶部可见带下沿：避免整只钻进卡片背后
      if (x >= maxX) { x = maxX; dirX = -1; crab.style.transform = 'scaleX(-1)'; }
      else if (x <= -CRAB_W - 4) { x = -CRAB_W - 4; dirX = 1; crab.style.transform = 'scaleX(1)'; }
      if (y >= maxY) { y = maxY; dirY = -1; }
      else if (y <= 2) { y = 2; dirY = 1; }
      crab.style.left = x + 'px';
      crab.style.top = y + 'px';
    }
    raf = requestAnimationFrame(step);
  }

  function show() {
    clearTimeout(showTimer);
    clearTimeout(exitTimer);
    crab.classList.remove('pop-out');
    crab.classList.add('show');
    // 每次出场随机一个浮现速度，减少重复感（0.4~0.9s）
    const pop = crab.querySelector('.crab-pop');
    if (pop) pop.style.animationDuration = (0.4 + Math.random() * 0.5).toFixed(2) + 's';
    crab.querySelector('.crab-inner').innerHTML = CRABS[crabIndex % CRABS.length];  // 三只轮流
    crabIndex++;
    dirX = Math.random() < 0.5 ? 1 : -1;
    x = dirX === 1 ? -CRAB_W - 4 : (W() - CRAB_W - 4);
    y = 4 + Math.random() * 28;                            // 顶部可见带内随机高度（2~34）
    crab.style.transform = dirX === 1 ? 'scaleX(1)' : 'scaleX(-1)';
    crab.style.left = x + 'px';
    crab.style.top = y + 'px';
    if (!raf) raf = requestAnimationFrame(step);
    showTimer = setTimeout(hide, 12000 + Math.random() * 8000);   // 露面 12~20s
  }

  function hide() {
    clearTimeout(showTimer);
    crab.classList.remove('show');
    crab.classList.add('pop-out');                         // 像素化缩回消失
    const pop = crab.querySelector('.crab-pop');
    if (pop) pop.style.animationDuration = '.4s';          // 复位为固定消失时长
    if (raf) { cancelAnimationFrame(raf); raf = null; }
    // 等消失动画走完（0.4s）再复位，并安排下次露面
    exitTimer = setTimeout(() => {
      crab.classList.remove('pop-out');
      showTimer = setTimeout(show, 5000 + Math.random() * 8000);    // 躲 5~13s
    }, 450);
  }

  // 拖动
  let offX = 0, offY = 0;
  crab.addEventListener('pointerdown', (e) => {
    dragging = true;
    crab.setPointerCapture(e.pointerId);
    const r = crab.getBoundingClientRect();
    offX = e.clientX - r.left;
    offY = e.clientY - r.top;
  });
  crab.addEventListener('pointermove', (e) => {
    if (!dragging) return;
    const ar = app.getBoundingClientRect();
    let nx = e.clientX - ar.left - offX;
    let ny = e.clientY - ar.top - offY;
    nx = Math.max(-20, Math.min(nx, ar.width - CRAB_W + 20));
    ny = Math.max(0, Math.min(ny, Math.max(0, ar.height - CRAB_H)));
    x = nx; y = ny;
    crab.style.left = nx + 'px';
    crab.style.top = ny + 'px';
  });
  const endDrag = (e) => {
    if (!dragging) return;
    dragging = false;
    try { crab.releasePointerCapture(e.pointerId); } catch (_) {}
  };
  crab.addEventListener('pointerup', endDrag);
  crab.addEventListener('pointercancel', endDrag);

  // 首次延迟登场
  showTimer = setTimeout(show, 1500 + Math.random() * 3000);
})();
