# SuiVerify Backend Microservice

Node.js backend microservice for NFT payment settlement on Sui blockchain.

## Overview

This microservice handles the `settle_nft_payment_with_vault` function call to the SuiVerify payment contract. When an NFT verification is complete, this service:

1. Receives NFT settlement request
2. Builds and signs a transaction to settle the NFT payment
3. Executes the transaction on Sui testnet
4. Stores the transaction digest in PostgreSQL

## Project Structure

```
nodejs_backend_micro/
├── data/
│   └── protocol-config.json    # Hardcoded contract addresses & protocol config
├── src/
│   ├── config/
│   │   └── sui.config.js       # Sui client & contract configuration
│   ├── controllers/
│   │   └── settlement.controller.js  # Settlement business logic
│   ├── routes/
│   │   └── settlement.routes.js      # API route definitions
│   ├── services/
│   │   └── database.service.js       # PostgreSQL operations
│   ├── app.js                  # Express app setup
│   └── server.js               # Server entry point
├── .env                        # Environment variables (not committed)
├── .env.example                # Example environment variables
└── package.json
```

## Setup

### 1. Install Dependencies

```bash
npm install
```

### 2. Configure Environment Variables

Edit `.env` file with your credentials:

```env
# Sui Network
SUI_NETWORK=testnet
SUI_RPC_URL=https://fullnode.testnet.sui.io:443

# Admin Private Key (wallet that owns PaymentCap)
ADMIN_PRIVATE_KEY=your_private_key_here

# PostgreSQL Database
DATABASE_URL=postgresql://user:password@host:5432/database

# Server
PORT=3001
NODE_ENV=development
```

### 3. Run the Server

```bash
# Development mode (with hot reload)
npm run dev

# Production mode
npm start
```

## API Endpoints

### POST `/api/settlement/settle`

Settle an NFT payment on-chain.

**Request Body:**
```json
{
  "nftId": "0x1234567890abcdef...",
  "nftName": "Age Verification NFT"
}
```

**Response:**
```json
{
  "success": true,
  "message": "NFT payment settled successfully",
  "data": {
    "digest": "ABC123...",
    "nftId": "0x1234...",
    "protocolUid": 1000,
    "settlementAmount": 3000000,
    "explorerUrl": "https://suiscan.xyz/testnet/tx/ABC123..."
  }
}
```

### GET `/api/settlement/status/:nftId`

Check if an NFT has been settled.

### GET `/api/settlement/health`

Health check endpoint.

## Contract Information

| Object | ID |
|--------|-----|
| Package ID | `0xac8705fa3257db9641ba4ff340060984f42124cc2dfab9903d7505323c0080a3` |
| Payment Registry | `0xf9f37bcd05810d2929e2446d498c63a218b3d18c73227e7964ffae936000830d` |
| Payment Cap | `0x4a7cee5cddeef2bc33679880e1ef779f4c8077e1b20e1e3beee9e8644ecf9f8a` |
| Protocol Vault | `0x000b0127fe611a68526c71d7335c9151cf18abe27711a4a7993ff8cea13556d5` |
| Protocol UID | `1000` |

## Settlement Fee

- **Amount:** 0.003 SUI (3,000,000 MIST) per NFT settlement
- Deducted from Protocol Vault and transferred to SuiVerify Treasury

## Database Schema

```sql
CREATE TABLE nft_settlements (
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
);
```

## License

ISC
