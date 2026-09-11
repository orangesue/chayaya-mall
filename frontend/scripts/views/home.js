/** 首页 / 产品中心 / 商品详情 / 抚触教程 / 品牌故事 */
import { route } from '../router.js';
import { get, post, state, toast, yuan, yuanShort, track } from '../store.js';

export const esc = (s) => String(s ?? '')
  .replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/"/g, '&quot;');

/* ============================================================
 * 首页
 * ============================================================ */
route('/', async () => {
  const [home, stats] = await Promise.all([
    get('/api/home'),
    get('/api/stats/overview', { silent: true }).catch(() => null),
  ]);
  const b = home.brand;
  const hot = home.hot || [];

  const html = `
  <div class="page">
    <section class="hero">
      <img src="${b.images.poster}" alt="茶芽芽 母婴专用抚触油" />
      <div class="hero-mask">
        <div class="slogan">${esc(b.slogan)}</div>
        <div class="slogan-sub">${esc(b.positioning)} · 产自${esc(b.origin)}</div>
      </div>
    </section>

    <div class="page-pad" style="margin-top:-6px">
      <div class="card" style="background:linear-gradient(135deg,#eaf6ef,#fdfaf1)">
        <div class="row-between">
          <div>
            <div class="bold" style="font-size:15px">${esc(b.subSlogan)}</div>
            <div class="small muted mt6">注册会员即享浒口村集体直供价</div>
          </div>
          <a class="btn sm" href="#/shop">去看看</a>
        </div>
      </div>

      <div class="fact-grid mb14">
        ${(home.marketFacts || []).map((f) => `
          <div class="fact"><div class="v">${esc(f.value)}</div><div class="k">${esc(f.label)}</div></div>`).join('')}
      </div>

      <div class="card">
        <div class="card-title">🌱 品牌故事<span class="sub">山林里的祝福</span></div>
        ${(home.story || []).slice(0, 2).map((p) => `<p class="small" style="color:var(--ink-2);margin:0 0 8px">${esc(p)}</p>`).join('')}
        <a class="small" style="color:var(--green-600);font-weight:600" href="#/brand">阅读完整品牌故事 →</a>
      </div>

      <div class="row-between mb10">
        <div class="card-title" style="margin:0">🛒 热销单品</div>
        <a class="small muted" href="#/shop">全部商品 ›</a>
      </div>
      <div class="goods-grid mb14">
        ${hot.map(goodsCard).join('')}
      </div>

      <div class="card">
        <div class="card-title">🔍 一瓶一码，扫码看它的前世今生</div>
        <p class="small muted" style="margin:0 0 10px">刮开瓶底涂层扫码，可查看这一瓶对应的油茶林地块、采摘日期、压榨批次、农户姓名与 SGS 检测报告。</p>
        <img src="${b.images.traceSystem}" style="border-radius:10px;margin-bottom:10px" alt="全程溯源体系" />
        <div class="btn-row">
          <a class="btn ghost" href="#/trace">体验扫码溯源</a>
          <a class="btn outline" href="#/ai">问芽芽客服</a>
        </div>
      </div>

      <div class="card">
        <div class="card-title">🤝 消费即助农</div>
        <div class="steps">
          <div class="step">对接浒口村合作社，锁定山茶油源头供应</div>
          <div class="step">古法工艺 + 物理低温冷榨，升级为母婴级护肤品</div>
          <div class="step">收益回流村集体与农户，带动种植、采摘、初加工增收</div>
        </div>
        <div class="tiny muted">团队：${esc(b.team)}</div>
      </div>

      ${stats ? `
      <div class="card" style="background:var(--green-50)">
        <div class="row" style="justify-content:space-around;text-align:center">
          <div><div class="bold" style="font-size:17px;color:var(--green-700)">${stats.users}</div><div class="tiny muted">注册用户</div></div>
          <div><div class="bold" style="font-size:17px;color:var(--green-700)">${stats.orders}</div><div class="tiny muted">成交订单</div></div>
          <div><div class="bold" style="font-size:17px;color:var(--green-700)">${stats.aidFamilies}</div><div class="tiny muted">合作农户</div></div>
        </div>
      </div>` : ''}

      <div class="notice info">
        本小程序为「浒口茶油·乡味新生」大学生创业项目的技术实现，包含商品购买、产品背书、一物一码溯源与 AI 客服四大模块；
        AI 客服不提供医疗诊断，宝宝出现异常请及时就医。
      </div>
    </div>
  </div>`;

  return { html, title: '茶芽芽 · 源头自营', back: false, tab: 'home' };
});

function goodsCard(p) {
  return `
  <a class="card" href="#/product/${p.code}">
    <div class="thumb"><img src="${p.image}" alt="${esc(p.title)}" loading="lazy" /></div>
    <div class="info">
      <div class="name">${esc(p.title)}</div>
      <div class="spec">${esc(p.spec)}${p.presale ? ' · 预售' : ''}</div>
      <div class="row-between">
        <span class="price"><span class="unit">¥</span><span class="num">${(p.price / 100).toFixed(0)}</span></span>
        <span class="tiny muted">已售 ${p.sales}</span>
      </div>
      <div class="mt6">${p.tags.slice(0, 2).map((t) => `<span class="tag">${esc(t)}</span>`).join('')}</div>
    </div>
  </a>`;
}

/* ============================================================
 * 产品中心
 * ============================================================ */
route('/shop', async ({ query }) => {
  const all = query.get('all') === '1';
  const [data, brand] = await Promise.all([
    get(`/api/products?size=50${all ? '&all=1' : ''}`),
    get('/api/brand'),
  ]);
  const cats = brand.tiers ? [] : [];
  void cats;
  const categories = await get('/api/home').then((h) => h.categories);
  const active = query.get('cat') || 'all';

  const list = active === 'all' ? data.list : data.list.filter((p) => p.category === active);

  const html = `
  <div class="page">
    <div class="tab-strip">
      <a class="chip ${active === 'all' ? 'on' : ''}" href="#/shop">全部（${data.total}）</a>
      ${categories.map((c) => `<a class="chip ${active === c.key ? 'on' : ''}" href="#/shop?cat=${c.key}">${esc(c.name)}${c.count ? `（${c.count}）` : ''}</a>`).join('')}
    </div>

    <div class="page-pad">
      <div class="notice info mb14">
        核心卖点：天然物理冷榨山茶油 · 0 添加 · 母婴安全 · 一物一码全程溯源 · 乡村助农
      </div>

      ${list.length ? list.map(productRow).join('') : '<div class="empty"><div class="ico">🧴</div><p>该分类暂无在售商品</p></div>'}

      <div class="card mt14">
        <div class="card-title">💡 不知道怎么选？</div>
        <p class="small muted" style="margin:0 0 10px">首次接触建议先试 30ml 体验装；长期自用直接上 100ml 家庭装（每 10ml 只要 6.9 元）；送礼选满月礼礼盒。</p>
        <a class="btn ghost block" href="#/ai">让芽芽帮你搭配</a>
      </div>
    </div>
  </div>`;

  return { html, title: '产品中心', back: false, tab: 'shop' };
});

function productRow(p) {
  return `
  <div class="card" style="padding:12px">
    <div class="goods-row" style="border:0;padding:0">
      <a class="thumb" href="#/product/${p.code}"><img src="${p.image}" alt="${esc(p.title)}" loading="lazy" /></a>
      <div class="grow">
        <a href="#/product/${p.code}"><div class="bold" style="font-size:14px">${esc(p.title)}</div></a>
        <div class="small muted">${esc(p.subtitle || p.spec)}</div>
        <div class="mt6">${p.tags.map((t) => `<span class="tag ${t.includes('预售') ? 'warn' : ''}">${esc(t)}</span>`).join('')}</div>
        <div class="row-between mt6">
          <span class="price"><span class="unit">¥</span><span class="num">${(p.price / 100).toFixed(2)}</span>
            ${p.listPrice > p.price ? `<span class="price-old">¥${(p.listPrice / 100).toFixed(2)}</span>` : ''}</span>
          ${p.presale || p.stock <= 0
            ? `<button class="btn xs ghost" data-presale="${p.code}">预约到货</button>`
            : `<button class="btn xs" data-add="${p.code}">加入购物车</button>`}
        </div>
      </div>
    </div>
  </div>`;
}

/* ============================================================
 * 商品详情
 * ============================================================ */
route('/product/:code', async ({ params }) => {
  const { product: p, related, batches } = await get(`/api/products/${params.code}`);
  const d = p.detail || {};
  let gallery = p.gallery?.length ? p.gallery : [p.image];
  let idx = 0;

  const html = `
  <div class="page">
    <section style="background:#fff">
      <div style="aspect-ratio:1/1;background:var(--green-50)">
        <img id="hero-img" src="${gallery[0]}" alt="${esc(p.title)}" style="width:100%;height:100%;object-fit:cover" />
      </div>
      <div style="display:flex;gap:8px;padding:10px 14px;overflow-x:auto">
        ${gallery.map((g, i) => `
          <img src="${g}" data-thumb="${i}" style="width:52px;height:52px;border-radius:8px;object-fit:cover;border:2px solid ${i === 0 ? 'var(--green-500)' : 'transparent'};flex:0 0 auto;cursor:pointer" />`).join('')}
      </div>
    </section>

    <div class="page-pad">
      <div class="card">
        <div class="row-between">
          <span class="price"><span class="unit">¥</span><span class="num" style="font-size:23px">${(p.price / 100).toFixed(2)}</span>
            ${p.listPrice > p.price ? `<span class="price-old">¥${(p.listPrice / 100).toFixed(2)}</span>` : ''}</span>
          <span class="tiny muted">已售 ${p.sales} · 库存 ${p.stock}</span>
        </div>
        <div class="bold mt6" style="font-size:16px">${esc(p.title)}</div>
        <div class="small muted">${esc(p.subtitle || p.spec)}</div>
        <div class="mt10">${p.tags.map((t) => `<span class="tag">${esc(t)}</span>`).join('')}</div>
      </div>

      <div class="card">
        <div class="card-title">✨ 六大核心卖点</div>
        ${(p.sellingPoints || []).map((s) => `
          <div class="mb10">
            <div class="bold" style="font-size:13.5px">· ${esc(s.title)}</div>
            <div class="small muted">${esc(s.desc)}</div>
          </div>`).join('')}
      </div>

      ${d.positioning ? `
      <div class="card">
        <div class="card-title">🎯 产品定位</div>
        <p class="small" style="margin:0 0 8px">${esc(d.positioning)}</p>
        <div class="small muted">适用人群：${esc(d.audience || '')}</div>
        <div class="mt6">${(d.coreValues || []).map((v) => `<span class="tag tea">${esc(v)}</span>`).join('')}</div>
      </div>` : ''}

      ${d.specs?.length ? `
      <div class="card">
        <div class="card-title">📋 产品参数</div>
        <table class="table">
          ${d.specs.map((s) => `<tr><th style="width:38%">${esc(s.k)}</th><td>${esc(s.v)}</td></tr>`).join('')}
        </table>
      </div>` : ''}

      ${d.usage?.length ? `
      <div class="card">
        <div class="card-title">🧴 使用方法</div>
        <div class="steps">${d.usage.map((u) => `<div class="step">${esc(u)}</div>`).join('')}</div>
      </div>` : ''}

      ${d.package?.length ? `
      <div class="card">
        <div class="card-title">🎨 包装与设计亮点</div>
        ${d.package.map((u) => `<p class="small" style="margin:0 0 7px;color:var(--ink-2)">· ${esc(u)}</p>`).join('')}
        <img src="/assets/img/image21.png" style="border-radius:10px;margin-top:6px" alt="防回流婴儿专用油头" />
        <div class="tiny muted center mt6">防回流婴儿专用油头：微孔定量、隔绝空气与细菌</div>
      </div>` : ''}

      ${d.safety?.length ? `
      <div class="card">
        <div class="card-title">🛡 安全与合规</div>
        <div class="steps">${d.safety.map((u) => `<div class="step">${esc(u)}</div>`).join('')}</div>
        <a class="btn ghost sm mt10" href="/assets/reports/SGS-2026-0115.html" target="_blank">查看 SGS 检测报告 ›</a>
      </div>` : ''}

      ${batches?.length ? `
      <div class="card">
        <div class="card-title">🔍 在售批次（可溯源）</div>
        ${batches.map((b) => `
          <div class="row-between small" style="padding:5px 0;border-bottom:1px dashed var(--line)">
            <span class="bold">${esc(b.batch_no)}</span>
            <span class="muted">${esc(b.farmer)} · ${esc(String(b.harvest_date).slice(0, 10))}</span>
          </div>`).join('')}
        <a class="btn outline block mt10" href="#/trace?batch=${encodeURIComponent(batches[0].batch_no)}">查看该批次全流程溯源</a>
      </div>` : ''}

      ${d.comparison?.length ? `
      <div class="card">
        <div class="card-title">⚖️ 价格对比</div>
        <table class="table">
          <tr><th>产品</th><th>规格</th><th>价格</th><th>每 10ml</th></tr>
          ${d.comparison.map((c) => `
            <tr class="${c.name.includes('茶芽芽') ? 'ours' : ''}">
              <td>${esc(c.name)}${c.note ? `<div class="tiny muted">${esc(c.note)}</div>` : ''}</td>
              <td>${esc(c.spec)}</td>
              <td>¥${(c.price / 100).toFixed(2)}</td>
              <td>¥${(c.per10ml / 100).toFixed(2)}</td>
            </tr>`).join('')}
        </table>
        <p class="small muted mt10">${esc(d.comparisonSummary || '')}</p>
      </div>` : ''}

      <div class="card">
        <div class="card-title">🤖 有疑问？问芽芽</div>
        <p class="small muted" style="margin:0 0 10px">宝宝皮肤能不能用、一次用多少、怎么抚触，都可以直接问 AI 客服（涉及症状会先提示就医）。</p>
        <a class="btn ghost block" href="#/ai">咨询 AI 客服</a>
      </div>

      ${related.length ? `
      <div class="card-title mt14">你可能还需要</div>
      <div class="goods-grid">${related.map(goodsCard).join('')}</div>` : ''}
    </div>

    <div style="height:64px"></div>
    <div style="position:fixed;bottom:calc(var(--tabbar-h) + env(safe-area-inset-bottom,0px));left:50%;transform:translateX(-50%);width:100%;max-width:var(--maxw);background:#fff;border-top:1px solid var(--line);padding:9px 12px;display:flex;gap:8px;z-index:55">
      <a class="btn outline" style="flex:0 0 auto;padding:10px 14px" href="#/ai">问客服</a>
      ${p.presale || p.stock <= 0
        ? `<button class="btn grow" data-presale="${p.code}">预约到货提醒</button>`
        : `<button class="btn ghost grow" data-add="${p.code}">加入购物车</button>
           <button class="btn grow" data-buy="${p.code}">立即购买</button>`}
    </div>
  </div>`;

  const mount = () => {
    document.querySelectorAll('[data-thumb]').forEach((el) => {
      el.addEventListener('click', () => {
        idx = Number(el.dataset.thumb);
        document.getElementById('hero-img').src = gallery[idx];
        document.querySelectorAll('[data-thumb]').forEach((t) => { t.style.borderColor = 'transparent'; });
        el.style.borderColor = 'var(--green-500)';
      });
    });

    const addBtn = document.querySelector('[data-add]');
    if (addBtn) {
      addBtn.addEventListener('click', async () => {
        if (!state.token) { toast('请先登录'); location.hash = '#/login'; return; }
        try {
          await post('/api/cart', { code: p.code, qty: 1 });
          track('cart', p.code);
          toast('已加入购物车');
          const { refreshCartCount } = await import('../store.js');
          refreshCartCount();
        } catch { /* 已提示 */ }
      });
    }

    const buyBtn = document.querySelector('[data-buy]');
    if (buyBtn) {
      buyBtn.addEventListener('click', () => {
        if (!state.token) { toast('请先登录'); location.hash = '#/login'; return; }
        track('cart', p.code);
        location.hash = `#/checkout?code=${p.code}&qty=1`;
      });
    }

    const preBtn = document.querySelector('[data-presale]');
    if (preBtn) {
      preBtn.addEventListener('click', async () => {
        await post('/api/feedback', { type: 'presale', content: `预约到货：${p.title} ${p.spec}` }).catch(() => {});
        toast('已登记，到货后我们会第一时间通知你');
      });
    }
  };

  return { html, title: p.title, mount, keepScroll: true };
});

/* ============================================================
 * 抚触教程
 * ============================================================ */
route('/guide', async ({ query }) => {
  const month = query.get('month');
  const data = await get(`/api/guides${month ? `?month=${month}` : ''}`);
  const cur = data.current;

  const html = `
  <div class="page">
    <div class="tab-strip">
      ${data.guides.map((g) => `<a class="chip ${g.key === cur.key ? 'on' : ''}" href="#/guide?month=${g.key === 'm0-3' ? 2 : g.key === 'm4-6' ? 5 : 9}">${esc(g.title.split('：')[0])}</a>`).join('')}
    </div>
    <div class="page-pad">
      <div class="card">
        <div class="card-title">${esc(cur.title)}</div>
        <div class="small muted mb10">建议时长：${esc(cur.duration)}</div>
        <div class="steps">${cur.steps.map((s) => `<div class="step">${esc(s)}</div>`).join('')}</div>
      </div>

      <div class="card">
        <div class="card-title">💧 用量参考</div>
        <table class="table">
          <tr><th>规格</th><th>按压一次</th><th>单部位用量</th></tr>
          <tr><td>100ml 家庭装</td><td>0.5ml</td><td>约 2-3 滴 / 小腿</td></tr>
          <tr><td>30ml 体验装</td><td>0.25ml</td><td>约 1-2 滴 / 小腿</td></tr>
        </table>
        <p class="small muted mt10">全身抚触约按压 4-6 次（2-3ml）。记住"少量多次、掌心搓热再上手"。</p>
      </div>

      <div class="card" style="background:var(--green-50)">
        <div class="card-title">⚠️ 抚触禁忌</div>
        <div class="small" style="color:var(--ink-2)">
          · 皮肤破损、渗液、化脓处<b>不要涂油</b>，先就医；<br />
          · 发热、精神差、拒奶期间暂停抚触并就医；<br />
          · 刚吃饱、饥饿哭闹时不做抚触；<br />
          · 宝宝哭闹抗拒时立即停止，不要强行操作。
        </div>
        <a class="btn ghost sm mt10" href="#/ai">宝宝有具体症状？问芽芽 ›</a>
      </div>
    </div>
  </div>`;

  return { html, title: '抚触教程', tab: 'trace' };
});

/* ============================================================
 * 品牌故事与产品背景（对应项目书 1.3 / 3.2.3 / 1.5）
 * ============================================================ */
route('/brand', async () => {
  const b = await get('/api/brand');
  const html = `
  <div class="page">
    <section class="hero">
      <img src="${b.images.scenePicking}" alt="浒口村油茶林" />
    </section>
    <div class="page-pad">
      <div class="card">
        <div class="card-title">🌳 山林里的祝福</div>
        ${b.story.map((p) => `<p class="small" style="color:var(--ink-2);margin:0 0 9px">${esc(p)}</p>`).join('')}
      </div>

      <div class="card">
        <div class="card-title">🧬 品牌 DNA</div>
        <img src="${b.images.brandDna}" style="border-radius:10px;margin-bottom:10px" alt="品牌DNA" />
        <div class="row" style="gap:8px">
          ${b.dna.map((d) => `<div class="fact grow center"><div class="v">${esc(d.key)}</div><div class="k">${esc(d.desc)}</div></div>`).join('')}
        </div>
      </div>

      <div class="card">
        <div class="card-title">📈 为什么现在做这件事</div>
        <img src="${b.images.marketSize}" style="border-radius:10px;margin-bottom:10px" alt="婴童护肤市场规模" />
        <div class="fact-grid">
          ${b.market.facts.map((f) => `<div class="fact"><div class="v">${esc(f.value)}</div><div class="k">${esc(f.label)}</div></div>`).join('')}
        </div>
      </div>

      <div class="card">
        <div class="card-title">😣 现有抚触油的痛点（调研数据）</div>
        ${b.market.painPoints.map((p) => `
          <div class="mb10">
            <div class="row-between small"><span>${esc(p.name)}</span><span class="bold">${p.ratio}%</span></div>
            <div class="bar mt6"><i style="width:${p.ratio}%"></i></div>
          </div>`).join('')}
        <div class="tiny muted">数据来源：项目组《茶芽芽婴儿山茶抚触油产品意向使用调查问卷》</div>
      </div>

      <div class="card">
        <div class="card-title">🥇 六大差异化优势</div>
        <table class="table">
          <tr><th>维度</th><th>高端专业品牌</th><th>大众品牌</th><th>茶芽芽</th></tr>
          ${b.advantages.map((a) => `
            <tr>
              <th>${esc(a.dimension)}</th>
              <td class="tiny">${esc(a.highEnd)}</td>
              <td class="tiny">${esc(a.mass)}</td>
              <td class="tiny ours">${esc(a.ours)}</td>
            </tr>`).join('')}
        </table>
      </div>

      <div class="card">
        <div class="card-title">📣 传播创意：原生态 · 可追溯 · 反溢价</div>
        ${b.communication.map((c) => `
          <div class="mb10">
            <div class="bold" style="font-size:13.5px">${esc(c.title)}<span class="small muted"> · ${esc(c.subtitle)}</span></div>
            <div class="small muted">${esc(c.desc)}</div>
          </div>`).join('')}
      </div>

      <div class="card">
        <div class="card-title">🔗 助农闭环</div>
        <img src="${b.images.closedLoop}" style="border-radius:10px;margin-bottom:10px" alt="助农闭环" />
        <div class="steps">${b.aidChain.map((s) => `<div class="step"><b>${esc(s.step)}</b>：${esc(s.desc)}</div>`).join('')}</div>
      </div>

      <div class="card">
        <div class="card-title">🛡 合规与品控</div>
        <div class="steps">${b.compliance.map((c) => `<div class="step">${esc(c)}</div>`).join('')}</div>
      </div>

      <div class="card" style="background:var(--green-50)">
        <div class="bold">${esc(b.fullName)}</div>
        <div class="small muted mt6">${esc(b.team)}</div>
        <div class="tiny muted mt6">${esc(b.competition)}</div>
      </div>
    </div>
  </div>`;
  return { html, title: '品牌故事', tab: 'me' };
});

export { yuan, yuanShort };
