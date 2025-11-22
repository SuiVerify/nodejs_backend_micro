import { Pool } from 'pg';

const DATABASE_URL = process.env.DATABASE_URL;

if (!DATABASE_URL) {
  throw new Error('DATABASE_URL environment variable is required');
}

// Create PostgreSQL connection pool
const pool = new Pool({
  connectionString: DATABASE_URL,
  ssl: { rejectUnauthorized: false },
});

// Settlement record interface - stores all verification & payment data
export interface SettlementRecord {
  id?: number;
  // Enclave verification
  enclave_tx_digest: string;
  // DID NFT
  did_verified_id: string;
  did_nft_name?: string;
  // Protocol info
  protocol_uid: number;
  protocol_name?: string;
  protocol_address?: string;
  // User info
  user_address: string;
  // Payment settlement
  payment_tx_digest: string;
  settlement_amount?: number;
  // Metadata
  timestamp?: number;
  created_at?: Date;
  status?: string;
}

// Initialize database - create tables if not exist
export async function initDatabase(): Promise<void> {
  const client = await pool.connect();
  try {
    // Drop old table with outdated schema and create new one
    await client.query(`DROP TABLE IF EXISTS nft_settlements`);

    await client.query(`
      CREATE TABLE IF NOT EXISTS nft_settlements (
        id SERIAL PRIMARY KEY,
        enclave_tx_digest VARCHAR(64) NOT NULL,
        did_verified_id VARCHAR(66) NOT NULL,
        did_nft_name VARCHAR(255),
        protocol_uid INTEGER NOT NULL,
        protocol_name VARCHAR(255),
        protocol_address VARCHAR(66),
        user_address VARCHAR(66) NOT NULL,
        payment_tx_digest VARCHAR(64) NOT NULL UNIQUE,
        settlement_amount BIGINT,
        timestamp BIGINT,
        created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
        status VARCHAR(20) DEFAULT 'success'
      )
    `);

    // Create index on did_verified_id for faster lookups
    await client.query(`
      CREATE INDEX IF NOT EXISTS idx_nft_settlements_did ON nft_settlements(did_verified_id)
    `);

    // Create index on user_address
    await client.query(`
      CREATE INDEX IF NOT EXISTS idx_nft_settlements_user ON nft_settlements(user_address)
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
        (enclave_tx_digest, did_verified_id, did_nft_name, protocol_uid, protocol_name,
         protocol_address, user_address, payment_tx_digest, settlement_amount, timestamp, status)
       VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11)
       RETURNING *`,
      [
        settlement.enclave_tx_digest,
        settlement.did_verified_id,
        settlement.did_nft_name || null,
        settlement.protocol_uid,
        settlement.protocol_name || null,
        settlement.protocol_address || null,
        settlement.user_address,
        settlement.payment_tx_digest,
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

// Get settlement by payment transaction digest
export async function getSettlementByDigest(txDigest: string): Promise<SettlementRecord | null> {
  const client = await pool.connect();
  try {
    const result = await client.query(
      'SELECT * FROM nft_settlements WHERE payment_tx_digest = $1',
      [txDigest]
    );
    return result.rows[0] || null;
  } finally {
    client.release();
  }
}

// Check if DID NFT has been settled
export async function isNftSettled(didVerifiedId: string): Promise<boolean> {
  const client = await pool.connect();
  try {
    const result = await client.query(
      'SELECT id FROM nft_settlements WHERE did_verified_id = $1 AND status = $2',
      [didVerifiedId, 'success']
    );
    return result.rows.length > 0;
  } finally {
    client.release();
  }
}

// Get settlement by DID NFT ID
export async function getSettlementByNftId(didVerifiedId: string): Promise<SettlementRecord | null> {
  const client = await pool.connect();
  try {
    const result = await client.query(
      'SELECT * FROM nft_settlements WHERE did_verified_id = $1 ORDER BY created_at DESC LIMIT 1',
      [didVerifiedId]
    );
    return result.rows[0] || null;
  } finally {
    client.release();
  }
}

// Get all settlements for a user
export async function getSettlementsByUser(userAddress: string): Promise<SettlementRecord[]> {
  const client = await pool.connect();
  try {
    const result = await client.query(
      'SELECT * FROM nft_settlements WHERE user_address = $1 ORDER BY created_at DESC',
      [userAddress]
    );
    return result.rows;
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
