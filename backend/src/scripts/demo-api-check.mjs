/**
 * 静态演示模式 · 本地 API 自检
 * 用法: 先启动静态服务器（node src/scripts/serve-static.mjs ../site 8899），再运行本脚本
 *       node src/scripts/demo-api-check.mjs
 *
 * 作用：不依赖浏览器，直接加载构建产物里的 demo-api.js 与数据快照，
 * 逐项验证「演示模式下用户能做的事」是否真的可用：
 *   商品/推荐/购物车/下单/支付/分配溯源码/溯源验签/AI 对话/登录/会员升级
 */
import path from 'node:path';
import { pathToFileURL } from 'node:url';

const BASE = process.env.DEMO_BASE || 'http://127.0.0.1:8899';

let pass = 0;
let fail = 0;
const t = (ok, name, detail = '') => {
  if (ok) { pass += 1; console.log(`✅ ${name}${detail ? ` — ${detail}` : ''}`); }
  else { fail += 1; console.log(`❌ ${name}${detail ? ` — ${detail}` : ''}`); }
};

/* ---- 最小浏览器环境（demo-api 只依赖 location / localStorage / fetch / atob） ---- */
const store = new Map();
globalThis.localStorage = {
  getItem: (k) => (store.has(k) ? store.get(k) : null),
  setItem: (k, v) => store.set(k, String(v)),
  removeItem: (k) => store.delete(k),
};
globalThis.location = { href: `${BASE}/#/` };
globalThis.atob = (s) => Buffer.from(String(s), 'base64').toString('binary');
globalThis.btoa = (s) => Buffer.from(String(s), 'binary').toString('base64');
// 原生 fetch（demo-api 会包一层）
const nativeFetch = globalThis.fetch.bind(globalThis);
globalThis.__nativeFetch = nativeFetch;

// 测试对象是"构建产物里的 demo-api"：它旁边的 ai-rules / knowledge-base 都已随站点复制，
// 与浏览器实际加载的文件完全一致（而不是前端源码）。
const demoApiPath = process.env.DEMO_API
  ? path.resolve(process.env.DEMO_API)
  : path.resolve(process.cwd(), '..', 'site', 'scripts', 'demo-api.js');
const { installDemoApi } = await import(pathToFileURL(demoApiPath).href);

const snapshot = await nativeFetch(`${BASE}/data/api-snapshot.json`).then((r) => r.json());
installDemoApi(snapshot);

const api = async (path, { method = 'GET', body } = {}) => {
  const res = await fetch(path, {
    method,
    headers: { 'Content-Type': 'application/json' },
    ...(body ? { body: JSON.stringify(body) } : {}),
  });
  const json = await res.json();
  return json;
};

console.log(`\n=== 静态演示模式自检 @ ${BASE} ===\n`);

/* 1. 首页与商品 */
const home = await api('/api/home');
t(home.code === 0 && home.data.hot.length > 0, '首页数据（热销商品）', `${home.data.hot.length} 个`);

const list = await api('/api/products');
t(list.data.list.length >= 4, '商品列表', `${list.data.total} 个在售`);

const detail = await api('/api/products/CY-OIL-100');
t(detail.data.product && detail.data.product.sellingPoints.length >= 5, '商品详情（卖点/参数/对比）',
  `${detail.data.product.sellingPoints.length} 个卖点`);

const rec = await api('/api/recommend', { method: 'POST', body: { cart: ['CY-OIL-30'] } });
t(rec.data.items.length > 0, 'AI 智能搭配推荐', rec.data.items[0]?.reason?.slice(0, 24));

/* 2. 登录 → 加购 → 下单 → 支付 → 分配溯源码 */
const login = await api('/api/auth/login-code', { method: 'POST', body: { phone: '13800000002', code: '123456' } });
t(login.data.token === 'demo-token', '登录（演示模式）', login.data.user.nickname);

await api('/api/cart', { method: 'POST', body: { code: 'CY-OIL-100', qty: 2 } });
const cart = await api('/api/cart');
t(cart.data.items.length === 1 && cart.data.totalQty === 2, '加入购物车', `小计 ¥${(cart.data.goodsAmount / 100).toFixed(2)}`);

const addresses = await api('/api/addresses');
await api('/api/addresses', { method: 'POST', body: { receiver: '演示收货人', phone: '13800000002', province: '广东省', city: '珠海市', district: '香洲区', detail: '金凤路 18 号', isDefault: true } });

const preview = await api('/api/cart/checkout-preview', { method: 'POST', body: { couponCode: 'NEWUSER10' } });
t(preview.data.couponDiscount === 1000, '结算试算（优惠券生效）', `应付 ¥${(preview.data.payAmount / 100).toFixed(2)}`);

const order = await api('/api/orders', { method: 'POST', body: { couponCode: 'NEWUSER10' } });
t(Boolean(order.data.orderNo), '创建订单', `${order.data.orderNo} 应付 ¥${(order.data.payAmount / 100).toFixed(2)}`);

const paid = await api(`/api/orders/${order.data.orderNo}/pay`, { method: 'POST', body: { channel: 'mock_wechat' } });
const codes = paid.data.items?.[0]?.traceCodes ?? [];
t(paid.data.status === 'paid' && codes.length === 2, '模拟支付并分配一物一码', `本单溯源码 ${codes.join(', ')}`);

/* 3. 溯源：验签 + 时间轴 + 哈希链 + 首次/重复查询 */
const token = snapshot.trace.demoToken;
const v1 = await api(`/api/trace/verify?t=${encodeURIComponent(token)}`);
t(v1.data.authentic === true, '扫码溯源（签名校验通过）', `农户 ${v1.data.batch?.farmer} / 批次 ${v1.data.batchNo}`);
t(v1.data.timeline?.length >= 6, '溯源时间轴', `${v1.data.timeline?.length} 个节点`);
t(v1.data.chain?.intact === true, '哈希链完整性校验', `链头 ${String(v1.data.chain?.head).slice(0, 16)}…`);

const v2 = await api(`/api/trace/verify?t=${encodeURIComponent(token)}`);
t(v2.data.scan.count === v1.data.scan.count + 1, '重复查询计数与防伪提示', v2.data.scan.tip.slice(0, 28) + '…');

/**
 * 篡改测试要改"内容"，不是改签名尾巴。
 * 演示模式没有 ECDSA 私钥，无法验签名本身；它对"内容是否与构建时一致"做摘要比对。
 * 所以这里把 token 里的溯源码换成另一个合法的码（内容变了、结构仍合法），
 * 摘要比对就应该拒绝它 —— 这正是"二维码被改动就会报警"的演示点。
 */
const decoded = Buffer.from(token.replace(/-/g, '+').replace(/_/g, '/'), 'base64').toString('utf8');
const parts = decoded.split('|');
const otherCode = snapshot.trace.units[1].traceCode;
parts[0] = otherCode;
const tamperedToken = Buffer.from(parts.join('|'), 'utf8').toString('base64')
  .replace(/\+/g, '-').replace(/\//g, '_').replace(/=+$/, '');
const vFake = await api(`/api/trace/verify?t=${encodeURIComponent(tamperedToken)}`);
t(vFake.data.authentic === false, '篡改内容的 token 被拒绝（摘要比对）', vFake.data.reason);

// 结构不合法（段数不足）也应被拒绝
const brokenToken = Buffer.from('CY26010115010001', 'utf8').toString('base64').replace(/=+$/, '');
const vBroken = await api(`/api/trace/verify?t=${encodeURIComponent(brokenToken)}`);
t(vBroken.data.authentic === false, '结构不合法的 token 被拒绝', vBroken.data.reason);

const vUnknown = await api('/api/trace/verify?code=CY999999ZZZZZZZZ');
t(vUnknown.data.authentic === false && vUnknown.data.reason === 'not_found', '不存在的溯源码被拒绝', vUnknown.data.reason);

/* 4. AI 客服：意图 / 症状分级 / 医疗红线 / 情绪 */
const ask = async (text) => (await api('/api/ai/chat', { method: 'POST', body: { text } })).data.reply;

const a1 = await ask('产品有检测报告吗？安全吗');
t(a1.intent === 'safety', 'AI 意图识别（安全性）', a1.answer.slice(0, 24) + '…');

const a2 = await ask('宝宝3个月，脖子褶皱处发红两天了能用吗');
t(a2.intent === 'symptom' && a2.triage.level === 'caution', '症状分级（谨慎）',
  a2.triage.matched.map((m) => m.name).join('、'));

const a3 = await ask('宝宝发烧了，身上还有疹子，能涂吗');
t(a3.triage.level === 'emergency' && a3.answer.includes('就医'), '医疗安全红线（先建议就医）',
  a3.triage.redFlags.map((r) => r.reason).join('、'));

const a4 = await ask('一次用多少油？怎么给宝宝抚触');
t(a4.intent === 'massage' && a4.cards.length >= 1, '抚触科普与用量 + 卡片消息', `${a4.cards.length} 张卡片`);

const a5 = await ask('你们这个太慢了，我要投诉');
t(a5.handoff.needed === true, '情绪识别并转人工', a5.handoff.reasons.join('；'));

/**
 * 订单问答放在最后：顺便验证"换话题后旧症状槽位会被清掉"。
 * 前面刚问过"发烧"，如果槽位没清干净，这句会被误判成紧急症状（曾经的真实 bug）。
 */
const a6 = await ask('我的订单到哪了？');
t(a6.intent === 'order' && a6.answer.includes('订单'), '订单物流问答（且不受上一轮症状影响）', a6.answer.slice(0, 28) + '…');

/* 5. 会员升级 */
const me = await api('/api/me');
t(Boolean(me.data.tier?.current), '会员中心', `${me.data.tier.current.name}，累计 ¥${(me.data.user.totalPaid / 100).toFixed(2)}`);

/* 6. 管理后台应明确拒绝 */
const admin = await api('/api/admin/overview');
t(admin.code === 'DEMO_MODE', '管理后台在演示模式下明确提示不可用', admin.message.slice(0, 24) + '…');

console.log(`\n=== 结果：${pass} 通过 / ${fail} 失败 ===\n`);
process.exit(fail ? 1 : 0);
