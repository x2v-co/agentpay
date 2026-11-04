import { DatabaseSync } from 'node:sqlite';
import type { Mode, Order } from './model.js';
import { invariant } from './model.js';

/** Durable single-host store. Transactions serialize claims across processes.
 * Never persist the signed payment payload or a wallet secret. */
export class OrderStore {
  private db: DatabaseSync;
  private closed = false;
  constructor(path: string, mode: Mode, private totalLimitAtomic = '10000') {
    this.db = new DatabaseSync(path);
    this.db.exec('PRAGMA journal_mode=WAL; PRAGMA synchronous=FULL; PRAGMA busy_timeout=5000;');
    this.db.exec(`CREATE TABLE IF NOT EXISTS settings (key TEXT PRIMARY KEY, value TEXT NOT NULL);
      CREATE TABLE IF NOT EXISTS orders (id TEXT PRIMARY KEY, payment_id TEXT UNIQUE, transaction_id TEXT UNIQUE, body TEXT NOT NULL);`);
    this.db.prepare('INSERT OR IGNORE INTO settings VALUES (?, ?)').run('mode', mode);
    const saved = this.db.prepare('SELECT value FROM settings WHERE key=?').get('mode');
    if (saved?.value !== mode) { this.db.close(); invariant(false, 'database_mode_mismatch'); }
  }
  close() { if (!this.closed) { this.db.close(); this.closed = true; } }
  private transaction<T>(fn: () => T): T {
    this.db.exec('BEGIN IMMEDIATE');
    try { const value = fn(); this.db.exec('COMMIT'); return value; }
    catch (error) { this.db.exec('ROLLBACK'); throw error; }
  }
  get(id: string): Order {
    const row = this.db.prepare('SELECT body FROM orders WHERE id=?').get(id);
    invariant(row, 'order_not_found', 404);
    return JSON.parse(String(row.body)) as Order;
  }
  private save(order: Order) {
    this.db.prepare('UPDATE orders SET body=?, payment_id=?, transaction_id=? WHERE id=?')
      .run(JSON.stringify(order), order.paymentId ?? null, order.transaction ?? null, order.id);
  }
  create(order: Order) {
    this.transaction(() => {
      const rows = this.db.prepare('SELECT body FROM orders').all();
      const reserved = rows.map(row => JSON.parse(String(row.body)) as Order)
        .filter(o => o.payer === order.payer && o.state !== 'rejected' && (o.state !== 'quoted' || o.expiresAt > order.createdAt))
        .reduce((sum, o) => sum + BigInt(o.requirements.amount), 0n);
      invariant(reserved + BigInt(order.requirements.amount) <= BigInt(this.totalLimitAtomic), 'total_budget_exceeded', 409);
      this.db.prepare('INSERT INTO orders (id,body) VALUES (?,?)').run(order.id, JSON.stringify(order));
    });
    return order;
  }
  /** Persist the unique message identity BEFORE the irreversible settle call. */
  claim(id: string, paymentId: string, now: number): boolean {
    return this.transaction(() => {
      const order = this.get(id);
      if (order.state !== 'quoted') {
        invariant(order.paymentId === paymentId, 'order_payment_conflict', 409);
        return false;
      }
      invariant(now < order.expiresAt, 'quote_expired', 409);
      const prior = this.db.prepare('SELECT id FROM orders WHERE payment_id=?').get(paymentId);
      invariant(!prior || prior.id === id, 'payment_replay', 409);
      order.paymentId = paymentId;
      order.state = 'settling';
      this.save(order);
      return true;
    });
  }
  update(id: string, fn: (order: Order) => void): Order {
    return this.transaction(() => {
      const order = this.get(id);
      fn(order);
      this.save(order);
      return order;
    });
  }
}
