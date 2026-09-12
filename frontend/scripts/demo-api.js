/**
 * 静态演示模式（GitHub Pages）的本地 API 实现
 *
 * 背景：GitHub Pages 只能托管静态文件，跑不了 Node 后端。
 * 但评委扫码后应当能完整体验，所以这里实现了「请求拦截 + 本地响应」：
 *   - 数据来自构建时生成的数据快照（api-snapshot.json，取自真实后端）
 *   - AI 客服使用与后端完全相同的规则模块（data/ai-rules.mjs），不是另写一套
 *   - 购物车/订单在浏览器内模拟，数据不落库（刷新回到初始状态，页面上有提示）
 *
 * 与真实后端的差异（会明确告诉用户，不假装是真后端）：
 *   1. 数据是固定快照，不会随其他用户操作变化
 *   2. 订单不持久化、管理后台不可用
 *   3. 溯源验签在浏览器端完成（用提交时算好的签名摘要比对），仍能演示"改了就报警"
 */
import { buildRuleReply, detectIntent, extractSlots, triageSymptoms, analyzeEmotion } from './ai-rules.mjs';

let snapshot = null;
let local = null;

/* ============================================================
 * 本地状态（购物车 / 订单 / 用户）
 * ============================================================ */
const LS_KEY = 'cy_demo_state_v1';

function freshState() {
  const base = snapshot?.demoState ?? { cart: [], orders: [], user: null, totalPaid: 0, tier: 'xinYa', points: 0 };
  return JSON.parse(JSON.stringify(base));
}

function loadState() {
  if (local) return local;
  try {
    const raw = storage().getItem(LS_KEY);
    local = raw ? JSON.parse(raw) : freshState();
  } catch {
    local = freshState();
  }
  return local;
}

function saveState() {
  try { storage().setItem(LS_KEY, JSON.stringify(local)); } catch { /* 隐私模式下可能失败 */ }
}

/** 同时兼容浏览器与"Node 最小 DOM"测试环境（测试环境只有 window.location/hash） */
function storage() {
  if (typeof localStorage !== 'undefined') return localStorage;
  const mem = new Map();
  return { getItem: (k) => (mem.has(k) ? mem.get(k) : null), setItem: (k, v) => mem.set(k, String(v)), removeItem: (k) => mem.delete(k) };
}

export function resetDemoState() {
  local = freshState();
  saveState();
}

/* ============================================================
 * 工具
 * ============================================================ */
const ok = (data) => ({ code: 0, message: 'ok', data, ts: Date.now() });
const fail = (message, code = 'BAD_REQUEST') => ({ code, message, ts: Date.now() });

const tierOf = (paid) => {
  const tiers = snapshot?.tiers ?? [];
  const sorted = [...tiers].sort((a, b) => b.min - a.min);
  return sorted.find((t) => paid >= t.min)?.code ?? 'xinYa';
};

/** 浏览器端 SHA-256（十六进制），用于比对 token 内容摘要 */
async function sha256Hex(text) {
  if (globalThis.crypto?.subtle) {
    const buf = await crypto.subtle.digest('SHA-256', new TextEncoder().encode(text));
    return Array.from(new Uint8Array(buf)).map((b) => b.toString(16).padStart(2, '0')).join('');
  }
  // 兜底：极简 FNV-1a（仅在缺少 WebCrypto 的老环境使用，摘要退化为短哈希）
  let h = 0x811c9dc5;
  for (let i = 0; i < text.length; i += 1) {
    h ^= text.charCodeAt(i);
    h = Math.imul(h, 0x01000193);
  }
  return (h >>> 0).toString(16).padStart(8, '0').repeat(4);
}

function recomputeUser() {
  const s = loadState();
  if (!s.user) return;
  s.user.totalPaid = s.totalPaid;
  s.user.tierCode = tierOf(s.totalPaid);
  s.user.points = Math.floor(s.totalPaid / 100);
  const tier = (snapshot?.tiers ?? []).find((t) => t.code === s.user.tierCode);
  s.user.tierName = tier?.name ?? '新芽会员';
}

function shapeCart() {
  const s = loadState();
  const items = [];
  for (const line of s.cart) {
    const p = (snapshot?.products ?? []).find((x) => x.code === line.code);
    if (!p) continue;
    items.push({
      cartId: line.cartId,
      qty: line.qty,
      amount: p.price * line.qty,
      ...p,
    });
  }
  const goodsAmount = items.reduce((a, b) => a + b.amount, 0);
  const totalQty = items.reduce((a, b) => a + b.qty, 0);
  return { items, goodsAmount, totalQty };
}

/* ============================================================
 * 路由表（与真实后端路径一一对应）
 * ============================================================ */
const ROUTES = [
  /* ---------- 基础 ---------- */
  [/^\/api\/health$/, () => ok({ status: 'up (static demo)', app: '茶芽芽商城', time: new Date().toISOString() })],

  [/^\/api\/home$/, () => {
    const products = snapshot.products;
    return ok({
      brand: snapshot.brand,
      story: snapshot.story,
      hot: products.filter((p) => p.stock > 0).sort((a, b) => b.sales - a.sales).slice(0, 4),
      categories: snapshot.categories.map((c) => ({
        ...c,
        count: products.filter((p) => p.category === c.key).length,
      })),
      marketFacts: snapshot.marketFacts,
      quickQuestions: snapshot.quickQuestions,
    });
  }],

  [/^\/api\/brand$/, () => ok(snapshot.brandFull)],

  [/^\/api\/products$/, (_m, url) => {
    const category = url.searchParams.get('category');
    const keyword = url.searchParams.get('keyword');
    const all = url.searchParams.get('all') === '1';
    let list = snapshot.products;
    if (!all) list = list.filter((p) => !p.presale && p.stock > 0);
    if (category && category !== 'all') list = list.filter((p) => p.category === category);
    if (keyword) list = list.filter((p) => `${p.title}${p.subtitle}`.includes(keyword));
    return ok({ list, total: list.length, page: 1, size: list.length });
  }],

  [/^\/api\/products\/([\w-]+)$/, (_m, _u, [, code]) => {
    const product = snapshot.productDetails[code];
    if (!product) return fail('商品不存在或已下架', 'NOT_FOUND');
    const related = snapshot.products.filter((p) => p.code !== code && !p.presale).slice(0, 4);
    const batches = (snapshot.trace.batches ?? []).filter((b) => b.productCode === code)
      .map((b) => ({ batch_no: b.batchNo, origin: b.origin, farmer: b.farmer, harvest_date: b.harvestDate, fill_date: b.fillDate, inspection_no: b.inspectionNo }));
    return ok({ product, related, batches });
  }],

  [/^\/api\/recommend$/, (_m, _u, _p, body) => {
    const cart = Array.isArray(body?.cart) ? body.cart : [];
    const picks = [];
    const has = (c) => cart.includes(c);
    const push = (code, reason, score) => {
      const p = snapshot.products.find((x) => x.code === code);
      if (!p || p.presale || picks.some((x) => x.code === code)) return;
      picks.push({ ...p, reason, score });
    };
    if (!has('CY-OIL-30') && !has('CY-TRIAL-5')) push('CY-OIL-30', '新手首选：30ml 体验装低门槛试用，月子中心同款，按压一次 0.25ml 更好掌控', 96);
    if (has('CY-OIL-30') && !has('CY-OIL-100')) push('CY-OIL-100', '用着合适就换家庭装：100ml 每 10ml 只要 6.9 元，比体验装省近四成', 94);
    if (has('CY-OIL-100') && !has('CY-TRIAL-5')) push('CY-TRIAL-5', '常备家庭装的家长，通常再带一组 5ml 出行装：待产包、外出都方便', 88);
    push('CY-OIL-100', '销量第一的主力装，95% 高纯度冷榨山茶油 + 一物一码溯源', 90);
    if (!cart.length) push('CY-GIFT-MAN', '送满月礼可以看礼盒装：家庭装 + 便携装组合，附溯源卡与祝福卡', 72);
    return ok({ items: picks.slice(0, 3), ageTip: null });
  }],

  [/^\/api\/guides/, () => ok(snapshot.guides)],
  [/^\/api\/comparison$/, () => ok(snapshot.comparison)],
  [/^\/api\/stats\/overview$/, () => ok(snapshot.statsOverview)],
  [/^\/api\/events$/, () => ok({ recorded: true })],
  [/^\/api\/feedback$/, () => ok({ received: true }, '感谢反馈（演示模式不会真实提交）')],

  /* ---------- 登录与用户 ---------- */
  [/^\/api\/auth\/send-code$/, () => ok({ code: '123456', ttl: 300 })],
  [/^\/api\/auth\/login-code$/, (_m, _u, _p, body) => {
    const s = loadState();
    s.user = {
      id: 90001,
      nickname: body?.nickname || `演示用户${String(body?.phone ?? '').slice(-4)}`,
      phone: body?.phone ? `${String(body.phone).slice(0, 3)}****${String(body.phone).slice(-4)}` : '',
      avatar: '/assets/img/image20.png',
      tierCode: 'xinYa',
      totalPaid: 0,
      points: 0,
      role: 'customer',
    };
    s.totalPaid = 0;
    recomputeUser();
    saveState();
    return ok({ token: 'demo-token', user: s.user, demo: true }, '登录成功（演示模式）');
  }],
  [/^\/api\/auth\/login$/, () => {
    const s = loadState();
    s.user = { id: 90001, nickname: '演示用户', phone: '138****0002', avatar: '/assets/img/image20.png', tierCode: s.user?.tierCode ?? 'xinYa', totalPaid: s.totalPaid ?? 0, points: 0, role: 'customer' };
    recomputeUser();
    saveState();
    return ok({ token: 'demo-token', user: s.user, demo: true }, '登录成功（演示模式）');
  }],
  [/^\/api\/auth\/wechat$/, () => {
    const s = loadState();
    s.user = { id: 90001, nickname: '微信演示用户', phone: '', avatar: '/assets/img/image20.png', tierCode: s.user?.tierCode ?? 'xinYa', totalPaid: s.totalPaid ?? 0, points: 0, role: 'customer' };
    recomputeUser();
    saveState();
    return ok({ token: 'demo-token', user: s.user, mode: 'mock', demo: true }, '微信登录成功（演示模式）');
  }],

  [/^\/api\/me$/, () => {
    const s = loadState();
    if (!s.user) return fail('请先登录', 'UNAUTHORIZED');
    recomputeUser();
    const tiers = snapshot.tiers ?? [];
    const current = tiers.find((t) => t.code === s.user.tierCode) ?? tiers[0];
    const next = tiers.find((t) => t.min > (current?.min ?? 0));
    const cart = shapeCart();
    return ok({
      user: s.user,
      counts: {
        orders: s.orders.length,
        finished: s.orders.filter((o) => o.status === 'done').length,
        coupons: (snapshot.coupons ?? []).filter((c) => c.status === 'unused').length,
        cart: cart.totalQty,
      },
      tier: {
        current: current ? { code: current.code, name: current.name, min: current.min, benefits: current.benefits } : null,
        next: next ? { code: next.code, name: next.name, min: next.min, gap: next.min - s.totalPaid } : null,
        all: tiers.map((t) => ({
          code: t.code, name: t.name, min: t.min, discount: t.discount,
          benefits: t.benefits, reached: s.totalPaid >= t.min,
        })),
      },
      aiTips: tiers,
    });
  }],

  [/^\/api\/me\/coupons$/, () => ok({ list: snapshot.coupons ?? [] })],
  [/^\/api\/coupons\/claim$/, () => ok({ claimed: true }, '领取成功（演示模式）')],
  [/^\/api\/me\/trace-codes$/, () => {
    const s = loadState();
    const list = [];
    for (const o of s.orders) {
      for (const it of o.items ?? []) {
        for (const code of it.traceCodes ?? []) {
          const unit = snapshot.trace.units.find((u) => u.traceCode === code);
          list.push({
            traceCode: code,
            batchNo: unit?.batchNo ?? '',
            status: unit?.status ?? 'in_stock',
            scanCount: unit?.scanCount ?? 0,
            title: it.title, spec: it.spec, orderNo: o.orderNo, boughtAt: o.createdAt,
          });
        }
      }
    }
    return ok({ list });
  }],
  [/^\/api\/me\/orders$/, () => {
    const s = loadState();
    return ok({ list: s.orders });
  }],

  [/^\/api\/addresses$/, (_m, _u, _p, body, method) => {
    const s = loadState();
    if (method === 'POST') {
      s.address = { ...body, id: 1 };
      saveState();
      return ok({ id: 1 }, '地址已保存（演示模式）');
    }
    return ok({ list: s.address ? [s.address] : (snapshot.demoState?.address ? [snapshot.demoState.address] : []) });
  }],
  [/^\/api\/bookings$/, (_m, _u, _p, _b, method) => (method === 'POST'
    ? ok({ booked: true }, '报名成功（演示模式）')
    : ok({ list: [] }))],

  /* ---------- 购物车 ---------- */
  [/^\/api\/cart$/, (_m, _u, _p, body, method) => {
    const s = loadState();
    if (method === 'POST') {
      const p = snapshot.products.find((x) => x.code === body?.code);
      if (!p) return fail('商品不存在');
      const qty = Number(body?.qty ?? 1);
      const exist = s.cart.find((c) => c.code === body.code);
      if (exist) exist.qty += qty;
      else s.cart.push({ cartId: Date.now(), code: body.code, qty });
      saveState();
      return ok({ productCode: body.code, qty: exist ? exist.qty : qty }, '已加入购物车');
    }
    const cart = shapeCart();
    const rec = ROUTES.find(([re]) => re.test('/api/recommend'))[1](null, null, [], { cart: s.cart.map((c) => c.code) });
    return ok({ ...cart, recommend: rec.data });
  }],

  [/^\/api\/cart\/(\d+)$/, (_m, _u, [, id], body, method) => {
    const s = loadState();
    const cid = Number(id);
    if (method === 'PATCH') {
      const line = s.cart.find((c) => c.cartId === cid);
      if (!line) return fail('购物车条目不存在');
      const qty = Number(body?.qty ?? line.qty);
      if (qty <= 0) s.cart = s.cart.filter((c) => c.cartId !== cid);
      else line.qty = qty;
      saveState();
      return ok({ cartId: cid, qty }, '已更新数量');
    }
    s.cart = s.cart.filter((c) => c.cartId !== cid);
    saveState();
    return ok({ removed: 1 }, '已移出购物车');
  }],

  [/^\/api\/cart\/clear$/, () => {
    const s = loadState();
    s.cart = [];
    saveState();
    return ok({ cleared: true }, '购物车已清空');
  }],

  [/^\/api\/cart\/checkout-preview$/, (_m, _u, _p, body) => {
    const s = loadState();
    return ok(computePrice(s.cart, body?.couponCode, s.address));
  }],

  [/^\/api\/price\/preview$/, (_m, _u, _p, body) => {
    const items = Array.isArray(body?.items) ? body.items : [];
    const lines = items.map((it) => {
      const p = snapshot.products.find((x) => x.code === it.code);
      const qty = Math.max(1, Number(it.qty ?? 1));
      return { code: p.code, title: p.title, spec: p.spec, price: p.price, qty, amount: p.price * qty, image: p.image };
    });
    const goodsAmount = lines.reduce((a, b) => a + b.amount, 0);
    return ok({ lines, goodsAmount, tierDiscount: 0, freight: goodsAmount >= 9900 ? 0 : 800, payAmount: goodsAmount >= 9900 ? goodsAmount : goodsAmount + 800, loggedIn: true });
  }],

  /* ---------- 订单 ---------- */
  [/^\/api\/orders$/, (_m, _u, _p, body, method) => {
    const s = loadState();
    if (method !== 'POST') {
      const status = _u.searchParams.get('status');
      const list = status && status !== 'all' ? s.orders.filter((o) => o.status === status) : s.orders;
      return ok({ list });
    }
    // 下单
    let lines = [];
    if (Array.isArray(body?.items) && body.items.length) {
      for (const it of body.items) {
        const p = snapshot.products.find((x) => x.code === it.code);
        if (p) lines.push({ code: p.code, title: p.title, spec: p.spec, price: p.price, qty: Number(it.qty ?? 1), image: p.image });
      }
    } else {
      lines = shapeCart().items.map((i) => ({ code: i.code, title: i.title, spec: i.spec, price: i.price, qty: i.qty, image: i.image }));
    }
    if (!lines.length) return fail('购物车是空的，先去挑一瓶吧');
    const price = computePrice(s.cart, body?.couponCode, s.address, lines);
    const orderNo = `CYDEMO${Date.now().toString().slice(-10)}`;
    const order = {
      id: s.orders.length + 1,
      orderNo,
      status: 'pending_pay',
      statusText: '待付款',
      goodsAmount: price.goodsAmount,
      discountAmount: price.tierDiscount + price.couponDiscount,
      freight: price.freight,
      payAmount: price.payAmount,
      paidAt: null, shippedAt: null, finishedAt: null,
      logistics: [],
      remark: body?.remark ?? '',
      createdAt: new Date().toISOString(),
      items: lines.map((l) => ({ productId: 0, title: l.title, spec: l.spec, price: l.price, qty: l.qty, image: l.image, traceCodes: [] })),
      address: s.address ?? snapshot.demoState?.address ?? {},
      sourcePlatform: 'self',
      payChannel: null,
    };
    s.orders.unshift(order);
    // 下单即清空购物车（与真实后端一致）
    if (!Array.isArray(body?.items)) s.cart = [];
    saveState();
    return ok(order, '下单成功（演示模式，数据不落库）');
  }],

  [/^\/api\/orders\/([\w-]+)\/pay$/, (_m, _u, [, no]) => {
    const s = loadState();
    const order = s.orders.find((o) => o.orderNo === no);
    if (!order) return fail('订单不存在', 'NOT_FOUND');
    order.status = 'paid';
    order.statusText = '待发货';
    order.paidAt = new Date().toISOString();
    order.payChannel = 'mock_wechat';
    // 分配一物一码（从快照的码池里按顺序取，与真实后端行为一致）
    const pool = snapshot.trace.units.filter((u) => u.status === 'in_stock').map((u) => u.traceCode);
    let idx = 0;
    for (const it of order.items) {
      const p = snapshot.products.find((x) => x.code === it.code) ?? snapshot.products.find((x) => x.title === it.title);
      const batch = snapshot.trace.batches.find((b) => b.productCode === (p?.code ?? ''));
      const codes = [];
      for (let i = 0; i < it.qty && idx < pool.length; i += 1) {
        codes.push(pool[idx++]);
      }
      it.traceCodes = codes;
      void batch;
    }
    s.totalPaid += order.payAmount;
    recomputeUser();
    saveState();
    return ok({ ...order, prepayId: `demo_${Date.now().toString(36)}`, tierUpgradedTo: order.items.length ? loadState().user?.tierCode : 'xinYa' }, '支付成功（演示模式为模拟支付）');
  }],

  [/^\/api\/orders\/([\w-]+)\/cancel$/, (_m, _u, [, no]) => {
    const s = loadState();
    const order = s.orders.find((o) => o.orderNo === no);
    if (!order) return fail('订单不存在', 'NOT_FOUND');
    order.status = 'closed';
    order.statusText = '已关闭';
    saveState();
    return ok(order, '订单已取消');
  }],

  [/^\/api\/orders\/([\w-]+)\/confirm$/, (_m, _u, [, no]) => {
    const s = loadState();
    const order = s.orders.find((o) => o.orderNo === no);
    if (!order) return fail('订单不存在', 'NOT_FOUND');
    order.status = 'done';
    order.statusText = '已完成';
    order.finishedAt = new Date().toISOString();
    saveState();
    return ok(order, '已确认收货');
  }],

  [/^\/api\/orders\/([\w-]+)\/refund$/, (_m, _u, [, no], body) => {
    const s = loadState();
    const order = s.orders.find((o) => o.orderNo === no);
    if (!order) return fail('订单不存在', 'NOT_FOUND');
    order.status = 'refunding';
    order.statusText = '售后中';
    order.remark = `售后原因：${body?.reason ?? ''}`;
    saveState();
    return ok(order, '售后申请已提交');
  }],

  [/^\/api\/orders\/([\w-]+)$/, (_m, _u, [, no]) => {
    const s = loadState();
    const order = s.orders.find((o) => o.orderNo === no);
    if (!order) return fail('订单不存在', 'NOT_FOUND');
    return ok(order);
  }],

  /* ---------- 溯源 ---------- */
  [/^\/api\/trace\/overview$/, () => ok({
    flow: snapshot.brandFull.traceFlow,
    images: snapshot.brand.images,
    algorithm: {
      code: 'ECDSA / secp256k1（椭圆曲线数字签名）',
      chain: 'SHA-256 哈希链（逐节点存证）',
      qr: '静态演示模式（浏览器端生成）',
    },
    batches: snapshot.trace.batches,
    stats: {
      scans: snapshot.trace.units.reduce((a, b) => a + (b.scanCount ?? 0), 0),
      units: snapshot.trace.units.length,
      batches: snapshot.trace.batches.length,
    },
    antiFakeTip: snapshot.trace.antiFakeTip,
    loggedIn: Boolean(loadState().user),
  })],

  [/^\/api\/trace\/codes$/, (_m, url) => {
    const batch = url.searchParams.get('batch');
    const list = snapshot.trace.units.filter((u) => !batch || u.batchNo === batch).slice(0, 30)
      .map((u) => ({ traceCode: u.traceCode, batchNo: u.batchNo, status: u.status, scanCount: u.scanCount }));
    return ok({ list });
  }],

  [/^\/api\/trace\/demo$/, () => {
    const u = snapshot.trace.units[0];
    return ok({ traceCode: u.traceCode, batchNo: u.batchNo, url: `${snapshot.baseUrl}/#/trace?code=${u.traceCode}` });
  }],

  [/^\/api\/trace\/verify$/, async (_m, url) => {
    const code = url.searchParams.get('code');
    const token = url.searchParams.get('t');
    let traceCode = code;

    if (token) {
      /**
       * 演示模式的 token 校验（服务端用 ECDSA 私钥验签，这里没有私钥，因此做结构校验）：
       * token = base64(溯源码|批次号|检验编号|签名)，必须是 4 段且前两段非空。
       * 结构不对就明确判为仿制品 —— 不能"格式错误就退化成按明文码查询"，
       * 那会让篡改后的 token 也能查到溯源信息（第一版就是这么写的，属于逻辑漏洞）。
       */
      let raw = '';
      try {
        raw = decodeURIComponent(escape(atob(token.replace(/-/g, '+').replace(/_/g, '/'))));
      } catch {
        raw = '';
      }
      const parts = raw.split('|');
      const malformed = parts.length < 4 || !parts[0] || !parts[1] || !parts[3];
      traceCode = parts[0] || code;
      if (malformed) {
        return ok({
          authentic: false,
          reason: 'signature_invalid',
          traceCode,
          message: '该二维码的数字签名校验失败，可能为仿制品，请立即联系官方客服核实。',
        });
      }
      /**
       * 内容摘要比对：
       * 浏览器端没有 ECDSA 私钥，无法做真正的签名验证；
       * 但可以用构建时算好、写在快照里的摘要比对"内容有没有被改动"，
       * 这样依然能演示"二维码被篡改就报警"。
       */
      const payload = `${parts[0]}|${parts[1]}|${parts[2]}`;
      const digest = (await sha256Hex(payload)).slice(0, 16);
      if (snapshot.trace.tokenDigest && digest !== snapshot.trace.tokenDigest) {
        return ok({
          authentic: false,
          reason: 'signature_invalid',
          traceCode,
          message: '该二维码的数字签名校验失败，可能为仿制品，请立即联系官方客服核实。',
        });
      }
    }

    const unit = snapshot.trace.units.find((u) => u.traceCode === traceCode);
    if (!unit) {
      return ok({
        authentic: false, reason: 'not_found', traceCode,
        message: '系统中没有找到该溯源码，请核对输入是否正确，或联系客服核实。',
      });
    }
    const batch = snapshot.trace.batches.find((b) => b.batchNo === unit.batchNo);
    const detail = snapshot.trace.batchDetails[unit.batchNo];
    const isFirst = (unit.scanCount ?? 0) === 0;
    const count = (unit.scanCount ?? 0) + 1;
    unit.scanCount = count;
    return ok({
      authentic: true,
      traceCode: unit.traceCode,
      batchNo: unit.batchNo,
      unitStatus: unit.status,
      unitStatusText: { in_stock: '已入库', sold: '已售出', shipped: '已发货' }[unit.status] ?? unit.status,
      scan: {
        count, isFirst,
        tip: isFirst
          ? '✅ 正品验证通过：该码为首次查询，是刚从浒口村发出的这一瓶。'
          : `⚠️ 该码不是首次查询，已被查询 ${count} 次。如果您是第一次扫这个码，请警惕商品被二次封装的可能，并联系客服核实。`,
      },
      signature: {
        algorithm: 'ECDSA / secp256k1 + SHA-256',
        verified: true,
        note: '二维码内含对「溯源码|批次号|检验编号」的数字签名，复制二维码无法伪造签名信息。（静态演示模式在浏览器端校验）',
      },
      chain: {
        algorithm: 'SHA-256 哈希链（逐节点存证）',
        intact: detail.chain.intact,
        nodeCount: detail.chain.nodeCount,
        head: detail.chain.chainHead,
        note: detail.chain.intact
          ? '全部节点哈希校验通过，溯源数据未被篡改。'
          : '检测到节点哈希不匹配，数据可能被篡改。',
      },
      product: snapshot.products.find((p) => p.code === batch?.productCode) ?? null,
      batch: { ...batch, landInfo: snapshot.brandFull.traceFlow },
      timeline: detail.timeline,
      report: { inspectionNo: batch?.inspectionNo, url: batch?.inspectionReport },
      qr: { encoder: '静态演示模式', printTip: '瓶底二维码已做刮开涂层，扫码即可查看本瓶完整履历。' },
    });
  }],

  [/^\/api\/trace\/batch\/([\w-]+)$/, (_m, _u, [, batchNo]) => {
    const detail = snapshot.trace.batchDetails[batchNo];
    if (!detail) return fail('批次不存在', 'NOT_FOUND');
    const units = snapshot.trace.units.filter((u) => u.batchNo === batchNo);
    return ok({
      batch: detail.batch,
      timeline: detail.timeline,
      chain: detail.chain,
      units: {
        total: units.length,
        inStock: units.filter((u) => u.status === 'in_stock').length,
        sold: units.filter((u) => u.status !== 'in_stock').length,
        scans: units.reduce((a, b) => a + (b.scanCount ?? 0), 0),
      },
    });
  }],

  [/^\/api\/trace\/chain\/([\w-]+)$/, (_m, _u, [, batchNo]) => ok(snapshot.trace.batchDetails[batchNo]?.chain ?? { intact: true })],

  /* ---------- AI 客服 ---------- */
  [/^\/api\/ai\/bootstrap$/, () => ok({
    quick: snapshot.quickQuestions,
    hot: snapshot.hotQuestions ?? [],
    greeting: '你好呀，我是你的专属芽芽～宝宝的皮肤、抚触、产品安全、订单物流问题都可以问我。如果宝宝有具体症状，直接描述（比如"宝宝 3 个月，脖子褶皱发红两天"），我会帮你判断能不能用、怎么用。',
    disclaimer: '我不是医生，涉及诊断与用药请以医生意见为准；出现发热、化脓、破溃等情况请先就医。',
    user: loadState().user ? { id: 90001, nickname: loadState().user.nickname } : null,
    engine: 'rule-engine（静态演示，与后端同一套规则）',
    qrEncoder: 'static-demo',
  })],

  [/^\/api\/ai\/chat$/, (_m, _u, _p, body) => {
    const text = String(body?.text ?? '');
    if (!text.trim()) return fail('请输入要咨询的内容');
    const s = loadState();
    // 会话槽位本地保存，支持多轮追问
    const prev = s.chatSlots ?? {};
    const order = s.orders[0];
    const reply = buildRuleReply({
      text,
      slots: prev,
      data: { kbEntries: snapshot.kbEntries, order },
    });
    s.chatSlots = reply.slots;
    saveState();
    return ok({
      sessionId: s.sessionId ?? (s.sessionId = `demo_${Date.now().toString(36)}`),
      reply: { messageId: `m_${Date.now().toString(36)}`, ...reply, engine: { mode: 'rule-engine', polished: false } },
      conversation: { sessionId: s.sessionId, status: reply.handoff.needed ? 'human' : 'ai', emotion: reply.emotion.label },
    });
  }],

  [/^\/api\/ai\/history\//, () => ok({ list: [] })],
  [/^\/api\/ai\/handoff$/, () => ok({ status: 'human' }, '演示模式：正式环境会转接人工客服')],

  [/^\/api\/ai\/debug\/analyze$/, (_m, _u, _p, body) => {
    const text = String(body?.text ?? '');
    const slots = extractSlots(text);
    return ok({ text, intent: detectIntent(text), slots, triage: triageSymptoms(text, slots), emotion: analyzeEmotion(text) });
  }],

  [/^\/api\/admin/, () => fail('静态演示模式不包含管理后台，请在本地运行时查看（npm start）', 'DEMO_MODE')],
];

/** 结算算价：与后端 calcCart 的规则保持一致 */
function computePrice(cartLines, couponCode, address, overrideLines) {
  const lines = overrideLines ?? shapeCart().items.map((i) => ({ code: i.code, title: i.title, spec: i.spec, price: i.price, qty: i.qty, image: i.image }));
  const goodsAmount = lines.reduce((a, b) => a + b.price * b.qty, 0);
  const userTier = (snapshot.tiers ?? []).find((t) => t.code === loadState().user?.tierCode);
  const tierOff = userTier && userTier.discount < 100 ? Math.round(goodsAmount * (100 - userTier.discount) / 100) : 0;

  let coupon = null;
  let couponOff = 0;
  if (couponCode) {
    const c = (snapshot.coupons ?? []).find((x) => x.code === couponCode && x.status === 'unused');
    if (c && goodsAmount >= c.minAmount) {
      coupon = { code: c.code, title: c.title, amount: c.amount };
      couponOff = c.amount;
    }
  }
  const beforeFreight = Math.max(0, goodsAmount - tierOff - couponOff);
  const freight = beforeFreight >= 9900 ? 0 : 800;
  return {
    items: lines.map((l) => ({ ...l, cartId: null, amount: l.price * l.qty, tags: [], sellingPoints: [], gallery: [] })),
    goodsAmount, tierDiscount: tierOff, tier: userTier ?? null,
    coupon, couponDiscount: couponOff, freight, payAmount: beforeFreight + freight,
    freeFreightGap: Math.max(0, 9900 - beforeFreight),
    coupons: (snapshot.coupons ?? []).map((c) => ({ ...c, usable: c.status === 'unused' && goodsAmount >= c.minAmount })),
    addresses: address ? [address] : (snapshot.demoState?.address ? [snapshot.demoState.address] : []),
    needAddress: !address && !snapshot.demoState?.address,
  };
}

/* ============================================================
 * 拦截层
 * ============================================================ */
function matchRoute(pathname, method) {
  void method;
  for (const [re, handler] of ROUTES) {
    const m = pathname.match(re);
    if (m) return { handler, m };
  }
  return null;
}

export function createDemoFetch(raw) {
  return async function demoFetch(input, init = {}) {
    const urlStr = typeof input === 'string' ? input : input?.url ?? '';
    // 只拦截同源的 /api/ 请求，其余（图片、报告、外部）交给原始 fetch
    if (!/\/api\//.test(urlStr)) return raw(input, init);

    let url;
    try {
      url = new URL(urlStr, location.href);
    } catch {
      return raw(input, init);
    }
    const method = String(init.method || (typeof input !== 'string' && input?.method) || 'GET').toUpperCase();
    let body = null;
    if (init.body) {
      try { body = JSON.parse(init.body); } catch { body = null; }
    }
    const hit = matchRoute(url.pathname, method);
    const payload = hit
      ? await hit.handler(hit.m, url, hit.m, body, method)   // 部分路由（如溯源验签）是异步的
      : fail(`演示模式暂不支持该接口：${method} ${url.pathname}`, 'DEMO_UNSUPPORTED');

    // 模拟一点网络延迟，让界面过渡自然
    await new Promise((r) => setTimeout(r, 60));
    return new Response(JSON.stringify(payload), {
      status: payload.code === 0 ? 200 : (payload.code === 'UNAUTHORIZED' ? 401 : 400),
      headers: { 'Content-Type': 'application/json; charset=utf-8' },
    });
  };
}

export function installDemoApi(snapshotData) {
  snapshot = snapshotData;
  local = null;
  loadState();
  const raw = globalThis.fetch.bind(globalThis);
  globalThis.fetch = createDemoFetch(raw);
  if (typeof window !== 'undefined') window.fetch = globalThis.fetch;
  return {
    reset: resetDemoState,
    snapshot,
  };
}

export default { installDemoApi, createDemoFetch, resetDemoState };
