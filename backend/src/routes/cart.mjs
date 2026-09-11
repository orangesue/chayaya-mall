/** 购物车与结算路由 */
import { ok, badRequest } from '../http/respond.mjs';
import { requireFields, toInt } from '../http/body.mjs';
import { requireUser, currentUser } from '../http/auth.mjs';
import {
  listCart, addToCart, updateCartQty, removeCartItems, clearCart, calcCart, listUserCoupons,
} from '../services/cart.mjs';
import { listProducts, recommendProducts } from '../services/catalog.mjs';

export function registerCartRoutes(route) {
  route('GET', '/api/cart', async ({ req, url }) => {
    const user = await requireUser(req, url);
    const items = await listCart(user.id);
    const totalQty = items.reduce((s, i) => s + i.qty, 0);
    const goodsAmount = items.reduce((s, i) => s + i.amount, 0);
    const products = await listProducts({ includeOffline: true });
    const recommend = recommendProducts({
      products,
      cartProductCodes: items.map((i) => i.code),
      babyMonths: user.baby_birth ? Math.max(0, Math.round((Date.now() - new Date(user.baby_birth).getTime()) / 2592000000)) : null,
    });
    return ok({ items, totalQty, goodsAmount, recommend });
  });

  route('POST', '/api/cart', async ({ req, url, body }) => {
    const user = await requireUser(req, url);
    if (body.code) {
      requireFields(body, ['code']);
      return ok(await addToCart(user.id, String(body.code), toInt(body.qty, 1)), '已加入购物车');
    }
    // 支持批量加入：[{ code, qty }]
    if (Array.isArray(body.items)) {
      const results = [];
      for (const it of body.items) {
        if (!it?.code) continue;
        results.push(await addToCart(user.id, String(it.code), toInt(it.qty, 1)));
      }
      if (!results.length) throw badRequest('请提供要加入的商品');
      return ok({ results }, '已加入购物车');
    }
    throw badRequest('缺少商品编码 code');
  });

  route('PATCH', '/api/cart/:id', async ({ req, url, params, body }) => {
    const user = await requireUser(req, url);
    requireFields(body, ['qty']);
    return ok(await updateCartQty(user.id, Number(params.id), toInt(body.qty, 1)), '已更新数量');
  });

  route('DELETE', '/api/cart/:id', async ({ req, url, params }) => {
    const user = await requireUser(req, url);
    return ok(await removeCartItems(user.id, Number(params.id)), '已移出购物车');
  });

  route('POST', '/api/cart/clear', async ({ req, url }) => {
    const user = await requireUser(req, url);
    return ok(await clearCart(user.id), '购物车已清空');
  });

  /** 结算预览：可传 couponCode 试算 */
  route('POST', '/api/cart/checkout-preview', async ({ req, url, body }) => {
    const user = await requireUser(req, url);
    const calc = await calcCart(user.id, body.couponCode);
    const coupons = await listUserCoupons(user.id);
    // 标出哪些券可用
    const usable = coupons.map((c) => ({ ...c, usable: c.status === 'unused' && calc.goodsAmount >= c.minAmount }));
    // 收货地址（下单前置条件），前端据此决定是否先引导填写地址
    const { get } = await import('../db/index.mjs');
    const addresses = await (await import('../db/index.mjs')).query(
      'SELECT * FROM addresses WHERE user_id = ? ORDER BY is_default DESC, id DESC',
      [user.id],
    );
    return ok({ ...calc, coupons: usable, addresses, needAddress: addresses.length === 0 });
  });

  /** 未登录也能试算「立即购买」的金额（不落库） */
  route('POST', '/api/price/preview', async ({ req, url, body }) => {
    const user = await currentUser(req, url);
    const items = Array.isArray(body.items) ? body.items : [];
    if (!items.length) throw badRequest('请提供商品');
    const products = await listProducts({ includeOffline: true });
    const lines = items.map((it) => {
      const p = products.find((x) => x.code === it.code);
      if (!p) throw badRequest(`商品不存在：${it.code}`);
      const qty = Math.max(1, toInt(it.qty, 1));
      return { code: p.code, title: p.title, spec: p.spec, price: p.price, qty, amount: p.price * qty, image: p.image };
    });
    const goodsAmount = lines.reduce((s, l) => s + l.amount, 0);
    let tierOff = 0;
    if (user) {
      const { get } = await import('../db/index.mjs');
      const tier = await get('SELECT * FROM member_tiers WHERE code = ?', [user.tier_code]);
      if (tier && tier.discount < 100) tierOff = Math.round(goodsAmount * (100 - tier.discount) / 100);
    }
    const { default: config } = await import('../config.mjs');
    const beforeFreight = Math.max(0, goodsAmount - tierOff);
    const freight = beforeFreight >= config.biz.freeFreightAmount ? 0 : config.biz.freightBase;
    return ok({ lines, goodsAmount, tierDiscount: tierOff, freight, payAmount: beforeFreight + freight, loggedIn: Boolean(user) });
  });
}

export default { registerCartRoutes };
