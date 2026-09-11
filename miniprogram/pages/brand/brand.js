const app = getApp();
Page({
  data: { b: null },
  onLoad() { this.fetch(); },
  async fetch() { this.setData({ b: await app.request('/api/brand') }); },
});