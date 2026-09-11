const app = getApp();
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
  goProduct(e) { wx.navigateTo({ url: `/pages/product/product?code=${e.currentTarget.dataset.code}` }); },
  async addCart(e) {
    if (!app.requireLogin()) return;
    await app.request('/api/cart', { method: 'POST', data: { code: e.currentTarget.dataset.code, qty: 1 } });
    wx.showToast({ title: '已加入购物车', icon: 'success' });
    app.refreshCartCount();
  },
});