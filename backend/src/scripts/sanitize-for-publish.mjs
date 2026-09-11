/**
 * 上架前脱敏：剔除含真实个人信息的素材，并清理代码里对它们的引用
 * 用法: node src/scripts/sanitize-for-publish.mjs [--restore]
 *
 * 为什么需要它：
 *   项目书的附件里包含组员的真实证件扫描件与微信社群截图，
 *   这些内容不能随公开仓库发布（身份证号、证书编号、群成员昵称、群二维码）。
 *   为避免"删了图但页面引用还在导致图片裂开"，本脚本会同时清理引用并留占位说明。
 *
 * --restore 用于本地演示时把原始素材恢复回来（如果你手里有备份）。
 */
import fs from 'node:fs';
import path from 'node:path';

const ROOT = path.resolve(process.cwd());
const PUBLIC_IMG = path.join(ROOT, 'public', 'assets', 'img');
const FRONTEND_IMG = path.resolve(ROOT, '..', 'miniprogram', 'assets', 'img');

/** 需要排除的素材：文件名 → 原因 */
const BLOCKLIST = {
  'image42.png': '育婴师职业资格证书扫描件（含姓名 + 身份证号）',
  'image41.jpeg': '专业技能证书扫描件（含姓名 + 身份证号 + 证书编号）',
  'image44.png': '微信群聊截图（含群人数、成员昵称、问卷二维码）',
};

const restore = process.argv.includes('--restore');
const baksDir = path.join(ROOT, '.publish-excluded');

function rel(p) {
  return p.replace(ROOT + path.sep, '').replace(/\\/g, '/');
}

/* ---------------- 1) 处理图片文件 ---------------- */
let moved = 0;
let restored = 0;
const targets = [PUBLIC_IMG, FRONTEND_IMG];

for (const dir of targets) {
  if (!fs.existsSync(dir)) continue;
  for (const [file, reason] of Object.entries(BLOCKLIST)) {
    const src = path.join(dir, file);
    if (restore) {
      const from = path.join(baksDir, file);
      if (fs.existsSync(from)) {
        fs.mkdirSync(dir, { recursive: true });
        fs.copyFileSync(from, src);
        restored += 1;
      }
      continue;
    }
    if (!fs.existsSync(src)) continue;
    fs.mkdirSync(baksDir, { recursive: true });
    const bak = path.join(baksDir, `${file}`);
    if (!fs.existsSync(bak)) fs.copyFileSync(src, bak);
    fs.unlinkSync(src);
    moved += 1;
    console.log(`  🗑 已移除 ${rel(src)}  ← ${reason}`);
  }
}

if (restore) {
  console.log(`\n✅ 已从 .publish-excluded/ 恢复 ${restored} 个素材（仅本地使用，勿提交）`);
  process.exit(0);
}

/* ---------------- 2) 清理代码里的引用 ---------------- */
const CODE_FILES = [
  'src/data/brand-content.mjs',
];
// 前端/小程序里可能出现的内联引用
const EXTRA_FILES = [
  path.resolve(ROOT, '..', 'frontend', 'scripts', 'views', 'home.js'),
  path.resolve(ROOT, '..', 'frontend', 'scripts', 'views', 'trace.js'),
  path.resolve(ROOT, '..', 'frontend', 'scripts', 'views', 'me.js'),
  path.resolve(ROOT, '..', 'frontend', 'scripts', 'views', 'order.js'),
];

let cleaned = 0;
const allFiles = [
  ...CODE_FILES.map((f) => path.join(ROOT, f)),
  ...EXTRA_FILES,
];

for (const f of allFiles) {
  if (!fs.existsSync(f)) continue;
  let text = fs.readFileSync(f, 'utf8');
  const before = text;
  for (const file of Object.keys(BLOCKLIST)) {
    // 匹配形如 image41.jpeg / image42.png 的字符串引用
    const re = new RegExp(`['"\`]([^'"\`]*?${file.replace('.', '\\.')})['"\`]`, 'g');
    text = text.replace(re, "'' /* 该素材含个人信息，已在发布版本中移除 */");
  }
  if (text !== before) {
    fs.writeFileSync(f, text, 'utf8');
    cleaned += 1;
    console.log(`  ✂️  已清理引用：${rel(f)}`);
  }
}

/* ---------------- 3) 报告 ---------------- */
console.log('');
console.log(`✅ 脱敏完成：移除素材 ${moved} 个，清理引用文件 ${cleaned} 个`);
console.log(`   被移除的素材已备份到 ${rel(baksDir)}（该目录已加入 .gitignore，不会被提交）`);
console.log('   若页面因此缺少某张配图，属预期行为；本地演示需要时可执行 --restore 恢复。');
