/** AI 客服路由 */
import { ok, badRequest } from '../http/respond.mjs';
import { requireFields } from '../http/body.mjs';
import { currentUser, requireUser, requireAdmin } from '../http/auth.mjs';
import {
  handleChat, requestHuman, getHistory, hotQuestions, listConversations, agentReply,
} from '../services/ai.mjs';
import { qrEncoderName } from '../utils/qrcode.mjs';
import { aiMode } from '../services/llm.mjs';

export function registerAiRoutes(route) {
  /** 客服页初始化：快捷提问、热门问题、引擎信息 */
  route('GET', '/api/ai/bootstrap', async ({ req, url }) => {
    const user = await currentUser(req, url);
    const hot = await hotQuestions();
    return ok({
      ...hot,
      greeting: '你好呀，我是你的专属芽芽～宝宝的皮肤、抚触、产品安全、订单物流问题都可以问我。如果宝宝有具体症状，直接描述（比如"宝宝 3 个月，脖子褶皱发红两天"），我会帮你判断能不能用、怎么用。',
      disclaimer: '我不是医生，涉及诊断与用药请以医生意见为准；出现发热、化脓、破溃等情况请先就医。',
      user: user ? { id: user.id, nickname: user.nickname } : null,
      engine: aiMode(),
      qrEncoder: qrEncoderName,
    });
  });

  /** 主对话接口（多轮） */
  route('POST', '/api/ai/chat', async ({ req, url, body }) => {
    if (!body.text || !String(body.text).trim()) throw badRequest('请输入要咨询的内容');
    const user = await currentUser(req, url);
    let history;
    if (Array.isArray(body.history) && body.history.length) {
      history = body.history.slice(-10).map((h) => ({ role: h.role === 'assistant' ? 'assistant' : 'user', content: String(h.content ?? '').slice(0, 2000) }));
    }
    const res = await handleChat({
      sessionId: body.sessionId,
      text: String(body.text).slice(0, 2000),
      user,
      historyOverride: history,
    });
    return ok(res);
  });

  route('GET', '/api/ai/history/:sessionId', async ({ params }) => ok({ list: await getHistory(params.sessionId) }));

  route('POST', '/api/ai/handoff', async ({ body }) => {
    requireFields(body, ['sessionId']);
    return ok(await requestHuman(String(body.sessionId), body.reason), '已转接人工客服');
  });

  /* ---------------- 管理端：人工客服工作台 ---------------- */

  route('GET', '/api/admin/conversations', async ({ req, url, query }) => {
    await requireAdmin(req, url);
    return ok(await listConversations({
      status: query.get('status') || 'all',
      page: Number(query.get('page') || 1),
      size: Number(query.get('size') || 20),
    }));
  });

  route('GET', '/api/admin/conversations/:sessionId', async ({ req, url, params }) => {
    await requireAdmin(req, url);
    return ok({ list: await getHistory(params.sessionId, 100) });
  });

  route('POST', '/api/admin/conversations/:sessionId/reply', async ({ req, url, params, body }) => {
    await requireAdmin(req, url);
    requireFields(body, ['content']);
    return ok(await agentReply(params.sessionId, String(body.content).slice(0, 2000)), '已回复');
  });

  /** 意图与安全规则的在线自测（评审现场可直接演示 NLP 与红线判断） */
  route('POST', '/api/ai/debug/analyze', async ({ req, url, body }) => {
    const user = await currentUser(req, url);
    void user;
    requireFields(body, ['text']);
    const { detectIntent, extractSlots, triageSymptoms, analyzeEmotion } = await import('../data/ai-rules.mjs');
    const text = String(body.text);
    const slots = extractSlots(text);
    return ok({
      text,
      intent: detectIntent(text),
      slots,
      triage: triageSymptoms(text, slots),
      emotion: analyzeEmotion(text),
    });
  });

  route('GET', '/api/admin/me', async ({ req, url }) => {
    const admin = await requireAdmin(req, url);
    return ok({ id: admin.id, nickname: admin.nickname, role: admin.role });
  });

  void requireUser;
}

export default { registerAiRoutes };
