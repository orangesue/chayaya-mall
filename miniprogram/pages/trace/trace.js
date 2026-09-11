const app = getApp();
Page({
  data: { mode: 'home', overview: null, result: null, batch: null, code: '', qr: null },
  onLoad(q) {
    if (q.t || q.code) this.verify(q.t, q.code);
    else this.fetchOverview();
  },
  onShow() { if (this.data.mode === 'home') this.fetchOverview(); },
  async fetchOverview() {
    const [overview, codes] = await Promise.all([
      app.request('/api/trace/overview'),
      app.request('/api/trace/codes', { silent: true }).catch(() => ({ list: [] })),
    ]);
    this.setData({ mode: 'home', overview, demoCodes: (codes.list || []).slice(0, 8) });
  },
  onInput(e) { this.setData({ code: e.detail.value }); },
  query() {
    if (!this.data.code) { wx.showToast({ title: '请输入溯源码', icon: 'none' }); return; }
    this.verify(null, this.data.code);
  },
  async demo() {
    const d = await app.request('/api/trace/demo');
    const token = d.url.split('t=')[1];
    this.verify(token, null);
  },
  async verify(t, code) {
    const d = await app.request(`/api/trace/verify?${t ? 't=' + encodeURIComponent(t) : 'code=' + encodeURIComponent(code)}`);
    this.setData({ mode: d.authentic ? 'result' : 'fail', result: d });
  },
  async openBatch(e) {
    const d = await app.request(`/api/trace/batch/${e.currentTarget.dataset.batch}`);
    this.setData({ mode: 'batch', batch: d });
  },
  back() { this.setData({ mode: 'home', result: null, batch: null }); this.fetchOverview(); },
  async genQr() {
    if (!this.data.code) { wx.showToast({ title: '先输入溯源码', icon: 'none' }); return; }
    const d = await app.request(`/api/trace/qr/${this.data.code}`);
    this.setData({ qr: d });
  },
});