/**
 * AI 客服的"纯计算"部分（无数据库依赖，Node 与浏览器都能跑）
 *
 * 为什么单独抽出来：
 *  静态演示模式（GitHub Pages）里没有 Node 后端，但 AI 客服的意图识别、槽位抽取、
 *  症状分级、情绪分析这些逻辑本身是纯字符串运算，可以直接放到浏览器里跑；
 *  只有"知识库检索 / 会话落库 / 订单查询"需要数据访问，由调用方注入。
 *
 * 后端 services/ai.mjs 从这里导入，保证网页演示与实际运行的规则**完全一致**，
 * 不会出现"演示版和真版本答得不一样"。
 */
import {
  intentKeywords, symptomRules, medicalRedFlags, medicalDisclaimer,
  emotionKeywords, quickQuestions, kbCategories,
} from './knowledge-base.mjs';

/* ============================================================
 * 文本归一化与匹配
 * ============================================================ */
export const normalize = (s) => String(s ?? '')
  .toLowerCase()
  .replace(/[\s\u3000]+/g, '')
  .replace(/[，。！？；：、"'（）()【】\[\]…~～!?,.;:%]/g, '');

export function hitScore(text, words) {
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
 * 症状描述识别
 * 知识库里的症状词是"完整症状名"，但用户说话是口语化的、语序会变，
 * 例如"脖子褶皱处发红"匹配不到"褶皱红"。所以单独维护一份口语短语表。
 * ============================================================ */
export const SYMPTOM_PHRASES = [
  '红疹', '皮疹', '起疹', '疹子', '湿疹', '热疹', '痱子', '荨麻疹', '尿布疹', '口水疹',
  '红屁股', '红臀', '淹红', '淹脖子', '破皮', '破了', '抓破', '擦破', '渗液', '渗水',
  '流脓', '化脓', '脓点', '脓疱', '结痂', '脱屑', '起皮', '脱皮', '干燥', '干痒', '发痒',
  '痒', '抓挠', '红肿', '泛红', '发红', '红红的', '起红点', '小红点', '头垢', '乳痂',
  '头皮结痂', '发烧', '发热', '低烧', '高烧', '拉肚子', '腹泻', '便秘', '吐奶', '肠胀气',
  '肚子胀', '哭闹', '睡不好', '烦躁', '鼻塞', '咳嗽', '拒奶', '精神差',
  '屁股红', '脖子红', '脸上红', '脸红', '下巴红', '嘴角红', '腋下红', '大腿根红', '褶皱红', '褶皱发红',
];

export function isSymptomQuery(text) {
  const t = normalize(text);
  return SYMPTOM_PHRASES.some((p) => t.includes(normalize(p)));
}

export function symptomPhrases(text) {
  const t = normalize(text);
  return SYMPTOM_PHRASES.filter((p) => t.includes(normalize(p)));
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
  if (!ranked.length) return { intent: 'unknown', confidence: 0, hits: [], scores };
  const [intent, best] = ranked[0];
  return {
    intent,
    confidence: total > 0 ? Number((best.score / total).toFixed(3)) : 0,
    hits: best.hits,
    scores,
  };
}

/* ============================================================
 * 槽位抽取（多轮对话状态管理）
 * ============================================================ */
export function extractSlots(text) {
  const t = normalize(text);
  const slots = {};

  const monthMatch = t.match(/(\d{1,2})\s*(个月|月龄|月)/);
  const dayMatch = t.match(/(\d{1,3})\s*(天|日)/);
  const yearMatch = t.match(/(\d{1,2})\s*(岁|周岁)/);
  if (monthMatch) slots.babyMonths = Number(monthMatch[1]);
  else if (dayMatch) slots.babyMonths = Math.max(0, Math.round(Number(dayMatch[1]) / 30));
  else if (yearMatch) slots.babyMonths = Number(yearMatch[1]) * 12;

  const durMatch = t.match(/(\d{1,3})\s*(分钟|小时|天|周|个月)/);
  if (durMatch) slots.duration = `${durMatch[1]}${durMatch[2]}`;
  if (/刚起|刚刚|今天|昨天/.test(t)) slots.duration = slots.duration || '1天内';

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

  const parts = ['脸', '面', '额头', '下巴', '嘴角', '脖子', '颈', '腋下', '手臂', '手肘', '大腿', '腿窝', '屁股', '臀', '尿布区', '后背', '背', '肚子', '腹部', '头皮', '头顶', '耳朵', '全身'];
  const found = parts.filter((p) => t.includes(normalize(p)));
  if (found.length) slots.parts = found;

  return slots;
}

/* ============================================================
 * 槽位合并（多轮对话状态管理的关键细节）
 *
 * 问题：如果无条件把上一轮的槽位带进来，用户换话题时旧症状会"粘住"。
 *   例如先说"宝宝发烧"，再问"我的订单到哪了"，
 *   旧的红旗症状会被继承，导致订单问题被判成紧急症状 —— 这是真实踩过的坑。
 *
 * 规则：
 *   - 月龄 / 部位 / 时长属于稳定信息，可以跨轮继承；
 *   - 症状类槽位只有在**本轮仍在描述症状**时才保留，否则清空。
 * ============================================================ */
export function mergeSlots(prev = {}, next = {}) {
  const merged = { ...prev, ...next };
  const symptomRelated = ['symptoms', 'symptomPhrases', 'redFlags'];
  const stillSymptom = Boolean(next.symptoms?.length || next.symptomPhrases?.length);
  if (!stillSymptom) {
    for (const k of symptomRelated) delete merged[k];
  }
  return merged;
}
/* ============================================================
 * 症状安全分级
 *   ok 可用 / caution 谨慎 / avoid 患处禁用 / emergency 先就医
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

  // 只提到通用短语（"红""痒""干燥"）但没匹配到具体症状时，保守按"谨慎"处理
  const genericPhrases = slots.symptomPhrases ?? [];
  const hasGenericOnly = !matched.length && genericPhrases.length && level === 'ok';
  if (hasGenericOnly) level = 'caution';

  return { level, matched, rules, redFlags, genericPhrases, hasGenericOnly };
}

export const LEVEL_HEADLINE = {
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
 * 知识库检索（纯函数：传入条目数组即可，不依赖数据库）
 * ============================================================ */
export function searchKbEntries(text, intent, entries, { limit = 2 } = {}) {
  const t = normalize(text);
  const scored = entries.map((row) => {
    const words = String(row.keywords || '').split(/\s+/).filter(Boolean);
    const { score, hits } = hitScore(t, words);
    const sameIntent = row.category === intent ? 1.6 : 0;
    return { row, score: score + sameIntent, hits };
  }).sort((a, b) => b.score - a.score);
  return scored.slice(0, limit).filter((s) => s.score > 0);
}

/* ============================================================
 * 构造回复（不落库、不改状态，浏览器与后端共用）
 * data 需要提供：{ kbEntries, order: {orderNo, status, statusText, logistics}[], product: {...} }
 * ============================================================ */
export function buildRuleReply({ text, slots = {}, data = {} }) {
  const intentInfo = detectIntent(text);
  const newSlots = mergeSlots(slots, extractSlots(text));
  const triage = triageSymptoms(text, newSlots);
  const emotionInfo = analyzeEmotion(text);

  let intent = intentInfo.intent;
  if (triage.matched.length || triage.redFlags.length || isSymptomQuery(text)) intent = 'symptom';

  /* ---------- 1) 症状适用性（优先级最高） ---------- */
  if (intent === 'symptom') {
    const parts = [`**${LEVEL_HEADLINE[triage.level]}**`];
    if (triage.redFlags.length) {
      parts.push(`您提到的「${triage.redFlags.map((r) => r.reason).join('、')}」属于需要医生优先评估的情况。`);
      parts.push('请先带宝宝就医明确原因；**在医生给出诊断前，请不要在皮疹或不适部位涂抹任何护肤油**（油脂可能造成闷热、加重刺激，也容易掩盖病情变化）。');
    }
    for (const rule of triage.rules.slice(0, 3)) {
      parts.push(`【${rule.name}】${rule.advice}`);
    }
    if (!triage.rules.length) {
      parts.push('宝宝皮肤问题成因很多，仅凭文字很难判断。建议先观察皮肤是否完整（有没有破皮、渗液、脓点）与宝宝精神状态。');
      parts.push('**皮肤完整、只是干燥或轻微泛红**：可以先在小面积（如耳后或手腕内侧）涂抹试用 24 小时，无红肿刺痛再正常使用；**皮肤已经破损、渗液或有脓点**：请先就医，患处不要涂油。');
    }
    parts.push('日常护理要点：保持清洁干爽、减少摩擦与闷热、洗澡后 3 分钟内保湿效果最好；配方上我们的抚触油为 95% 高纯度冷榨山茶油、0 香精 0 防腐剂 0 矿物油，但**它属于护肤品，不是药品，不能替代医生的诊断与用药**。');

    const questions = [];
    if (newSlots.babyMonths === undefined) questions.push('宝宝现在几个月大？');
    if (!newSlots.parts?.length) questions.push('症状主要在什么部位（脸、脖子、屁股还是全身）？');
    if (!newSlots.duration) questions.push('大概持续几天了，有没有变多或加重？');
    if (triage.level === 'ok' && questions.length) {
      parts.push(`为了给您更准确的护理建议，还想确认一下：${questions.join(' ')}`);
    }
    parts.push(`\n_${medicalDisclaimer}_`);

    return finalizeReply({
      intent: 'symptom', intentInfo, answer: parts.join('\n\n'), slots: newSlots, triage, emotion: emotionInfo,
      cards: [
        { type: 'tutorial', title: '分月龄抚触与护理教程', desc: '不同月龄的手法与用量建议', url: '/#/guide' },
        { type: 'product', title: '婴儿山茶抚触油', desc: '95% 高纯度冷榨山茶油 · 通过皮肤刺激性测试', url: '/#/product/CY-OIL-100', image: '/assets/img/image18.png' },
      ],
    });
  }

  /* ---------- 2) 订单物流 ---------- */
  const t = normalize(text);
  if ((intent === 'order' || intentInfo.intent === 'order') && data.order
    && ['物流', '快递', '发货', '到哪', '订单', '运单'].some((w) => t.includes(normalize(w)))) {
    const o = data.order;
    const logistics = o.logistics ?? [];
    const body = [
      `您最近一笔订单 **${o.orderNo}** 当前状态：**${o.statusText}**，实付 ¥${(o.payAmount / 100).toFixed(2)}。`,
      logistics.length ? `最新物流：${logistics[logistics.length - 1].text}（${logistics[logistics.length - 1].time}）` : '该订单暂无物流轨迹（付款后我们会从浒口村乡村物流节点发货）。',
      '湖南省内一般次日达，华南地区 2-3 日达。如遇破损请在签收后 48 小时内拍照联系客服，我们承担运费并优先补发。',
    ];
    return finalizeReply({
      intent: 'order', intentInfo, answer: body.join('\n\n'), slots: newSlots, triage, emotion: emotionInfo,
      cards: [{ type: 'order', title: `订单 ${o.orderNo}`, desc: o.statusText, url: '/#/orders' }],
    });
  }

  /* ---------- 3) 知识库匹配 ---------- */
  const kbHits = searchKbEntries(text, intent, data.kbEntries ?? [], { limit: 2 });
  if (kbHits.length && kbHits[0].score >= 1.2) {
    const best = kbHits[0].row;
    let cards = [];
    try { cards = typeof best.cards === 'string' ? JSON.parse(best.cards || '[]') : (best.cards ?? []); } catch { cards = []; }
    if (!cards.length) cards = buildCards(best.category, text, newSlots);
    return finalizeReply({
      intent: best.category, intentInfo, answer: best.answer, slots: newSlots, triage, emotion: emotionInfo, cards,
    });
  }

  /* ---------- 4) 兜底 ---------- */
  const fallback = [
    '抱歉，这个问题我还没完全理解。您可以换个说法，或者从下面这些我比较擅长的方向问我：',
    '· **产品与安全**：0 添加吗？有检测报告吗？新生儿能用吗？',
    '· **功效原理**：山茶油为什么对宝宝皮肤好？和别的婴儿油有什么区别？',
    '· **使用与用量**：一次用多少？不同月龄怎么抚触？',
    '· **产地溯源**：油是从哪里来的？怎么扫码查真伪？',
    '· **订单售后**：订单到哪了？怎么退换货？',
    '',
    '如果宝宝有具体皮肤症状，可以直接描述（例如"宝宝 3 个月，脖子褶皱处发红两天了"），我会按护理要点帮您判断能不能用、怎么用。',
    `\n_${medicalDisclaimer}_`,
  ].join('\n');

  return finalizeReply({
    intent: intent === 'unknown' ? 'fallback' : intent,
    intentInfo, answer: fallback, slots: newSlots, triage, emotion: emotionInfo,
    cards: buildCards(intent, text, newSlots),
  });
}

export function buildCards(intent, text, slots) {
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
  if (intent === 'order') cards.push({ type: 'order', title: '我的订单', desc: '查看物流轨迹与溯源码', url: '/#/orders' });
  if (intent === 'efficacy' || t.includes('价格') || t.includes('多少钱') || t.includes('买')) {
    cards.push({ type: 'product', title: '婴儿山茶抚触油 100ml / 30ml', desc: '95% 高纯度冷榨山茶油 · 一瓶一码可溯源', url: '/#/product/CY-OIL-100', image: '/assets/img/image18.png' });
  }
  return cards;
}

function finalizeReply({ intent, intentInfo, answer, slots, triage, emotion, cards }) {
  const reasons = [];
  if (emotion.emotion === 'angry') reasons.push(`检测到负面情绪（关键词：${emotion.hits.slice(0, 3).join('、')}）`);
  if (triage.level === 'emergency') reasons.push('命中医疗安全红线，需人工跟进确认是否已就医');
  if (intent === 'fallback' && intentInfo.confidence < 0.32 && !intentInfo.hits.length) reasons.push('问题超出知识库范围');

  let text = answer;
  if (emotion.emotion === 'anxious') text = `别着急，我们一步步来看。\n\n${text}`;
  if (emotion.emotion === 'angry') text = `非常抱歉给您带来不好的体验，我已经把您的问题标记为优先处理。\n\n${text}`;

  return {
    intent,
    intentHits: intentInfo.hits,
    confidence: intentInfo.confidence,
    answer: text,
    cards,
    slots,
    triage: {
      level: triage.level,
      matched: triage.matched.map((m) => ({ name: m.name, level: m.level, pattern: m.pattern })),
      redFlags: triage.redFlags,
      disclaimer: medicalDisclaimer,
    },
    emotion: { label: emotion.emotion, score: emotion.score },
    handoff: { needed: reasons.length > 0, reasons, emotion: emotion.emotion, level: triage.level },
  };
}

export { kbCategories, quickQuestions, medicalDisclaimer };

export default {
  normalize, hitScore, detectIntent, extractSlots, triageSymptoms, analyzeEmotion,
  isSymptomQuery, symptomPhrases, searchKbEntries, buildRuleReply, buildCards,
  LEVEL_HEADLINE, SYMPTOM_PHRASES, quickQuestions, medicalDisclaimer, kbCategories,
};
