const app = getApp();
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
  detail(e) { wx.navigateTo({ url: `/pages/order-detail/order-detail?no=${e.currentTarget.dataset.no}` }); },
  async pay(e) {
    await app.request(`/api/orders/${e.currentTarget.dataset.no}/pay`, { method: 'POST', data: { channel: 'mock_wechat' } });
    wx.showToast({ title: '支付成功', icon: 'success' });
    this.fetch();
  },
  async confirm(e) {
    await app.request(`/api/orders/${e.currentTarget.dataset.no}/confirm`, { method: 'POST' });
    wx.showToast({ title: '已确认收货', icon: 'success' });
    this.fetch();
  },
});