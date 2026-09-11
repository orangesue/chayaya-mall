const app = getApp();
Page({
  data: { guides: [], cur: null, month: '' },
  onLoad() { this.fetch(); },
  async fetch(month) {
    const d = await app.request('/api/guides' + (month ? '?month=' + month : ''));
    this.setData({ guides: d.guides, cur: d.current, month: month || '' });
  },
  pick(e) { this.fetch(e.currentTarget.dataset.m); },
  goAI() { wx.switchTab({ url: '/pages/ai/ai' }); },
});