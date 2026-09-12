/**
 * 极简静态文件服务器（用于本地验证静态演示站，不参与线上运行）
 * 用法: node src/scripts/serve-static.mjs [目录] [端口] [--prefix=/chayaya-mall]
 *
 * --prefix 用于模拟 GitHub Pages 的"子目录部署"：
 *   本地根路径能跑通，不代表子目录部署也能跑通（路径解析完全不同）。
 *   这个开关就是为了复现线上环境，避免"本地好好的、线上空白"。
 */
import http from 'node:http';
import fs from 'node:fs';
import path from 'node:path';

const args = process.argv.slice(2);
const prefixArg = args.find((a) => a.startsWith('--prefix='));
const PREFIX = prefixArg ? prefixArg.slice('--prefix='.length).replace(/\/$/, '') : '';
const positional = args.filter((a) => !a.startsWith('--'));
const ROOT = path.resolve(positional[0] ?? path.resolve(process.cwd(), '..', 'site'));
const PORT = Number(positional[1] ?? 8899);

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
  '.ico': 'image/x-icon',
  '.txt': 'text/plain; charset=utf-8',
};

const server = http.createServer((req, res) => {
  let rel = decodeURIComponent(new URL(req.url, 'http://x').pathname);

  // 模拟子目录部署：带 prefix 的请求才进入站点，其余返回 404
  if (PREFIX) {
    if (rel === PREFIX || rel === `${PREFIX}/`) rel = '/';
    else if (rel.startsWith(`${PREFIX}/`)) rel = rel.slice(PREFIX.length);
    else if (rel === '/') {
      // 访问根路径时给出与 GitHub Pages 类似的提示
      res.writeHead(404, { 'Content-Type': MIME['.txt'] });
      res.end(`404 Not Found（本站部署在子目录 ${PREFIX}/，请访问 http://127.0.0.1:${PORT}${PREFIX}/）`);
      return;
    } else {
      const notFound = path.join(ROOT, '404.html');
      res.writeHead(404, { 'Content-Type': MIME['.html'] });
      res.end(fs.existsSync(notFound) ? fs.readFileSync(notFound) : '404 Not Found');
      return;
    }
  }

  if (rel.endsWith('/')) rel += 'index.html';
  let file = path.resolve(ROOT, `.${rel}`);

  // 目录 → index.html；未命中 → 404.html（模拟 GitHub Pages 行为）
  if (fs.existsSync(file) && fs.statSync(file).isDirectory()) file = path.join(file, 'index.html');
  if (!fs.existsSync(file)) {
    const notFound = path.join(ROOT, '404.html');
    if (fs.existsSync(notFound)) {
      res.writeHead(404, { 'Content-Type': MIME['.html'] });
      res.end(fs.readFileSync(notFound));
      return;
    }
    res.writeHead(404, { 'Content-Type': MIME['.txt'] });
    res.end('404 Not Found');
    return;
  }
  if (!file.startsWith(ROOT)) {
    res.writeHead(403).end('forbidden');
    return;
  }
  const ext = path.extname(file).toLowerCase();
  res.writeHead(200, { 'Content-Type': MIME[ext] || 'application/octet-stream', 'Cache-Control': 'no-store' });
  res.end(fs.readFileSync(file));
});

server.listen(PORT, '127.0.0.1', () => {
  console.log(`静态服务器已启动：http://127.0.0.1:${PORT}${PREFIX}/  根目录 ${ROOT}${PREFIX ? `  子目录前缀 ${PREFIX}` : ''}`);
});
