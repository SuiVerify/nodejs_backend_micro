# SuiVerify Backend Microservice

Node.js backend microservice for NFT payment settlement on Sui blockchain.

## Overview

This microservice handles NFT settlement after ZK verification is complete. When a user verifies their identity through the SuiVerify system, this backend:

1. Receives settlement request with verification details
2. Calls `settle_nft_payment_with_vault` on the Sui blockchain
3. Records the settlement in PostgreSQL database
4. Returns transaction details to the frontend

## Architecture Flow

```
┌─────────────────────────────────────────────────────────────────────────────┐
│                           SuiVerify Settlement Flow                          │
└─────────────────────────────────────────────────────────────────────────────┘

┌──────────┐     ┌──────────────┐     ┌─────────────────┐     ┌─────────────┐
│  User    │────▶│   Frontend   │────▶│  This Backend   │────▶│ Sui Network │
│  (DID)   │     │  (zkLogin)   │     │  (settlement)   │     │  (testnet)  │
└──────────┘     └──────────────┘     └─────────────────┘     └─────────────┘
     │                  │                      │                      │
     │  1. ZK Verify    │                      │                      │
     │─────────────────▶│                      │                      │
     │                  │  2. Enclave TX       │                      │
     │                  │  returns digest      │                      │
     │                  │◀─────────────────────│                      │
     │                  │                      │                      │
     │                  │  3. POST /settle     │                      │
     │                  │─────────────────────▶│                      │
     │                  │                      │  4. settle_nft_payment_with_vault
     │                  │                      │─────────────────────▶│
     │                  │                      │                      │
     │                  │                      │  5. TX Success       │
     │                  │                      │◀─────────────────────│
     │                  │                      │                      │
     │                  │  6. Settlement       │  7. Store in DB      │
     │                  │     Response         │─────────┐            │
     │                  │◀─────────────────────│         ▼            │
     │                  │                      │   ┌──────────┐       │
     │  8. Show Result  │                      │   │ Postgres │       │
     │◀─────────────────│                      │   └──────────┘       │
     │                  │                      │                      │
```

## Smart Contract Functions

The deployed contract (`0xac8705fa...`) has two settlement functions:

### 1. `settle_nft_payment_with_vault` (Currently Used)

Marks NFT as settled AND transfers settlement fee from protocol vault to SuiVerify treasury.

```move
entry settle_nft_payment_with_vault(
    registry: &mut PaymentRegistry,  // Shared object
    cap: &PaymentCap,                // Admin capability (owned)
    vault: &mut ProtocolVault,       // Protocol's vault (shared)
    protocol_uid: u64,               // Protocol ID (1000)
    nft_id: ID,                      // DID NFT being settled
    nft_name: String,                // NFT name for event
    clock: &Clock                    // System clock
)
```

**Use Case:** Charges the protocol for each verification (0.003 SUI per settlement).

### 2. `settle_nft_payment` (Alternative - commented out in code)

Marks NFT as settled and emits event. Does NOT transfer funds from vault.

```move
entry settle_nft_payment(
    registry: &mut PaymentRegistry,  // Shared object
    cap: &PaymentCap,                // Admin capability (owned)
    protocol_uid: u64,               // Protocol ID (1000)
    nft_id: ID,                      // DID NFT being settled
    nft_name: String,                // NFT name for event
    clock: &Clock                    // System clock
)
```

**Use Case:** When you want to record settlement without moving funds from vault.

## Project Structure

```
nodejs_backend_micro/
├── data/
│   └── protocol-config.json    # Contract addresses & protocol config
├── src/
│   ├── config/
│   │   └── sui.config.ts       # Sui client & keypair setup
│   ├── controllers/
│   │   └── settlement.controller.ts  # Settlement logic & TX building
│   ├── routes/
│   │   └── settlement.routes.ts      # API routes
│   ├── services/
│   │   └── database.service.ts       # PostgreSQL operations
│   ├── app.ts                  # Express app setup
│   └── server.ts               # Server entry point
├── .env                        # Environment variables
├── .env.example                # Example env file
├── package.json
└── tsconfig.json
```

## Setup

### 1. Install Dependencies

```bash
npm install
```

### 2. Configure Environment Variables

Create `.env` file:

```env
# Sui Network
SUI_NETWORK=testnet
SUI_RPC_URL=https://fullnode.testnet.sui.io:443

# Admin Private Key (must be protocol owner address)
# This wallet owns PaymentCap and is registered as protocol owner
ADMIN_PRIVATE_KEY=suiprivkey1qplqtjp2mngg67u3dw40r6h99am8y9hsypfanng2td3lpd36sfgygz6gh39

# PostgreSQL Database (Supabase)
DATABASE_URL=postgresql://postgres:password@db.xxx.supabase.co:5432/postgres

# Server
PORT=3001
NODE_ENV=development
```

### 3. Run the Server

```bash
# Development mode
npm run dev

# Production mode
npm run build && npm start
```

## API Endpoints

### POST `/api/settlement/settle`

Settle an NFT payment after ZK verification.

**Request Body:**
```json
{
  "enclaveTxDigest": "BHKjhBHFyvZZPjpSxLCR5MqHCjKxHPJvqxKQHKjV9H9V",
  "didVerifiedId": "0x35849ea49b6e4abfd3628d33cca0c6a3a5ba05c05e0aa1f6d52cf3105cfd2f10",
  "didNftName": "Age Verification NFT",
  "userAddress": "0xaa266beb057eeba4f686ef40ab0a8b96da69922fa4f548f2828c441b74398046"
}
```

| Field | Type | Description |
|-------|------|-------------|
| `enclaveTxDigest` | string | Transaction digest from ZK enclave verification |
| `didVerifiedId` | string | The DID NFT object ID that was verified |
| `didNftName` | string (optional) | Human-readable name of the NFT |
| `userAddress` | string | Sui address of user who verified |

**Success Response (200):**
```json
{
  "success": true,
  "message": "NFT payment settled successfully",
  "data": {
    "enclaveTxDigest": "BHKjhBHFyvZZPjpSxLCR5MqHCjKxHPJvqxKQHKjV9H9V",
    "didVerifiedId": "0x35849ea49b6e4abfd3628d33cca0c6a3a5ba05c05e0aa1f6d52cf3105cfd2f10",
    "didNftName": "Age Verification NFT",
    "protocolUid": 1000,
    "protocolName": "test",
    "protocolAddress": "0xaa266beb057eeba4f686ef40ab0a8b96da69922fa4f548f2828c441b74398046",
    "userAddress": "0xaa266beb057eeba4f686ef40ab0a8b96da69922fa4f548f2828c441b74398046",
    "paymentTxDigest": "7rDBN3iAZc4C7C8vNZcxtbazN79PExua2pTtxu75Mxj8",
    "settlementAmount": 3000000,
    "explorerUrl": "https://suiscan.xyz/testnet/tx/7rDBN3iAZc4C7C8vNZcxtbazN79PExua2pTtxu75Mxj8"
  }
}
```

**Error Response (409 - Already Settled):**
```json
{
  "success": false,
  "error": "DID NFT has already been settled",
  "data": { /* existing settlement record */ }
}
```

### GET `/api/settlement/all`

Get all settlements (bulk). Supports optional pagination.

**Query Parameters:**
| Param | Type | Description |
|-------|------|-------------|
| `limit` | number (optional) | Max records to return |
| `page` | number (optional) | Page number (1-based, requires limit) |
| `offset` | number (optional) | Skip N records (alternative to page) |

**Examples:**
```bash
# Get all settlements
GET /api/settlement/all

# Get first 10 settlements
GET /api/settlement/all?limit=10

# Get page 2 (items 11-20)
GET /api/settlement/all?limit=10&page=2

# Get 10 items starting from 6th record
GET /api/settlement/all?limit=10&offset=5
```

**Response (without pagination):**
```json
{
  "success": true,
  "total": 5,
  "count": 5,
  "data": [ /* array of settlement records */ ]
}
```

**Response (with pagination):**
```json
{
  "success": true,
  "total": 100,
  "count": 10,
  "pagination": {
    "limit": 10,
    "offset": 0,
    "page": 1,
    "totalPages": 10
  },
  "data": [ /* array of settlement records */ ]
}
```

### GET `/api/settlement/:id`

Get single settlement by database ID (serial number).

**Example:**
```bash
GET /api/settlement/1
```

**Response:**
```json
{
  "success": true,
  "data": {
    "id": 1,
    "enclave_tx_digest": "EKKjhBHFyvZZPjpSxLCR5MqHCjKxHPJvqxKQHKjV9H9Y",
    "did_verified_id": "0x65849ea49b6e4abfd3628d33cca0c6a3a5ba05c05e0aa1f6d52cf3105cfd2f13",
    "did_nft_name": "Test DID NFT 4",
    "protocol_uid": 1000,
    "protocol_name": "test",
    "protocol_address": "0xaa266beb057eeba4f686ef40ab0a8b96da69922fa4f548f2828c441b74398046",
    "user_address": "0xaa266beb057eeba4f686ef40ab0a8b96da69922fa4f548f2828c441b74398046",
    "payment_tx_digest": "7rDBN3iAZc4C7C8vNZcxtbazN79PExua2pTtxu75Mxj8",
    "settlement_amount": "3000000",
    "timestamp": "1763797940479",
    "created_at": "2025-11-22T02:22:20.684Z",
    "status": "success"
  }
}
```

**Error Response (404):**
```json
{
  "success": false,
  "error": "Settlement with id 999 not found"
}
```

### GET `/api/settlement/status/:nftId`

Check if an NFT has been settled by DID NFT ID.

**Response:**
```json
{
  "success": true,
  "settled": true,
  "data": {
    "id": 1,
    "enclave_tx_digest": "BHKjhBHFyvZZPjpSxLCR5MqHCjKxHPJvqxKQHKjV9H9V",
    "did_verified_id": "0x35849ea...",
    "payment_tx_digest": "7rDBN3iA...",
    "created_at": "2025-11-22T07:00:00.000Z"
  }
}
```

### GET `/api/settlement/user/:userAddress`

Get all settlements for a specific user address.

### GET `/api/settlement/health`

Health check endpoint.

```json
{
  "success": true,
  "status": "healthy",
  "adminAddress": "0xaa266beb...",
  "packageId": "0xac8705fa...",
  "protocolUid": 1000,
  "protocolName": "test",
  "timestamp": "2025-11-22T07:00:00.000Z"
}
```

## Contract Information

| Object | ID |
|--------|-----|
| Package ID | `0xac8705fa3257db9641ba4ff340060984f42124cc2dfab9903d7505323c0080a3` |
| Payment Registry | `0xf9f37bcd05810d2929e2446d498c63a218b3d18c73227e7964ffae936000830d` |
| Payment Cap | `0x4a7cee5cddeef2bc33679880e1ef779f4c8077e1b20e1e3beee9e8644ecf9f8a` |
| Protocol Vault | `0x000b0127fe611a68526c71d7335c9151cf18abe27711a4a7993ff8cea13556d5` |
| Clock | `0x0000000000000000000000000000000000000000000000000000000000000006` |

## Protocol Configuration

| Setting | Value |
|---------|-------|
| Protocol Name | `test` |
| Protocol UID | `1000` |
| Protocol Owner | `0xaa266beb057eeba4f686ef40ab0a8b96da69922fa4f548f2828c441b74398046` |
| Settlement Fee | 0.003 SUI (3,000,000 MIST) |

## Database Schema

```sql
CREATE TABLE nft_settlements (
  id SERIAL PRIMARY KEY,
  -- Enclave verification
  enclave_tx_digest VARCHAR(64) NOT NULL,
  -- DID NFT
  did_verified_id VARCHAR(66) NOT NULL UNIQUE,
  did_nft_name VARCHAR(255),
  -- Protocol info
  protocol_uid INTEGER NOT NULL,
  protocol_name VARCHAR(100),
  protocol_address VARCHAR(66),
  -- User info
  user_address VARCHAR(66) NOT NULL,
  -- Payment settlement
  payment_tx_digest VARCHAR(64) NOT NULL UNIQUE,
  settlement_amount BIGINT,
  -- Metadata
  timestamp BIGINT,
  created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
  status VARCHAR(20) DEFAULT 'success'
);
```

## Testing with cURL

```bash
# Health check
curl http://localhost:3001/api/settlement/health

# Settle NFT payment
curl -X POST http://localhost:3001/api/settlement/settle \
  -H "Content-Type: application/json" \
  -d '{
    "enclaveTxDigest": "BHKjhBHFyvZZPjpSxLCR5MqHCjKxHPJvqxKQHKjV9H9V",
    "didVerifiedId": "0x35849ea49b6e4abfd3628d33cca0c6a3a5ba05c05e0aa1f6d52cf3105cfd2f10",
    "didNftName": "Test DID NFT",
    "userAddress": "0xaa266beb057eeba4f686ef40ab0a8b96da69922fa4f548f2828c441b74398046"
  }'

# Get all settlements
curl http://localhost:3001/api/settlement/all

# Get all settlements with pagination
curl "http://localhost:3001/api/settlement/all?limit=10&page=1"

# Get single settlement by ID
curl http://localhost:3001/api/settlement/1

# Check settlement status by NFT ID
curl http://localhost:3001/api/settlement/status/0x35849ea49b6e4abfd3628d33cca0c6a3a5ba05c05e0aa1f6d52cf3105cfd2f10

# Get user's settlements
curl http://localhost:3001/api/settlement/user/0xaa266beb057eeba4f686ef40ab0a8b96da69922fa4f548f2828c441b74398046
```

## Switching Between Settlement Functions

The code contains both functions. To switch, edit `src/controllers/settlement.controller.ts`:

- **OPTION 1** (commented out): `settle_nft_payment` - No fund transfer
- **OPTION 2** (active): `settle_nft_payment_with_vault` - With fund transfer

Simply comment/uncomment the appropriate section in the controller.

## Verified Transactions

| Function | TX Digest | Explorer |
|----------|-----------|----------|
| settle_nft_payment_with_vault | `7rDBN3iAZc4C7C8vNZcxtbazN79PExua2pTtxu75Mxj8` | [View](https://suiscan.xyz/testnet/tx/7rDBN3iAZc4C7C8vNZcxtbazN79PExua2pTtxu75Mxj8) |
| settle_nft_payment | `AWGzdUXy9Cp3Z8XcMeqh2oAGwPmFoXXjSnBek2ydd3UN` | [View](https://suiscan.xyz/testnet/tx/AWGzdUXy9Cp3Z8XcMeqh2oAGwPmFoXXjSnBek2ydd3UN) |

## License

ISC
