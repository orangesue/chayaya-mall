/**
 * 购物车 / 结算预览服务
 * 项目书 3.3.1：购物车与订单管理（实时库存同步）
 * 库存校验与优惠券计算都放在这里，下单时复用同一套计算逻辑，避免前后端算价不一致。
 */
import { query, get, run } from '../db/index.mjs';
import config from '../config.mjs';
import { badRequest, conflict } from '../http/respond.mjs';
import { shapeProduct } from './catalog.mjs';

const parseJson = (s, def) => {
  if (!s) return def;
  try { return JSON.parse(s); } catch { return def; }
};

export async function listCart(userId) {
  const rows = await query(
    `SELECT c.id AS cart_id, c.qty, p.*
       FROM cart_items c JOIN products p ON p.id = c.product_id
      WHERE c.user_id = ?
      ORDER BY c.id DESC`,
    [userId],
  );
  return rows.map((r) => {
    const p = shapeProduct(r);
    return {
      cartId: r.cart_id,
      qty: r.qty,
      amount: p.price * r.qty,
      ...p,
    };
  });
}

export async function addToCart(userId, productCode, qty = 1) {
  const n = Number(qty);
  if (!Number.isInteger(n) || n <= 0) throw badRequest('购买数量必须是正整数');
  const product = await get('SELECT * FROM products WHERE code = ?', [productCode]);
  if (!product) throw badRequest('商品不存在');
  if (product.status !== 'on') throw conflict('该商品暂未开售，可先预约到货提醒');
  if (product.stock <= 0) throw conflict('该商品暂时缺货');

  const existing = await get('SELECT * FROM cart_items WHERE user_id = ? AND product_id = ?', [userId, product.id]);
  const target = (existing?.qty ?? 0) + n;
  if (target > product.stock) throw conflict(`库存不足，当前仅剩 ${product.stock} 件`);
  if (target > 99) throw badRequest('单次购买数量上限为 99 件');

  if (existing) {
    await run('UPDATE cart_items SET qty = ? WHERE id = ?', [target, existing.id]);
  } else {
    await run(
      'INSERT INTO cart_items (user_id, product_id, qty, created_at) VALUES (?, ?, ?, ?)',
      [userId, product.id, n, new Date().toISOString()],
    );
  }
  return { productCode, qty: target };
}

export async function updateCartQty(userId, cartId, qty) {
  const n = Number(qty);
  const item = await get(
    'SELECT c.*, p.stock, p.status FROM cart_items c JOIN products p ON p.id = c.product_id WHERE c.id = ? AND c.user_id = ?',
    [cartId, userId],
  );
  if (!item) throw badRequest('购物车条目不存在');
  if (n <= 0) {
    await run('DELETE FROM cart_items WHERE id = ?', [cartId]);
    return { removed: true };
  }
  if (n > item.stock) throw conflict(`库存不足，当前仅剩 ${item.stock} 件`);
  await run('UPDATE cart_items SET qty = ? WHERE id = ?', [n, cartId]);
  return { cartId: Number(cartId), qty: n };
}

export async function removeCartItems(userId, cartIds) {
  const ids = (Array.isArray(cartIds) ? cartIds : [cartIds]).map(Number).filter(Boolean);
  if (!ids.length) throw badRequest('请指定要删除的条目');
  for (const id of ids) {
    await run('DELETE FROM cart_items WHERE id = ? AND user_id = ?', [id, userId]);
  }
  return { removed: ids.length };
}

export async function clearCart(userId) {
  await run('DELETE FROM cart_items WHERE user_id = ?', [userId]);
  return { cleared: true };
}

/** 结算预览：商品金额、会员折扣、优惠券、运费、应付金额 */
export async function calcCart(userId, couponCode) {
  const items = await listCart(userId);
  if (!items.length) throw badRequest('购物车是空的，先去挑一瓶吧');

  const goodsAmount = items.reduce((s, it) => s + it.amount, 0);

  // 会员折扣
  const user = await get('SELECT * FROM users WHERE id = ?', [userId]);
  const tier = await get('SELECT * FROM member_tiers WHERE code = ?', [user.tier_code]);
  const tierOff = tier && tier.discount < 100 ? Math.round(goodsAmount * (100 - tier.discount) / 100) : 0;

  // 优惠券
  let coupon = null;
  let couponOff = 0;
  if (couponCode) {
    const row = await get(
      `SELECT uc.id AS uc_id, uc.status, c.* FROM user_coupons uc JOIN coupons c ON c.id = uc.coupon_id
        WHERE uc.user_id = ? AND c.code = ?`,
      [userId, couponCode],
    );
    if (!row) throw badRequest('优惠券不存在或不属于当前账号');
    if (row.status !== 'unused') throw badRequest('该优惠券已使用');
    if (goodsAmount < row.min_amount) throw badRequest(`该券需满 ${(row.min_amount / 100).toFixed(0)} 元可用`);
    coupon = { code: row.code, title: row.title, amount: row.amount };
    couponOff = row.amount;
  }

  const payableBeforeFreight = Math.max(0, goodsAmount - tierOff - couponOff);
  const freight = payableBeforeFreight >= config.biz.freeFreightAmount
    ? 0
    : (items.length ? config.biz.freightBase : 0);
  const payAmount = payableBeforeFreight + freight;

  return {
    items,
    goodsAmount,
    tierDiscount: tierOff,
    tier: tier ? { code: tier.code, name: tier.name, discount: tier.discount } : null,
    coupon,
    couponDiscount: couponOff,
    freight,
    payAmount,
    freeFreightGap: Math.max(0, config.biz.freeFreightAmount - payableBeforeFreight),
  };
}

/** 已登录用户可用的优惠券列表 */
export async function listUserCoupons(userId) {
  const rows = await query(
    `SELECT uc.id AS uc_id, uc.status, c.* FROM user_coupons uc JOIN coupons c ON c.id = uc.coupon_id
      WHERE uc.user_id = ? ORDER BY c.amount DESC`,
    [userId],
  );
  return rows.map((r) => ({
    id: r.uc_id,
    code: r.code,
    title: r.title,
    amount: r.amount,
    amountText: (r.amount / 100).toFixed(2),
    minAmount: r.min_amount,
    minAmountText: (r.min_amount / 100).toFixed(2),
    status: r.status,
    source: r.source,
    expiresAt: r.expires_at,
  }));
}

/** 领取优惠券（用于线下扫码注册、活动发券） */
export async function claimCoupon(userId, code) {
  const coupon = await get('SELECT * FROM coupons WHERE code = ?', [code]);
  if (!coupon) throw badRequest('优惠券不存在');
  const had = await get('SELECT * FROM user_coupons WHERE user_id = ? AND coupon_id = ?', [userId, coupon.id]);
  if (had) return { claimed: false, message: '你已领取过该优惠券' };
  await run('INSERT INTO user_coupons (user_id, coupon_id, status) VALUES (?, ?, ?)', [userId, coupon.id, 'unused']);
  return { claimed: true, coupon: { code: coupon.code, title: coupon.title, amount: coupon.amount } };
}

export { parseJson };
export default {
  listCart, addToCart, updateCartQty, removeCartItems, clearCart, calcCart, listUserCoupons, claimCoupon,
};
