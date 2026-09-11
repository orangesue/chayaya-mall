/** 请求体解析与轻量校验 */
import { badRequest } from './respond.mjs';

export async function readJsonBody(req, limitBytes = 1024 * 1024) {
  const chunks = [];
  let size = 0;
  for await (const chunk of req) {
    size += chunk.length;
    if (size > limitBytes) throw badRequest('请求体过大');
    chunks.push(chunk);
  }
  if (!chunks.length) return {};
  const text = Buffer.concat(chunks).toString('utf8').trim();
  if (!text) return {};
  try {
    return JSON.parse(text);
  } catch {
    throw badRequest('请求体不是合法 JSON');
  }
}

export function parseQuery(url) {
  const out = {};
  for (const [k, v] of url.searchParams.entries()) out[k] = v;
  return out;
}

export function requireFields(body, fields) {
  const missing = fields.filter((f) => body[f] === undefined || body[f] === null || body[f] === '');
  if (missing.length) throw badRequest(`缺少必填字段：${missing.join('、')}`);
  return true;
}

export const toInt = (v, def = 0) => {
  const n = Number.parseInt(v, 10);
  return Number.isFinite(n) ? n : def;
};

export const toBool = (v) => v === true || v === 'true' || v === 1 || v === '1';

/**
 * 限制分页参数范围，避免恶意大分页
 * 注意：URLSearchParams 实例上 `.size` 是"参数个数"、`.page` 是 undefined，
 * 因此这里必须用 .get() 取值（曾经因为直接读属性导致每页只返回 1 条）。
 */
export const pageParams = (q, defSize = 10, maxSize = 50) => ({
  page: Math.max(1, toInt(q.get ? q.get('page') : q.page, 1)),
  size: Math.min(maxSize, Math.max(1, toInt(q.get ? q.get('size') : q.size, defSize))),
});

export default { readJsonBody, parseQuery, requireFields, toInt, toBool, pageParams };
