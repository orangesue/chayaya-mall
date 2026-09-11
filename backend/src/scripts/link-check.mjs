/**
 * 全站链接巡检
 * 用法: 先 npm start，再 node src/scripts/link-check.mjs
 *
 * 做两件事：
 *  1) 启动各页面（Node 模拟 DOM），从渲染结果里抽出所有 href / src / 卡片 url
 *  2) 逐个请求，凡是非 2xx/3xx 都报出来
 * 目的：杜绝「某个入口点进去是 404」这类问题（管理后台地址就踩过一次）。
 */
import path from 'node:path';
import { pathToFileURL } from 'node:url';

const BASE = process.env.UI_BASE || 'http://127.0.0.1:8788';
const FRONTEND = path.resolve(process.cwd(), '..', 'frontend');

/* ---------------- 最小 DOM ---------------- */
class El {
  constructor(tag = 'div', doc = null) {
    this.tagName = String(tag).toUpperCase(); this.ownerDocument = doc;
    this.children = []; this.parentNode = null; this.attributes = {}; this.dataset = {};
    this.style = {}; this._className = ''; this._text = ''; this._html = '';
    this.listeners = {}; this.scrollTop = 0; this.scrollHeight = 100; this.value = '';
  }
  set className(v) { this._className = String(v ?? ''); } get className() { return this._className; }
  set id(v) { this.attributes.id = String(v); } get id() { return this.attributes.id || ''; }
  get textContent() { return this._text; }
  set textContent(v) { this._text = String(v ?? ''); this._html = ''; this.children = []; }
  get innerHTML() { return this._html; }
  set innerHTML(v) {
    this._html = String(v ?? '');
    if (this.ownerDocument) {
      for (const m of this._html.matchAll(/id="([^"]+)"/g)) {
        if (!this.ownerDocument._ids.has(m[1])) this.ownerDocument._ids.set(m[1], new El('div', this.ownerDocument));
      }
    }
  }
  get innerText() { return `${this._text}\n${this.children.map((c) => c.innerText).join('\n')}`.trim(); }
  appendChild(c) { c.parentNode = this; this.children.push(c); return c; }
  insertAdjacentHTML(_p, h) { const t = new El('div', this.ownerDocument); t.innerHTML = h; this.appendChild(t); }
  addEventListener(t, fn) { (this.listeners[t] ||= []).push(fn); }
  removeEventListener() {}
  remove() { if (this.parentNode) this.parentNode.children = this.parentNode.children.filter((c) => c !== this); }
  setAttribute(k, v) { this.attributes[k] = String(v); }
  getAttribute(k) { return this.attributes[k]; }
  querySelector() { return null; }
  querySelectorAll() { return []; }
  focus() {}
  click() { (this.listeners.click || []).forEach((fn) => fn({ target: this, preventDefault() {} })); }
}

function installDom() {
  const nativeFetch = globalThis.fetch.bind(globalThis);
  const document = {
    _ids: new Map(),
    createElement: (t) => new El(t, document),
    createTextNode: (t) => { const e = new El('#text', document); e.textContent = t; return e; },
    getElementById(id) { if (!document._ids.has(id)) document._ids.set(id, new El('div', document)); return document._ids.get(id); },
    querySelector() { return null; },
    querySelectorAll() { return []; },
    addEventListener() {},
    title: '',
  };
  document.body = new El('body', document);
  const app = new El('div', document); app.id = 'app'; document._ids.set('app', app);
  const store = new Map();
  const win = {
    location: { hash: '#/', href: `${BASE}/#/`, replace(h) { win.location.hash = String(h).replace(/^#?/, '#'); }, reload() {} },
    navigator: { userAgent: 'link-check' },
    localStorage: { getItem: (k) => (store.has(k) ? store.get(k) : null), setItem: (k, v) => store.set(k, String(v)), removeItem: (k) => store.delete(k) },
    sessionStorage: { getItem: () => null, setItem() {}, removeItem() {} },
    addEventListener() {}, removeEventListener() {}, scrollTo() {},
    history: { length: 2, back() {}, pushState() {}, replaceState() {} },
    setTimeout, clearTimeout, setInterval, clearInterval,
    fetch: (input, init) => {
      const url = typeof input === 'string' ? input : input.url;
      return nativeFetch(url.startsWith('http') ? url : `${BASE}${url}`, init);
    },
    document, console,
  };
  win.window = win;
  globalThis.window = win;
  globalThis.document = document;
  globalThis.location = win.location;
  globalThis.localStorage = win.localStorage;
  globalThis.sessionStorage = win.sessionStorage;
  globalThis.fetch = win.fetch;
  Object.defineProperty(globalThis, 'navigator', { value: win.navigator, configurable: true, writable: true });
  globalThis.history = win.history;
  globalThis.addEventListener = win.addEventListener;
  return { document, win };
}

const sleep = (ms) => new Promise((r) => setTimeout(r, ms));

async function main() {
  const health = await fetch(`${BASE}/api/health`).then((r) => r.json()).catch(() => null);
  if (!health?.data) {
    console.error(`后端未启动：${BASE}（请先 npm start）`);
    process.exit(1);
  }
  const demo = await fetch(`${BASE}/api/trace/demo`).then((r) => r.json()).then((j) => j.data).catch(() => null);

  const pages = [
    '#/', '#/shop', '#/product/CY-OIL-100', '#/brand', '#/guide', '#/trace',
    '#/trace?code=' + (demo?.traceCode || 'CY26010115010001'),
    '#/trace?batch=CHY-20260115-01',
    '#/ai', '#/login', '#/me', '#/cart', '#/address', '#/coupons', '#/orders',
  ];

  const links = new Map(); // url -> Set(pages)
  const add = (url, from) => {
    if (!url) return;
    let u = String(url).trim();
    if (!u || u.startsWith('javascript:') || u.startsWith('mailto:') || u === '#') return;
    // hash 路由内部跳转不需要 HTTP 请求
    if (u.startsWith('#')) return;
    // 卡片里的 /#/xxx 是前端路由，转成 hash 页面
    if (u.startsWith('/#')) { u = u.slice(1); }
    if (u.startsWith('/')) {
      if (!links.has(u)) links.set(u, new Set());
      links.get(u).add(from);
    }
  };

  for (const p of pages) {
    const { document, win } = installDom();
    win.location.hash = p;
    const errors = [];
    const orig = console.error;
    console.error = (...a) => errors.push(a.map(String).join(' '));
    try {
      await import(`${pathToFileURL(path.join(FRONTEND, 'scripts', 'app.js')).href}?link=${encodeURIComponent(p)}${Date.now()}`);
      await sleep(650);
    } catch (e) {
      errors.push(`启动失败: ${e.message}`);
    } finally {
      console.error = orig;
    }
    const html = document.getElementById('app').innerHTML;
    for (const m of html.matchAll(/(?:href|src)="([^"]+)"/g)) add(m[1], p);
    // 聊天/推荐里的卡片 url 字段
    for (const m of html.matchAll(/url: '([^']+)'/g)) add(m[1], p);
    if (errors.length) console.log(`⚠️  ${p} 渲染时有错误：${errors[0].slice(0, 120)}`);
  }

  // 管理后台里的链接也一起查
  const adminHtml = await fetch(`${BASE}/admin.html`).then((r) => r.text());
  for (const m of adminHtml.matchAll(/(?:href|src)="([^"]+)"/g)) add(m[1], 'admin.html');
  const adminJs = await fetch(`${BASE}/admin/admin.js`).then((r) => r.text());
  for (const m of adminJs.matchAll(/(?:href|src)="([^"]+)"/g)) add(m[1], 'admin.js');

  console.log(`\n=== 全站链接巡检：共发现 ${links.size} 个资源/接口地址 ===\n`);

  let bad = 0;
  const hashRoutes = new Set();
  for (const [url, from] of [...links.entries()].sort()) {
    if (url.startsWith('#')) { hashRoutes.add(url); continue; }
    let res;
    try {
      res = await fetch(`${BASE}${url}`, { redirect: 'manual' });
    } catch (e) {
      console.log(`❌ ${url}  (来自 ${[...from].join(', ')})  ${e.message}`);
      bad += 1;
      continue;
    }
    const ok = (res.status >= 200 && res.status < 400);
    if (!ok) {
      bad += 1;
      console.log(`❌ ${res.status}  ${url}  (来自 ${[...from].join(', ')})`);
    }
  }

  console.log(`\n结果：${links.size - bad} 个地址可访问 / ${bad} 个失效`);
  return bad;
}

const bad = await main();
process.exit(bad ? 1 : 0);
