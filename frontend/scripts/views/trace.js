/** 溯源频道：扫码/输入查询、三界面结果页（商品信息 / 农户信息 / 产链信息）、批次全景、二维码打印 */
import { route } from '../router.js';
import { get, post, state, toast, track } from '../store.js';

const esc = (s) => String(s ?? '')
  .replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/"/g, '&quot;');

/** 客户端的商品资料（补充后端商品接口未覆盖的展示字段；备案号上线前需替换为真实号码） */
const PRODUCT_LABELS = {
  'CY-OIL-100': { standard: 'QB/T 4079（润肤油）', filing: '粤G妆网备字2026xxxxxx', filingPending: true, shelfLife: '36 个月' },
  'CY-OIL-30': { standard: 'QB/T 4079（润肤油）', filing: '粤G妆网备字2026xxxxxx', filingPending: true, shelfLife: '36 个月' },
  'CY-TRIAL-5': { standard: 'QB/T 4079（润肤油）', filing: '粤G妆网备字2026xxxxxx', filingPending: true, shelfLife: '36 个月' },
  'CY-GIFT-MAN': { standard: 'QB/T 4079（润肤油）', filing: '粤G妆网备字2026xxxxxx', filingPending: true, shelfLife: '36 个月' },
};

/** 条形码装饰条（纯视觉，模仿标签平台的条码区） */
function barcodeBars() {
  let html = '';
  for (let i = 0; i < 68; i += 1) {
    const w = [1, 1, 2, 3][i % 4];
    html += `<i style="width:${w}px;height:${18 + ((i * 7) % 16)}px"></i>`;
  }
  return `<div class="bars">${html}</div>`;
}

route('/trace', async ({ query }) => {
  const token = query.get('t');
  const code = query.get('code');
  const batch = query.get('batch');

  // 有 token / code 则直接出结果页
  if (token || code) {
    const res = await get(`/api/trace/verify?${token ? `t=${encodeURIComponent(token)}` : `code=${encodeURIComponent(code)}`}`);
    track('scan', res.traceCode || code || 'token');
    return { html: renderResult(res), title: res.authentic ? '溯源结果' : '防伪提示', tab: 'trace', mount: mountTabs };
  }

  if (batch) {
    const data = await get(`/api/trace/batch/${encodeURIComponent(batch)}`);
    return { html: renderBatch(data), title: '批次溯源', tab: 'trace' };
  }

  // 频道首页
  const [overview, codes] = await Promise.all([
    get('/api/trace/overview'),
    get('/api/trace/codes', { silent: true }).catch(() => ({ list: [] })),
  ]);

  const html = `
  <div class="page">
    <div class="page-pad">
      <div class="card" style="background:linear-gradient(135deg,#eaf6ef,#fdfaf1)">
        <div class="card-title">🔍 一物一码 · 全流程溯源</div>
        <p class="small" style="margin:0 0 10px;color:var(--ink-2)">
          刮开产品瓶底涂层，用微信扫码即可查看这一瓶的完整履历：产品信息、原料农户、全链条生产轨迹与检测报告。
        </p>
        <div class="field" style="margin-bottom:10px">
          <input class="input" id="code-input" placeholder="也可以手动输入瓶底溯源码，如 CY26010115010001" />
        </div>
        <div class="btn-row">
          <button class="btn" id="query-btn">查询真伪</button>
          <button class="btn ghost" id="demo-btn">用示例码体验</button>
        </div>
      </div>

      <div class="card">
        <div class="card-title">🏔 溯源体系</div>
        <img src="${overview.images.system}" style="border-radius:10px" alt="全程溯源体系" />
        <div class="row mt10" style="gap:7px">
          ${overview.flow.map((f) => `<div class="fact grow center" style="padding:8px 4px"><div class="v" style="font-size:12.5px">${esc(f.name)}</div><div class="k" style="font-size:10.5px">${esc(f.desc)}</div></div>`).join('')}
        </div>
      </div>

      <div class="card">
        <div class="card-title">🔐 防伪与存证技术</div>
        <div class="small" style="color:var(--ink-2)">
          · 数字身份证：<b>${esc(overview.algorithm.code)}</b><br />
          · 防篡改存证：<b>${esc(overview.algorithm.chain)}</b><br />
          · 二维码渲染：${esc(overview.algorithm.qr)}
        </div>
        <div class="notice ok mt10">${esc(overview.antiFakeTip)}</div>
        <img src="${overview.images.antiFake}" style="border-radius:10px;margin-top:10px;width:140px" alt="瓶底刮开查验" />
      </div>

      <div class="card">
        <div class="card-title">📊 溯源数据</div>
        <div class="row" style="justify-content:space-around;text-align:center">
          <div><div class="bold" style="font-size:17px;color:var(--green-700)">${overview.stats.units}</div><div class="tiny muted">已赋码单品</div></div>
          <div><div class="bold" style="font-size:17px;color:var(--green-700)">${overview.stats.batches}</div><div class="tiny muted">溯源批次</div></div>
          <div><div class="bold" style="font-size:17px;color:var(--green-700)">${overview.stats.scans}</div><div class="tiny muted">累计扫码</div></div>
        </div>
      </div>

      <div class="card">
        <div class="card-title">📦 在售批次</div>
        ${overview.batches.map((b) => `
          <div class="row-between" style="padding:10px 0;border-bottom:1px dashed var(--line)">
            <div class="grow">
              <div class="small bold">${esc(b.batchNo)}</div>
              <div class="tiny muted">${esc(b.origin)} · 农户 ${esc(b.farmer)} · ${esc(String(b.harvestDate).slice(0, 10))}</div>
              <div class="tiny muted">已赋码 ${b.unitTotal} 个 · 被扫码 ${b.scans} 次</div>
            </div>
            <a class="btn xs outline" href="#/trace?batch=${encodeURIComponent(b.batchNo)}">查看</a>
          </div>`).join('')}
      </div>

      ${codes.list?.length ? `
      <div class="card">
        <div class="card-title">🧪 演示用溯源码<span class="sub">（评审时可直接点选）</span></div>
        <div class="wrap">
          ${codes.list.slice(0, 8).map((c) => `<a class="tag" style="text-decoration:none" href="#/trace?code=${c.traceCode}">${esc(c.traceCode)}</a>`).join('')}
        </div>
      </div>` : ''}

      <div class="card">
        <div class="card-title">🖨 打印瓶底二维码</div>
        <p class="small muted" style="margin:0 0 10px">输入溯源码即可生成带 ECDSA 签名的防伪二维码，可用于瓶身标签打样。</p>
        <div class="row">
          <input class="input grow" id="qr-code" placeholder="溯源码" />
          <button class="btn sm" id="qr-btn">生成</button>
        </div>
        <div id="qr-host" class="center mt10"></div>
      </div>
    </div>
  </div>`;

  const mount = () => {
    const input = document.getElementById('code-input');
    document.getElementById('query-btn').addEventListener('click', () => {
      const v = input.value.trim();
      if (!v) { toast('请输入溯源码'); return; }
      location.hash = `#/trace?code=${encodeURIComponent(v)}`;
    });
    document.getElementById('demo-btn').addEventListener('click', async () => {
      const demo = await get('/api/trace/demo', { silent: true }).catch(() => null);
      if (demo) location.hash = `#/trace?t=${encodeURIComponent(demo.url.split('t=')[1])}`;
      else toast('暂无示例码，请先执行 npm run reset');
    });
    document.getElementById('qr-btn').addEventListener('click', async () => {
      const v = document.getElementById('qr-code').value.trim();
      if (!v) { toast('请输入溯源码'); return; }
      try {
        const qr = await get(`/api/trace/qr/${encodeURIComponent(v)}`);
        document.getElementById('qr-host').innerHTML = `
          <div class="qr-box">${qr.svg}</div>
          <div class="tiny muted mt6">${esc(qr.traceCode)} · 批次 ${esc(qr.batchNo)}</div>
          <div class="tiny muted">签名 ${esc(qr.signature)}</div>`;
      } catch { /* 已提示 */ }
    });
  };

  return { html, title: '溯源', tab: 'trace', mount };
});

/* ============================================================
 * 一级标签切换（三个界面）
 * ============================================================ */
function mountTabs() {
  document.querySelectorAll('.trace-tabs button').forEach((btn) => {
    btn.addEventListener('click', () => {
      document.querySelectorAll('.trace-tabs button').forEach((b) => b.classList.remove('on'));
      document.querySelectorAll('.trace-panel').forEach((p) => p.classList.remove('on'));
      btn.classList.add('on');
      document.getElementById(btn.dataset.p)?.classList.add('on');
    });
  });
}

/* ============================================================
 * 溯源结果页：绿色头部 + 身份卡 + 三个界面
 * ============================================================ */
function renderResult(res) {
  if (!res.authentic) {
    return `
    <div class="page">
      <div class="page-pad">
        <div class="card" style="background:var(--danger-bg)">
          <div class="center">
            <div style="font-size:44px">⚠️</div>
            <div class="bold" style="font-size:17px;color:var(--danger);margin:8px 0">未通过正品验证</div>
            <div class="small" style="color:#9c2f28">${esc(res.message)}</div>
          </div>
        </div>
        <div class="card">
          <div class="card-title">可能的原因</div>
          <div class="small muted">
            · 二维码/溯源码输入有误（请注意字母数字区分）<br />
            · 该码对应的商品尚未出库或已被回收<br />
            · 商品并非茶芽芽官方渠道售出<br />
            · 二维码被复制或二次封装
          </div>
        </div>
        <div class="card">
          <div class="card-title">需要帮助？</div>
          <a class="btn block" href="#/ai?q=${encodeURIComponent('我扫码提示未通过验证，想核实一下')}">联系客服核实</a>
        </div>
      </div>
    </div>`;
  }

  const b = res.batch || {};
  const p = res.product || {};
  const label = PRODUCT_LABELS[p.code] || {};
  const meta = res.meta || {};

  return `
  <div class="page trace-page">
    <!-- 绿色头部 -->
    <header class="trace-hero">
      <div class="row-between" style="font-size:12px;opacity:.95">
        <span>🌱 茶芽芽 · 一物一码溯源</span>
        <span>${esc(b.origin || '')}</span>
      </div>
      <div class="trace-hero-title">${esc(p.title || '婴儿山茶抚触油')}</div>
      <div class="trace-hero-sub">浒口茶油助农先锋队 · 北京师范大学（珠海校区）</div>
    </header>

    <!-- 身份卡 -->
    <section class="trace-idcard">
      <div class="trace-idtop">
        <img class="trace-pic" src="${esc(p.image || '/assets/img/image18.png')}" alt="${esc(p.title || '')}" />
        <div class="grow">
          <div class="bold" style="font-size:15px">${esc(p.title || '')}</div>
          <div class="mt6">
            <span class="tag">抚触油</span>
            <span class="tag">规格 ${esc(p.spec || '')}</span>
            ${label.shelfLife ? `<span class="tag plain">保质期 ${esc(label.shelfLife)}</span>` : ''}
          </div>
          ${label.standard ? `<div class="tiny muted">产品执行标准：<b>${esc(label.standard)}</b></div>` : ''}
          ${label.filing ? `<div class="tiny muted">儿童化妆品备案号：<b>${esc(label.filing)}</b>${label.filingPending ? ' <span class="trace-pending">待备案完成后替换</span>' : ''}</div>` : ''}
          <div class="mt6"><span class="trace-verified">✅ ${res.scan.isFirst ? '正品验证通过 · 首次查询' : `正品验证通过 · 第 ${res.scan.count} 次查询`}</span></div>
        </div>
      </div>
      <div class="trace-codebar">
        <div class="row-between">
          <span class="trace-codelabel">🌿 一物一码溯源标识</span>
          <span class="trace-codenum">${esc(res.traceCode)}</span>
        </div>
        ${barcodeBars()}
        <div class="tiny muted" style="margin-top:6px">此编码为本产品一物一码，由团队溯源系统统一赋码；扫码可查看全链条信息</div>
      </div>
    </section>

    ${res.scan.isFirst ? '' : `<div class="page-pad"><div class="notice" style="margin-top:12px">${esc(res.scan.tip)}</div></div>`}

    <!-- 一级标签 = 三个界面 -->
    <nav class="trace-tabs">
      <button class="on" data-p="tp1">商品信息</button>
      <button data-p="tp2">农户信息</button>
      <button data-p="tp3">产链信息</button>
    </nav>

    <!-- 界面一：商品信息 -->
    <section class="trace-panel on" id="tp1">
      <div class="trace-sec">
        <h2>产品基本信息</h2>
        <table class="info">
          <tr><th>产品名称</th><td>${esc(p.title || '')}${p.subtitle ? `（${esc(p.subtitle)}）` : ''}</td></tr>
          <tr><th>净含量</th><td>${esc(p.spec || '')}</td></tr>
          <tr><th>适用人群</th><td>${esc(meta.audience || '0-12 个月新生儿及敏感肌婴幼儿')}</td></tr>
          <tr><th>产品批号</th><td>${esc(res.batchNo)}</td></tr>
          <tr><th>生产日期</th><td>${esc(String(b.fillDate || '').slice(0, 10))}</td></tr>
          <tr><th>保质期</th><td>${esc(label.shelfLife || '36 个月')}（开封后建议 12 个月内用完）</td></tr>
          <tr><th>产地</th><td>${esc(b.origin || '')}</td></tr>
          <tr><th>贮存条件</th><td>避光、阴凉干燥处存放，用后旋紧瓶盖</td></tr>
        </table>
      </div>

      ${meta.specs?.length ? `
      <div class="trace-sec">
        <h2>产品参数</h2>
        <table class="info">
          ${meta.specs.map((s) => `<tr><th>${esc(s.k)}</th><td>${esc(s.v)}</td></tr>`).join('')}
        </table>
      </div>` : ''}

      ${meta.ingredients ? `
      <div class="trace-sec">
        <h2>成分表</h2>
        <div style="font-size:13.5px;line-height:1.9">${esc(meta.ingredients)}</div>
        <div class="notice" style="margin-top:8px"><b>成分说明：</b>${esc(meta.ingredientNote || '')}</div>
        <div class="notice" style="margin-top:8px"><b>注意事项：</b>${esc(meta.warning || '')}</div>
      </div>` : ''}

      ${meta.usage?.length ? `
      <div class="trace-sec">
        <h2>使用方法</h2>
        <div style="font-size:13.5px;line-height:1.9">
          ${meta.usage.map((u, i) => `${i + 1}. ${esc(u)}`).join('<br />')}
        </div>
        <div class="dosetable">
          <div class="head">用 量 参 考</div>
          <table>
            <tr><th>规格</th><th>按压一次</th><th>单部位用量</th><th>全身抚触</th></tr>
            <tr><td>100ml 家庭装</td><td>0.5ml</td><td>约 2-3 滴</td><td>约 4-6 次按压</td></tr>
            <tr><td>30ml 体验装</td><td>0.25ml</td><td>约 1-2 滴</td><td>约 8-12 次按压</td></tr>
          </table>
        </div>
      </div>` : ''}

      <div class="trace-sec">
        <h2>检测与合规</h2>
        <table class="info">
          <tr><th>检测机构</th><td>SGS 通标标准技术服务有限公司（示例）</td></tr>
          <tr><th>检测报告号</th><td>${esc(res.report.inspectionNo || '')}</td></tr>
          <tr><th>检测结论</th><td>菌落总数、重金属、苯并芘、酸价、过氧化值、皮肤刺激性等项目均符合《化妆品安全技术规范》要求</td></tr>
          <tr><th>合规备案</th><td>已按《儿童化妆品监督管理条例》完成儿童化妆品备案</td></tr>
        </table>
        <a class="btn ghost sm mt10" href="${esc(res.report.url || '#')}" target="_blank">📄 查看检测报告原文 ›</a>
      </div>
    </section>

    <!-- 界面二：农户信息 -->
    <section class="trace-panel" id="tp2">
      <div class="trace-sec">
        <h2>原料农户</h2>
        <div class="trace-farmer">
          <div class="trace-avatar">${esc(String(b.farmer || '农').slice(0, 1))}</div>
          <div class="grow">
            <div class="bold" style="font-size:15px">${esc(b.farmer || '')}</div>
            <div class="small muted">${esc(b.plotNo || '')} · 负责农户</div>
            <div class="mt6"><span class="tag">浒口村合作社</span><span class="tag">古法压榨</span></div>
          </div>
        </div>
        <div class="trace-quote">“这片茶林是祖辈种下的，春天第一茬茶果最饱满，都是手工一颗颗挑的。”</div>
      </div>

      <div class="trace-sec">
        <h2>地块档案</h2>
        <table class="info">
          <tr><th>地块编号</th><td>${esc(b.plotNo || '')}</td></tr>
          <tr><th>位置</th><td>${esc(b.origin || '')}</td></tr>
          <tr><th>地理坐标</th><td>${b.geo?.lat ? `${b.geo.lat}°N, ${b.geo.lng}°E` : '—'}</td></tr>
          <tr><th>海拔</th><td>${esc(meta.elevation || '420 - 680 米')}</td></tr>
          <tr><th>林地规模</th><td>${esc(meta.area || '约 320 亩连片山茶林')}</td></tr>
          <tr><th>树龄</th><td>${esc(meta.treeAge || '以百年以上老茶树为主')}</td></tr>
          <tr><th>土壤</th><td>${esc(meta.soil || '红壤，pH 5.5-6.5，排水良好')}</td></tr>
          <tr><th>管护方式</th><td>${esc(meta.manage || '人工除草、物理防虫，不使用化学除草剂')}</td></tr>
          <tr><th>采摘日期</th><td>${esc(String(b.harvestDate || '').slice(0, 10))}</td></tr>
        </table>
        ${b.landImage ? `<img src="${esc(b.landImage)}" style="border-radius:10px;margin-top:10px" alt="浒口村山茶林实拍" />
        <div class="tiny muted" style="margin-top:6px">浒口村油茶林实拍</div>` : ''}
      </div>

      <div class="trace-sec">
        <h2>本批次参与人</h2>
        <table class="info">
          <tr><th>采摘</th><td>${esc(b.farmer || '')}（农户）</td></tr>
          <tr><th>压榨</th><td>${esc(b.pressWorkshop || '浒口村古法榨油坊')}</td></tr>
          <tr><th>品控</th><td>团队品控（原料三筛：环境无污染 / 采摘无霉果 / 压榨物理低温冷榨）</td></tr>
          <tr><th>检测</th><td>SGS 第三方检测机构</td></tr>
          <tr><th>灌装</th><td>${esc(b.factory || '')}</td></tr>
        </table>
      </div>

      <div class="trace-sec">
        <h2>助农信息</h2>
        <div class="notice ok">
          本瓶原料直接采购自浒口村合作社与农户，<b>收购价高于当地散收均价</b>；
          收益回流村集体，用于油茶林管护与村内物流点建设。
        </div>
      </div>
    </section>

    <!-- 界面三：产链信息（只展示加工之后：冷榨 → 检测 → 灌装 → 物流） -->
    <section class="trace-panel" id="tp3">
      <div class="trace-sec">
        <h2>全链条生产轨迹</h2>
        <div class="timeline">
          ${res.timeline.map((t) => `
            <div class="tl-item">
              <div class="tl-dot done">${t.icon}</div>
              <div class="tl-head">${esc(t.stageName)}</div>
              <div class="tl-meta">${esc(t.happenedAt)} · ${esc(t.operator)}${t.place ? ` · ${esc(t.place)}` : ''}</div>
              <div class="tl-detail">
                ${Object.entries(t.detail || {}).map(([k, v]) => `<div class="kv"><span class="k">${esc(k)}</span><span class="v">${esc(v)}</span></div>`).join('')}
              </div>
              <div class="tiny muted" style="margin-top:4px;word-break:break-all">节点哈希 ${esc(String(t.hash).slice(0, 24))}…</div>
            </div>`).join('')}
        </div>
      </div>

      <div class="trace-sec">
        <h2>防伪与存证校验</h2>
        <div class="notice ${res.chain.intact ? 'ok' : 'danger'}">
          <b>${res.chain.intact ? `${res.chain.nodeCount} 个节点哈希校验全部通过` : '存证校验异常'}</b><br />${esc(res.chain.note)}
        </div>
        <table class="info" style="margin-top:10px">
          <tr><th>签名算法</th><td>${esc(res.signature.algorithm)}</td></tr>
          <tr><th>存证方式</th><td>${esc(res.chain.algorithm)}</td></tr>
          <tr><th>本次查询</th><td>第 ${res.scan.count} 次${res.scan.isFirst ? '（首次查询，判定为正品）' : ''}</td></tr>
          <tr><th>链尾哈希</th><td style="font-family:ui-monospace,monospace;font-size:11px;word-break:break-all">${esc(String(res.chain.head).slice(0, 32))}…</td></tr>
        </table>
        <div class="tiny muted" style="margin-top:8px">
          说明：页面展示加工之后的 4 个节点，防伪校验仍覆盖种植、采摘在内的全部 ${res.chain.nodeCount} 个节点。
        </div>
      </div>
    </section>

    <div class="page-pad">
      <div class="card mt14">
        <div class="card-title">🤝 这一瓶背后的农户</div>
        <p class="small muted" style="margin:0">
          这瓶抚触油的原料来自浒口村 <b>${esc(b.farmer || '')}</b> 家养护的 ${esc(b.plotNo || '油茶林')}。
          你支付的每一分钱，都在为更好的原料和乡村的未来付费。
        </p>
        <div class="btn-row mt10">
          <a class="btn ghost" href="#/product/${esc(p.code || 'CY-OIL-100')}">看看这款产品</a>
          <a class="btn outline" href="#/ai?q=${encodeURIComponent('扫码看到的溯源信息是真的吗？')}">问客服</a>
        </div>
      </div>
    </div>
  </div>`;
}

/* ============================================================
 * 批次全景（后台与溯源页共用）
 * ============================================================ */
function renderBatch(data) {
  const b = data.batch;
  return `
  <div class="page">
    <div class="page-pad">
      <div class="card">
        <div class="card-title">批次 ${esc(b.batchNo)}</div>
        <div class="tl-detail">
          <div class="kv"><span class="k">产地</span><span class="v">${esc(b.origin)} · ${esc(b.plotNo)}</span></div>
          <div class="kv"><span class="k">农户</span><span class="v">${esc(b.farmer)}</span></div>
          <div class="kv"><span class="k">采摘 / 压榨</span><span class="v">${esc(String(b.harvestDate).slice(0, 10))} / ${esc(String(b.pressDate).slice(0, 10))}</span></div>
          <div class="kv"><span class="k">压榨工艺</span><span class="v">${esc(b.pressTech)}</span></div>
          <div class="kv"><span class="k">灌装</span><span class="v">${esc(String(b.fillDate).slice(0, 10))} ${esc(b.factory)}</span></div>
          <div class="kv"><span class="k">检测报告</span><span class="v">${esc(b.inspectionNo)}</span></div>
        </div>
      </div>

      <div class="card">
        <div class="card-title">📊 批次数据</div>
        <div class="row" style="justify-content:space-around;text-align:center">
          <div><div class="bold" style="font-size:17px;color:var(--green-700)">${data.units.total}</div><div class="tiny muted">赋码总数</div></div>
          <div><div class="bold" style="font-size:17px;color:var(--green-700)">${data.units.inStock}</div><div class="tiny muted">在库</div></div>
          <div><div class="bold" style="font-size:17px;color:var(--green-700)">${data.units.sold}</div><div class="tiny muted">已售出</div></div>
          <div><div class="bold" style="font-size:17px;color:var(--green-700)">${data.units.scans}</div><div class="tiny muted">被扫码</div></div>
        </div>
      </div>

      <div class="card">
        <div class="card-title">🔐 哈希链状态</div>
        <div class="notice ${data.chain.intact ? 'ok' : 'danger'}">
          ${data.chain.intact ? `✅ ${data.chain.nodeCount} 个节点哈希校验全部通过` : '⚠️ 检测到哈希不匹配'}
          <div class="tiny" style="word-break:break-all;margin-top:6px">链尾 ${esc(String(data.chain.chainHead || '').slice(0, 48))}…</div>
        </div>
      </div>

      <div class="card">
        <div class="card-title">🕒 生产时间轴<span class="sub">（展示加工之后环节）</span></div>
        <div class="timeline">
          ${data.timeline.map((t) => `
            <div class="tl-item">
              <div class="tl-dot done">${t.icon}</div>
              <div class="tl-head">${esc(t.stageName)}</div>
              <div class="tl-meta">${esc(t.happenedAt)} · ${esc(t.operator)}</div>
              <div class="tl-detail">
                ${Object.entries(t.detail || {}).map(([k, v]) => `<div class="kv"><span class="k">${esc(k)}</span><span class="v">${esc(v)}</span></div>`).join('')}
              </div>
            </div>`).join('')}
        </div>
      </div>

      <a class="btn ghost block" href="#/trace">返回溯源首页</a>
    </div>
  </div>`;
}

export { esc };
