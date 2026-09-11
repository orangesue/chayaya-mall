/**
 * GitHub 仓库创建与推送辅助脚本（仅本地使用）
 * 用法: node src/scripts/github-publish.mjs [--dry-run]
 *
 * 说明：
 *  - 凭据从本机 git 凭据管理器读取（git credential fill），**不写进任何文件**；
 *  - 只读取用户名与 token，token 不会打印到日志；
 *  - --dry-run 只检查权限与账号信息，不做任何写操作。
 */
import { spawnSync } from 'node:child_process';

const REPO = 'chayaya-mall';
const DRY = process.argv.includes('--dry-run');

/** 从 git 凭据管理器取 github.com 的凭据 */
function readCredential() {
  const res = spawnSync('git', ['credential', 'fill'], {
    input: 'protocol=https\nhost=github.com\n\n',
    encoding: 'utf8',
    env: { ...process.env, GIT_TERMINAL_PROMPT: '0' },
  });
  const out = res.stdout || '';
  const username = (out.match(/^username=(.*)$/m) || [])[1];
  const password = (out.match(/^password=(.*)$/m) || [])[1];
  return { username, password };
}

const GH = 'https://api.github.com';

async function api(token, path, { method = 'GET', body } = {}) {
  const res = await fetch(`${GH}${path}`, {
    method,
    headers: {
      Authorization: `Bearer ${token}`,
      Accept: 'application/vnd.github+json',
      'User-Agent': 'chayaya-publish-script',
      'X-GitHub-Api-Version': '2022-11-28',
    },
    ...(body ? { body: JSON.stringify(body) } : {}),
  });
  const text = await res.text();
  let json = null;
  try { json = text ? JSON.parse(text) : null; } catch { /* 非 JSON */ }
  return { status: res.status, ok: res.ok, json, text, scopes: res.headers.get('x-oauth-scopes') };
}

const { username, password } = readCredential();
if (!username || !password) {
  console.error('❌ 未能从本机凭据管理器读到 GitHub 凭据');
  console.error('   请在 GitHub 手动新建空仓库后，执行：');
  console.error('   git remote add origin git@github.com:<你的用户名>/chayaya-mall.git && git push -u origin main');
  process.exit(1);
}
console.log(`凭据用户名：${username}`);
console.log(`凭据类型：${password.length} 字符（疑似 Personal Access Token）`);

const me = await api(password, '/user');
if (!me.ok) {
  console.error(`❌ 调用 /user 失败：HTTP ${me.status} ${me.json?.message || ''}`);
  process.exit(1);
}
console.log(`账号：${me.json.login}（${me.json.name || '未设置姓名'}）`);
console.log(`可见范围：${me.json.public_repos} 个公开仓库 / 共 ${me.json.total_private_repos ?? 0} 个私有仓库`);

const scopes = me.scopes;
console.log(`Token 权限范围：${scopes ? scopes : '（未返回 x-oauth-scopes，可能是 Fine-grained Token）'}`);

// 检查仓库是否已存在
const existed = await api(password, `/repos/${me.json.login}/${REPO}`);
if (existed.ok) {
  console.log(`\nℹ️  仓库 ${me.json.login}/${REPO} 已存在`);
  console.log(`   地址：${existed.json.html_url}`);
  console.log(`   默认分支：${existed.json.default_branch}   可见性：${existed.json.private ? '私有' : '公开'}`);
  console.log('\n直接推送即可：');
  console.log(`   git remote add origin git@github.com:${me.json.login}/${REPO}.git`);
  console.log('   git push -u origin main');
  process.exit(0);
}

if (DRY) {
  console.log('\n（--dry-run 模式，未做任何写操作）');
  console.log(`将创建仓库：${me.json.login}/${REPO}（公开）`);
  process.exit(0);
}

const created = await api(password, '/user/repos', {
  method: 'POST',
  body: {
    name: REPO,
    description: '茶芽芽 · 婴儿山茶抚触油全渠道商城 —— 商品购买 / 一物一码溯源（ECDSA 签名 + SHA-256 哈希链）/ 带医疗安全红线的 AI 客服 / 管理后台。大学生电商三创赛「浒口茶油·乡味新生」技术实现',
    homepage: '',
    private: false,
    has_issues: true,
    has_projects: false,
    has_wiki: false,
    auto_init: false,
  },
});

if (!created.ok) {
  console.error(`\n❌ 创建仓库失败：HTTP ${created.status}`);
  console.error(`   ${created.json?.message || created.text.slice(0, 200)}`);
  if (created.status === 403 || created.status === 401) {
    console.error('   原因通常是 Token 缺少 repo 权限。请用 GitHub 网页手动新建空仓库，或换一个有 repo 权限的 Token。');
  }
  process.exit(1);
}

console.log(`\n✅ 仓库创建成功：${created.json.html_url}`);
console.log(`   SSH 地址：${created.json.ssh_url}`);
console.log('\n接下来执行：');
console.log(`   git remote add origin ${created.json.ssh_url}`);
console.log('   git push -u origin main');
