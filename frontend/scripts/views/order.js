/** 登录 / 购物车 / 结算 / 订单列表 / 订单详情 / 地址管理 */
import { route, navigate } from '../router.js';
import {
  get, post, patch, del, state, toast, yuan, refreshCartCount, refreshUser, track, setSession, wechatLogin, sendCode, loginByCode,
} from '../store.js';

const esc = (s) => String(s ?? '')
  .replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/"/g, '&quot;');

/* ============================================================
 * 登录（手机号验证码 / 微信一键登录）
 * ============================================================ */
route('/login', async ({ query }) => {
  const redirect = query.get('redirect') || '/';
  const html = `
  <div class="page">
    <div class="page-pad" style="padding-top:30px">
      <div class="center mb14">
        <img src="/assets/img/image20.png" style="width:110px;margin:0 auto 10px" alt="茶芽芽" />
        <div class="bold" style="font-size:18px">欢迎来到茶芽芽</div>
        <div class="small muted">与茶树一同生长，伴宝宝安心长大</div>
      </div>

      <div class="card">
        <div class="field">
          <label>手机号</label>
          <input class="input" id="phone" type="tel" maxlength="11" placeholder="请输入 11 位手机号" />
        </div>
        <div class="field">
          <label>验证码</label>
          <div class="row">
            <input class="input grow" id="code" maxlength="6" placeholder="6 位验证码" />
            <button class="btn ghost" id="send-code" style="white-space:nowrap">获取验证码</button>
          </div>
        </div>
        <button class="btn block mt10" id="do-login">登录 / 注册</button>
        <div class="small muted center mt10">未注册的手机号将自动创建账号</div>
      </div>

      <button class="btn outline block" id="wx-login">微信一键登录（演示）</button>

      <div class="notice info mt14">
        演示环境说明：验证码固定为 <b>123456</b>；也可用演示账号 13800000002（成长会员）。
        微信一键登录在浏览器下走 mock openid，接入真实小程序后自动切换为 code2session。
      </div>

      <div class="card mt14">
        <div class="card-title">🧪 演示账号</div>
        <div class="small muted">用户：13800000002（验证码 123456）</div>
        <div class="small muted">管理后台：13800000001 / 密码 chayaya2026</div>
      </div>
    </div>
  </div>`;

  const mount = () => {
    const phone = document.getElementById('phone');
    const code = document.getElementById('code');
    let timer = null;

    document.getElementById('send-code').addEventListener('click', async (e) => {
      const v = phone.value.trim();
      if (!/^1\d{10}$/.test(v)) { toast('请输入正确的手机号'); return; }
      try {
        const res = await sendCode(v);
        toast(res.code ? `验证码：${res.code}（演示环境）` : '验证码已发送');
        e.target.disabled = true;
        let left = 60;
        e.target.textContent = `${left}s`;
        timer = setInterval(() => {
          left -= 1;
          e.target.textContent = `${left}s`;
          if (left <= 0) { clearInterval(timer); e.target.disabled = false; e.target.textContent = '获取验证码'; }
        }, 1000);
        if (res.code) code.value = res.code;
      } catch { /* 已提示 */ }
    });

    document.getElementById('do-login').addEventListener('click', async () => {
      const v = phone.value.trim();
      if (!/^1\d{10}$/.test(v)) { toast('请输入正确的手机号'); return; }
      if (!code.value.trim()) { toast('请输入验证码'); return; }
      try {
        await loginByCode(v, code.value.trim());
        await refreshUser();
        await refreshCartCount();
        toast('登录成功');
        navigate(redirect, { replace: true });
      } catch { /* 已提示 */ }
    });

    document.getElementById('wx-login').addEventListener('click', async () => {
      try {
        const res = await wechatLogin();
        await refreshUser();
        toast(res.mode === 'mock' ? '演示模式登录成功' : '微信登录成功');
        navigate(redirect, { replace: true });
      } catch { /* 已提示 */ }
    });
  };

  return { html, title: '登录', back: false, mount };
});

/* ============================================================
 * 购物车
 * ============================================================ */
route('/cart', async () => {
  if (!state.token) return { html: loginGate('购物车'), title: '购物车', tab: 'me' };
  const data = await get('/api/cart');
  const items = data.items || [];
  const rec = data.recommend?.items || [];

  const html = `
  <div class="page">
    <div class="page-pad">
      ${items.length ? `
        <div class="card">
          ${items.map((it) => `
            <div class="goods-row">
              <a class="thumb" href="#/product/${it.code}"><img src="${it.image}" alt="" /></a>
              <div class="grow">
                <div class="row-between">
                  <div class="grow">
                    <div class="bold" style="font-size:13.5px">${esc(it.title)}</div>
                    <div class="small muted">${esc(it.spec)}</div>
                  </div>
                  <button class="btn xs ghost" data-remove="${it.cartId}">删除</button>
                </div>
                <div class="mt6">${it.tags.slice(0, 2).map((t) => `<span class="tag">${esc(t)}</span>`).join('')}</div>
                <div class="row-between mt6">
                  <span class="price"><span class="unit">¥</span><span class="num">${(it.price / 100).toFixed(2)}</span></span>
                  <div class="row" style="gap:0;border:1px solid var(--line);border-radius:8px;overflow:hidden">
                    <button class="btn xs plain" data-qty="${it.cartId}" data-delta="-1" style="border-radius:0;background:#fff;color:var(--ink)">－</button>
                    <span style="padding:4px 12px;font-size:13px" data-qty-val="${it.cartId}">${it.qty}</span>
                    <button class="btn xs plain" data-qty="${it.cartId}" data-delta="1" style="border-radius:0;background:#fff;color:var(--ink)">＋</button>
                  </div>
                </div>
              </div>
            </div>`).join('')}
        </div>

        ${rec.length ? `
        <div class="card">
          <div class="card-title">🤖 芽芽的搭配建议</div>
          ${rec.map((r) => `
            <div class="row-between" style="padding:9px 0;border-bottom:1px dashed var(--line)">
              <div class="row grow" style="gap:10px">
                <img src="${r.image}" style="width:46px;height:46px;border-radius:8px;object-fit:cover" alt="" />
                <div class="grow">
                  <div class="small bold">${esc(r.title)} ${esc(r.spec)}</div>
                  <div class="tiny muted">${esc(r.reason)}</div>
                </div>
              </div>
              <button class="btn xs" data-add="${r.code}">加入</button>
            </div>`).join('')}
          ${data.recommend?.ageTip ? `<div class="notice info mt10">${esc(data.recommend.ageTip)}</div>` : ''}
        </div>` : ''}

        <div class="card" style="position:sticky;bottom:calc(var(--tabbar-h) + 8px);z-index:5">
          <div class="row-between mb10">
            <span class="small muted">商品合计（${data.totalQty} 件）</span>
            <span class="price"><span class="unit">¥</span><span class="num">${(data.goodsAmount / 100).toFixed(2)}</span></span>
          </div>
          <a class="btn block" href="#/checkout">去结算</a>
        </div>
      ` : `
        <div class="empty">
          <div class="ico">🛒</div>
          <p>购物车还是空的</p>
          <a class="btn ghost sm mt10" href="#/shop">去挑一瓶</a>
        </div>`}
    </div>
  </div>`;

  const mount = () => {
    document.querySelectorAll('[data-remove]').forEach((el) => {
      el.addEventListener('click', async () => {
        await del(`/api/cart/${el.dataset.remove}`);
        await refreshCartCount();
        toast('已移出购物车');
        const { render } = await import('../router.js');
        render();
      });
    });
    document.querySelectorAll('[data-qty]').forEach((el) => {
      el.addEventListener('click', async () => {
        const id = el.dataset.qty;
        const valEl = document.querySelector(`[data-qty-val="${id}"]`);
        const next = Number(valEl.textContent) + Number(el.dataset.delta);
        if (next < 1) return;
        await patch(`/api/cart/${id}`, { qty: next });
        valEl.textContent = next;
        await refreshCartCount();
        const { render } = await import('../router.js');
        render();
      });
    });
    document.querySelectorAll('[data-add]').forEach((el) => {
      el.addEventListener('click', async () => {
        await post('/api/cart', { code: el.dataset.add, qty: 1 });
        await refreshCartCount();
        toast('已加入购物车');
        const { render } = await import('../router.js');
        render();
      });
    });
  };

  return { html, title: '购物车', tab: 'me', mount, keepScroll: true };
});

/* ============================================================
 * 结算
 * ============================================================ */
route('/checkout', async ({ query }) => {
  if (!state.token) return { html: loginGate('结算'), title: '确认订单', tab: 'me' };

  const directCode = query.get('code');
  const directQty = Number(query.get('qty') || 1);
  let preview;
  if (directCode) {
    const lines = await post('/api/price/preview', { items: [{ code: directCode, qty: directQty }] });
    const addr = await get('/api/addresses');
    preview = {
      items: lines.lines.map((l) => ({ ...l, cartId: null, title: l.title, spec: l.spec, image: l.image })),
      goodsAmount: lines.goodsAmount, tierDiscount: lines.tierDiscount, couponDiscount: 0,
      freight: lines.freight, payAmount: lines.payAmount, coupons: [], addresses: addr.list,
      needAddress: addr.list.length === 0, coupon: null,
    };
  } else {
    preview = await post('/api/cart/checkout-preview', {});
  }

  const addr = preview.addresses?.[0];

  const html = `
  <div class="page">
    <div class="page-pad">
      <div class="card" id="addr-card">
        ${addr ? `
          <div class="row-between">
            <div class="grow">
              <div class="bold">${esc(addr.receiver)} <span class="small muted">${esc(addr.phone)}</span></div>
              <div class="small muted mt6">${esc(addr.province)}${esc(addr.city)}${esc(addr.district)} ${esc(addr.detail)}</div>
            </div>
            <button class="btn xs outline" id="change-addr">更换</button>
          </div>` : `
          <div class="center">
            <div class="small muted mb10">还没有收货地址</div>
            <button class="btn sm" id="new-addr">添加收货地址</button>
          </div>`}
      </div>

      <div class="card">
        <div class="card-title">商品清单</div>
        ${preview.items.map((it) => `
          <div class="goods-row" style="padding:9px 0">
            <div class="thumb" style="width:60px;height:60px"><img src="${it.image}" alt="" /></div>
            <div class="grow">
              <div class="small bold">${esc(it.title)}</div>
              <div class="tiny muted">${esc(it.spec)} × ${it.qty}</div>
            </div>
            <div class="small price">¥${(it.price * it.qty / 100).toFixed(2)}</div>
          </div>`).join('')}
      </div>

      <div class="card">
        <div class="row-between mb10">
          <span class="small">优惠券</span>
          <button class="btn xs outline" id="pick-coupon">
            ${preview.coupon ? `${esc(preview.coupon.title)} -¥${(preview.couponDiscount / 100).toFixed(2)}` : `选择优惠券（${(preview.coupons || []).filter((c) => c.usable).length} 张可用）`}
          </button>
        </div>
        <div class="row-between mb6"><span class="small muted">商品金额</span><span class="small">¥${(preview.goodsAmount / 100).toFixed(2)}</span></div>
        ${preview.tierDiscount ? `<div class="row-between mb6"><span class="small muted">会员折扣</span><span class="small">-¥${(preview.tierDiscount / 100).toFixed(2)}</span></div>` : ''}
        ${preview.couponDiscount ? `<div class="row-between mb6"><span class="small muted">优惠券</span><span class="small">-¥${(preview.couponDiscount / 100).toFixed(2)}</span></div>` : ''}
        <div class="row-between mb6"><span class="small muted">运费</span><span class="small">${preview.freight ? `¥${(preview.freight / 100).toFixed(2)}` : '免运费'}</span></div>
        ${preview.freeFreightGap > 0 ? `<div class="tiny muted">再买 ¥${(preview.freeFreightGap / 100).toFixed(2)} 免运费</div>` : ''}
        <div class="divider"></div>
        <div class="row-between"><span class="bold">应付金额</span>
          <span class="price"><span class="unit">¥</span><span class="num">${(preview.payAmount / 100).toFixed(2)}</span></span></div>
      </div>

      <div class="field">
        <label>订单备注（可选）</label>
        <input class="input" id="remark" placeholder="如：需要礼盒包装 / 指定送达时间" />
      </div>

      <div class="notice info mb14">
        支付方式：微信支付（演示环境为<b>模拟支付</b>，不产生真实扣款）。下单后系统会自动为本单分配一物一码，可扫码溯源。
      </div>

      <button class="btn block" id="submit" ${!addr ? 'disabled' : ''}>
        提交订单并支付 ¥${(preview.payAmount / 100).toFixed(2)}
      </button>
    </div>
  </div>`;

  const mount = () => {
    let couponCode = preview.coupon?.code || '';
    let addressId = addr?.id;

    const reload = async (params = {}) => {
      const { render } = await import('../router.js');
      const q = new URLSearchParams();
      if (directCode) { q.set('code', directCode); q.set('qty', String(directQty)); }
      Object.entries(params).forEach(([k, v]) => q.set(k, v));
      void render;
      location.hash = `#/checkout${q.toString() ? `?${q}` : ''}`;
    };

    const pick = document.getElementById('pick-coupon');
    if (pick) {
      pick.addEventListener('click', () => {
        const usable = (preview.coupons || []).filter((c) => c.status === 'unused');
        if (!usable.length) { toast('暂无可用优惠券'); return; }
        openSheet('选择优惠券', `
          ${usable.map((c) => `
            <div class="row-between" style="padding:11px 0;border-bottom:1px solid var(--line)">
              <div>
                <div class="bold">${esc(c.title)}</div>
                <div class="tiny muted">满 ¥${c.minAmountText} 可用 · ${c.usable ? '可用' : '未达门槛'}</div>
              </div>
              <button class="btn xs ${c.usable && couponCode !== c.code ? '' : 'ghost'}" data-coupon="${c.code}" ${c.usable ? '' : 'disabled'}>
                ${couponCode === c.code ? '已选' : '使用'}
              </button>
            </div>`).join('')}
          <button class="btn ghost block mt10" data-coupon="">不使用优惠券</button>
        `, (root) => {
          root.querySelectorAll('[data-coupon]').forEach((el) => {
            el.addEventListener('click', () => {
              couponCode = el.dataset.coupon;
              closeSheet();
              // 重新计算并刷新页面
              post('/api/cart/checkout-preview', { couponCode }, { silent: true }).catch(() => {});
              if (directCode) {
                toast('立即购买不支持优惠券，请在购物车结算时使用');
                return;
              }
              sessionStorage.setItem('cy_coupon', couponCode);
              reloadWithCoupon(couponCode);
            });
          });
        });
      });
    }

    const changeAddr = document.getElementById('change-addr');
    if (changeAddr) changeAddr.addEventListener('click', () => pickAddress(preview.addresses, addressId, (id) => { addressId = id; updateSubmit(); }));

    const newAddr = document.getElementById('new-addr');
    if (newAddr) newAddr.addEventListener('click', () => addressForm(async () => {
      toast('地址已添加，请重新进入结算页');
      const { render } = await import('../router.js');
      render();
    }));

    function updateSubmit() {
      const btn = document.getElementById('submit');
      if (btn && addressId) {
        btn.disabled = false;
        btn.textContent = `提交订单并支付 ¥${(preview.payAmount / 100).toFixed(2)}`;
      }
    }

    document.getElementById('submit').addEventListener('click', async (e) => {
      if (!addressId) { toast('请先添加收货地址'); return; }
      e.target.disabled = true;
      e.target.textContent = '正在提交…';
      try {
        const payload = { addressId, couponCode: couponCode || undefined, remark: document.getElementById('remark').value };
        if (directCode) payload.items = [{ code: directCode, qty: directQty }];
        const order = await post('/api/orders', payload);
        track('pay', order.orderNo);
        const paid = await post(`/api/orders/${order.orderNo}/pay`, { channel: 'mock_wechat' });
        await refreshUser();
        await refreshCartCount();
        toast('支付成功，已为本单分配溯源码');
        location.hash = `#/order/${paid.orderNo}`;
      } catch (err) {
        e.target.disabled = false;
        e.target.textContent = `提交订单并支付 ¥${(preview.payAmount / 100).toFixed(2)}`;
      }
    });

    // 优惠券回填（从 sessionStorage 读取，避免复杂状态传递）
    const saved = sessionStorage.getItem('cy_coupon');
    if (saved && !couponCode && !directCode) {
      sessionStorage.removeItem('cy_coupon');
      const idx = document.querySelector('#pick-coupon');
      if (idx) idx.textContent = '正在应用优惠券…';
      location.hash = `#/checkout?coupon=${saved}`;
    }

    function reloadWithCoupon(code) {
      const { render } = void 0;
      void render;
      location.hash = `#/checkout?coupon=${code}`;
    }
  };

  // 支持通过 ?coupon= 传入优惠券
  const couponFromQuery = query.get('coupon');
  if (couponFromQuery && !directCode) {
    try {
      const re = await post('/api/cart/checkout-preview', { couponCode: couponFromQuery });
      Object.assign(preview, re);
    } catch { /* 券不可用则忽略 */ }
  }

  return { html, title: '确认订单', mount };
});

function loginGate(what) {
  return `
  <div class="page">
    <div class="empty">
      <div class="ico">🔐</div>
      <p>登录后才能查看${what}</p>
      <a class="btn sm mt10" href="#/login?redirect=${encodeURIComponent(`/${what === '购物车' ? 'cart' : 'orders'}`)}">去登录</a>
    </div>
  </div>`;
}

/* ============================================================
 * 订单列表
 * ============================================================ */
route('/orders', async ({ query }) => {
  if (!state.token) return { html: loginGate('订单'), title: '我的订单', tab: 'me' };
  const status = query.get('status') || 'all';
  const data = await get(`/api/orders${status !== 'all' ? `?status=${status}` : ''}`);

  const tabs = [
    { k: 'all', n: '全部' }, { k: 'pending_pay', n: '待付款' }, { k: 'paid', n: '待发货' },
    { k: 'shipped', n: '待收货' }, { k: 'done', n: '已完成' }, { k: 'refunding', n: '售后' },
  ];

  const html = `
  <div class="page">
    <div class="tab-strip">
      ${tabs.map((t) => `<a class="chip ${status === t.k ? 'on' : ''}" href="#/orders?status=${t.k}">${t.n}</a>`).join('')}
    </div>
    <div class="page-pad">
      ${data.list.length ? data.list.map(orderCard).join('') : '<div class="empty"><div class="ico">📦</div><p>暂无订单</p><a class="btn ghost sm mt10" href="#/shop">去逛逛</a></div>'}
    </div>
  </div>`;

  const mount = () => bindOrderActions();
  return { html, title: '我的订单', tab: 'me', mount };
});

export function orderCard(o) {
  return `
  <div class="card">
    <div class="row-between mb10">
      <span class="tiny muted">${esc(o.orderNo)}</span>
      <span class="small bold" style="color:${o.status === 'done' ? 'var(--ok)' : o.status === 'refunding' ? 'var(--danger)' : 'var(--green-700)'}">${esc(o.statusText)}</span>
    </div>
    ${o.items.map((it) => `
      <div class="goods-row" style="padding:8px 0">
        <div class="thumb" style="width:56px;height:56px"><img src="${it.image}" alt="" /></div>
        <div class="grow">
          <div class="small bold">${esc(it.title)}</div>
          <div class="tiny muted">${esc(it.spec)} × ${it.qty}${it.traceCodes?.length ? ` · 溯源码 ${it.traceCodes.length} 个` : ''}</div>
        </div>
        <div class="small">¥${(it.price * it.qty / 100).toFixed(2)}</div>
      </div>`).join('')}
    <div class="row-between mt10">
      <span class="small muted">实付</span>
      <span class="price"><span class="unit">¥</span><span class="num">${(o.payAmount / 100).toFixed(2)}</span></span>
    </div>
    <div class="btn-row mt10">
      <a class="btn sm ghost" href="#/order/${o.orderNo}">订单详情</a>
      ${o.status === 'pending_pay' ? `<button class="btn sm" data-pay="${o.orderNo}">去支付</button>` : ''}
      ${o.status === 'pending_pay' ? `<button class="btn sm outline" data-cancel="${o.orderNo}">取消订单</button>` : ''}
      ${o.status === 'shipped' ? `<button class="btn sm" data-confirm="${o.orderNo}">确认收货</button>` : ''}
      ${['paid', 'shipped', 'done'].includes(o.status) ? `<button class="btn sm outline" data-refund="${o.orderNo}">申请售后</button>` : ''}
    </div>
  </div>`;
}

export function bindOrderActions() {
  document.querySelectorAll('[data-pay]').forEach((el) => el.addEventListener('click', async () => {
    try {
      await post(`/api/orders/${el.dataset.pay}/pay`, { channel: 'mock_wechat' });
      await refreshUser();
      toast('支付成功');
      location.hash = `#/order/${el.dataset.pay}`;
    } catch { /* 已提示 */ }
  }));
  document.querySelectorAll('[data-cancel]').forEach((el) => el.addEventListener('click', async () => {
    await post(`/api/orders/${el.dataset.cancel}/cancel`);
    toast('订单已取消');
    const { render } = await import('../router.js');
    render();
  }));
  document.querySelectorAll('[data-confirm]').forEach((el) => el.addEventListener('click', async () => {
    await post(`/api/orders/${el.dataset.confirm}/confirm`);
    toast('已确认收货');
    const { render } = await import('../router.js');
    render();
  }));
  document.querySelectorAll('[data-refund]').forEach((el) => el.addEventListener('click', () => {
    const no = el.dataset.refund;
    openSheet('申请售后', `
      <div class="field">
        <label>请描述遇到的问题</label>
        <textarea class="textarea" id="refund-reason" placeholder="如：收到时瓶身破损 / 使用后出现不适"></textarea>
      </div>
      <div class="notice info mb10">提交后客服会优先处理，48 小时内与您联系。</div>
      <button class="btn block" id="refund-submit">提交申请</button>
    `, (root) => {
      root.querySelector('#refund-submit').addEventListener('click', async () => {
        const reason = root.querySelector('#refund-reason').value.trim();
        if (!reason) { toast('请填写问题描述'); return; }
        await post(`/api/orders/${no}/refund`, { reason });
        closeSheet();
        toast('售后申请已提交');
        const { render } = await import('../router.js');
        render();
      });
    });
  }));
}

/* ============================================================
 * 订单详情
 * ============================================================ */
route('/order/:no', async ({ params }) => {
  if (!state.token) return { html: loginGate('订单'), title: '订单详情', tab: 'me' };
  const o = await get(`/api/orders/${params.no}`);
  const addr = o.address || {};

  const html = `
  <div class="page">
    <div class="page-pad">
      <div class="card" style="background:${o.status === 'done' ? 'var(--ok-bg)' : 'var(--green-50)'}">
        <div class="bold" style="font-size:16px">${esc(o.statusText)}</div>
        <div class="small muted mt6">
          ${o.status === 'pending_pay' ? '请尽快完成支付，超时订单将自动关闭'
            : o.status === 'paid' ? '我们正在浒口村打包，发货后可在本页查看物流轨迹'
            : o.status === 'shipped' ? '包裹已发出，收到后可扫码验证真伪'
            : o.status === 'done' ? '感谢支持浒口村助农项目 🌱'
            : o.status === 'refunding' ? '售后处理中，客服会尽快联系您'
            : '订单已关闭'}
        </div>
      </div>

      ${o.logistics?.length ? `
      <div class="card">
        <div class="card-title">🚚 物流轨迹</div>
        <div class="timeline">
          ${[...o.logistics].reverse().map((l, i) => `
            <div class="tl-item">
              <div class="tl-dot ${i === 0 ? 'done' : ''}">${i === 0 ? '●' : ''}</div>
              <div class="tl-head" style="font-weight:${i === 0 ? 700 : 400};font-size:13px">${esc(l.text)}</div>
              <div class="tl-meta">${esc(l.time)}</div>
            </div>`).join('')}
        </div>
      </div>` : ''}

      <div class="card">
        <div class="card-title">📦 商品</div>
        ${o.items.map((it) => `
          <div class="goods-row" style="padding:9px 0">
            <div class="thumb" style="width:60px;height:60px"><img src="${it.image}" alt="" /></div>
            <div class="grow">
              <div class="small bold">${esc(it.title)}</div>
              <div class="tiny muted">${esc(it.spec)} × ${it.qty}</div>
              ${it.traceCodes?.length ? `
                <div class="mt6">
                  ${it.traceCodes.map((c) => `<a class="tag" href="#/trace?code=${c}" style="text-decoration:none">扫码溯源 ${esc(c)}</a>`).join('')}
                </div>` : ''}
            </div>
            <div class="small">¥${(it.price * it.qty / 100).toFixed(2)}</div>
          </div>`).join('')}
      </div>

      <div class="card">
        <div class="card-title">📍 收货信息</div>
        <div class="small">${esc(addr.receiver || '')} ${esc(addr.phone || '')}</div>
        <div class="small muted mt6">${esc(addr.province || '')}${esc(addr.city || '')}${esc(addr.district || '')} ${esc(addr.detail || '')}</div>
      </div>

      <div class="card">
        <div class="row-between mb6"><span class="small muted">商品金额</span><span class="small">¥${(o.goodsAmount / 100).toFixed(2)}</span></div>
        ${o.discountAmount ? `<div class="row-between mb6"><span class="small muted">优惠</span><span class="small">-¥${(o.discountAmount / 100).toFixed(2)}</span></div>` : ''}
        <div class="row-between mb6"><span class="small muted">运费</span><span class="small">${o.freight ? `¥${(o.freight / 100).toFixed(2)}` : '免运费'}</span></div>
        <div class="divider"></div>
        <div class="row-between"><span class="bold">实付金额</span>
          <span class="price"><span class="unit">¥</span><span class="num">${(o.payAmount / 100).toFixed(2)}</span></span></div>
      </div>

      <div class="card">
        <div class="card-title">🧾 订单信息</div>
        <div class="small muted">订单号：${esc(o.orderNo)}</div>
        <div class="small muted">下单时间：${esc(String(o.createdAt).replace('T', ' ').slice(0, 19))}</div>
        ${o.paidAt ? `<div class="small muted">支付时间：${esc(String(o.paidAt).replace('T', ' ').slice(0, 19))}</div>` : ''}
        <div class="small muted">销售渠道：自营商城（${esc(o.sourcePlatform)}）</div>
        ${o.remark ? `<div class="small muted">备注：${esc(o.remark)}</div>` : ''}
      </div>

      <div class="btn-row">
        ${o.status === 'pending_pay' ? `<button class="btn" data-pay="${o.orderNo}">去支付</button>` : ''}
        ${o.status === 'shipped' ? `<button class="btn" data-confirm="${o.orderNo}">确认收货</button>` : ''}
        ${['paid', 'shipped', 'done'].includes(o.status) ? `<button class="btn outline" data-refund="${o.orderNo}">申请售后</button>` : ''}
        <a class="btn ghost" href="#/ai?q=${encodeURIComponent(`订单${o.orderNo}到哪了`)}">咨询客服</a>
      </div>
    </div>
  </div>`;

  return { html, title: '订单详情', tab: 'me', mount: bindOrderActions };
});

/* ============================================================
 * 地址管理
 * ============================================================ */
route('/address', async () => {
  if (!state.token) return { html: loginGate('地址'), title: '收货地址', tab: 'me' };
  const data = await get('/api/addresses');
  const html = `
  <div class="page">
    <div class="page-pad">
      ${data.list.length ? data.list.map((a) => `
        <div class="card">
          <div class="row-between">
            <div class="grow">
              <div class="bold">${esc(a.receiver)} <span class="small muted">${esc(a.phone)}</span>
                ${a.is_default ? '<span class="tag">默认</span>' : ''}</div>
              <div class="small muted mt6">${esc(a.province)}${esc(a.city)}${esc(a.district)} ${esc(a.detail)}</div>
            </div>
            <button class="btn xs ghost" data-del="${a.id}">删除</button>
          </div>
        </div>`).join('') : '<div class="empty"><div class="ico">📍</div><p>还没有收货地址</p></div>'}
      <button class="btn block" id="add-address">新增收货地址</button>
    </div>
  </div>`;

  const mount = () => {
    document.getElementById('add-address').addEventListener('click', () => addressForm(async () => {
      const { render } = await import('../router.js');
      render();
    }));
    document.querySelectorAll('[data-del]').forEach((el) => el.addEventListener('click', async () => {
      await del(`/api/addresses/${el.dataset.del}`);
      toast('已删除');
      const { render } = await import('../router.js');
      render();
    }));
  };

  return { html, title: '收货地址', tab: 'me', mount };
});

/* ============================================================
 * 通用：底部弹层 / 地址表单 / 地址选择
 * ============================================================ */
export function openSheet(title, bodyHtml, onMount) {
  closeSheet();
  const wrap = document.createElement('div');
  wrap.className = 'sheet-mask';
  wrap.id = 'sheet-mask';
  wrap.innerHTML = `<div class="sheet"><div class="sheet-title">${title}</div>${bodyHtml}</div>`;
  document.body.appendChild(wrap);
  wrap.addEventListener('click', (e) => { if (e.target === wrap) closeSheet(); });
  if (onMount) onMount(wrap.querySelector('.sheet'));
}

export function closeSheet() {
  document.getElementById('sheet-mask')?.remove();
}

export function addressForm(onSaved) {
  openSheet('新增收货地址', `
    <div class="field"><label>收货人</label><input class="input" id="a-receiver" placeholder="姓名" /></div>
    <div class="field"><label>手机号</label><input class="input" id="a-phone" type="tel" maxlength="11" placeholder="11 位手机号" /></div>
    <div class="row" style="gap:8px">
      <div class="field grow"><label>省</label><input class="input" id="a-province" placeholder="广东省" /></div>
      <div class="field grow"><label>市</label><input class="input" id="a-city" placeholder="珠海市" /></div>
    </div>
    <div class="row" style="gap:8px">
      <div class="field grow"><label>区/县</label><input class="input" id="a-district" placeholder="香洲区" /></div>
      <div class="field grow" style="flex:2"><label>详细地址</label><input class="input" id="a-detail" placeholder="街道门牌" /></div>
    </div>
    <label class="row small" style="gap:6px;margin:2px 0 12px"><input type="checkbox" id="a-default" checked /> 设为默认地址</label>
    <button class="btn block" id="a-save">保存</button>
  `, (root) => {
    root.querySelector('#a-save').addEventListener('click', async () => {
      const body = {
        receiver: root.querySelector('#a-receiver').value.trim(),
        phone: root.querySelector('#a-phone').value.trim(),
        province: root.querySelector('#a-province').value.trim(),
        city: root.querySelector('#a-city').value.trim(),
        district: root.querySelector('#a-district').value.trim(),
        detail: root.querySelector('#a-detail').value.trim(),
        isDefault: root.querySelector('#a-default').checked,
      };
      if (!body.receiver || !body.phone || !body.province || !body.city || !body.detail) {
        toast('请填写完整地址信息');
        return;
      }
      try {
        await post('/api/addresses', body);
        closeSheet();
        toast('地址已保存');
        onSaved?.();
      } catch { /* 已提示 */ }
    });
  });
}

export function pickAddress(list, currentId, onPick) {
  openSheet('选择收货地址', `
    ${list.map((a) => `
      <div class="row-between" style="padding:11px 0;border-bottom:1px solid var(--line)">
        <div class="grow">
          <div class="bold small">${esc(a.receiver)} <span class="muted tiny">${esc(a.phone)}</span></div>
          <div class="tiny muted">${esc(a.province)}${esc(a.city)}${esc(a.district)} ${esc(a.detail)}</div>
        </div>
        <button class="btn xs ${a.id === currentId ? '' : 'outline'}" data-addr="${a.id}">${a.id === currentId ? '当前' : '选择'}</button>
      </div>`).join('')}
    <button class="btn ghost block mt10" id="addr-new">新增地址</button>
  `, (root) => {
    root.querySelectorAll('[data-addr]').forEach((el) => el.addEventListener('click', () => {
      onPick(Number(el.dataset.addr));
      closeSheet();
      toast('已切换收货地址（金额不变，可直接提交订单）');
    }));
    root.querySelector('#addr-new').addEventListener('click', () => {
      closeSheet();
      addressForm(async () => {
        const { render } = await import('../router.js');
        render();
      });
    });
  });
}

export { esc, yuan, setSession };
