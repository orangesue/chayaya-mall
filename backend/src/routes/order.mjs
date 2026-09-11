/** 订单路由：下单、模拟支付、取消、确认收货、售后 */
import { ok, badRequest } from '../http/respond.mjs';
import { requireFields, toInt } from '../http/body.mjs';
import { requireUser } from '../http/auth.mjs';
import {
  createOrder, payOrder, listOrders, getOrderDetail, cancelOrder, confirmReceipt, requestRefund,
} from '../services/order.mjs';

export function registerOrderRoutes(route) {
  route('POST', '/api/orders', async ({ req, url, body }) => {
    const user = await requireUser(req, url);
    const order = await createOrder(user.id, {
      addressId: body.addressId ? toInt(body.addressId) : undefined,
      couponCode: body.couponCode,
      remark: body.remark,
      items: Array.isArray(body.items) ? body.items : undefined,
    });
    return ok(order, '下单成功，请完成支付');
  });

  route('GET', '/api/orders', async ({ req, url, query }) => {
    const user = await requireUser(req, url);
    return ok({ list: await listOrders(user.id, { status: query.get('status') || undefined }) });
  });

  route('GET', '/api/orders/:no', async ({ req, url, params }) => {
    const user = await requireUser(req, url);
    return ok(await getOrderDetail(user.id, params.no));
  });

  /** 模拟支付：演示环境直接置为已付款并分配一物一码 */
  route('POST', '/api/orders/:no/pay', async ({ req, url, params, body }) => {
    const user = await requireUser(req, url);
    const channel = body.channel || 'mock_wechat';
    const res = await payOrder(user.id, params.no, channel);
    return ok(res, '支付成功（演示环境为模拟支付）');
  });

  route('POST', '/api/orders/:no/cancel', async ({ req, url, params }) => {
    const user = await requireUser(req, url);
    return ok(await cancelOrder(user.id, params.no), '订单已取消');
  });

  route('POST', '/api/orders/:no/confirm', async ({ req, url, params }) => {
    const user = await requireUser(req, url);
    return ok(await confirmReceipt(user.id, params.no), '已确认收货');
  });

  route('POST', '/api/orders/:no/refund', async ({ req, url, params, body }) => {
    const user = await requireUser(req, url);
    requireFields(body, ['reason']);
    const res = await requestRefund(user.id, params.no, String(body.reason).slice(0, 200));
    void badRequest;
    return ok(res, '售后申请已提交，客服会尽快联系您');
  });
}

export default { registerOrderRoutes };
