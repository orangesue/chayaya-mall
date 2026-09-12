/**
 * 开发/演示辅助路由（生产环境自动禁用，仅 NODE_ENV != production 时注册）
 *  - /api/dev/qr-selftest   二维码渲染器与签名自检结果
 *  - /api/dev/trace-lab     溯源实验室：一键跑完扫码 → 验签 → 哈希链校验
 *  - /api/dev/ai-lab        AI 客服实验室：批量跑意图识别与医疗红线用例
 */
import config from '../config.mjs';
import { ok } from '../http/respond.mjs';
import { get, query } from '../db/index.mjs';
import { qrEncoderName } from '../utils/qrcode.mjs';
import { buildTraceQr, lookupTrace, verifyChain } from '../services/trace.mjs';
// 纯规则函数来自 data/ai-rules.mjs（与静态演示模式共用同一份实现）
import { detectIntent, extractSlots, triageSymptoms, analyzeEmotion, isSymptomQuery } from '../data/ai-rules.mjs';
import { aiMode } from '../services/llm.mjs';
import { publicKeyPem } from '../utils/crypto.mjs';

/** AI 红线与意图回归用例（与 AI 客服引擎的真实实现共用同一套规则） */
const AI_CASES = [
  { text: '宝宝脸上起红疹，能用这个油吗？', expectIntent: 'symptom', expectLevel: 'caution' },
  { text: '宝宝3个月，脖子褶皱处发红两天了能用吗', expectIntent: 'symptom', expectLevel: 'caution' },
  { text: '宝宝发烧了，身上还有疹子，能涂吗', expectIntent: 'symptom', expectLevel: 'emergency' },
  { text: '屁股破皮渗水了还能用吗', expectIntent: 'symptom', expectLevel: 'avoid' },
  { text: '头皮上有头垢怎么清理', expectIntent: 'symptom', expectLevel: 'ok' },
  { text: '一次用多少油？怎么给宝宝抚触', expectIntent: 'massage' },
  { text: '产品有检测报告吗？安全吗', expectIntent: 'safety' },
  { text: '山茶油是哪里来的？能溯源吗', expectIntent: 'origin' },
  { text: '我的订单到哪了', expectIntent: 'order' },
  { text: '你们这个太慢了，我要投诉', expectEmotion: 'angry' },
];

export function registerDevRoutes(route) {
  if (config.isProd) return;

  route('GET', '/api/dev/qr-selftest', async () => {
    const unit = await get("SELECT trace_code, batch_no FROM trace_units WHERE batch_no = 'CHY-20260115-01' ORDER BY id ASC LIMIT 1");
    const built = unit ? await buildTraceQr(unit.trace_code, { size: 240 }) : null;
    const verified = await get("SELECT COUNT(*) AS n FROM trace_units");
    return ok({
      encoder: qrEncoderName,
      ecl: config.trace.qrEcl,
      sample: built ? { traceCode: built.traceCode, url: built.url, signature: built.signature } : null,
      totalUnits: Number(verified?.n ?? 0),
      signatureAlgorithm: 'ECDSA / secp256k1',
      signaturePublicKey: publicKeyPem(),
      note: '运行 npm run qr:check 可用独立解码器 jsQR 回读校验二维码内容',
    });
  });

  /** 溯源实验：扫码 → 验签 → 时间轴 → 哈希链完整性 */
  route('POST', '/api/dev/trace-lab', async ({ body }) => {
    const code = body.traceCode
      || (await get("SELECT trace_code FROM trace_units WHERE batch_no = 'CHY-20260115-01' ORDER BY id ASC LIMIT 1"))?.trace_code;
    const qr = await buildTraceQr(code);
    const token = new URL(qr.url).hash.split('t=')[1];
    const first = await lookupTrace({ traceCode: null, token, ip: '127.0.0.1', ua: 'dev-lab' });
    const second = await lookupTrace({ traceCode: null, token, ip: '127.0.0.1', ua: 'dev-lab' });
    const tampered = `${token.slice(0, -6)}AAAAAA`;
    const fake = await lookupTrace({ traceCode: null, token: tampered, ip: '127.0.0.1', ua: 'dev-lab' });
    const unknown = await lookupTrace({ traceCode: body.unknownCode || 'CY999999ZZZZZZZZ', ip: '127.0.0.1', ua: 'dev-lab' });
    const chain = await verifyChain(first.batchNo);
    const eventCount = await get('SELECT COUNT(*) AS n FROM trace_events WHERE batch_no = ?', [first.batchNo]);
    return ok({
      steps: [
        { step: '1. 生成一物一码并签名', code, algorithm: 'ECDSA / secp256k1', ok: true },
        { step: '2. 扫码读取并校验签名', ok: first.authentic === true, scanCount: first.scan.count, tip: first.scan.tip },
        { step: '3. 重复扫码防伪提示', ok: second.scan.count === first.scan.count + 1, tip: second.scan.tip },
        { step: '4. 篡改 token 后校验', ok: fake.authentic === false, reason: fake.reason, message: fake.message },
        { step: '5. 不存在的溯源码', ok: unknown.authentic === false, reason: unknown.reason },
        { step: '6. 哈希链完整性校验', ok: chain.intact === true, nodeCount: chain.nodeCount, head: chain.chainHead?.slice(0, 24) + '…' },
      ],
      timelineStages: first.timeline.map((t) => `${t.icon} ${t.stageName}（${t.happenedAt} · ${t.operator}）`),
      eventCount: Number(eventCount?.n ?? 0),
      disclaimer: '以上均为系统真实执行结果，非预置文案。',
    });
  });

  /** AI 实验：跑一遍意图识别 + 医疗红线分级 + 情绪识别 */
  route('POST', '/api/dev/ai-lab', async () => {
    const results = AI_CASES.map((c) => {
      const slots = extractSlots(c.text);
      const intent = detectIntent(c.text);
      const triage = triageSymptoms(c.text, slots);
      const emotion = analyzeEmotion(c.text);
      // 与 generateReply 内部一致的意图判定：命中症状规则或症状词即归入 symptom
      const effectiveIntent = (triage.matched.length || triage.redFlags.length || isSymptomQuery(c.text))
        ? 'symptom'
        : intent.intent;
      const passIntent = c.expectIntent ? effectiveIntent === c.expectIntent : true;
      const passLevel = c.expectLevel ? triage.level === c.expectLevel : true;
      const passEmotion = c.expectEmotion ? emotion.emotion === c.expectEmotion : true;
      return {
        text: c.text,
        intent: effectiveIntent,
        rawIntent: intent.intent,
        confidence: intent.confidence,
        hits: intent.hits,
        slots,
        level: triage.level,
        redFlags: triage.redFlags.map((r) => r.reason),
        emotion: emotion.emotion,
        expect: { intent: c.expectIntent, level: c.expectLevel, emotion: c.expectEmotion },
        pass: passIntent && passLevel && passEmotion,
      };
    });
    const passed = results.filter((r) => r.pass).length;
    const handoffs = await query("SELECT session_id, emotion, handoff_reason FROM conversations WHERE status = 'human' ORDER BY id DESC LIMIT 5");
    return ok({
      engine: aiMode(),
      total: results.length,
      passed,
      failed: results.filter((r) => !r.pass),
      results,
      recentHandoffs: handoffs,
      medicalDisclaimer: '规则引擎负责医疗安全判断，大模型仅用于话术润色，不参与症状适用性结论。',
    });
  });

  /** 环境自检：驱动、缓存、关键能力开关 */
  route('GET', '/api/dev/env', async () => {
    const { dialect } = await import('../db/index.mjs');
    const { getCache } = await import('../db/cache.mjs');
    const counts = {};
    for (const t of ['products', 'batches', 'trace_units', 'trace_events', 'kb_entries', 'orders', 'users']) {
      const row = await get(`SELECT COUNT(*) AS n FROM ${t}`);
      counts[t] = Number(row?.n ?? 0);
    }
    return ok({
      env: config.isProd ? 'production' : 'development',
      db: dialect(),
      cache: getCache().driver,
      qr: qrEncoderName,
      ai: aiMode(),
      wxLoginConfigured: Boolean(process.env.WX_APPID && process.env.WX_SECRET),
      wechatPayConfigured: Boolean(process.env.WXPAY_MCHID),
      counts,
      node: process.version,
    });
  });
}

export default { registerDevRoutes };
