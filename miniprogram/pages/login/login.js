const app = getApp();
Page({
  data: { phone: '', code: '', counting: 0, demoCode: '123456' },
  onInput(e) { this.setData({ [e.currentTarget.dataset.k]: e.detail.value }); },
  async sendCode() {
    if (!/^1\d{10}$/.test(this.data.phone)) { wx.showToast({ title: '请输入正确手机号', icon: 'none' }); return; }
    const d = await app.request('/api/auth/send-code', { method: 'POST', data: { phone: this.data.phone } });
    if (d.code) this.setData({ code: d.code });
    wx.showToast({ title: d.code ? '验证码已填入' : '验证码已发送', icon: 'none' });
    let left = 60;
    this.setData({ counting: left });
    const t = setInterval(() => {
      left -= 1;
      this.setData({ counting: left });
      if (left <= 0) clearInterval(t);
    }, 1000);
  },
  async doLogin() {
    if (!this.data.phone || !this.data.code) { wx.showToast({ title: '请填写手机号和验证码', icon: 'none' }); return; }
    const d = await app.request('/api/auth/login-code', {
      method: 'POST', data: { phone: this.data.phone, code: this.data.code },
    });
    app.setToken(d.token);
    app.globalData.user = d.user;
    await app.refreshCartCount();
    wx.showToast({ title: '登录成功', icon: 'success' });
    setTimeout(() => wx.navigateBack({ fail: () => wx.switchTab({ url: '/pages/home/home' }) }), 700);
  },
  async wxLogin() {
    try {
      const d = await app.wechatLogin();
      wx.showToast({ title: d.mode === 'mock' ? '演示模式登录成功' : '微信登录成功', icon: 'success' });
      setTimeout(() => wx.navigateBack({ fail: () => wx.switchTab({ url: '/pages/home/home' }) }), 700);
    } catch (e) { /* 已提示 */ }
  },
});