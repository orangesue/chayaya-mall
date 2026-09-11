/**
 * 二维码工具（项目书 4.2.2「防篡改数字身份编码技术」的渲染层）
 *
 * 实现选型说明（如实记录，便于评审追问）：
 *  - 首选 npm 包 qrcode（纯 JS、无运行时依赖、ISO/IEC 18004 完整实现），
 *    其产物已由独立解码器 jsQR 交叉验证（npm run qr:check），确保打印后真的扫得出来。
 *  - 若运行环境装不上 npm 依赖（如离线机房），自动回退到内置的
 *    builtinQrSvg() 图形码，功能不中断，但该回退码不保证通用扫码器可读，
 *    因此 /api/dev/qr-selftest 会在页面上明确显示当前使用的渲染器。
 */
import { createRequire } from 'node:module';

const require = createRequire(import.meta.url);

let qrcodeLib = null;
try {
  qrcodeLib = require('qrcode');
} catch {
  qrcodeLib = null;
}

export const qrEncoderName = qrcodeLib ? 'npm:qrcode' : 'builtin:fallback';

const DEFAULTS = {
  ecl: 'M',
  margin: 4,
  dark: '#123f2e',
  light: '#ffffff',
  moduleSize: 6,
  logo: '',
};

/**
 * 生成二维码 SVG
 * @param {string} text
 * @param {{ecl?:string, margin?:number, dark?:string, light?:string, moduleSize?:number, logo?:string, width?:number}} [opts]
 * @returns {Promise<string>}
 */
export async function qrSvg(text, opts = {}) {
  const o = { ...DEFAULTS, ...opts };
  if (qrcodeLib) {
    return qrcodeLib.toString(text, {
      type: 'svg',
      errorCorrectionLevel: o.ecl,
      margin: o.margin,
      ...(o.width ? { width: o.width } : {}),
      color: { dark: o.dark, light: o.light },
    });
  }
  const { builtinQrSvg } = await import('./qrcode-builtin.mjs');
  return builtinQrSvg(text, o);
}

/** 生成 data URL（可直接写进 <img src>） */
export async function qrDataUrl(text, opts = {}) {
  const svg = await qrSvg(text, opts);
  return `data:image/svg+xml;base64,${Buffer.from(svg, 'utf8').toString('base64')}`;
}

export default { qrSvg, qrDataUrl, qrEncoderName };
