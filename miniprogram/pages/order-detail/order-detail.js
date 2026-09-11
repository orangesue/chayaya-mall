const app = getApp();
Page({
  data: { o: null },
  onLoad(q) { this.no = q.no; this.fetch(); },
  onShow() { if (this.no) this.fetch(); },
  async fetch() { this.setData({ o: await app.request(`/api/orders/${this.no}`) }); },
  async pay() {
    await app.request(`/api/orders/${this.no}/pay`, { method: 'POST', data: { channel: 'mock_wechat' } });
    wx.showToast({ title: '支付成功', icon: 'success' });
    this.fetch();
  },
  async confirm() {
    await app.request(`/api/orders/${this.no}/confirm`, { method: 'POST' });
    wx.showToast({ title: '已确认收货', icon: 'success' });
    this.fetch();
  },
  traceCode(e) { wx.navigateTo({ url: `/pages/trace/trace?code=${e.currentTarget.dataset.code}` }); },
});