/**
 * 茶芽芽小程序 —— 全局逻辑
 * 后端 API 与 web 端完全一致（Node.js + SQLite/MySQL + Redis）。
 * 部署到阿里云 ECS 后，把 BASE_URL 改成 https://你的域名 并在小程序后台配置 request 合法域名。
 */
const BASE_URL = 'http://127.0.0.1:8788';

App({
  globalData: {
    baseUrl: BASE_URL,
    token: '',
    user: null,
    cartCount: 0,
    sessionId: '',
    demoCode: '123456',
  },

  onLaunch() {
    this.globalData.token = wx.getStorageSync('cy_token') || '';
    this.globalData.sessionId = wx.getStorageSync('cy_session') || `wx_${Date.now().toString(36)}`;
    wx.setStorageSync('cy_session', this.globalData.sessionId);
    if (this.globalData.token) {
      this.request('/api/me', { silent: true }).then((d) => {
        this.globalData.user = d.user;
        this.globalData.cartCount = d.counts?.cart ?? 0;
        this.notify();
      }).catch(() => this.logout());
    }
  },

  /** 统一请求封装：自动带 token、统一错误提示、401 自动清理登录态 */
  request(path, { method = 'GET', data, silent = false } = {}) {
    return new Promise((resolve, reject) => {
      wx.request({
        url: this.globalData.baseUrl + path,
        method,
        data,
        header: {
          'Content-Type': 'application/json',
          ...(this.globalData.token ? { Authorization: `Bearer ${this.globalData.token}` } : {}),
        },
        success: (res) => {
          const body = res.data || {};
          if (res.statusCode === 401) {
            this.logout();
          }
          if (body.code === 0) resolve(body.data);
          else {
            if (!silent) wx.showToast({ title: body.message || '请求失败', icon: 'none' });
            reject(new Error(body.message || '请求失败'));
          }
        },
        fail: (err) => {
          if (!silent) wx.showToast({ title: '网络异常，请检查后端服务', icon: 'none' });
          reject(err);
        },
      });
    });
  },

  setToken(token) {
    this.globalData.token = token || '';
    if (token) wx.setStorageSync('cy_token', token);
    else wx.removeStorageSync('cy_token');
    this.notify();
  },

  logout() {
    this.setToken('');
    this.globalData.user = null;
    this.globalData.cartCount = 0;
    this.notify();
  },

  async refreshUser() {
    if (!this.globalData.token) return null;
    try {
      const d = await this.request('/api/me', { silent: true });
      this.globalData.user = d.user;
      this.globalData.cartCount = d.counts?.cart ?? 0;
      this.notify();
      return d;
    } catch {
      return null;
    }
  },

  async refreshCartCount() {
    if (!this.globalData.token) return 0;
    try {
      const d = await this.request('/api/cart', { silent: true });
      this.globalData.cartCount = d.totalQty ?? 0;
      this.notify();
      return this.globalData.cartCount;
    } catch {
      return this.globalData.cartCount;
    }
  },

  /** 简单事件订阅，用于跨页面刷新购物车角标 */
  watchers: [],
  watch(fn) { this.watchers.push(fn); },
  unwatch(fn) { this.watchers = this.watchers.filter((f) => f !== fn); },
  notify() { this.watchers.forEach((f) => { try { f(this.globalData); } catch (e) { /* ignore */ } }); },

  /** 微信一键登录（真机自动走 code2session；未配置 AppSecret 时后端返回 mock 模式） */
  wechatLogin() {
    return new Promise((resolve, reject) => {
      wx.login({
        success: async ({ code }) => {
          try {
            const d = await this.request('/api/auth/wechat', { method: 'POST', data: { code } });
            this.setToken(d.token);
            this.globalData.user = d.user;
            this.notify();
            resolve(d);
          } catch (e) { reject(e); }
        },
        fail: reject,
      });
    });
  },

  requireLogin() {
    if (this.globalData.token) return true;
    wx.navigateTo({ url: '/pages/login/login' });
    return false;
  },
});
