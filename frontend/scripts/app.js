/**
 * 茶芽芽商城 前端入口
 * 说明：为了做到「零构建、零网络依赖」，这里用原生 ES Module + 手写 hash 路由。
 * 页面结构与视觉延续项目报告书中的小程序 UI 原型（图19 / image24 / image25）。
 *
 * 启动顺序（很重要）：
 *   1) 若处于静态演示模式（window.__CY_DEMO__.mode），先装好浏览器端 API 与数据快照，
 *      必须在任何页面发起请求之前完成；
 *   2) 再同步登录态与购物车角标（失败不阻塞渲染）；
 *   3) 最后启动路由渲染页面。
 * 任何一步失败都会把原因显示在页面上，而不是留下一个空白页 —— 远程排查时这是关键。
 */
import { startRouter } from './router.js';
import { refreshUser, refreshCartCount, toast, state } from './store.js';

import './views/home.js';    // 首页 / 产品中心 / 商品详情 / 抚触教程 / 品牌故事
import './views/order.js';   // 登录 / 购物车 / 结算 / 订单 / 地址
import './views/trace.js';   // 溯源频道与查询结果
import './views/ai.js';      // AI 客服
import './views/me.js';      // 我的 / 会员 / 优惠券

const bootLog = [];
const note = (msg) => { bootLog.push(`${new Date().toISOString().slice(11, 19)} ${msg}`); };

/** 把启动失败原因直接渲染到页面（骨架屏之外一定看得见） */
function showFatal(err, hint = '') {
  const el = document.getElementById('app');
  const detail = err?.stack || err?.message || String(err);
  const html = `
  <div class="page"><div class="page-pad" style="padding-top:32px">
    <div class="card" style="border-left:4px solid var(--danger)">
      <div class="card-title">😥 应用启动失败</div>
      <div class="small" style="color:var(--danger);word-break:break-all">${escapeHtml(err?.message || String(err))}</div>
      ${hint ? `<div class="small muted mt6">${escapeHtml(hint)}</div>` : ''}
      <details class="mt10"><summary class="small muted">技术细节（截图给开发者）</summary>
        <pre class="tiny" style="white-space:pre-wrap;word-break:break-all;background:#f6f8f7;padding:8px;border-radius:8px;margin-top:6px">${escapeHtml(detail)}</pre>
        <pre class="tiny" style="white-space:pre-wrap;background:#f6f8f7;padding:8px;border-radius:8px">启动日志：
${escapeHtml(bootLog.join('\n') || '（无）')}</pre>
        <div class="tiny muted">地址：${escapeHtml(location.href)}<br />UA：${escapeHtml(navigator.userAgent)}</div>
      </details>
      <button class="btn ghost block mt10" onclick="location.reload()">重新加载</button>
    </div>
  </div></div>`;
  if (el) el.innerHTML = html;
  // 同时打到控制台，便于手机远程调试
  console.error('[boot] 启动失败：', err);
}

function escapeHtml(s) {
  return String(s ?? '').replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/"/g, '&quot;');
}

// 兜底：模块加载阶段的错误（例如某个 import 404 / 语法错误）也要看得见
window.addEventListener('error', (e) => {
  if (document.querySelector('#app .card-title')) return;   // 已经开始渲染就不再覆盖
  showFatal(e.error ?? new Error(e.message || '资源加载失败'), '可能是某个脚本文件加载失败（检查网络或部署产物完整性）');
});
window.addEventListener('unhandledrejection', (e) => {
  if (document.querySelector('#app .card-title')) return;
  showFatal(e.reason ?? new Error('未处理的异步错误'));
});

async function boot() {
  note('boot() 开始');
  const cfg = globalThis.window?.__CY_DEMO__ ?? globalThis.__CY_DEMO__;
  note(`演示模式配置：${cfg ? JSON.stringify({ mode: cfg.mode, base: cfg.base }) : '未找到（走真实后端）'}`);

  // 每次进入生成一个会话标识，供 AI 客服多轮对话与互动日志使用
  if (!state.sessionId) {
    const sid = `w_${Date.now().toString(36)}${Math.random().toString(36).slice(2, 8)}`;
    const { setSession } = await import('./store.js');
    setSession(sid);
  }

  /**
   * 静态演示模式（GitHub Pages / 纯静态托管）：
   * 没有 Node 后端，用浏览器本地的 API 实现替代，数据来自构建时快照。
   */
  if (cfg?.mode) {
    note('进入静态演示模式分支');
    const base = cfg.base || './';
    const snapUrl = new URL(`${base}data/api-snapshot.json`.replace(/^\/\//, '/'), location.href).href;
    note(`快照地址：${snapUrl}`);
    let snap;
    try {
      const res = await fetch(snapUrl, { cache: 'no-store' });
      if (!res.ok) throw new Error(`数据快照加载失败（HTTP ${res.status}）`);
      snap = await res.json();
      note(`快照已加载：商品 ${snap.products?.length ?? 0} 个`);
    } catch (e) {
      showFatal(e, '演示数据（data/api-snapshot.json）没有加载成功，可能是部署产物不完整');
      return;
    }
    try {
      const { installDemoApi } = await import('./demo-api.js');
      installDemoApi(snap);
      note('浏览器端 API 已安装');
      console.log('[demo] 已启用静态演示模式', snap.builtAt ?? '');
    } catch (e) {
      showFatal(e, '浏览器端 API 模块加载失败');
      return;
    }
  }

  /**
   * 同步登录态与购物车（可选步骤：失败不能阻塞页面渲染，
   * 否则会在某些浏览器上表现为"永远停在加载中"）。
   */
  try {
    if (state.token || cfg?.mode) {
      await Promise.race([
        (async () => { await refreshUser(); await refreshCartCount(); })(),
        new Promise((r) => setTimeout(r, 2500)),
      ]);
    }
  } catch (e) {
    note(`同步登录态失败（已忽略）：${e.message}`);
  }

  startRouter();
  note('路由已启动');
  console.log('[boot] 完成\n' + bootLog.join('\n'));
}

boot().catch((e) => showFatal(e, '启动过程中出现未预期的错误'));
