/**
 * 二维码链路自检：生成 → 栅格化 → 用独立解码器回读
 * 用法: npm run qr:check
 *
 * jsQR / pngjs 是"验证用"的可选依赖（不参与线上运行）：
 *   npm i --no-save jsqr pngjs   # 安装后可做真实扫码回读校验
 * 未安装时退化为结构校验（版本/尺寸/静默区/容量/签名），并在输出中明确标注。
 */
import config from '../config.mjs';
import { newTraceCode, tokenForTrace, traceUrl, verifyTraceToken } from '../utils/trace-code.mjs';
import { qrEncoderName } from '../utils/qrcode.mjs';

let PNG = null;
let jsQR = null;
try {
  ({ PNG } = await import('pngjs'));
  jsQR = (await import('jsqr')).default;
} catch {
  PNG = null;
  jsQR = null;
}

const QRCode = (await import('qrcode')).default;

const code = newTraceCode(new Date('2026-01-15T00:00:00Z'), 'a1b2c3d4');
const token = tokenForTrace(code, 'CHY-20260115-01', 'SGS-2026-0115');

const cases = [
  ['短码', 'CHY26115A1B2C3', 'M'],
  ['中文内容', '茶芽芽·浒口村山茶林 溯源批次 CHY-20260115-01', 'Q'],
  ['真实溯源链接', traceUrl(token), 'M'],
  ['纠错等级 H', traceUrl(tokenForTrace('CY260115ABCDEFGH', 'CHY-20260115-02')), 'H'],
  ['长签名链接', `${traceUrl(token)}&sig=${'A'.repeat(150)}`, 'M'],
];

let pass = 0;
for (const [name, text, ecl] of cases) {
  const qr = QRCode.create(text, { errorCorrectionLevel: ecl });
  const size = qr.modules.size;
  const version = (size - 17) / 4;

  // 结构校验：定位图案 + 定时图案 + 静默区可容纳
  const at = (x, y) => Boolean(qr.modules.data[y * size + x]);
  const finderOk = at(0, 0) && at(6, 0) && at(0, 6) && !at(1, 1) && at(3, 3)
    && at(size - 1, 0) && at(size - 7, 0) && at(0, size - 1);
  const timingOk = Array.from({ length: 5 }, (_, i) => at(8 + i * 2, 6)).every(Boolean);
  const capOk = size >= 21 && size <= 177 && (version >= 1 && version <= 40);

  let scanOk = null;
  let decoded = null;
  if (PNG && jsQR) {
    const scale = 4, margin = 4;
    const dim = (size + margin * 2) * scale;
    const png = new PNG({ width: dim, height: dim });
    for (let y = 0; y < dim; y++) {
      for (let x = 0; x < dim; x++) {
        const mx = Math.floor(x / scale) - margin;
        const my = Math.floor(y / scale) - margin;
        const dark = mx >= 0 && my >= 0 && mx < size && my < size ? at(mx, my) : false;
        const idx = (y * dim + x) << 2;
        const v = dark ? 0 : 255;
        png.data[idx] = v; png.data[idx + 1] = v; png.data[idx + 2] = v; png.data[idx + 3] = 255;
      }
    }
    decoded = jsQR(new Uint8ClampedArray(png.data), dim, dim, { inversionAttempts: 'dontInvert' });
    scanOk = Boolean(decoded) && decoded.data === text;
  }

  const ok = finderOk && timingOk && capOk && (scanOk === null || scanOk === true);
  if (ok) pass += 1;
  const scanText = scanOk === null
    ? '结构校验通过（未安装 jsQR，跳过扫码回读）'
    : (scanOk ? '扫码回读一致' : `回读失败(${decoded ? decoded.data.slice(0, 30) : 'null'})`);
  console.log(`${ok ? '✅' : '❌'} ${name}：版本${version} ${size}x${size} 纠错${ecl} → ${scanText}`);
}

const good = verifyTraceToken(token);
const bad = verifyTraceToken(`${token.slice(0, -6)}AAAAAA`);
console.log(`\n防伪签名校验：正常 token → ${good?.signatureValid ? '✅ 通过' : '❌ 失败'}；篡改后 token → ${bad?.signatureValid ? '❌ 竟然通过' : '✅ 正确拒绝'}`);

const scanner = PNG && jsQR ? 'jsQR 独立解码器' : '结构校验（jsQR 未安装）';
const allOk = pass === cases.length && good?.signatureValid === true && bad?.signatureValid === false;
console.log(`二维码自检：${pass}/${cases.length} 通过（渲染器 ${qrEncoderName}，校验方式 ${scanner}，纠错等级 ${config.trace.qrEcl}）`);
process.exit(allOk ? 0 : 1);
