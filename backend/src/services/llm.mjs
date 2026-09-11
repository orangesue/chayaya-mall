/**
 * 大模型接入层（可选增强）
 * 默认 provider=rule，完全离线可用；配置 AI_API_KEY 后自动启用 OpenAI 兼容接口
 * （默认 DeepSeek：https://api.deepseek.com/v1）。
 * 安全约束：大模型只用于把"已经由规则引擎确定的答案"改写得更自然，
 * 不允许它自行判断婴儿症状的适用性 —— 医疗安全判断始终由规则引擎负责。
 */
import config from '../config.mjs';

export const aiMode = () => (config.ai.enabled ? `llm:${config.ai.model}` : 'rule-engine');

const SYSTEM_PROMPT = `你是"茶芽芽"品牌（湖南省郴州市浒口村山茶油助农项目）的母婴护肤客服助手"芽芽"。
你的职责：解答关于婴儿山茶抚触油的产地溯源、产品安全性、功效原理、抚触方法用量、订单售后问题。

严格规则（违反即为严重错误）：
1. 你不是医生，绝对不做医学诊断、不推荐任何药物、不判断"某种症状一定是什么病"。
2. 涉及婴儿皮肤症状时，只能给出日常护理建议，并明确提示"请以医生诊断为准"。
3. 遇到发热、化脓渗液、破溃、精神差、拒奶、呼吸异常、皮疹大面积快速扩散等情况，必须先建议立即就医。
4. 不夸大功效，不承诺"治愈湿疹/治疗红屁股"等医疗效果。
5. 只基于给定的"标准答案"作答，不编造检测数据、产地信息、价格与政策。

输出风格：中文，语气温和专业，控制在 200 字以内，可用 1-3 条要点罗列，不要使用夸张营销词。`;

/**
 * 调用大模型（OpenAI 兼容 /chat/completions）
 * @returns {Promise<{text: string, usage?: object, model?: string}|null>}
 */
export async function chat(messages, { temperature = 0.3, maxTokens = 500 } = {}) {
  if (!config.ai.enabled) return null;
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), config.ai.timeoutMs);
  try {
    const res = await fetch(`${config.ai.baseUrl.replace(/\/$/, '')}/chat/completions`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        Authorization: `Bearer ${config.ai.apiKey}`,
      },
      body: JSON.stringify({
        model: config.ai.model,
        temperature,
        max_tokens: maxTokens,
        messages: [{ role: 'system', content: SYSTEM_PROMPT }, ...messages],
      }),
      signal: controller.signal,
    });
    if (!res.ok) {
      const text = await res.text().catch(() => '');
      console.warn(`[ai] 大模型返回 ${res.status}：${text.slice(0, 200)}`);
      return null;
    }
    const data = await res.json();
    const text = data?.choices?.[0]?.message?.content?.trim();
    if (!text) return null;
    return { text, usage: data.usage, model: data.model };
  } catch (e) {
    console.warn('[ai] 大模型调用失败，已回退到规则引擎：', e.message);
    return null;
  } finally {
    clearTimeout(timer);
  }
}

/**
 * 让大模型把规则引擎给出的答案润色成更自然的话术。
 * 若调用失败或无 Key，直接返回原文案，保证服务永不因外部依赖失败。
 */
export async function polishAnswer({ question, standardAnswer, history = [], extra = '' }) {
  if (!config.ai.enabled) return { text: standardAnswer, polished: false, mode: 'rule-engine' };
  const messages = [
    ...history.slice(-6).map((m) => ({ role: m.role === 'assistant' ? 'assistant' : 'user', content: m.content })),
    {
      role: 'user',
      content: `用户问题：${question}\n\n请基于以下标准答案，用自然、口语化的中文重新组织回复（不要新增任何事实，不要删除安全提示）：\n${standardAnswer}\n${extra ? `\n补充约束：${extra}` : ''}`,
    },
  ];
  const res = await chat(messages);
  if (!res) return { text: standardAnswer, polished: false, mode: 'rule-engine' };
  return { text: res.text, polished: true, mode: `llm:${res.model || config.ai.model}`, usage: res.usage };
}

export default { chat, polishAnswer, aiMode };
