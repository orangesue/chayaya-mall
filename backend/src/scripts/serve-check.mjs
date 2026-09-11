/**
 * 静态托管 + 应用启动 自检
 * 用法: 先 npm start，再 node src/scripts/serve-check.mjs
 *
 * 为什么需要它：之前的 ui-check 直接调用视图模块，绕过了「浏览器加载哪个 index.html」和
 * 「模块脚本能否执行」这两步，结果一个占位页把应用挡住了却没被发现。
 * 本脚本按浏览器的真实路径验证：
 *   1) GET / 返回的是前端应用入口（含 module 脚本与样式表）
 *   2) 入口引用的每个资源都能 200
 *   3) 修改 location.hash 后，应用真的渲染出内容，而不是停在骨架屏
 */
import path from 'node:path';
import { pathToFileURL } from 'node:url';

const BASE = process.env.UI_BASE || 'http://127.0.0.1:8788';
const FRONTEND = path.resolve(process.cwd(), '..', 'frontend');

let pass = 0;
let fail = 0;
const check = (ok, name, detail = '') => {
  if (ok) { pass += 1; console.log(`✅ ${name}${detail ? ` — ${detail}` : ''}`); }
  else { fail += 1; console.log(`❌ ${name}${detail ? ` — ${detail}` : ''}`); }
};

/* ---------------- 最小 DOM（与 ui-check 同款，够用即可） ---------------- */
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
    this._text = stripTags(this._html);
    if (this.ownerDocument) {
      for (const m of this._html.matchAll(/id="([^"]+)"/g)) {
        if (!this.ownerDocument._ids.has(m[1])) this.ownerDocument._ids.set(m[1], new El('div', this.ownerDocument));
      }
    }
  }
  get innerText() { return `${this._text}\n${this.children.map((c) => c.innerText).join('\n')}`.trim(); }
  appendChild(c) { c.parentNode = this; this.children.push(c); return c; }
  insertAdjacentHTML(_p, html) { const t = new El('div', this.ownerDocument); t.innerHTML = html; this.appendChild(t); }
  addEventListener(type, fn) { (this.listeners[type] ||= []).push(fn); }
  removeEventListener() {}
  remove() { if (this.parentNode) this.parentNode.children = this.parentNode.children.filter((c) => c !== this); }
  setAttribute(k, v) { this.attributes[k] = String(v); }
  getAttribute(k) { return this.attributes[k]; }
  querySelector() { return null; }
  querySelectorAll() { return []; }
  focus() {}
  click() { (this.listeners.click || []).forEach((fn) => fn({ target: this, preventDefault() {} })); }
}

function stripTags(html) {
  return String(html)
    .replace(/<script[\s\S]*?<\/script>/gi, '')
    .replace(/<style[\s\S]*?<\/style>/gi, '')
    .replace(/<textarea[^>]*placeholder="([^"]*)"[^>]*>[\s\S]*?<\/textarea>/gi, '\n$1\n')
    .replace(/<input[^>]*placeholder="([^"]*)"[^>]*\/?>/gi, '\n$1\n')
    .replace(/<br\s*\/?>/gi, '\n')
    .replace(/<\/(p|div|li|tr|h\d)>/gi, '\n')
    .replace(/<[^>]+>/g, '')
    .replace(/&nbsp;/g, ' ').replace(/&amp;/g, '&').replace(/&lt;/g, '<').replace(/&gt;/g, '>')
    .replace(/&quot;/g, '"').replace(/&#39;/g, "'")
    .replace(/\n{2,}/g, '\n').trim();
}

const sleep = (ms) => new Promise((r) => setTimeout(r, ms));

async function main() {
  console.log(`\n=== 静态托管与应用启动自检 @ ${BASE} ===\n`);

  /* ---------- 1) 根路径必须是应用入口 ---------- */
  const res = await fetch(`${BASE}/`);
  const html = await res.text();
  check(res.status === 200, 'GET / 返回 200', `Content-Type ${res.headers.get('content-type')}`);
  check(html.includes('type="module"'), '根路径返回的是应用入口（含 module 脚本）');
  check(/<div id="app">/.test(html), '入口包含挂载点 #app');
  check(!html.includes('前端资源正在加载'), '根路径没有被占位页挡住');
  check(/<link[^>]+stylesheet/.test(html), '入口引用了样式表');

  /* ---------- 2) 入口引用的资源必须都可访问 ---------- */
  const assets = [
    ...html.matchAll(/<script[^>]+src="([^"]+)"/g),
    ...html.matchAll(/<link[^>]+href="([^"]+)"/g),
  ].map((m) => m[1]).filter((u) => u.startsWith('/'));
  for (const url of assets) {
    const r = await fetch(`${BASE}${url}`);
    check(r.ok, `入口资源可访问 ${url}`, `${r.status}`);
  }

  /* ---------- 3) 前端模块依赖链是否都返回 JS ---------- */
  const modules = [
    '/scripts/app.js', '/scripts/router.js', '/scripts/store.js',
    '/scripts/views/home.js', '/scripts/views/order.js', '/scripts/views/trace.js',
    '/scripts/views/ai.js', '/scripts/views/me.js',
  ];
  for (const m of modules) {
    const r = await fetch(`${BASE}${m}`);
    const ct = r.headers.get('content-type') || '';
    check(r.ok && ct.includes('javascript'), `模块 ${m}`, `${r.status} ${ct.split(';')[0]}`);
  }

  /* ---------- 4) 真的把应用启动起来，确认不是骨架屏 ---------- */
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
  const appEl = new El('div', document); appEl.id = 'app'; document._ids.set('app', appEl);
  // 模拟浏览器：把入口 HTML 的内容放进 #app 之外的 body（这里只需 #app 存在即可）
  appEl.innerHTML = html.match(/<div id="app">([\s\S]*?)<\/div>/)?.[1] ?? '';

  const store = new Map();
  const win = {
    location: { hash: '#/', href: `${BASE}/#/`, replace(h) { win.location.hash = String(h).replace(/^#?/, '#'); }, reload() {} },
    navigator: { userAgent: 'serve-check' },
    localStorage: { getItem: (k) => (store.has(k) ? store.get(k) : null), setItem: (k, v) => store.set(k, String(v)), removeItem: (k) => store.delete(k) },
    sessionStorage: { getItem: () => null, setItem() {}, removeItem() {} },
    addEventListener() {}, removeEventListener() {}, scrollTo() {},
    history: { length: 2, back() {}, pushState() {}, replaceState() {} },
    setTimeout, clearTimeout, setInterval, clearInterval,
    fetch: (input, init) => {
      const url = typeof input === 'string' ? input : input.url;
      return nativeFetch(url.startsWith('http') ? url : `${BASE}${url}`, init);
    },
    document,
    console,
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

  const errors = [];
  const origError = console.error;
  console.error = (...a) => { errors.push(a.map(String).join(' ')); };
  try {
    await import(`${pathToFileURL(path.join(FRONTEND, 'scripts', 'app.js')).href}?serve=${Date.now()}`);
    await sleep(900);
  } catch (e) {
    errors.push(`启动异常: ${e.message}`);
  } finally {
    console.error = origError;
  }

  const rendered = stripTags(document.getElementById('app').innerHTML);
  check(rendered.length > 400, '应用启动后渲染出内容', `${rendered.length} 字`);
  check(!rendered.includes('前端资源正在加载'), '页面不再停留在加载提示');
  check(rendered.includes('源头自营') && rendered.includes('热销单品'), '首页关键内容已渲染');
  check(errors.length === 0, '启动过程无运行时错误', errors.slice(0, 2).join(' | '));

  console.log(`\n静态托管与启动自检：${pass} 通过 / ${fail} 失败`);
  process.exit(fail ? 1 : 0);
}

main().catch((e) => { console.error('自检异常：', e); process.exit(1); });
