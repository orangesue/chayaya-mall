/**
 * SQLite DDL → MySQL DDL 转换
 * schema.sql 以 SQLite 语法编写（默认驱动），部署到 MySQL 时由这里转换：
 *  - AUTOINCREMENT → AUTO_INCREMENT
 *  - TEXT 主键 / 唯一键 → VARCHAR(191)（MySQL 索引长度限制）
 *  - 其余 TEXT → LONGTEXT
 *  - REAL → DOUBLE
 * 目标是"同一份表结构，两套驱动都能跑通"，不追求覆盖 SQLite 全部语法。
 */

const INDEXED_TEXT_COLUMNS = new Set([
  'code', 'k', 'term', 'trace_code', 'batch_no', 'order_no', 'openid', 'phone', 'session_id',
  'inspection_no', 'nickname', 'name',
]);

/** 逐行判断：这一行的 TEXT 列是否参与索引 */
function mapTextInLine(line) {
  const indexed = /PRIMARY KEY|UNIQUE/i.test(line);
  return line.replace(/^(\s*)([A-Za-z_][A-Za-z0-9_]*)(\s+)TEXT\b/i, (m, indent, col, gap) => {
    const colName = col.toLowerCase();
    if (indexed || INDEXED_TEXT_COLUMNS.has(colName)) return `${indent}${col}${gap}VARCHAR(191)`;
    return `${indent}${col}${gap}LONGTEXT`;
  }).replace(/\bTEXT\b/gi, 'LONGTEXT');
}

export function toMySqlDdl(sqliteDdl) {
  const lines = sqliteDdl
    .split('\n')
    .filter((l) => !/^\s*--/.test(l))
    .map((l) => mapTextInLine(l));

  let out = lines.join('\n');
  out = out.replace(/\bINTEGER PRIMARY KEY AUTOINCREMENT\b/gi, 'BIGINT PRIMARY KEY AUTO_INCREMENT');
  out = out.replace(/\bAUTOINCREMENT\b/gi, 'AUTO_INCREMENT');
  out = out.replace(/\bREAL\b/gi, 'DOUBLE');
  out = out.replace(/\bINTEGER\b/gi, 'BIGINT');
  return out;
}

export default { toMySqlDdl };
