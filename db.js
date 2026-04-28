'use strict';
const { createClient } = require('@libsql/client');

const client = createClient(
  process.env.TURSO_DATABASE_URL
    ? { url: process.env.TURSO_DATABASE_URL, authToken: process.env.TURSO_AUTH_TOKEN || '' }
    : { url: 'file:database.db' }
);

function toObj(row, columns) {
  if (row == null) return null;
  const obj = {};
  columns.forEach(col => { obj[col] = row[col]; });
  return obj;
}

function prepare(sql) {
  return {
    async get(...args) {
      const r = await client.execute({ sql, args: args.flat() });
      return toObj(r.rows[0] ?? null, r.columns);
    },
    async all(...args) {
      const r = await client.execute({ sql, args: args.flat() });
      return r.rows.map(row => toObj(row, r.columns));
    },
    async run(...args) {
      const r = await client.execute({ sql, args: args.flat() });
      return { changes: r.rowsAffected, lastInsertRowid: Number(r.lastInsertRowid ?? 0) };
    },
  };
}

async function exec(sql) {
  const stmts = sql.split(';').map(s => s.trim()).filter(Boolean);
  for (const s of stmts) await client.execute({ sql: s, args: [] });
}

async function pragma(stmt) {
  try { await client.execute(`PRAGMA ${stmt}`); } catch (_) {}
}

module.exports = { prepare, exec, pragma };
