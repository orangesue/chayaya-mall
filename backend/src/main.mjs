/** 服务入口：初始化数据库 → 必要时写入演示数据 → 启动 HTTP 服务 */
import { initDb, get, run } from './db/index.mjs';
import { initCache } from './db/cache.mjs';
import { seedAll } from './db/seed.mjs';
import { startServer } from './server.mjs';
import config from './config.mjs';
import { qrEncoderName } from './utils/qrcode.mjs';

async function ensureSeedData() {
  const row = await get('SELECT COUNT(*) AS n FROM products');
  if (!row || Number(row.n) === 0) {
    console.log('[init] 检测到空数据库，正在写入演示数据 …');
    await seedAll({ quiet: true });
    console.log('[init] 演示数据写入完成');
  }
}

async function main() {
  await initDb();
  await initCache();
  await ensureSeedData();

  const { url } = await startServer();
  console.log(`  二维码渲染器：${qrEncoderName}   溯源签名：ECDSA(secp256k1)   存证：SHA-256 哈希链`);
  console.log(`  提示：如需重建演示数据执行 npm run reset；如需 MySQL 请设置 DB_DRIVER=mysql`);
  console.log('');

  // 记录启动事件，便于后台"运行维护"面板展示
  await run(
    'INSERT INTO events (type, target, payload_json, created_at) VALUES (?, ?, ?, ?)',
    ['boot', url, JSON.stringify({ driver: config.db.driver, cache: config.cache.driver, qr: qrEncoderName }), new Date().toISOString()],
  );
}

main().catch((err) => {
  console.error('[fatal] 服务启动失败:', err);
  process.exit(1);
});
