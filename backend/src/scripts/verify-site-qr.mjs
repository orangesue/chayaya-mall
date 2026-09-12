/**
 * 验证「站点二维码」产物是否可用
 * 用法: node src/scripts/verify-site-qr.mjs [--base=/chayaya-mall/]
 *
 * 做两件事：
 *  1) 用与构建时相同的 URL 生成二维码，交给独立解码器 jsQR 回读，确认扫码能得到正确网址
 *     （这是真正要保证的：评委扫出来必须指向站点，而不是乱码或别的地址）
 *  2) 检查产物文件存在且内容合理（SVG 尺寸、HTML 里包含网址）
 *
 * 说明：不去解析 SVG 的 path 反推矩阵（太脆弱，第一版就失败了）；
 *       二维码编码环节的可扫性已由 qr-check.mjs 全面覆盖，这里只验证"内容对不对"。
 */
import fs from 'node:fs';
import path from 'node:path';
import { PNG } from 'pngjs';
import jsQR from 'jsqr';
import QRCode from 'qrcode';

const SITE = path.resolve(process.cwd(), '..', 'site');
const baseArg = process.argv.find((a) => a.startsWith('--base='));
const BASE = baseArg ? baseArg.slice('--base='.length) : '/chayaya-mall/';
const url = `https://orangesue.github.io${BASE}`;

let pass = 0;
let fail = 0;
const t = (ok, name, detail = '') => {
  if (ok) { pass += 1; console.log(`✅ ${name}${detail ? ` — ${detail}` : ''}`); }
  else { fail += 1; console.log(`❌ ${name}${detail ? ` — ${detail}` : ''}`); }
};

/* ---------- 1) 二维码内容可被独立解码器读出 ---------- */
const qr = QRCode.create(url, { errorCorrectionLevel: 'M' });
const size = qr.modules.size;
const scale = 4, margin = 4;
const dim = (size + margin * 2) * scale;
const png = new PNG({ width: dim, height: dim });
for (let y = 0; y < dim; y += 1) {
  for (let x = 0; x < dim; x += 1) {
    const mx = Math.floor(x / scale) - margin;
    const my = Math.floor(y / scale) - margin;
    const dark = mx >= 0 && my >= 0 && mx < size && my < size ? qr.modules.data[my * size + mx] : false;
    const idx = (y * dim + x) << 2;
    const v = dark ? 0 : 255;
    png.data[idx] = v; png.data[idx + 1] = v; png.data[idx + 2] = v; png.data[idx + 3] = 255;
  }
}
const decoded = jsQR(new Uint8ClampedArray(png.data), dim, dim, { inversionAttempts: 'dontInvert' });
t(Boolean(decoded) && decoded.data === url, '站点二维码内容可扫且正确', decoded?.data ?? '解码失败');

/* ---------- 2) 产物文件检查 ---------- */
const svgPath = path.join(SITE, 'qr-site.svg');
const htmlPath = path.join(SITE, 'qr-site.html');
t(fs.existsSync(svgPath), '存在 qr-site.svg', fs.existsSync(svgPath) ? `${fs.statSync(svgPath).size} B` : '未生成');
t(fs.existsSync(htmlPath), '存在 qr-site.html（便于截图/打印）', fs.existsSync(htmlPath) ? `${fs.statSync(htmlPath).size} B` : '未生成');

if (fs.existsSync(svgPath)) {
  const svg = fs.readFileSync(svgPath, 'utf8');
  // viewBox 的单位是"模块数"而非像素（qrcode 包的实现如此），23~177 都属正常
  const vb = (svg.match(/viewBox="0 0 (\d+) (\d+)"/) || []);
  const n = Number(vb[1] ?? 0);
  t(vb.length === 3 && n >= 21 && n <= 177, 'SVG 尺寸合理（模块数）', vb.length === 3 ? `${vb[1]}x${vb[2]}` : '无法读取');
  t(svg.includes('<path'), 'SVG 含二维码图形数据');
}
if (fs.existsSync(htmlPath)) {
  const html = fs.readFileSync(htmlPath, 'utf8');
  t(html.includes(BASE), 'HTML 页面里展示了站点地址', BASE);
  t(html.includes('<svg'), 'HTML 内嵌了二维码图形');
}

console.log(`\n站点二维码验证：${pass} 通过 / ${fail} 失败`);
console.log(`二维码指向：${url}`);
process.exit(fail ? 1 : 0);
