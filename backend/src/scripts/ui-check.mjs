/**
 * 前端渲染验证（无需浏览器，在 Node 中模拟 DOM 真实执行前端代码）
 * 用法: 先 npm start，然后 node src/scripts/ui-check.mjs
 *
 * 为什么这样做：本机沙箱禁止 Node 拉起带管道的子进程（spawn EPERM），无法启动 Chrome；
 * 因此这里实现一个最小 DOM，把前端 router / store / views 真实加载并渲染，
 * 断言每页渲染出的文本包含预期关键词，能捕获数据绑定、模板拼接与路由的真实运行时错误。
 * 未覆盖的部分（CSS 视觉、浏览器事件交互）会在交付说明中明确标注。
 */
import fs from 'node:fs';
import path from 'node:path';
import { pathToFileURL } from 'node:url';

const BASE = process.env.UI_BASE || 'http://127.0.0.1:8788';
const FRONTEND = path.resolve(process.cwd(), '..', 'frontend');

const PAGES = [
  { name: '首页', hash: '#/', expect: ['源头自营', '热销单品', '品牌故事', '消费即助农'] },
  { name: '产品中心', hash: '#/shop', expect: ['产品中心', '婴儿山茶抚触油', '加入购物车'] },
  { name: '商品详情', hash: '#/product/CY-OIL-100', expect: ['六大核心卖点', '防回流婴儿专用油头', '价格对比', 'SGS 检测报告'] },
  { name: '品牌故事', hash: '#/brand', expect: ['山林里的祝福', '六大差异化优势', '助农闭环', '合规与品控'] },
  { name: '抚触教程', hash: '#/guide', expect: ['抚触', '用量参考', '抚触禁忌'] },
  { name: '溯源频道', hash: '#/trace', expect: ['一物一码', '防伪与存证技术', '在售批次', '打印瓶底二维码'] },
  { name: '溯源结果(示例码)', hash: '#/trace?code=__DEMO__', expect: ['正品验证通过', '全流程时间轴', '防伪与存证校验', '农户'] },
  { name: 'AI客服', hash: '#/ai', expect: ['重要提示', '护肤客服，不是医生', '描述宝宝的情况', 'AI问症'] },
  { name: '登录页', hash: '#/login', expect: ['欢迎来到茶芽芽', '获取验证码', '微信一键登录'] },
  { name: '我的(未登录)', hash: '#/me', expect: ['会员', '登录'] },
  { name: '购物车(未登录)', hash: '#/cart', expect: ['登录'] },
];

/* ============================================================
 * 最小 DOM / 浏览器环境模拟
 * ============================================================ */
class El {
  constructor(tag = 'div', doc = null) {
    this.tagName = String(tag).toUpperCase();
    this.ownerDocument = doc;
    this.children = [];
    this.parentNode = null;
    this.attributes = {};
    this.dataset = {};
    this.style = {};
    this._className = '';
    this._text = '';
    this._html = '';
    this.listeners = {};
    this.scrollTop = 0;
    this.scrollHeight = 100;
    this.value = '';
    this.disabled = false;
    this.checked = false;
  }

  set className(v) { this._className = String(v ?? ''); }
  get className() { return this._className; }
  set id(v) { this.attributes.id = String(v); }
  get id() { return this.attributes.id || ''; }
  set src(v) { this.attributes.src = v; }
  set href(v) { this.attributes.href = v; }
  get textContent() { return this._text; }
  set textContent(v) { this._text = String(v ?? ''); this._html = ''; this.children = []; }
  get innerHTML() { return this._html; }

  set innerHTML(v) {
    this._html = String(v ?? '');
    this._text = stripTags(this._html);
    // 解析出 id，供 getElementById 使用
    if (this.ownerDocument) {
      for (const m of this._html.matchAll(/id="([^"]+)"/g)) {
        this.ownerDocument._ids.set(m[1], new El('div', this.ownerDocument));
      }
    }
  }

  get innerText() {
    const own = this._text || '';
    const kids = this.children.map((c) => c.innerText).join('\n');
    return `${own}\n${kids}`.trim();
  }

  appendChild(child) {
    child.parentNode = this;
    this.children.push(child);
    return child;
  }

  insertAdjacentHTML(_pos, html) {
    const tmp = new El('div', this.ownerDocument);
    tmp.innerHTML = html;
    this.appendChild(tmp);
  }

  addEventListener(type, fn) {
    (this.listeners[type] ||= []).push(fn);
  }

  removeEventListener() { /* 简化实现 */ }
  remove() { if (this.parentNode) this.parentNode.children = this.parentNode.children.filter((c) => c !== this); }
  setAttribute(k, v) { this.attributes[k] = String(v); }
  getAttribute(k) { return this.attributes[k]; }
  querySelector() { return null; }
  querySelectorAll() { return []; }
  focus() { /* noop */ }
  click() { (this.listeners.click || []).forEach((fn) => fn({ target: this, preventDefault() {} })); }
  get firstChild() { return this.children[0] || null; }
  get classList() {
    const self = this;
    return {
      add: (c) => { self._className = `${self._className} ${c}`.trim(); },
      remove: (c) => { self._className = self._className.split(/\s+/).filter((x) => x !== c).join(' '); },
      contains: (c) => self._className.split(/\s+/).includes(c),
    };
  }
}

function stripTags(html) {
  return String(html)
    .replace(/<script[\s\S]*?<\/script>/gi, '')
    .replace(/<style[\s\S]*?<\/style>/gi, '')
    // 表单占位文案对用户可见，先抽出来再删标签
    .replace(/<textarea[^>]*placeholder="([^"]*)"[^>]*>[\s\S]*?<\/textarea>/gi, '\n$1\n')
    .replace(/<input[^>]*placeholder="([^"]*)"[^>]*\/?>/gi, '\n$1\n')
    .replace(/<br\s*\/?>/gi, '\n')
    .replace(/<\/(p|div|li|tr|h\d)>/gi, '\n')
    .replace(/<[^>]+>/g, '')
    .replace(/&nbsp;/g, ' ')
    .replace(/&amp;/g, '&')
    .replace(/&lt;/g, '<')
    .replace(/&gt;/g, '>')
    .replace(/&quot;/g, '"')
    .replace(/&#39;/g, "'")
    .replace(/\n{2,}/g, '\n')
    .trim();
}

function installDom() {
  // 必须在覆盖 globalThis.fetch 之前抓住原生实现，否则包装函数会递归调用自己
  const nativeFetch = globalThis.fetch.bind(globalThis);
  const document = {
    _ids: new Map(),
    createElement: (tag) => new El(tag, document),
    createTextNode: (t) => { const e = new El('#text', document); e.textContent = t; return e; },
    getElementById(id) {
      if (!document._ids.has(id)) document._ids.set(id, new El('div', document));
      return document._ids.get(id);
    },
    querySelector() { return null; },
    querySelectorAll() { return []; },
    addEventListener() { /* noop */ },
    title: '',
  };
  document.body = new El('body', document);
  const app = new El('div', document);
  app.id = 'app';
  document._ids.set('app', app);

  const store = new Map();
  const localStorage = {
    getItem: (k) => (store.has(k) ? store.get(k) : null),
    setItem: (k, v) => store.set(k, String(v)),
    removeItem: (k) => store.delete(k),
  };

  const win = {
    location: { hash: '#/', href: `${BASE}/#/`, replace(h) { win.location.hash = String(h).replace(/^#?/, '#'); }, reload() {} },
    navigator: { userAgent: 'node-ui-check' },
    localStorage,
    sessionStorage: { getItem: () => null, setItem() {}, removeItem() {} },
    addEventListener(type, fn) { (win._l ||= {}); (win._l[type] ||= []).push(fn); },
    removeEventListener() {},
    scrollTo() {},
    history: { length: 2, back() {}, pushState() {}, replaceState() {} },
    setTimeout,
    clearTimeout,
    setInterval,
    clearInterval,
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
  globalThis.localStorage = localStorage;
  globalThis.sessionStorage = win.sessionStorage;
  globalThis.fetch = win.fetch;
  // Node 24 的 globalThis.navigator 是只读 getter，用 defineProperty 覆盖
  try {
    Object.defineProperty(globalThis, 'navigator', { value: win.navigator, configurable: true, writable: true });
  } catch { /* 忽略：前端未使用 navigator 关键能力 */ }
  globalThis.history = win.history;
  globalThis.addEventListener = win.addEventListener;
  return { document, win, app };
}

/* ============================================================
 * 执行
 * ============================================================ */
const sleep = (ms) => new Promise((r) => setTimeout(r, ms));

async function fetchDemoCode() {
  const res = await fetch(`${BASE}/api/trace/demo`);
  const json = await res.json();
  return json?.data?.traceCode;
}

async function main() {
  const health = await fetch(`${BASE}/api/health`).then((r) => r.json()).catch(() => null);
  if (!health?.data) {
    console.error(`后端未启动或不可访问：${BASE}（请先执行 npm start）`);
    process.exit(1);
  }
  const demoCode = await fetchDemoCode();
  const pages = PAGES.map((p) => ({ ...p, hash: p.hash.replace('__DEMO__', demoCode || 'CY26010115010001') }));

  let pass = 0;
  const failures = [];

  for (const p of pages) {
    const { document, app, win } = installDom();
    win.location.hash = p.hash;
    const errors = [];
    const origError = console.error;
    console.error = (...args) => { errors.push(args.map(String).join(' ')); };

    let text = '';
    try {
      const store = await import(pathToFileURL(path.join(FRONTEND, 'scripts', 'store.js')).href);
      void store;
      // 每个页面独立加载一次 app.js，保证路由表干净
      await import(`${pathToFileURL(path.join(FRONTEND, 'scripts', 'app.js')).href}?page=${encodeURIComponent(p.name)}`);
      await sleep(700);
      text = `${document.getElementById('app').innerHTML ? stripTags(document.getElementById('app').innerHTML) : ''} ${app.innerText}`;
      // 页面底部内容在子节点里，统一从 innerHTML 提取文本更完整
      text = stripTags(document.getElementById('app').innerHTML) || app.innerText;
    } catch (e) {
      errors.push(`异常: ${e.message}`);
    } finally {
      console.error = origError;
    }

    const missing = p.expect.filter((k) => !text.includes(k));
    const ok = missing.length === 0 && errors.length === 0;
    if (ok) pass += 1;
    else failures.push({ page: p.name, missing, errors: errors.slice(0, 3) });
    console.log(`${ok ? '✅' : '❌'} ${p.name.padEnd(14)} 渲染文本 ${String(text.length).padStart(6)} 字${missing.length ? `  缺失：${missing.join('、')}` : ''}${errors.length ? `  运行时错误：${errors[0]}` : ''}`);
  }

  console.log(`\n前端渲染验证：${pass}/${pages.length} 页面通过（Node 模拟 DOM 真实执行前端模块）`);
  if (failures.length) {
    console.log('\n失败明细：');
    failures.forEach((f) => console.log(` - ${f.page}: 缺失=${JSON.stringify(f.missing)} 错误=${JSON.stringify(f.errors)}`));
  }

  // 调试模式：把失败页面的渲染文本打印出来，便于定位
  if (process.env.UI_DEBUG) {
    for (const f of failures) {
      const { document, win } = installDom();
      win.location.hash = pages.find((p) => p.name === f.page).hash;
      await import(`${pathToFileURL(path.join(FRONTEND, 'scripts', 'app.js')).href}?debug=${encodeURIComponent(f.page)}`);
      await sleep(700);
      console.log(`\n===== ${f.page} 渲染文本 =====\n${stripTags(document.getElementById('app').innerHTML)}`);
    }
  }

  process.exit(failures.length ? 1 : 0);
}

main();
