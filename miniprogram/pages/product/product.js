const app = getApp();
Page({
  data: { p: null, related: [], batches: [], gallery: [], current: 0 },
  onLoad(q) { this.code = q.code; this.fetch(); },
  async fetch() {
    const d = await app.request(`/api/products/${this.code}`);
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
    wx.navigateTo({ url: `/pages/checkout/checkout?code=${this.code}&qty=1` });
  },
  goTrace() { wx.switchTab({ url: '/pages/trace/trace' }); },
  goGuide() { wx.navigateTo({ url: '/pages/guide/guide' }); },
  goAI() { wx.switchTab({ url: '/pages/ai/ai' }); },
  openReport() {
    // 检测报告是后端托管的 HTML，小程序内用 web-view 打开需要业务域名；这里先复制链接
    const url = app.globalData.baseUrl + '/assets/reports/SGS-2026-0115.html';
    wx.setClipboardData({ data: url, success: () => wx.showToast({ title: '报告链接已复制，可在浏览器打开', icon: 'none' }) });
  },
});