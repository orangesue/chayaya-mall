/**
 * AI 智能客服引擎（项目书 4.2.2 AI 智能客服系统）
 *
 * 实现项目书要求的四件事：
 *  1. NLP 意图识别：区分 产地环境 / 产品安全性 / 产品功能与功效 / 抚触科普与用量 / 订单物流
 *  2. 多轮对话状态管理：识别槽位（宝宝月龄、症状名、持续时间、症状部位），缺槽位时主动追问
 *  3. 五大类标准应答策略 + 卡片消息（检测报告、溯源入口、教程链接）
 *  4. 情感分析：识别愤怒/焦虑，自动携带情绪标签与上下文转人工
 *
 * 额外强化（用户核心诉求）：婴儿症状适用性判断
 *  - 症状分级：ok（可用）/ caution（谨慎，先就医）/ avoid（患处禁用）/ emergency（先就医）
 *  - 医疗安全红线：发热、化脓渗液、破溃、精神差、拒食、呼吸异常、皮疹大面积扩散 → 先建议就医
 *  - 每条症状类回答强制附带免责声明，绝不输出诊断结论或用药方案
 */
import { query, get, run } from '../db/index.mjs';
import { randomId } from '../utils/crypto.mjs';
import { nowIso } from '../utils/datetime.mjs';
import {
  intentKeywords, symptomRules, medicalRedFlags, medicalDisclaimer, emotionKeywords, handoffTriggers,
  quickQuestions, kbEntries, kbCategories,
} from '../data/knowledge-base.mjs';
import { polishAnswer, aiMode } from './llm.mjs';
import { getBatchOverview } from './trace.mjs';

/* ============================================================
 * 文本归一化与匹配
 * ============================================================ */
const normalize = (s) => String(s ?? '')
  .toLowerCase()
  .replace(/[\s\u3000]+/g, '')
  .replace(/[，。！？；：、"'（）()【】\[\]…~～!?,.;:%]/g, '');

function hitScore(text, words) {
  let score = 0;
  const hits = [];
  for (const w of words) {
    const key = normalize(w);
    if (!key) continue;
    if (text.includes(key)) {
      // 越长的关键词越具体，权重越高
      score += 1 + Math.min(2, key.length / 3);
      hits.push(w);
    }
  }
  return { score, hits };
}

/* ============================================================
 * 意图识别
 * ============================================================ */
export function detectIntent(text) {
  const t = normalize(text);
  const scores = {};
  for (const [intent, words] of Object.entries(intentKeywords)) {
    const { score, hits } = hitScore(t, words);
    if (score > 0) scores[intent] = { score, hits };
  }
  const ranked = Object.entries(scores).sort((a, b) => b[1].score - a[1].score);
  const total = ranked.reduce((s, [, v]) => s + v.score, 0);
  if (!ranked.length) {
    return { intent: 'unknown', confidence: 0, hits: [], scores };
  }
  const [intent, best] = ranked[0];
  return {
    intent,
    confidence: total > 0 ? Number((best.score / total).toFixed(3)) : 0,
    hits: best.hits,
    scores,
  };
}

/* ============================================================
 * 症状描述识别
 * 说明：知识库中的 intentKeywords.symptom 是"完整症状名"，用 include 匹配长词会漏掉
 * 口语化表达（例如"脖子褶皱处发红"匹配不到"褶皱红"）。因此这里单独维护一份
 * 更贴近真实提问的短词表，命中即判定用户正在描述宝宝的症状。
 * ============================================================ */
const SYMPTOM_PHRASES = [
  '红疹', '皮疹', '起疹', '疹子', '湿疹', '热疹', '痱子', '荨麻疹', '尿布疹', '口水疹',
  '红屁股', '红臀', '淹红', '淹脖子', '破皮', '破了', '抓破', '擦破', '渗液', '渗水',
  '流脓', '化脓', '脓点', '脓疱', '结痂', '脱屑', '起皮', '脱皮', '干燥', '干痒', '发痒',
  '痒', '抓挠', '红肿', '泛红', '发红', '红红的', '起红点', '小红点', '头垢', '乳痂',
  '头皮结痂', '发烧', '发热', '低烧', '高烧', '拉肚子', '腹泻', '便秘', '吐奶', '肠胀气',
  '肚子胀', '哭闹', '睡不好', '烦躁', '鼻塞', '咳嗽', '拒奶', '精神差',
  // 部位词：常与症状连用（"屁股红""脖子红"）
  '屁股红', '脖子红', '脸上红', '脸红', '下巴红', '嘴角红', '腋下红', '大腿根红', '褶皱红', '褶皱发红',
];

/** 用户是否在描述/咨询某种症状 */
export function isSymptomQuery(text) {
  const t = normalize(text);
  return SYMPTOM_PHRASES.some((p) => t.includes(normalize(p)));
}

/** 从症状词表中提取命中的短语（用于回答里"您提到的是…"） */
export function symptomPhrases(text) {
  const t = normalize(text);
  return SYMPTOM_PHRASES.filter((p) => t.includes(normalize(p)));
}

/* ============================================================
 * 槽位抽取（多轮对话状态管理）
 * ============================================================ */
export function extractSlots(text) {
  const t = normalize(text);
  const slots = {};

  // 月龄 / 年龄
  const monthMatch = t.match(/(\d{1,2})\s*(个月|月龄|月)/);
  const dayMatch = t.match(/(\d{1,3})\s*(天|日)/);
  const yearMatch = t.match(/(\d{1,2})\s*(岁|周岁)/);
  if (monthMatch) slots.babyMonths = Number(monthMatch[1]);
  else if (dayMatch) slots.babyMonths = Math.max(0, Math.round(Number(dayMatch[1]) / 30));
  else if (yearMatch) slots.babyMonths = Number(yearMatch[1]) * 12;

  // 持续时间
  const durMatch = t.match(/(\d{1,3})\s*(分钟|小时|天|周|个月)/);
  if (durMatch) slots.duration = `${durMatch[1]}${durMatch[2]}`;
  if (/刚起|刚刚|今天|昨天/.test(t)) slots.duration = slots.duration || '1天内';

  // 症状
  const symptoms = [];
  for (const rule of symptomRules) {
    for (const p of [...rule.patterns, ...(rule.keywords ?? [])]) {
      if (t.includes(normalize(p))) {
        symptoms.push({ name: rule.name, pattern: p, level: rule.level });
        break;
      }
    }
  }
  if (symptoms.length) slots.symptoms = symptoms;
  const phrases = symptomPhrases(text);
  if (phrases.length) slots.symptomPhrases = phrases;

  // 部位
  const parts = ['脸', '面', '额头', '下巴', '嘴角', '脖子', '颈', '腋下', '手臂', '手肘', '大腿', '腿窝', '屁股', '臀', '尿布区', '后背', '背', '肚子', '腹部', '头皮', '头顶', '耳朵', '全身'];
  const found = parts.filter((p) => t.includes(normalize(p)));
  if (found.length) slots.parts = found;

  return slots;
}

/* ============================================================
 * 症状安全分级
 * ============================================================ */
export function triageSymptoms(text, slots = {}) {
  const t = normalize(text);
  const redFlags = [];
  for (const rf of medicalRedFlags) {
    if (t.includes(normalize(rf.pattern))) redFlags.push(rf);
  }

  const matched = slots.symptoms ?? [];
  let level = 'ok';
  const order = { ok: 0, caution: 1, avoid: 2, emergency: 3 };
  for (const s of matched) {
    if (order[s.level] > order[level]) level = s.level;
  }
  if (redFlags.length) level = 'emergency';

  const rules = matched
    .map((s) => symptomRules.find((r) => r.name === s.name))
    .filter(Boolean);

  // 只提到通用的"红/痒/干燥"等短语、但没匹配到具体症状条目时，
  // 按"谨慎"处理（提示先小面积试用并观察），保守优先。
  const genericPhrases = slots.symptomPhrases ?? [];
  const hasGenericOnly = !matched.length && genericPhrases.length && level === 'ok';
  if (hasGenericOnly) level = 'caution';

  return { level, matched, rules, redFlags, genericPhrases, hasGenericOnly };
}

const LEVEL_HEADLINE = {
  emergency: '⚠️ 这种情况请先带宝宝就医',
  avoid: '⚠️ 患处暂时不要涂油',
  caution: '需要谨慎使用，建议先咨询医生',
  ok: '可以按日常护理方式使用',
};

/* ============================================================
 * 情绪分析
 * ============================================================ */
export function analyzeEmotion(text) {
  const t = normalize(text);
  const angry = hitScore(t, emotionKeywords.angry);
  const anxious = hitScore(t, emotionKeywords.anxious);
  const positive = hitScore(t, emotionKeywords.positive);
  const exclaim = (String(text).match(/[!！]{2,}|[?？]{2,}/g) || []).length;

  let emotion = 'neutral';
  let score = 0;
  if (angry.score > 0) { emotion = 'angry'; score = angry.score + exclaim; }
  else if (anxious.score > 0) { emotion = 'anxious'; score = anxious.score; }
  else if (positive.score > 0) { emotion = 'positive'; score = positive.score; }

  return { emotion, score, hits: [...angry.hits, ...anxious.hits, ...positive.hits], exclaim };
}

/* ============================================================
 * 知识库检索
 * ============================================================ */
async function searchKb(text, intent, { limit = 1 } = {}) {
  const t = normalize(text);
  const rows = await query('SELECT * FROM kb_entries WHERE priority > 0');
  const pool = rows.length ? rows : kbEntries.map((e) => ({ ...e, keywords: e.keywords.join(' '), cards_json: JSON.stringify(e.cards ?? []), category_name: kbCategories.find((c) => c.key === e.category)?.name }));
  const scored = pool.map((row) => {
    const words = String(row.keywords || '').split(/\s+/).filter(Boolean);
    const { score, hits } = hitScore(t, words);
    const sameIntent = row.category === intent ? 1.6 : 0;
    return { row, score: score + sameIntent, hits };
  }).sort((a, b) => b.score - a.score);
  return scored.slice(0, limit).filter((s) => s.score > 0);
}

/* ============================================================
 * 卡片消息构建
 * ============================================================ */
async function buildCards(intent, text, slots) {
  const cards = [];
  const t = normalize(text);
  if (intent === 'origin' || t.includes('溯源') || t.includes('产地')) {
    cards.push({ type: 'trace', title: '一物一码 · 全流程溯源', desc: '查看本瓶对应的山茶林地块、农户与检测报告', url: '/#/trace', image: '/assets/img/image7.png' });
  }
  if (intent === 'safety' || t.includes('检测') || t.includes('安全')) {
    cards.push({ type: 'report', title: 'SGS-2026-0115 检测报告', desc: '菌落总数、重金属、苯并芘、皮肤刺激性等项目符合《化妆品安全技术规范》', url: '/assets/reports/SGS-2026-0115.html' });
  }
  if (intent === 'massage' || t.includes('抚触') || t.includes('用量')) {
    cards.push({ type: 'tutorial', title: '分月龄抚触教程', desc: slots.babyMonths ? `${slots.babyMonths} 个月宝宝对应手法` : '0-3 月 / 4-6 月 / 6 月以上三套手法', url: '/#/guide' });
  }
  if (intent === 'order') {
    cards.push({ type: 'order', title: '我的订单', desc: '查看物流轨迹与溯源码', url: '/#/orders' });
  }
  if (intent === 'efficacy' || t.includes('价格') || t.includes('多少钱') || t.includes('买')) {
    cards.push({ type: 'product', title: '婴儿山茶抚触油 100ml / 30ml', desc: '95% 高纯度冷榨山茶油 · 一瓶一码可溯源', url: '/#/product/CY-OIL-100', image: '/assets/img/image18.png' });
  }
  return cards;
}

/* ============================================================
 * 主流程：生成回复
 * ============================================================ */
export async function generateReply({ text, sessionId, history = [], slots = {}, user = null, orderHint = null }) {
  const messageId = randomId(8);
  const intentInfo = detectIntent(text);
  const newSlots = { ...slots, ...extractSlots(text) };
  const triage = triageSymptoms(text, newSlots);
  const emotionInfo = analyzeEmotion(text);

  // 明确要求人工
  const wantsHuman = handoffTriggers.requireHumanWords.some((w) => normalize(text).includes(normalize(w)));

  let intent = intentInfo.intent;
  if (triage.matched.length || triage.redFlags.length || isSymptomQuery(text)) intent = 'symptom';

  /* ---------- 1) 症状适用性（优先级最高） ---------- */
  if (intent === 'symptom') {
    const parts = [];
    // 前置安全提示
    parts.push(`**${LEVEL_HEADLINE[triage.level]}**`);
    if (triage.redFlags.length) {
      parts.push(`您提到的「${triage.redFlags.map((r) => r.reason).join('、')}」属于需要医生优先评估的情况。`);
      parts.push('请先带宝宝就医明确原因；**在医生给出诊断前，请不要在皮疹或不适部位涂抹任何护肤油**（油脂可能造成闷热、加重刺激，也容易掩盖病情变化）。');
    }
    // 针对性的分级建议
    for (const rule of triage.rules.slice(0, 3)) {
      parts.push(`【${rule.name}】${rule.advice}`);
    }
    if (!triage.rules.length) {
      parts.push('宝宝皮肤问题成因很多，仅凭文字很难判断。建议先观察皮肤是否完整（有没有破皮、渗液、脓点）与宝宝精神状态。');
      parts.push('**皮肤完整、只是干燥或轻微泛红**：可以先在小面积（如耳后或手腕内侧）涂抹试用 24 小时，无红肿刺痛再正常使用；**皮肤已经破损、渗液或有脓点**：请先就医，患处不要涂油。');
    }
    // 通用护理要点
    parts.push('日常护理要点：保持清洁干爽、减少摩擦与闷热、洗澡后 3 分钟内保湿效果最好；配方上我们的抚触油为 95% 高纯度冷榨山茶油、0 香精 0 防腐剂 0 矿物油，但**它属于护肤品，不是药品，不能替代医生的诊断与用药**。');
    // 缺槽位追问（多轮对话）
    const questions = [];
    if (newSlots.babyMonths === undefined) questions.push('宝宝现在几个月大？');
    if (!newSlots.parts?.length) questions.push('症状主要在什么部位（脸、脖子、屁股还是全身）？');
    if (!newSlots.duration) questions.push('大概持续几天了，有没有变多或加重？');
    if (triage.level === 'ok' && questions.length) {
      parts.push(`为了给您更准确的护理建议，还想确认一下：${questions.join(' ')}`);
    }
    parts.push(`\n_${medicalDisclaimer}_`);

    return finalize({
      intent: 'symptom',
      intentInfo,
      text: parts.join('\n\n'),
      slots: newSlots,
      triage,
      emotion: emotionInfo,
      cards: [
        { type: 'tutorial', title: '分月龄抚触与护理教程', desc: '不同月龄的手法与用量建议', url: '/#/guide' },
        { type: 'product', title: '婴儿山茶抚触油', desc: '95% 高纯度冷榨山茶油 · 通过皮肤刺激性测试', url: '/#/product/CY-OIL-100', image: '/assets/img/image18.png' },
      ],
      user,
      sessionId,
      messageId,
      wantsHuman,
      history,
      text_input: text,
    });
  }

  /* ---------- 2) 订单物流（可查真实订单） ---------- */
  if (intent === 'order' || wantsHuman) {
    const t = normalize(text);
    const isLogistics = ['物流', '快递', '发货', '到哪', '订单', '运单'].some((w) => t.includes(normalize(w)));
    if (isLogistics && user) {
      const rows = await query(
        `SELECT o.order_no, o.status, o.logistics_json, o.pay_amount, o.created_at
           FROM orders o WHERE o.user_id = ? ORDER BY o.id DESC LIMIT 1`,
        [user.id],
      );
      if (rows.length) {
        const o = rows[0];
        const statusText = { pending_pay: '待付款', paid: '待发货', shipped: '待收货', done: '已完成', closed: '已关闭', refunding: '售后中' }[o.status] ?? o.status;
        const logistics = (() => { try { return JSON.parse(o.logistics_json || '[]'); } catch { return []; } })();
        const body = [
          `您最近一笔订单 **${o.order_no}** 当前状态：**${statusText}**，实付 ¥${(o.pay_amount / 100).toFixed(2)}。`,
          logistics.length ? `最新物流：${logistics[logistics.length - 1].text}（${logistics[logistics.length - 1].time}）` : '该订单暂无物流轨迹（付款后我们会从浒口村乡村物流节点发货）。',
          '湖南省内一般次日达，华南地区 2-3 日达。如遇破损请在签收后 48 小时内拍照联系客服，我们承担运费并优先补发。',
        ];
        return finalize({
          intent: 'order', intentInfo, text: body.join('\n\n'), slots: newSlots, triage, emotion: emotionInfo,
          cards: [
            { type: 'order', title: `订单 ${o.order_no}`, desc: statusText, url: '/#/orders' },
          ],
          user, sessionId, messageId, wantsHuman, history, text_input: text,
        });
      }
    }
  }

  /* ---------- 3) 知识库匹配 ---------- */
  const kbHits = await searchKb(text, intent, { limit: 2 });
  if (kbHits.length && kbHits[0].score >= 1.2) {
    const best = kbHits[0].row;
    let cards = [];
    try { cards = JSON.parse(best.cards_json || '[]'); } catch { cards = []; }
    if (!cards.length) cards = await buildCards(best.category, text, newSlots);
    return finalize({
      intent: best.category,
      intentInfo,
      text: best.answer,
      slots: newSlots,
      triage,
      emotion: emotionInfo,
      cards,
      user,
      sessionId,
      messageId,
      wantsHuman,
      history,
      text_input: text,
    });
  }

  /* ---------- 4) 兜底：引导 + 推荐提问 ---------- */
  const categoryNames = kbCategories.map((c) => c.name).join(' / ');
  const fallback = [
    '抱歉，这个问题我还没完全理解。您可以换个说法，或者从下面这些我比较擅长的方向问我：',
    `· **产品与安全**：0 添加吗？有检测报告吗？新生儿能用吗？`,
    `· **功效原理**：山茶油为什么对宝宝皮肤好？和别的婴儿油有什么区别？`,
    `· **使用与用量**：一次用多少？不同月龄怎么抚触？`,
    `· **产地溯源**：油是从哪里来的？怎么扫码查真伪？`,
    `· **订单售后**：订单到哪了？怎么退换货？`,
    '',
    `如果宝宝有具体皮肤症状，可以直接描述（例如"宝宝 3 个月，脖子褶皱处发红两天了"），我会按护理要点帮您判断能不能用、怎么用。`,
    `\n_${medicalDisclaimer}_`,
  ].join('\n');

  return finalize({
    intent: intent === 'unknown' ? 'fallback' : intent,
    intentInfo,
    text: fallback,
    slots: newSlots,
    triage,
    emotion: emotionInfo,
    cards: await buildCards(intent, text, newSlots),
    user,
    sessionId,
    messageId,
    wantsHuman,
    history,
    text_input: text,
    categoryNames,
  });
}

/** 统一收尾：情绪/置信度判断是否转人工 + 大模型润色（不影响安全内容） */
async function finalize({
  intent, intentInfo, text, slots, triage, emotion, cards, user, sessionId, messageId, wantsHuman, history, text_input,
}) {
  const reasons = [];
  if (wantsHuman) reasons.push('用户主动要求人工客服');
  if (emotion.emotion === 'angry') reasons.push(`检测到负面情绪（关键词：${emotion.hits.slice(0, 3).join('、')}）`);
  if (triage.level === 'emergency') reasons.push('命中医疗安全红线，需人工跟进确认是否已就医');
  if (intent === 'fallback' && intentInfo.confidence < handoffTriggers.lowConfidence && !intentInfo.hits.length) {
    reasons.push('问题超出知识库范围');
  }

  let answer = text;
  // 情绪焦虑时加一句安抚
  if (emotion.emotion === 'anxious') {
    answer = `别着急，我们一步步来看。\n\n${answer}`;
  }
  if (emotion.emotion === 'angry') {
    answer = `非常抱歉给您带来不好的体验，我已经把您的问题标记为优先处理。\n\n${answer}`;
  }

  // 大模型润色（可选，失败自动回退）
  let polished = false;
  let mode = aiMode();
  if (triage.level !== 'emergency') {
    const r = await polishAnswer({
      question: text_input,
      standardAnswer: answer,
      history,
      extra: '必须保留所有安全提示与免责声明',
    });
    if (r.polished) { answer = r.text; polished = true; mode = r.mode; }
  }

  const handoff = {
    needed: reasons.length > 0,
    reasons,
    emotion: emotion.emotion,
    emotionScore: emotion.score,
    level: triage.level,
  };

  return {
    messageId,
    intent,
    intentHits: intentInfo.hits,
    confidence: intentInfo.confidence,
    answer,
    cards,
    slots,
    triage: {
      level: triage.level,
      matched: triage.matched.map((m) => ({ name: m.name, level: m.level, pattern: m.pattern })),
      redFlags: triage.redFlags,
      disclaimer: medicalDisclaimer,
    },
    emotion: { label: emotion.emotion, score: emotion.score },
    handoff,
    engine: { mode, polished },
    sessionId,
  };
}

/* ============================================================
 * 会话管理
 * ============================================================ */
export async function ensureConversation(sessionId, user) {
  let sid = sessionId;
  if (!sid) sid = `s_${randomId(10)}`;
  let conv = await get('SELECT * FROM conversations WHERE session_id = ?', [sid]);
  if (!conv) {
    const now = nowIso();
    await run(
      'INSERT INTO conversations (user_id, session_id, status, emotion, created_at, updated_at) VALUES (?, ?, ?, ?, ?, ?)',
      [user?.id ?? null, sid, 'ai', 'neutral', now, now],
    );
    conv = await get('SELECT * FROM conversations WHERE session_id = ?', [sid]);
  }
  return conv;
}

export async function saveMessage({ sessionId, role, content, intent, emotion, cards, safety }) {
  await run(
    `INSERT INTO messages (session_id, role, content, intent, emotion, cards_json, safety_json, created_at)
     VALUES (?, ?, ?, ?, ?, ?, ?, ?)`,
    [
      sessionId, role, content, intent ?? null, emotion ?? null,
      JSON.stringify(cards ?? []), safety ? JSON.stringify(safety) : null, nowIso(),
    ],
  );
}

export async function getHistory(sessionId, limit = 20) {
  const rows = await query(
    'SELECT role, content, intent, emotion, cards_json, created_at FROM messages WHERE session_id = ? ORDER BY id DESC LIMIT ?',
    [sessionId, limit],
  );
  return rows.reverse().map((r) => ({
    role: r.role,
    content: r.content,
    intent: r.intent,
    emotion: r.emotion,
    cards: (() => { try { return JSON.parse(r.cards_json || '[]'); } catch { return []; } })(),
    createdAt: r.created_at,
  }));
}

/** 客服主入口：一次问答 */
export async function handleChat({ sessionId, text, user, historyOverride }) {
  const conv = await ensureConversation(sessionId, user);
  const history = historyOverride ?? await getHistory(conv.session_id, 10);
  await saveMessage({ sessionId: conv.session_id, role: 'user', content: text });

  // 会话状态：从最近一条 assistant 消息的 safety_json 中恢复槽位
  let slots = {};
  const lastState = await get(
    "SELECT safety_json FROM messages WHERE session_id = ? AND role = 'assistant' AND safety_json IS NOT NULL ORDER BY id DESC LIMIT 1",
    [conv.session_id],
  );
  if (lastState?.safety_json) {
    try { slots = JSON.parse(lastState.safety_json).slots ?? {}; } catch { slots = {}; }
  }

  const reply = await generateReply({
    text,
    sessionId: conv.session_id,
    history: history.map((h) => ({ role: h.role, content: h.content })),
    slots,
    user,
  });

  await saveMessage({
    sessionId: conv.session_id,
    role: 'assistant',
    content: reply.answer,
    intent: reply.intent,
    emotion: reply.emotion.label,
    cards: reply.cards,
    safety: { level: reply.triage.level, redFlags: reply.triage.redFlags, slots: reply.slots, handoff: reply.handoff },
  });

  const status = reply.handoff.needed ? 'human' : conv.status;
  await run(
    'UPDATE conversations SET status = ?, emotion = ?, intent = ?, handoff_reason = ?, updated_at = ? WHERE session_id = ?',
    [status, reply.emotion.label, reply.intent, reply.handoff.reasons.join('；'), nowIso(), conv.session_id],
  );

  if (reply.handoff.needed) {
    await run(
      'INSERT INTO events (user_id, session_id, type, target, payload_json, created_at) VALUES (?, ?, ?, ?, ?, ?)',
      [user?.id ?? null, conv.session_id, 'ai_handoff', reply.intent, JSON.stringify(reply.handoff), nowIso()],
    );
  }

  return {
    sessionId: conv.session_id,
    reply: {
      messageId: reply.messageId,
      answer: reply.answer,
      intent: reply.intent,
      confidence: reply.confidence,
      cards: reply.cards,
      triage: reply.triage,
      emotion: reply.emotion,
      handoff: reply.handoff,
      engine: reply.engine,
    },
    conversation: { sessionId: conv.session_id, status, emotion: reply.emotion.label },
  };
}

/** 转人工 */
export async function requestHuman(sessionId, reason) {
  const conv = await get('SELECT * FROM conversations WHERE session_id = ?', [sessionId]);
  if (!conv) throw new Error('会话不存在');
  await run(
    'UPDATE conversations SET status = ?, handoff_reason = ?, updated_at = ? WHERE session_id = ?',
    ['human', reason || conv.handoff_reason || '用户主动请求人工', nowIso(), sessionId],
  );
  await saveMessage({
    sessionId,
    role: 'system',
    content: '已为您转接人工客服（客服工作时间 9:00-21:00）。您也可以先留下手机号，我们会尽快回电。',
  });
  return { sessionId, status: 'human' };
}

export async function listConversations({ status, page = 1, size = 20 } = {}) {
  const cond = status && status !== 'all' ? 'WHERE c.status = ?' : '';
  const args = status && status !== 'all' ? [status] : [];
  const totalRow = await get(`SELECT COUNT(*) AS n FROM conversations c ${cond}`, args);
  const rows = await query(
    `SELECT c.*, u.nickname FROM conversations c LEFT JOIN users u ON u.id = c.user_id ${cond} ORDER BY c.updated_at DESC LIMIT ? OFFSET ?`,
    [...args, size, (page - 1) * size],
  );
  return { list: rows, total: Number(totalRow?.n ?? 0), page, size };
}

/** 客服回复（人工） */
export async function agentReply(sessionId, content) {
  await saveMessage({ sessionId, role: 'agent', content });
  await run('UPDATE conversations SET updated_at = ? WHERE session_id = ?', [nowIso(), sessionId]);
  return { sessionId, sent: true };
}

/** 高频问题统计（对应项目书 5.1.5 数据维护：分析用户行为与客服响应） */
export async function hotQuestions(limit = 6) {
  const rows = await query(
    `SELECT intent, COUNT(*) AS n FROM messages WHERE role = 'user' AND intent IS NULL GROUP BY intent`,
  );
  void rows;
  const intents = await query(
    `SELECT intent, COUNT(*) AS n FROM messages WHERE role = 'assistant' AND intent IS NOT NULL GROUP BY intent ORDER BY n DESC LIMIT ?`,
    [limit],
  );
  const mapping = Object.fromEntries(kbCategories.map((c) => [c.key, c.name]));
  return {
    quick: quickQuestions,
    hot: intents.map((r) => ({ intent: r.intent, name: mapping[r.intent] ?? r.intent, count: Number(r.n) })),
    aiMode: aiMode(),
  };
}

export default {
  detectIntent, extractSlots, triageSymptoms, analyzeEmotion, generateReply,
  handleChat, requestHuman, agentReply, getHistory, listConversations, hotQuestions, ensureConversation,
};
