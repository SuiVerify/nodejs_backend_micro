import { Pool, PoolClient } from 'pg';

const DATABASE_URL = process.env.DATABASE_URL;

if (!DATABASE_URL) {
  throw new Error('DATABASE_URL environment variable is required');
}

// Create PostgreSQL connection pool
const pool = new Pool({
  connectionString: DATABASE_URL,
  ssl: { rejectUnauthorized: false },
});

// Settlement record interface
export interface SettlementRecord {
  id?: number;
  tx_digest: string;
  protocol_uid: number;
  nft_id: string;
  nft_name?: string;
  protocol_address?: string;
  settlement_amount?: number;
  timestamp?: number;
  created_at?: Date;
  status?: string;
}

// Initialize database - create tables if not exist
export async function initDatabase(): Promise<void> {
  const client = await pool.connect();
  try {
    await client.query(`
      CREATE TABLE IF NOT EXISTS nft_settlements (
        id SERIAL PRIMARY KEY,
        tx_digest VARCHAR(64) NOT NULL UNIQUE,
        protocol_uid INTEGER NOT NULL,
        nft_id VARCHAR(66) NOT NULL,
        nft_name VARCHAR(255),
        protocol_address VARCHAR(66),
        settlement_amount BIGINT,
        timestamp BIGINT,
        created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
        status VARCHAR(20) DEFAULT 'success'
      )
    `);
    console.log('Database initialized: nft_settlements table ready');
  } finally {
    client.release();
  }
}

// Store a settlement record
export async function storeSettlement(settlement: SettlementRecord): Promise<SettlementRecord> {
  const client = await pool.connect();
  try {
    const result = await client.query(
      `INSERT INTO nft_settlements
        (tx_digest, protocol_uid, nft_id, nft_name, protocol_address, settlement_amount, timestamp, status)
       VALUES ($1, $2, $3, $4, $5, $6, $7, $8)
       RETURNING *`,
      [
        settlement.tx_digest,
        settlement.protocol_uid,
        settlement.nft_id,
        settlement.nft_name || null,
        settlement.protocol_address || null,
        settlement.settlement_amount || null,
        settlement.timestamp || Date.now(),
        settlement.status || 'success',
      ]
    );
    return result.rows[0];
  } finally {
    client.release();
  }
}

// Get settlement by transaction digest
export async function getSettlementByDigest(txDigest: string): Promise<SettlementRecord | null> {
  const client = await pool.connect();
  try {
    const result = await client.query(
      'SELECT * FROM nft_settlements WHERE tx_digest = $1',
      [txDigest]
    );
    return result.rows[0] || null;
  } finally {
    client.release();
  }
}

// Check if NFT has been settled
export async function isNftSettled(nftId: string): Promise<boolean> {
  const client = await pool.connect();
  try {
    const result = await client.query(
      'SELECT id FROM nft_settlements WHERE nft_id = $1 AND status = $2',
      [nftId, 'success']
    );
    return result.rows.length > 0;
  } finally {
    client.release();
  }
}

// Get settlement by NFT ID
export async function getSettlementByNftId(nftId: string): Promise<SettlementRecord | null> {
  const client = await pool.connect();
  try {
    const result = await client.query(
      'SELECT * FROM nft_settlements WHERE nft_id = $1 ORDER BY created_at DESC LIMIT 1',
      [nftId]
    );
    return result.rows[0] || null;
  } finally {
    client.release();
  }
}

// Test database connection
export async function testConnection(): Promise<boolean> {
  try {
    const client = await pool.connect();
    await client.query('SELECT 1');
    client.release();
    console.log('Database connection successful');
    return true;
  } catch (error) {
    console.error('Database connection failed:', error);
    return false;
  }
}

// Close pool on shutdown
export async function closePool(): Promise<void> {
  await pool.end();
  console.log('Database pool closed');
}

export { pool };
