const app = getApp();
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
    await app.request(`/api/cart/${id}`, { method: 'PATCH', data: { qty } });
    this.fetch();
  },
  async remove(e) {
    await app.request(`/api/cart/${e.currentTarget.dataset.id}`, { method: 'DELETE' });
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
});