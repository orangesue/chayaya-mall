/**
 * 茶芽芽商城 前端入口
 * 说明：为了做到「零构建、零网络依赖」，这里用原生 ES Module + 手写 hash 路由，
 * 不依赖 Vue/React 的构建产物，双击 public/index.html 或由后端静态托管都能直接运行。
 * 页面结构与视觉延续项目报告书中的小程序 UI 原型（图19 / image24 / image25）。
 */
import { startRouter } from './router.js';
import { refreshUser, refreshCartCount, toast, state } from './store.js';

import './views/home.js';    // 首页 / 产品中心 / 商品详情 / 抚触教程 / 品牌故事
import './views/order.js';   // 登录 / 购物车 / 结算 / 订单 / 地址
import './views/trace.js';   // 溯源频道与查询结果
import './views/ai.js';      // AI 客服
import './views/me.js';      // 我的 / 会员 / 优惠券

async function boot() {
  // 每次进入生成一个会话标识，供 AI 客服多轮对话与互动日志使用
  if (!state.sessionId) {
    const sid = `w_${Date.now().toString(36)}${Math.random().toString(36).slice(2, 8)}`;
    const { setSession } = await import('./store.js');
    setSession(sid);
  }

  /**
   * 静态演示模式（GitHub Pages / 纯静态托管）：
   * 没有 Node 后端，用浏览器本地的 API 实现替代，数据来自构建时快照。
   * 必须在任何页面发起请求之前完成安装。
   */
  const cfg = globalThis.window?.__CY_DEMO__ ?? globalThis.__CY_DEMO__;
  if (cfg?.mode) {
    try {
      const base = cfg.base || './';
      // 用页面地址解析快照路径，兼容子目录部署（GitHub Pages 的 /仓库名/）
      const snapUrl = new URL(`${base}data/api-snapshot.json`.replace(/^\/\//, '/'), location.href).href;
      const [{ installDemoApi }, snap] = await Promise.all([
        import('./demo-api.js'),
        fetch(snapUrl).then((r) => {
          if (!r.ok) throw new Error(`数据快照加载失败（HTTP ${r.status}）`);
          return r.json();
        }),
      ]);
      installDemoApi(snap);
      console.log('[demo] 已启用静态演示模式', snap.builtAt ?? '');
    } catch (e) {
      console.error('[demo] 演示模式初始化失败，将无法加载数据：', e);
      const el = document.getElementById('app');
      if (el) {
        el.innerHTML = `<div class="page"><div class="page-pad" style="padding-top:40px">
          <div class="card"><div class="card-title">😥 演示数据加载失败</div>
          <p class="small muted">${e.message}</p>
          <p class="small muted">请确认 <code>data/api-snapshot.json</code> 已随站点一起部署。</p></div></div></div>`;
      }
      return;
    }
  }

  if (state.token || cfg?.mode) {
    await refreshUser();
    await refreshCartCount();
  }

  startRouter();

  // 兼容旧版浏览器的提示
  if (!window.fetch || !window.Promise) {
    toast('当前浏览器版本过低，建议使用最新版 Chrome / Edge / 微信内置浏览器');
  }
}

boot();
