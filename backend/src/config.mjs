/**
 * 统一配置。对应项目书 3.3.1「云服务与部署」与 4.2.2「全渠道数字化平台技术」。
 *
 * 设计要点：项目书要求 MySQL + Redis，本项目在同一套代码里提供两套驱动：
 *   DB_DRIVER=sqlite  -> 使用 Node.js 内置 node:sqlite，零安装、开箱即跑（默认）
 *   DB_DRIVER=mysql   -> 使用团队后续在阿里云 ECS 上部署的 MySQL 8（需自行 npm i mysql2）
 *   CACHE_DRIVER=memory（默认） / redis（需 npm i redis）
 * 业务代码只依赖 db/index.mjs 的抽象接口，切换驱动不需要改动任何业务逻辑。
 */
import path from 'node:path';
import os from 'node:os';
import { fileURLToPath } from 'node:url';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
export const BACKEND_ROOT = path.resolve(__dirname, '..');

const num = (v, d) => (v === undefined || v === '' ? d : Number(v));

/** 取本机局域网 IPv4（用于把"别人怎么访问"的地址打印出来、以及生成可被外部扫到的二维码） */
function detectLanIp() {
  try {
    const nets = os.networkInterfaces();
    const candidates = [];
    for (const [name, addrs] of Object.entries(nets)) {
      for (const a of addrs ?? []) {
        if (a.family !== 'IPv4' || a.internal) continue;
        candidates.push({ name, address: a.address });
      }
    }
    // 优先真实无线/以太网，排除虚拟网卡（VMware / Radmin / WSL / Docker）
    const virtual = /vmware|radmin|virtual|loopback|wsl|docker|hyper-v|tap|tun/i;
    const real = candidates.find((c) => !virtual.test(c.name));
    return (real ?? candidates[0])?.address ?? '127.0.0.1';
  } catch {
    return '127.0.0.1';
  }
}

export const LAN_IP = detectLanIp();

export const config = {
  appName: '茶芽芽·婴儿山茶抚触油商城',
  team: '浒口茶油助农先锋队',
  teamId: '16106641',
  port: num(process.env.PORT, 8788),
  // 默认监听所有网卡：这样同一 WiFi 下的手机/电脑用局域网 IP 就能打开
  // （只想本机访问时设置 HOST=127.0.0.1）
  host: process.env.HOST || '0.0.0.0',
  /**
   * 打印在溯源二维码里的站点地址。
   * 默认使用局域网 IP：别人在手机上扫码时，二维码不能写 127.0.0.1（那会指向他们自己的手机）。
   * 部署到公网后通过 PUBLIC_BASE_URL 覆盖为域名。
   */
  publicBaseUrl: process.env.PUBLIC_BASE_URL || `http://${LAN_IP}:${num(process.env.PORT, 8788)}`,


  db: {
    driver: (process.env.DB_DRIVER || 'sqlite').toLowerCase(),
    sqliteFile: process.env.SQLITE_FILE || path.join(BACKEND_ROOT, 'data', 'chayaya.db'),
    mysql: {
      host: process.env.MYSQL_HOST || '127.0.0.1',
      port: num(process.env.MYSQL_PORT, 3306),
      user: process.env.MYSQL_USER || 'root',
      password: process.env.MYSQL_PASSWORD || '',
      database: process.env.MYSQL_DATABASE || 'chayaya',
      connectionLimit: num(process.env.MYSQL_POOL, 10),
    },
  },

  cache: {
    driver: (process.env.CACHE_DRIVER || 'memory').toLowerCase(),
    redisUrl: process.env.REDIS_URL || 'redis://127.0.0.1:6379',
    defaultTtl: num(process.env.CACHE_TTL, 60),
  },

  auth: {
    // 生产环境务必通过环境变量覆盖
    secret: process.env.JWT_SECRET || 'chayaya-hukou-2026-secret',
    ttlSeconds: num(process.env.TOKEN_TTL, 7 * 24 * 3600),
  },

  security: {
    // 溯源二维码 ECDSA 签名私钥种子（项目书：基于椭圆曲线数字签名算法）
    traceSignSeed: process.env.TRACE_SIGN_SEED || 'chayaya-trace-ecdsa-seed',
    // 链上存证哈希链创世哈希
    genesisHash: process.env.TRACE_GENESIS || '0'.repeat(64),
  },

  trace: {
    // 二维码中心是否叠加"茶芽芽"文字标识
    qrBrandText: process.env.QR_BRAND === '0' ? '' : '茶芽芽',
    qrEcl: (process.env.QR_ECL || 'M').toUpperCase(),
    // 首次查询防伪：同一码重复查询时提示"该码已被查询过 N 次"
    antiFakeOnRepeat: process.env.TRACE_ANTIFAKE !== '0',
  },

  ai: {
    // 混合方案：规则/NLP 引擎为主；填入 Key 后自动升级为大模型增强
    provider: (process.env.AI_PROVIDER || 'rule').toLowerCase(), // rule | openai-compatible
    apiKey: process.env.AI_API_KEY || '',
    baseUrl: process.env.AI_BASE_URL || 'https://api.deepseek.com/v1',
    model: process.env.AI_MODEL || 'deepseek-chat',
    timeoutMs: num(process.env.AI_TIMEOUT_MS, 20000),
    enabled: Boolean(process.env.AI_API_KEY),
  },

  biz: {
    freight: num(process.env.FREIGHT, 0),          // 满额包邮策略由 marketing 配置决定
    freeFreightAmount: num(process.env.FREE_FREIGHT, 9900),
    memberTierAutoUpgrade: true,
    freightBase: 800,
  },

  isProd: process.env.NODE_ENV === 'production',
};

export default config;
