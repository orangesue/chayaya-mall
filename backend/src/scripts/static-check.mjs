/**
 * 后端源码静态检查：找出"使用了但没声明/没导入"的标识符
 * 用法: node src/scripts/static-check.mjs
 *
 * 为什么需要：
 *   模块拆分（把纯规则函数抽到 data/ai-rules.mjs）时很容易漏改引用，
 *   而 JS 只有真正执行到那一行才抛 ReferenceError —— 测试没覆盖到就漏了。
 *   实际来源：曾经漏导入 LEVEL_HEADLINE，只有请求真正走到"症状"分支才暴露。
 *
 * 实现方式：用 acorn 把每个模块解析成 AST，再收集所有"绑定"（导入/声明/参数/解构/类/标签），
 *          最后找出既不是绑定、也不在全局白名单、也不是属性访问的标识符。
 *          第一版用正则硬凑，误报 200+ 处，所以改用真正的解析器。
 */
import fs from 'node:fs';
import path from 'node:path';
import * as acorn from 'acorn';
import * as walk from 'acorn-walk';

const ROOT = path.resolve(process.cwd(), 'src');

/** 可用的全局标识符（Node / 浏览器 / JS 内置） */
const GLOBALS = new Set([
  'console', 'process', 'Buffer', 'globalThis', 'global', 'require', 'module', 'exports', '__dirname', '__filename',
  'setTimeout', 'clearTimeout', 'setInterval', 'clearInterval', 'setImmediate', 'queueMicrotask',
  'fetch', 'AbortController', 'URL', 'URLSearchParams', 'Headers', 'Request', 'Response', 'FormData', 'Blob',
  'TextEncoder', 'TextDecoder', 'structuredClone', 'performance', 'crypto', 'atob', 'btoa',
  'Promise', 'Array', 'Object', 'String', 'Number', 'Boolean', 'BigInt', 'Symbol', 'Math', 'JSON', 'Date',
  'RegExp', 'Error', 'TypeError', 'RangeError', 'SyntaxError', 'EvalError', 'ReferenceError', 'URIError',
  'Map', 'Set', 'WeakMap', 'WeakSet', 'Proxy', 'Reflect', 'Intl', 'Atomics',
  'Uint8Array', 'Uint8ClampedArray', 'Uint16Array', 'Uint32Array', 'Int8Array', 'Int16Array', 'Int32Array',
  'Float32Array', 'Float64Array', 'BigInt64Array', 'BigUint64Array', 'ArrayBuffer', 'SharedArrayBuffer', 'DataView',
  'isNaN', 'isFinite', 'parseInt', 'parseFloat', 'encodeURIComponent', 'decodeURIComponent', 'encodeURI', 'decodeURI',
  'Infinity', 'NaN', 'undefined', 'this', 'arguments', 'eval',
]);

function listFiles(dir) {
  const out = [];
  for (const e of fs.readdirSync(dir, { withFileTypes: true })) {
    const p = path.join(dir, e.name);
    if (e.isDirectory()) out.push(...listFiles(p));
    else if (e.name.endsWith('.mjs')) out.push(p);
  }
  return out;
}

/** 把一个"绑定目标"模式（可能是解构）里的所有名字加入 declared */
function collectPattern(node, declared) {
  if (!node) return;
  switch (node.type) {
    case 'Identifier':
      declared.add(node.name);
      break;
    case 'ObjectPattern':
      for (const p of node.properties) {
        if (p.type === 'RestElement') collectPattern(p.argument, declared);
        else collectPattern(p.value, declared);
      }
      break;
    case 'ArrayPattern':
      for (const el of node.elements) collectPattern(el, declared);
      break;
    case 'AssignmentPattern':
      collectPattern(node.left, declared);
      break;
    case 'RestElement':
      collectPattern(node.argument, declared);
      break;
    default:
      break;
  }
}

/**
 * 收集所有绑定名 + 所有被引用的标识符。
 * 引用识别规则：Identifier 出现的位置不是"属性名/键/标签/成员访问的属性"时算引用。
 */
function analyze(ast) {
  const declared = new Set();
  const refs = [];

  const recordRef = (node, isReference) => {
    if (node?.type === 'Identifier' && isReference) refs.push({ name: node.name, line: node.loc.start.line });
  };

  walk.ancestor(ast, {
    ImportDeclaration(node) {
      for (const s of node.specifiers) declared.add(s.local.name);
    },
    VariableDeclarator(node) {
      collectPattern(node.id, declared);
    },
    FunctionDeclaration(node) {
      if (node.id) declared.add(node.id.name);
      for (const p of node.params) collectPattern(p, declared);
    },
    FunctionExpression(node) {
      if (node.id) declared.add(node.id.name);
      for (const p of node.params) collectPattern(p, declared);
    },
    ArrowFunctionExpression(node) {
      for (const p of node.params) collectPattern(p, declared);
    },
    ClassDeclaration(node) {
      if (node.id) declared.add(node.id.name);
    },
    ClassExpression(node) {
      if (node.id) declared.add(node.id.name);
    },
    CatchClause(node) {
      if (node.param) collectPattern(node.param, declared);
    },
    LabeledStatement(node) {
      declared.add(node.label.name);
    },

    Identifier(node, ancestors) {
      const parent = ancestors[ancestors.length - 2];
      if (!parent) return;
      switch (parent.type) {
        case 'MemberExpression':
          if (parent.property === node && !parent.computed) return;   // a.b 里的 b
          break;
        case 'Property':
          if (parent.key === node && !parent.computed) return;        // { a: 1 } / { a } 的键
          break;
        case 'MethodDefinition':
        case 'PropertyDefinition':
          if (parent.key === node && !parent.computed) return;
          break;
        case 'ImportSpecifier':
        case 'ImportDefaultSpecifier':
        case 'ImportNamespaceSpecifier':
        case 'ExportSpecifier':
          return;
        case 'LabeledStatement':
        case 'BreakStatement':
        case 'ContinueStatement':
          return;
        default:
          break;
      }
      // 声明目标本身不算"引用"（由上面的 collectPattern 处理）
      if (parent.type === 'VariableDeclarator' && parent.id === node) return;
      if ((parent.type === 'FunctionDeclaration' || parent.type === 'FunctionExpression'
        || parent.type === 'ArrowFunctionExpression') && parent.params?.includes(node)) return;
      recordRef(node, true);
    },
  });

  return { declared, refs };
}

let totalIssues = 0;
let parsed = 0;
const files = listFiles(ROOT);

for (const file of files) {
  const source = fs.readFileSync(file, 'utf8');
  let ast;
  try {
    ast = acorn.parse(source, { ecmaVersion: 'latest', sourceType: 'module', locations: true });
  } catch (e) {
    console.log(`\n${path.relative(process.cwd(), file)}`);
    console.log(`  ❌ 解析失败：${e.message}`);
    totalIssues += 1;
    continue;
  }
  parsed += 1;

  const { declared, refs } = analyze(ast);
  const issues = new Map();
  for (const r of refs) {
    if (declared.has(r.name)) continue;
    if (GLOBALS.has(r.name)) continue;
    if (!issues.has(r.name)) issues.set(r.name, r.line);
  }

  if (issues.size) {
    totalIssues += issues.size;
    console.log(`\n${path.relative(process.cwd(), file)}`);
    for (const [name, line] of issues) {
      console.log(`  ❌ 第 ${line} 行：${name} —— 使用了但未声明/未导入`);
    }
  }
}

console.log('');
console.log(`静态检查完成：解析 ${parsed}/${files.length} 个文件，发现 ${totalIssues} 处未定义标识符`);
process.exit(totalIssues ? 1 : 0);
