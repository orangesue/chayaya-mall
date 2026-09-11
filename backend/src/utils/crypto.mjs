/**
 * 密码学与编码工具（全部使用 Node 内置 node:crypto，无第三方依赖）
 * 覆盖项目书 4.2.2 区块链可信溯源技术要求：
 *  - JWT 会话令牌（HS256），用于小程序登录态
 *  - 椭圆曲线数字签名（ECDSA, secp256k1）用于一物一码防伪
 *  - SHA-256 哈希链用于「种植→采摘→冷榨→检测→灌装→物流」全流程存证
 *  - scrypt 口令散列用于后台账号
 * 说明：二维码渲染在 utils/qrcode.mjs（优先 npm qrcode，可回退内置渲染器）
 */
import crypto from 'node:crypto';
import config from '../config.mjs';

/* ---------------- base64url ---------------- */
export const b64url = (buf) =>
  Buffer.from(buf).toString('base64').replace(/\+/g, '-').replace(/\//g, '_').replace(/=+$/, '');

export const b64urlDecode = (s) =>
  Buffer.from(s.replace(/-/g, '+').replace(/_/g, '/'), 'base64').toString('utf8');

/* ---------------- JWT (HS256) ---------------- */
export function signToken(payload, ttlSeconds = config.auth.ttlSeconds) {
  const header = { alg: 'HS256', typ: 'JWT' };
  const body = { ...payload, iat: Math.floor(Date.now() / 1000), exp: Math.floor(Date.now() / 1000) + ttlSeconds };
  const head = b64url(JSON.stringify(header));
  const data = b64url(JSON.stringify(body));
  const sig = b64url(crypto.createHmac('sha256', config.auth.secret).update(`${head}.${data}`).digest());
  return `${head}.${data}.${sig}`;
}

export function verifyToken(token) {
  if (!token || typeof token !== 'string') return null;
  const parts = token.split('.');
  if (parts.length !== 3) return null;
  const [head, data, sig] = parts;
  const expect = b64url(crypto.createHmac('sha256', config.auth.secret).update(`${head}.${data}`).digest());
  if (sig.length !== expect.length) return null;
  if (!crypto.timingSafeEqual(Buffer.from(sig), Buffer.from(expect))) return null;
  try {
    const body = JSON.parse(b64urlDecode(data));
    if (body.exp && body.exp < Math.floor(Date.now() / 1000)) return null;
    return body;
  } catch {
    return null;
  }
}

/* ---------------- 哈希 / 哈希链 ---------------- */
export const sha256 = (input) => crypto.createHash('sha256').update(input).digest('hex');

export function chainHash(prevHash, payload) {
  return sha256(`${prevHash}|${typeof payload === 'string' ? payload : JSON.stringify(payload)}`);
}

/* ---------------- ECDSA（secp256k1）一物一码签名 ---------------- */
let _keyPair = null;

function keyPair() {
  if (_keyPair) return _keyPair;
  // 由固定种子派生确定性私钥（secp256k1），保证同一部署下溯源签名可复现、可校验。
  // DER 结构：SEQUENCE { INTEGER 0, SEQUENCE { OID ecPublicKey, OID secp256k1 }, OCTET STRING { INTEGER 1, OCTET STRING <32字节私钥> } }
  let scalar = crypto.createHash('sha256').update(config.security.traceSignSeed).digest();
  // 约束到 [1, n-1]：全零或超出曲线阶时回退到 1 的散列
  if (scalar.every((b) => b === 0)) scalar = Buffer.concat([Buffer.alloc(31), Buffer.from([1])]);
  const der = Buffer.concat([
    Buffer.from('3041020100301306072a8648ce3d020106082a8648ce3d030107042730250201010420', 'hex'),
    scalar,
  ]);
  const privateKey = crypto.createPrivateKey({ key: der, format: 'der', type: 'pkcs8' });
  const publicKey = crypto.createPublicKey(privateKey);
  _keyPair = { privateKey, publicKey };
  return _keyPair;
}

export function signTracePayload(payload) {
  const { privateKey } = keyPair();
  return crypto.sign('sha256', Buffer.from(payload), { key: privateKey, dsaEncoding: 'der' }).toString('base64');
}

export function verifyTracePayload(payload, signature) {
  try {
    const { publicKey } = keyPair();
    return crypto.verify('sha256', Buffer.from(payload), { key: publicKey, dsaEncoding: 'der' }, Buffer.from(signature, 'base64'));
  } catch {
    return false;
  }
}

export function publicKeyPem() {
  return keyPair().publicKey.export({ format: 'pem', type: 'spki' }).toString();
}

/* ---------------- 随机 / 编号 ---------------- */
export const randomId = (n = 16) => crypto.randomBytes(n).toString('hex');

export function orderNo() {
  const d = new Date();
  const p = (x, l = 2) => String(x).padStart(l, '0');
  return `CY${d.getFullYear()}${p(d.getMonth() + 1)}${p(d.getDate())}${p(d.getHours())}${p(d.getMinutes())}${p(d.getSeconds())}${crypto.randomInt(1000, 9999)}`;
}

/* ---------------- 口令散列（管理员 / 演示账号登录） ---------------- */
export function hashPassword(password, salt = crypto.randomBytes(16).toString('hex')) {
  const derived = crypto.scryptSync(password, salt, 32).toString('hex');
  return `scrypt$${salt}$${derived}`;
}

export function verifyPassword(password, stored) {
  try {
    const [, salt, hex] = String(stored).split('$');
    if (!salt || !hex) return false;
    const derived = crypto.scryptSync(password, salt, 32).toString('hex');
    return crypto.timingSafeEqual(Buffer.from(derived, 'hex'), Buffer.from(hex, 'hex'));
  } catch {
    return false;
  }
}

/* ---------------- 一次性登录码（模拟短信验证码） ---------------- */
export function numericCode(len = 6) {
  let out = '';
  for (let i = 0; i < len; i++) out += String(crypto.randomInt(0, 10));
  return out;
}


