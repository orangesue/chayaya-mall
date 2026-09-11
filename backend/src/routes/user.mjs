/** 用户侧路由：登录注册、个人资料、会员权益、地址簿、收藏与反馈 */
import { get, query, run } from '../db/index.mjs';
import { ok, badRequest, notFound } from '../http/respond.mjs';
import { requireFields, toInt } from '../http/body.mjs';
import {
  requireUser, loginByPassword, loginByCode, sendLoginCode, loginByWechat, updateProfile, shapeUser,
} from '../http/auth.mjs';
import { listUserCoupons, claimCoupon } from '../services/cart.mjs';
import { listOrders } from '../services/order.mjs';
import { nowIso } from '../utils/datetime.mjs';
import brand from '../data/brand-content.mjs';

export function registerUserRoutes(route) {
  /* ---------------- 登录 / 注册 ---------------- */

  route('POST', '/api/auth/login', async ({ body }) => {
    requireFields(body, ['phone', 'password']);
    return ok(await loginByPassword(String(body.phone), String(body.password)), '登录成功');
  });

  route('POST', '/api/auth/send-code', async ({ body }) => {
    requireFields(body, ['phone']);
    const res = await sendLoginCode(String(body.phone));
    return ok(res, '验证码已发送（演示环境验证码为 123456）');
  });

  route('POST', '/api/auth/login-code', async ({ body }) => {
    requireFields(body, ['phone', 'code']);
    return ok(await loginByCode(String(body.phone), String(body.code), body.nickname), '登录成功');
  });

  route('POST', '/api/auth/wechat', async ({ body }) => {
    requireFields(body, ['code']);
    return ok(await loginByWechat(String(body.code), body.profile ?? {}), '微信登录成功');
  });

  /* ---------------- 个人中心 ---------------- */

  route('GET', '/api/me', async ({ req, url }) => {
    const user = await requireUser(req, url);
    const orderCount = await get('SELECT COUNT(*) AS n FROM orders WHERE user_id = ?', [user.id]);
    const finished = await get(
      "SELECT COUNT(*) AS n FROM orders WHERE user_id = ? AND status = 'done'",
      [user.id],
    );
    const coupons = await listUserCoupons(user.id);
    const cartCount = await get('SELECT IFNULL(SUM(qty), 0) AS n FROM cart_items WHERE user_id = ?', [user.id]);
    const tiers = await query('SELECT * FROM member_tiers ORDER BY min_amount ASC');
    const shaped = shapeUser(user);
    const current = tiers.find((t) => t.code === shaped.tierCode);
    const next = tiers.find((t) => t.min_amount > (current?.min_amount ?? 0));
    return ok({
      user: shaped,
      counts: {
        orders: Number(orderCount?.n ?? 0),
        finished: Number(finished?.n ?? 0),
        coupons: coupons.filter((c) => c.status === 'unused').length,
        cart: Number(cartCount?.n ?? 0),
      },
      tier: {
        current: current ? { code: current.code, name: current.name, min: current.min_amount, benefits: JSON.parse(current.benefits_json) } : null,
        next: next ? { code: next.code, name: next.name, min: next.min_amount, gap: next.min_amount - user.total_paid } : null,
        all: tiers.map((t) => ({
          code: t.code, name: t.name, min: t.min_amount, discount: t.discount,
          benefits: JSON.parse(t.benefits_json), reached: user.total_paid >= t.min_amount,
        })),
      },
      aiTips: brand.tiers,
    });
  });

  route('PATCH', '/api/me', async ({ req, url, body }) => {
    const user = await requireUser(req, url);
    const updated = await updateProfile(user.id, body);
    return ok({ user: updated }, '资料已更新');
  });

  route('GET', '/api/me/coupons', async ({ req, url }) => {
    const user = await requireUser(req, url);
    return ok({ list: await listUserCoupons(user.id) });
  });

  route('POST', '/api/coupons/claim', async ({ req, url, body }) => {
    requireFields(body, ['code']);
    const user = await requireUser(req, url);
    return ok(await claimCoupon(user.id, String(body.code)), '领取成功');
  });

  /* ---------------- 地址簿 ---------------- */

  route('GET', '/api/addresses', async ({ req, url }) => {
    const user = await requireUser(req, url);
    const list = await query('SELECT * FROM addresses WHERE user_id = ? ORDER BY is_default DESC, id DESC', [user.id]);
    return ok({ list });
  });

  route('POST', '/api/addresses', async ({ req, url, body }) => {
    const user = await requireUser(req, url);
    requireFields(body, ['receiver', 'phone', 'province', 'city', 'district', 'detail']);
    if (!/^1\d{10}$/.test(String(body.phone))) throw badRequest('手机号格式不正确');
    if (body.isDefault) await run('UPDATE addresses SET is_default = 0 WHERE user_id = ?', [user.id]);
    const info = await run(
      'INSERT INTO addresses (user_id, receiver, phone, province, city, district, detail, is_default) VALUES (?, ?, ?, ?, ?, ?, ?, ?)',
      [user.id, body.receiver, body.phone, body.province, body.city, body.district, body.detail, body.isDefault ? 1 : 0],
    );
    return ok({ id: info.lastInsertId }, '地址已保存');
  });

  route('DELETE', '/api/addresses/:id', async ({ req, url, params }) => {
    const user = await requireUser(req, url);
    await run('DELETE FROM addresses WHERE id = ? AND user_id = ?', [Number(params.id), user.id]);
    return ok({ deleted: true });
  });

  /* ---------------- 溯源之旅报名 / 会员权益领取 ---------------- */

  route('POST', '/api/bookings', async ({ req, url, body }) => {
    const user = await requireUser(req, url);
    requireFields(body, ['activity']);
    await run(
      'INSERT INTO bookings (user_id, activity, city, contact, status, created_at) VALUES (?, ?, ?, ?, ?, ?)',
      [user.id, body.activity, body.city ?? '', body.contact ?? user.phone ?? '', 'pending', nowIso()],
    );
    return ok({ booked: true }, '报名成功，客服会在 24 小时内与您联系');
  });

  route('GET', '/api/bookings', async ({ req, url }) => {
    const user = await requireUser(req, url);
    const list = await query('SELECT * FROM bookings WHERE user_id = ? ORDER BY id DESC', [user.id]);
    return ok({ list });
  });

  /* ---------------- 我的溯源码（已购商品的码） ---------------- */

  route('GET', '/api/me/trace-codes', async ({ req, url }) => {
    const user = await requireUser(req, url);
    const rows = await query(
      `SELECT o.order_no, oi.title, oi.spec, oi.trace_codes_json, o.created_at
         FROM orders o JOIN order_items oi ON oi.order_id = o.id
        WHERE o.user_id = ? AND oi.trace_codes_json IS NOT NULL AND oi.trace_codes_json <> '[]'
        ORDER BY o.id DESC LIMIT 20`,
      [user.id],
    );
    const list = [];
    for (const r of rows) {
      let codes = [];
      try { codes = JSON.parse(r.trace_codes_json || '[]'); } catch { codes = []; }
      for (const c of codes) {
        const unit = await get('SELECT batch_no, status, scan_count FROM trace_units WHERE trace_code = ?', [c]);
        list.push({
          traceCode: c,
          batchNo: unit?.batch_no ?? '',
          status: unit?.status ?? '',
          scanCount: unit?.scan_count ?? 0,
          title: r.title,
          spec: r.spec,
          orderNo: r.order_no,
          boughtAt: r.created_at,
        });
      }
    }
    return ok({ list });
  });

  /* ---------------- 订单快捷入口（个人中心页） ---------------- */

  route('GET', '/api/me/orders', async ({ req, url, query: q }) => {
    const user = await requireUser(req, url);
    return ok({ list: await listOrders(user.id, { status: q.get('status') || undefined }) });
  });

  route('POST', '/api/feedback', async ({ req, url, body }) => {
    const user = await requireUser(req, url);
    requireFields(body, ['content']);
    await run(
      'INSERT INTO events (user_id, type, target, payload_json, created_at) VALUES (?, ?, ?, ?, ?)',
      [user.id, 'feedback', String(body.type || 'general'), JSON.stringify({ content: String(body.content).slice(0, 1000) }), nowIso()],
    );
    void toInt; void notFound;
    return ok({ received: true }, '感谢反馈，团队会认真阅读每一条建议');
  });
}

export default { registerUserRoutes };
