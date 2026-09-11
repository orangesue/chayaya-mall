/** 时间工具：统一使用带时区的 ISO 字符串存库（与 MySQL DATETIME 兼容） */

const pad = (n, l = 2) => String(n).padStart(l, '0');

export function nowIso(date = new Date()) {
  const off = -date.getTimezoneOffset();
  const sign = off >= 0 ? '+' : '-';
  const abs = Math.abs(off);
  return (
    `${date.getFullYear()}-${pad(date.getMonth() + 1)}-${pad(date.getDate())}` +
    `T${pad(date.getHours())}:${pad(date.getMinutes())}:${pad(date.getSeconds())}` +
    `${sign}${pad(Math.floor(abs / 60))}:${pad(abs % 60)}`
  );
}

export const today = () => nowIso().slice(0, 10);

export function formatDateTime(value) {
  if (!value) return '';
  const s = String(value).replace('T', ' ');
  return s.length >= 16 ? s.slice(0, 16) : s;
}

/** 按秒计算两个时间的差 */
export function diffSeconds(a, b = new Date()) {
  return Math.floor((new Date(b).getTime() - new Date(a).getTime()) / 1000);
}

/** 生成"1 小时前"这类相对时间 */
export function fromNow(value) {
  const sec = diffSeconds(value);
  if (sec < 60) return '刚刚';
  if (sec < 3600) return `${Math.floor(sec / 60)} 分钟前`;
  if (sec < 86400) return `${Math.floor(sec / 3600)} 小时前`;
  if (sec < 2592000) return `${Math.floor(sec / 86400)} 天前`;
  return formatDateTime(value).slice(0, 10);
}

export default { nowIso, today, formatDateTime, diffSeconds, fromNow };
