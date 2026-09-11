/** 统一 API 客户端 + 全局状态（无构建步骤，直接由浏览器加载 ES Module） */

const TOKEN_KEY = 'cy_token';
const SESSION_KEY = 'cy_session';

const listeners = new Set();

export const state = {
  token: localStorage.getItem(TOKEN_KEY) || '',
  user: null,
  cartCount: 0,
  sessionId: localStorage.getItem(SESSION_KEY) || '',
  toast: null,
  page: { title: '', back: false },
};

export function subscribe(fn) {
  listeners.add(fn);
  return () => listeners.delete(fn);
}
function emit() { listeners.forEach((fn) => fn(state)); }

export function setToken(token) {
  state.token = token || '';
  if (token) localStorage.setItem(TOKEN_KEY, token);
  else localStorage.removeItem(TOKEN_KEY);
  emit();
}

export function setSession(sessionId) {
  state.sessionId = sessionId || '';
  if (sessionId) localStorage.setItem(SESSION_KEY, sessionId);
  emit();
}

export function toast(message, ms = 1900) {
  state.toast = message;
  emit();
  clearTimeout(toast._t);
  toast._t = setTimeout(() => { state.toast = null; emit(); }, ms);
}

export async function api(path, { method = 'GET', body, silent = false } = {}) {
  const headers = { 'Content-Type': 'application/json' };
  if (state.token) headers.Authorization = `Bearer ${state.token}`;
  let res;
  try {
    res = await fetch(path, { method, headers, ...(body !== undefined ? { body: JSON.stringify(body) } : {}) });
  } catch (e) {
    if (!silent) toast('网络异常，请检查服务是否已启动');
    throw e;
  }
  let json = {};
  try { json = await res.json(); } catch { /* 空响应 */ }
  if (res.status === 401) {
    setToken('');
    state.user = null;
    emit();
  }
  if (!res.ok || json.code !== 0) {
    const msg = json.message || `请求失败（${res.status}）`;
    if (!silent) toast(msg);
    const err = new Error(msg);
    err.payload = json;
    err.status = res.status;
    throw err;
  }
  return json.data;
}

export const get = (p, opts) => api(p, { ...opts, method: 'GET' });
export const post = (p, body, opts) => api(p, { ...opts, method: 'POST', body });
export const patch = (p, body, opts) => api(p, { ...opts, method: 'PATCH', body });
export const del = (p, opts) => api(p, { ...opts, method: 'DELETE' });

/* ---------------- 会话与用户 ---------------- */

export async function refreshUser() {
  if (!state.token) { state.user = null; emit(); return null; }
  try {
    const data = await get('/api/me', { silent: true });
    state.user = data.user;
    state.cartCount = data.counts?.cart ?? 0;
    emit();
    return data;
  } catch {
    state.user = null;
    emit();
    return null;
  }
}

export async function refreshCartCount() {
  if (!state.token) { state.cartCount = 0; emit(); return 0; }
  try {
    const data = await get('/api/cart', { silent: true });
    state.cartCount = data.totalQty ?? 0;
    emit();
    return state.cartCount;
  } catch {
    return state.cartCount;
  }
}

export async function loginByCode(phone, code, nickname) {
  const data = await post('/api/auth/login-code', { phone, code, nickname });
  setToken(data.token);
  state.user = data.user;
  emit();
  return data;
}

export async function sendCode(phone) {
  return post('/api/auth/send-code', { phone });
}

export async function wechatLogin() {
  // 微信小程序环境：wx.login 拿 code；浏览器环境：使用演示 code
  if (window.wx && typeof window.wx.login === 'function') {
    return new Promise((resolve, reject) => {
      window.wx.login({
        success: async ({ code }) => {
          try {
            const data = await post('/api/auth/wechat', { code });
            setToken(data.token);
            state.user = data.user;
            emit();
            resolve(data);
          } catch (e) { reject(e); }
        },
        fail: reject,
      });
    });
  }
  const data = await post('/api/auth/wechat', { code: `demo_code_${Date.now()}` });
  setToken(data.token);
  state.user = data.user;
  emit();
  return data;
}

export function logout() {
  setToken('');
  state.user = null;
  state.cartCount = 0;
  emit();
}

/* ---------------- 埋点（对应项目书"用户行为数据、销售漏斗"） ---------------- */

export function track(type, target, payload) {
  post('/api/events', {
    type, target, payload,
    sessionId: state.sessionId,
    userId: state.user?.id,
  }, { silent: true }).catch(() => {});
}

/* ---------------- 小工具 ---------------- */

export const yuan = (cent) => `¥${((cent ?? 0) / 100).toFixed(2)}`;
export const yuanShort = (cent) => {
  const v = (cent ?? 0) / 100;
  return Number.isInteger(v) ? `¥${v}` : `¥${v.toFixed(2)}`;
};

export function mdLite(text) {
  if (!text) return '';
  const esc = String(text)
    .replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;');
  return esc
    .replace(/\*\*(.+?)\*\*/g, '<span class="md-strong">$1</span>')
    .replace(/^_(\s*)(.+?)(\s*)_$/gm, '<span class="disclaimer">$2</span>')
    .replace(/^\s*[·•]\s?(.+)$/gm, '<li>$1</li>')
    .replace(/(<li>[\s\S]*?<\/li>)(?!\s*<li>)/g, '<ul>$1</ul>')
    .replace(/\n/g, '<br />')
    .replace(/<br \/><ul>/g, '<ul>')
    .replace(/<\/ul><br \/>/g, '</ul>');
}

export function formatTime(value) {
  if (!value) return '';
  return String(value).replace('T', ' ').slice(0, 16);
}

export default {
  state, subscribe, api, get, post, patch, del, toast, yuan, yuanShort, mdLite,
  refreshUser, refreshCartCount, loginByCode, sendCode, wechatLogin, logout, track, setToken, setSession,
};
