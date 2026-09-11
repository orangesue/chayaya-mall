/**
 * 商品目录服务：商品查询、分类、AI 智能搭配推荐
 * 项目书 3.3.1 要求"商品展示（分类、详情页、AI推荐）"，此处的 recommend 即该能力。
 */
import { query, get } from '../db/index.mjs';
import { remember, cacheKeys } from '../db/cache.mjs';
import brand from '../data/brand-content.mjs';

const parseJson = (s, def) => {
  if (!s) return def;
  try { return JSON.parse(s); } catch { return def; }
};

export function shapeProduct(row, { withDetail = false } = {}) {
  if (!row) return null;
  const base = {
    id: row.id,
    code: row.code,
    title: row.title,
    subtitle: row.subtitle,
    category: row.category,
    spec: row.spec,
    price: row.price,
    listPrice: row.list_price,
    priceText: (row.price / 100).toFixed(2),
    listPriceText: (row.list_price / 100).toFixed(2),
    stock: row.stock,
    sales: row.sales,
    soldOut: row.stock <= 0,
    presale: row.status === 'presale',
    doseMl: row.dose_ml,
    volumeMl: row.volume_ml,
    tags: parseJson(row.tags_json, []),
    sellingPoints: parseJson(row.selling_points_json, []),
    image: row.image,
    gallery: parseJson(row.gallery_json, []),
    sourcePlatform: row.source_platform,
  };
  if (withDetail) {
    base.detail = parseJson(row.detail_json, {});
    base.status = row.status;
  }
  return base;
}

/** 商品列表（可按分类过滤，带缓存） */
export async function listProducts({ category, keyword, includeOffline = false } = {}) {
  const all = await remember(cacheKeys.productList(), 30, async () => {
    const rows = await query('SELECT * FROM products ORDER BY sort_order ASC, id ASC');
    return rows.map((r) => shapeProduct(r));
  });
  let list = all;
  // 默认展示：在售且有货；预售/缺货商品需要显式传 all=1 才返回（避免首页出现"售罄"干扰）
  if (!includeOffline) list = list.filter((p) => !p.presale && p.stock > 0);
  if (category && category !== 'all') list = list.filter((p) => p.category === category);
  if (keyword) {
    const k = String(keyword).toLowerCase();
    list = list.filter((p) => `${p.title}${p.subtitle}${p.tags.join('')}${p.sellingPoints.map((s) => s.title).join('')}`.toLowerCase().includes(k));
  }
  return list;
}

export async function getProductByCode(code, { withDetail = true } = {}) {
  const row = await get('SELECT * FROM products WHERE code = ?', [code]);
  return shapeProduct(row, { withDetail });
}

export async function getProductById(id, { withDetail = true } = {}) {
  const row = await get('SELECT * FROM products WHERE id = ?', [id]);
  return shapeProduct(row, { withDetail });
}

export async function listCategories() {
  const products = await listProducts({ includeOffline: true });
  const counts = {};
  products.forEach((p) => { counts[p.category] = (counts[p.category] ?? 0) + 1; });
  const cats = await remember('shop:categories', 60, async () => brand.aidChain && null);
  void cats;
  const raw = await get('SELECT v FROM sys_config WHERE k = ?', ['categories']);
  const defined = parseJson(raw?.v, []);
  return defined.map((c) => ({ ...c, count: counts[c.key] ?? 0 }));
}

/**
 * AI 智能搭配推荐（规则引擎 + 可解释理由）
 * 之所以用规则引擎而非大模型：推荐需要稳定、可解释、可复现，
 * 且离线也能工作；接入大模型后仅用于把理由润色成更自然的文案。
 */
export function recommendProducts({ products, cartProductCodes = [], babyMonths = null }) {
  const byCode = new Map(products.map((p) => [p.code, p]));
  const inCart = new Set(cartProductCodes);
  const picks = [];
  const has = (code) => inCart.has(code);

  const push = (code, reason, score) => {
    const p = byCode.get(code);
    if (!p || p.presale || p.stock <= 0) return;
    if (picks.some((x) => x.code === code)) return;
    picks.push({ ...p, reason, score });
  };

  // 规则 1：新手第一次接触 → 推荐体验装
  if (!has('CY-OIL-30') && !has('CY-TRIAL-5')) {
    push('CY-OIL-30', '新手首选：30ml 体验装低门槛试用，月子中心同款，按压一次 0.25ml 更好掌控', 96);
  }
  // 规则 2：已选 30ml → 引导家庭装（更划算）
  if (has('CY-OIL-30') && !has('CY-OIL-100')) {
    push('CY-OIL-100', '用着合适就换家庭装：100ml 每 10ml 只要 6.9 元，比体验装省近四成', 94);
  }
  // 规则 3：已选 100ml → 推荐便携/试用装作为出行与待产包补充
  if (has('CY-OIL-100') && !has('CY-TRIAL-5')) {
    push('CY-TRIAL-5', '常备家庭装的家长，通常再带一组 5ml 出行装：待产包、外出、临时借用都方便', 88);
  }
  // 规则 4：默认推荐爆款正装（无任何选择时的兜底）
  push('CY-OIL-100', '销量第一的主力装，95% 高纯度冷榨山茶油 + 一物一码溯源', 90);
  // 规则 5：送礼场景
  if (cartProductCodes.length === 0) {
    push('CY-GIFT-MAN', '送满月礼可以看礼盒装：家庭装 + 便携装组合，附溯源卡与祝福卡', 72);
  }
  // 规则 6：按月龄给出使用建议（不改变推荐排序，仅作为提示语）
  let ageTip = null;
  if (babyMonths !== null && babyMonths !== undefined && babyMonths !== '') {
    const m = Number(babyMonths);
    if (Number.isFinite(m)) {
      if (m <= 3) ageTip = '宝宝 0-3 个月：建议每次抚触 5 分钟，取 2-3 滴掌心搓热后再上手';
      else if (m <= 6) ageTip = '宝宝 4-6 个月：可加入背部与脚底抚触，每次 5-10 分钟';
      else ageTip = '宝宝 6 个月以上：可配合被动操，边抚触边和宝宝说话';
    }
  }
  return { items: picks.slice(0, 3), ageTip };
}

export default {
  shapeProduct, listProducts, getProductByCode, getProductById, listCategories, recommendProducts,
};
