/**
 * 真实浏览器端到端检查（用本机 Chrome/Edge 以无头模式打开页面）
 * 用法: node src/scripts/browser-check.mjs [url ...]
 * 默认检查本地静态站与线上 GitHub Pages 两个地址。
 *
 * 与 ui-check.mjs 的区别：
 *   ui-check 用 Node 模拟 DOM，快但要靠我自己实现环境；
 *   本脚本用真实浏览器引擎，能暴露 MIME、模块解析、CSS、真实网络等差异
 *   —— 例如"本地模拟通过但线上空白"这类问题只有它查得出来。
 */
import fs from 'node:fs';
import path from 'node:path';
import puppeteer from 'puppeteer-core';

const CANDIDATES = [
  'C:/Program Files/Google/Chrome/Application/chrome.exe',
  'C:/Program Files (x86)/Google/Chrome/Application/chrome.exe',
  'C:/Program Files (x86)/Microsoft/Edge/Application/msedge.exe',
  'C:/Program Files/Microsoft/Edge/Application/msedge.exe',
];

const targets = process.argv.slice(2).filter((a) => a.startsWith('http'));
const URLS = targets.length ? targets : [
  'http://127.0.0.1:8899/',
  'https://orangesue.github.io/chayaya-mall/',
];

const OUT = path.resolve(process.cwd(), '..', 'docs', 'screenshots');

async function main() {
  const executablePath = CANDIDATES.find((p) => fs.existsSync(p));
  if (!executablePath) {
    console.error('未找到 Chrome/Edge');
    process.exit(1);
  }
  fs.mkdirSync(OUT, { recursive: true });
  console.log(`使用浏览器：${executablePath}\n`);

  const browser = await puppeteer.launch({
    executablePath,
    headless: true,
    args: ['--no-sandbox', '--disable-gpu', '--disable-dev-shm-usage', '--hide-scrollbars'],
  });

  let bad = 0;
  for (const url of URLS) {
    const page = await browser.newPage();
    await page.setViewport({ width: 430, height: 932, deviceScaleFactor: 2, isMobile: true, hasTouch: true });
    const logs = [];
    const errors = [];
    const failed = [];
    const notFound = [];
    page.on('console', (m) => { logs.push(`[${m.type()}] ${m.text()}`); if (m.type() === 'error') errors.push(m.text()); });
    page.on('pageerror', (e) => errors.push(`pageerror: ${e.message}`));
    page.on('requestfailed', (r) => failed.push(`${r.url()} → ${r.failure()?.errorText}`));
    // 记录所有 404/500 的具体地址（仅靠控制台只说"404"，不知道是哪个文件）
    page.on('response', (r) => { if (r.status() >= 400) notFound.push(`${r.status()} ${r.url()}`); });

    console.log(`=== ${url} ===`);
    try {
      await page.goto(url, { waitUntil: 'networkidle2', timeout: 30000 });
      // 等应用渲染（最多 12 秒）
      await page.waitForFunction(
        () => document.querySelector('#app .navbar, #app .card-title, #app .chat-body, #app .empty'),
        { timeout: 12000 },
      ).catch(() => {});
      await new Promise((r) => setTimeout(r, 800));

      const info = await page.evaluate(() => ({
        hasNavbar: !!document.querySelector('#app .navbar'),
        hasContent: !!document.querySelector('#app .card-title'),
        textLength: (document.querySelector('#app')?.innerText || '').length,
        firstText: (document.querySelector('#app')?.innerText || '').replace(/\s+/g, ' ').trim().slice(0, 120),
        isDiagPanel: /应用启动失败|页面没有加载出来|脚本加载失败|脚本运行出错|异步任务出错/.test(document.querySelector('#app')?.innerText || ''),
        demoCfg: window.__CY_DEMO__ ?? null,
      }));

      const ok = info.hasNavbar && info.textLength > 300 && !info.isDiagPanel;
      if (!ok) bad += 1;
      console.log(`${ok ? '✅' : '❌'} 渲染状态：导航栏=${info.hasNavbar} 内容=${info.hasContent} 文本=${info.textLength}字`);
      console.log(`   首屏文字：${info.firstText}`);
      console.log(`   演示配置：${info.demoCfg ? JSON.stringify({ mode: info.demoCfg.mode, base: info.demoCfg.base }) : '未加载（走真实后端）'}`);
      if (info.isDiagPanel) console.log('   ⚠️ 页面显示的是错误诊断面板（说明启动失败）');
      if (errors.length) console.log(`   控制台错误 ${errors.length} 条：\n      ` + errors.slice(0, 5).join('\n      '));
      if (failed.length) console.log(`   资源加载失败 ${failed.length} 条：\n      ` + failed.slice(0, 5).join('\n      '));
      if (notFound.length) console.log(`   4xx/5xx 响应 ${notFound.length} 条：\n      ` + [...new Set(notFound)].slice(0, 10).join('\n      '));

      const shot = path.join(OUT, `live-${url.includes('github.io') ? 'pages' : 'local'}.png`);
      await page.screenshot({ path: shot, fullPage: true });
      console.log(`   截图：${shot}`);

      /**
       * 逐页检查：只验证首页不够 —— 子目录部署时，动态渲染的图片路径、
       * 页面内跳转都可能出问题（首页图片全裂、点进详情页空白都踩过）。
       */
      const routes = [
        ['#/shop', '产品中心', 200],
        ['#/product/CY-OIL-100', '商品详情', 500],
        ['#/trace', '溯源', 300],
        ['#/ai', 'AI 客服', 150],
        ['#/brand', '品牌故事', 500],
        // 「我的」在未登录时只显示登录引导，内容天然较短
        ['#/me', '我的（未登录）', 80],
      ];
      let pageFail = 0;
      for (const [hash, label, minLen] of routes) {
        const before = errors.length + notFound.length;
        await page.evaluate((h) => { location.hash = h; }, hash);
        await new Promise((r) => setTimeout(r, 1200));
        const txt = await page.evaluate(() => (document.querySelector('#app')?.innerText || '').replace(/\s+/g, ' ').trim());
        const diag = await page.evaluate(() => /应用启动失败|页面没有加载出来|脚本加载失败|脚本运行出错/.test(document.querySelector('#app')?.innerText || ''));
        const good = txt.length >= minLen && !diag;
        if (!good) pageFail += 1;
        const newIssues = (errors.length + notFound.length) - before;
        console.log(`   ${good ? '✅' : '❌'} ${label.padEnd(12)} ${String(txt.length).padStart(5)}字${newIssues ? `  （新增 ${newIssues} 条资源错误）` : ''}`);
      }
      if (pageFail) bad += 1;
      if (notFound.length) console.log(`   4xx/5xx 汇总：\n      ` + [...new Set(notFound)].slice(0, 10).join('\n      '));
    } catch (e) {
      bad += 1;
      console.log(`❌ 打开失败：${e.message}`);
    } finally {
      await page.close();
    }
    console.log('');
  }

  await browser.close();
  console.log(bad ? `有 ${bad} 个地址未正常渲染` : '全部地址渲染正常');
  process.exit(bad ? 1 : 0);
}

main().catch((e) => { console.error('检查异常：', e); process.exit(1); });
