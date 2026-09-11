/**
 * 一物一码溯源服务
 * 项目书 3.3.2 / 4.2.2：
 *  - 唯一加密二维码赋码：ECDSA(secp256k1) 对「溯源码|批次号|检验编号」签名，复制二维码无法伪造
 *  - 基于区块链的全流程数据存证：每个节点哈希 = SHA-256(前序哈希 | 本节点内容)，形成哈希链
 *  - 可视化交互界面：按时间轴展示 原料种植 → 生产加工 → 物流配送，并突出检测报告与产地认证
 */
import { query, get, run } from '../db/index.mjs';
import config from '../config.mjs';
import { ok, notFound, badRequest, conflict } from '../http/respond.mjs';
import {
  newTraceCode, tokenForTrace, verifyTraceToken, traceUrl, computeChainHash, tracePayload,
} from '../utils/trace-code.mjs';
import { signTracePayload, chainHash } from '../utils/crypto.mjs';
import { qrSvg, qrEncoderName } from '../utils/qrcode.mjs';
import { nowIso } from '../utils/datetime.mjs';
import brand from '../data/brand-content.mjs';

const STAGE_ICON = {
  plant: '🌱', harvest: '🧺', press: '🫒', inspect: '🔬', fill: '🏭', logistics: '🚚',
};

const STAGE_TITLE = {
  plant: '原料产地环境与种植管护',
  harvest: '果实采摘与成熟度筛选',
  press: '物理低温冷榨加工',
  inspect: '成品检测与合规备案',
  fill: '无菌车间灌装与赋码',
  logistics: '物流配送',
};

function shapeBatch(row) {
  if (!row) return null;
  return {
    batchNo: row.batch_no,
    productCode: row.product_code,
    origin: row.origin,
    plotNo: row.plot_no,
    farmer: row.farmer,
    harvestDate: row.harvest_date,
    pressDate: row.press_date,
    pressWorkshop: row.press_workshop,
    pressTech: row.press_tech,
    fillDate: row.fill_date,
    factory: row.factory,
    inspectionNo: row.inspection_no,
    inspectionReport: row.inspection_report,
    geo: safeJson(row.geo, {}),
  };
}

const safeJson = (s, def) => {
  if (!s) return def;
  try { return JSON.parse(s); } catch { return def; }
};

async function loadEvents(batchNo) {
  const rows = await query('SELECT * FROM trace_events WHERE batch_no = ? ORDER BY id ASC', [batchNo]);
  return rows.map((r, i) => ({
    index: i,
    stage: r.stage,
    stageName: r.stage_name,
    icon: STAGE_ICON[r.stage] ?? '•',
    happenedAt: r.happened_at,
    place: r.place,
    operator: r.operator,
    detail: safeJson(r.detail_json, {}),
    image: r.image,
    hash: r.hash,
    prevHash: r.prev_hash,
  }));
}

/** 校验哈希链完整性：返回首个断链位置（null 表示链完整） */
export async function verifyChain(batchNo) {
  const events = await query('SELECT * FROM trace_events WHERE batch_no = ? ORDER BY id ASC', [batchNo]);
  let prev = config.security.genesisHash;
  for (const [i, ev] of events.entries()) {
    const payload = {
      batchNo: ev.batch_no,
      stage: ev.stage,
      happenedAt: ev.happened_at,
      place: ev.place,
      operator: ev.operator,
      detail: safeJson(ev.detail_json, {}),
    };
    const expect = computeChainHash(prev, payload);
    if (ev.prev_hash !== prev || ev.hash !== expect) {
      return { intact: false, brokenAt: i, stage: ev.stage, expect, actual: ev.hash };
    }
    prev = ev.hash;
  }
  return { intact: true, chainHead: prev, nodeCount: events.length };
}

/**
 * 扫码溯源：校验签名 → 取批次 → 组装时间轴
 * 防伪逻辑（项目书"首次查询防伪"）：
 *  - 签名不通过 → 直接判定为伪造码，拒绝展示
 *  - 首次查询 → 记录并提示"正品，首次查询"
 *  - 重复查询 → 提示"该码已查询过 N 次，若非本人查询请警惕"
 */
export async function lookupTrace({ traceCode, token, batchNo, ip, ua }) {
  let code = traceCode;
  let signatureValid = null;
  let batchFromToken = batchNo;

  if (token) {
    const verified = verifyTraceToken(token);
    if (!verified) throw badRequest('溯源链接已损坏或格式不正确');
    code = verified.traceCode;
    signatureValid = verified.signatureValid;
    batchFromToken = verified.batchNo || batchFromToken;
    if (!verified.signatureValid) {
      await recordScan(code, ip, ua, 'fake');
      return {
        authentic: false,
        reason: 'signature_invalid',
        message: '该二维码的数字签名校验失败，可能为仿制品，请立即联系官方客服核实。',
        traceCode: code,
      };
    }
    if (batchFromToken) {
      // 防止用 A 的 token 查询 B 的单品码
      const unit = await get('SELECT * FROM trace_units WHERE trace_code = ?', [code]);
      if (unit && unit.batch_no !== batchFromToken) {
        await recordScan(code, ip, ua, 'fake');
        return {
          authentic: false,
          reason: 'batch_mismatch',
          message: '二维码信息与商品不匹配，请谨慎购买。',
          traceCode: code,
        };
      }
    }
  }

  if (!code) throw badRequest('缺少溯源码');
  const unit = await get('SELECT * FROM trace_units WHERE trace_code = ?', [code]);
  if (!unit) {
    await recordScan(code, ip, ua, 'fake');
    return {
      authentic: false,
      reason: 'not_found',
      message: '系统中没有找到该溯源码，请核对输入是否正确，或联系客服核实。',
      traceCode: code,
    };
  }

  const batch = await get('SELECT * FROM batches WHERE batch_no = ?', [unit.batch_no]);
  if (!batch) throw notFound('批次信息缺失，请联系客服');

  const isFirst = unit.scan_count === 0;
  const scanCount = unit.scan_count + 1;
  await run(
    'UPDATE trace_units SET scan_count = ?, first_scan_at = COALESCE(first_scan_at, ?) WHERE trace_code = ?',
    [scanCount, nowIso(), code],
  );
  await recordScan(code, ip, ua, isFirst ? 'first' : 'repeat');

  const events = await loadEvents(unit.batch_no);
  const chain = await verifyChain(unit.batch_no);
  const product = batch.product_code
    ? await get('SELECT code, title, subtitle, spec, image FROM products WHERE code = ?', [batch.product_code])
    : null;

  return {
    authentic: true,
    traceCode: unit.trace_code,
    batchNo: unit.batch_no,
    unitStatus: unit.status,
    unitStatusText: { in_stock: '已入库', sold: '已售出', shipped: '已发货' }[unit.status] ?? unit.status,
    scan: {
      count: scanCount,
      isFirst,
      firstScanAt: unit.first_scan_at,
      tip: isFirst
        ? '✅ 正品验证通过：该码为首次查询，是刚从浒口村发出的这一瓶。'
        : `⚠️ 该码不是首次查询，已被查询 ${scanCount} 次。如果您是第一次扫这个码，请警惕商品被二次封装的可能，并联系客服核实。`,
    },
    signature: {
      algorithm: 'ECDSA / secp256k1 + SHA-256',
      verified: signatureValid !== false,
      note: '二维码内含对「溯源码|批次号|检验编号」的数字签名，复制二维码无法伪造签名信息。',
    },
    chain: {
      algorithm: 'SHA-256 哈希链（逐节点存证）',
      intact: chain.intact,
      nodeCount: chain.nodeCount,
      head: chain.chainHead ?? unit.chain_hash,
      note: chain.intact
        ? '全部节点哈希校验通过，溯源数据未被篡改。'
        : `检测到第 ${chain.brokenAt + 1} 个节点哈希不匹配，数据可能被篡改，请立即联系客服。`,
    },
    product: product ? {
      code: product.code, title: product.title, subtitle: product.subtitle, spec: product.spec, image: product.image,
    } : null,
    batch: {
      ...shapeBatch(batch),
      landInfo: brand.traceFlow,
    },
    timeline: events,
    report: {
      inspectionNo: batch.inspection_no,
      url: batch.inspection_report,
    },
    qr: {
      encoder: qrEncoderName,
      printTip: '瓶底二维码已做刮开涂层，扫码即可查看本瓶完整履历。',
    },
  };
}

async function recordScan(traceCode, ip, ua, result) {
  try {
    await run(
      'INSERT INTO scan_logs (trace_code, ip, ua, result, created_at) VALUES (?, ?, ?, ?, ?)',
      [traceCode, ip ?? '', String(ua ?? '').slice(0, 200), result, nowIso()],
    );
  } catch { /* 埋点失败不影响主流程 */ }
}

/** 为某个单品码生成可打印的防伪链接与二维码 */
export async function buildTraceQr(traceCode, { size } = {}) {
  const unit = await get('SELECT * FROM trace_units WHERE trace_code = ?', [traceCode]);
  if (!unit) throw notFound('溯源码不存在');
  const batch = await get('SELECT * FROM batches WHERE batch_no = ?', [unit.batch_no]);
  const token = tokenForTrace(unit.trace_code, unit.batch_no, batch?.inspection_no ?? '');
  const url = traceUrl(token);
  const svg = await qrSvg(url, { ecl: config.trace.qrEcl, width: size, dark: '#123f2e' });
  return {
    traceCode: unit.trace_code,
    batchNo: unit.batch_no,
    url,
    token,
    svg,
    encoder: qrEncoderName,
    signature: unit.sign.slice(0, 24) + '…',
  };
}

/** 批次全景（后台与溯源页共用） */
export async function getBatchOverview(batchNo) {
  const batch = await get('SELECT * FROM batches WHERE batch_no = ?', [batchNo]);
  if (!batch) throw notFound('批次不存在');
  const events = await loadEvents(batchNo);
  const chain = await verifyChain(batchNo);
  const unitStat = await get(
    `SELECT COUNT(*) AS total,
            SUM(CASE WHEN status = 'in_stock' THEN 1 ELSE 0 END) AS in_stock,
            SUM(CASE WHEN status <> 'in_stock' THEN 1 ELSE 0 END) AS sold,
            IFNULL(SUM(scan_count), 0) AS scans
       FROM trace_units WHERE batch_no = ?`,
    [batchNo],
  );
  return {
    batch: shapeBatch(batch),
    timeline: events,
    chain,
    units: {
      total: Number(unitStat?.total ?? 0),
      inStock: Number(unitStat?.in_stock ?? 0),
      sold: Number(unitStat?.sold ?? 0),
      scans: Number(unitStat?.scans ?? 0),
    },
  };
}

/* ---------------- 后台：批次与溯源码维护 ---------------- */

export async function adminListBatches() {
  const rows = await query('SELECT * FROM batches ORDER BY id DESC');
  const out = [];
  for (const r of rows) {
    const stat = await get(
      `SELECT COUNT(*) AS total, IFNULL(SUM(scan_count), 0) AS scans FROM trace_units WHERE batch_no = ?`,
      [r.batch_no],
    );
    out.push({
      ...shapeBatch(r),
      unitTotal: Number(stat?.total ?? 0),
      scans: Number(stat?.scans ?? 0),
    });
  }
  return out;
}

/** 新增溯源节点：写入后自动重算本批次哈希链（演示"数据采集→云端加密存证"） */
export async function adminAddEvent(batchNo, payload) {
  const batch = await get('SELECT * FROM batches WHERE batch_no = ?', [batchNo]);
  if (!batch) throw notFound('批次不存在');
  const stage = String(payload.stage || '').trim();
  if (!STAGE_TITLE[stage]) throw badRequest(`stage 必须是 ${Object.keys(STAGE_TITLE).join(' / ')} 之一`);
  if (!payload.happenedAt) throw badRequest('缺少 happenedAt');
  if (!payload.operator) throw badRequest('缺少 operator（操作人/农户）');

  const last = await get('SELECT hash FROM trace_events WHERE batch_no = ? ORDER BY id DESC LIMIT 1', [batchNo]);
  const prev = last?.hash ?? config.security.genesisHash;
  const detail = payload.detail ?? {};
  const hash = chainHash(prev, {
    batchNo, stage, happenedAt: payload.happenedAt, place: payload.place ?? '', operator: payload.operator, detail,
  });
  await run(
    `INSERT INTO trace_events (batch_no, stage, stage_name, happened_at, place, operator, detail_json, image, hash, prev_hash, created_at)
     VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
    [batchNo, stage, STAGE_TITLE[stage], payload.happenedAt, payload.place ?? '', payload.operator,
      JSON.stringify(detail), payload.image ?? '', hash, prev, nowIso()],
  );
  return getBatchOverview(batchNo);
}

export async function adminCreateBatch(payload) {
  const batchNo = String(payload.batchNo || '').trim();
  if (!batchNo) throw badRequest('缺少批次号');
  const existed = await get('SELECT batch_no FROM batches WHERE batch_no = ?', [batchNo]);
  if (existed) throw conflict('批次号已存在');
  await run(
    `INSERT INTO batches (batch_no, product_code, origin, plot_no, farmer, harvest_date, press_date,
       press_workshop, press_tech, fill_date, factory, inspection_no, inspection_report, geo, created_at)
     VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
    [
      batchNo, payload.productCode ?? '', payload.origin ?? '湖南省郴州市浒口村', payload.plotNo ?? '',
      payload.farmer ?? '', payload.harvestDate ?? '', payload.pressDate ?? '', payload.pressWorkshop ?? '',
      payload.pressTech ?? '物理低温冷榨（≤60℃）', payload.fillDate ?? '', payload.factory ?? '',
      payload.inspectionNo ?? '', payload.inspectionReport ?? '', JSON.stringify(payload.geo ?? {}), nowIso(),
    ],
  );

  const count = Math.max(1, Math.min(500, Number(payload.unitCount ?? 10)));
  const codes = [];
  for (let i = 0; i < count; i++) {
    const code = newTraceCode(new Date(), `${batchNo.replace(/\D/g, '').slice(-6)}${String(i + 1).padStart(4, '0')}`);
    const sign = signTracePayload(tracePayload(code, batchNo, payload.inspectionNo ?? ''));
    await run(
      `INSERT INTO trace_units (trace_code, batch_no, product_id, sign, chain_hash, status, scan_count, created_at)
       VALUES (?, ?, ?, ?, ?, 'in_stock', 0, ?)`,
      [code, batchNo, null, sign, config.security.genesisHash, nowIso()],
    );
    codes.push(code);
  }
  return { batchNo, units: codes.length, sampleCodes: codes.slice(0, 3) };
}

export async function adminListUnits(batchNo, { page = 1, size = 20 } = {}) {
  const args = batchNo ? [batchNo] : [];
  const cond = batchNo ? 'WHERE batch_no = ?' : '';
  const totalRow = await get(`SELECT COUNT(*) AS n FROM trace_units ${cond}`, args);
  const rows = await query(
    `SELECT * FROM trace_units ${cond} ORDER BY id ASC LIMIT ? OFFSET ?`,
    [...args, size, (page - 1) * size],
  );
  return { list: rows, total: Number(totalRow?.n ?? 0), page, size };
}

export async function adminScanLogs({ page = 1, size = 20 } = {}) {
  const totalRow = await get('SELECT COUNT(*) AS n FROM scan_logs');
  const rows = await query('SELECT * FROM scan_logs ORDER BY id DESC LIMIT ? OFFSET ?', [size, (page - 1) * size]);
  return { list: rows, total: Number(totalRow?.n ?? 0), page, size };
}

export { STAGE_TITLE, STAGE_ICON, ok };
export default {
  lookupTrace, buildTraceQr, getBatchOverview, verifyChain,
  adminListBatches, adminAddEvent, adminCreateBatch, adminListUnits, adminScanLogs,
};
