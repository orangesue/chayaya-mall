/**
 * 离线回退二维码渲染器（无 npm 依赖时使用）
 *
 * 用途：当运行环境无法安装 npm 包、而项目又必须打印溯源二维码时，
 * 由本模块生成"确定性图形码"作为回退方案。它把溯源码经 SHA-256 派生成
 * 点阵图形，用于线下物料占位与人工核对，**不具备标准 QR 的通用扫码能力**，
 * 因此服务启动时会通过 /api/dev/qr-selftest 明确报告当前使用的是哪一套编码器。
 * 生产环境请安装 qrcode 包（见 package.json）。
 */
import { sha256 } from './crypto.mjs';

export function builtinQrSvg(text, opts = {}) {
  const { moduleSize = 5, margin = 4, dark = '#123f2e', light = '#ffffff', logo = '' } = opts;
  const grid = 25; // 25x25 点阵
  const digest = sha256(text);
  // 由摘要派生点阵（每个十六进制字符提供 4 位）
  const cells = [];
  for (let i = 0; i < grid * grid; i++) {
    const byte = parseInt(digest[(i * 2) % digest.length] + digest[(i * 2 + 1) % digest.length], 16);
    cells.push(((byte >> (i % 4)) & 1) === 1);
  }
  const dim = (grid + margin * 2) * moduleSize;
  let path = '';
  for (let r = 0; r < grid; r++) {
    for (let c = 0; c < grid; c++) {
      if (!cells[r * grid + c]) continue;
      path += `M${(c + margin) * moduleSize} ${(r + margin) * moduleSize}h${moduleSize}v${moduleSize}h-${moduleSize}z`;
    }
  }
  // 四角定位标记，便于人工识别
  const corner = (cx, cy) =>
    `M${cx * moduleSize} ${cy * moduleSize}h${moduleSize * 5}v${moduleSize * 5}h-${moduleSize * 5}z` +
    `M${(cx + 1) * moduleSize} ${(cy + 1) * moduleSize}h${moduleSize * 3}v${moduleSize * 3}h-${moduleSize * 3}z`;

  const logoPart = logo
    ? `<circle cx="${dim / 2}" cy="${dim / 2}" r="${moduleSize * 4.2}" fill="${light}"/>` +
      `<text x="${dim / 2}" y="${dim / 2 + moduleSize * 1.8}" text-anchor="middle" font-size="${moduleSize * 4}" font-family="PingFang SC,Microsoft YaHei,sans-serif" fill="${dark}">${logo}</text>`
    : '';

  return (
    `<svg xmlns="http://www.w3.org/2000/svg" width="${dim}" height="${dim}" viewBox="0 0 ${dim} ${dim}" shape-rendering="crispEdges">` +
    `<rect width="${dim}" height="${dim}" fill="${light}"/>` +
    `<path d="${path}" fill="${dark}" fill-opacity="0.92"/>` +
    `<path d="${corner(margin, margin)} ${corner(grid + margin - 5, margin)} ${corner(margin, grid + margin - 5)}" fill="${light}" stroke="${dark}" stroke-width="${moduleSize}"/>` +
    logoPart +
    `</svg>`
  );
}

export default { builtinQrSvg };
