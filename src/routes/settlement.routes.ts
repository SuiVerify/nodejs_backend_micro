import { Router } from 'express';
import {
  settleNftPayment,
  getSettlementStatus,
  healthCheck,
} from '../controllers/settlement.controller';

const router = Router();

// POST /api/settlement/settle - Settle an NFT payment
router.post('/settle', settleNftPayment);

// GET /api/settlement/status/:nftId - Check settlement status
router.get('/status/:nftId', getSettlementStatus);

// GET /api/settlement/health - Health check
router.get('/health', healthCheck);

export default router;
