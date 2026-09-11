/**
 * 端到端冒烟测试：登录 → 加购 → 结算 → 下单 → 支付 → 溯源扫码防伪 → AI 客服 → 后台发货
 * 用法：先 `npm start`，另开终端执行 `npm run smoke`
 */
const BASE = process.env.SMOKE_BASE || 'http://127.0.0.1:8788';
let pass = 0;
let fail = 0;

const log = (ok, name, detail = '') => {
  if (ok) { pass += 1; console.log(`✅ ${name}${detail ? ` — ${detail}` : ''}`); }
  else { fail += 1; console.log(`❌ ${name}${detail ? ` — ${detail}` : ''}`); }
};

async function api(method, path, { token, body } = {}) {
  const res = await fetch(`${BASE}${path}`, {
    method,
    headers: {
      'Content-Type': 'application/json',
      ...(token ? { Authorization: `Bearer ${token}` } : {}),
    },
    ...(body ? { body: JSON.stringify(body) } : {}),
  });
  const json = await res.json().catch(() => ({}));
  return { status: res.status, json };
}

(async () => {
  console.log(`\n=== 茶芽芽商城端到端冒烟测试 @ ${BASE} ===\n`);

  /* 0. 每次运行使用新手机号注册，保证用例可重复执行（优惠券/会员状态互不干扰） */
  const phone = `139${String(Date.now()).slice(-8)}`;
  await api('POST', '/api/auth/send-code', { body: { phone } });
  const reg = await api('POST', '/api/auth/login-code', { body: { phone, code: '123456', nickname: '冒烟测试用户' } });
  const regToken = reg.json?.data?.token;
  log(Boolean(regToken), '新用户注册登录（验证码）', `${phone} / ${reg.json?.data?.user?.tierCode}`);

  // 新用户券默认不会自动发放，这里主动领取一张，保证优惠券链路可测
  await api('POST', '/api/coupons/claim', { token: regToken, body: { code: 'NEWUSER10' } });
  const token = regToken;

  /* 0.1 新增收货地址（下单前置条件） */
  const addr = await api('POST', '/api/addresses', {
    token,
    body: {
      receiver: '冒烟测试', phone, province: '广东省', city: '珠海市',
      district: '香洲区', detail: '唐家湾镇金凤路 18 号北师大珠海校区', isDefault: true,
    },
  });
  log(Boolean(addr.json?.data?.id), '新增收货地址', `地址ID ${addr.json?.data?.id}`);

  /* 1. 商品与推荐 */
  const list = await api('GET', '/api/products');
  log(list.json?.data?.list?.length >= 2, '商品列表', `共 ${list.json?.data?.total} 个在售商品`);
  const recommend = await api('POST', '/api/recommend', { body: { cart: ['CY-OIL-30'] } });
  log(recommend.json?.data?.items?.length > 0, 'AI 智能搭配推荐', recommend.json?.data?.items?.[0]?.reason?.slice(0, 30));

  /* 3. 加入购物车 → 结算预览 */
  await api('POST', '/api/cart', { token, body: { code: 'CY-OIL-100', qty: 2 } });
  const cart = await api('GET', '/api/cart', { token });
  log(cart.json?.data?.items?.length === 1, '加入购物车', `小计 ¥${(cart.json?.data?.goodsAmount / 100).toFixed(2)}`);
  const preview = await api('POST', '/api/cart/checkout-preview', { token, body: { couponCode: 'NEWUSER10' } });
  const previewData = preview.json?.data;
  log(previewData?.couponDiscount === 1000, '结算试算（含优惠券）', `应付 ¥${(previewData?.payAmount / 100).toFixed(2)}`);

  /* 4. 下单 → 支付 */
  const order = await api('POST', '/api/orders', { token, body: { couponCode: 'NEWUSER10' } });
  const orderNo = order.json?.data?.orderNo;
  log(Boolean(orderNo), '创建订单', `${orderNo} 应付 ¥${(order.json?.data?.payAmount / 100).toFixed(2)}`);
  const pay = await api('POST', `/api/orders/${orderNo}/pay`, { token, body: { channel: 'mock_wechat' } });
  log(pay.json?.data?.status === 'paid', '模拟支付', `会员等级：${pay.json?.data?.tierUpgradedTo}`);

  /* 5. 支付后是否分配一物一码 */
  const detail = await api('GET', `/api/orders/${orderNo}`, { token });
  const codes = detail.json?.data?.items?.[0]?.traceCodes ?? [];
  log(codes.length === 2, '支付后自动分配一物一码', `本单溯源码：${codes.join(', ')}`);

  /* 6. 溯源扫码：验签 + 时间轴 + 哈希链 */
  const qr = await api('GET', `/api/trace/qr/${codes[0]}`);
  const traceToken = new URL(qr.json?.data?.url ?? 'http://x/#/trace?t=').hash.split('t=')[1];
  const trace = await api('GET', `/api/trace/verify?t=${encodeURIComponent(traceToken ?? '')}`);
  const traceData = trace.json?.data;
  log(traceData?.authentic === true, '扫码溯源验签通过', `农户 ${traceData?.batch?.farmer} / 批次 ${traceData?.batchNo}`);
  log(traceData?.timeline?.length >= 6, '溯源时间轴节点', `${traceData?.timeline?.length} 个节点：${traceData?.timeline?.map((t) => t.stageName).slice(0, 3).join(' → ')}…`);
  log(traceData?.chain?.intact === true, '哈希链完整性校验', `链头 ${String(traceData?.chain?.head).slice(0, 16)}…`);
  log(traceData?.scan?.isFirst === false || traceData?.scan?.isFirst === true, '首次/重复查询防伪提示', traceData?.scan?.tip?.slice(0, 40));

  const fake = await api('GET', `/api/trace/verify?t=${encodeURIComponent((traceToken ?? '').slice(0, -6) + 'AAAAAA')}`);
  log(fake.json?.data?.authentic === false, '篡改 token 被拒绝', fake.json?.data?.message?.slice(0, 30));

  const unknown = await api('GET', '/api/trace/verify?code=CY999999ZZZZZZZZ');
  log(unknown.json?.data?.authentic === false, '不存在的溯源码被拒绝', unknown.json?.data?.reason);

  /* 7. AI 客服：普通咨询 + 症状分级 + 医疗红线 + 情绪转人工 */
  const ask1 = await api('POST', '/api/ai/chat', { token, body: { text: '产品有检测报告吗？安全吗' } });
  log(ask1.json?.data?.reply?.intent === 'safety', 'AI 意图识别（安全性）', ask1.json?.data?.reply?.answer?.slice(0, 30));

  const ask2 = await api('POST', '/api/ai/chat', {
    token,
    body: { sessionId: ask1.json?.data?.sessionId, text: '宝宝3个月，脖子褶皱处发红两天了能用吗' },
  });
  log(ask2.json?.data?.reply?.intent === 'symptom' && ask2.json?.data?.reply?.triage?.level === 'caution',
    '症状适用性分级（caution）', `命中症状：${ask2.json?.data?.reply?.triage?.matched?.map((m) => m.name).join('、')}`);

  const ask3 = await api('POST', '/api/ai/chat', {
    token,
    body: { sessionId: ask1.json?.data?.sessionId, text: '宝宝发烧了，身上还有疹子，能涂这个油吗' },
  });
  const redFlagged = ask3.json?.data?.reply?.triage?.level === 'emergency'
    && ask3.json?.data?.reply?.answer?.includes('就医');
  log(redFlagged, '医疗安全红线（先建议就医）', `红线：${ask3.json?.data?.reply?.triage?.redFlags?.map((r) => r.reason).join('、')}`);

  const ask4 = await api('POST', '/api/ai/chat', { token, body: { text: '你们这个太慢了，我要投诉！' } });
  log(ask4.json?.data?.reply?.handoff?.needed === true, '情绪识别并转人工', ask4.json?.data?.reply?.handoff?.reasons?.join('；'));

  const lab = await api('POST', '/api/dev/ai-lab');
  const labData = lab.json?.data;
  log(labData?.passed === labData?.total, 'AI 规则回归用例', `${labData?.passed}/${labData?.total} 通过`);

  /* 8. 会员等级与权益 */
  const me = await api('GET', '/api/me', { token });
  log(Boolean(me.json?.data?.tier?.current), '会员中心', `${me.json?.data?.tier?.current?.name}，累计消费 ¥${(me.json?.data?.user?.totalPaid / 100).toFixed(2)}`);

  /* 9. 后台：登录 → 发货 → 看板 */
  const adminLogin = await api('POST', '/api/auth/login', { body: { phone: '13800000001', password: 'chayaya2026' } });
  const adminToken = adminLogin.json?.data?.token;
  log(Boolean(adminToken), '管理员登录', adminLogin.json?.data?.user?.nickname);
  const ship = await api('POST', `/api/admin/orders/${orderNo}/ship`, {
    token: adminToken,
    body: { company: '乡村物流专线', trackingNo: 'HKCY20260911001' },
  });
  log(ship.json?.data?.status === 'shipped', '后台发货', `${orderNo} 已发货`);
  const shipped = await api('GET', `/api/orders/${orderNo}`, { token });
  log(shipped.json?.data?.status === 'shipped' && (shipped.json?.data?.logistics?.length ?? 0) > 0, '用户侧看到物流轨迹', shipped.json?.data?.logistics?.[0]?.text);

  const overview = await api('GET', '/api/admin/overview', { token: adminToken });
  log(Boolean(overview.json?.data?.cards), '后台数据看板', `用户 ${overview.json?.data?.cards?.users} / 订单 ${overview.json?.data?.cards?.orders} / 溯源扫码 ${overview.json?.data?.cards?.scans}`);

  const traceLab = await api('POST', '/api/dev/trace-lab');
  log(traceLab.json?.data?.steps?.every?.((s) => s.ok), '溯源实验室全链路', `${traceLab.json?.data?.steps?.length} 个步骤全部通过`);

  /* 10. 库存同步 */
  const before = (await api('GET', '/api/products/CY-OIL-100')).json?.data?.product?.stock;
  const stockRes = await api('POST', '/api/admin/products/CY-OIL-100/stock', { token: adminToken, body: { delta: 100, reason: 'smoke-test 入库' } });
  const after = stockRes.json?.data?.stock;
  log(after === before + 100, '库存实时同步', `${before} → ${after}`);

  console.log(`\n=== 结果：${pass} 通过 / ${fail} 失败 ===\n`);
  process.exit(fail ? 1 : 0);
})().catch((e) => {
  console.error('冒烟测试异常：', e);
  process.exit(1);
});
