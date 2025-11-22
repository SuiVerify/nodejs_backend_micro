# SuiVerify Settlement Backend

Production-grade Node.js microservice for NFT payment settlement on Sui blockchain. Handles on-chain settlement transactions after successful DID verification.

## Overview

This backend receives settlement requests from protocol frontends (e.g., Suiflix) after users complete zkLogin authentication and DID verification. It executes the settlement transaction on-chain and records the result in PostgreSQL.

## Architecture Diagrams

### System Overview

```mermaid
flowchart LR
    subgraph Frontend["Protocol Frontend"]
        A[zkLogin Auth] --> B[DID Verification]
        B --> C[Settlement Request]
    end

    subgraph Backend["This Backend"]
        C --> D[Validate Request]
        D --> E[Check Database]
        E --> F[Build Transaction]
        F --> G[Sign & Execute]
        G --> H[Store Result]
    end

    subgraph Blockchain["Sui Network"]
        G --> I[PaymentRegistry]
        G --> J[ProtocolVault]
    end

    subgraph Database["PostgreSQL"]
        H --> K[nft_settlements]
    end
```

### Settlement Request Flow

```mermaid
sequenceDiagram
    participant F as Frontend
    participant B as Backend
    participant DB as PostgreSQL
    participant S as Sui Network

    F->>B: POST /api/settlement/settle
    Note over F,B: {enclaveTxDigest, didVerifiedId,<br/>userAddress, protocolName, protocolUid}

    B->>B: Validate all fields
    B->>B: Check protocol matches config

    B->>DB: Query: Is NFT already settled?
    alt Already in Database
        DB->>B: Return existing record
        B->>F: 409 Conflict + existing data
    else Not in Database
        B->>S: settle_nft_payment_with_vault()
        alt TX Success
            S->>B: Return TX digest
            B->>DB: INSERT settlement record
            B->>F: 200 OK + settlement data
        else TX Failed (Code 3)
            S->>B: EAlreadySettled error
            B->>F: 500 + error details
        else TX Failed (Code 2)
            S->>B: EInsufficientFunds error
            B->>F: 500 + vault empty error
        end
    end
```

### Smart Contract Interaction

```mermaid
flowchart TD
    subgraph Backend["Settlement Backend"]
        A[Build Transaction] --> B[Add MoveCall]
    end

    subgraph Contract["payment.move"]
        B --> C[settle_nft_payment_with_vault]
        C --> D{Validate PaymentCap}
        D -->|Valid| E{Check NFT settled?}
        E -->|No| F[Transfer from Vault]
        F --> G[Mark NFT settled]
        G --> H[Emit NftSettled event]
        E -->|Yes| I[Abort: EAlreadySettled]
        D -->|Invalid| J[Abort: EUnauthorized]
    end

    subgraph Objects["Sui Objects"]
        C -.-> K[PaymentRegistry]
        C -.-> L[ProtocolVault]
        C -.-> M[PaymentCap]
        C -.-> N[Clock]
    end
```

### Database Schema

```mermaid
erDiagram
    nft_settlements {
        int id PK "Auto-increment"
        varchar enclave_tx_digest "Verification TX"
        varchar did_verified_id UK "NFT Object ID"
        varchar did_nft_name "Display name"
        int protocol_uid "Protocol ID"
        varchar protocol_name "Protocol name"
        varchar protocol_address "Protocol wallet"
        varchar user_address "User zkLogin addr"
        varchar payment_tx_digest UK "Settlement TX"
        bigint settlement_amount "Amount in MIST"
        bigint timestamp "Unix timestamp"
        timestamp created_at "DB timestamp"
        varchar status "success/failed"
    }
```

### Error Handling Flow

```mermaid
flowchart TD
    A[Incoming Request] --> B{Required Fields?}
    B -->|Missing| C[400: Field required]
    B -->|Present| D{Valid Formats?}

    D -->|Invalid| E[400: Invalid format]
    D -->|Valid| F{Protocol Match?}

    F -->|No| G[403: Invalid protocol]
    F -->|Yes| H{Already in DB?}

    H -->|Yes| I[409: Already settled]
    H -->|No| J[Execute On-chain TX]

    J --> K{TX Result}
    K -->|Success| L[Store & Return 200]
    K -->|Code 3| M[500: EAlreadySettled]
    K -->|Code 2| N[500: EInsufficientFunds]
    K -->|Other| O[500: TX Failed]
```

## Key Features

- **Dynamic Protocol Info**: Accepts `protocolName` and `protocolUid` from frontend
- **Duplicate Prevention**: Checks database before executing on-chain TX
- **On-chain Settlement**: Executes `settle_nft_payment_with_vault` on Sui
- **CORS Configured**: Pre-configured for protocol-end frontend
- **Full Audit Trail**: Records all settlement data in PostgreSQL

## Frontend Integration

### Protocol-End Connection

The frontend (`suiverify-protocol-end`) sends settlement requests:

```typescript
// From protocol-end/lib/api.ts
interface SettlementRequest {
  enclaveTxDigest: string;   // TX digest from enclave verification
  didVerifiedId: string;      // DID NFT object ID (0x + 64 hex)
  didNftName?: string;        // Optional display name
  userAddress: string;        // User's zkLogin address
  protocolName: string;       // Must match: "test"
  protocolUid: number;        // Must match: 1000
}
```

### Protocol Configuration

Both frontend and backend must use matching config:

| Setting | Frontend (lib/api.ts) | Backend (protocol-config.json) |
|---------|----------------------|--------------------------------|
| Protocol Name | `"test"` | `"test"` |
| Protocol UID | `1000` | `1000` |

### CORS Configuration

Pre-configured in `src/app.ts`:

```typescript
app.use(cors({
  origin: [
    'http://localhost:3000',   // Protocol-end dev
    'http://127.0.0.1:3000',
  ],
  methods: ['GET', 'POST', 'OPTIONS'],
  allowedHeaders: ['Content-Type', 'Authorization'],
  credentials: true,
}));
```

## Smart Contract Functions

### settle_nft_payment_with_vault (Active)

```move
entry settle_nft_payment_with_vault(
    registry: &mut PaymentRegistry,
    cap: &PaymentCap,
    vault: &mut ProtocolVault,
    protocol_uid: u64,
    nft_id: ID,
    nft_name: String,
    clock: &Clock
)
```

**Effect:** Marks NFT settled + transfers 0.003 SUI from vault to treasury.

### settle_nft_payment (Alternative)

```move
entry settle_nft_payment(
    registry: &mut PaymentRegistry,
    cap: &PaymentCap,
    protocol_uid: u64,
    nft_id: ID,
    nft_name: String,
    clock: &Clock
)
```

**Effect:** Marks NFT settled without fund transfer.

## Project Structure

```
nodejs_backend_micro/
├── data/
│   └── protocol-config.json    # Contract addresses
├── src/
│   ├── config/
│   │   └── sui.config.ts       # Sui client setup
│   ├── controllers/
│   │   └── settlement.controller.ts
│   ├── routes/
│   │   └── settlement.routes.ts
│   ├── services/
│   │   └── database.service.ts
│   ├── app.ts
│   └── server.ts
├── .env
└── package.json
```

## Setup

### 1. Install Dependencies

```bash
npm install
```

### 2. Configure Environment

Create `.env`:

```env
# Sui Network
SUI_NETWORK=testnet
SUI_RPC_URL=https://fullnode.testnet.sui.io:443

# Admin Private Key
ADMIN_PRIVATE_KEY=suiprivkey1q...

# PostgreSQL (Supabase)
DATABASE_URL=postgresql://postgres:password@db.xxx.supabase.co:5432/postgres

# Server
PORT=3001
NODE_ENV=development
```

### 3. Database Setup

```sql
CREATE TABLE nft_settlements (
  id SERIAL PRIMARY KEY,
  enclave_tx_digest VARCHAR(64) NOT NULL,
  did_verified_id VARCHAR(66) NOT NULL UNIQUE,
  did_nft_name VARCHAR(255),
  protocol_uid INTEGER NOT NULL,
  protocol_name VARCHAR(100),
  protocol_address VARCHAR(66),
  user_address VARCHAR(66) NOT NULL,
  payment_tx_digest VARCHAR(64) NOT NULL UNIQUE,
  settlement_amount BIGINT,
  timestamp BIGINT,
  created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
  status VARCHAR(20) DEFAULT 'success'
);

CREATE INDEX idx_settlements_user ON nft_settlements(user_address);
CREATE INDEX idx_settlements_nft ON nft_settlements(did_verified_id);
```

### 4. Run Server

```bash
# Development
npm run dev

# Production
npm run build && npm start
```

Server runs at `http://localhost:3001`

## API Endpoints

### POST `/api/settlement/settle`

Settle NFT payment after verification.

**Request:**
```json
{
  "enclaveTxDigest": "BHKjhBHFyvZZPjpSxLCR5MqHCjKxHPJvqxKQHKjV9H9V",
  "didVerifiedId": "0x35849ea49b6e4abfd3628d33cca0c6a3a5ba05c05e0aa1f6d52cf3105cfd2f10",
  "didNftName": "Age Verification NFT",
  "userAddress": "0xaa266beb057eeba4f686ef40ab0a8b96da69922fa4f548f2828c441b74398046",
  "protocolName": "test",
  "protocolUid": 1000
}
```

| Field | Type | Required | Validation |
|-------|------|----------|------------|
| `enclaveTxDigest` | string | Yes | Base58, 43-44 chars |
| `didVerifiedId` | string | Yes | 0x + 64 hex |
| `didNftName` | string | No | - |
| `userAddress` | string | Yes | 0x + 64 hex |
| `protocolName` | string | Yes | Must match config |
| `protocolUid` | number | Yes | Must match config |

**Success (200):**
```json
{
  "success": true,
  "message": "NFT payment settled successfully",
  "data": {
    "enclaveTxDigest": "BHKjhBHFyvZZPjp...",
    "didVerifiedId": "0x35849ea...",
    "protocolUid": 1000,
    "protocolName": "test",
    "userAddress": "0xaa266beb...",
    "paymentTxDigest": "7rDBN3iAZc4C7C8v...",
    "settlementAmount": 3000000,
    "explorerUrl": "https://suiscan.xyz/testnet/tx/7rDBN3iA..."
  }
}
```

**Error Responses:**

| Status | Error | Cause |
|--------|-------|-------|
| 400 | Missing required field | Field not provided |
| 400 | Invalid format | ID/address malformed |
| 403 | Invalid protocol | Name/UID mismatch |
| 409 | Already settled | NFT in database |
| 500 | TX failed | On-chain error |

### GET `/api/settlement/status/:nftId`

Check if NFT is settled.

**Response (Settled):**
```json
{
  "success": true,
  "settled": true,
  "data": { /* record */ }
}
```

**Response (Not Settled):**
```json
{
  "success": true,
  "settled": false
}
```

### GET `/api/settlement/all`

Get all settlements with pagination.

**Query Params:** `limit`, `page`, `offset`

```bash
GET /api/settlement/all
GET /api/settlement/all?limit=10&page=1
```

**Response:**
```json
{
  "success": true,
  "total": 100,
  "count": 10,
  "pagination": {
    "limit": 10,
    "page": 1,
    "totalPages": 10
  },
  "data": [...]
}
```

### GET `/api/settlement/:id`

Get single settlement by database ID.

### GET `/api/settlement/user/:userAddress`

Get all settlements for a user.

### GET `/api/settlement/health`

Health check.

```json
{
  "success": true,
  "status": "healthy",
  "adminAddress": "0xaa266beb...",
  "packageId": "0xac8705fa...",
  "protocolUid": 1000,
  "protocolName": "test"
}
```

## Contract Configuration

| Object | ID |
|--------|-----|
| Package ID | `0xac8705fa3257db9641ba4ff340060984f42124cc2dfab9903d7505323c0080a3` |
| Payment Registry | `0xf9f37bcd05810d2929e2446d498c63a218b3d18c73227e7964ffae936000830d` |
| Payment Cap | `0x4a7cee5cddeef2bc33679880e1ef779f4c8077e1b20e1e3beee9e8644ecf9f8a` |
| Protocol Vault | `0x000b0127fe611a68526c71d7335c9151cf18abe27711a4a7993ff8cea13556d5` |

## Protocol Configuration

| Setting | Value |
|---------|-------|
| Protocol Name | `test` |
| Protocol UID | `1000` |
| Settlement Fee | 0.003 SUI (3,000,000 MIST) |

## Error Codes (On-chain)

| Code | Constant | Description |
|------|----------|-------------|
| 1 | `EUnauthorized` | Caller not authorized |
| 2 | `EInsufficientFunds` | Vault empty |
| 3 | `EAlreadySettled` | NFT already settled |
| 4 | `EInvalidProtocol` | Protocol not registered |

## Testing

### cURL Examples

```bash
# Health check
curl http://localhost:3001/api/settlement/health

# Settle NFT
curl -X POST http://localhost:3001/api/settlement/settle \
  -H "Content-Type: application/json" \
  -d '{
    "enclaveTxDigest": "BHKjhBHFyvZZPjpSxLCR5MqHCjKxHPJvqxKQHKjV9H9V",
    "didVerifiedId": "0x35849ea49b6e4abfd3628d33cca0c6a3a5ba05c05e0aa1f6d52cf3105cfd2f10",
    "didNftName": "Test DID",
    "userAddress": "0xaa266beb057eeba4f686ef40ab0a8b96da69922fa4f548f2828c441b74398046",
    "protocolName": "test",
    "protocolUid": 1000
  }'

# Check status
curl http://localhost:3001/api/settlement/status/0x35849ea...

# Get all
curl http://localhost:3001/api/settlement/all
```

### Integration Test

1. Start backend: `npm run dev` (port 3001)
2. Start frontend: `cd ../suiverify-protocol-end && npm run dev` (port 3000)
3. Login: `http://localhost:3000/login` (admin/suiflix18)
4. Connect with Google (zkLogin)
5. Click "Verify Age with SuiVerifyDID"
6. Confirm in dialog
7. Observe 4-step flow + explorer link

## Database Queries

```bash
psql $DATABASE_URL
```

```sql
-- All settlements
SELECT * FROM nft_settlements ORDER BY created_at DESC;

-- By NFT
SELECT * FROM nft_settlements WHERE did_verified_id = '0x...';

-- Count by protocol
SELECT protocol_name, COUNT(*) FROM nft_settlements GROUP BY protocol_name;

-- Total SUI settled
SELECT SUM(settlement_amount) / 1e9 as total_sui FROM nft_settlements;
```

## Related Repositories

| Repository | Description | Port |
|------------|-------------|------|
| `suiverify-protocol-end` | Protocol frontend | 3000 |
| `suiverify-main` | Main SuiVerify app | 3002 |
| `suiverify-contracts` | Move contracts | - |
| `suiverify-admin` | Admin dashboard | 3003 |

## Verified Transactions

| Function | TX Digest | Explorer |
|----------|-----------|----------|
| settle_nft_payment_with_vault | `7rDBN3iAZc4C7C8vNZcxtbazN79PExua2pTtxu75Mxj8` | [View](https://suiscan.xyz/testnet/tx/7rDBN3iAZc4C7C8vNZcxtbazN79PExua2pTtxu75Mxj8) |
| settle_nft_payment | `AWGzdUXy9Cp3Z8XcMeqh2oAGwPmFoXXjSnBek2ydd3UN` | [View](https://suiscan.xyz/testnet/tx/AWGzdUXy9Cp3Z8XcMeqh2oAGwPmFoXXjSnBek2ydd3UN) |

## License

ISC
