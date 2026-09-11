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

  if (state.token) {
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
