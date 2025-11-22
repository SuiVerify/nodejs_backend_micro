import { Router } from 'express';
import {
  settleNftPayment,
  getSettlementStatus,
  getUserSettlements,
  healthCheck,
  getSingleSettlement,
  getBulkSettlements,
} from '../controllers/settlement.controller';

const router = Router();

// POST /api/settlement/settle - Settle an NFT payment
router.post('/settle', settleNftPayment);

// GET /api/settlement/all - Get all settlements (with optional pagination)
// Query params: limit, page, offset
// Examples:
//   /api/settlement/all - Get all settlements
//   /api/settlement/all?limit=10 - Get first 10
//   /api/settlement/all?limit=10&page=2 - Get page 2 (items 11-20)
//   /api/settlement/all?limit=10&offset=5 - Get 10 items starting from 6th
router.get('/all', getBulkSettlements);

// GET /api/settlement/status/:nftId - Check settlement status by DID NFT ID
router.get('/status/:nftId', getSettlementStatus);

// GET /api/settlement/user/:userAddress - Get all settlements for a user
router.get('/user/:userAddress', getUserSettlements);

// GET /api/settlement/health - Health check
router.get('/health', healthCheck);

// GET /api/settlement/:id - Get single settlement by database ID
// Must be at the end to avoid conflicts with other routes
router.get('/:id', getSingleSettlement);

export default router;
