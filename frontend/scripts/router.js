/** Hash 路由：路由表 → 视图渲染 → 滚动/标题/埋点统一处理 */
import { state, subscribe, toast, track } from './store.js';

const routes = [];
let currentCleanup = null;
let renderToken = 0;

/**
 * 注册路由
 * @param {string} pattern 形如 '/product/:code'
 * @param {(ctx:{params:Record<string,string>, query:URLSearchParams, path:string}) => Promise<{html:string, title?:string, back?:boolean, tab?:string, mount?:Function, cleanup?:Function}>} handler
 */
export function route(pattern, handler) {
  const keys = [];
  const regex = new RegExp(
    '^' + pattern.replace(/\/:([A-Za-z_][A-Za-z0-9_]*)/g, (_, k) => { keys.push(k); return '/([^/]+)'; }) + '/?$',
  );
  routes.push({ pattern, regex, keys, handler });
}

export function navigate(path, { replace = false } = {}) {
  const target = path.startsWith('#') ? path : `#${path}`;
  if (replace) location.replace(target);
  else location.hash = target;
}

export function back() {
  if (history.length > 1) history.back();
  else navigate('/');
}

function parseHash() {
  const raw = location.hash.replace(/^#/, '') || '/';
  const [path, qs] = raw.split('?');
  return { path: path || '/', query: new URLSearchParams(qs || '') };
}

export async function render() {
  const { path, query } = parseHash();
  const token = ++renderToken;

  let matched = null;
  let params = {};
  for (const r of routes) {
    const m = path.match(r.regex);
    if (m) {
      matched = r;
      r.keys.forEach((k, i) => { params[k] = decodeURIComponent(m[i + 1]); });
      break;
    }
  }

  if (currentCleanup) { try { currentCleanup(); } catch { /* ignore */ } currentCleanup = null; }

  const app = document.getElementById('app');
  if (!matched) {
    app.innerHTML = shell({
      title: '页面不存在',
      back: true,
      body: `<div class="empty"><div class="ico">🧭</div><p>找不到这个页面</p>
        <a class="btn ghost sm mt10" href="#/">回到首页</a></div>`,
    });
    return;
  }

  // 骨架屏
  app.innerHTML = shell({ title: '茶芽芽', back: false, body: skeleton() });

  let view;
  try {
    view = await matched.handler({ params, query, path });
  } catch (e) {
    console.error('[route] 渲染失败', e && e.stack ? e.stack : e);
    app.innerHTML = shell({
      title: '出错了', back: true,
      body: `<div class="empty"><div class="ico">😥</div><p>${e.message || '页面加载失败'}</p>
        <button class="btn ghost sm mt10" onclick="location.reload()">重新加载</button></div>`,
    });
    return;
  }
  if (token !== renderToken) return; // 已有更新的导航，放弃本次渲染

  document.title = `${view.title || '茶芽芽'} · 茶芽芽商城`;
  app.innerHTML = shell({ title: view.title || '茶芽芽', back: view.back !== false, body: view.html, tab: view.tab });
  if (typeof view.mount === 'function') {
    try { view.mount(); } catch (e) { console.error('[route] mount 失败', e); }
  }
  if (typeof view.cleanup === 'function') currentCleanup = view.cleanup;

  // 记录页面浏览（销售漏斗起点）
  track('view', path);

  if (!view.keepScroll) window.scrollTo({ top: 0 });
}

/** 统一外壳：导航栏 + 底部 tabbar */
export function shell({ title, back: showBack = false, body, tab }) {
  const tabs = [
    { key: 'home', label: '首页', icon: '🏠', href: '#/' },
    { key: 'shop', label: '产品中心', icon: '🧴', href: '#/shop' },
    { key: 'trace', label: '溯源', icon: '🔍', href: '#/trace' },
    { key: 'ai', label: 'AI问症', icon: '💬', href: '#/ai' },
    { key: 'me', label: '我的', icon: '👤', href: '#/me' },
  ];
  return `
    <header class="navbar">
      ${showBack
        ? `<button class="nav-btn" onclick="history.length>1?history.back():location.hash='#/'">‹</button>`
        : `<span class="nav-btn" style="opacity:.35">🌱</span>`}
      <div class="nav-title">${title}</div>
      <div class="nav-right">
        <button class="nav-btn" onclick="location.hash='#/cart'">🛒${
          state.cartCount > 0 ? `<span class="badge" style="position:absolute;transform:translate(11px,-9px)">${state.cartCount > 99 ? '99+' : state.cartCount}</span>` : ''
        }</button>
      </div>
    </header>
    ${body}
    <nav class="tabbar">
      ${tabs.map((t) => `
        <a href="${t.href}" class="${tab === t.key ? 'on' : ''}">
          <span class="ico">${t.icon}</span><span>${t.label}</span>
        </a>`).join('')}
    </nav>
    ${state.toast ? `<div class="toast">${state.toast}</div>` : ''}
  `;
}

const skeleton = () => `
  <div class="page-pad" style="padding-top:14px">
    <div class="skeleton" style="height:120px;margin-bottom:12px"></div>
    <div class="skeleton" style="height:16px;width:60%;margin-bottom:10px"></div>
    <div class="skeleton" style="height:80px;margin-bottom:10px"></div>
    <div class="skeleton" style="height:80px"></div>
  </div>`;

export function startRouter() {
  window.addEventListener('hashchange', render);
  subscribe(() => {
    // 购物车数量等状态变化时，仅更新底部徽标，避免整页重渲染
    const badgeHost = document.querySelector('.navbar .nav-right .nav-btn');
    if (!badgeHost) return;
    const badge = badgeHost.querySelector('.badge');
    if (state.cartCount > 0) {
      if (badge) badge.textContent = state.cartCount > 99 ? '99+' : state.cartCount;
      else badgeHost.insertAdjacentHTML('beforeend', `<span class="badge" style="position:absolute;transform:translate(11px,-9px)">${state.cartCount > 99 ? '99+' : state.cartCount}</span>`);
    } else if (badge) badge.remove();
    // toast
    const old = document.querySelector('.toast');
    if (state.toast) {
      if (old) old.textContent = state.toast;
      else document.getElementById('app').insertAdjacentHTML('beforeend', `<div class="toast">${state.toast}</div>`);
    } else if (old) old.remove();
  });
  render();
}

export { toast };
export default { route, navigate, back, render, startRouter, shell, toast };
