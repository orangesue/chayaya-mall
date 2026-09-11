/** 统一响应体与错误类型 */
export class ApiError extends Error {
  constructor(status, code, message, extra = {}) {
    super(message);
    this.status = status;
    this.code = code;
    this.extra = extra;
  }
}

export const badRequest = (msg, extra) => new ApiError(400, 'BAD_REQUEST', msg, extra);
export const unauthorized = (msg = '请先登录') => new ApiError(401, 'UNAUTHORIZED', msg);
export const forbidden = (msg = '没有权限执行该操作') => new ApiError(403, 'FORBIDDEN', msg);
export const notFound = (msg = '资源不存在') => new ApiError(404, 'NOT_FOUND', msg);
export const conflict = (msg, extra) => new ApiError(409, 'CONFLICT', msg, extra);

export function ok(data, message = 'ok') {
  return { code: 0, message, data, ts: Date.now() };
}

export function fail(code, message, extra = {}) {
  return { code: code || 1, message, ...extra, ts: Date.now() };
}

export default { ApiError, ok, fail, badRequest, unauthorized, forbidden, notFound, conflict };
