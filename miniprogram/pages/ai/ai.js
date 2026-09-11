const app = getApp();
Page({
  data: { messages: [], quick: [], input: '', sending: false, greeting: '', disclaimer: '' },
  onLoad() { this.boot(); },
  async boot() {
    const d = await app.request('/api/ai/bootstrap');
    this.setData({
      quick: d.quick, greeting: d.greeting, disclaimer: d.disclaimer,
      messages: [{ role: 'assistant', content: d.greeting, cards: [] }],
    });
  },
  onInput(e) { this.setData({ input: e.detail.value }); },
  tapQuick(e) { this.ask(e.currentTarget.dataset.q); },
  send() { this.ask(this.data.input); },
  async ask(text) {
    const value = (text || '').trim();
    if (!value || this.data.sending) return;
    const messages = this.data.messages.concat([{ role: 'user', content: value, cards: [] }]);
    this.setData({ messages, input: '', sending: true });
    try {
      const res = await app.request('/api/ai/chat', {
        method: 'POST',
        data: { sessionId: app.globalData.sessionId, text: value },
      });
      const r = res.reply;
      const next = messages.concat([{
        role: 'assistant', content: r.answer, cards: r.cards || [],
        triage: r.triage, intent: r.intent, handoff: r.handoff,
        levelClass: 'triage-' + (r.triage && r.triage.level ? r.triage.level : 'ok'),
        levelText: ({
          ok: '可以按日常护理使用', caution: '需谨慎，建议先咨询医生',
          avoid: '患处暂不要涂油', emergency: '请先带宝宝就医',
        })[r.triage && r.triage.level] || '',
      }]);
      this.setData({ messages: next, sending: false });
      if (r.handoff && r.handoff.needed) {
        wx.showModal({
          title: '已为你转接人工客服',
          content: (r.handoff.reasons || []).join('；') + '\n客服工作时间 9:00-21:00',
          showCancel: false,
        });
      }
    } catch {
      this.setData({ sending: false });
    }
  },
  openCard(e) {
    const url = e.currentTarget.dataset.url || '';
    if (!url) return;
    if (url.startsWith('/#/product/')) {
      wx.navigateTo({ url: `/pages/product/product?code=${url.split('/').pop()}` });
    } else if (url.startsWith('/#/trace')) {
      wx.switchTab({ url: '/pages/trace/trace' });
    } else if (url.includes('/guide')) {
      wx.navigateTo({ url: '/pages/guide/guide' });
    } else if (url.includes('/orders')) {
      wx.navigateTo({ url: '/pages/orders/orders' });
    } else if (url.startsWith('/assets/')) {
      // 检测报告等后端托管的 HTML：复制链接，便于在浏览器打开
      wx.setClipboardData({ data: app.globalData.baseUrl + url, success: () => wx.showToast({ title: '报告链接已复制', icon: 'none' }) });
    } else {
      wx.setClipboardData({ data: app.globalData.baseUrl + url });
    }
  },
});