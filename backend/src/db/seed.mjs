/**
 * 初始化演示数据
 * 把项目书里的品牌、商品、溯源、知识库内容写入数据库，并创建演示账号。
 * 用法: npm run reset   （会清空旧数据后重新写入）
 */
import { initDb, migrate, truncateAll, run, get, query, withTransaction } from './index.mjs';
import { initCache } from './cache.mjs';
import config from '../config.mjs';
import { brand } from '../data/brand-content.mjs';
import { products, categories } from '../data/products.mjs';
import { batches, unitsPerBatch } from '../data/trace-records.mjs';
import {
  kbCategories, kbEntries, symptomRules, intentKeywords,
} from '../data/knowledge-base.mjs';
import { newTraceCode, tokenForTrace, tracePayload } from '../utils/trace-code.mjs';
import { signTracePayload, chainHash, hashPassword } from '../utils/crypto.mjs';
import { nowIso } from '../utils/datetime.mjs';

export async function seedAll({ quiet = false } = {}) {
  const log = (...a) => { if (!quiet) console.log(...a); };
  const now = nowIso();

  await migrate();
  await truncateAll();

  /* ---------------- 系统配置 ---------------- */
  const configs = {
    brand: JSON.stringify(brand),
    categories: JSON.stringify(categories),
    ai_provider: config.ai.enabled ? `llm:${config.ai.model}` : 'rule-engine',
    trace_algorithm: 'ECDSA(secp256k1) + SHA-256 哈希链存证',
    member_tier_rule: '按累计实付自动升级：0 / 10000 / 50000 分',
    free_freight_amount: String(config.biz.freeFreightAmount),
    freight_base: String(config.biz.freightBase),
  };
  for (const [k, v] of Object.entries(configs)) {
    await run('INSERT INTO sys_config (k, v, updated_at) VALUES (?, ?, ?)', [k, v, now]);
  }

  /* ---------------- 会员等级 ---------------- */
  for (const [i, t] of brand.tiers.entries()) {
    await run(
      'INSERT INTO member_tiers (code, name, min_amount, discount, benefits_json, sort_order) VALUES (?, ?, ?, ?, ?, ?)',
      [t.code, t.name, t.min, t.discount, JSON.stringify(t.benefits), i],
    );
  }

  /* ---------------- 商品 ---------------- */
  for (const p of products) {
    await run(
      `INSERT INTO products
        (code, title, subtitle, category, spec, price, list_price, stock, sales, source_platform,
         dose_ml, volume_ml, selling_points_json, detail_json, image, gallery_json, tags_json,
         status, sort_order, created_at)
       VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, 'self', ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
      [
        p.code, p.title, p.subtitle ?? '', p.category, p.spec, p.price, p.listPrice, p.stock, p.sales,
        p.doseMl ?? null, p.volumeMl ?? null,
        JSON.stringify(p.sellingPoints ?? []), JSON.stringify(p.detail ?? {}),
        p.image ?? '', JSON.stringify(p.gallery ?? []), JSON.stringify(p.tags ?? []),
        p.stock > 0 ? 'on' : 'presale', p.sortOrder ?? 0, now,
      ],
    );
  }
  log(`  ✔ 商品 ${products.length} 个`);

  /* ---------------- 溯源批次 + 一物一码 ---------------- */
  let unitCount = 0;
  for (const b of batches) {
    const productRow = await get('SELECT id FROM products WHERE code = ?', [b.productCode]);
    await run(
      `INSERT INTO batches
        (batch_no, product_code, origin, plot_no, farmer, harvest_date, press_date, press_workshop,
         press_tech, fill_date, factory, inspection_no, inspection_report, geo, created_at)
       VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
      [
        b.batchNo, b.productCode, b.origin, b.plotNo, b.farmer, b.harvestDate, b.pressDate,
        b.pressWorkshop, b.pressTech, b.fillDate, b.factory, b.inspectionNo, b.inspectionReport,
        JSON.stringify(b.geo), now,
      ],
    );

    // 哈希链：每个节点哈希 = H(前序哈希 | 节点内容)，形成不可篡改的存证链
    let prev = config.security.genesisHash;
    for (const ev of b.events) {
      const payload = {
        batchNo: b.batchNo, stage: ev.stage, happenedAt: ev.happenedAt,
        place: ev.place, operator: ev.operator, detail: ev.detail,
      };
      const hash = chainHash(prev, payload);
      await run(
        `INSERT INTO trace_events
          (batch_no, stage, stage_name, happened_at, place, operator, detail_json, image, hash, prev_hash, created_at)
         VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
        [
          b.batchNo, ev.stage, ev.stageName, ev.happenedAt, ev.place, ev.operator,
          JSON.stringify(ev.detail ?? {}), ev.image ?? '', hash, prev, now,
        ],
      );
      prev = hash;
    }
    // 记录本批次最终链尾哈希，供前端"链上存证哈希"展示
    await run('UPDATE batches SET inspection_report = ? WHERE batch_no = ?', [b.inspectionReport, b.batchNo]);

    const n = unitsPerBatch[b.batchNo] ?? 10;
    const harvest = new Date(`${b.harvestDate}T00:00:00Z`);
    for (let i = 0; i < n; i++) {
      const traceCode = newTraceCode(harvest, `${b.batchNo.replace(/\D/g, '').slice(-4)}${String(i + 1).padStart(4, '0')}${i}`);
      const sig = signTracePayload(tracePayload(traceCode, b.batchNo, b.inspectionNo));
      await run(
        `INSERT INTO trace_units
          (trace_code, batch_no, product_id, sign, chain_hash, status, scan_count, created_at)
         VALUES (?, ?, ?, ?, ?, 'in_stock', 0, ?)`,
        [traceCode, b.batchNo, productRow?.id ?? null, sig, prev, now],
      );
      unitCount += 1;
    }
    log(`  ✔ 溯源批次 ${b.batchNo}：${b.events.length} 个节点，${n} 个一物一码（链尾 ${prev.slice(0, 16)}…）`);
  }

  /* ---------------- 知识库 ---------------- */
  for (const c of kbCategories) {
    // 分类本身也作为一条兜底条目，保证任何相关提问都有答案
    await run(
      `INSERT INTO kb_entries (category, category_name, question, answer, keywords, cards_json, priority, updated_at)
       VALUES (?, ?, ?, ?, ?, ?, ?, ?)`,
      [c.key, c.name, c.name, c.strategy, c.name, '[]', 0, now],
    );
  }
  for (const e of kbEntries) {
    const cat = kbCategories.find((c) => c.key === e.category);
    await run(
      `INSERT INTO kb_entries (category, category_name, question, answer, keywords, cards_json, priority, updated_at)
       VALUES (?, ?, ?, ?, ?, ?, ?, ?)`,
      [
        e.category, cat?.name ?? e.category, e.question, e.answer,
        e.keywords.join(' '), JSON.stringify(e.cards ?? []), 10, now,
      ],
    );
  }
  // 词表：意图关键词 + 症状词 + 红旗词 + 情绪词，落库便于后台维护
  const terms = [];
  for (const [cat, words] of Object.entries(intentKeywords)) {
    for (const w of words) terms.push([w, `intent:${cat}`, 1]);
  }
  for (const r of symptomRules) {
    for (const p of r.patterns) terms.push([p, `symptom:${r.level}`, r.level === 'emergency' ? 3 : 2]);
  }
  const seen = new Set();
  for (const [term, category, weight] of terms) {
    const key = `${term}|${category}`;
    if (seen.has(key)) continue;
    seen.add(key);
    await run('INSERT INTO kb_terms (term, category, weight) VALUES (?, ?, ?)', [term, category, weight]);
  }
  log(`  ✔ 知识库 ${kbEntries.length} 条问答 + ${seen.size} 个词条`);

  /* ---------------- 演示账号 ---------------- */
  const demoUsers = [
    {
      phone: '13800000001', nickname: '茶芽芽主理人（管理员）', role: 'admin',
      password: hashPassword('chayaya2026'), tier: 'shouHu', paid: 128800,
    },
    {
      phone: '13800000002', nickname: '新手妈妈·小周', role: 'customer',
      password: hashPassword('123456'), tier: 'xinYa', paid: 0,
    },
    {
      phone: '13800000003', nickname: '成长会员·李小姐（月子中心）', role: 'customer',
      password: hashPassword('123456'), tier: 'chengZhang', paid: 19800,
    },
  ];
  for (const u of demoUsers) {
    await run(
      `INSERT INTO users (phone, openid, nickname, tier_code, total_paid, points, role, password_hash, created_at)
       VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)`,
      [u.phone, `demo_openid_${u.phone}`, u.nickname, u.tier, u.paid, Math.floor(u.paid / 100), u.role, u.password, now],
    );
  }
  const customer = await get('SELECT id FROM users WHERE phone = ?', ['13800000002']);
  await run(
    'INSERT INTO addresses (user_id, receiver, phone, province, city, district, detail, is_default) VALUES (?, ?, ?, ?, ?, ?, ?, 1)',
    [customer.id, '周女士', '13800000002', '广东省', '珠海市', '香洲区', '唐家湾镇金凤路 18 号北师大珠海校区', ],
  );

  /* ---------------- 优惠券 ---------------- */
  const coupons = [
    ['NEWUSER10', '新客首单立减 10 元', 1000, 2900, 'newuser', null],
    ['TIER5', '会员月度券 满 99 减 5', 500, 9900, 'tier_month', null],
    ['OFFLINE20', '线下体验专享 满 138 减 20', 2000, 13800, 'offline', null],
  ];
  for (const [code, title, amount, minAmount, source, expires] of coupons) {
    await run(
      'INSERT INTO coupons (code, title, amount, min_amount, source, expires_at) VALUES (?, ?, ?, ?, ?, ?)',
      [code, title, amount, minAmount, source, expires],
    );
  }
  const couponRows = await query('SELECT id FROM coupons');
  for (const c of couponRows) {
    await run('INSERT INTO user_coupons (user_id, coupon_id, status) VALUES (?, ?, ?)', [customer.id, c.id, 'unused']);
  }
  log(`  ✔ 演示账号 3 个（管理员 13800000001 / 验证码式登录密码见文档）+ 优惠券 ${coupons.length} 张`);

  /* ---------------- 一条已完成订单，便于演示溯源与会员升级 ---------------- */
  const oil100 = await get('SELECT * FROM products WHERE code = ?', ['CY-OIL-100']);
  const orderNo = 'CY202602180930001234';
  await run(
    `INSERT INTO orders
      (order_no, user_id, status, goods_amount, discount_amount, freight, pay_amount, address_json,
       source_platform, pay_channel, paid_at, shipped_at, logistics_json, created_at)
     VALUES (?, ?, 'done', ?, 0, 0, ?, ?, 'self', 'mock_wechat', ?, ?, ?, ?)`,
    [
      orderNo, customer.id, oil100.price, oil100.price,
      JSON.stringify({ receiver: '周女士', phone: '13800000002', province: '广东省', city: '珠海市', district: '香洲区', detail: '唐家湾镇金凤路 18 号北师大珠海校区' }),
      '2026-02-18T09:31:00+08:00', '2026-02-19T10:20:00+08:00',
      JSON.stringify([
        { time: '2026-02-19 10:20', text: '浒口村乡村物流节点已揽收' },
        { time: '2026-02-19 18:05', text: '到达郴州市分拨中心' },
        { time: '2026-02-20 09:12', text: '运输中，发往珠海市' },
        { time: '2026-02-21 11:40', text: '已签收，签收人：本人' },
      ]),
      '2026-02-18T09:30:00+08:00',
    ],
  );
  const orderRow = await get('SELECT id FROM orders WHERE order_no = ?', [orderNo]);
  await run(
    'INSERT INTO order_items (order_id, product_id, title, spec, price, qty, image, trace_codes_json) VALUES (?, ?, ?, ?, ?, 1, ?, ?)',
    [orderRow.id, oil100.id, oil100.title, oil100.spec, oil100.price, oil100.image, JSON.stringify([])],
  );
  await run('UPDATE users SET total_paid = total_paid + ? WHERE id = ?', [oil100.price, customer.id]);
  log(`  ✔ 演示订单 ${orderNo}（已签收，可在订单页查看物流轨迹）`);

  return {
    products: products.length,
    batches: batches.length,
    units: unitCount,
    kb: kbEntries.length,
  };
}

/** 允许直接执行：node src/db/seed.mjs */
const isMain = process.argv[1] && process.argv[1].replace(/\\/g, '/').endsWith('src/db/seed.mjs');
if (isMain) {
  await initDb();
  await initCache();
  const stat = await seedAll();
  console.log('\n数据库初始化完成：', stat);
  console.log(`数据库文件: ${config.db.sqliteFile}`);
  process.exit(0);
}

export default { seedAll };
