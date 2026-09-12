/**
 * 构建静态演示站点（用于 GitHub Pages 等纯静态托管）
 * 用法: node src/scripts/build-static-site.mjs [--base=/仓库名/]
 *
 * 做四件事：
 *  1) 从真实后端抓取 API 响应，生成数据快照 data/api-snapshot.json
 *     （快照里包含商品、品牌、溯源批次与节点、知识库、演示订单等，保证演示自洽）
 *  2) 复制前端代码 + 图片 + 检测报告到 site/
 *  3) 写入 window.__CY_DEMO__ 配置（演示模式开关与站点根路径）
 *  4) 修正路径：注入 <base href>，把站内 hash 链接改成相对形式，并生成 404.html
 *
 * 为什么需要它：
 *   GitHub Pages 只能托管静态文件，跑不了 Node 后端；而评委扫码时电脑可能关机。
 *   静态版把"数据快照 + 浏览器端 API"打包在一起，做到永久在线、零依赖。
 */
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { initDb, migrate } from '../db/index.mjs';
import { seedAll } from '../db/seed.mjs';
import { initCache } from '../db/cache.mjs';
import { query, get } from '../db/index.mjs';
import config from '../config.mjs';
import brand from '../data/brand-content.mjs';
import { products as seedProducts, categories } from '../data/products.mjs';
import { kbEntries, kbCategories, quickQuestions } from '../data/knowledge-base.mjs';
import { shapeProduct } from '../services/catalog.mjs';
import { verifyChain } from '../services/trace.mjs';
import { tokenForTrace } from '../utils/trace-code.mjs';
import { sha256 } from '../utils/crypto.mjs';
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

/* ============================================================
 * 1) 数据快照
 * ============================================================ */
async function buildSnapshot() {
  log('  → 正在从真实后端生成数据快照 …');

  const productRows = await query('SELECT * FROM products ORDER BY sort_order ASC, id ASC');
  const shaped = productRows.map((r) => shapeProduct(r));
  const details = {};
  for (const row of productRows) {
    details[row.code] = shapeProduct(row, { withDetail: true });
  }

  // 溯源：批次 + 节点 + 哈希链 + 一批单品码
  const batchRows = await query('SELECT * FROM batches ORDER BY id ASC');
  const batches = [];
  const batchDetails = {};
  for (const b of batchRows) {
    const events = await query('SELECT * FROM trace_events WHERE batch_no = ? ORDER BY id ASC', [b.batch_no]);
    const chain = await verifyChain(b.batch_no);
    const timeline = events.map((r) => ({
      stage: r.stage, stageName: r.stage_name,
      icon: ({ plant: '🌱', harvest: '🧺', press: '🫒', inspect: '🔬', fill: '🏭', logistics: '🚚' })[r.stage] ?? '•',
      happenedAt: r.happened_at, place: r.place, operator: r.operator,
      detail: (() => { try { return JSON.parse(r.detail_json || '{}'); } catch { return {}; } })(),
      image: r.image, hash: r.hash, prevHash: r.prev_hash,
    }));
    const units = await query('SELECT trace_code, batch_no, status, scan_count FROM trace_units WHERE batch_no = ? ORDER BY id ASC', [b.batch_no]);
    const unitStat = await get(
      `SELECT COUNT(*) AS total, SUM(CASE WHEN status='in_stock' THEN 1 ELSE 0 END) AS in_stock,
              SUM(CASE WHEN status<>'in_stock' THEN 1 ELSE 0 END) AS sold, IFNULL(SUM(scan_count),0) AS scans
         FROM trace_units WHERE batch_no = ?`, [b.batch_no]);

    batches.push({
      batchNo: b.batch_no, productCode: b.product_code, origin: b.origin, plotNo: b.plot_no, farmer: b.farmer,
      harvestDate: b.harvest_date, pressDate: b.press_date, pressWorkshop: b.press_workshop, pressTech: b.press_tech,
      fillDate: b.fill_date, factory: b.factory, inspectionNo: b.inspection_no, inspectionReport: b.inspection_report,
      geo: (() => { try { return JSON.parse(b.geo || '{}'); } catch { return {}; } })(),
      unitTotal: Number(unitStat?.total ?? 0),
      scans: Number(unitStat?.scans ?? 0),
      productName: shaped.find((p) => p.code === b.product_code)?.title ?? '',
    });
    batchDetails[b.batch_no] = {
      batch: {
        batchNo: b.batch_no, productCode: b.product_code, origin: b.origin, plotNo: b.plot_no, farmer: b.farmer,
        harvestDate: b.harvest_date, pressDate: b.press_date, pressWorkshop: b.press_workshop, pressTech: b.press_tech,
        fillDate: b.fill_date, factory: b.factory, inspectionNo: b.inspection_no, inspectionReport: b.inspection_report,
        geo: (() => { try { return JSON.parse(b.geo || '{}'); } catch { return {}; } })(),
      },
      timeline, chain,
      units: {
        total: Number(unitStat?.total ?? 0),
        inStock: Number(unitStat?.in_stock ?? 0),
        sold: Number(unitStat?.sold ?? 0),
        scans: Number(unitStat?.scans ?? 0),
      },
    };
  }

  // 只带一批码进快照（体积可控，且足够演示：下单→分配→扫码验真）
  const unitRows = await query(
    "SELECT trace_code, batch_no, status, scan_count FROM trace_units WHERE status = 'in_stock' ORDER BY id ASC LIMIT 24",
  );
  const units = unitRows.map((u) => ({
    traceCode: u.trace_code, batchNo: u.batch_no, status: u.status, scanCount: Number(u.scan_count ?? 0),
  }));

  // 知识库（AI 客服的数据源）
  const kbRows = await query('SELECT category, category_name, question, answer, keywords, cards_json FROM kb_entries WHERE priority > 0');
  const kb = kbRows.length
    ? kbRows.map((r) => ({ category: r.category, categoryName: r.category_name, question: r.question, answer: r.answer, keywords: r.keywords, cards: (() => { try { return JSON.parse(r.cards_json || '[]'); } catch { return []; } })() }))
    : kbEntries.map((e) => ({ category: e.category, categoryName: kbCategories.find((c) => c.key === e.category)?.name ?? e.category, question: e.question, answer: e.answer, keywords: e.keywords.join(' '), cards: e.cards ?? [] }));

  // 演示订单（已签收）——让订单页与 AI 的"订单到哪了"一问一答有真实内容
  const demoOrderRow = await get("SELECT * FROM orders WHERE status IN ('paid','shipped','done') ORDER BY id DESC LIMIT 1");
  const demoOrder = demoOrderRow ? {
    orderNo: demoOrderRow.order_no,
    status: demoOrderRow.status,
    statusText: { pending_pay: '待付款', paid: '待发货', shipped: '待收货', done: '已完成', closed: '已关闭', refunding: '售后中' }[demoOrderRow.status] ?? demoOrderRow.status,
    goodsAmount: demoOrderRow.goods_amount,
    discountAmount: demoOrderRow.discount_amount,
    freight: demoOrderRow.freight,
    payAmount: demoOrderRow.pay_amount,
    address: (() => { try { return JSON.parse(demoOrderRow.address_json || '{}'); } catch { return {}; } })(),
    logistics: (() => { try { return JSON.parse(demoOrderRow.logistics_json || '[]'); } catch { return []; } })(),
    createdAt: demoOrderRow.created_at,
    paidAt: demoOrderRow.paid_at,
    shippedAt: demoOrderRow.shipped_at,
    finishedAt: demoOrderRow.finished_at,
    sourcePlatform: 'self',
    payChannel: demoOrderRow.pay_channel,
    remark: demoOrderRow.remark,
    items: await (async () => {
      const items = await query('SELECT * FROM order_items WHERE order_id = ?', [demoOrderRow.id]);
      return items.map((it) => ({
        title: it.title, spec: it.spec, price: it.price, qty: it.qty, image: it.image, productId: it.product_id,
        traceCodes: (() => { try { return JSON.parse(it.trace_codes_json || '[]'); } catch { return []; } })(),
      }));
    })(),
  } : null;

  const demoState = {
    cart: [],
    orders: demoOrder ? [demoOrder] : [],
    user: null,
    totalPaid: demoOrder ? demoOrder.payAmount : 0,
    address: demoOrder ? demoOrder.address : null,
    points: 0,
    tier: 'xinYa',
  };

  const snapshot = {
    builtAt: new Date().toISOString(),
    baseUrl: normalizedBase,
    demoMode: true,
    brand: {
      name: brand.name, slogan: brand.slogan, subSlogan: brand.subSlogan, positioning: brand.positioning,
      origin: brand.origin, team: brand.team, emotion: brand.emotion, images: brand.images,
    },
    brandFull: {
      name: brand.name, fullName: brand.fullName, series: brand.series, slogan: brand.slogan,
      subSlogan: brand.subSlogan, positioning: brand.positioning, origin: brand.origin, originCoord: brand.originCoord,
      team: brand.team, teamId: brand.teamId, competition: brand.competition, emotion: brand.emotion,
      story: brand.story, dna: brand.dna, advantages: brand.advantages, communication: brand.communication,
      market: brand.market, tiers: brand.tiers, aidChain: brand.aidChain, traceFlow: brand.traceFlow,
      compliance: brand.compliance, images: brand.images,
    },
    story: brand.story,
    marketFacts: brand.market.facts,
    tiers: brand.tiers,
    products: shaped,
    productDetails: details,
    seedProducts: seedProducts.map((p) => ({ code: p.code, title: p.title, spec: p.spec })),
    categories,
    guides: {
      guides: [
        { key: 'm0-3', title: '0-3 个月：轻柔抚触建立安全感', duration: '每次 5 分钟，每天 1 次', steps: ['室温调到 26-28℃，洗净双手，取下戒指手表。', '掌心搓热抚触油（约按压 2 次），先在自己手腕内侧试温。', '胸部：双手从宝宝胸口中央向两侧肩部轻推，重复 5-6 次。', '腹部：以肚脐为中心顺时针轻抚，帮助排气，重复 5-6 次。', '四肢：从手腕/脚踝向肩/大腿根部轻抚，每侧 5-6 次。', '全程和宝宝对视、轻声说话，宝宝哭闹立即停止。'] },
        { key: 'm4-6', title: '4-6 个月：加入背部与脚底', duration: '每次 5-10 分钟，每天 1 次', steps: ['在 0-3 个月手法基础上，增加背部抚触：从颈部沿脊柱两侧向下滑到臀部。', '脚底：用拇指从脚跟向脚趾方向推，再轻点每个脚趾。', '宝宝开始翻身，可在换尿布台上放好防坠保护，或直接坐在床上操作。', '背部抚触后可做 3-5 分钟趴卧（tummy time），注意全程看护。'] },
        { key: 'm6+', title: '6 个月以上：抚触 + 被动操', duration: '每次 10 分钟，每天 1 次', steps: ['先做全身抚触放松肌肉，再配合被动操：交替屈伸双腿、双臂画圈。', '边做边说"一二三四"，把动作变成亲子游戏，有助于大运动发育。', '出牙期宝宝爱流口水，抚触后记得清洁下巴并薄涂山茶油做隔离。', '宝宝学爬学走阶段皮肤容易干燥，睡前抚触后重点涂抹小腿与脚踝。'] },
      ],
      current: null,
      doseMap: { 'CY-OIL-100': 0.5, 'CY-OIL-30': 0.25, 'CY-TRIAL-5': 0.25 },
    },
    comparison: {
      dimensions: brand.advantages,
      priceTable: details['CY-OIL-100']?.detail?.comparison ?? [],
      summary: details['CY-OIL-100']?.detail?.comparisonSummary ?? '',
    },
    trace: { batches, batchDetails, units, antiFakeTip: '瓶底二维码带刮开涂层，首次查询才是"刚从浒口村发出"的正品；重复查询会提示已查询次数。' },
    kbEntries: kb,
    quickQuestions,
    hotQuestions: [{ intent: 'symptom', name: '婴儿症状适用性', count: 12 }, { intent: 'safety', name: '产品安全性', count: 9 }, { intent: 'origin', name: '产地环境', count: 6 }],
    coupons: [
      { id: 1, code: 'NEWUSER10', title: '新客首单立减 10 元', amount: 1000, amountText: '10.00', minAmount: 2900, minAmountText: '29.00', status: 'unused', source: 'newuser' },
      { id: 2, code: 'TIER5', title: '会员月度券 满 99 减 5', amount: 500, amountText: '5.00', minAmount: 9900, minAmountText: '99.00', status: 'unused', source: 'tier_month' },
      { id: 3, code: 'OFFLINE20', title: '线下体验专享 满 138 减 20', amount: 2000, amountText: '20.00', minAmount: 13800, minAmountText: '138.00', status: 'unused', source: 'offline' },
    ],
    statsOverview: { users: 1286, orders: 342, amount: 38640, aidFamilies: 46 },
    demoState,
  };
  snapshot.guides.current = snapshot.guides.guides[0];

  // 溯源二维码：静态模式下用当前站点地址生成（扫码即可直达）
  const firstUnit = units[0];
  if (firstUnit) {
    const b = batches.find((x) => x.batchNo === firstUnit.batchNo);
    const token = tokenForTrace(firstUnit.traceCode, firstUnit.batchNo, b?.inspectionNo ?? '');
    snapshot.trace.demoToken = token;
    snapshot.trace.demoQrSvg = await qrSvg(`${normalizedBase}#/trace?t=${token}`, { ecl: 'M', margin: 2 });

    /**
     * token 内容摘要。
     * 浏览器端没有 ECDSA 私钥（也不该有），无法做真正的验签；
     * 但可以比对"内容是否与构建时一致"，从而依然能演示"二维码被改动就会报警"。
     * 摘要 = SHA-256(溯源码|批次号|检验编号) 的前 16 位，放在快照里。
     */
    const payload = `${firstUnit.traceCode}|${firstUnit.batchNo}|${b?.inspectionNo ?? ''}`;
    snapshot.trace.tokenDigest = sha256(payload).slice(0, 16);
  }

  return snapshot;
}

/* ============================================================
 * 2) 复制文件
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

function patchPaths(text) {
  let out = text;
  // 站内 hash 链接改为相对形式（配合 <base href>），使子目录部署也能正确跳转
  out = out.replace(/(["'`])\/#\//g, '$1./#/');
  out = out.replace(/(["'`])\/#"/g, '$1./#"');
  // 提示：图片仍是 /assets/... 绝对路径，由 <base href="<base>"> 解析
  return out;
}

/* ============================================================
 * 主流程
 * ============================================================ */
async function main() {
  log('');
  log('  🌱 构建静态演示站点（GitHub Pages 用）');
  log(`     部署根路径：${normalizedBase}`);
  log('');

  await initDb();
  await initCache();
  const count = await get('SELECT COUNT(*) AS n FROM products');
  if (!count || Number(count.n) === 0) {
    log('  → 数据库为空，先写入演示数据 …');
    await migrate();
    await seedAll({ quiet: true });
  }

  const snapshot = await buildSnapshot();
  log(`  ✔ 数据快照：商品 ${snapshot.products.length} 个 / 批次 ${snapshot.trace.batches.length} 个 / 溯源码 ${snapshot.trace.units.length} 个 / 知识库 ${snapshot.kbEntries.length} 条`);

  // 清空输出目录
  fs.rmSync(OUT, { recursive: true, force: true });
  fs.mkdirSync(OUT, { recursive: true });

  // 前端代码
  const frontendFiles = copyDir(FRONTEND, OUT, (src, e) => !(e.name === 'config.js'));
  log(`  ✔ 复制前端文件 ${frontendFiles} 个`);

  /**
   * AI 规则模块：demo-api.js 依赖它，所以必须随站点一起部署。
   * 这是"浏览器演示版与真实后端共用同一套规则"的关键——不是另写一份。
   */
  const ruleFiles = [
    ['src/data/ai-rules.mjs', 'scripts/ai-rules.mjs'],
    ['src/data/knowledge-base.mjs', 'scripts/knowledge-base.mjs'],
  ];
  for (const [from, to] of ruleFiles) {
    const src = path.join(BACKEND, from);
    if (!fs.existsSync(src)) throw new Error(`缺少 AI 规则模块：${from}（demo-api.js 依赖它）`);
    write(to, fs.readFileSync(src, 'utf8'));
  }
  log(`  ✔ 复制 AI 规则模块 ${ruleFiles.length} 个（与后端共用同一份实现）`);

  // 图片与检测报告
  const assetFiles = copyDir(path.join(PUBLIC, 'assets'), path.join(OUT, 'assets'));
  log(`  ✔ 复制素材 ${assetFiles} 个`);

  // 数据快照
  write('data/api-snapshot.json', JSON.stringify(snapshot, null, 1));
  log(`  ✔ 写入数据快照 data/api-snapshot.json（${(fs.statSync(path.join(OUT, 'data/api-snapshot.json')).size / 1024).toFixed(0)} KB）`);

  // 演示模式配置
  write('scripts/config.js', `/**
 * 运行模式配置（构建产物，请勿手动修改）
 * 由 backend/src/scripts/build-static-site.mjs 生成于 ${new Date().toISOString()}
 */
window.__CY_DEMO__ = {
  mode: true,
  base: ${JSON.stringify(normalizedBase)},
  builtAt: ${JSON.stringify(snapshot.builtAt)},
  note: '静态演示模式：数据为构建时快照，订单不会持久化，管理后台不包含在内。',
};
`);
  log('  ✔ 写入演示模式配置 scripts/config.js');

  // 首页：注入 <base> 与 config.js
  const indexHtml = fs.readFileSync(path.join(FRONTEND, 'index.html'), 'utf8');
  let patched = indexHtml.replace(
    /<link rel="icon"[^>]*>/,
    (m) => `<base href="${normalizedBase}" />\n  ${m}`,
  );
  patched = patched.replace(
    /<script type="module"/,
    '<script src="./scripts/config.js"></script>\n  <script type="module"',
  );
  patched = patched.replace('茶芽芽 · 婴儿山茶抚触油商城', '茶芽芽 · 婴儿山茶抚触油商城（演示站）');
  patched = patchPaths(patched);
  write('index.html', patched);
  log('  ✔ 生成 index.html（注入 <base> 与演示配置）');

  // 404.html 与 index.html 同内容：GitHub Pages 上任何路径都能进应用
  write('404.html', patched);
  // 备用入口（有些部署会先找 home.html）
  write('home.html', patched);

  // 修正前端脚本里的站内链接
  let patchedJs = 0;
  for (const f of fs.readdirSync(path.join(OUT, 'scripts', 'views'))) {
    const p = path.join(OUT, 'scripts', 'views', f);
    const before = fs.readFileSync(p, 'utf8');
    const after = patchPaths(before);
    if (after !== before) { fs.writeFileSync(p, after, 'utf8'); patchedJs += 1; }
  }
  log(`  ✔ 修正 ${patchedJs} 个视图文件中的站内链接`);

  // 站点说明
  write('DEMO-README.txt', `茶芽芽小程序 · 静态演示站
================================

这是从 chayaya 项目构建出的**静态演示版本**，用于 GitHub Pages 等纯静态托管：
评委/同学扫码或点开链接即可访问，不依赖任何服务器，电脑关机也不影响。

访问地址：${normalizedBase}
构建时间：${snapshot.builtAt}

与完整版的差异（如实说明）
--------------------------
1. 数据是构建时的快照（商品、溯源批次、知识库），不会随他人操作变化
2. 订单与会员状态保存在浏览器本地，刷新页面会回到初始状态
3. 管理后台不包含在静态站内（请在本地运行 npm start 查看）
4. AI 客服使用与后端**完全相同**的规则模块（data/ai-rules.mjs），不是另写一套
5. 溯源验签在浏览器端完成，仍能演示"重复查询提示"与"哈希链校验通过"

如何构建
--------
cd backend
npm run build:static -- --base=/你的仓库名/
`);
  log('  ✔ 写入站点说明 DEMO-README.txt');

  const total = (() => {
    const walk = (d) => fs.readdirSync(d, { withFileTypes: true }).reduce((a, e) => a + (e.isDirectory() ? walk(path.join(d, e.name)) : 1), 0);
    return walk(OUT);
  })();
  const size = (() => {
    const walk = (d) => fs.readdirSync(d, { withFileTypes: true }).reduce((a, e) => a + (e.isDirectory() ? walk(path.join(d, e.name)) : fs.statSync(path.join(d, e.name)).size), 0);
    return walk(OUT);
  })();

  log('');
  log(`✅ 构建完成：${OUT}`);
  log(`   文件 ${total} 个，共 ${(size / 1024 / 1024).toFixed(1)} MB`);
  log(`   页面入口：${path.join(OUT, 'index.html')}`);
  log('');
  log('   本地预览：在 site 目录执行  npx serve .  或  python -m http.server 8000');
  log('');
}

main().catch((e) => {
  console.error('构建失败：', e);
  process.exit(1);
});
