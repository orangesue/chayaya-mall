/**
 * 静态站构建产物 · 路径修正工具（两个构建脚本共用）
 *
 * 背景（都是真实踩过的坑）：
 *   1) <base href> 只影响 HTML 里解析出来的 URL，**管不到 JS 拼接的路径**。
 *      子目录部署（GitHub Pages 的 /仓库名/）时，源码里写死的
 *      '/assets/img/xxx.png' 会去域名根目录找 → 首页图片全裂、404 一片。
 *   2) 数据快照里的图片路径同理，必须在构建时一起改写。
 *   3) 站内链接写成 './#/xxx' 可让 hash 路由在任意子目录下都正确。
 *
 * 只有"真实浏览器 + 子目录部署"才暴露得出来，所以本地验证务必带 --prefix。
 */

/** 修正单个文本文件（HTML 或 JS）里的路径 */
export function patchTextPaths(text, base) {
  let out = text;
  out = out.replace(/(["'`])\/#\//g, '$1./#/');
  out = out.replace(/(["'`])\/#"/g, '$1./#"');
  if (base && base !== '/') {
    const prefix = base.replace(/\/$/, '');
    out = out.replace(/(["'`])\/assets\//g, `$1${prefix}/assets/`);
  }
  return out;
}

/** 递归改写数据快照里的绝对资源路径 */
export function rewriteAssetPaths(value, base) {
  if (!base || base === '/') return value;
  const prefix = base.replace(/\/$/, '');
  if (typeof value === 'string') {
    return value.startsWith('/assets/') ? `${prefix}${value}` : value;
  }
  if (Array.isArray(value)) return value.map((v) => rewriteAssetPaths(v, base));
  if (value && typeof value === 'object') {
    const out = {};
    for (const [k, v] of Object.entries(value)) out[k] = rewriteAssetPaths(v, base);
    return out;
  }
  return value;
}

/** 把入口 HTML 里的绝对资源路径改为相对（跳过 <base> 自身，否则会被二次改写） */
export function relativizeHtmlAssets(html) {
  return html
    .split('\n')
    .map((line) => (line.includes('<base ') ? line : line.replace(/(href|src)="\/(?!\/)/g, '$1="./')))
    .join('\n');
}

export default { patchTextPaths, rewriteAssetPaths, relativizeHtmlAssets };
