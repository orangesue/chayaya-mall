/**
 * 订单服务
 * 项目书 3.3.1：购物车与订单管理（实时库存同步）；支付系统集成微信支付/支付宝/银联，
 * 自营侧直连，支持订单提醒等；订单标记来源平台（自营/京东/淘宝…）便于统计分析。
 *
 * 演示环境下支付走"模拟支付"通道（pay_channel=mock_wechat），
 * 真实接入时把 payOrder 内的分支替换为微信支付统一下单即可，其余流程不变。
 */
import { query, get, run, withTransaction, db } from '../db/index.mjs';
import { orderNo as buildOrderNo } from '../utils/crypto.mjs';
import { nowIso } from '../utils/datetime.mjs';
import { badRequest, conflict, notFound, forbidden } from '../http/respond.mjs';
import { calcCart } from './cart.mjs';
import { getCache } from '../db/cache.mjs';
import { refreshMemberTier } from '../http/auth.mjs';

const parseJson = (s, def) => {
  if (!s) return def;
  try { return JSON.parse(s); } catch { return def; }
};

const STATUS_TEXT = {
  pending_pay: '待付款',
  paid: '待发货',
  shipped: '待收货',
  done: '已完成',
  closed: '已关闭',
  refunding: '售后中',
};

export function shapeOrder(row, items = []) {
  return {
    id: row.id,
    orderNo: row.order_no,
    status: row.status,
    statusText: STATUS_TEXT[row.status] ?? row.status,
    goodsAmount: row.goods_amount,
    discountAmount: row.discount_amount,
    freight: row.freight,
    payAmount: row.pay_amount,
    payAmountText: (row.pay_amount / 100).toFixed(2),
    address: parseJson(row.address_json, {}),
    sourcePlatform: row.source_platform,
    payChannel: row.pay_channel,
    paidAt: row.paid_at,
    shippedAt: row.shipped_at,
    finishedAt: row.finished_at,
    logistics: parseJson(row.logistics_json, []),
    remark: row.remark,
    createdAt: row.created_at,
    items: items.map((it) => ({
      productId: it.product_id,
      title: it.title,
      spec: it.spec,
      price: it.price,
      qty: it.qty,
      image: it.image,
      traceCodes: parseJson(it.trace_codes_json, []),
    })),
  };
}

/** 从购物车下单 */
export async function createOrder(userId, { addressId, couponCode, remark, items: directItems } = {}) {
  const address = addressId
    ? await get('SELECT * FROM addresses WHERE id = ? AND user_id = ?', [addressId, userId])
    : await get('SELECT * FROM addresses WHERE user_id = ? ORDER BY is_default DESC LIMIT 1', [userId]);
  if (!address) {
    throw badRequest('请先填写收货地址后再提交订单（可在「我的 → 收货地址」中添加）');
  }

  let calc;
  if (Array.isArray(directItems) && directItems.length) {
    // 详情页"立即购买"路径：把商品临时写入购物车以外的独立计算
    calc = await calcDirectPurchase(userId, directItems, couponCode);
  } else {
    calc = await calcCart(userId, couponCode);
  }

  const no = buildOrderNo();
  const now = nowIso();
  const addressSnapshot = {
    receiver: address.receiver,
    phone: address.phone,
    province: address.province,
    city: address.city,
    district: address.district,
    detail: address.detail,
  };

  const orderId = await withTransaction(async () => {
    // 扣减库存（条件更新，防止超卖）
    for (const it of calc.items) {
      const res = await run(
        'UPDATE products SET stock = stock - ? WHERE id = ? AND stock >= ?',
        [it.qty, it.id, it.qty],
      );
      if (!res.changes) throw conflict(`「${it.title} ${it.spec}」库存不足，请调整数量`);
      await run(
        'INSERT INTO stock_logs (product_id, delta, reason, order_no, created_at) VALUES (?, ?, ?, ?, ?)',
        [it.id, -it.qty, 'order_create', no, now],
      );
    }

    const info = await run(
      `INSERT INTO orders
        (order_no, user_id, status, goods_amount, discount_amount, freight, pay_amount, coupon_id,
         address_json, source_platform, remark, created_at)
       VALUES (?, ?, 'pending_pay', ?, ?, ?, ?, ?, ?, 'self', ?, ?)`,
      [
        no, userId, calc.goodsAmount, calc.tierDiscount + calc.couponDiscount, calc.freight,
        calc.payAmount, calc.coupon?.code ?? null, JSON.stringify(addressSnapshot), remark ?? '', now,
      ],
    );

    for (const it of calc.items) {
      await run(
        `INSERT INTO order_items (order_id, product_id, title, spec, price, qty, image, trace_codes_json)
         VALUES (?, ?, ?, ?, ?, ?, ?, '[]')`,
        [info.lastInsertId, it.id, it.title, it.spec, it.price, it.qty, it.image],
      );
    }

    // 清空已下单的购物车条目
    if (!directItems?.length) {
      await run('DELETE FROM cart_items WHERE user_id = ?', [userId]);
    }
    if (calc.coupon?.code) {
      await run(
        'UPDATE user_coupons SET status = ?, used_at = ? WHERE user_id = ? AND coupon_id = (SELECT id FROM coupons WHERE code = ?)',
        ['used', now, userId, calc.coupon.code],
      );
    }
    return info.lastInsertId;
  });

  await getCache().del('shop:products');
  const order = await getOrderDetail(userId, orderId);
  return order;
}

/** 详情页立即购买：不经过购物车 */
async function calcDirectPurchase(userId, items, couponCode) {
  const normalized = [];
  for (const it of items) {
    const p = await get('SELECT * FROM products WHERE code = ?', [it.code]);
    if (!p) throw badRequest(`商品不存在：${it.code}`);
    const qty = Number(it.qty ?? 1);
    if (!Number.isInteger(qty) || qty <= 0) throw badRequest('购买数量必须是正整数');
    if (p.stock < qty) throw conflict(`「${p.title}」库存不足`);
    normalized.push({
      id: p.id, code: p.code, title: p.title, spec: p.spec, price: p.price, qty, image: p.image,
      amount: p.price * qty, stock: p.stock,
    });
  }
  const goodsAmount = normalized.reduce((s, i) => s + i.amount, 0);
  const user = await get('SELECT * FROM users WHERE id = ?', [userId]);
  const tier = await get('SELECT * FROM member_tiers WHERE code = ?', [user.tier_code]);
  const tierOff = tier && tier.discount < 100 ? Math.round(goodsAmount * (100 - tier.discount) / 100) : 0;

  let coupon = null;
  let couponOff = 0;
  if (couponCode) {
    const row = await get(
      'SELECT uc.status AS uc_status, c.* FROM user_coupons uc JOIN coupons c ON c.id = uc.coupon_id WHERE uc.user_id = ? AND c.code = ?',
      [userId, couponCode],
    );
    if (!row) throw badRequest('优惠券不存在');
    if (row.uc_status !== 'unused') throw badRequest('该优惠券已使用');
    if (goodsAmount < row.min_amount) throw badRequest(`该券需满 ${(row.min_amount / 100).toFixed(0)} 元可用`);
    coupon = { code: row.code, title: row.title, amount: row.amount };
    couponOff = row.amount;
  }

  const { default: config } = await import('../config.mjs');
  const beforeFreight = Math.max(0, goodsAmount - tierOff - couponOff);
  const freight = beforeFreight >= config.biz.freeFreightAmount ? 0 : config.biz.freightBase;
  return {
    items: normalized, goodsAmount, tierDiscount: tierOff,
    coupon, couponDiscount: couponOff, freight, payAmount: beforeFreight + freight,
  };
}

/** 模拟支付：真实接入时替换为微信支付统一下单 + 回调 */
export async function payOrder(userId, orderIdOrNo, channel = 'mock_wechat') {
  const order = await findOrder(userId, orderIdOrNo);
  if (!order) throw notFound('订单不存在');
  if (order.status === 'paid' || order.status === 'shipped' || order.status === 'done') {
    return getOrderDetail(userId, order.id);
  }
  if (order.status !== 'pending_pay') throw conflict(`当前订单状态（${STATUS_TEXT[order.status]}）无法支付`);

  const now = nowIso();
  const prepayId = `mockprepay_${Date.now().toString(36)}`;
  await run(
    'UPDATE orders SET status = ?, pay_channel = ?, paid_at = ? WHERE id = ?',
    ['paid', channel, now, order.id],
  );
  // 累计消费用于会员升级
  await run('UPDATE users SET total_paid = total_paid + ?, points = points + ? WHERE id = ?', [
    order.pay_amount, Math.floor(order.pay_amount / 100), userId,
  ]);
  const newTier = await refreshMemberTier(userId);

  // 分配一物一码：从对应批次里挑未售出的码绑定到订单
  const items = await query('SELECT * FROM order_items WHERE order_id = ?', [order.id]);
  for (const it of items) {
    const product = await get('SELECT * FROM products WHERE id = ?', [it.product_id]);
    if (!product) continue;
    const batch = await get('SELECT batch_no FROM batches WHERE product_code = ? ORDER BY id DESC LIMIT 1', [product.code]);
    if (!batch) continue;
    const units = await query(
      "SELECT trace_code FROM trace_units WHERE batch_no = ? AND status = 'in_stock' LIMIT ?",
      [batch.batch_no, it.qty],
    );
    if (!units.length) continue;
    const codes = units.map((u) => u.trace_code);
    await run('UPDATE order_items SET trace_codes_json = ? WHERE id = ?', [JSON.stringify(codes), it.id]);
    for (const c of codes) {
      await run('UPDATE trace_units SET status = ?, order_no = ? WHERE trace_code = ?', ['sold', order.order_no, c]);
    }
  }

  await run(
    'INSERT INTO events (user_id, type, target, payload_json, created_at) VALUES (?, ?, ?, ?, ?)',
    [userId, 'pay', order.order_no, JSON.stringify({ amount: order.pay_amount, channel }), now],
  );

  const detail = await getOrderDetail(userId, order.id);
  return { ...detail, prepayId, tierUpgradedTo: newTier };
}

async function findOrder(userId, orderIdOrNo) {
  const isNo = String(orderIdOrNo).startsWith('CY');
  return isNo
    ? get('SELECT * FROM orders WHERE order_no = ? AND user_id = ?', [orderIdOrNo, userId])
    : get('SELECT * FROM orders WHERE id = ? AND user_id = ?', [Number(orderIdOrNo), userId]);
}

export async function getOrderDetail(userId, orderIdOrNo) {
  const order = await findOrder(userId, orderIdOrNo);
  if (!order) throw notFound('订单不存在');
  const items = await query('SELECT * FROM order_items WHERE order_id = ?', [order.id]);
  return shapeOrder(order, items);
}

export async function listOrders(userId, { status } = {}) {
  const rows = status && status !== 'all'
    ? await query('SELECT * FROM orders WHERE user_id = ? AND status = ? ORDER BY id DESC', [userId, status])
    : await query('SELECT * FROM orders WHERE user_id = ? ORDER BY id DESC', [userId]);
  const out = [];
  for (const r of rows) {
    const items = await query('SELECT * FROM order_items WHERE order_id = ?', [r.id]);
    out.push(shapeOrder(r, items));
  }
  return out;
}

export async function cancelOrder(userId, orderIdOrNo) {
  const order = await findOrder(userId, orderIdOrNo);
  if (!order) throw notFound('订单不存在');
  if (order.status !== 'pending_pay') throw conflict('只有待付款订单可以取消');
  const now = nowIso();
  await withTransaction(async () => {
    await run('UPDATE orders SET status = ?, finished_at = ? WHERE id = ?', ['closed', now, order.id]);
    const items = await query('SELECT * FROM order_items WHERE order_id = ?', [order.id]);
    for (const it of items) {
      await run('UPDATE products SET stock = stock + ? WHERE id = ?', [it.qty, it.product_id]);
      await run(
        'INSERT INTO stock_logs (product_id, delta, reason, order_no, created_at) VALUES (?, ?, ?, ?, ?)',
        [it.product_id, it.qty, 'order_cancel', order.order_no, now],
      );
    }
  });
  await getCache().del('shop:products');
  return getOrderDetail(userId, order.id);
}

export async function confirmReceipt(userId, orderIdOrNo) {
  const order = await findOrder(userId, orderIdOrNo);
  if (!order) throw notFound('订单不存在');
  if (order.status !== 'shipped') throw conflict('订单尚未发货，无法确认收货');
  await run('UPDATE orders SET status = ?, finished_at = ? WHERE id = ?', ['done', nowIso(), order.id]);
  return getOrderDetail(userId, order.id);
}

/** 申请售后（转人工处理） */
export async function requestRefund(userId, orderIdOrNo, reason) {
  const order = await findOrder(userId, orderIdOrNo);
  if (!order) throw notFound('订单不存在');
  if (!['paid', 'shipped', 'done'].includes(order.status)) throw conflict('当前状态不支持申请售后');
  await run('UPDATE orders SET status = ?, remark = ? WHERE id = ?', ['refunding', `售后原因：${reason || '未填写'}`, order.id]);
  await run(
    'INSERT INTO events (user_id, type, target, payload_json, created_at) VALUES (?, ?, ?, ?, ?)',
    [userId, 'refund_request', order.order_no, JSON.stringify({ reason }), nowIso()],
  );
  return getOrderDetail(userId, order.id);
}

/* ---------------- 后台用：发货与状态流转 ---------------- */

export async function adminListOrders({ status, keyword, page = 1, size = 20 } = {}) {
  const where = [];
  const args = [];
  if (status && status !== 'all') { where.push('status = ?'); args.push(status); }
  if (keyword) { where.push('order_no LIKE ?'); args.push(`%${keyword}%`); }
  const cond = where.length ? `WHERE ${where.join(' AND ')}` : '';
  const totalRow = await get(`SELECT COUNT(*) AS n FROM orders ${cond}`, args);
  const rows = await query(
    `SELECT o.*, u.nickname FROM orders o LEFT JOIN users u ON u.id = o.user_id ${cond} ORDER BY o.id DESC LIMIT ? OFFSET ?`,
    [...args, size, (page - 1) * size],
  );
  const list = [];
  for (const r of rows) {
    const items = await query('SELECT * FROM order_items WHERE order_id = ?', [r.id]);
    list.push({ ...shapeOrder(r, items), nickname: r.nickname });
  }
  return { list, total: Number(totalRow?.n ?? 0), page, size };
}

export async function shipOrder(orderIdOrNo, { company, trackingNo, note } = {}) {
  const isNo = String(orderIdOrNo).startsWith('CY');
  const order = isNo
    ? await get('SELECT * FROM orders WHERE order_no = ?', [orderIdOrNo])
    : await get('SELECT * FROM orders WHERE id = ?', [Number(orderIdOrNo)]);
  if (!order) throw notFound('订单不存在');
  if (order.status !== 'paid') throw conflict('只有已付款待发货的订单可以发货');
  const now = nowIso();
  const logistics = [
    { time: now.replace('T', ' ').slice(0, 16), text: `商家已发货（${company || '乡村物流专线'}），运单号 ${trackingNo || '自动分配'}` },
    { time: now.replace('T', ' ').slice(0, 16), text: '浒口村乡村物流节点已揽收' },
  ];
  if (note) logistics.push({ time: now.replace('T', ' ').slice(0, 16), text: note });
  await run(
    'UPDATE orders SET status = ?, shipped_at = ?, logistics_json = ? WHERE id = ?',
    ['shipped', now, JSON.stringify(logistics), order.id],
  );
  const items = await query('SELECT trace_codes_json FROM order_items WHERE order_id = ?', [order.id]);
  for (const it of items) {
    for (const code of parseJson(it.trace_codes_json, [])) {
      await run("UPDATE trace_units SET status = 'shipped' WHERE trace_code = ?", [code]);
    }
  }
  return { orderNo: order.order_no, status: 'shipped' };
}

export async function adminUpdateOrderStatus(orderIdOrNo, status) {
  const allowed = Object.keys(STATUS_TEXT);
  if (!allowed.includes(status)) throw badRequest(`不支持的订单状态：${status}`);
  const isNo = String(orderIdOrNo).startsWith('CY');
  const order = isNo
    ? await get('SELECT * FROM orders WHERE order_no = ?', [orderIdOrNo])
    : await get('SELECT * FROM orders WHERE id = ?', [Number(orderIdOrNo)]);
  if (!order) throw notFound('订单不存在');
  await run('UPDATE orders SET status = ? WHERE id = ?', [status, order.id]);
  return { orderNo: order.order_no, status, statusText: STATUS_TEXT[status] };
}

export async function assertOrderOwner(user, orderIdOrNo) {
  const order = await findOrder(user.id, orderIdOrNo);
  if (!order) throw notFound('订单不存在');
  if (order.user_id !== user.id && user.role !== 'admin') throw forbidden();
  return order;
}

export { STATUS_TEXT, parseJson };
export default {
  createOrder, payOrder, getOrderDetail, listOrders, cancelOrder, confirmReceipt, requestRefund,
  adminListOrders, shipOrder, adminUpdateOrderStatus, shapeOrder, STATUS_TEXT,
};
