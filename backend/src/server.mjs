/** 极简 HTTP 服务：路由、静态资源、统一错误处理（零框架依赖） */
import http from 'node:http';
import fs from 'node:fs';
import path from 'node:path';
import crypto from 'node:crypto';
import { fileURLToPath } from 'node:url';
import config, { LAN_IP } from './config.mjs';
import { ok, fail, ApiError } from './http/respond.mjs';
import { readJsonBody } from './http/body.mjs';
import { registerRoutes } from './routes/index.mjs';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const PUBLIC_DIR = path.resolve(__dirname, '..', 'public');
// 前端源码目录：开发时直接由后端托管，避免"改一处要复制两份"；
// public 目录优先（放图片、检测报告等后端资源），未命中时回落到 frontend。
const FRONTEND_DIR = path.resolve(__dirname, '..', '..', 'frontend');

const MIME = {
  '.html': 'text/html; charset=utf-8',
  '.js': 'text/javascript; charset=utf-8',
  '.mjs': 'text/javascript; charset=utf-8',
  '.css': 'text/css; charset=utf-8',
  '.json': 'application/json; charset=utf-8',
  '.svg': 'image/svg+xml',
  '.png': 'image/png',
  '.jpg': 'image/jpeg',
  '.jpeg': 'image/jpeg',
  '.webp': 'image/webp',
  '.gif': 'image/gif',
  '.ico': 'image/x-icon',
  '.woff2': 'font/woff2',
  '.txt': 'text/plain; charset=utf-8',
  '.map': 'application/json; charset=utf-8',
};

/** 路由表：{ method, pattern, regex, keys, handler } */
const routes = [];

export function route(method, pattern, handler) {
  const keys = [];
  const regex = new RegExp(
    '^' + pattern.replace(/\/:([A-Za-z_][A-Za-z0-9_]*)/g, (_, k) => { keys.push(k); return '/([^/]+)'; }) + '/?$',
  );
  routes.push({ method: method.toUpperCase(), pattern, regex, keys, handler });
}

const json = (res, status, payload, extraHeaders = {}) => {
  const body = Buffer.from(JSON.stringify(payload), 'utf8');
  res.writeHead(status, {
    'Content-Type': 'application/json; charset=utf-8',
    'Content-Length': body.length,
    'Cache-Control': 'no-store',
    ...extraHeaders,
  });
  res.end(body);
};

async function serveFrom(res, req, root, rel) {
  const target = path.resolve(root, `.${rel}`);
  if (!target.startsWith(root)) return false;
  let file = target;
  if (fs.existsSync(file) && fs.statSync(file).isDirectory()) file = path.join(file, 'index.html');
  if (!fs.existsSync(file)) return false;

  const stat = fs.statSync(file);
  const ext = path.extname(file).toLowerCase();
  const etag = `W/"${stat.size}-${Number(stat.mtimeMs).toString(36)}"`;
  if (req.headers['if-none-match'] === etag) {
    res.writeHead(304).end();
    return true;
  }
  res.writeHead(200, {
    'Content-Type': MIME[ext] || 'application/octet-stream',
    'Content-Length': stat.size,
    ETag: etag,
    'Cache-Control': ext === '.html' ? 'no-cache' : 'public, max-age=3600',
  });
  fs.createReadStream(file).pipe(res);
  return true;
}

/**
 * public 目录用于存放图片、检测报告、管理后台等后端资源；
 * 根路径与前端入口必须由 frontend/index.html 提供。
 * 这里显式跳过 public 下的 index.html，避免有人再放一个占位页把应用挡住
 * （曾因为这个占位页导致浏览器一直停在骨架屏）。
 */
const isFrontendEntry = (rel) => rel === '/index.html' || rel === '/';

/** 容易手输或漏写后缀的地址，统一重定向，避免用户看到 404 */
const REDIRECTS = {
  '/admin': '/admin.html',
  '/admin/': '/admin.html',
  '/bg': '/admin.html',
  '/placeholder': '/placeholder.html',
  '/index': '/',
};

async function serveStatic(req, res, pathname) {
  let rel = decodeURIComponent(pathname);
  if (rel === '/' || rel === '') rel = '/index.html';

  // 别名重定向（301，便于浏览器记住）
  const target = REDIRECTS[rel.replace(/\/+$/, '') || '/'];
  if (target) {
    res.writeHead(302, { Location: target, 'Cache-Control': 'no-store' });
    res.end();
    return true;
  }

  if (!isFrontendEntry(rel)) {
    if (await serveFrom(res, req, PUBLIC_DIR, rel)) return true;
  }
  if (await serveFrom(res, req, FRONTEND_DIR, rel)) return true;

  // 未命中的路径交给单页应用（前端会渲染"页面不存在"），
  // 但 /admin* 未命中时给出更明确的提示，避免用户以为是主站页面
  if (rel.startsWith('/admin')) {
    res.writeHead(404, { 'Content-Type': 'text/html; charset=utf-8' });
    res.end(`<!DOCTYPE html><html lang="zh-CN"><head><meta charset="utf-8"><title>后台地址有误</title>
      <style>body{font-family:"PingFang SC",sans-serif;padding:40px;line-height:1.8;color:#23302b}
      code{background:#eef3ef;padding:2px 6px;border-radius:4px}</style></head><body>
      <h2>管理后台地址有误</h2>
      <p>正确地址是：<a href="/admin.html"><code>/admin.html</code></a></p>
      <p>演示账号：13800000001 / chayaya2026</p>
      <p><a href="/">← 返回小程序</a></p></body></html>`);
    return true;
  }
  return false;
}

/** 从请求头推断"访问者正在使用的站点地址"，用于动态生成溯源二维码 */
function deriveBaseUrl(req) {
  const proto = (req.headers['x-forwarded-proto'] || '').split(',')[0].trim()
    || (req.socket?.encrypted ? 'https' : 'http');
  const host = (req.headers['x-forwarded-host'] || req.headers.host || '').split(',')[0].trim();
  if (!host) return config.publicBaseUrl;
  return `${proto}://${host}`;
}

/* ---------------- 可选访问口令（经过 http 基本认证） ---------------- */
const accessKey = process.env.ACCESS_KEY || '';
const safeEqual = (a, b) => {
  const ba = Buffer.from(String(a));
  const bb = Buffer.from(String(b));
  if (ba.length !== bb.length) return false;
  return crypto.timingSafeEqual(ba, bb);
};

function checkAccessKey(req, res) {
  if (!accessKey) return true;

  /**
   * 本机访问免口令。
   * 注意：cloudflared 隧道是从本机 127.0.0.1 连进来的，所以不能只看 remoteAddress，
   * 否则公网流量会被误判为本机而绕过口令。判断依据改为：
   *   - 没有经由代理（无 x-forwarded-host / x-forwarded-for），且
   *   - Host 是 127.0.0.1 / localhost / 局域网 IP
   * 这两条同时成立才算本机/局域网，公网隧道访问一定会带 x-forwarded-* 头。
   */
  const host = String(req.headers.host || '');
  const hostname = host.split(':')[0];
  const viaProxy = Boolean(req.headers['x-forwarded-host'] || req.headers['x-forwarded-for'] || req.headers['cf-connecting-ip']);
  const isLocalHost = ['127.0.0.1', 'localhost', '::1', LAN_IP].includes(hostname);
  if (!viaProxy && isLocalHost) return true;

  const header = req.headers.authorization || '';
  if (header.startsWith('Basic ')) {
    const decoded = Buffer.from(header.slice(6), 'base64').toString('utf8');
    const idx = decoded.indexOf(':');
    const pass = decoded.slice(idx + 1);
    if (safeEqual(pass, accessKey)) return true;
  }
  res.writeHead(401, {
    'WWW-Authenticate': 'Basic realm="Chayaya Demo", charset="UTF-8"',
    'Content-Type': 'text/html; charset=utf-8',
  });
  res.end(`<!DOCTYPE html><html lang="zh-CN"><head><meta charset="utf-8"><title>需要访问口令</title>
    <style>body{font-family:"PingFang SC",sans-serif;padding:44px;line-height:1.9;color:#23302b;background:#fdfaf1}
    code{background:#eef3ef;padding:2px 8px;border-radius:4px;font-size:18px}</style></head><body>
    <h2>🌱 茶芽芽演示站</h2>
    <p>这是「浒口茶油·乡味新生」大学生创业项目的演示环境，需要访问口令。</p>
    <p>浏览器弹出的登录框里：<b>用户名随便填</b>，<b>密码填</b> <code>${accessKey}</code></p>
    <p style="color:#7c8a83;font-size:14px">口令由演示者提供；本机访问无需口令。</p>
    </body></html>`);
  return false;
}

export function createServer() {
  registerRoutes(route);

  return http.createServer(async (req, res) => {
    const started = Date.now();
    const url = new URL(req.url, `http://${req.headers.host || 'localhost'}`);
    const pathname = url.pathname;

    // 可选访问口令（设置了 ACCESS_KEY 环境变量才生效）
    if (!checkAccessKey(req, res)) return;

    // CORS（便于本地用浏览器 / 微信开发者工具联调）
    res.setHeader('Access-Control-Allow-Origin', req.headers.origin || '*');
    res.setHeader('Access-Control-Allow-Credentials', 'true');
    res.setHeader('Access-Control-Allow-Headers', 'Content-Type, Authorization');
    res.setHeader('Access-Control-Allow-Methods', 'GET, POST, PUT, PATCH, DELETE, OPTIONS');
    if (req.method === 'OPTIONS') {
      res.writeHead(204).end();
      return;
    }

    // 让每个请求都知道自己是通过哪个地址进来的（局域网 IP / 隧道域名 / 正式域名）
    req.baseUrl = deriveBaseUrl(req);

    try {
      if (pathname.startsWith('/api/')) {
        for (const r of routes) {
          if (r.method !== req.method) continue;
          const m = pathname.match(r.regex);
          if (!m) continue;
          const params = {};
          r.keys.forEach((k, i) => { params[k] = decodeURIComponent(m[i + 1]); });
          const body = ['POST', 'PUT', 'PATCH'].includes(req.method) ? await readJsonBody(req) : {};
          const result = await r.handler({ req, res, url, params, body, query: url.searchParams, baseUrl: req.baseUrl });
          if (res.writableEnded) return;
          if (result instanceof ApiError) throw result;
          json(res, 200, result && result.code !== undefined ? result : ok(result));
          if (!config.isProd) {
            console.log(`[api] ${req.method} ${pathname} ${Date.now() - started}ms`);
          }
          return;
        }
        json(res, 404, fail(404, `接口不存在：${req.method} ${pathname}`));
        return;
      }

      // 静态资源
      if (await serveStatic(req, res, pathname)) return;

      // 前端为单页应用：未命中的路径统一回落到 index.html（支持 /#/ 以外的直接访问）
      const indexFile = path.join(PUBLIC_DIR, 'index.html');
      if (fs.existsSync(indexFile)) {
        res.writeHead(200, { 'Content-Type': MIME['.html'], 'Cache-Control': 'no-cache' });
        fs.createReadStream(indexFile).pipe(res);
        return;
      }
      res.writeHead(404, { 'Content-Type': MIME['.txt'] });
      res.end('404 Not Found');
    } catch (err) {
      const status = err instanceof ApiError ? err.status : 500;
      const code = err instanceof ApiError ? err.code : 'INTERNAL_ERROR';
      if (status >= 500) {
        console.error(`[error] ${req.method} ${pathname}`, err);
      }
      if (!res.writableEnded) {
        json(res, status, fail(code, err.message || '服务异常', err.extra ? { detail: err.extra } : {}));
      }
    }
  });
}

export function startServer() {
  const server = createServer();
  return new Promise((resolve) => {
    server.listen(config.port, config.host, () => {
      const lanUrl = `http://${LAN_IP}:${config.port}`;
      const localUrl = `http://127.0.0.1:${config.port}`;
      console.log('');
      console.log('  🌱 茶芽芽 · 婴儿山茶抚触油全渠道商城');
      console.log(`  团队：${config.team}（团队ID ${config.teamId}）`);
      console.log('');
      console.log(`  本机访问：${localUrl}/`);
      if (config.host === '0.0.0.0') {
        console.log(`  局域网访问（同一 WiFi 的手机 / 同学电脑可直接打开）：`);
        console.log(`    用户端  ${lanUrl}/`);
        console.log(`    管理后台 ${lanUrl}/admin.html`);
        console.log(`  ⚠️ 首次访问若被 Windows 防火墙拦截，请在弹出的提示里勾选“允许访问”。`);
      }
      console.log(`  数据库：${config.db.driver}    缓存：${config.cache.driver}    环境：${config.isProd ? 'production' : 'development'}`);
      console.log(`  溯源二维码地址前缀：${config.publicBaseUrl}`);
      console.log('');
      resolve({ server, url: localUrl, lanUrl });
    });
  });
}

export { PUBLIC_DIR };
export default { createServer, startServer, route };
