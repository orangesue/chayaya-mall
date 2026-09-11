/** 溯源频道：扫码/输入查询、时间轴、哈希链校验、批次全景、二维码打印 */
import { route } from '../router.js';
import { get, post, state, toast, track } from '../store.js';

const esc = (s) => String(s ?? '')
  .replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/"/g, '&quot;');

route('/trace', async ({ query }) => {
  const token = query.get('t');
  const code = query.get('code');
  const batch = query.get('batch');

  // 有 token / code 则直接出结果页
  if (token || code) {
    const res = await get(`/api/trace/verify?${token ? `t=${encodeURIComponent(token)}` : `code=${encodeURIComponent(code)}`}`);
    track('scan', res.traceCode || code || 'token');
    return { html: renderResult(res), title: res.authentic ? '溯源结果' : '防伪提示', tab: 'trace' };
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
          刮开产品瓶底涂层，用微信扫码即可查看这一瓶的完整履历：油茶林地块、采摘日期、压榨批次、农户姓名、检测报告与物流轨迹。
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
 * 查询结果
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
  const li = b.landInfo || {};
  return `
  <div class="page">
    <div class="page-pad">
      <div class="card" style="background:linear-gradient(135deg,#eaf6ef,#fdfaf1)">
        <div class="row-between">
          <div>
            <div class="bold" style="font-size:16px;color:var(--green-900)">✅ 正品验证通过</div>
            <div class="tiny muted mt6">溯源码 ${esc(res.traceCode)}</div>
          </div>
          <img src="/assets/img/image22.jpeg" style="width:56px;border-radius:8px" alt="防伪码" />
        </div>
        <div class="notice ${res.scan.isFirst ? 'ok' : ''} mt10" style="${res.scan.isFirst ? '' : 'background:var(--warn-bg)'}">
          ${esc(res.scan.tip)}
        </div>
      </div>

      ${res.product ? `
      <div class="card">
        <div class="row" style="gap:11px">
          <img src="${res.product.image}" style="width:74px;height:74px;border-radius:10px;object-fit:cover" alt="" />
          <div class="grow">
            <div class="bold">${esc(res.product.title)}</div>
            <div class="small muted">${esc(res.product.subtitle || '')}</div>
            <div class="mt6"><span class="tag">${esc(res.product.spec)}</span><span class="tag plain">${esc(res.unitStatusText)}</span></div>
          </div>
        </div>
      </div>` : ''}

      <div class="card">
        <div class="card-title">📍 原料产地与种植管护</div>
        <div class="tl-detail">
          <div class="kv"><span class="k">产地</span><span class="v">${esc(b.origin)}</span></div>
          <div class="kv"><span class="k">地块编号</span><span class="v">${esc(b.plotNo)}</span></div>
          <div class="kv"><span class="k">负责农户</span><span class="v">${esc(b.farmer)}</span></div>
          <div class="kv"><span class="k">地理坐标</span><span class="v">${b.geo?.lat ? `${b.geo.lat}°N, ${b.geo.lng}°E` : '—'}</span></div>
          ${li.area ? `<div class="kv"><span class="k">林地规模</span><span class="v">${esc(li.area)}</span></div>` : ''}
          ${li.altitude ? `<div class="kv"><span class="k">海拔</span><span class="v">${esc(li.altitude)}</span></div>` : ''}
          ${li.manage ? `<div class="kv"><span class="k">管护方式</span><span class="v">${esc(li.manage)}</span></div>` : ''}
          <div class="kv"><span class="k">采摘日期</span><span class="v">${esc(String(b.harvestDate).slice(0, 10))}</span></div>
          <div class="kv"><span class="k">压榨批次</span><span class="v">${esc(b.pressDate ? String(b.pressDate).slice(0, 10) : '')} ${esc(b.pressWorkshop || '')}</span></div>
          <div class="kv"><span class="k">加工工厂</span><span class="v">${esc(b.factory)}</span></div>
        </div>
        <img src="/assets/img/image23.png" style="border-radius:10px;margin-top:10px" alt="浒口村山茶林实拍" />
      </div>

      <div class="card">
        <div class="card-title">🕒 全流程时间轴</div>
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

      <div class="card">
        <div class="card-title">🔬 检测报告</div>
        <div class="small muted">报告编号：${esc(res.report.inspectionNo)}</div>
        <a class="btn outline block mt10" href="${res.report.url}" target="_blank">查看电子质检报告原文 ›</a>
      </div>

      <div class="card">
        <div class="card-title">🔐 防伪与存证校验</div>
        <div class="notice ${res.chain.intact ? 'ok' : 'danger'}">
          <b>${res.chain.intact ? '链上存证校验通过' : '存证校验异常'}</b><br />${esc(res.chain.note)}
        </div>
        <div class="tl-detail mt10">
          <div class="kv"><span class="k">签名算法</span><span class="v">${esc(res.signature.algorithm)}</span></div>
          <div class="kv"><span class="k">签名校验</span><span class="v">${res.signature.verified ? '✅ 通过' : '⚠️ 未通过'}</span></div>
          <div class="kv"><span class="k">存证链</span><span class="v">${esc(res.chain.algorithm)}（${res.chain.nodeCount} 个节点）</span></div>
          <div class="kv"><span class="k">链尾哈希</span><span class="v" style="word-break:break-all">${esc(String(res.chain.head).slice(0, 40))}…</span></div>
          <div class="kv"><span class="k">本次查询</span><span class="v">第 ${res.scan.count} 次${res.scan.isFirst ? '（首次）' : ''}</span></div>
        </div>
      </div>

      <div class="card">
        <div class="card-title">🤝 这一瓶背后的农户</div>
        <p class="small muted" style="margin:0">
          这瓶抚触油的原料来自浒口村 <b>${esc(b.farmer)}</b> 家养护的
          ${esc(b.plotNo || '油茶林')}。你支付的每一分钱，都在为更好的原料和乡村的未来付费。
        </p>
        <a class="btn ghost block mt10" href="#/product/${esc(res.product?.code || 'CY-OIL-100')}">再看看这款产品</a>
      </div>
    </div>
  </div>`;
}

/* ============================================================
 * 批次全景
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
        <div class="card-title">🕒 生产时间轴</div>
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
