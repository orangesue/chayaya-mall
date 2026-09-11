/** 登录态与权限：JWT 校验 + 用户装载 + 会员等级计算 */
import config from '../config.mjs';
import { get, run } from '../db/index.mjs';
import { verifyToken, signToken, verifyPassword, numericCode } from '../utils/crypto.mjs';
import { nowIso } from '../utils/datetime.mjs';
import { unauthorized, forbidden, badRequest } from './respond.mjs';
import { getCache } from '../db/cache.mjs';

export const DEMO_LOGIN_CODE = '123456';

/** 从请求头 / query / cookie 中解析 token */
export function extractToken(req, url) {
  const header = req.headers.authorization || req.headers.Authorization || '';
  if (header.startsWith('Bearer ')) return header.slice(7).trim();
  const q = url?.searchParams?.get('token');
  if (q) return q;
  const cookie = req.headers.cookie || '';
  const m = cookie.match(/(?:^|;\s*)cy_token=([^;]+)/);
  return m ? decodeURIComponent(m[1]) : null;
}

function shapeUser(row) {
  if (!row) return null;
  return {
    id: row.id,
    nickname: row.nickname,
    phone: row.phone ? `${row.phone.slice(0, 3)}****${row.phone.slice(-4)}` : '',
    phoneRaw: row.phone,
    avatar: row.avatar || '/assets/img/image20.png',
    babyBirth: row.baby_birth,
    tierCode: row.tier_code,
    totalPaid: row.total_paid,
    points: row.points,
    role: row.role,
  };
}

/** 解析当前登录用户（未登录返回 null） */
export async function currentUser(req, url) {
  const token = extractToken(req, url);
  if (!token) return null;
  const payload = verifyToken(token);
  if (!payload?.uid) return null;
  const row = await get('SELECT * FROM users WHERE id = ?', [payload.uid]);
  return row || null;
}

export async function requireUser(req, url) {
  const user = await currentUser(req, url);
  if (!user) throw unauthorized();
  return user;
}

export async function requireAdmin(req, url) {
  const user = await requireUser(req, url);
  if (user.role !== 'admin') throw forbidden('该操作仅限管理员');
  return user;
}

export function issueToken(user) {
  return signToken({ uid: user.id, role: user.role });
}

/** 登录：手机号 + 密码 / 验证码（演示模式下验证码固定 123456） */
export async function loginByPassword(phone, password) {
  const row = await get('SELECT * FROM users WHERE phone = ?', [phone]);
  if (!row) throw badRequest('该手机号尚未注册');
  if (!row.password_hash || !verifyPassword(password, row.password_hash)) throw badRequest('密码不正确');
  return { token: issueToken(row), user: shapeUser(row) };
}

/** 发送登录验证码（演示环境不真正发短信，直接返回验证码） */
export async function sendLoginCode(phone) {
  if (!/^1\d{10}$/.test(String(phone))) throw badRequest('手机号格式不正确');
  const code = config.isProd ? numericCode(6) : DEMO_LOGIN_CODE;
  await getCache().set(`login:code:${phone}`, code, 300);
  return { code: config.isProd ? undefined : code, ttl: 300 };
}

/** 验证码登录（不存在则自动注册，会员默认新芽） */
export async function loginByCode(phone, code, nickname) {
  if (!/^1\d{10}$/.test(String(phone))) throw badRequest('手机号格式不正确');
  const expect = (await getCache().get(`login:code:${phone}`)) || (config.isProd ? null : DEMO_LOGIN_CODE);
  if (!expect) throw badRequest('验证码已过期，请重新获取');
  if (String(code) !== String(expect)) throw badRequest('验证码不正确');

  let row = await get('SELECT * FROM users WHERE phone = ?', [phone]);
  if (!row) {
    const now = nowIso();
    const info = await run(
      `INSERT INTO users (phone, openid, nickname, tier_code, total_paid, points, role, created_at)
       VALUES (?, ?, ?, 'xinYa', 0, 0, 'customer', ?)`,
      [phone, `phone_${phone}`, nickname || `浒口新朋友${String(phone).slice(-4)}`, now],
    );
    row = await get('SELECT * FROM users WHERE id = ?', [info.lastInsertId]);
  }
  await getCache().del(`login:code:${phone}`);
  return { token: issueToken(row), user: shapeUser(row) };
}

/**
 * 微信一键登录
 * 有 WX_APPID / WX_SECRET 时调用微信 code2session 换取真实 openid；
 * 否则进入演示模式，用 code 派生一个稳定的 mock openid，保证流程可跑通。
 */
export async function loginByWechat(code, profile = {}) {
  if (!code) throw badRequest('缺少微信登录 code');
  const appid = process.env.WX_APPID;
  const secret = process.env.WX_SECRET;
  let openid = null;
  let sessionKey = null;

  if (appid && secret) {
    const url = `https://api.weixin.qq.com/sns/jscode2session?appid=${encodeURIComponent(appid)}&secret=${encodeURIComponent(secret)}&js_code=${encodeURIComponent(code)}&grant_type=authorization_code`;
    const res = await fetch(url);
    const data = await res.json();
    if (data.errcode) throw badRequest(`微信登录失败：${data.errmsg || data.errcode}`);
    openid = data.openid;
    sessionKey = data.session_key;
  } else {
    openid = `mock_${Buffer.from(String(code)).toString('hex').slice(0, 24)}`;
  }

  let row = await get('SELECT * FROM users WHERE openid = ?', [openid]);
  if (!row) {
    const info = await run(
      `INSERT INTO users (openid, nickname, avatar, tier_code, total_paid, points, role, created_at)
       VALUES (?, ?, ?, 'xinYa', 0, 0, 'customer', ?)`,
      [openid, profile.nickname || '微信用户', profile.avatar || '', nowIso()],
    );
    row = await get('SELECT * FROM users WHERE id = ?', [info.lastInsertId]);
  }
  return { token: issueToken(row), user: shapeUser(row), mode: appid && secret ? 'wechat' : 'mock' };
}

/** 根据累计消费重新计算会员等级 */
export async function refreshMemberTier(userId) {
  const user = await get('SELECT * FROM users WHERE id = ?', [userId]);
  if (!user) return null;
  const tiers = await get('SELECT * FROM member_tiers WHERE min_amount <= ? ORDER BY min_amount DESC LIMIT 1', [user.total_paid]);
  if (tiers && tiers.code !== user.tier_code) {
    await run('UPDATE users SET tier_code = ? WHERE id = ?', [tiers.code, userId]);
    return tiers.code;
  }
  return user.tier_code;
}

export async function updateProfile(userId, patch) {
  const fields = [];
  const values = [];
  if (patch.nickname) { fields.push('nickname = ?'); values.push(patch.nickname); }
  if (patch.avatar !== undefined) { fields.push('avatar = ?'); values.push(patch.avatar); }
  if (patch.babyBirth !== undefined) { fields.push('baby_birth = ?'); values.push(patch.babyBirth); }
  if (!fields.length) throw badRequest('没有需要更新的字段');
  values.push(userId);
  await run(`UPDATE users SET ${fields.join(', ')} WHERE id = ?`, values);
  const row = await get('SELECT * FROM users WHERE id = ?', [userId]);
  return shapeUser(row);
}

export { shapeUser };
export default {
  extractToken, currentUser, requireUser, requireAdmin, issueToken,
  loginByPassword, sendLoginCode, loginByCode, loginByWechat, refreshMemberTier, updateProfile, shapeUser,
};
