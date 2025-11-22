import { Router } from 'express';
import {
  settleNftPayment,
  getSettlementStatus,
  getUserSettlements,
  healthCheck,
} from '../controllers/settlement.controller';

const router = Router();

// POST /api/settlement/settle - Settle an NFT payment
router.post('/settle', settleNftPayment);

// GET /api/settlement/status/:nftId - Check settlement status by DID NFT ID
router.get('/status/:nftId', getSettlementStatus);

// GET /api/settlement/user/:userAddress - Get all settlements for a user
router.get('/user/:userAddress', getUserSettlements);

// GET /api/settlement/health - Health check
router.get('/health', healthCheck);

export default router;
