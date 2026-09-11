/** AI 客服对话页（对应项目书 4.2.2 AI 智能客服系统；团队 UI 原型见报告书图19/image25） */
import { route } from '../router.js';
import { get, post, state, toast, mdLite, setSession, track } from '../store.js';

const esc = (s) => String(s ?? '')
  .replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/"/g, '&quot;');

const LEVEL_TEXT = {
  ok: { cls: 'triage-ok', label: '可以按日常护理使用' },
  caution: { cls: 'triage-caution', label: '需谨慎，建议先咨询医生' },
  avoid: { cls: 'triage-avoid', label: '患处暂不要涂油' },
  emergency: { cls: 'triage-emergency', label: '请先带宝宝就医' },
};

const INTENT_TEXT = {
  origin: '产地环境', safety: '产品安全性', efficacy: '产品功能与功效',
  massage: '抚触科普与用量', order: '订单物流与售后', symptom: '婴儿症状适用性', fallback: '其他问题',
};

route('/ai', async ({ query }) => {
  const boot = await get('/api/ai/bootstrap');
  const prefill = query.get('q') || '';

  const history = [];
  if (boot.user) {
    try {
      const h = await get(`/api/ai/history/${state.sessionId}`, { silent: true });
      (h.list || []).slice(-12).forEach((m) => history.push(m));
    } catch { /* 忽略 */ }
  }

  const html = `
  <div class="page">
    <div class="notice danger" style="margin:0 12px 10px;border-radius:10px">
      <b>重要提示</b>：我是护肤客服，不是医生。涉及症状诊断与用药请以医生意见为准；
      宝宝出现发热、化脓渗液、精神差、拒奶、呼吸异常时请立即就医。
    </div>
    <div class="chat-wrap">
      <div class="chat-body" id="chat-body">
        <div class="msg">
          <div class="avatar"><img src="/assets/img/image20.png" alt="芽芽" /></div>
          <div class="bubble">${esc(boot.greeting)}</div>
        </div>
        <div id="msgs"></div>
      </div>
      <div class="chat-quick" id="quick">
        ${(boot.quick || []).map((q) => `<span class="chip" data-q="${esc(q)}">${esc(q)}</span>`).join('')}
      </div>
      <div class="chat-input">
        <textarea id="input" rows="1" placeholder="描述宝宝的情况，或问产品/订单问题…">${esc(prefill)}</textarea>
        <button class="btn" id="send">发送</button>
      </div>
    </div>
  </div>`;

  const mount = () => {
    const msgs = document.getElementById('msgs');
    const body = document.getElementById('chat-body');
    const input = document.getElementById('input');
    const sendBtn = document.getElementById('send');
    const scroll = () => { body.scrollTop = body.scrollHeight; };

    const push = (role, content, extra = {}) => {
      const el = document.createElement('div');
      el.className = `msg ${role === 'user' ? 'me' : ''}`;
      const triage = extra.triage?.level && role === 'assistant'
        ? `<div class="triage-badge ${LEVEL_TEXT[extra.triage.level]?.cls || ''}">${LEVEL_TEXT[extra.triage.level]?.label || ''}</div>`
        : '';
      const meta = role === 'assistant' && extra.intent
        ? `<div class="tiny muted" style="margin-top:6px">意图识别：${INTENT_TEXT[extra.intent] || extra.intent}${extra.confidence !== undefined ? ` · 置信度 ${(extra.confidence * 100).toFixed(0)}%` : ''}${extra.engine ? ` · 引擎 ${extra.engine.mode}` : ''}</div>`
        : '';
      el.innerHTML = `
        <div class="avatar">${role === 'user' ? '👤' : '<img src="/assets/img/image20.png" alt="芽芽" />'}</div>
        <div>
          ${triage}
          <div class="bubble">${role === 'user' ? esc(content) : mdLite(content)}</div>
          ${meta}
        </div>`;
      msgs.appendChild(el);
      if (extra.cards?.length) {
        const cardHost = document.createElement('div');
        cardHost.className = 'chat-cards';
        cardHost.innerHTML = extra.cards.map((c) => `
          <a class="chat-card" href="${c.url || '#'}" ${c.url?.startsWith('/assets') ? 'target="_blank"' : ''}>
            ${c.image ? `<img class="thumb" src="${c.image}" alt="" />` : '<div class="thumb" style="display:flex;align-items:center;justify-content:center">📄</div>'}
            <div class="grow">
              <div class="t">${esc(c.title)}</div>
              <div class="d">${esc(c.desc || '')}</div>
            </div>
            <span class="muted">›</span>
          </a>`).join('');
        msgs.appendChild(cardHost);
      }
      scroll();
    };

    // 渲染历史
    history.forEach((m) => {
      if (m.role === 'user') push('user', m.content);
      else if (m.role === 'assistant') push('assistant', m.content, { cards: m.cards, intent: m.intent });
      else push('assistant', m.content);
    });

    const ask = async (text) => {
      const value = String(text || '').trim();
      if (!value) return;
      push('user', value);
      input.value = '';
      input.style.height = 'auto';
      const typing = document.createElement('div');
      typing.className = 'msg';
      typing.innerHTML = `<div class="avatar"><img src="/assets/img/image20.png" alt="芽芽" /></div><div class="bubble"><span class="typing"><i></i><i></i><i></i></span></div>`;
      msgs.appendChild(typing);
      scroll();
      try {
        const res = await post('/api/ai/chat', {
          sessionId: state.sessionId || undefined,
          text: value,
          history: history.slice(-8).map((m) => ({ role: m.role, content: m.content })),
        });
        typing.remove();
        setSession(res.sessionId);
        const r = res.reply;
        history.push({ role: 'user', content: value });
        history.push({ role: 'assistant', content: r.answer });
        push('assistant', r.answer, { cards: r.cards, intent: r.intent, confidence: r.confidence, triage: r.triage, engine: r.engine });
        track('chat', r.intent);

        if (r.handoff?.needed) {
          const tip = document.createElement('div');
          tip.className = 'notice danger';
          tip.style.margin = '0 0 14px 40px';
          tip.innerHTML = `<b>已为你转接人工客服</b><br />原因：${esc(r.handoff.reasons.join('；'))}<br />
            客服工作时间 9:00-21:00，也可以直接留下手机号，我们会尽快回电。`;
          msgs.appendChild(tip);
          scroll();
        }
      } catch (e) {
        typing.remove();
        push('assistant', `抱歉，刚才没回答上来（${e.message}）。您可以换个说法，或直接联系人工客服。`);
      }
    };

    sendBtn.addEventListener('click', () => ask(input.value));
    input.addEventListener('keydown', (e) => {
      if (e.key === 'Enter' && !e.shiftKey) { e.preventDefault(); ask(input.value); }
    });
    input.addEventListener('input', () => {
      input.style.height = 'auto';
      input.style.height = `${Math.min(96, input.scrollHeight)}px`;
    });
    document.querySelectorAll('#quick .chip').forEach((chip) => {
      chip.addEventListener('click', () => ask(chip.dataset.q));
    });

    scroll();
    if (prefill) ask(prefill);
  };

  return { html, title: 'AI 问症', tab: 'ai', mount };
});
