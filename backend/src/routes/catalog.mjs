/** 商品与品牌内容路由 */
import { get, query, run } from '../db/index.mjs';
import { ok, notFound } from '../http/respond.mjs';
import { pageParams, toInt } from '../http/body.mjs';
import {
  listProducts, getProductByCode, listCategories, recommendProducts,
} from '../services/catalog.mjs';
import brand from '../data/brand-content.mjs';
import { quickQuestions } from '../data/knowledge-base.mjs';
import { getCache } from '../db/cache.mjs';

export function registerCatalogRoutes(route) {
  route('GET', '/api/health', async () => ok({
    status: 'up',
    app: '茶芽芽商城',
    time: new Date().toISOString(),
  }));

  /** 首页聚合接口：标语、品牌故事摘要、热销、分类、快捷提问 */
  route('GET', '/api/home', async () => {
    const products = await listProducts({ includeOffline: true });
    const categories = await listCategories();
    const hot = products.filter((p) => p.stock > 0).sort((a, b) => b.sales - a.sales).slice(0, 4);
    return ok({
      brand: {
        name: brand.name,
        slogan: brand.slogan,
        subSlogan: brand.subSlogan,
        positioning: brand.positioning,
        origin: brand.origin,
        team: brand.team,
        emotion: brand.emotion,
        images: brand.images,
      },
      story: brand.story,
      hot,
      categories,
      marketFacts: brand.market.facts.slice(0, 4),
      quickQuestions,
    });
  });

  /** 品牌介绍页：品牌故事 / DNA / 六大差异化优势 / 传播创意 / 助农闭环 / 合规 */
  route('GET', '/api/brand', async () => ok(brand));

  /** 商品列表 */
  route('GET', '/api/products', async ({ query: q }) => {
    const { page, size } = pageParams(q, 20, 100);
    const all = await listProducts({
      category: q.get('category') || undefined,
      keyword: q.get('keyword') || undefined,
      includeOffline: q.get('all') === '1',
    });
    const start = (page - 1) * size;
    return ok({ list: all.slice(start, start + size), total: all.length, page, size });
  });

  /** 商品详情 */
  route('GET', '/api/products/:code', async ({ params }) => {
    const product = await getProductByCode(params.code, { withDetail: true });
    if (!product) throw notFound('商品不存在或已下架');
    const related = (await listProducts({ includeOffline: false }))
      .filter((p) => p.code !== product.code)
      .slice(0, 4);
    // 该商品关联的溯源批次
    const batches = await query(
      'SELECT batch_no, origin, farmer, harvest_date, fill_date, inspection_no FROM batches WHERE product_code = ?',
      [product.code],
    );
    return ok({ product, related, batches });
  });

  /** AI 智能搭配推荐（项目书：商品展示含 AI 推荐） */
  route('POST', '/api/recommend', async ({ body }) => {
    const products = await listProducts({ includeOffline: true });
    const cartCodes = Array.isArray(body.cart) ? body.cart : [];
    const result = recommendProducts({ products, cartProductCodes: cartCodes, babyMonths: body.babyMonths });
    return ok(result);
  });

  /** 商品页浏览埋点（对应项目书"用户行为数据、销售漏斗"） */
  route('POST', '/api/events', async ({ body, req }) => {
    const type = String(body.type || 'view').slice(0, 32);
    const target = String(body.target || '').slice(0, 128);
    await run(
      'INSERT INTO events (user_id, session_id, type, target, payload_json, created_at) VALUES (?, ?, ?, ?, ?, ?)',
      [body.userId ?? null, body.sessionId ?? null, type, target, JSON.stringify(body.payload ?? {}), new Date().toISOString()],
    );
    const cache = getCache();
    const key = `stat:${type}:${target}`;
    await cache.incr(key, 86400);
    void req;
    return ok({ recorded: true });
  });

  /** 分月龄抚触教程（AI 客服与「抚触科普」页共用） */
  route('GET', '/api/guides', async ({ query: q }) => {
    const month = q.get('month');
    const guides = [
      {
        key: 'm0-3',
        title: '0-3 个月：轻柔抚触建立安全感',
        duration: '每次 5 分钟，每天 1 次',
        steps: [
          '室温调到 26-28℃，洗净双手，取下戒指手表。',
          '掌心搓热抚触油（约按压 2 次），先在自己手腕内侧试温。',
          '胸部：双手从宝宝胸口中央向两侧肩部轻推，重复 5-6 次。',
          '腹部：以肚脐为中心顺时针轻抚，帮助排气，重复 5-6 次。',
          '四肢：从手腕/脚踝向肩/大腿根部轻抚，每侧 5-6 次。',
          '全程和宝宝对视、轻声说话，宝宝哭闹立即停止。',
        ],
      },
      {
        key: 'm4-6',
        title: '4-6 个月：加入背部与脚底',
        duration: '每次 5-10 分钟，每天 1 次',
        steps: [
          '在 0-3 个月手法基础上，增加背部抚触：从颈部沿脊柱两侧向下滑到臀部。',
          '脚底：用拇指从脚跟向脚趾方向推，再轻点每个脚趾。',
          '宝宝开始翻身，可在换尿布台上放好防坠保护，或直接坐在床上操作。',
          '背部抚触后可做 3-5 分钟趴卧（tummy time），注意全程看护。',
        ],
      },
      {
        key: 'm6+',
        title: '6 个月以上：抚触 + 被动操',
        duration: '每次 10 分钟，每天 1 次',
        steps: [
          '先做全身抚触放松肌肉，再配合被动操：交替屈伸双腿、双臂画圈。',
          '边做边说“一二三四”，把动作变成亲子游戏，有助于大运动发育。',
          '出牙期宝宝爱流口水，抚触后记得清洁下巴并薄涂山茶油做隔离。',
          '宝宝学爬学走阶段皮肤容易干燥，睡前抚触后重点涂抹小腿与脚踝。',
        ],
      },
    ];
    const picked = month !== null && month !== undefined
      ? guides.find((g) => {
        const m = Number(month);
        if (!Number.isFinite(m)) return false;
        if (g.key === 'm0-3') return m <= 3;
        if (g.key === 'm4-6') return m >= 4 && m <= 6;
        return m >= 7;
      }) ?? guides[0]
      : guides[0];
    return ok({ guides, current: picked, doseMap: { 'CY-OIL-100': 0.5, 'CY-OIL-30': 0.25, 'CY-TRIAL-5': 0.25 } });
  });

  /** 竞品对比表（项目书 1.5.1 表1） */
  route('GET', '/api/comparison', async () => {
    const product = await getProductByCode('CY-OIL-100', { withDetail: true });
    return ok({
      dimensions: brand.advantages,
      priceTable: product?.detail?.comparison ?? [],
      summary: product?.detail?.comparisonSummary ?? '',
    });
  });

  /** 销量与评价概览（首页数据展示） */
  route('GET', '/api/stats/overview', async () => {
    const row = await get('SELECT COUNT(*) AS users FROM users WHERE role = ?', ['customer']);
    const orderRow = await get('SELECT COUNT(*) AS orders, IFNULL(SUM(pay_amount), 0) AS amount FROM orders WHERE status IN (?, ?, ?)', ['paid', 'shipped', 'done']);
    void toInt;
    return ok({
      users: Number(row?.users ?? 0),
      orders: Number(orderRow?.orders ?? 0),
      amount: Number(orderRow?.amount ?? 0) / 100,
      aidFamilies: 46,
    });
  });
}

export default { registerCatalogRoutes };
