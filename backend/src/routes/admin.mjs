/** 管理后台路由：商品与库存、订单发货、溯源录入、知识库维护、数据看板 */
import { get, query, run } from '../db/index.mjs';
import { ok, badRequest, notFound } from '../http/respond.mjs';
import { requireAdmin } from '../http/auth.mjs';
import { requireFields, toInt, pageParams } from '../http/body.mjs';
import {
  adminListOrders, shipOrder, adminUpdateOrderStatus, STATUS_TEXT,
} from '../services/order.mjs';
import {
  adminListBatches, adminAddEvent, adminCreateBatch, adminListUnits, adminScanLogs, getBatchOverview,
} from '../services/trace.mjs';
import { shapeProduct } from '../services/catalog.mjs';
import { getCache, cacheKeys } from '../db/cache.mjs';
import { nowIso } from '../utils/datetime.mjs';

export function registerAdminRoutes(route) {
  /* ---------------- 看板 ---------------- */

  route('GET', '/api/admin/overview', async ({ req, url }) => {
    await requireAdmin(req, url);
    const users = await get("SELECT COUNT(*) AS n FROM users WHERE role = 'customer'");
    const orders = await get('SELECT COUNT(*) AS n FROM orders');
    const revenue = await get("SELECT IFNULL(SUM(pay_amount), 0) AS n FROM orders WHERE status IN ('paid','shipped','done')");
    const todayRevenue = await get(
      "SELECT IFNULL(SUM(pay_amount), 0) AS n FROM orders WHERE status IN ('paid','shipped','done') AND paid_at >= ?",
      [new Date().toISOString().slice(0, 10)],
    );
    const pendingShip = await get("SELECT COUNT(*) AS n FROM orders WHERE status = 'paid'");
    const refunding = await get("SELECT COUNT(*) AS n FROM orders WHERE status = 'refunding'");
    const lowStock = await query('SELECT code, title, spec, stock FROM products WHERE stock <= 50 ORDER BY stock ASC');
    const scans = await get('SELECT COUNT(*) AS n FROM scan_logs');
    const units = await get('SELECT COUNT(*) AS n FROM trace_units');
    const humanChats = await get("SELECT COUNT(*) AS n FROM conversations WHERE status = 'human'");
    const hotProducts = await query('SELECT code, title, sales, stock FROM products ORDER BY sales DESC LIMIT 5');
    const funnel = {
      view: Number((await get("SELECT COUNT(*) AS n FROM events WHERE type = 'view'"))?.n ?? 0),
      cart: Number((await get("SELECT COUNT(*) AS n FROM events WHERE type = 'cart'"))?.n ?? 0),
      pay: Number((await get("SELECT COUNT(*) AS n FROM events WHERE type = 'pay'"))?.n ?? 0),
      scan: Number(scans?.n ?? 0),
    };
    return ok({
      cards: {
        users: Number(users?.n ?? 0),
        orders: Number(orders?.n ?? 0),
        revenue: Number(revenue?.n ?? 0) / 100,
        todayRevenue: Number(todayRevenue?.n ?? 0) / 100,
        pendingShip: Number(pendingShip?.n ?? 0),
        refunding: Number(refunding?.n ?? 0),
        scans: Number(scans?.n ?? 0),
        units: Number(units?.n ?? 0),
        humanChats: Number(humanChats?.n ?? 0),
      },
      lowStock,
      hotProducts,
      funnel,
      cache: getCache().driver,
      orderStatusText: STATUS_TEXT,
    });
  });

  /* ---------------- 商品与库存 ---------------- */

  route('GET', '/api/admin/products', async ({ req, url, query: q }) => {
    await requireAdmin(req, url);
    const { page, size } = pageParams(q, 50, 200);
    const rows = await query('SELECT * FROM products ORDER BY sort_order ASC, id ASC LIMIT ? OFFSET ?', [size, (page - 1) * size]);
    const total = await get('SELECT COUNT(*) AS n FROM products');
    return ok({ list: rows.map((r) => shapeProduct(r, { withDetail: true })), total: Number(total?.n ?? 0), page, size });
  });

  route('POST', '/api/admin/products', async ({ req, url, body }) => {
    await requireAdmin(req, url);
    requireFields(body, ['code', 'title', 'spec', 'price']);
    const existed = await get('SELECT id FROM products WHERE code = ?', [body.code]);
    if (existed) throw badRequest('商品编码已存在');
    const info = await run(
      `INSERT INTO products
        (code, title, subtitle, category, spec, price, list_price, stock, sales, source_platform,
         dose_ml, volume_ml, selling_points_json, detail_json, image, gallery_json, tags_json, status, sort_order, created_at)
       VALUES (?, ?, ?, ?, ?, ?, ?, ?, 0, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
      [
        body.code, body.title, body.subtitle ?? '', body.category ?? 'oil', body.spec,
        toInt(body.price), toInt(body.listPrice, toInt(body.price)), toInt(body.stock), body.sourcePlatform ?? 'self',
        body.doseMl ?? null, body.volumeMl ?? null,
        JSON.stringify(body.sellingPoints ?? []), JSON.stringify(body.detail ?? {}),
        body.image ?? '', JSON.stringify(body.gallery ?? []), JSON.stringify(body.tags ?? []),
        body.status ?? 'on', toInt(body.sortOrder), nowIso(),
      ],
    );
    await getCache().del(cacheKeys.productList());
    return ok({ id: info.lastInsertId }, '商品已创建');
  });

  route('PATCH', '/api/admin/products/:code', async ({ req, url, params, body }) => {
    await requireAdmin(req, url);
    const product = await get('SELECT * FROM products WHERE code = ?', [params.code]);
    if (!product) throw notFound('商品不存在');
    const map = {
      title: 'title', subtitle: 'subtitle', category: 'category', spec: 'spec',
      price: 'price', listPrice: 'list_price', stock: 'stock', status: 'status',
      image: 'image', sortOrder: 'sort_order',
    };
    const fields = [];
    const args = [];
    for (const [k, col] of Object.entries(map)) {
      if (body[k] !== undefined) { fields.push(`${col} = ?`); args.push(body[k]); }
    }
    if (body.sellingPoints) { fields.push('selling_points_json = ?'); args.push(JSON.stringify(body.sellingPoints)); }
    if (body.detail) { fields.push('detail_json = ?'); args.push(JSON.stringify(body.detail)); }
    if (body.tags) { fields.push('tags_json = ?'); args.push(JSON.stringify(body.tags)); }
    if (body.gallery) { fields.push('gallery_json = ?'); args.push(JSON.stringify(body.gallery)); }
    if (!fields.length) throw badRequest('没有需要更新的字段');
    args.push(product.id);
    await run(`UPDATE products SET ${fields.join(', ')} WHERE id = ?`, args);
    await getCache().del(cacheKeys.productList());
    return ok({ code: product.code }, '商品已更新');
  });

  /** 库存调整（入库/盘点），写入库存流水 */
  route('POST', '/api/admin/products/:code/stock', async ({ req, url, params, body }) => {
    const admin = await requireAdmin(req, url);
    requireFields(body, ['delta']);
    const product = await get('SELECT * FROM products WHERE code = ?', [params.code]);
    if (!product) throw notFound('商品不存在');
    const delta = toInt(body.delta);
    const next = product.stock + delta;
    if (next < 0) throw badRequest('库存不能为负数');
    await run('UPDATE products SET stock = ? WHERE id = ?', [next, product.id]);
    await run(
      'INSERT INTO stock_logs (product_id, delta, reason, order_no, created_at) VALUES (?, ?, ?, ?, ?)',
      [product.id, delta, body.reason || `admin:${admin.id}`, body.orderNo ?? '', nowIso()],
    );
    await getCache().del(cacheKeys.productList());
    return ok({ code: product.code, stock: next }, '库存已更新');
  });

  route('GET', '/api/admin/stock-logs', async ({ req, url, query: q }) => {
    await requireAdmin(req, url);
    const { page, size } = pageParams(q, 30, 100);
    const rows = await query(
      `SELECT s.*, p.title, p.spec FROM stock_logs s LEFT JOIN products p ON p.id = s.product_id
        ORDER BY s.id DESC LIMIT ? OFFSET ?`,
      [size, (page - 1) * size],
    );
    return ok({ list: rows, page, size });
  });

  /* ---------------- 订单履约 ---------------- */

  route('GET', '/api/admin/orders', async ({ req, url, query: q }) => {
    await requireAdmin(req, url);
    const { page, size } = pageParams(q, 20, 100);
    return ok(await adminListOrders({ status: q.get('status') || 'all', keyword: q.get('keyword') || '', page, size }));
  });

  route('POST', '/api/admin/orders/:no/ship', async ({ req, url, params, body }) => {
    await requireAdmin(req, url);
    return ok(
      await shipOrder(params.no, { company: body.company, trackingNo: body.trackingNo, note: body.note }),
      '已发货',
    );
  });

  route('POST', '/api/admin/orders/:no/status', async ({ req, url, params, body }) => {
    await requireAdmin(req, url);
    requireFields(body, ['status']);
    return ok(await adminUpdateOrderStatus(params.no, String(body.status)), '订单状态已更新');
  });

  /* ---------------- 溯源维护 ---------------- */

  route('GET', '/api/admin/trace/batches', async ({ req, url }) => {
    await requireAdmin(req, url);
    return ok({ list: await adminListBatches() });
  });

  route('POST', '/api/admin/trace/batches', async ({ req, url, body }) => {
    await requireAdmin(req, url);
    requireFields(body, ['batchNo']);
    return ok(await adminCreateBatch(body), '批次已创建并完成赋码');
  });

  route('GET', '/api/admin/trace/batches/:batchNo', async ({ req, url, params }) => {
    await requireAdmin(req, url);
    return ok(await getBatchOverview(params.batchNo));
  });

  /** 录入溯源节点（移动端采集 → 云端加密存证 → 重算哈希链） */
  route('POST', '/api/admin/trace/batches/:batchNo/events', async ({ req, url, params, body }) => {
    await requireAdmin(req, url);
    return ok(await adminAddEvent(params.batchNo, body), '溯源节点已写入并完成哈希存证');
  });

  route('GET', '/api/admin/trace/units', async ({ req, url, query: q }) => {
    await requireAdmin(req, url);
    const { page, size } = pageParams(q, 30, 200);
    return ok(await adminListUnits(q.get('batch') || '', { page, size }));
  });

  route('GET', '/api/admin/trace/scans', async ({ req, url, query: q }) => {
    await requireAdmin(req, url);
    const { page, size } = pageParams(q, 30, 200);
    return ok(await adminScanLogs({ page, size }));
  });

  /* ---------------- 知识库维护 ---------------- */

  route('GET', '/api/admin/kb', async ({ req, url, query: q }) => {
    await requireAdmin(req, url);
    const category = q.get('category');
    const cond = category && category !== 'all' ? 'WHERE category = ?' : '';
    const args = category && category !== 'all' ? [category] : [];
    const rows = await query(`SELECT * FROM kb_entries ${cond} ORDER BY priority DESC, id ASC`, args);
    const terms = await query('SELECT category, COUNT(*) AS n FROM kb_terms GROUP BY category');
    return ok({ list: rows, terms });
  });

  route('POST', '/api/admin/kb', async ({ req, url, body }) => {
    await requireAdmin(req, url);
    requireFields(body, ['category', 'question', 'answer', 'keywords']);
    const info = await run(
      `INSERT INTO kb_entries (category, category_name, question, answer, keywords, cards_json, priority, updated_at)
       VALUES (?, ?, ?, ?, ?, ?, ?, ?)`,
      [
        body.category, body.categoryName ?? body.category, body.question, body.answer,
        Array.isArray(body.keywords) ? body.keywords.join(' ') : String(body.keywords),
        JSON.stringify(body.cards ?? []), toInt(body.priority, 10), nowIso(),
      ],
    );
    await getCache().del(cacheKeys.kb());
    return ok({ id: info.lastInsertRowid ?? info.lastInsertId }, '知识库条目已新增');
  });

  route('PATCH', '/api/admin/kb/:id', async ({ req, url, params, body }) => {
    await requireAdmin(req, url);
    const row = await get('SELECT * FROM kb_entries WHERE id = ?', [Number(params.id)]);
    if (!row) throw notFound('条目不存在');
    const fields = [];
    const args = [];
    for (const k of ['question', 'answer', 'category', 'category_name']) {
      const bodyKey = k === 'category_name' ? 'categoryName' : k;
      if (body[bodyKey] !== undefined) { fields.push(`${k} = ?`); args.push(body[bodyKey]); }
    }
    if (body.keywords !== undefined) {
      fields.push('keywords = ?');
      args.push(Array.isArray(body.keywords) ? body.keywords.join(' ') : String(body.keywords));
    }
    if (body.cards !== undefined) { fields.push('cards_json = ?'); args.push(JSON.stringify(body.cards)); }
    if (!fields.length) throw badRequest('没有需要更新的字段');
    fields.push('updated_at = ?');
    args.push(nowIso(), row.id);
    await run(`UPDATE kb_entries SET ${fields.join(', ')} WHERE id = ?`, args);
    await getCache().del(cacheKeys.kb());
    return ok({ id: row.id }, '知识库条目已更新');
  });

  route('DELETE', '/api/admin/kb/:id', async ({ req, url, params }) => {
    await requireAdmin(req, url);
    await run('DELETE FROM kb_entries WHERE id = ?', [Number(params.id)]);
    await getCache().del(cacheKeys.kb());
    return ok({ deleted: true }, '条目已删除');
  });

  /* ---------------- 互动日志与月度运维数据 ---------------- */

  route('GET', '/api/admin/events', async ({ req, url, query: q }) => {
    await requireAdmin(req, url);
    const { page, size } = pageParams(q, 30, 200);
    const type = q.get('type');
    const cond = type && type !== 'all' ? 'WHERE type = ?' : '';
    const args = type && type !== 'all' ? [type] : [];
    const rows = await query(`SELECT * FROM events ${cond} ORDER BY id DESC LIMIT ? OFFSET ?`, [...args, size, (page - 1) * size]);
    const group = await query('SELECT type, COUNT(*) AS n FROM events GROUP BY type ORDER BY n DESC');
    return ok({ list: rows, group, page, size });
  });

  /** 月度运维总结（对应项目书 5.1.5：每月 5 日前出具运维报告） */
  route('GET', '/api/admin/report/monthly', async ({ req, url }) => {
    await requireAdmin(req, url);
    const since = new Date(Date.now() - 30 * 86400000).toISOString();
    const orders = await get(
      "SELECT COUNT(*) AS n, IFNULL(SUM(pay_amount),0) AS amount FROM orders WHERE created_at >= ?",
      [since],
    );
    const newUsers = await get('SELECT COUNT(*) AS n FROM users WHERE created_at >= ?', [since]);
    const scans = await get('SELECT COUNT(*) AS n FROM scan_logs WHERE created_at >= ?', [since]);
    const chats = await get('SELECT COUNT(*) AS n FROM messages WHERE created_at >= ?', [since]);
    const handoffs = await get("SELECT COUNT(*) AS n FROM conversations WHERE status = 'human' AND updated_at >= ?", [since]);
    const topIntents = await query(
      "SELECT intent, COUNT(*) AS n FROM messages WHERE role = 'assistant' AND intent IS NOT NULL AND created_at >= ? GROUP BY intent ORDER BY n DESC LIMIT 5",
      [since],
    );
    const lowStock = await query('SELECT code, title, spec, stock FROM products WHERE stock <= 50');
    return ok({
      period: { from: since.slice(0, 10), to: new Date().toISOString().slice(0, 10) },
      business: {
        orders: Number(orders?.n ?? 0),
        amount: Number(orders?.amount ?? 0) / 100,
        newUsers: Number(newUsers?.n ?? 0),
      },
      tech: {
        scans: Number(scans?.n ?? 0),
        chatMessages: Number(chats?.n ?? 0),
        humanHandoffs: Number(handoffs?.n ?? 0),
        dbDriver: (await import('../db/index.mjs')).dialect(),
        cacheDriver: getCache().driver,
      },
      topIntents,
      alerts: lowStock.length ? lowStock.map((p) => `库存偏低：${p.title} ${p.spec} 仅剩 ${p.stock} 件`) : [],
    });
  });
}

export default { registerAdminRoutes };
