/**
 * 启动看门狗（经典脚本，在任何模块之前执行）
 *
 * 为什么需要它：
 *   页面用的是 ES Module。如果某个模块加载失败（404 / MIME 不对 / 语法太新 / 浏览器拦截），
 *   浏览器只会往控制台丢一个错误，页面就一直停在骨架屏上，看起来"啥也没有"。
 *   在没有电脑浏览器控制台的情况下（比如评委用手机打开、或远程求助），
 *   这种"空白"完全无法排查。
 *
 * 这个脚本做两件事：
 *   1) 捕获所有脚本错误与未处理的 Promise 异常，直接画在页面上；
 *   2) 8 秒后如果应用仍未渲染，就显示诊断面板（含地址、UA、已加载脚本清单）。
 */
(function () {
  var app = document.getElementById('app');
  var started = Date.now();
  var painted = false;

  function esc(s) {
    return String(s == null ? '' : s)
      .replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/"/g, '&quot;');
  }

  /** 应用已经渲染出内容了吗（骨架屏也算未渲染） */
  function hasRendered() {
    if (!app) return false;
    // 只要出现卡片标题、导航栏或聊天区，就算渲染成功
    return !!app.querySelector('.navbar') || !!app.querySelector('.card-title') || !!app.querySelector('.chat-body');
  }

  function panel(title, detail, hint) {
    if (painted || hasRendered()) return;
    painted = true;
    app.innerHTML =
      '<div class="page"><div class="page-pad" style="padding-top:28px">' +
      '<div class="card" style="border-left:4px solid #d0453b">' +
      '<div class="card-title">' + esc(title) + '</div>' +
      '<div class="small" style="color:#d0453b;word-break:break-all">' + esc(detail) + '</div>' +
      (hint ? '<div class="small muted" style="margin-top:6px">' + esc(hint) + '</div>' : '') +
      '<details style="margin-top:10px"><summary class="small muted">技术细节（截图给开发者）</summary>' +
      '<div class="tiny" style="word-break:break-all;background:#f6f8f7;padding:8px;border-radius:8px;margin-top:6px;white-space:pre-wrap">' +
      '地址：' + esc(location.href) + '\n' +
      'UA：' + esc(navigator.userAgent) + '\n' +
      '耗时：' + (Date.now() - started) + 'ms\n' +
      '演示配置：' + esc(window.__CY_DEMO__ ? JSON.stringify(window.__CY_DEMO__) : '（未加载 config.js）') + '\n' +
      '模块支持：' + (typeof window.fetch === 'function' ? 'fetch 可用' : 'fetch 不可用') +
      (window.Promise ? ' / Promise 可用' : ' / Promise 不可用') + '\n' +
      '错误：' + esc(detail) +
      '</div></details>' +
      '<button class="btn ghost block" style="margin-top:10px" onclick="location.reload()">重新加载</button>' +
      '</div></div></div>';
  }

  window.addEventListener('error', function (e) {
    if (e && e.target && e.target.tagName === 'SCRIPT') {
      panel('脚本加载失败', (e.target.src || '') + ' 未能加载', '可能是部署产物不完整，或网络拦截了该文件');
      return;
    }
    panel('脚本运行出错', (e && (e.message || (e.error && e.error.message))) || '未知错误');
  }, true);

  window.addEventListener('unhandledrejection', function (e) {
    var r = e && e.reason;
    panel('异步任务出错', (r && (r.message || r)) || '未知错误');
  });

  /** 看门狗：8 秒仍未渲染就报诊断，而不是留一个空白页 */
  setTimeout(function () {
    if (hasRendered()) return;
    var scripts = Array.prototype.map.call(document.scripts, function (s) {
      return (s.src || 'inline') + (s.type ? ' [' + s.type + ']' : '');
    }).join('\n');
    panel(
      '页面没有加载出来',
      '等待 8 秒后仍未渲染出内容',
      '可能原因：① 某个模块文件加载失败 ② 浏览器版本过旧 ③ 网络被拦截。请把下面的细节截图发给开发者。'
    );
    var details = app && app.querySelector('details .tiny');
    if (details) details.textContent += '\n脚本清单：\n' + scripts;
  }, 8000);
})();
