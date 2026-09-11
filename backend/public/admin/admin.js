/**
 * 茶芽芽 · 简易管理后台
 * 覆盖项目书 5.1 运行与维护要求的后台能力：
 *  数据看板（5.1.5 数据维护） / 商品与库存（5.1.1 产品维护） / 订单发货（5.1.4 渠道维护）
 *  / 溯源批次与节点录入（3.3.2 溯源） / 知识库维护（5.1.3 品牌维护） / 人工客服工作台（5.2.3）
 */
const state = {
  token: localStorage.getItem('cy_admin_token') || '',
  user: null,
  route: location.hash.replace(/^#/, '') || '/dashboard',
};

const $ = (id) => document.getElementById(id);
const esc = (s) => String(s ?? '')
  .replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/"/g, '&quot;');
const yuan = (c) => `¥${((c ?? 0) / 100).toFixed(2)}`;

function toast(msg, ms = 2000) {
  document.querySelector('.toast')?.remove();
  const el = document.createElement('div');
  el.className = 'toast';
  el.textContent = msg;
  document.body.appendChild(el);
  setTimeout(() => el.remove(), ms);
}

async function api(path, { method = 'GET', body, silent = false } = {}) {
  const res = await fetch(path, {
    method,
    headers: { 'Content-Type': 'application/json', ...(state.token ? { Authorization: `Bearer ${state.token}` } : {}) },
    ...(body !== undefined ? { body: JSON.stringify(body) } : {}),
  });
  const json = await res.json().catch(() => ({}));
  if (json.code !== 0) {
    if (!silent) toast(json.message || '请求失败');
    if (res.status === 401) { state.token = ''; localStorage.removeItem('cy_admin_token'); renderLogin(); }
    throw new Error(json.message || '请求失败');
  }
  return json.data;
}

/* ============================================================
 * 登录
 * ============================================================ */
function renderLogin() {
  $('admin-app').innerHTML = `
  <div class="login-wrap">
    <div class="panel">
      <h2>🌱 茶芽芽管理后台</h2>
      <div class="muted small mb10" style="margin-bottom:12px">浒口茶油助农先锋队 · 团队ID 16106641</div>
      <div class="field"><label>管理员手机号</label><input class="input" id="adm-phone" value="13800000001" /></div>
      <div class="field"><label>密码</label><input class="input" id="adm-pass" type="password" value="chayaya2026" /></div>
      <button class="btn" style="width:100%" id="adm-login">登录</button>
      <div class="small muted" style="margin-top:10px">演示账号：13800000001 / chayaya2026</div>
      <div class="small" style="margin-top:10px"><a href="/">← 返回小程序</a></div>
    </div>
  </div>`;
  $('adm-login').addEventListener('click', async () => {
    try {
      const data = await api('/api/auth/login', {
        method: 'POST',
        body: { phone: $('adm-phone').value.trim(), password: $('adm-pass').value },
      });
      state.token = data.token;
      state.user = data.user;
      localStorage.setItem('cy_admin_token', data.token);
      toast('登录成功');
      renderShell();
    } catch { /* 已提示 */ }
  });
}

/* ============================================================
 * 外壳
 * ============================================================ */
const MENU = [
  { key: '/dashboard', icon: '📊', label: '数据看板' },
  { key: '/orders', icon: '📦', label: '订单履约' },
  { key: '/products', icon: '🧴', label: '商品与库存' },
  { key: '/trace', icon: '🔍', label: '溯源管理' },
  { key: '/kb', icon: '💬', label: '知识库维护' },
  { key: '/chat', icon: '👩‍💼', label: '人工客服' },
  { key: '/logs', icon: '📈', label: '互动日志' },
  { key: '/report', icon: '🗂', label: '月度运维' },
];

function renderShell() {
  $('admin-app').innerHTML = `
  <div class="layout">
    <aside class="side">
      <div class="brand">
        <b>🌱 茶芽芽后台</b>
        <span>浒口茶油助农先锋队</span>
      </div>
      <nav>
        ${MENU.map((m) => `<a href="#${m.key}" data-menu="${m.key}" class="${state.route === m.key ? 'on' : ''}">${m.icon} ${m.label}</a>`).join('')}
      </nav>
      <div class="foot">
        ${esc(state.user?.nickname || '管理员')}<br />
        <a href="/" style="color:#9fbcab">打开小程序 →</a><br />
        <a href="#" id="adm-logout" style="color:#9fbcab">退出登录</a>
      </div>
    </aside>
    <main class="main" id="main"></main>
  </div>`;
  $('adm-logout').addEventListener('click', (e) => {
    e.preventDefault();
    state.token = '';
    localStorage.removeItem('cy_admin_token');
    renderLogin();
  });
  renderPage();
}

function setTitle(title, meta = '') {
  return `<div class="topbar"><div><h1>${title}</h1><div class="meta">${meta}</div></div>
    <div class="actions"><button class="btn outline" onclick="location.reload()">刷新</button></div></div>`;
}

async function renderPage() {
  const main = $('main');
  main.innerHTML = '<div class="empty">加载中…</div>';
  document.querySelectorAll('[data-menu]').forEach((a) => {
    a.classList.toggle('on', a.dataset.menu === state.route);
  });
  try {
    const render = PAGES[state.route] || PAGES['/dashboard'];
    main.innerHTML = await render();
    if (PAGES[`${state.route}:mount`]) PAGES[`${state.route}:mount`]();
  } catch (e) {
    main.innerHTML = `<div class="panel"><div class="empty">加载失败：${esc(e.message)}</div></div>`;
  }
}

window.addEventListener('hashchange', () => {
  state.route = location.hash.replace(/^#/, '') || '/dashboard';
  if (state.user) renderPage();
});

/* ============================================================
 * 各页面
 * ============================================================ */
const PAGES = {
  async '/dashboard'() {
    const d = await api('/api/admin/overview');
    const c = d.cards;
    const maxFunnel = Math.max(1, d.funnel.view, d.funnel.cart, d.funnel.pay);
    return `
    ${setTitle('数据看板', `数据库 ${d.cache === 'redis' ? 'MySQL + Redis' : 'SQLite + 内存缓存'} · 实时统计`)}
    <div class="cards">
      <div class="kpi"><div class="v">${c.users}</div><div class="k">注册用户</div></div>
      <div class="kpi"><div class="v">${c.orders}</div><div class="k">订单总数</div></div>
      <div class="kpi"><div class="v">${yuan(c.revenue)}</div><div class="k">累计销售额</div></div>
      <div class="kpi"><div class="v">${yuan(c.todayRevenue)}</div><div class="k">今日销售额</div></div>
      <div class="kpi ${c.pendingShip ? 'warn' : ''}"><div class="v">${c.pendingShip}</div><div class="k">待发货</div></div>
      <div class="kpi ${c.refunding ? 'danger' : ''}"><div class="v">${c.refunding}</div><div class="k">售后中</div></div>
      <div class="kpi"><div class="v">${c.units}</div><div class="k">已赋码单品</div></div>
      <div class="kpi"><div class="v">${c.scans}</div><div class="k">溯源扫码</div></div>
      <div class="kpi ${c.humanChats ? 'warn' : ''}"><div class="v">${c.humanChats}</div><div class="k">待人工客服</div></div>
    </div>

    <div class="grid2">
      <div class="panel">
        <h2>销售漏斗 <span class="sub">浏览 → 加购 → 支付 → 扫码</span></h2>
        ${[['浏览商品', d.funnel.view], ['加入购物车', d.funnel.cart], ['完成支付', d.funnel.pay], ['扫码溯源', d.funnel.scan]]
          .map(([k, v]) => `
          <div style="margin-bottom:10px">
            <div class="row" style="justify-content:space-between"><span class="small">${k}</span><span class="small muted">${v}</span></div>
            <div class="bar"><i style="width:${Math.round((v / maxFunnel) * 100)}%"></i></div>
          </div>`).join('')}
        <div class="tiny muted">数据来自小程序埋点（项目书 5.1.5「用户行为数据、销售漏斗」）</div>
      </div>

      <div class="panel">
        <h2>库存预警 <span class="sub">≤ 50 件</span></h2>
        ${d.lowStock.length ? `<table><tr><th>商品</th><th>规格</th><th class="nowrap">库存</th></tr>
          ${d.lowStock.map((p) => `<tr><td>${esc(p.title)}</td><td>${esc(p.spec)}</td><td class="nowrap"><span class="tag ${p.stock <= 10 ? 'danger' : 'warn'}">${p.stock}</span></td></tr>`).join('')}
        </table>` : '<div class="empty">库存充足</div>'}
      </div>
    </div>

    <div class="panel">
      <h2>热销商品</h2>
      <table>
        <tr><th>商品</th><th class="nowrap">已售</th><th class="nowrap">库存</th></tr>
        ${d.hotProducts.map((p) => `<tr><td>${esc(p.title)} <span class="muted small">${esc(p.code)}</span></td><td class="nowrap">${p.sales}</td><td class="nowrap">${p.stock}</td></tr>`).join('')}
      </table>
    </div>`;
  },

  async '/orders'() {
    const status = window.__orderStatus || 'all';
    const d = await api(`/api/admin/orders?status=${status}&size=50`);
    const tabs = [['all', '全部'], ['pending_pay', '待付款'], ['paid', '待发货'], ['shipped', '待收货'], ['done', '已完成'], ['refunding', '售后中']];
    window.__orders = d.list;
    return `
    ${setTitle('订单履约', `共 ${d.total} 笔`)}
    <div class="panel">
      <div class="row" style="margin-bottom:12px">
        ${tabs.map(([k, n]) => `<button class="btn ${status === k ? '' : 'ghost'} sm" data-ostatus="${k}">${n}</button>`).join('')}
      </div>
      ${d.list.length ? `<table>
        <tr><th class="nowrap">订单号</th><th>商品</th><th class="nowrap">金额</th><th class="nowrap">状态</th><th class="nowrap">用户</th><th class="nowrap">操作</th></tr>
        ${d.list.map((o) => `
          <tr>
            <td class="mono">${esc(o.orderNo)}<div class="tiny muted">${esc(String(o.createdAt).replace('T', ' ').slice(0, 16))}</div></td>
            <td>${o.items.map((i) => `${esc(i.title)} ${esc(i.spec)} ×${i.qty}${i.traceCodes?.length ? `<div class="tiny muted">溯源码 ${i.traceCodes.join(', ')}</div>` : ''}`).join('<br />')}</td>
            <td class="nowrap">${yuan(o.payAmount)}</td>
            <td class="nowrap"><span class="tag ${o.status === 'refunding' ? 'danger' : o.status === 'done' ? 'plain' : ''}">${esc(o.statusText)}</span></td>
            <td class="nowrap">${esc(o.nickname || '-')}<div class="tiny muted">${esc(o.address?.receiver || '')}</div></td>
            <td class="nowrap">
              ${o.status === 'paid' ? `<button class="btn sm" data-ship="${o.orderNo}">发货</button>` : ''}
              ${o.status === 'refunding' ? `<button class="btn sm ghost" data-ostatus-set="${o.orderNo}|done">标记已处理</button>` : ''}
              ${o.status === 'shipped' ? `<button class="btn sm outline" data-ostatus-set="${o.orderNo}|done">完成</button>` : ''}
            </td>
          </tr>`).join('')}
      </table>` : '<div class="empty">暂无订单</div>'}
    </div>`;
  },
  '/orders:mount'() {
    document.querySelectorAll('[data-ostatus]').forEach((b) => b.addEventListener('click', () => {
      window.__orderStatus = b.dataset.ostatus;
      renderPage();
    }));
    document.querySelectorAll('[data-ship]').forEach((b) => b.addEventListener('click', () => {
      openModal('发货', `
        <div class="field"><label>物流公司</label><input class="input" id="ship-company" value="乡村物流专线" /></div>
        <div class="field"><label>运单号</label><input class="input" id="ship-no" placeholder="留空自动分配" /></div>
        <div class="field"><label>备注节点</label><input class="input" id="ship-note" placeholder="如：已交付乡镇代收点" /></div>
        <button class="btn" id="ship-do">确认发货</button>
      `, () => {
        $('ship-do').addEventListener('click', async () => {
          await api(`/api/admin/orders/${b.dataset.ship}/ship`, {
            method: 'POST',
            body: { company: $('ship-company').value, trackingNo: $('ship-no').value, note: $('ship-note').value },
          });
          closeModal();
          toast('已发货');
          renderPage();
        });
      });
    }));
    document.querySelectorAll('[data-ostatus-set]').forEach((b) => b.addEventListener('click', async () => {
      const [no, status] = b.dataset.ostatusSet.split('|');
      await api(`/api/admin/orders/${no}/status`, { method: 'POST', body: { status } });
      toast('状态已更新');
      renderPage();
    }));
  },

  async '/products'() {
    const d = await api('/api/admin/products?size=100');
    return `
    ${setTitle('商品与库存', `共 ${d.total} 个商品（含预售/下架）`)}
    <div class="panel">
      <div class="row" style="margin-bottom:12px">
        <button class="btn sm" id="add-product">+ 新增商品</button>
        <span class="small muted">库存支持快速入库/盘点，所有变动写入库存流水</span>
      </div>
      <table>
        <tr><th>商品</th><th class="nowrap">规格</th><th class="nowrap">价格</th><th class="nowrap">库存</th><th class="nowrap">销量</th><th class="nowrap">状态</th><th class="nowrap">操作</th></tr>
        ${d.list.map((p) => `
          <tr>
            <td><div class="row"><img src="${p.image}" style="width:34px;height:34px;border-radius:6px;object-fit:cover" />
              <div><div>${esc(p.title)}</div><div class="tiny muted mono">${esc(p.code)}</div></div></div></td>
            <td class="nowrap">${esc(p.spec)}</td>
            <td class="nowrap">${yuan(p.price)}</td>
            <td class="nowrap"><span class="tag ${p.stock <= 50 ? 'warn' : ''}">${p.stock}</span></td>
            <td class="nowrap">${p.sales}</td>
            <td class="nowrap"><span class="tag ${p.status === 'on' ? '' : 'plain'}">${p.status === 'on' ? '在售' : '预售/下架'}</span></td>
            <td class="nowrap">
              <button class="btn sm ghost" data-stock="${p.code}">调库存</button>
              <button class="btn sm outline" data-edit="${p.code}">编辑</button>
            </td>
          </tr>`).join('')}
      </table>
    </div>`;
  },
  '/products:mount'() {
    document.querySelectorAll('[data-stock]').forEach((b) => b.addEventListener('click', () => {
      openModal('库存调整', `
        <div class="field"><label>变动数量（正数入库 / 负数出库）</label><input class="input" id="st-delta" type="number" value="100" /></div>
        <div class="field"><label>原因</label><input class="input" id="st-reason" value="代工厂到货入库" /></div>
        <button class="btn" id="st-do">提交</button>
      `, () => {
        $('st-do').addEventListener('click', async () => {
          await api(`/api/admin/products/${b.dataset.stock}/stock`, {
            method: 'POST', body: { delta: Number($('st-delta').value), reason: $('st-reason').value },
          });
          closeModal();
          toast('库存已更新');
          renderPage();
        });
      });
    }));
    document.querySelectorAll('[data-edit]').forEach((b) => b.addEventListener('click', async () => {
      const d = await api('/api/admin/products?size=200');
      const p = d.list.find((x) => x.code === b.dataset.edit);
      openModal(`编辑商品 ${p.code}`, `
        <div class="field"><label>标题</label><input class="input" id="pd-title" value="${esc(p.title)}" /></div>
        <div class="field"><label>副标题</label><input class="input" id="pd-sub" value="${esc(p.subtitle || '')}" /></div>
        <div class="row">
          <div class="field grow"><label>售价（分）</label><input class="input" id="pd-price" type="number" value="${p.price}" /></div>
          <div class="field grow"><label>划线价（分）</label><input class="input" id="pd-list" type="number" value="${p.listPrice}" /></div>
        </div>
        <div class="row">
          <div class="field grow"><label>库存</label><input class="input" id="pd-stock" type="number" value="${p.stock}" /></div>
          <div class="field grow"><label>状态</label>
            <select class="select" id="pd-status">
              <option value="on" ${p.status === 'on' ? 'selected' : ''}>在售</option>
              <option value="presale" ${p.status !== 'on' ? 'selected' : ''}>预售/下架</option>
            </select></div>
        </div>
        <button class="btn" id="pd-do">保存</button>
      `, () => {
        $('pd-do').addEventListener('click', async () => {
          await api(`/api/admin/products/${p.code}`, {
            method: 'PATCH',
            body: {
              title: $('pd-title').value, subtitle: $('pd-sub').value,
              price: Number($('pd-price').value), listPrice: Number($('pd-list').value),
              stock: Number($('pd-stock').value), status: $('pd-status').value,
            },
          });
          closeModal();
          toast('商品已更新');
          renderPage();
        });
      });
    }));
    $('add-product').addEventListener('click', () => {
      openModal('新增商品', `
        <div class="row">
          <div class="field grow"><label>商品编码</label><input class="input" id="np-code" placeholder="CY-OIL-50" /></div>
          <div class="field grow"><label>规格</label><input class="input" id="np-spec" placeholder="50ml" /></div>
        </div>
        <div class="field"><label>标题</label><input class="input" id="np-title" placeholder="茶芽芽 婴儿山茶抚触油" /></div>
        <div class="row">
          <div class="field grow"><label>售价（分）</label><input class="input" id="np-price" type="number" value="3900" /></div>
          <div class="field grow"><label>库存</label><input class="input" id="np-stock" type="number" value="500" /></div>
        </div>
        <div class="field"><label>分类</label>
          <select class="select" id="np-cat">
            <option value="oil">抚触油</option><option value="care">洗护护理</option>
            <option value="gift">礼盒装</option><option value="trial">体验装</option>
          </select></div>
        <button class="btn" id="np-do">创建</button>
      `, () => {
        $('np-do').addEventListener('click', async () => {
          await api('/api/admin/products', {
            method: 'POST',
            body: {
              code: $('np-code').value.trim(), title: $('np-title').value.trim(), spec: $('np-spec').value.trim(),
              price: Number($('np-price').value), stock: Number($('np-stock').value), category: $('np-cat').value,
            },
          });
          closeModal();
          toast('商品已创建');
          renderPage();
        });
      });
    });
  },

  async '/trace'() {
    const [batches, scans] = await Promise.all([
      api('/api/admin/trace/batches'),
      api('/api/admin/trace/scans?size=10'),
    ]);
    window.__batches = batches.list;
    return `
    ${setTitle('溯源管理', `批次 ${batches.list.length} 个 · 扫码记录 ${scans.total} 条`)}
    <div class="panel">
      <div class="row" style="margin-bottom:12px">
        <button class="btn sm" id="add-batch">+ 新建批次并赋码</button>
        <button class="btn sm outline" id="trace-lab">运行溯源全链路自检</button>
      </div>
      <table>
        <tr><th>批次号</th><th>产地/地块</th><th class="nowrap">农户</th><th class="nowrap">采摘/压榨</th><th class="nowrap">赋码</th><th class="nowrap">扫码</th><th class="nowrap">操作</th></tr>
        ${batches.list.map((b) => `
          <tr>
            <td class="mono">${esc(b.batchNo)}<div class="tiny muted">${esc(b.inspectionNo || '')}</div></td>
            <td>${esc(b.origin)}<div class="tiny muted">${esc(b.plotNo || '')}</div></td>
            <td class="nowrap">${esc(b.farmer)}</td>
            <td class="nowrap">${esc(String(b.harvestDate).slice(0, 10))}<div class="tiny muted">${esc(String(b.pressDate).slice(0, 10))}</div></td>
            <td class="nowrap">${b.unitTotal}</td>
            <td class="nowrap">${b.scans}</td>
            <td class="nowrap">
              <button class="btn sm ghost" data-ev="${b.batchNo}">录入节点</button>
              <button class="btn sm outline" data-units="${b.batchNo}">溯源码</button>
            </td>
          </tr>`).join('')}
      </table>
    </div>

    <div class="panel">
      <h2>最近扫码记录 <span class="sub">首次查询 = 正品；重复查询会向消费者提示风险</span></h2>
      <table>
        <tr><th class="nowrap">溯源码</th><th class="nowrap">结果</th><th class="nowrap">IP</th><th class="nowrap">时间</th></tr>
        ${scans.list.map((s) => `
          <tr><td class="mono">${esc(s.trace_code)}</td>
            <td class="nowrap"><span class="tag ${s.result === 'first' ? '' : s.result === 'fake' ? 'danger' : 'warn'}">${
              { first: '首次查询', repeat: '重复查询', fake: '验证未通过' }[s.result] || esc(s.result)}</span></td>
            <td class="nowrap mono">${esc(s.ip || '-')}</td>
            <td class="nowrap">${esc(String(s.created_at).replace('T', ' ').slice(0, 16))}</td>
          </tr>`).join('')}
      </table>
    </div>
    <div class="panel" id="trace-lab-out"></div>`;
  },
  '/trace:mount'() {
    $('add-batch').addEventListener('click', () => {
      openModal('新建溯源批次', `
        <div class="row">
          <div class="field grow"><label>批次号</label><input class="input" id="nb-no" placeholder="CHY-20260401-03" /></div>
          <div class="field grow"><label>商品编码</label><input class="input" id="nb-product" value="CY-OIL-100" /></div>
        </div>
        <div class="row">
          <div class="field grow"><label>地块编号</label><input class="input" id="nb-plot" placeholder="浒口村·北坡油茶林 C-01" /></div>
          <div class="field grow"><label>农户</label><input class="input" id="nb-farmer" placeholder="姓名" /></div>
        </div>
        <div class="row">
          <div class="field grow"><label>采摘日期</label><input class="input" id="nb-harvest" type="date" /></div>
          <div class="field grow"><label>压榨日期</label><input class="input" id="nb-press" type="date" /></div>
        </div>
        <div class="row">
          <div class="field grow"><label>灌装日期</label><input class="input" id="nb-fill" type="date" /></div>
          <div class="field grow"><label>检测报告号</label><input class="input" id="nb-inspect" placeholder="SGS-2026-xxxx" /></div>
        </div>
        <div class="field"><label>赋码数量（一物一码）</label><input class="input" id="nb-count" type="number" value="30" /></div>
        <button class="btn" id="nb-do">创建并赋码</button>
      `, () => {
        $('nb-do').addEventListener('click', async () => {
          const res = await api('/api/admin/trace/batches', {
            method: 'POST',
            body: {
              batchNo: $('nb-no').value.trim(), productCode: $('nb-product').value.trim(),
              plotNo: $('nb-plot').value, farmer: $('nb-farmer').value,
              harvestDate: $('nb-harvest').value, pressDate: $('nb-press').value,
              fillDate: $('nb-fill').value, inspectionNo: $('nb-inspect').value,
              unitCount: Number($('nb-count').value),
            },
          });
          closeModal();
          toast(`批次已创建，赋码 ${res.units} 个`);
          renderPage();
        });
      });
    });

    document.querySelectorAll('[data-ev]').forEach((b) => b.addEventListener('click', () => {
      const batch = window.__batches.find((x) => x.batchNo === b.dataset.ev);
      openModal(`录入溯源节点 · ${batch.batchNo}`, `
        <div class="field"><label>节点类型</label>
          <select class="select" id="ev-stage">
            <option value="plant">原料产地环境与种植管护</option>
            <option value="harvest">果实采摘与成熟度筛选</option>
            <option value="press">物理低温冷榨加工</option>
            <option value="inspect">成品检测与合规备案</option>
            <option value="fill">无菌车间灌装与赋码</option>
            <option value="logistics">物流配送</option>
          </select></div>
        <div class="row">
          <div class="field grow"><label>发生时间</label><input class="input" id="ev-time" type="date" /></div>
          <div class="field grow"><label>操作人 / 农户</label><input class="input" id="ev-op" value="${esc(batch.farmer)}" /></div>
        </div>
        <div class="field"><label>地点</label><input class="input" id="ev-place" value="${esc(batch.plotNo || '')}" /></div>
        <div class="field"><label>补充说明（写入哈希存证）</label><textarea class="textarea" id="ev-detail"></textarea></div>
        <div class="small muted" style="margin-bottom:10px">提交后本节点哈希 = SHA-256(前序哈希 | 节点内容)，并同步更新链尾存证哈希。</div>
        <button class="btn" id="ev-do">写入并存证</button>
      `, () => {
        $('ev-do').addEventListener('click', async () => {
          await api(`/api/admin/trace/batches/${batch.batchNo}/events`, {
            method: 'POST',
            body: {
              stage: $('ev-stage').value,
              happenedAt: $('ev-time').value || new Date().toISOString().slice(0, 10),
              operator: $('ev-op').value, place: $('ev-place').value,
              detail: { 备注: $('ev-detail').value || '后台录入' },
            },
          });
          closeModal();
          toast('溯源节点已写入，哈希链已更新');
          renderPage();
        });
      });
    }));

    document.querySelectorAll('[data-units]').forEach((b) => b.addEventListener('click', async () => {
      const d = await api(`/api/admin/trace/units?batch=${encodeURIComponent(b.dataset.units)}&size=200`);
      openModal(`溯源码列表 · ${b.dataset.units}`, `
        <div class="small muted" style="margin-bottom:8px">共 ${d.total} 个，可复制用于打印标签</div>
        <div class="mono" style="max-height:320px;overflow:auto">${d.list.map((u) => `${esc(u.trace_code)} <span class="tag plain">${u.status}</span> <span class="tiny muted">查询 ${u.scan_count} 次</span>`).join('<br />')}</div>
      `);
    }));

    $('trace-lab').addEventListener('click', async () => {
      $('trace-lab-out').innerHTML = '<h2>溯源全链路自检</h2><div class="empty">运行中…</div>';
      const d = await api('/api/dev/trace-lab', { method: 'POST' });
      $('trace-lab-out').innerHTML = `
        <h2>溯源全链路自检 <span class="sub">${esc(d.disclaimer)}</span></h2>
        <table><tr><th class="nowrap">步骤</th><th class="nowrap">结果</th><th>说明</th></tr>
        ${d.steps.map((s) => `<tr><td>${esc(s.step)}</td>
          <td class="nowrap"><span class="tag ${s.ok ? '' : 'danger'}">${s.ok ? '通过' : '未通过'}</span></td>
          <td class="small">${esc(s.tip || s.message || s.reason || `节点数 ${s.nodeCount ?? s.eventCount ?? ''}` || (s.head ? `链头 ${s.head}` : ''))}</td></tr>`).join('')}
        </table>`;
    });
  },

  async '/kb'() {
    const d = await api('/api/admin/kb');
    window.__kb = d.list;
    return `
    ${setTitle('知识库维护', `共 ${d.list.length} 条问答 · AI 客服的应答依据（项目书表17 五大类策略）`)}
    <div class="panel">
      <div class="row" style="margin-bottom:12px">
        <button class="btn sm" id="add-kb">+ 新增问答</button>
        <button class="btn sm outline" id="ai-lab">运行 AI 规则回归测试</button>
      </div>
      <table>
        <tr><th class="nowrap">分类</th><th>问题</th><th>关键词</th><th class="nowrap">操作</th></tr>
        ${d.list.map((e) => `
          <tr>
            <td class="nowrap"><span class="tag">${esc(e.category_name)}</span></td>
            <td>${esc(e.question)}<div class="tiny muted">${esc(String(e.answer).slice(0, 70))}…</div></td>
            <td class="tiny muted">${esc(e.keywords)}</td>
            <td class="nowrap">
              <button class="btn sm outline" data-kb-edit="${e.id}">编辑</button>
              <button class="btn sm danger" data-kb-del="${e.id}">删除</button>
            </td>
          </tr>`).join('')}
      </table>
    </div>
    <div class="panel" id="ai-lab-out"></div>`;
  },
  '/kb:mount'() {
    const cats = [
      ['origin', '产地环境'], ['safety', '产品安全性'], ['efficacy', '产品功能与功效'],
      ['massage', '抚触科普与用量'], ['order', '订单物流与售后'], ['symptom', '婴儿症状适用性'],
    ];
    $('add-kb').addEventListener('click', () => {
      openModal('新增知识库条目', `
        <div class="field"><label>分类</label><select class="select" id="kb-cat">
          ${cats.map(([k, n]) => `<option value="${k}">${n}</option>`).join('')}</select></div>
        <div class="field"><label>标准问题</label><input class="input" id="kb-q" /></div>
        <div class="field"><label>标准答案</label><textarea class="textarea" id="kb-a" style="min-height:120px"></textarea></div>
        <div class="field"><label>关键词（空格分隔，用于意图匹配）</label><input class="input" id="kb-kw" /></div>
        <button class="btn" id="kb-do">保存</button>
      `, () => {
        $('kb-do').addEventListener('click', async () => {
          await api('/api/admin/kb', {
            method: 'POST',
            body: {
              category: $('kb-cat').value,
              categoryName: cats.find(([k]) => k === $('kb-cat').value)[1],
              question: $('kb-q').value, answer: $('kb-a').value, keywords: $('kb-kw').value,
            },
          });
          closeModal();
          toast('已新增');
          renderPage();
        });
      });
    });
    document.querySelectorAll('[data-kb-edit]').forEach((b) => b.addEventListener('click', () => {
      const e = window.__kb.find((x) => String(x.id) === b.dataset.kbEdit);
      openModal('编辑知识库条目', `
        <div class="field"><label>标准问题</label><input class="input" id="kb-q" value="${esc(e.question)}" /></div>
        <div class="field"><label>标准答案</label><textarea class="textarea" id="kb-a" style="min-height:140px">${esc(e.answer)}</textarea></div>
        <div class="field"><label>关键词</label><input class="input" id="kb-kw" value="${esc(e.keywords)}" /></div>
        <button class="btn" id="kb-do">保存</button>
      `, () => {
        $('kb-do').addEventListener('click', async () => {
          await api(`/api/admin/kb/${e.id}`, {
            method: 'PATCH',
            body: { question: $('kb-q').value, answer: $('kb-a').value, keywords: $('kb-kw').value },
          });
          closeModal();
          toast('已更新');
          renderPage();
        });
      });
    }));
    document.querySelectorAll('[data-kb-del]').forEach((b) => b.addEventListener('click', async () => {
      await api(`/api/admin/kb/${b.dataset.kbDel}`, { method: 'DELETE' });
      toast('已删除');
      renderPage();
    }));
    $('ai-lab').addEventListener('click', async () => {
      $('ai-lab-out').innerHTML = '<h2>AI 规则回归测试</h2><div class="empty">运行中…</div>';
      const d = await api('/api/dev/ai-lab', { method: 'POST' });
      $('ai-lab-out').innerHTML = `
        <h2>AI 规则回归测试 <span class="sub">${d.passed}/${d.total} 通过 · 引擎 ${esc(d.engine)}</span></h2>
        <table><tr><th>用户输入</th><th class="nowrap">意图</th><th class="nowrap">症状分级</th><th class="nowrap">情绪</th><th class="nowrap">结果</th></tr>
        ${d.results.map((r) => `<tr>
          <td class="small">${esc(r.text)}</td>
          <td class="nowrap">${esc(r.intent)}</td>
          <td class="nowrap"><span class="tag ${r.level === 'emergency' ? 'danger' : r.level === 'ok' ? '' : 'warn'}">${esc(r.level)}</span></td>
          <td class="nowrap">${esc(r.emotion)}</td>
          <td class="nowrap"><span class="tag ${r.pass ? '' : 'danger'}">${r.pass ? '通过' : '未通过'}</span></td>
        </tr>`).join('')}</table>
        <div class="small muted" style="margin-top:8px">${esc(d.medicalDisclaimer)}</div>`;
    });
  },

  async '/chat'() {
    const d = await api('/api/admin/conversations?status=human&size=30');
    window.__convs = d.list;
    const all = await api('/api/admin/conversations?status=all&size=30');
    return `
    ${setTitle('人工客服工作台', `待处理 ${d.total} 个 · 全部会话 ${all.total} 个（AI 过滤常见问题，人工处理复杂客诉）`)}
    <div class="panel">
      ${d.list.length ? `<table>
        <tr><th class="nowrap">会话</th><th class="nowrap">情绪</th><th>转人工原因</th><th class="nowrap">用户</th><th class="nowrap">时间</th><th class="nowrap">操作</th></tr>
        ${d.list.map((c) => `
          <tr>
            <td class="mono">${esc(c.session_id)}</td>
            <td class="nowrap"><span class="tag ${c.emotion === 'angry' ? 'danger' : c.emotion === 'anxious' ? 'warn' : 'plain'}">${esc(c.emotion)}</span></td>
            <td class="small">${esc(c.handoff_reason || '')}</td>
            <td class="nowrap">${esc(c.nickname || '游客')}</td>
            <td class="nowrap">${esc(String(c.updated_at).replace('T', ' ').slice(0, 16))}</td>
            <td class="nowrap"><button class="btn sm" data-conv="${c.session_id}">查看并回复</button></td>
          </tr>`).join('')}
      </table>` : '<div class="empty">当前没有待人工处理的会话 🎉</div>'}
    </div>
    <div class="panel">
      <h2>全部会话</h2>
      <table>
        <tr><th class="nowrap">会话</th><th class="nowrap">状态</th><th class="nowrap">意图</th><th class="nowrap">情绪</th><th class="nowrap">操作</th></tr>
        ${all.list.map((c) => `<tr>
          <td class="mono">${esc(c.session_id)}</td>
          <td class="nowrap"><span class="tag ${c.status === 'human' ? 'warn' : 'plain'}">${c.status === 'human' ? '人工' : 'AI'}</span></td>
          <td class="nowrap">${esc(c.intent || '-')}</td>
          <td class="nowrap">${esc(c.emotion)}</td>
          <td class="nowrap"><button class="btn sm outline" data-conv="${c.session_id}">查看</button></td>
        </tr>`).join('')}
      </table>
    </div>`;
  },
  '/chat:mount'() {
    document.querySelectorAll('[data-conv]').forEach((b) => b.addEventListener('click', async () => {
      const sid = b.dataset.conv;
      const d = await api(`/api/admin/conversations/${encodeURIComponent(sid)}`);
      openModal(`会话 ${sid}`, `
        <div style="max-height:340px;overflow:auto;margin-bottom:10px">
          ${d.list.map((m) => `
            <div class="chat-line ${m.role === 'user' ? 'user' : m.role === 'agent' ? 'agent' : ''}">
              <div class="who">${m.role === 'user' ? '用户' : m.role === 'agent' ? '人工客服' : m.role === 'system' ? '系统' : 'AI 芽芽'} · ${esc(String(m.createdAt).replace('T', ' ').slice(0, 16))}${m.intent ? ` · 意图 ${esc(m.intent)}` : ''}${m.emotion ? ` · 情绪 ${esc(m.emotion)}` : ''}</div>
              <div>${esc(m.content)}</div>
            </div>`).join('')}
        </div>
        <div class="field"><label>客服回复</label><textarea class="textarea" id="agent-msg" placeholder="输入回复内容"></textarea></div>
        <button class="btn" id="agent-send">发送回复</button>
      `, () => {
        $('agent-send').addEventListener('click', async () => {
          const content = $('agent-msg').value.trim();
          if (!content) { toast('请输入回复内容'); return; }
          await api(`/api/admin/conversations/${encodeURIComponent(sid)}/reply`, { method: 'POST', body: { content } });
          closeModal();
          toast('已回复');
        });
      });
    }));
  },

  async '/logs'() {
    const d = await api('/api/admin/events?size=40');
    return `
    ${setTitle('互动日志', '用户行为埋点（浏览 / 加购 / 支付 / 扫码 / 客服）')}
    <div class="panel">
      <h2>类型分布</h2>
      <div class="row">${d.group.map((g) => `<span class="tag">${esc(g.type)}：${g.n}</span>`).join('')}</div>
    </div>
    <div class="panel">
      <table>
        <tr><th class="nowrap">类型</th><th class="nowrap">对象</th><th class="nowrap">用户</th><th>附加数据</th><th class="nowrap">时间</th></tr>
        ${d.list.map((e) => `
          <tr>
            <td class="nowrap"><span class="tag">${esc(e.type)}</span></td>
            <td class="mono">${esc(e.target || '-')}</td>
            <td class="nowrap">${e.user_id ?? '-'}</td>
            <td class="small muted">${esc(String(e.payload_json || '').slice(0, 90))}</td>
            <td class="nowrap">${esc(String(e.created_at).replace('T', ' ').slice(0, 16))}</td>
          </tr>`).join('')}
      </table>
    </div>`;
  },

  async '/report'() {
    const d = await api('/api/admin/report/monthly');
    const stock = await api('/api/admin/stock-logs?size=15');
    return `
    ${setTitle('月度运维', `统计区间 ${d.period.from} ~ ${d.period.to}（项目书 5.1.5：每月 5 日前出具运维总结）`)}
    <div class="cards">
      <div class="kpi"><div class="v">${d.business.orders}</div><div class="k">近 30 天订单</div></div>
      <div class="kpi"><div class="v">${yuan(d.business.amount)}</div><div class="k">近 30 天销售额</div></div>
      <div class="kpi"><div class="v">${d.business.newUsers}</div><div class="k">新增用户</div></div>
      <div class="kpi"><div class="v">${d.tech.scans}</div><div class="k">溯源扫码</div></div>
      <div class="kpi"><div class="v">${d.tech.chatMessages}</div><div class="k">客服消息</div></div>
      <div class="kpi ${d.tech.humanHandoffs ? 'warn' : ''}"><div class="v">${d.tech.humanHandoffs}</div><div class="k">转人工次数</div></div>
    </div>

    <div class="grid2">
      <div class="panel">
        <h2>技术运行状态</h2>
        <table>
          <tr><th>数据库驱动</th><td class="mono">${esc(d.tech.dbDriver)}</td></tr>
          <tr><th>缓存驱动</th><td class="mono">${esc(d.tech.cacheDriver)}</td></tr>
          <tr><th>已处理告警</th><td>${d.alerts.length ? d.alerts.map((a) => `<span class="tag warn">${esc(a)}</span>`).join('') : '<span class="tag">无</span>'}</td></tr>
        </table>
      </div>
      <div class="panel">
        <h2>客服意图分布</h2>
        <table><tr><th>意图</th><th class="nowrap">次数</th></tr>
          ${d.topIntents.map((t) => `<tr><td>${esc(t.intent)}</td><td class="nowrap">${t.n}</td></tr>`).join('')}
        </table>
      </div>
    </div>

    <div class="panel">
      <h2>库存流水 <span class="sub">最近 15 条</span></h2>
      <table>
        <tr><th class="nowrap">商品</th><th class="nowrap">变动</th><th>原因</th><th class="nowrap">关联订单</th><th class="nowrap">时间</th></tr>
        ${stock.list.map((s) => `<tr>
          <td class="nowrap">${esc(s.title || '')} ${esc(s.spec || '')}</td>
          <td class="nowrap"><span class="tag ${s.delta < 0 ? 'warn' : ''}">${s.delta > 0 ? '+' : ''}${s.delta}</span></td>
          <td class="small">${esc(s.reason)}</td>
          <td class="mono">${esc(s.order_no || '-')}</td>
          <td class="nowrap">${esc(String(s.created_at).replace('T', ' ').slice(0, 16))}</td>
        </tr>`).join('')}
      </table>
    </div>`;
  },
};

/* ============================================================
 * 通用弹层
 * ============================================================ */
function openModal(title, bodyHtml, onMount) {
  closeModal();
  const wrap = document.createElement('div');
  wrap.className = 'modal-mask';
  wrap.id = 'modal-mask';
  wrap.innerHTML = `<div class="modal"><h3>${title}</h3>${bodyHtml}<div style="margin-top:12px"><button class="btn ghost" id="modal-cancel">取消</button></div></div>`;
  document.body.appendChild(wrap);
  $('modal-cancel').addEventListener('click', closeModal);
  wrap.addEventListener('click', (e) => { if (e.target === wrap) closeModal(); });
  onMount?.();
}

function closeModal() {
  $('modal-mask')?.remove();
}

/* ============================================================
 * 启动
 * ============================================================ */
async function boot() {
  if (!state.token) { renderLogin(); return; }
  try {
    state.user = await api('/api/admin/me', { silent: true });
    renderShell();
  } catch {
    renderLogin();
  }
}

boot();
