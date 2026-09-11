/**
 * 一物一码：溯源码生成、ECDSA 签名与防伪链接（项目书 4.2.2）
 *
 * 设计对齐项目书原文：
 *  - "唯一加密二维码赋码技术"：每个单品一个 trace_code
 *  - "基于椭圆曲线数字签名算法（ECDSA）"：对 (溯源码, 批次号, 检验哈希) 签名
 *  - 扫码链接形如 {PUBLIC_BASE}/#/trace/{trace_code}?t={token}
 *    其中 token 携带签名，服务端校验签名后才展示溯源信息，复制二维码无法伪造
 */
import config from '../config.mjs';
import { signTracePayload, verifyTracePayload, sha256 } from './crypto.mjs';

/** 生成溯源码：CY + 版本位 + YYMMDD + 8 位随机十六进制 */
export function newTraceCode(date = new Date(), rand) {
  const p = (x, l = 2) => String(x).padStart(l, '0');
  const rnd = (rand || Math.random().toString(16).slice(2)).replace(/[^0-9a-f]/gi, '').padEnd(8, '0').slice(0, 8).toUpperCase();
  return `CY${p(date.getFullYear() % 100)}${p(date.getMonth() + 1)}${p(date.getDate())}${rnd}`;
}

/** 签名的原文：溯源码|批次号|检验哈希 */
export function tracePayload(traceCode, batchNo, inspectionNo = '') {
  return `${traceCode}|${batchNo}|${inspectionNo}`;
}

/** 生成可校验的取码 token（二维码内容的一部分，防复制伪造） */
export function tokenForTrace(traceCode, batchNo = '', inspectionNo = '') {
  const sig = signTracePayload(tracePayload(traceCode, batchNo, inspectionNo));
  return Buffer.from(`${traceCode}|${batchNo}|${inspectionNo}|${sig}`, 'utf8')
    .toString('base64')
    .replace(/\+/g, '-')
    .replace(/\//g, '_')
    .replace(/=+$/, '');
}

/** 校验 token 是否由本系统签发 */
export function verifyTraceToken(token) {
  try {
    const raw = Buffer.from(token.replace(/-/g, '+').replace(/_/g, '/'), 'base64').toString('utf8');
    const [traceCode, batchNo, inspectionNo, sig] = raw.split('|');
    if (!traceCode || !sig) return null;
    const ok = verifyTracePayload(tracePayload(traceCode, batchNo, inspectionNo), sig);
    return ok ? { traceCode, batchNo, inspectionNo, signatureValid: true } : { traceCode, batchNo, inspectionNo, signatureValid: false };
  } catch {
    return null;
  }
}

/** 公开站点的溯源页地址（打印二维码用） */
export function traceUrl(token, base = config.publicBaseUrl) {
  return `${base}/#/trace?t=${token}`;
}

/** 计算链上存证哈希（哈希链，用于防篡改比对） */
export function computeChainHash(prevHash, eventPayload) {
  return sha256(`${prevHash}|${JSON.stringify(eventPayload)}`);
}

export default { newTraceCode, tokenForTrace, verifyTraceToken, traceUrl, computeChainHash, tracePayload };
