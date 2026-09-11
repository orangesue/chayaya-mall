/** 溯源路由：扫码查询、二维码生成、批次全景、检测报告 */
import { ok, badRequest, notFound } from '../http/respond.mjs';
import { currentUser } from '../http/auth.mjs';
import {
  lookupTrace, buildTraceQr, getBatchOverview, verifyChain, adminListUnits,
} from '../services/trace.mjs';
import { get } from '../db/index.mjs';
import brand from '../data/brand-content.mjs';
import { qrEncoderName } from '../utils/qrcode.mjs';

export function registerTraceRoutes(route) {
  /**
   * 扫码溯源主接口
   * 支持两种调用：
   *  1) ?t=<签名token>   （二维码内容，生产主路径）
   *  2) ?code=<溯源码>    （手动输入瓶底码）
   */
  route('GET', '/api/trace/verify', async ({ req, url }) => {
    const t = url.searchParams.get('t');
    const code = url.searchParams.get('code');
    if (!t && !code) throw badRequest('请提供溯源 token 或溯源码');
    const ip = req.headers['x-forwarded-for'] || req.socket?.remoteAddress || '';
    const res = await lookupTrace({
      traceCode: code,
      token: t,
      ip: String(ip).split(',')[0],
      ua: req.headers['user-agent'],
    });
    return ok(res);
  });

  /** 演示用：列出全部溯源码（便于体验扫码流程） */
  route('GET', '/api/trace/codes', async ({ query }) => {
    const batchNo = query.get('batch');
    const { list } = await adminListUnits(batchNo, { page: 1, size: 30 });
    return ok({
      list: list.map((u) => ({
        traceCode: u.trace_code,
        batchNo: u.batch_no,
        status: u.status,
        scanCount: u.scan_count,
      })),
    });
  });

  /** 生成某个溯源码的防伪链接与二维码 SVG（用于打印瓶底标签） */
  route('GET', '/api/trace/qr/:code', async ({ params, query, res, baseUrl }) => {
    const fmt = query.get('format') || 'json';
    const qr = await buildTraceQr(params.code, { size: Number(query.get('size')) || 0, base: baseUrl });
    if (fmt === 'svg') {
      res.writeHead(200, { 'Content-Type': 'image/svg+xml', 'Cache-Control': 'no-store' });
      res.end(qr.svg);
      return null;
    }
    return ok(qr);
  });

  /** 批次全景（时间轴 + 哈希链校验 + 溯源码统计） */
  route('GET', '/api/trace/batch/:batchNo', async ({ params }) => ok(await getBatchOverview(params.batchNo)));

  /** 哈希链完整性校验（防篡改验证） */
  route('GET', '/api/trace/chain/:batchNo', async ({ params }) => ok(await verifyChain(params.batchNo)));

  /** 溯源体系总览（小程序溯源频道页） */
  route('GET', '/api/trace/overview', async ({ req, url }) => {
    const user = await currentUser(req, url);
    const batches = await import('../services/trace.mjs').then((m) => m.adminListBatches());
    const scans = await get('SELECT COUNT(*) AS n FROM scan_logs');
    const units = await get('SELECT COUNT(*) AS n FROM trace_units');
    return ok({
      flow: brand.traceFlow,
      images: {
        system: brand.images.traceSystem,
        query: brand.images.traceQuery,
        dashboard: brand.images.traceDashboard,
        antiFake: brand.images.antiFake,
      },
      algorithm: {
        code: 'ECDSA / secp256k1（椭圆曲线数字签名）',
        chain: 'SHA-256 哈希链（逐节点存证，云端 + 链上哈希比对）',
        qr: qrEncoderName,
      },
      batches,
      stats: { scans: Number(scans?.n ?? 0), units: Number(units?.n ?? 0), batches: batches.length },
      antiFakeTip: '瓶底二维码带刮开涂层，首次查询才是"刚从浒口村发出"的正品；重复查询会提示已查询次数。',
      loggedIn: Boolean(user),
    });
  });

  /** 演示用溯源码（首页快捷体验按钮） */
  route('GET', '/api/trace/demo', async ({ baseUrl }) => {
    const unit = await get("SELECT trace_code, batch_no FROM trace_units WHERE batch_no = 'CHY-20260115-01' ORDER BY id ASC LIMIT 1");
    if (!unit) throw notFound('暂无溯源码，请先执行 npm run reset');
    const qr = await buildTraceQr(unit.trace_code, { base: baseUrl });
    return ok({ traceCode: unit.trace_code, batchNo: unit.batch_no, url: qr.url, qrSvg: qr.svg });
  });
}

export default { registerTraceRoutes };
