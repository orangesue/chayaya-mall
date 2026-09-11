/** 我的：会员中心、优惠券、我的溯源码、收货地址、订单入口、邀约报名、反馈 */
import { route } from '../router.js';
import { get, post, state, toast, yuan, refreshUser, logout, formatTime } from '../store.js';

const esc = (s) => String(s ?? '')
  .replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/"/g, '&quot;');

route('/me', async () => {
  if (!state.token) {
    return {
      title: '我的', tab: 'me',
      html: `
      <div class="page">
        <div class="page-pad" style="padding-top:24px">
          <div class="card center">
            <img src="/assets/img/image20.png" style="width:88px;margin:0 auto 10px" alt="茶芽芽" />
            <div class="bold" style="font-size:16px">登录后享村集体直供价</div>
            <div class="small muted mt6">还能查看你买到的每一瓶的溯源记录</div>
            <a class="btn block mt10" href="#/login?redirect=/me">立即登录 / 注册</a>
            <div class="btn-row mt10">
              <a class="btn ghost" href="#/shop">先逛逛</a>
              <a class="btn outline" href="#/trace">体验溯源</a>
            </div>
          </div>
          <div class="card">
            <div class="card-title">🌱 会员权益</div>
            <div class="steps">
              <div class="step"><b>新芽会员</b>：注册即享村集体直供价，查看基础溯源记录</div>
              <div class="step"><b>成长会员</b>：累计消费满 100 元，赠育儿科普手册 + 每月优惠券</div>
              <div class="step"><b>守护会员</b>：累计消费满 500 元，免费参与“浒口村溯源之旅”</div>
            </div>
          </div>
        </div>
      </div>`,
    };
  }

  const me = await get('/api/me');
  const [codes, bookings] = await Promise.all([
    get('/api/me/trace-codes', { silent: true }).catch(() => ({ list: [] })),
    get('/api/bookings', { silent: true }).catch(() => ({ list: [] })),
  ]);
  const t = me.tier;
  const u = me.user;

  const html = `
  <div class="page">
    <div class="page-pad">
      <div class="card" style="background:linear-gradient(135deg,#eaf6ef,#fdfaf1)">
        <div class="row" style="gap:12px">
          <img src="${u.avatar}" style="width:58px;height:58px;border-radius:50%;object-fit:cover;background:#fff" alt="" />
          <div class="grow">
            <div class="bold" style="font-size:16px">${esc(u.nickname)}</div>
            <div class="small muted">${esc(u.phone || '微信用户')}</div>
            <div class="mt6"><span class="tag tea">${esc(t.current?.name || '新芽会员')}</span>
              <span class="tag plain">累计消费 ${yuan(u.totalPaid)}</span></div>
          </div>
        </div>
        ${t.next ? `
        <div class="mt10">
          <div class="row-between tiny muted"><span>距 ${esc(t.next.name)} 还差 ${yuan(t.next.gap)}</span><span>${esc(t.current?.name || '')} → ${esc(t.next.name)}</span></div>
          <div class="bar mt6"><i style="width:${Math.min(100, Math.round((u.totalPaid / (u.totalPaid + t.next.gap)) * 100))}%"></i></div>
        </div>` : '<div class="small muted mt10">已是最高等级会员，感谢一路陪伴 🌱</div>'}
      </div>

      <div class="card">
        <div class="row" style="justify-content:space-around;text-align:center">
          <a href="#/orders" style="flex:1"><div class="bold" style="font-size:17px;color:var(--green-700)">${me.counts.orders}</div><div class="tiny muted">全部订单</div></a>
          <a href="#/orders?status=shipped" style="flex:1"><div class="bold" style="font-size:17px;color:var(--green-700)">${me.counts.finished}</div><div class="tiny muted">已完成</div></a>
          <a href="#/coupons" style="flex:1"><div class="bold" style="font-size:17px;color:var(--green-700)">${me.counts.coupons}</div><div class="tiny muted">可用券</div></a>
          <a href="#/cart" style="flex:1"><div class="bold" style="font-size:17px;color:var(--green-700)">${me.counts.cart}</div><div class="tiny muted">购物车</div></a>
        </div>
      </div>

      <div class="card">
        <div class="card-title">🔍 我买到的溯源码</div>
        ${codes.list.length ? codes.list.slice(0, 6).map((c) => `
          <div class="row-between" style="padding:9px 0;border-bottom:1px dashed var(--line)">
            <div class="grow">
              <div class="small bold">${esc(c.traceCode)}</div>
              <div class="tiny muted">${esc(c.title)} ${esc(c.spec)} · 已查询 ${c.scanCount} 次</div>
            </div>
            <a class="btn xs outline" href="#/trace?code=${c.traceCode}">溯源</a>
          </div>`).join('') : '<div class="small muted">下单支付后，系统会为本单每一瓶分配独立溯源码</div>'}
        ${codes.list.length > 6 ? '<div class="tiny muted mt6">仅显示最近 6 个，可在订单详情查看全部</div>' : ''}
      </div>

      <div class="card">
        <div class="card-title">🎁 会员权益</div>
        <div class="steps">
          ${(t.current?.benefits || []).map((b) => `<div class="step">${esc(b)}</div>`).join('')}
        </div>
        ${t.all?.length ? `
        <div class="divider"></div>
        <div class="small muted mb6">全部等级</div>
        ${t.all.map((x) => `
          <div class="row-between small" style="padding:4px 0">
            <span>${esc(x.name)}${x.reached ? ' <span class="tag">已达成</span>' : ''}</span>
            <span class="muted">满 ${yuan(x.min)}</span>
          </div>`).join('')}` : ''}
      </div>

      <div class="card">
        <div class="card-title">🚌 浒口村溯源之旅</div>
        <p class="small muted" style="margin:0 0 10px">守护会员可免费参加：实地参观山茶花种植基地、产品生产过程，体验浒口特色油茶。</p>
        ${bookings.list.length ? bookings.list.map((b) => `
          <div class="row-between small" style="padding:6px 0">
            <span>${esc(b.activity)}</span><span class="muted">${b.status === 'pending' ? '待确认' : esc(b.status)}</span>
          </div>`).join('') : ''}
        <button class="btn ghost block" id="book-trip">报名溯源之旅</button>
      </div>

      <div class="card">
        <div class="card-title">⚙️ 更多</div>
        <div class="row-between" style="padding:9px 0;border-bottom:1px solid var(--line)">
          <span class="small">收货地址</span><a class="small muted" href="#/address">管理 ›</a>
        </div>
        <div class="row-between" style="padding:9px 0;border-bottom:1px solid var(--line)">
          <span class="small">我的优惠券</span><a class="small muted" href="#/coupons">查看 ›</a>
        </div>
        <div class="row-between" style="padding:9px 0;border-bottom:1px solid var(--line)">
          <span class="small">胎宝月龄设置<span class="tiny muted">（用于分月龄抚触建议）</span></span>
          <button class="btn xs ghost" id="baby-btn">${u.babyBirth ? esc(String(u.babyBirth).slice(0, 10)) : '未设置'}</button>
        </div>
        <div class="row-between" style="padding:9px 0;border-bottom:1px solid var(--line)">
          <span class="small">品牌故事</span><a class="small muted" href="#/brand">阅读 ›</a>
        </div>
        <div class="row-between" style="padding:9px 0;border-bottom:1px solid var(--line)">
          <span class="small">抚触教程</span><a class="small muted" href="#/guide">学习 ›</a>
        </div>
        <div class="row-between" style="padding:9px 0;border-bottom:1px solid var(--line)">
          <span class="small">意见反馈</span><button class="btn xs ghost" id="feedback-btn">去反馈</button>
        </div>
        ${u.role === 'admin' ? `
        <div class="row-between" style="padding:9px 0;border-bottom:1px solid var(--line)">
          <span class="small bold">管理后台</span><a class="btn xs" href="/admin.html" target="_blank">进入 ›</a>
        </div>` : ''}
        <div class="row-between" style="padding:9px 0">
          <span class="small">退出登录</span><button class="btn xs outline" id="logout-btn">退出</button>
        </div>
      </div>

      <div class="tiny muted center">
        ${esc(u.nickname)} · 注册于 ${esc(formatTime(u.createdAt || ''))}
      </div>
    </div>
  </div>`;

  const mount = async () => {
    const { openSheet, closeSheet } = await import('./order.js');

    document.getElementById('book-trip').addEventListener('click', () => {
      openSheet('报名“浒口村溯源之旅”', `
        <div class="small muted mb10">我们会在报名后 24 小时内电话与您确认行程（湖南省郴州市浒口村，行程约半天）。</div>
        <div class="field"><label>参加城市</label><input class="input" id="trip-city" placeholder="如：珠海市" /></div>
        <div class="field"><label>联系方式</label><input class="input" id="trip-contact" placeholder="手机号" /></div>
        <button class="btn block" id="trip-submit">提交报名</button>
      `, (root) => {
        root.querySelector('#trip-submit').addEventListener('click', async () => {
          await post('/api/bookings', {
            activity: '浒口村溯源之旅',
            city: root.querySelector('#trip-city').value.trim(),
            contact: root.querySelector('#trip-contact').value.trim(),
          });
          closeSheet();
          toast('报名成功，客服会尽快联系您');
        });
      });
    });

    document.getElementById('baby-btn').addEventListener('click', () => {
      openSheet('设置宝宝出生日期', `
        <div class="small muted mb10">用于给你推送对应月龄的抚触手法与用量建议。</div>
        <div class="field"><label>出生日期</label><input class="input" type="date" id="baby-date" value="${esc(u.babyBirth || '')}" /></div>
        <button class="btn block" id="baby-save">保存</button>
      `, (root) => {
        root.querySelector('#baby-save').addEventListener('click', async () => {
          const v = root.querySelector('#baby-date').value;
          await fetch('/api/me', {
            method: 'PATCH',
            headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${state.token}` },
            body: JSON.stringify({ babyBirth: v }),
          });
          closeSheet();
          toast('已保存，抚触建议会按宝宝月龄给出');
          await refreshUser();
          const { render } = await import('../router.js');
          render();
        });
      });
    });

    document.getElementById('feedback-btn').addEventListener('click', () => {
      openSheet('意见反馈', `
        <div class="field">
          <label>你的建议</label>
          <textarea class="textarea" id="fb-content" placeholder="产品体验、包装、客服、溯源…任何想法都欢迎"></textarea>
        </div>
        <button class="btn block" id="fb-submit">提交</button>
      `, (root) => {
        root.querySelector('#fb-submit').addEventListener('click', async () => {
          const content = root.querySelector('#fb-content').value.trim();
          if (!content) { toast('写点什么再提交吧'); return; }
          await post('/api/feedback', { content });
          closeSheet();
          toast('感谢反馈，团队会认真阅读');
        });
      });
    });

    document.getElementById('logout-btn').addEventListener('click', async () => {
      logout();
      toast('已退出登录');
      const { render } = await import('../router.js');
      render();
    });
  };

  return { html, title: '我的', tab: 'me', mount };
});

/* ============================================================
 * 优惠券
 * ============================================================ */
route('/coupons', async () => {
  if (!state.token) {
    return { html: '<div class="page"><div class="empty"><div class="ico">🔐</div><p>请先登录</p><a class="btn sm mt10" href="#/login?redirect=/coupons">去登录</a></div></div>', title: '我的优惠券', tab: 'me' };
  }
  const data = await get('/api/me/coupons');
  const html = `
  <div class="page">
    <div class="page-pad">
      ${data.list.length ? data.list.map((c) => `
        <div class="card" style="opacity:${c.status === 'unused' ? 1 : .55}">
          <div class="row-between">
            <div class="grow">
              <div class="bold" style="font-size:15px">${esc(c.title)}</div>
              <div class="small muted mt6">满 ¥${esc(c.minAmountText)} 可用${c.status === 'unused' ? '' : ' · 已使用'}</div>
              <div class="tiny muted">券码 ${esc(c.code)}${c.expiresAt ? ` · 有效期至 ${esc(String(c.expiresAt).slice(0, 10))}` : ''}</div>
            </div>
            <div class="center">
              <div class="price"><span class="unit">¥</span><span class="num">${(c.amount / 100).toFixed(0)}</span></div>
              ${c.status === 'unused' ? `<a class="btn xs mt6" href="#/cart">去使用</a>` : '<span class="tag plain">已用</span>'}
            </div>
          </div>
        </div>`).join('') : '<div class="empty"><div class="ico">🎫</div><p>暂无优惠券</p></div>'}

      <div class="card">
        <div class="card-title">🎫 输入券码领取</div>
        <div class="row">
          <input class="input grow" id="coupon-code" placeholder="如 NEWUSER10" />
          <button class="btn sm" id="coupon-claim">领取</button>
        </div>
        <div class="tiny muted mt6">线下体验、月子中心活动、社群福利会发放专属券码</div>
      </div>
    </div>
  </div>`;

  const mount = () => {
    document.getElementById('coupon-claim').addEventListener('click', async () => {
      const code = document.getElementById('coupon-code').value.trim();
      if (!code) { toast('请输入券码'); return; }
      const res = await post('/api/coupons/claim', { code });
      toast(res.claimed ? '领取成功' : (res.message || '已领取过'));
      const { render } = await import('../router.js');
      render();
    });
  };

  return { html, title: '我的优惠券', tab: 'me', mount };
});

export { esc, yuan };
