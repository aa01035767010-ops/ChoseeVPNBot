import sqlite3 from 'sqlite3';
import { open } from 'sqlite';
import { config } from './config.js';

let db = null;

export async function initDb() {
  db = await open({
    filename: config.dbName,
    driver: sqlite3.Database
  });

  // Enable foreign key support
  await db.get('PRAGMA foreign_keys = ON');

  // Create Users Table
  await db.exec(`
    CREATE TABLE IF NOT EXISTS users (
      id INTEGER PRIMARY KEY,
      username TEXT,
      balance REAL DEFAULT 0,
      created_at TEXT NOT NULL
    )
  `);

  // Create Devices Table
  await db.exec(`
    CREATE TABLE IF NOT EXISTS devices (
      id TEXT PRIMARY KEY,
      user_id INTEGER,
      name TEXT NOT NULL,
      client_uuid TEXT NOT NULL,
      vless_link TEXT NOT NULL,
      created_at TEXT NOT NULL,
      expires_at TEXT NOT NULL,
      FOREIGN KEY(user_id) REFERENCES users(id) ON DELETE CASCADE
    )
  `);

  // Create Transactions Table
  await db.exec(`
    CREATE TABLE IF NOT EXISTS transactions (
      id TEXT PRIMARY KEY,
      user_id INTEGER,
      amount REAL NOT NULL,
      status TEXT DEFAULT 'pending',
      created_at TEXT NOT NULL,
      FOREIGN KEY(user_id) REFERENCES users(id)
    )
  `);

  console.log('📦 Database initialized successfully.');
  return db;
}

// User helper methods
export async function getUser(id, username = null) {
  let user = await db.get('SELECT * FROM users WHERE id = ?', id);
  if (!user) {
    const now = new Date().toISOString();
    await db.run(
      'INSERT INTO users (id, username, balance, created_at) VALUES (?, ?, 0, ?)',
      id,
      username || `user_${id}`,
      now
    );
    user = await db.get('SELECT * FROM users WHERE id = ?', id);
    console.log(`👤 Created new user entry in database for ID: ${id}`);
  } else if (username && user.username !== username) {
    // Keep username updated in DB
    await db.run('UPDATE users SET username = ? WHERE id = ?', username, id);
    user.username = username;
  }
  return user;
}

export async function updateBalance(id, amount) {
  await db.run('UPDATE users SET balance = balance + ? WHERE id = ?', amount, id);
  return db.get('SELECT * FROM users WHERE id = ?', id);
}

// Device helper methods
export async function getUserDevices(userId) {
  return db.all('SELECT * FROM devices WHERE user_id = ? ORDER BY created_at DESC', userId);
}

export async function getDevice(deviceId) {
  return db.get('SELECT * FROM devices WHERE id = ?', deviceId);
}

export async function addDevice(id, userId, name, clientUuid, vlessLink, expiresAt) {
  const now = new Date().toISOString();
  await db.run(
    'INSERT INTO devices (id, user_id, name, client_uuid, vless_link, created_at, expires_at) VALUES (?, ?, ?, ?, ?, ?, ?)',
    id,
    userId,
    name,
    clientUuid,
    vlessLink,
    now,
    expiresAt
  );
  return db.get('SELECT * FROM devices WHERE id = ?', id);
}

export async function deleteDevice(userId, deviceId) {
  return db.run('DELETE FROM devices WHERE id = ? AND user_id = ?', deviceId, userId);
}

// Transaction helper methods
export async function createTransaction(id, userId, amount) {
  const now = new Date().toISOString();
  await db.run(
    'INSERT INTO transactions (id, user_id, amount, status, created_at) VALUES (?, ?, ?, \'pending\', ?)',
    id,
    userId,
    amount,
    now
  );
  return db.get('SELECT * FROM transactions WHERE id = ?', id);
}

export async function getTransaction(id) {
  return db.get('SELECT * FROM transactions WHERE id = ?', id);
}

export async function completeTransaction(id) {
  const transaction = await db.get('SELECT * FROM transactions WHERE id = ?', id);
  if (!transaction) throw new Error('Transaction not found');
  if (transaction.status === 'completed') return transaction;

  // Perform inside transaction or simple updates
  await db.run('UPDATE transactions SET status = \'completed\' WHERE id = ?', id);
  await db.run('UPDATE users SET balance = balance + ? WHERE id = ?', transaction.amount, transaction.user_id);

  console.log(`💰 Transaction ${id} completed. Added ${transaction.amount} to user ${transaction.user_id}`);
  return db.get('SELECT * FROM transactions WHERE id = ?', id);
}
