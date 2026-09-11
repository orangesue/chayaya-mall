const app = getApp();
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
  goProduct(e) { wx.navigateTo({ url: `/pages/product/product?code=${e.currentTarget.dataset.code}` }); },
  goShop() { wx.switchTab({ url: '/pages/shop/shop' }); },
  goTrace() { wx.switchTab({ url: '/pages/trace/trace' }); },
  goAI() { wx.switchTab({ url: '/pages/ai/ai' }); },
  goBrand() { wx.navigateTo({ url: '/pages/brand/brand' }); },
});