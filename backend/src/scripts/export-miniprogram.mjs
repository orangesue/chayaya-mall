/**
 * 导出微信小程序工程
 * 用法: node src/scripts/export-miniprogram.mjs
 *
 * 把 web 端已验证的功能导出为标准微信小程序工程（WXML/WXSS/JS），
 * 目录结构可直接用「微信开发者工具 → 导入项目」打开。
 * 说明：pages 由本脚本生成，保持与 web 端同一套后端 API（app.js 里配置 BASE_URL）。
 */
import fs from 'node:fs';
import path from 'node:path';

const OUT = path.resolve(process.cwd(), '..', 'miniprogram');
const TAB_ICONS = ['home', 'shop', 'trace', 'ai', 'me'];

function write(rel, content) {
  const file = path.join(OUT, rel);
  fs.mkdirSync(path.dirname(file), { recursive: true });
  fs.writeFileSync(file, content, 'utf8');
}

/* ---------------- 全局文件 ---------------- */
write('app.json', JSON.stringify({
  pages: [
    'pages/home/home',
    'pages/shop/shop',
    'pages/product/product',
    'pages/cart/cart',
    'pages/checkout/checkout',
    'pages/orders/orders',
    'pages/order-detail/order-detail',
    'pages/trace/trace',
    'pages/ai/ai',
    'pages/brand/brand',
    'pages/guide/guide',
    'pages/me/me',
    'pages/login/login',
  ],
  window: {
    backgroundTextStyle: 'light',
    navigationBarBackgroundColor: '#fdfaf1',
    navigationBarTitleText: '茶芽芽',
    navigationBarTextStyle: 'black',
    backgroundColor: '#eef2ee',
  },
  tabBar: {
    color: '#86948c',
    selectedColor: '#3f8a63',
    backgroundColor: '#ffffff',
    borderStyle: 'white',
    list: [
      { pagePath: 'pages/home/home', text: '首页' },
      { pagePath: 'pages/shop/shop', text: '产品中心' },
      { pagePath: 'pages/trace/trace', text: '溯源' },
      { pagePath: 'pages/ai/ai', text: 'AI问症' },
      { pagePath: 'pages/me/me', text: '我的' },
    ],
  },
  style: 'v2',
  sitemapLocation: 'sitemap.json',
  permission: {
    'scope.userLocation': { desc: '用于展示浒口村油茶林位置与溯源之旅' },
  },
}, null, 2));

write('sitemap.json', JSON.stringify({
  desc: '茶芽芽小程序页面索引配置',
  rules: [{ action: 'allow', page: '*' }],
}, null, 2));

write('project.config.json', JSON.stringify({
  description: '茶芽芽 · 婴儿山茶抚触油商城（浒口茶油助农先锋队 · 团队ID 16106641）',
  packOptions: { ignore: [] },
  setting: {
    urlCheck: false,
    es6: true,
    enhance: true,
    postcss: true,
    minified: false,
    newFeature: false,
    coverView: true,
    nodeModules: false,
    autoAudits: false,
    showShadowRootInWxmlPanel: true,
    scopeDataCheck: false,
    uglifyFileName: false,
    checkInvalidKey: true,
    checkSiteMap: true,
    uploadWithSourceMap: true,
    compileHotReLoad: true,
    lazyloadPlaceholderEnable: false,
    useMultiFrameRuntime: true,
    useApiHook: true,
    useApiHostProcess: true,
    babelSetting: { ignore: [], disablePlugins: [], outputPath: '' },
    enableEngineNative: false,
    useIsolateContext: true,
    userConfirmedBundleSwitch: false,
    packNpmManually: false,
    packNpmRelationList: [],
    minifyWXSS: true,
    disableUseStrict: false,
    minifyWXML: true,
    showES6CompileOption: false,
    useCompilerPlugins: ['sass'],
    ignoreUploadUnusedFiles: true,
  },
  compileType: 'miniprogram',
  libVersion: '3.5.5',
  appid: 'touristappid',
  projectname: 'chayaya-miniprogram',
  condition: {},
  editorSetting: { tabIndent: 'insertSpaces', tabSize: 2 },
}, null, 2));

write('project.private.config.json', JSON.stringify({
  description: '本地调试配置（不参与版本管理）',
  setting: { compileHotReLoad: true, urlCheck: false },
}, null, 2));

write('app.js', `/**
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
    this.globalData.sessionId = wx.getStorageSync('cy_session') || \`wx_\${Date.now().toString(36)}\`;
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
          ...(this.globalData.token ? { Authorization: \`Bearer \${this.globalData.token}\` } : {}),
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
`);

write('app.wxss', `/* 茶芽芽小程序全局样式（与 web 端同一套设计变量） */
page {
  --green-900: #123f2e;
  --green-700: #2e6b4f;
  --green-600: #3f8a63;
  --green-500: #5aa06e;
  --green-100: #e6f1e9;
  --green-50: #f3f8f4;
  --cream: #fdfaf1;
  --ink: #23302b;
  --ink-2: #4d5b54;
  --ink-3: #86948c;
  --line: #e5eae6;
  --danger: #d0453b;
  background: #eef2ee;
  color: var(--ink);
  font-size: 28rpx;
  font-family: -apple-system, "PingFang SC", "Microsoft YaHei", sans-serif;
  line-height: 1.62;
}

.page { padding-bottom: 40rpx; }
.pad { padding: 0 28rpx; }
.card {
  background: #fff; border-radius: 28rpx; padding: 28rpx; margin-bottom: 24rpx;
  box-shadow: 0 4rpx 24rpx rgba(24, 58, 42, 0.07);
}
.card-title { font-size: 30rpx; font-weight: 700; margin-bottom: 18rpx; }
.muted { color: var(--ink-3); }
.small { font-size: 24rpx; }
.tiny { font-size: 22rpx; }
.bold { font-weight: 700; }
.row { display: flex; align-items: center; gap: 16rpx; }
.row-between { display: flex; align-items: center; justify-content: space-between; }
.grow { flex: 1; min-width: 0; }
.center { text-align: center; }
.mt10 { margin-top: 20rpx; } .mt20 { margin-top: 40rpx; }
.mb10 { margin-bottom: 20rpx; }

.btn {
  display: flex; align-items: center; justify-content: center;
  background: var(--green-600); color: #fff; border-radius: 999rpx;
  padding: 22rpx 36rpx; font-size: 28rpx; font-weight: 600; border: 0;
}
.btn.block { width: 100%; }
.btn.ghost { background: var(--green-100); color: var(--green-700); }
.btn.outline { background: #fff; color: var(--green-700); border: 2rpx solid #cfe0d5; }
.btn.sm { padding: 12rpx 24rpx; font-size: 24rpx; }
.btn[disabled] { background: #cfd8d3; color: #fff; }

.tag {
  display: inline-block; padding: 4rpx 16rpx; border-radius: 999rpx; font-size: 22rpx;
  background: var(--green-100); color: var(--green-700); margin: 0 8rpx 8rpx 0;
}
.tag.warn { background: #fff8e6; color: #b7791f; }
.tag.danger { background: #fdf0ef; color: var(--danger); }
.tag.plain { background: #f1f4f2; color: var(--ink-2); }

.price { color: var(--danger); font-weight: 700; }
.price .num { font-size: 38rpx; }

.notice {
  border-radius: 16rpx; padding: 20rpx 24rpx; font-size: 24rpx; line-height: 1.7;
  background: #fff8e6; color: #7a5410; border-left: 6rpx solid #b9a163;
}
.notice.danger { background: #fdf0ef; color: #9c2f28; border-left-color: var(--danger); }
.notice.ok { background: #eaf6ef; color: #22664a; border-left-color: #2f855a; }
.notice.info { background: var(--green-50); color: var(--green-900); border-left-color: var(--green-500); }

.empty { padding: 100rpx 40rpx; text-align: center; color: var(--ink-3); }

.input, .textarea {
  width: 100%; border: 2rpx solid var(--line); border-radius: 16rpx;
  padding: 20rpx 24rpx; font-size: 28rpx; background: #fff; box-sizing: border-box;
}
.textarea { min-height: 160rpx; }

.divider { height: 2rpx; background: var(--line); margin: 24rpx 0; }

/* 商品卡 */
.goods-row { display: flex; gap: 22rpx; padding: 22rpx 0; border-bottom: 2rpx solid var(--line); }
.goods-row:last-child { border-bottom: 0; }
.goods-thumb { width: 170rpx; height: 170rpx; border-radius: 18rpx; background: var(--green-50); flex: 0 0 auto; }
.goods-grid { display: flex; flex-wrap: wrap; gap: 20rpx; }
.goods-grid .cell { width: calc(50% - 10rpx); background: #fff; border-radius: 24rpx; overflow: hidden; box-shadow: 0 4rpx 20rpx rgba(24,58,42,.06); }
.goods-grid .cell image { width: 100%; height: 320rpx; background: var(--green-50); }
.goods-grid .cell .info { padding: 18rpx 20rpx 22rpx; }

/* 时间轴 */
.timeline { padding-left: 44rpx; position: relative; }
.timeline::before { content: ''; position: absolute; left: 14rpx; top: 10rpx; bottom: 10rpx; width: 4rpx; background: var(--green-100); }
.tl-item { position: relative; padding-bottom: 28rpx; }
.tl-dot {
  position: absolute; left: -44rpx; top: 2rpx; width: 36rpx; height: 36rpx; border-radius: 50%;
  background: var(--green-500); color: #fff; font-size: 20rpx; display: flex; align-items: center; justify-content: center;
}
.tl-head { font-size: 27rpx; font-weight: 700; }
.tl-meta { font-size: 23rpx; color: var(--ink-3); margin: 4rpx 0 10rpx; }
.tl-detail { background: var(--green-50); border-radius: 16rpx; padding: 16rpx 20rpx; font-size: 24rpx; color: var(--ink-2); }
.tl-detail .kv { display: flex; gap: 12rpx; }
.tl-detail .k { color: var(--ink-3); flex: 0 0 170rpx; }

/* 聊天气泡 */
.msg { display: flex; gap: 16rpx; margin-bottom: 26rpx; }
.msg.me { flex-direction: row-reverse; }
.msg .avatar { width: 64rpx; height: 64rpx; border-radius: 50%; background: var(--green-100); flex: 0 0 auto; }
.bubble {
  max-width: 74%; background: #fff; border-radius: 8rpx 28rpx 28rpx 28rpx; padding: 18rpx 24rpx;
  font-size: 27rpx; line-height: 1.72; box-shadow: 0 4rpx 18rpx rgba(24,58,42,.07);
}
.msg.me .bubble { background: var(--green-600); color: #fff; border-radius: 28rpx 8rpx 28rpx 28rpx; }
.triage-badge { display: inline-block; font-size: 23rpx; font-weight: 700; padding: 6rpx 18rpx; border-radius: 999rpx; margin-bottom: 12rpx; }
.triage-ok { background: #eaf6ef; color: #2f855a; }
.triage-caution { background: #fff8e6; color: #b7791f; }
.triage-avoid { background: #fdf1e6; color: #b45f06; }
.triage-emergency { background: #fdf0ef; color: var(--danger); }
.chat-card { background: #fff; border: 2rpx solid var(--green-100); border-radius: 18rpx; padding: 18rpx 22rpx; display: flex; gap: 18rpx; align-items: center; margin: 0 0 22rpx 80rpx; }
.chat-quick { display: flex; gap: 14rpx; padding: 16rpx 24rpx; overflow-x: auto; white-space: nowrap; }
.chat-quick .chip { flex: 0 0 auto; background: #fff; border: 2rpx solid #a8cfb4; color: var(--green-700); border-radius: 999rpx; padding: 12rpx 24rpx; font-size: 25rpx; }
.chat-input { display: flex; gap: 16rpx; padding: 16rpx 24rpx; background: #fff; border-top: 2rpx solid var(--line); align-items: flex-end; }

.qr-box { background: #fff; padding: 20rpx; border-radius: 24rpx; display: inline-block; }
`);

/* ---------------- 各页面 ---------------- */
const PAGES = {
  'pages/home/home': {
    nav: '茶芽芽 · 源头自营',
    js: `const app = getApp();
Page({
  data: { brand: {}, story: [], hot: [], facts: [], images: {}, loading: true },
  onLoad() { this.fetch(); },
  onPullDownRefresh() { this.fetch().then(() => wx.stopPullDownRefresh()); },
  async fetch() {
    try {
      const d = await app.request('/api/home');
      this.setData({
        brand: d.brand, story: d.story.slice(0, 2), hot: d.hot,
        facts: d.marketFacts || [], images: d.brand.images, loading: false,
      });
    } catch { this.setData({ loading: false }); }
  },
  goProduct(e) { wx.navigateTo({ url: \`/pages/product/product?code=\${e.currentTarget.dataset.code}\` }); },
  goShop() { wx.switchTab({ url: '/pages/shop/shop' }); },
  goTrace() { wx.switchTab({ url: '/pages/trace/trace' }); },
  goAI() { wx.switchTab({ url: '/pages/ai/ai' }); },
  goBrand() { wx.navigateTo({ url: '/pages/brand/brand' }); },
});`,
    wxml: `<view class="page">
  <view class="hero">
    <image src="{{images.poster}}" mode="widthFix" style="width:100%" />
  </view>
  <view class="pad">
    <view class="card" style="background:linear-gradient(135deg,#eaf6ef,#fdfaf1)">
      <view class="row-between">
        <view>
          <view class="bold" style="font-size:30rpx">{{brand.subSlogan}}</view>
          <view class="small muted">注册会员即享浒口村集体直供价</view>
        </view>
        <view class="btn sm" bindtap="goShop">去看看</view>
      </view>
    </view>

    <view class="row" style="flex-wrap:wrap;gap:16rpx;margin-bottom:24rpx">
      <view wx:for="{{facts}}" wx:key="label" class="card grow" style="width:44%;margin:0;background:#f3f8f4">
        <view class="bold" style="color:#2e6b4f;font-size:30rpx">{{item.value}}</view>
        <view class="tiny muted">{{item.label}}</view>
      </view>
    </view>

    <view class="card">
      <view class="card-title">🌱 品牌故事 · 山林里的祝福</view>
      <view wx:for="{{story}}" wx:key="*this" class="small" style="color:#4d5b54;margin-bottom:12rpx">{{item}}</view>
      <view class="small" style="color:#3f8a63;font-weight:600" bindtap="goBrand">阅读完整品牌故事 →</view>
    </view>

    <view class="row-between">
      <view class="card-title">🛒 热销单品</view>
      <view class="small muted" bindtap="goShop">全部商品 ›</view>
    </view>
    <view class="goods-grid">
      <view wx:for="{{hot}}" wx:key="code" class="cell" data-code="{{item.code}}" bindtap="goProduct">
        <image src="{{item.image}}" mode="aspectFill" />
        <view class="info">
          <view style="font-size:26rpx;font-weight:600;min-height:72rpx">{{item.title}}</view>
          <view class="tiny muted">{{item.spec}}</view>
          <view class="row-between">
            <view class="price">¥{{item.priceText}}</view>
            <view class="tiny muted">已售 {{item.sales}}</view>
          </view>
        </view>
      </view>
    </view>

    <view class="card mt10">
      <view class="card-title">🔍 一瓶一码，扫码看它的前世今生</view>
      <view class="small muted mb10">刮开瓶底涂层扫码，可查看这一棵油茶林的地块、采摘日期、压榨批次、农户姓名与 SGS 检测报告。</view>
      <image src="{{images.traceSystem}}" mode="widthFix" style="width:100%;border-radius:16rpx" />
      <view class="row mt10" style="gap:16rpx">
        <view class="btn ghost grow" bindtap="goTrace">体验扫码溯源</view>
        <view class="btn outline grow" bindtap="goAI">问芽芽客服</view>
      </view>
    </view>

    <view class="notice info">
      本小程序为「浒口茶油·乡味新生」大学生创业项目的技术实现，含商品购买、产品背书、一物一码溯源与 AI 客服四大模块；AI 客服不提供医疗诊断，宝宝异常请及时就医。
    </view>
  </view>
</view>`,
  },

  'pages/shop/shop': {
    nav: '产品中心',
    js: `const app = getApp();
Page({
  data: { list: [], categories: [], active: 'all', total: 0 },
  onShow() { this.fetch(); },
  async fetch() {
    const [p, cats] = await Promise.all([
      app.request('/api/products?size=50'),
      app.request('/api/home').then((h) => h.categories),
    ]);
    this.setData({ list: p.list, total: p.total, categories: cats });
  },
  pick(e) { this.setData({ active: e.currentTarget.dataset.cat }); this.filter(); },
  filter() {
    const { active } = this.data;
    this.setData({ list: active === 'all' ? this._all : this._all.filter((x) => x.category === active) });
    if (active === 'all') this.fetch();
  },
  goProduct(e) { wx.navigateTo({ url: \`/pages/product/product?code=\${e.currentTarget.dataset.code}\` }); },
  async addCart(e) {
    if (!app.requireLogin()) return;
    await app.request('/api/cart', { method: 'POST', data: { code: e.currentTarget.dataset.code, qty: 1 } });
    wx.showToast({ title: '已加入购物车', icon: 'success' });
    app.refreshCartCount();
  },
});`,
    wxml: `<view class="page">
  <scroll-view scroll-x class="chat-quick">
    <view class="chip {{active === 'all' ? 'on' : ''}}" data-cat="all" bindtap="pick">全部（{{total}}）</view>
    <view wx:for="{{categories}}" wx:key="key" class="chip" data-cat="{{item.key}}" bindtap="pick">{{item.name}}（{{item.count}}）</view>
  </scroll-view>

  <view class="pad">
    <view class="notice info">核心卖点：天然物理冷榨山茶油 · 0 添加 · 母婴安全 · 一物一码全程溯源 · 乡村助农</view>

    <view wx:for="{{list}}" wx:key="code" class="card">
      <view class="goods-row" style="border:0;padding:0">
        <image class="goods-thumb" src="{{item.image}}" mode="aspectFill" data-code="{{item.code}}" bindtap="goProduct" />
        <view class="grow">
          <view class="bold" style="font-size:28rpx" data-code="{{item.code}}" bindtap="goProduct">{{item.title}}</view>
          <view class="small muted">{{item.subtitle || item.spec}}</view>
          <view class="mt10">
            <text wx:for="{{item.tags}}" wx:key="*this" class="tag">{{item}}</text>
          </view>
          <view class="row-between mt10">
            <view class="price">¥{{item.priceText}}</view>
            <view wx:if="{{!item.presale}}" class="btn sm" data-code="{{item.code}}" bindtap="addCart">加入购物车</view>
            <view wx:else class="tag warn">预售中</view>
          </view>
        </view>
      </view>
    </view>
  </view>
</view>`,
  },

  'pages/product/product': {
    nav: '商品详情',
    js: `const app = getApp();
Page({
  data: { p: null, related: [], batches: [], gallery: [], current: 0 },
  onLoad(q) { this.code = q.code; this.fetch(); },
  async fetch() {
    const d = await app.request(\`/api/products/\${this.code}\`);
    this.setData({
      p: d.product, related: d.related, batches: d.batches || [],
      gallery: d.product.gallery && d.product.gallery.length ? d.product.gallery : [d.product.image],
    });
  },
  swipe(e) { this.setData({ current: e.detail.current }); },
  async addCart() {
    if (!app.requireLogin()) return;
    await app.request('/api/cart', { method: 'POST', data: { code: this.code, qty: 1 } });
    wx.showToast({ title: '已加入购物车', icon: 'success' });
    app.refreshCartCount();
  },
  buy() {
    if (!app.requireLogin()) return;
    wx.navigateTo({ url: \`/pages/checkout/checkout?code=\${this.code}&qty=1\` });
  },
  goTrace() { wx.switchTab({ url: '/pages/trace/trace' }); },
  goGuide() { wx.navigateTo({ url: '/pages/guide/guide' }); },
  goAI() { wx.switchTab({ url: '/pages/ai/ai' }); },
  openReport() {
    // 检测报告是后端托管的 HTML，小程序内用 web-view 打开需要业务域名；这里先复制链接
    const url = app.globalData.baseUrl + '/assets/reports/SGS-2026-0115.html';
    wx.setClipboardData({ data: url, success: () => wx.showToast({ title: '报告链接已复制，可在浏览器打开', icon: 'none' }) });
  },
});`,
    wxml: `<view class="page" wx:if="{{p}}">
  <swiper style="height:750rpx;background:#f3f8f4" circular bindchange="swipe">
    <swiper-item wx:for="{{gallery}}" wx:key="*this">
      <image src="{{item}}" mode="aspectFill" style="width:100%;height:750rpx" />
    </swiper-item>
  </swiper>
  <view class="center tiny muted" style="margin-top:10rpx">{{current + 1}} / {{gallery.length}}</view>

  <view class="pad">
    <view class="card">
      <view class="row-between">
        <view class="price">¥{{p.priceText}}<text wx:if="{{p.listPrice > p.price}}" class="tiny muted" style="text-decoration:line-through;margin-left:12rpx">¥{{p.listPriceText}}</text></view>
        <view class="tiny muted">已售 {{p.sales}} · 库存 {{p.stock}}</view>
      </view>
      <view class="bold mt10" style="font-size:32rpx">{{p.title}}</view>
      <view class="small muted">{{p.subtitle}}</view>
      <view class="mt10"><text wx:for="{{p.tags}}" wx:key="*this" class="tag">{{item}}</text></view>
    </view>

    <view class="card">
      <view class="card-title">✨ 六大核心卖点</view>
      <view wx:for="{{p.sellingPoints}}" wx:key="title" style="margin-bottom:18rpx">
        <view class="bold" style="font-size:27rpx">· {{item.title}}</view>
        <view class="small muted">{{item.desc}}</view>
      </view>
    </view>

    <view class="card" wx:if="{{p.detail.positioning}}">
      <view class="card-title">🎯 产品定位</view>
      <view class="small">{{p.detail.positioning}}</view>
      <view class="small muted mt10">适用人群：{{p.detail.audience}}</view>
    </view>

    <view class="card" wx:if="{{p.detail.specs.length}}">
      <view class="card-title">📋 产品参数</view>
      <view wx:for="{{p.detail.specs}}" wx:key="k" class="row tl-detail" style="margin-bottom:10rpx">
        <view class="small muted" style="flex:0 0 200rpx">{{item.k}}</view>
        <view class="small grow">{{item.v}}</view>
      </view>
    </view>

    <view class="card" wx:if="{{p.detail.usage.length}}">
      <view class="card-title">🧴 使用方法</view>
      <view wx:for="{{p.detail.usage}}" wx:key="*this" class="small" style="margin-bottom:12rpx">{{index + 1}}. {{item}}</view>
    </view>

    <view class="card" wx:if="{{p.detail.safety.length}}">
      <view class="card-title">🛡 安全与合规</view>
      <view wx:for="{{p.detail.safety}}" wx:key="*this" class="small" style="margin-bottom:12rpx">· {{item}}</view>
      <view class="btn ghost sm" bindtap="goTrace">查看扫码溯源 ›</view>
    </view>

    <view class="card" wx:if="{{batches.length}}">
      <view class="card-title">🔍 在售批次（可溯源）</view>
      <view wx:for="{{batches}}" wx:key="batch_no" class="row-between small" style="padding:10rpx 0;border-bottom:2rpx solid #e5eae6">
        <view class="bold">{{item.batch_no}}</view>
        <view class="muted">{{item.farmer}} · {{item.harvest_date}}</view>
      </view>
    </view>

    <view class="card">
      <view class="card-title">🤖 有疑问？问芽芽</view>
      <view class="small muted mb10">宝宝皮肤能不能用、一次用多少、怎么抚触，都可以问 AI 客服（涉及症状会先提示就医）。</view>
      <view class="btn ghost block" bindtap="goAI">咨询 AI 客服</view>
    </view>

    <view wx:if="{{related.length}}">
      <view class="card-title">你可能还需要</view>
      <view class="goods-grid">
        <view wx:for="{{related}}" wx:key="code" class="cell" data-code="{{item.code}}" bindtap="goProduct">
          <image src="{{item.image}}" mode="aspectFill" />
          <view class="info"><view class="small bold">{{item.title}}</view><view class="price">¥{{item.priceText}}</view></view>
        </view>
      </view>
    </view>
  </view>

  <view style="height:140rpx"></view>
  <view style="position:fixed;bottom:0;left:0;right:0;background:#fff;border-top:2rpx solid #e5eae6;padding:18rpx 24rpx;display:flex;gap:16rpx">
    <view class="btn outline" bindtap="goAI">问客服</view>
    <view class="btn ghost grow" bindtap="addCart">加入购物车</view>
    <view class="btn grow" bindtap="buy">立即购买</view>
  </view>
</view>`,
  },

  'pages/trace/trace': {
    nav: '溯源',
    js: `const app = getApp();
Page({
  data: { mode: 'home', overview: null, result: null, batch: null, code: '', qr: null },
  onLoad(q) {
    if (q.t || q.code) this.verify(q.t, q.code);
    else this.fetchOverview();
  },
  onShow() { if (this.data.mode === 'home') this.fetchOverview(); },
  async fetchOverview() {
    const [overview, codes] = await Promise.all([
      app.request('/api/trace/overview'),
      app.request('/api/trace/codes', { silent: true }).catch(() => ({ list: [] })),
    ]);
    this.setData({ mode: 'home', overview, demoCodes: (codes.list || []).slice(0, 8) });
  },
  onInput(e) { this.setData({ code: e.detail.value }); },
  query() {
    if (!this.data.code) { wx.showToast({ title: '请输入溯源码', icon: 'none' }); return; }
    this.verify(null, this.data.code);
  },
  async demo() {
    const d = await app.request('/api/trace/demo');
    const token = d.url.split('t=')[1];
    this.verify(token, null);
  },
  async verify(t, code) {
    const d = await app.request(\`/api/trace/verify?\${t ? 't=' + encodeURIComponent(t) : 'code=' + encodeURIComponent(code)}\`);
    this.setData({ mode: d.authentic ? 'result' : 'fail', result: d });
  },
  async openBatch(e) {
    const d = await app.request(\`/api/trace/batch/\${e.currentTarget.dataset.batch}\`);
    this.setData({ mode: 'batch', batch: d });
  },
  back() { this.setData({ mode: 'home', result: null, batch: null }); this.fetchOverview(); },
  async genQr() {
    if (!this.data.code) { wx.showToast({ title: '先输入溯源码', icon: 'none' }); return; }
    const d = await app.request(\`/api/trace/qr/\${this.data.code}\`);
    this.setData({ qr: d });
  },
});`,
    wxml: `<view class="page">
  <!-- 频道首页 -->
  <block wx:if="{{mode === 'home'}}">
    <view class="pad">
      <view class="card" style="background:linear-gradient(135deg,#eaf6ef,#fdfaf1)">
        <view class="card-title">🔍 一物一码 · 全流程溯源</view>
        <view class="small mb10">刮开产品瓶底涂层，用微信扫码即可查看这一瓶的完整履历：油茶林地块、采摘日期、压榨批次、农户姓名、检测报告与物流轨迹。</view>
        <input class="input mb10" placeholder="也可手动输入瓶底溯源码" value="{{code}}" bindinput="onInput" />
        <view class="row" style="gap:16rpx">
          <view class="btn grow" bindtap="query">查询真伪</view>
          <view class="btn ghost grow" bindtap="demo">用示例码体验</view>
        </view>
      </view>

      <view class="card" wx:if="{{overview}}">
        <view class="card-title">🏔 溯源体系</view>
        <image src="{{overview.images.system}}" mode="widthFix" style="width:100%;border-radius:16rpx" />
        <view class="row mt10" style="gap:12rpx">
          <view wx:for="{{overview.flow}}" wx:key="key" class="card grow" style="margin:0;padding:16rpx 10rpx;background:#f3f8f4">
            <view class="small bold center">{{item.name}}</view>
            <view class="tiny muted center">{{item.desc}}</view>
          </view>
        </view>
      </view>

      <view class="card" wx:if="{{overview}}">
        <view class="card-title">🔐 防伪与存证技术</view>
        <view class="small">· 数字身份证：{{overview.algorithm.code}}</view>
        <view class="small">· 防篡改存证：{{overview.algorithm.chain}}</view>
        <view class="notice ok mt10">{{overview.antiFakeTip}}</view>
      </view>

      <view class="card" wx:if="{{overview}}">
        <view class="card-title">📦 在售批次</view>
        <view wx:for="{{overview.batches}}" wx:key="batchNo" class="row-between" style="padding:16rpx 0;border-bottom:2rpx solid #e5eae6">
          <view class="grow">
            <view class="small bold">{{item.batchNo}}</view>
            <view class="tiny muted">{{item.origin}} · 农户 {{item.farmer}}</view>
            <view class="tiny muted">赋码 {{item.unitTotal}} 个 · 被扫码 {{item.scans}} 次</view>
          </view>
          <view class="btn sm outline" data-batch="{{item.batchNo}}" bindtap="openBatch">查看</view>
        </view>
      </view>

      <view class="card" wx:if="{{demoCodes.length}}">
        <view class="card-title">🧪 演示用溯源码</view>
        <text wx:for="{{demoCodes}}" wx:key="traceCode" class="tag">{{item.traceCode}}</text>
      </view>

      <view class="card">
        <view class="card-title">🖨 生成瓶底二维码</view>
        <input class="input mb10" placeholder="溯源码" value="{{code}}" bindinput="onInput" />
        <view class="btn sm" bindtap="genQr">生成</view>
        <view wx:if="{{qr}}" class="center mt10">
          <view class="mono tiny">{{qr.url}}</view>
          <view class="tiny muted mt10">签名 {{qr.signature}}</view>
        </view>
      </view>
    </view>
  </block>

  <!-- 正品结果 -->
  <block wx:elif="{{mode === 'result'}}">
    <view class="pad">
      <view class="card" style="background:linear-gradient(135deg,#eaf6ef,#fdfaf1)">
        <view class="bold" style="font-size:32rpx;color:#123f2e">✅ 正品验证通过</view>
        <view class="tiny muted">溯源码 {{result.traceCode}}</view>
        <view class="notice {{result.scan.isFirst ? 'ok' : ''}} mt10">{{result.scan.tip}}</view>
      </view>

      <view class="card" wx:if="{{result.product}}">
        <view class="row">
          <image src="{{result.product.image}}" style="width:150rpx;height:150rpx;border-radius:18rpx" mode="aspectFill" />
          <view class="grow">
            <view class="bold">{{result.product.title}}</view>
            <view class="small muted">{{result.product.subtitle}}</view>
            <view class="mt10"><text class="tag">{{result.product.spec}}</text><text class="tag plain">{{result.unitStatusText}}</text></view>
          </view>
        </view>
      </view>

      <view class="card">
        <view class="card-title">📍 原料产地与种植管护</view>
        <view class="tl-detail">
          <view class="kv"><view class="k">产地</view><view class="grow">{{result.batch.origin}}</view></view>
          <view class="kv"><view class="k">地块编号</view><view class="grow">{{result.batch.plotNo}}</view></view>
          <view class="kv"><view class="k">负责农户</view><view class="grow">{{result.batch.farmer}}</view></view>
          <view class="kv"><view class="k">采摘日期</view><view class="grow">{{result.batch.harvestDate}}</view></view>
          <view class="kv"><view class="k">压榨工艺</view><view class="grow">{{result.batch.pressTech}}</view></view>
          <view class="kv"><view class="k">加工工厂</view><view class="grow">{{result.batch.factory}}</view></view>
        </view>
      </view>

      <view class="card">
        <view class="card-title">🕒 全流程时间轴</view>
        <view class="timeline">
          <view wx:for="{{result.timeline}}" wx:key="hash" class="tl-item">
            <view class="tl-dot">{{item.icon}}</view>
            <view class="tl-head">{{item.stageName}}</view>
            <view class="tl-meta">{{item.happenedAt}} · {{item.operator}}</view>
            <view class="tl-detail">
              <view wx:for="{{item.detail}}" wx:for-item="kv" wx:key="*this" class="kv">
                <view class="k">{{index}}</view><view class="grow">{{kv}}</view>
              </view>
            </view>
          </view>
        </view>
      </view>

      <view class="card">
        <view class="card-title">🔬 检测报告</view>
        <view class="small muted">报告编号：{{result.report.inspectionNo}}</view>
        <view class="btn outline block mt10" bindtap="openReport">查看电子质检报告原文 ›</view>
      </view>

      <view class="card">
        <view class="card-title">🔐 防伪与存证校验</view>
        <view class="notice {{result.chain.intact ? 'ok' : 'danger'}}">{{result.chain.note}}</view>
        <view class="tl-detail mt10">
          <view class="kv"><view class="k">签名算法</view><view class="grow">{{result.signature.algorithm}}</view></view>
          <view class="kv"><view class="k">存证链</view><view class="grow">{{result.chain.algorithm}}（{{result.chain.nodeCount}} 个节点）</view></view>
          <view class="kv"><view class="k">本次查询</view><view class="grow">第 {{result.scan.count}} 次</view></view>
        </view>
      </view>

      <view class="btn ghost block" bindtap="back">返回溯源首页</view>
    </view>
  </block>

  <!-- 未通过 -->
  <block wx:else>
    <view class="pad">
      <view class="card" style="background:#fdf0ef">
        <view class="center">
          <view class="bold" style="font-size:34rpx;color:#d0453b">未通过正品验证</view>
          <view class="small" style="color:#9c2f28">{{result.message || '查询失败'}}</view>
        </view>
      </view>
      <view class="card">
        <view class="card-title">可能的原因</view>
        <view class="small muted">· 溯源码输入有误\n· 商品并非官方渠道售出\n· 二维码被复制或二次封装</view>
      </view>
      <view class="btn block" bindtap="back">重新查询</view>
    </view>
  </block>
</view>`,
  },

  'pages/ai/ai': {
    nav: 'AI 问症',
    js: `const app = getApp();
Page({
  data: { messages: [], quick: [], input: '', sending: false, greeting: '', disclaimer: '' },
  onLoad() { this.boot(); },
  async boot() {
    const d = await app.request('/api/ai/bootstrap');
    this.setData({
      quick: d.quick, greeting: d.greeting, disclaimer: d.disclaimer,
      messages: [{ role: 'assistant', content: d.greeting, cards: [] }],
    });
  },
  onInput(e) { this.setData({ input: e.detail.value }); },
  tapQuick(e) { this.ask(e.currentTarget.dataset.q); },
  send() { this.ask(this.data.input); },
  async ask(text) {
    const value = (text || '').trim();
    if (!value || this.data.sending) return;
    const messages = this.data.messages.concat([{ role: 'user', content: value, cards: [] }]);
    this.setData({ messages, input: '', sending: true });
    try {
      const res = await app.request('/api/ai/chat', {
        method: 'POST',
        data: { sessionId: app.globalData.sessionId, text: value },
      });
      const r = res.reply;
      const next = messages.concat([{
        role: 'assistant', content: r.answer, cards: r.cards || [],
        triage: r.triage, intent: r.intent, handoff: r.handoff,
        levelClass: 'triage-' + (r.triage && r.triage.level ? r.triage.level : 'ok'),
        levelText: ({
          ok: '可以按日常护理使用', caution: '需谨慎，建议先咨询医生',
          avoid: '患处暂不要涂油', emergency: '请先带宝宝就医',
        })[r.triage && r.triage.level] || '',
      }]);
      this.setData({ messages: next, sending: false });
      if (r.handoff && r.handoff.needed) {
        wx.showModal({
          title: '已为你转接人工客服',
          content: (r.handoff.reasons || []).join('；') + '\\n客服工作时间 9:00-21:00',
          showCancel: false,
        });
      }
    } catch {
      this.setData({ sending: false });
    }
  },
  openCard(e) {
    const url = e.currentTarget.dataset.url || '';
    if (!url) return;
    if (url.startsWith('/#/product/')) {
      wx.navigateTo({ url: \`/pages/product/product?code=\${url.split('/').pop()}\` });
    } else if (url.startsWith('/#/trace')) {
      wx.switchTab({ url: '/pages/trace/trace' });
    } else if (url.includes('/guide')) {
      wx.navigateTo({ url: '/pages/guide/guide' });
    } else if (url.includes('/orders')) {
      wx.navigateTo({ url: '/pages/orders/orders' });
    } else if (url.startsWith('/assets/')) {
      // 检测报告等后端托管的 HTML：复制链接，便于在浏览器打开
      wx.setClipboardData({ data: app.globalData.baseUrl + url, success: () => wx.showToast({ title: '报告链接已复制', icon: 'none' }) });
    } else {
      wx.setClipboardData({ data: app.globalData.baseUrl + url });
    }
  },
});`,
    wxml: `<view class="page">
  <view class="pad">
    <view class="notice danger">重要提示：我是护肤客服，不是医生。涉及症状诊断与用药请以医生意见为准；宝宝出现发热、化脓渗液、精神差、拒奶、呼吸异常时请立即就医。</view>
  </view>

  <scroll-view scroll-y style="height:calc(100vh - 420rpx);padding:0 24rpx">
    <view wx:for="{{messages}}" wx:key="index" class="msg {{item.role === 'user' ? 'me' : ''}}">
      <image class="avatar" src="/assets/img/image20.png" wx:if="{{item.role !== 'user'}}" />
      <view class="avatar" wx:else />
      <view>
        <view wx:if="{{item.levelClass}}" class="triage-badge {{item.levelClass}}">{{item.levelText}}</view>
        <view class="bubble">{{item.content}}</view>
        <view wx:for="{{item.cards}}" wx:for-item="c" wx:key="title" class="chat-card" data-url="{{c.url}}" bindtap="openCard">
          <view class="grow">
            <view class="bold" style="font-size:26rpx">{{c.title}}</view>
            <view class="tiny muted">{{c.desc}}</view>
          </view>
          <view class="muted">›</view>
        </view>
      </view>
    </view>
    <view wx:if="{{sending}}" class="msg"><image class="avatar" src="/assets/img/image20.png" /><view class="bubble">正在思考…</view></view>
  </scroll-view>

  <scroll-view scroll-x class="chat-quick">
    <view wx:for="{{quick}}" wx:key="*this" class="chip" data-q="{{item}}" bindtap="tapQuick">{{item}}</view>
  </scroll-view>

  <view class="chat-input">
    <input class="input grow" placeholder="描述宝宝的情况，或问产品/订单问题…" value="{{input}}" bindinput="onInput" confirm-type="send" bindconfirm="send" />
    <view class="btn" bindtap="send">发送</view>
  </view>
</view>`,
  },

  'pages/me/me': {
    nav: '我的',
    js: `const app = getApp();
Page({
  data: { me: null, codes: [], logged: false },
  onShow() {
    this.setData({ logged: Boolean(app.globalData.token) });
    if (app.globalData.token) this.fetch();
  },
  async fetch() {
    const [me, codes] = await Promise.all([
      app.request('/api/me'),
      app.request('/api/me/trace-codes', { silent: true }).catch(() => ({ list: [] })),
    ]);
    this.setData({ me, codes: (codes.list || []).slice(0, 6) });
  },
  login() { wx.navigateTo({ url: '/pages/login/login' }); },
  orders() { wx.navigateTo({ url: '/pages/orders/orders' }); },
  cart() { wx.navigateTo({ url: '/pages/cart/cart' }); },
  goTraceResult(e) { wx.navigateTo({ url: \`/pages/trace/trace?code=\${e.currentTarget.dataset.code}\` }); },
  goBrand() { wx.navigateTo({ url: '/pages/brand/brand' }); },
  goGuide() { wx.navigateTo({ url: '/pages/guide/guide' }); },
  async bookTrip() {
    await app.request('/api/bookings', { method: 'POST', data: { activity: '浒口村溯源之旅' } });
    wx.showToast({ title: '报名成功', icon: 'success' });
  },
  logout() { app.logout(); this.setData({ logged: false, me: null }); wx.showToast({ title: '已退出', icon: 'none' }); },
});`,
    wxml: `<view class="page">
  <block wx:if="{{logged && me}}">
    <view class="pad">
      <view class="card" style="background:linear-gradient(135deg,#eaf6ef,#fdfaf1)">
        <view class="row">
          <image src="{{me.user.avatar}}" style="width:110rpx;height:110rpx;border-radius:50%" mode="aspectFill" />
          <view class="grow">
            <view class="bold" style="font-size:32rpx">{{me.user.nickname}}</view>
            <view class="small muted">{{me.user.phone}}</view>
            <view class="mt10"><text class="tag">{{me.tier.current.name}}</text><text class="tag plain">累计消费 ¥{{me.user.totalPaid / 100}}</text></view>
          </view>
        </view>
        <view wx:if="{{me.tier.next}}" class="mt10">
          <view class="tiny muted">距 {{me.tier.next.name}} 还差 ¥{{me.tier.next.gap / 100}}</view>
        </view>
      </view>

      <view class="card">
        <view class="row" style="justify-content:space-around;text-align:center">
          <view class="grow" bindtap="orders"><view class="bold" style="font-size:32rpx;color:#2e6b4f">{{me.counts.orders}}</view><view class="tiny muted">全部订单</view></view>
          <view class="grow"><view class="bold" style="font-size:32rpx;color:#2e6b4f">{{me.counts.coupons}}</view><view class="tiny muted">可用券</view></view>
          <view class="grow" bindtap="cart"><view class="bold" style="font-size:32rpx;color:#2e6b4f">{{me.counts.cart}}</view><view class="tiny muted">购物车</view></view>
        </view>
      </view>

      <view class="card">
        <view class="card-title">🔍 我买到的溯源码</view>
        <view wx:if="{{!codes.length}}" class="small muted">下单支付后，系统会为本单每一瓶分配独立溯源码</view>
        <view wx:for="{{codes}}" wx:key="traceCode" class="row-between" style="padding:14rpx 0;border-bottom:2rpx solid #e5eae6">
          <view class="grow">
            <view class="small bold">{{item.traceCode}}</view>
            <view class="tiny muted">{{item.title}} {{item.spec}} · 已查询 {{item.scanCount}} 次</view>
          </view>
          <view class="btn sm outline" data-code="{{item.traceCode}}" bindtap="goTraceResult">溯源</view>
        </view>
      </view>

      <view class="card">
        <view class="card-title">🎁 会员权益</view>
        <view wx:for="{{me.tier.current.benefits}}" wx:key="*this" class="small" style="margin-bottom:10rpx">· {{item}}</view>
      </view>

      <view class="card">
        <view class="card-title">🚌 浒口村溯源之旅</view>
        <view class="small muted mb10">守护会员可免费参加：实地参观山茶花种植基地、产品生产过程，体验浒口特色油茶。</view>
        <view class="btn ghost block" bindtap="bookTrip">报名溯源之旅</view>
      </view>

      <view class="card">
        <view class="row-between" style="padding:16rpx 0;border-bottom:2rpx solid #e5eae6" bindtap="goBrand">
          <view class="small">品牌故事</view><view class="small muted">阅读 ›</view>
        </view>
        <view class="row-between" style="padding:16rpx 0;border-bottom:2rpx solid #e5eae6" bindtap="goGuide">
          <view class="small">抚触教程</view><view class="small muted">学习 ›</view>
        </view>
        <view class="row-between" style="padding:16rpx 0" bindtap="logout">
          <view class="small">退出登录</view><view class="small muted">›</view>
        </view>
      </view>
    </view>
  </block>

  <block wx:else>
    <view class="pad">
      <view class="card center">
        <image src="/assets/img/image20.png" style="width:180rpx;margin:0 auto" mode="widthFix" />
        <view class="bold" style="font-size:30rpx">登录后享村集体直供价</view>
        <view class="small muted">还能查看你买到的每一瓶的溯源记录</view>
        <view class="btn block mt20" bindtap="login">立即登录 / 注册</view>
      </view>
      <view class="card">
        <view class="card-title">🌱 会员权益</view>
        <view class="small" style="margin-bottom:10rpx">· 新芽会员：注册即享村集体直供价</view>
        <view class="small" style="margin-bottom:10rpx">· 成长会员：累计满 100 元，赠育儿手册 + 月度优惠券</view>
        <view class="small">· 守护会员：累计满 500 元，免费参与浒口村溯源之旅</view>
      </view>
    </view>
  </block>
</view>`,
  },

  'pages/login/login': {
    nav: '登录',
    js: `const app = getApp();
Page({
  data: { phone: '', code: '', counting: 0, demoCode: '123456' },
  onInput(e) { this.setData({ [e.currentTarget.dataset.k]: e.detail.value }); },
  async sendCode() {
    if (!/^1\\d{10}$/.test(this.data.phone)) { wx.showToast({ title: '请输入正确手机号', icon: 'none' }); return; }
    const d = await app.request('/api/auth/send-code', { method: 'POST', data: { phone: this.data.phone } });
    if (d.code) this.setData({ code: d.code });
    wx.showToast({ title: d.code ? '验证码已填入' : '验证码已发送', icon: 'none' });
    let left = 60;
    this.setData({ counting: left });
    const t = setInterval(() => {
      left -= 1;
      this.setData({ counting: left });
      if (left <= 0) clearInterval(t);
    }, 1000);
  },
  async doLogin() {
    if (!this.data.phone || !this.data.code) { wx.showToast({ title: '请填写手机号和验证码', icon: 'none' }); return; }
    const d = await app.request('/api/auth/login-code', {
      method: 'POST', data: { phone: this.data.phone, code: this.data.code },
    });
    app.setToken(d.token);
    app.globalData.user = d.user;
    await app.refreshCartCount();
    wx.showToast({ title: '登录成功', icon: 'success' });
    setTimeout(() => wx.navigateBack({ fail: () => wx.switchTab({ url: '/pages/home/home' }) }), 700);
  },
  async wxLogin() {
    try {
      const d = await app.wechatLogin();
      wx.showToast({ title: d.mode === 'mock' ? '演示模式登录成功' : '微信登录成功', icon: 'success' });
      setTimeout(() => wx.navigateBack({ fail: () => wx.switchTab({ url: '/pages/home/home' }) }), 700);
    } catch (e) { /* 已提示 */ }
  },
});`,
    wxml: `<view class="page">
  <view class="pad" style="padding-top:60rpx">
    <view class="center">
      <image src="/assets/img/image20.png" style="width:220rpx;margin:0 auto" mode="widthFix" />
      <view class="bold" style="font-size:36rpx">欢迎来到茶芽芽</view>
      <view class="small muted">与茶树一同生长，伴宝宝安心长大</view>
    </view>

    <view class="card mt20">
      <view class="mb10">
        <view class="small muted">手机号</view>
        <input class="input" type="number" maxlength="11" placeholder="请输入 11 位手机号" value="{{phone}}" data-k="phone" bindinput="onInput" />
      </view>
      <view class="mb10">
        <view class="small muted">验证码</view>
        <view class="row">
          <input class="input grow" type="number" maxlength="6" placeholder="6 位验证码" value="{{code}}" data-k="code" bindinput="onInput" />
          <view class="btn ghost sm" bindtap="sendCode">{{counting > 0 ? counting + 's' : '获取验证码'}}</view>
        </view>
      </view>
      <view class="btn block" bindtap="doLogin">登录 / 注册</view>
      <view class="tiny muted center mt10">未注册的手机号将自动创建账号</view>
    </view>

    <view class="btn outline block" bindtap="wxLogin">微信一键登录</view>

    <view class="notice info mt20">
      演示环境验证码固定为 123456；接入真实小程序后，wx.login 的 code 会走后端 code2session 换取 openid。
    </view>
  </view>
</view>`,
  },

  'pages/cart/cart': {
    nav: '购物车',
    js: `const app = getApp();
Page({
  data: { items: [], totalQty: 0, goodsAmount: 0, recommend: [], logged: false },
  onShow() {
    this.setData({ logged: Boolean(app.globalData.token) });
    if (app.globalData.token) this.fetch();
  },
  async fetch() {
    const d = await app.request('/api/cart');
    this.setData({
      items: d.items, totalQty: d.totalQty, goodsAmount: d.goodsAmount,
      recommend: (d.recommend && d.recommend.items) || [],
    });
    app.globalData.cartCount = d.totalQty;
    app.notify();
  },
  async changeQty(e) {
    const { id, delta } = e.currentTarget.dataset;
    const item = this.data.items.find((x) => x.cartId === Number(id));
    const qty = item.qty + Number(delta);
    if (qty < 1) return;
    await app.request(\`/api/cart/\${id}\`, { method: 'PATCH', data: { qty } });
    this.fetch();
  },
  async remove(e) {
    await app.request(\`/api/cart/\${e.currentTarget.dataset.id}\`, { method: 'DELETE' });
    wx.showToast({ title: '已移出', icon: 'none' });
    this.fetch();
  },
  async addRec(e) {
    await app.request('/api/cart', { method: 'POST', data: { code: e.currentTarget.dataset.code, qty: 1 } });
    wx.showToast({ title: '已加入', icon: 'success' });
    this.fetch();
  },
  checkout() {
    if (!this.data.items.length) { wx.showToast({ title: '购物车是空的', icon: 'none' }); return; }
    wx.navigateTo({ url: '/pages/checkout/checkout' });
  },
  login() { wx.navigateTo({ url: '/pages/login/login' }); },
  goShop() { wx.switchTab({ url: '/pages/shop/shop' }); },
});`,
    wxml: `<view class="page">
  <block wx:if="{{!logged}}">
    <view class="empty">
      <view>登录后才能查看购物车</view>
      <view class="btn sm mt20" bindtap="login">去登录</view>
    </view>
  </block>

  <block wx:elif="{{items.length}}">
    <view class="pad">
      <view class="card">
        <view wx:for="{{items}}" wx:key="cartId" class="goods-row">
          <image class="goods-thumb" src="{{item.image}}" mode="aspectFill" />
          <view class="grow">
            <view class="row-between">
              <view class="grow">
                <view class="bold" style="font-size:27rpx">{{item.title}}</view>
                <view class="small muted">{{item.spec}}</view>
              </view>
              <view class="btn sm ghost" data-id="{{item.cartId}}" bindtap="remove">删除</view>
            </view>
            <view class="row-between mt10">
              <view class="price">¥{{item.priceText}}</view>
              <view class="row">
                <view class="btn sm ghost" data-id="{{item.cartId}}" data-delta="-1" bindtap="changeQty">－</view>
                <view style="padding:0 20rpx">{{item.qty}}</view>
                <view class="btn sm ghost" data-id="{{item.cartId}}" data-delta="1" bindtap="changeQty">＋</view>
              </view>
            </view>
          </view>
        </view>
      </view>

      <view class="card" wx:if="{{recommend.length}}">
        <view class="card-title">🤖 芽芽的搭配建议</view>
        <view wx:for="{{recommend}}" wx:key="code" class="row-between" style="padding:16rpx 0;border-bottom:2rpx solid #e5eae6">
          <view class="row grow">
            <image src="{{item.image}}" style="width:90rpx;height:90rpx;border-radius:14rpx" mode="aspectFill" />
            <view class="grow">
              <view class="small bold">{{item.title}} {{item.spec}}</view>
              <view class="tiny muted">{{item.reason}}</view>
            </view>
          </view>
          <view class="btn sm" data-code="{{item.code}}" bindtap="addRec">加入</view>
        </view>
      </view>

      <view class="card">
        <view class="row-between mb10">
          <view class="small muted">商品合计（{{totalQty}} 件）</view>
          <view class="price">¥{{goodsAmount / 100}}</view>
        </view>
        <view class="btn block" bindtap="checkout">去结算</view>
      </view>
    </view>
  </block>

  <block wx:else>
    <view class="empty">
      <view>购物车还是空的</view>
      <view class="btn sm mt20" bindtap="goShop">去挑一瓶</view>
    </view>
  </block>
</view>`,
  },

  'pages/checkout/checkout': {
    nav: '确认订单',
    js: `const app = getApp();
Page({
  data: { preview: null, address: null, couponCode: '', remark: '', direct: null, addresses: [] },
  onLoad(q) {
    if (q.code) this.direct = { code: q.code, qty: Number(q.qty || 1) };
    this.fetch();
  },
  async fetch(couponCode) {
    let p;
    if (this.direct) {
      const [price, addr] = await Promise.all([
        app.request('/api/price/preview', { method: 'POST', data: { items: [this.direct] } }),
        app.request('/api/addresses'),
      ]);
      p = {
        items: price.lines, goodsAmount: price.goodsAmount, tierDiscount: price.tierDiscount,
        couponDiscount: 0, freight: price.freight, payAmount: price.payAmount, coupons: [],
      };
      this.setData({ addresses: addr.list, address: addr.list[0] || null });
    } else {
      p = await app.request('/api/cart/checkout-preview', { method: 'POST', data: { couponCode: couponCode || undefined } });
      this.setData({ addresses: p.addresses || [], address: (p.addresses || [])[0] || null });
    }
    this.setData({ preview: p });
  },
  pickAddress(e) {
    const id = Number(e.detail.value);
    this.setData({ address: this.data.addresses.find((a) => a.id === id) });
  },
  pickCoupon(e) {
    const list = (this.data.preview.coupons || []).filter((c) => c.status === 'unused' && c.usable);
    if (!list.length) { wx.showToast({ title: '暂无可用优惠券', icon: 'none' }); return; }
    wx.showActionSheet({
      itemList: list.map((c) => \`\${c.title}（-¥\${c.amountText}）\`),
      success: (res) => {
        const code = list[res.tapIndex].code;
        this.setData({ couponCode: code });
        this.fetch(code);
      },
    });
  },
  onRemark(e) { this.setData({ remark: e.detail.value }); },
  addAddress() {
    wx.showModal({
      title: '新增收货地址',
      editable: true,
      placeholderText: '省市区 + 详细地址',
      success: async (res) => {
        if (!res.confirm || !res.content) return;
        await app.request('/api/addresses', {
          method: 'POST',
          data: {
            receiver: app.globalData.user ? app.globalData.user.nickname : '收货人',
            phone: '13800000000', province: '广东省', city: '珠海市', district: '香洲区',
            detail: res.content, isDefault: true,
          },
        });
        wx.showToast({ title: '地址已添加', icon: 'success' });
        this.fetch();
      },
    });
  },
  async submit() {
    const { preview, address } = this.data;
    if (!address) { wx.showToast({ title: '请先添加收货地址', icon: 'none' }); return; }
    wx.showLoading({ title: '提交中' });
    try {
      const payload = { addressId: address.id, couponCode: this.data.couponCode || undefined, remark: this.data.remark };
      if (this.direct) payload.items = [this.direct];
      const order = await app.request('/api/orders', { method: 'POST', data: payload });
      const paid = await app.request(\`/api/orders/\${order.orderNo}/pay\`, { method: 'POST', data: { channel: 'mock_wechat' } });
      app.refreshUser();
      app.refreshCartCount();
      wx.hideLoading();
      wx.showToast({ title: '支付成功', icon: 'success' });
      setTimeout(() => wx.redirectTo({ url: \`/pages/order-detail/order-detail?no=\${paid.orderNo}\` }), 800);
    } catch (e) {
      wx.hideLoading();
    }
  },
});`,
    wxml: `<view class="page" wx:if="{{preview}}">
  <view class="pad">
    <view class="card">
      <block wx:if="{{address}}">
        <view class="row-between">
          <view class="grow">
            <view class="bold">{{address.receiver}} <text class="small muted">{{address.phone}}</text></view>
            <view class="small muted">{{address.province}}{{address.city}}{{address.district}} {{address.detail}}</view>
          </view>
          <picker mode="selector" range="{{addresses}}" range-key="detail" bindchange="pickAddress">
            <view class="btn sm outline">更换</view>
          </picker>
        </view>
      </block>
      <view wx:else class="center">
        <view class="small muted mb10">还没有收货地址</view>
        <view class="btn sm" bindtap="addAddress">添加收货地址</view>
      </view>
    </view>

    <view class="card">
      <view class="card-title">商品清单</view>
      <view wx:for="{{preview.items}}" wx:key="index" class="goods-row">
        <image class="goods-thumb" src="{{item.image}}" mode="aspectFill" />
        <view class="grow">
          <view class="small bold">{{item.title}}</view>
          <view class="tiny muted">{{item.spec}} × {{item.qty}}</view>
        </view>
        <view class="small price">¥{{item.price * item.qty / 100}}</view>
      </view>
    </view>

    <view class="card">
      <view class="row-between mb10">
        <view class="small">优惠券</view>
        <view class="btn sm outline" bindtap="pickCoupon">{{couponCode ? couponCode : '选择优惠券'}}</view>
      </view>
      <view class="row-between"><view class="small muted">商品金额</view><view class="small">¥{{preview.goodsAmount / 100}}</view></view>
      <view class="row-between" wx:if="{{preview.tierDiscount}}"><view class="small muted">会员折扣</view><view class="small">-¥{{preview.tierDiscount / 100}}</view></view>
      <view class="row-between" wx:if="{{preview.couponDiscount}}"><view class="small muted">优惠券</view><view class="small">-¥{{preview.couponDiscount / 100}}</view></view>
      <view class="row-between"><view class="small muted">运费</view><view class="small">{{preview.freight ? '¥' + preview.freight / 100 : '免运费'}}</view></view>
      <view class="divider"></view>
      <view class="row-between"><view class="bold">应付金额</view><view class="price">¥{{preview.payAmount / 100}}</view></view>
    </view>

    <view class="card">
      <view class="small muted mb10">订单备注（可选）</view>
      <input class="input" placeholder="如：需要礼盒包装 / 指定送达时间" value="{{remark}}" bindinput="onRemark" />
    </view>

    <view class="notice info mb10">支付方式：微信支付（演示环境为模拟支付，不产生真实扣款）。下单后系统会自动为本单分配一物一码，可扫码溯源。</view>

    <view class="btn block" bindtap="submit">提交订单并支付 ¥{{preview.payAmount / 100}}</view>
  </view>
</view>`,
  },

  'pages/orders/orders': {
    nav: '我的订单',
    js: `const app = getApp();
Page({
  data: { list: [], status: 'all' },
  onShow() { this.fetch(); },
  async fetch() {
    if (!app.globalData.token) { wx.navigateTo({ url: '/pages/login/login' }); return; }
    const q = this.data.status === 'all' ? '' : '?status=' + this.data.status;
    const d = await app.request('/api/orders' + q);
    this.setData({ list: d.list });
  },
  pick(e) { this.setData({ status: e.currentTarget.dataset.s }); this.fetch(); },
  detail(e) { wx.navigateTo({ url: \`/pages/order-detail/order-detail?no=\${e.currentTarget.dataset.no}\` }); },
  async pay(e) {
    await app.request(\`/api/orders/\${e.currentTarget.dataset.no}/pay\`, { method: 'POST', data: { channel: 'mock_wechat' } });
    wx.showToast({ title: '支付成功', icon: 'success' });
    this.fetch();
  },
  async confirm(e) {
    await app.request(\`/api/orders/\${e.currentTarget.dataset.no}/confirm\`, { method: 'POST' });
    wx.showToast({ title: '已确认收货', icon: 'success' });
    this.fetch();
  },
});`,
    wxml: `<view class="page">
  <scroll-view scroll-x class="chat-quick">
    <view class="chip" data-s="all" bindtap="pick">全部</view>
    <view class="chip" data-s="pending_pay" bindtap="pick">待付款</view>
    <view class="chip" data-s="paid" bindtap="pick">待发货</view>
    <view class="chip" data-s="shipped" bindtap="pick">待收货</view>
    <view class="chip" data-s="done" bindtap="pick">已完成</view>
  </scroll-view>

  <view class="pad">
    <view wx:for="{{list}}" wx:key="orderNo" class="card">
      <view class="row-between mb10">
        <view class="tiny muted">{{item.orderNo}}</view>
        <view class="small bold" style="color:#2e6b4f">{{item.statusText}}</view>
      </view>
      <view wx:for="{{item.items}}" wx:for-item="it" wx:key="title" class="goods-row">
        <image class="goods-thumb" src="{{it.image}}" mode="aspectFill" />
        <view class="grow">
          <view class="small bold">{{it.title}}</view>
          <view class="tiny muted">{{it.spec}} × {{it.qty}}</view>
        </view>
      </view>
      <view class="row-between mt10">
        <view class="small muted">实付</view>
        <view class="price">¥{{item.payAmount / 100}}</view>
      </view>
      <view class="row mt10" style="gap:16rpx">
        <view class="btn sm ghost" data-no="{{item.orderNo}}" bindtap="detail">订单详情</view>
        <view wx:if="{{item.status === 'pending_pay'}}" class="btn sm" data-no="{{item.orderNo}}" bindtap="pay">去支付</view>
        <view wx:if="{{item.status === 'shipped'}}" class="btn sm" data-no="{{item.orderNo}}" bindtap="confirm">确认收货</view>
      </view>
    </view>
    <view wx:if="{{!list.length}}" class="empty">暂无订单</view>
  </view>
</view>`,
  },

  'pages/order-detail/order-detail': {
    nav: '订单详情',
    js: `const app = getApp();
Page({
  data: { o: null },
  onLoad(q) { this.no = q.no; this.fetch(); },
  onShow() { if (this.no) this.fetch(); },
  async fetch() { this.setData({ o: await app.request(\`/api/orders/\${this.no}\`) }); },
  async pay() {
    await app.request(\`/api/orders/\${this.no}/pay\`, { method: 'POST', data: { channel: 'mock_wechat' } });
    wx.showToast({ title: '支付成功', icon: 'success' });
    this.fetch();
  },
  async confirm() {
    await app.request(\`/api/orders/\${this.no}/confirm\`, { method: 'POST' });
    wx.showToast({ title: '已确认收货', icon: 'success' });
    this.fetch();
  },
  traceCode(e) { wx.navigateTo({ url: \`/pages/trace/trace?code=\${e.currentTarget.dataset.code}\` }); },
});`,
    wxml: `<view class="page" wx:if="{{o}}">
  <view class="pad">
    <view class="card" style="background:#f3f8f4">
      <view class="bold" style="font-size:32rpx">{{o.statusText}}</view>
      <view class="small muted">下单时间 {{o.createdAt}}</view>
    </view>

    <view class="card" wx:if="{{o.logistics.length}}">
      <view class="card-title">🚚 物流轨迹</view>
      <view class="timeline">
        <view wx:for="{{o.logistics}}" wx:key="time" class="tl-item">
          <view class="tl-dot">●</view>
          <view class="tl-head">{{item.text}}</view>
          <view class="tl-meta">{{item.time}}</view>
        </view>
      </view>
    </view>

    <view class="card">
      <view class="card-title">📦 商品</view>
      <view wx:for="{{o.items}}" wx:key="title" class="goods-row">
        <image class="goods-thumb" src="{{item.image}}" mode="aspectFill" />
        <view class="grow">
          <view class="small bold">{{item.title}}</view>
          <view class="tiny muted">{{item.spec}} × {{item.qty}}</view>
          <view class="mt10">
            <text wx:for="{{item.traceCodes}}" wx:for-item="c" wx:key="*this" class="tag" data-code="{{c}}" bindtap="traceCode">溯源 {{c}}</text>
          </view>
        </view>
      </view>
    </view>

    <view class="card">
      <view class="card-title">📍 收货信息</view>
      <view class="small">{{o.address.receiver}} {{o.address.phone}}</view>
      <view class="small muted">{{o.address.province}}{{o.address.city}}{{o.address.district}} {{o.address.detail}}</view>
    </view>

    <view class="card">
      <view class="row-between"><view class="small muted">商品金额</view><view class="small">¥{{o.goodsAmount / 100}}</view></view>
      <view class="row-between"><view class="small muted">运费</view><view class="small">{{o.freight ? '¥' + o.freight / 100 : '免运费'}}</view></view>
      <view class="divider"></view>
      <view class="row-between"><view class="bold">实付</view><view class="price">¥{{o.payAmount / 100}}</view></view>
    </view>

    <view class="row" style="gap:16rpx">
      <view wx:if="{{o.status === 'pending_pay'}}" class="btn grow" bindtap="pay">去支付</view>
      <view wx:if="{{o.status === 'shipped'}}" class="btn grow" bindtap="confirm">确认收货</view>
    </view>
  </view>
</view>`,
  },

  'pages/brand/brand': {
    nav: '品牌故事',
    js: `const app = getApp();
Page({
  data: { b: null },
  onLoad() { this.fetch(); },
  async fetch() { this.setData({ b: await app.request('/api/brand') }); },
});`,
    wxml: `<view class="page" wx:if="{{b}}">
  <image src="{{b.images.scenePicking}}" mode="widthFix" style="width:100%" />
  <view class="pad">
    <view class="card">
      <view class="card-title">🌳 山林里的祝福</view>
      <view wx:for="{{b.story}}" wx:key="*this" class="small" style="color:#4d5b54;margin-bottom:14rpx">{{item}}</view>
    </view>

    <view class="card">
      <view class="card-title">🧬 品牌 DNA</view>
      <image src="{{b.images.brandDna}}" mode="widthFix" style="width:100%;border-radius:16rpx" />
      <view class="row mt10" style="gap:12rpx">
        <view wx:for="{{b.dna}}" wx:key="key" class="card grow center" style="margin:0;background:#f3f8f4">
          <view class="bold" style="color:#2e6b4f">{{item.key}}</view>
          <view class="tiny muted">{{item.desc}}</view>
        </view>
      </view>
    </view>

    <view class="card">
      <view class="card-title">📈 为什么现在做这件事</view>
      <image src="{{b.images.marketSize}}" mode="widthFix" style="width:100%;border-radius:16rpx" />
      <view wx:for="{{b.market.facts}}" wx:key="label" class="row-between" style="padding:12rpx 0;border-bottom:2rpx solid #e5eae6">
        <view class="small grow">{{item.label}}</view>
        <view class="small bold" style="color:#2e6b4f">{{item.value}}</view>
      </view>
    </view>

    <view class="card">
      <view class="card-title">😣 现有抚触油的痛点（调研数据）</view>
      <view wx:for="{{b.market.painPoints}}" wx:key="name" style="margin-bottom:16rpx">
        <view class="row-between small"><view>{{item.name}}</view><view class="bold">{{item.ratio}}%</view></view>
      </view>
    </view>

    <view class="card">
      <view class="card-title">🥇 六大差异化优势</view>
      <view wx:for="{{b.advantages}}" wx:key="dimension" style="margin-bottom:20rpx">
        <view class="bold" style="font-size:27rpx">{{item.dimension}}</view>
        <view class="tiny muted">竞品：{{item.highEnd}}</view>
        <view class="tiny" style="color:#2e6b4f">茶芽芽：{{item.ours}}</view>
      </view>
    </view>

    <view class="card">
      <view class="card-title">🔗 助农闭环</view>
      <image src="{{b.images.closedLoop}}" mode="widthFix" style="width:100%;border-radius:16rpx" />
      <view wx:for="{{b.aidChain}}" wx:key="step" class="small" style="margin-top:12rpx">· <text class="bold">{{item.step}}</text>：{{item.desc}}</view>
    </view>

    <view class="card">
      <view class="card-title">🛡 合规与品控</view>
      <view wx:for="{{b.compliance}}" wx:key="*this" class="small" style="margin-bottom:12rpx">· {{item}}</view>
    </view>

    <view class="card" style="background:#f3f8f4">
      <view class="bold">{{b.fullName}}</view>
      <view class="small muted mt10">{{b.team}}</view>
      <view class="tiny muted">{{b.competition}}</view>
    </view>
  </view>
</view>`,
  },

  'pages/guide/guide': {
    nav: '抚触教程',
    js: `const app = getApp();
Page({
  data: { guides: [], cur: null, month: '' },
  onLoad() { this.fetch(); },
  async fetch(month) {
    const d = await app.request('/api/guides' + (month ? '?month=' + month : ''));
    this.setData({ guides: d.guides, cur: d.current, month: month || '' });
  },
  pick(e) { this.fetch(e.currentTarget.dataset.m); },
  goAI() { wx.switchTab({ url: '/pages/ai/ai' }); },
});`,
    wxml: `<view class="page">
  <scroll-view scroll-x class="chat-quick">
    <view class="chip" data-m="2" bindtap="pick">0-3 个月</view>
    <view class="chip" data-m="5" bindtap="pick">4-6 个月</view>
    <view class="chip" data-m="9" bindtap="pick">6 个月以上</view>
  </scroll-view>

  <view class="pad" wx:if="{{cur}}">
    <view class="card">
      <view class="card-title">{{cur.title}}</view>
      <view class="small muted mb10">建议时长：{{cur.duration}}</view>
      <view wx:for="{{cur.steps}}" wx:key="*this" class="small" style="margin-bottom:14rpx">{{index + 1}}. {{item}}</view>
    </view>

    <view class="card">
      <view class="card-title">💧 用量参考</view>
      <view class="small">· 100ml 家庭装：按压一次 0.5ml，约 2-3 滴 / 小腿</view>
      <view class="small">· 30ml 体验装：按压一次 0.25ml，约 1-2 滴 / 小腿</view>
      <view class="small muted mt10">全身抚触约按压 4-6 次（2-3ml）。记住"少量多次、掌心搓热再上手"。</view>
    </view>

    <view class="card" style="background:#f3f8f4">
      <view class="card-title">⚠️ 抚触禁忌</view>
      <view class="small">· 皮肤破损、渗液、化脓处不要涂油，先就医；</view>
      <view class="small">· 发热、精神差、拒奶期间暂停抚触并就医；</view>
      <view class="small">· 刚吃饱、饥饿哭闹时不做抚触；</view>
      <view class="small">· 宝宝哭闹抗拒时立即停止。</view>
      <view class="btn ghost sm mt20" bindtap="goAI">宝宝有具体症状？问芽芽 ›</view>
    </view>
  </view>
</view>`,
  },
};

/* ---------------- 复制图片素材，让小程序工程自带图片（离线可预览） ---------------- */
function copyAssets() {
  const src = path.resolve(process.cwd(), 'public', 'assets');
  const dst = path.join(OUT, 'assets');
  let n = 0;
  const walk = (from, to) => {
    fs.mkdirSync(to, { recursive: true });
    for (const entry of fs.readdirSync(from, { withFileTypes: true })) {
      const f = path.join(from, entry.name);
      const t = path.join(to, entry.name);
      if (entry.isDirectory()) walk(f, t);
      else if (/\.(png|jpe?g|webp|gif)$/i.test(entry.name)) { fs.copyFileSync(f, t); n += 1; }
    }
  };
  if (fs.existsSync(src)) walk(src, dst);
  return n;
}

/* ---------------- 写入页面文件 ---------------- */
for (const [dir, page] of Object.entries(PAGES)) {
  write(`${dir}.js`, page.js);
  write(`${dir}.wxml`, page.wxml);
  write(`${dir}.wxss`, '/* 页面级样式复用 app.wxss 中的通用类，如需微调在此追加 */\n');
  write(`${dir}.json`, JSON.stringify({
    navigationBarTitleText: page.nav,
    enablePullDownRefresh: dir.endsWith('home/home'),
    backgroundTextStyle: 'light',
  }, null, 2));
}

const imgCount = copyAssets();
console.log(`✅ 已复制本地图片素材 ${imgCount} 张到 miniprogram/assets`);

write('README.md', `# 茶芽芽 · 微信小程序工程

由 \`chayaya/backend\` 的导出脚本生成（\`npm run export:mp\`），与 web 端共用同一套后端 API。

## 导入方式
1. 打开「微信开发者工具」→ 导入项目 → 选择本目录 \`chayaya/miniprogram\`
2. AppID 选择「测试号」即可（\`project.config.json\` 中为 \`touristappid\`）
3. 项目设置里勾选「不校验合法域名」（开发调试用）

## 后端地址
\`app.js\` 顶部：

\`\`\`js
const BASE_URL = 'http://127.0.0.1:8788';
\`\`\`

部署到阿里云 ECS 后改成 \`https://你的域名\`，并在微信公众平台「开发管理 → 服务器域名」把该域名加入
\`request\` 合法域名。

## 页面
| 页面 | 路径 | 对应项目书能力 |
|---|---|---|
| 首页 | pages/home/home | 品牌故事、热销、卖点入口 |
| 产品中心 | pages/shop/shop | 商品分类展示（3.3.1） |
| 商品详情 | pages/product/product | 卖点、参数、用法、价格对比（3.1、3.5.2） |
| 购物车 / 结算 | pages/cart、pages/checkout | 购物车与订单管理（3.3.1） |
| 订单 | pages/orders、pages/order-detail | 物流轨迹、溯源码入口 |
| 溯源 | pages/trace/trace | 一物一码、时间轴、哈希链校验（3.3.2、4.2.2） |
| AI 问症 | pages/ai/ai | 意图识别、多轮对话、症状分级、转人工（4.2.2） |
| 品牌故事 | pages/brand/brand | 产品背景与差异化优势（1.3、1.5） |
| 抚触教程 | pages/guide/guide | 分月龄用量与手法（5.1.2） |
| 我的 | pages/me/me | 三级会员体系、我的溯源码（3.2.1） |
| 登录 | pages/login/login | 手机号验证码 / 微信一键登录 |

## 医疗安全说明
AI 客服页面与对话逻辑内置医疗安全红线：命中发热、化脓渗液、精神差、拒奶、呼吸异常等关键词时，
先输出「请立即就医」再由规则引擎给出非诊疗性护理建议；大模型仅参与话术润色，不参与症状适用性判断。
`);

console.log('✅ 微信小程序工程已导出到:', OUT);
console.log('   页面数:', Object.keys(PAGES).length);
