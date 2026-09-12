/**
 * 无数据库构建静态演示站（用于 CI / 没装任何东西的机器）
 * 用法: node src/scripts/build-static-offline.mjs [--base=/仓库名/]
 *
 * 与 build-static-site.mjs 的区别：
 *   后者从真实后端数据库抓数据（本地开发用，数据最真实）；
 *   本脚本完全不碰数据库，直接用 src/data/*.mjs 里的种子数据生成快照，
 *   因此在 GitHub Actions 里也能跑（CI 没有 SQLite 文件、也不需要初始化）。
 *
 * 数据一致性：溯源哈希链在这里用与后端相同的算法（chainHash）重新计算，
 * 所以"哈希链校验通过/篡改报警"的演示效果与真实运行时一致。
 */
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import config from '../config.mjs';
import brand from '../data/brand-content.mjs';
import { products as seedProducts, categories } from '../data/products.mjs';
import { batches as seedBatches, unitsPerBatch } from '../data/trace-records.mjs';
import { kbEntries, kbCategories, quickQuestions, symptomRules, medicalRedFlags } from '../data/knowledge-base.mjs';
import { chainHash, sha256 } from '../utils/crypto.mjs';
import { newTraceCode, tokenForTrace, tracePayload } from '../utils/trace-code.mjs';
import { qrSvg } from '../utils/qrcode.mjs';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const BACKEND = path.resolve(__dirname, '..', '..');
const FRONTEND = path.resolve(BACKEND, '..', 'frontend');
const PUBLIC = path.join(BACKEND, 'public');
const OUT = path.resolve(BACKEND, '..', 'site');

const baseArg = process.argv.find((a) => a.startsWith('--base='));
const BASE = baseArg ? baseArg.slice('--base='.length) : '/chayaya-mall/';
const normalizedBase = BASE.endsWith('/') ? BASE : `${BASE}/`;

const log = (...a) => console.log(...a);

/** 与 services/catalog.mjs 的 shapeProduct 输出保持一致（前端依赖这些字段名） */
function shapeProduct(p) {
  return {
    code: p.code,
    title: p.title,
    subtitle: p.subtitle ?? '',
    category: p.category,
    spec: p.spec,
    price: p.price,
    listPrice: p.listPrice,
    priceText: (p.price / 100).toFixed(2),
    listPriceText: (p.listPrice / 100).toFixed(2),
    stock: p.stock,
    sales: p.sales,
    soldOut: p.stock <= 0,
    presale: p.stock <= 0,
    doseMl: p.doseMl ?? null,
    volumeMl: p.volumeMl ?? null,
    tags: p.tags ?? [],
    sellingPoints: p.sellingPoints ?? [],
    image: p.image,
    gallery: p.gallery ?? [],
    sourcePlatform: 'self',
    detail: p.detail ?? {},
  };
}

function buildSnapshot() {
  const shaped = seedProducts.map(shapeProduct);
  const details = Object.fromEntries(shaped.map((p) => [p.code, p]));

  /* ---------- 溯源：节点 + 哈希链（与后端同算法） ---------- */
  const STAGE_ICON = { plant: '🌱', harvest: '🧺', press: '🫒', inspect: '🔬', fill: '🏭', logistics: '🚚' };
  const batches = [];
  const batchDetails = {};
  let allUnits = [];

  for (const b of seedBatches) {
    let prev = config.security.genesisHash;
    const timeline = b.events.map((ev) => {
      const payload = {
        batchNo: b.batchNo, stage: ev.stage, happenedAt: ev.happenedAt,
        place: ev.place, operator: ev.operator, detail: ev.detail,
      };
      const hash = chainHash(prev, payload);
      const node = {
        stage: ev.stage,
        stageName: ev.stageName,
        icon: STAGE_ICON[ev.stage] ?? '•',
        happenedAt: ev.happenedAt,
        place: ev.place,
        operator: ev.operator,
        detail: ev.detail ?? {},
        image: ev.image ?? '',
        hash,
        prevHash: prev,
      };
      prev = hash;
      return node;
    });

    const n = unitsPerBatch[b.batchNo] ?? 10;
    const harvest = new Date(`${b.harvestDate}T00:00:00Z`);
    const units = [];
    for (let i = 0; i < n; i += 1) {
      units.push({
        traceCode: newTraceCode(harvest, `${b.batchNo.replace(/\D/g, '').slice(-4)}${String(i + 1).padStart(4, '0')}${i}`),
        batchNo: b.batchNo,
        status: 'in_stock',
        scanCount: 0,
      });
    }
    allUnits = allUnits.concat(units);

    const productName = shaped.find((p) => p.code === b.productCode)?.title ?? '';
    batches.push({
      batchNo: b.batchNo, productCode: b.productCode, origin: b.origin, plotNo: b.plotNo, farmer: b.farmer,
      harvestDate: b.harvestDate, pressDate: b.pressDate, pressWorkshop: b.pressWorkshop, pressTech: b.pressTech,
      fillDate: b.fillDate, factory: b.factory, inspectionNo: b.inspectionNo, inspectionReport: b.inspectionReport,
      geo: b.geo, unitTotal: units.length, scans: 0, productName,
    });
    batchDetails[b.batchNo] = {
      batch: {
        batchNo: b.batchNo, productCode: b.productCode, origin: b.origin, plotNo: b.plotNo, farmer: b.farmer,
        harvestDate: b.harvestDate, pressDate: b.pressDate, pressWorkshop: b.pressWorkshop, pressTech: b.pressTech,
        fillDate: b.fillDate, factory: b.factory, inspectionNo: b.inspectionNo, inspectionReport: b.inspectionReport,
        geo: b.geo,
      },
      timeline,
      chain: { intact: true, nodeCount: timeline.length, chainHead: prev },
      units: { total: units.length, inStock: units.length, sold: 0, scans: 0 },
    };
  }

  // 只取前 24 个码进快照（体积可控，足够演示下单→分配→扫码）
  const units = allUnits.slice(0, 24);

  /* ---------- 演示订单（与 seed.mjs 里那条一致） ---------- */
  const oil100 = shaped.find((p) => p.code === 'CY-OIL-100');
  const demoAddress = {
    receiver: '周女士', phone: '13800000002', province: '广东省', city: '珠海市',
    district: '香洲区', detail: '唐家湾镇金凤路 18 号北师大珠海校区',
  };
  const demoOrder = {
    id: 1,
    orderNo: 'CY202602180930001234',
    status: 'done',
    statusText: '已完成',
    goodsAmount: oil100.price,
    discountAmount: 0,
    freight: 0,
    payAmount: oil100.price,
    address: demoAddress,
    logistics: [
      { time: '2026-02-19 10:20', text: '浒口村乡村物流节点已揽收' },
      { time: '2026-02-19 18:05', text: '到达郴州市分拨中心' },
      { time: '2026-02-20 09:12', text: '运输中，发往珠海市' },
      { time: '2026-02-21 11:40', text: '已签收，签收人：本人' },
    ],
    createdAt: '2026-02-18T09:30:00+08:00',
    paidAt: '2026-02-18T09:31:00+08:00',
    shippedAt: '2026-02-19T10:20:00+08:00',
    finishedAt: '2026-02-21T11:40:00+08:00',
    sourcePlatform: 'self',
    payChannel: 'mock_wechat',
    remark: '',
    items: [{
      productId: 1, title: oil100.title, spec: oil100.spec, price: oil100.price, qty: 1, image: oil100.image,
      traceCodes: units.slice(0, 1).map((u) => u.traceCode),
    }],
  };

  const guides = {
    guides: [
      { key: 'm0-3', title: '0-3 个月：轻柔抚触建立安全感', duration: '每次 5 分钟，每天 1 次', steps: ['室温调到 26-28℃，洗净双手，取下戒指手表。', '掌心搓热抚触油（约按压 2 次），先在自己手腕内侧试温。', '胸部：双手从宝宝胸口中央向两侧肩部轻推，重复 5-6 次。', '腹部：以肚脐为中心顺时针轻抚，帮助排气，重复 5-6 次。', '四肢：从手腕/脚踝向肩/大腿根部轻抚，每侧 5-6 次。', '全程和宝宝对视、轻声说话，宝宝哭闹立即停止。'] },
      { key: 'm4-6', title: '4-6 个月：加入背部与脚底', duration: '每次 5-10 分钟，每天 1 次', steps: ['在 0-3 个月手法基础上，增加背部抚触：从颈部沿脊柱两侧向下滑到臀部。', '脚底：用拇指从脚跟向脚趾方向推，再轻点每个脚趾。', '宝宝开始翻身，可在换尿布台上放好防坠保护，或直接坐在床上操作。', '背部抚触后可做 3-5 分钟趴卧（tummy time），注意全程看护。'] },
      { key: 'm6+', title: '6 个月以上：抚触 + 被动操', duration: '每次 10 分钟，每天 1 次', steps: ['先做全身抚触放松肌肉，再配合被动操：交替屈伸双腿、双臂画圈。', '边做边说"一二三四"，把动作变成亲子游戏，有助于大运动发育。', '出牙期宝宝爱流口水，抚触后记得清洁下巴并薄涂山茶油做隔离。', '宝宝学爬学走阶段皮肤容易干燥，睡前抚触后重点涂抹小腿与脚踝。'] },
    ],
    current: null,
    doseMap: { 'CY-OIL-100': 0.5, 'CY-OIL-30': 0.25, 'CY-TRIAL-5': 0.25 },
  };
  guides.current = guides.guides[0];

  const kb = kbEntries.map((e) => ({
    category: e.category,
    categoryName: kbCategories.find((c) => c.key === e.category)?.name ?? e.category,
    question: e.question,
    answer: e.answer,
    keywords: e.keywords.join(' '),
    cards: e.cards ?? [],
  }));

  const snapshot = {
    builtAt: new Date().toISOString(),
    baseUrl: normalizedBase,
    demoMode: true,
    brand: {
      name: brand.name, slogan: brand.slogan, subSlogan: brand.subSlogan, positioning: brand.positioning,
      origin: brand.origin, team: brand.team, emotion: brand.emotion, images: brand.images,
    },
    brandFull: { ...brand },
    story: brand.story,
    marketFacts: brand.market.facts,
    tiers: brand.tiers,
    products: shaped,
    productDetails: details,
    categories,
    guides,
    comparison: {
      dimensions: brand.advantages,
      priceTable: details['CY-OIL-100']?.detail?.comparison ?? [],
      summary: details['CY-OIL-100']?.detail?.comparisonSummary ?? '',
    },
    trace: { batches, batchDetails, units, antiFakeTip: '瓶底二维码带刮开涂层，首次查询才是"刚从浒口村发出"的正品；重复查询会提示已查询次数。' },
    kbEntries: kb,
    quickQuestions,
    hotQuestions: [
      { intent: 'symptom', name: '婴儿症状适用性', count: 12 },
      { intent: 'safety', name: '产品安全性', count: 9 },
      { intent: 'origin', name: '产地环境', count: 6 },
    ],
    coupons: [
      { id: 1, code: 'NEWUSER10', title: '新客首单立减 10 元', amount: 1000, amountText: '10.00', minAmount: 2900, minAmountText: '29.00', status: 'unused', source: 'newuser' },
      { id: 2, code: 'TIER5', title: '会员月度券 满 99 减 5', amount: 500, amountText: '5.00', minAmount: 9900, minAmountText: '99.00', status: 'unused', source: 'tier_month' },
      { id: 3, code: 'OFFLINE20', title: '线下体验专享 满 138 减 20', amount: 2000, amountText: '20.00', minAmount: 13800, minAmountText: '138.00', status: 'unused', source: 'offline' },
    ],
    statsOverview: { users: 1286, orders: 342, amount: 38640, aidFamilies: 46 },
    demoState: {
      cart: [], orders: [demoOrder], user: null,
      totalPaid: demoOrder.payAmount, address: demoAddress, points: 0, tier: 'xinYa',
    },
    // 规则元数据（便于演示时展示"红线关键词""分级规则"从哪来）
    ruleMeta: {
      symptomRuleCount: symptomRules.length,
      redFlagCount: medicalRedFlags.length,
      note: 'AI 规则与后端共用同一份 data/ai-rules.mjs 实现',
    },
  };

  // token + 内容摘要（演示模式无签名私钥，用摘要比对演示"改了就报警"）
  const firstUnit = units[0];
  const firstBatch = batches.find((x) => x.batchNo === firstUnit.batchNo);
  const token = tokenForTrace(firstUnit.traceCode, firstUnit.batchNo, firstBatch?.inspectionNo ?? '');
  snapshot.trace.demoToken = token;
  snapshot.trace.tokenDigest = sha256(tracePayload(firstUnit.traceCode, firstUnit.batchNo, firstBatch?.inspectionNo ?? '')).slice(0, 16);
  snapshot.trace.demoQrSvg = null;   // 由下面的异步步骤填充

  return { snapshot, qrSource: `${normalizedBase}#/trace?t=${token}` };
}

/* ============================================================
 * 复制与写入
 * ============================================================ */
function copyDir(from, to, filter = () => true) {
  if (!fs.existsSync(from)) return 0;
  fs.mkdirSync(to, { recursive: true });
  let n = 0;
  for (const e of fs.readdirSync(from, { withFileTypes: true })) {
    const src = path.join(from, e.name);
    const dst = path.join(to, e.name);
    if (!filter(src, e)) continue;
    if (e.isDirectory()) n += copyDir(src, dst, filter);
    else { fs.copyFileSync(src, dst); n += 1; }
  }
  return n;
}

function write(rel, content) {
  const file = path.join(OUT, rel);
  fs.mkdirSync(path.dirname(file), { recursive: true });
  fs.writeFileSync(file, content, 'utf8');
}

async function main() {
  log('');
  log('  🌱 构建静态演示站（离线模式，不依赖数据库）');
  log(`     部署根路径：${normalizedBase}`);
  log('');

  const { snapshot, qrSource } = buildSnapshot();
  snapshot.trace.demoQrSvg = await qrSvg(qrSource, { ecl: 'M', margin: 2 });

  log(`  ✔ 数据快照：商品 ${snapshot.products.length} 个 / 批次 ${snapshot.trace.batches.length} 个 / 溯源码 ${snapshot.trace.units.length} 个 / 知识库 ${snapshot.kbEntries.length} 条`);

  fs.rmSync(OUT, { recursive: true, force: true });
  fs.mkdirSync(OUT, { recursive: true });

  const frontendFiles = copyDir(FRONTEND, OUT, (src, e) => e.name !== 'config.js');
  log(`  ✔ 复制前端文件 ${frontendFiles} 个`);

  // AI 规则模块（demo-api.js 依赖，必须随站点部署）
  for (const [from, to] of [['src/data/ai-rules.mjs', 'scripts/ai-rules.mjs'], ['src/data/knowledge-base.mjs', 'scripts/knowledge-base.mjs']]) {
    const src = path.join(BACKEND, from);
    if (!fs.existsSync(src)) throw new Error(`缺少 ${from}`);
    write(to, fs.readFileSync(src, 'utf8'));
  }
  log('  ✔ 复制 AI 规则模块 2 个（与后端共用同一份实现）');

  const assetFiles = copyDir(path.join(PUBLIC, 'assets'), path.join(OUT, 'assets'));
  log(`  ✔ 复制素材 ${assetFiles} 个`);

  write('data/api-snapshot.json', JSON.stringify(snapshot, null, 1));
  log(`  ✔ 写入数据快照（${(fs.statSync(path.join(OUT, 'data/api-snapshot.json')).size / 1024).toFixed(0)} KB）`);

  write('scripts/config.js', `/**
 * 运行模式配置（构建产物，请勿手动修改）
 * 由 backend/src/scripts/build-static-offline.mjs 生成于 ${new Date().toISOString()}
 */
window.__CY_DEMO__ = {
  mode: true,
  base: ${JSON.stringify(normalizedBase)},
  builtAt: ${JSON.stringify(snapshot.builtAt)},
  note: '静态演示模式：数据为构建时快照，订单不会持久化，管理后台不包含在内。',
};
`);

  const indexHtml = fs.readFileSync(path.join(FRONTEND, 'index.html'), 'utf8');
  let patched = indexHtml.replace(/<link rel="icon"[^>]*>/, (m) => `<base href="${normalizedBase}" />\n  ${m}`);
  patched = patched.replace(/<script type="module"/, '<script src="./scripts/config.js"></script>\n  <script type="module"');
  patched = patched.replace('茶芽芽 · 婴儿山茶抚触油商城', '茶芽芽 · 婴儿山茶抚触油商城（演示站）');
  write('index.html', patched);
  write('404.html', patched);   // GitHub Pages：任意路径都能进应用
  write('home.html', patched);
  log('  ✔ 生成 index.html / 404.html（注入 <base> 与演示配置）');

  write('DEMO-README.txt', `茶芽芽小程序 · 静态演示站
================================

这是 chayaya 项目构建出的静态演示版本，用于 GitHub Pages 等纯静态托管：
扫码或点开链接即可访问，不依赖任何服务器，电脑关机也不影响。

部署根路径：${normalizedBase}
构建时间：${snapshot.builtAt}

与完整版的差异（如实说明）
--------------------------
1. 数据是构建时的快照（商品、溯源批次、知识库），不会随他人操作变化
2. 订单与会员状态保存在浏览器本地，刷新页面回到初始状态
3. 管理后台不包含在静态站内（本地运行 npm start 可查看）
4. AI 客服使用与后端完全相同的规则模块（scripts/ai-rules.mjs），不是另写一套
5. 溯源防伪在浏览器端用"内容摘要比对"实现，仍能演示"重复查询提示"与"篡改报警"
`);

  const count = (d) => fs.readdirSync(d, { withFileTypes: true }).reduce((a, e) => a + (e.isDirectory() ? count(path.join(d, e.name)) : 1), 0);
  const size = (d) => fs.readdirSync(d, { withFileTypes: true }).reduce((a, e) => a + (e.isDirectory() ? size(path.join(d, e.name)) : fs.statSync(path.join(d, e.name)).size), 0);

  log('');
  log(`✅ 构建完成：${OUT}`);
  log(`   文件 ${count(OUT)} 个，共 ${(size(OUT) / 1024 / 1024).toFixed(1)} MB`);
  log('');
}

main().catch((e) => {
  console.error('构建失败：', e);
  process.exit(1);
});
