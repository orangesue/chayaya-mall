const app = getApp();
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
  goTraceResult(e) { wx.navigateTo({ url: `/pages/trace/trace?code=${e.currentTarget.dataset.code}` }); },
  goBrand() { wx.navigateTo({ url: '/pages/brand/brand' }); },
  goGuide() { wx.navigateTo({ url: '/pages/guide/guide' }); },
  async bookTrip() {
    await app.request('/api/bookings', { method: 'POST', data: { activity: '浒口村溯源之旅' } });
    wx.showToast({ title: '报名成功', icon: 'success' });
  },
  logout() { app.logout(); this.setData({ logged: false, me: null }); wx.showToast({ title: '已退出', icon: 'none' }); },
});