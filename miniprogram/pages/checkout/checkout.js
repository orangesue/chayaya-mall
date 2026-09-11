const app = getApp();
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
      itemList: list.map((c) => `${c.title}（-¥${c.amountText}）`),
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
      const paid = await app.request(`/api/orders/${order.orderNo}/pay`, { method: 'POST', data: { channel: 'mock_wechat' } });
      app.refreshUser();
      app.refreshCartCount();
      wx.hideLoading();
      wx.showToast({ title: '支付成功', icon: 'success' });
      setTimeout(() => wx.redirectTo({ url: `/pages/order-detail/order-detail?no=${paid.orderNo}` }), 800);
    } catch (e) {
      wx.hideLoading();
    }
  },
});