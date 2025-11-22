import { Request, Response } from 'express';
import { Transaction } from '@mysten/sui/transactions';
import {
  suiClient,
  adminKeypair,
  adminAddress,
  CONTRACT_CONFIG,
  CONTRACT_FUNCTIONS,
} from '../config/sui.config';
import {
  storeSettlement,
  isNftSettled,
  getSettlementByNftId,
  SettlementRecord,
} from '../services/database.service';

// Settlement request interface
interface SettlementRequest {
  nftId: string;
  nftName?: string;
}

// Validate NFT ID format (0x + 64 hex characters)
function isValidNftId(nftId: string): boolean {
  return /^0x[a-fA-F0-9]{64}$/.test(nftId);
}

// Settle NFT payment on-chain
export async function settleNftPayment(req: Request, res: Response): Promise<void> {
  try {
    const { nftId, nftName } = req.body as SettlementRequest;

    // Validate required fields
    if (!nftId) {
      res.status(400).json({
        success: false,
        error: 'nftId is required',
      });
      return;
    }

    // Validate NFT ID format
    if (!isValidNftId(nftId)) {
      res.status(400).json({
        success: false,
        error: 'Invalid nftId format. Expected 0x + 64 hex characters',
      });
      return;
    }

    // Check if NFT is already settled
    const alreadySettled = await isNftSettled(nftId);
    if (alreadySettled) {
      const existingSettlement = await getSettlementByNftId(nftId);
      res.status(409).json({
        success: false,
        error: 'NFT has already been settled',
        data: existingSettlement,
      });
      return;
    }

    console.log(`Processing settlement for NFT: ${nftId}`);

    // Build the transaction
    const tx = new Transaction();

    // Call settle_nft_payment_with_vault
    // Function signature: settle_nft_payment_with_vault(
    //   registry: &mut PaymentRegistry,
    //   cap: &PaymentCap,
    //   vault: &mut ProtocolVault,
    //   nft_id: ID,
    //   clock: &Clock,
    // )
    tx.moveCall({
      target: `${CONTRACT_CONFIG.packageId}::payment::${CONTRACT_FUNCTIONS.settleNftPaymentWithVault}`,
      arguments: [
        tx.sharedObjectRef({
          objectId: CONTRACT_CONFIG.paymentRegistry.objectId,
          initialSharedVersion: CONTRACT_CONFIG.paymentRegistry.initialSharedVersion,
          mutable: true,
        }),
        tx.object(CONTRACT_CONFIG.paymentCap.objectId),
        tx.sharedObjectRef({
          objectId: CONTRACT_CONFIG.protocol.vault.objectId,
          initialSharedVersion: CONTRACT_CONFIG.protocol.vault.initialSharedVersion,
          mutable: true,
        }),
        tx.pure.id(nftId),
        tx.object(CONTRACT_CONFIG.clock.objectId),
      ],
    });

    // Execute the transaction
    console.log('Executing settlement transaction...');
    const result = await suiClient.signAndExecuteTransaction({
      transaction: tx,
      signer: adminKeypair,
      options: {
        showEffects: true,
        showEvents: true,
      },
    });

    console.log(`Transaction executed: ${result.digest}`);

    // Check transaction status
    const status = result.effects?.status?.status;
    if (status !== 'success') {
      const errorMessage = result.effects?.status?.error || 'Unknown error';
      console.error('Transaction failed:', errorMessage);
      res.status(500).json({
        success: false,
        error: `Transaction failed: ${errorMessage}`,
        digest: result.digest,
      });
      return;
    }

    // Store settlement in database
    const settlementRecord: SettlementRecord = {
      tx_digest: result.digest,
      protocol_uid: CONTRACT_CONFIG.protocol.uid,
      nft_id: nftId,
      nft_name: nftName,
      protocol_address: CONTRACT_CONFIG.protocol.address,
      settlement_amount: CONTRACT_CONFIG.constants.settlementFee,
      timestamp: Date.now(),
      status: 'success',
    };

    await storeSettlement(settlementRecord);
    console.log('Settlement stored in database');

    // Return success response
    res.status(200).json({
      success: true,
      message: 'NFT payment settled successfully',
      data: {
        digest: result.digest,
        nftId,
        protocolUid: CONTRACT_CONFIG.protocol.uid,
        settlementAmount: CONTRACT_CONFIG.constants.settlementFee,
        explorerUrl: `https://suiscan.xyz/testnet/tx/${result.digest}`,
      },
    });
  } catch (error) {
    console.error('Settlement error:', error);
    res.status(500).json({
      success: false,
      error: error instanceof Error ? error.message : 'Internal server error',
    });
  }
}

// Check settlement status for an NFT
export async function getSettlementStatus(req: Request, res: Response): Promise<void> {
  try {
    const { nftId } = req.params;

    if (!nftId) {
      res.status(400).json({
        success: false,
        error: 'nftId is required',
      });
      return;
    }

    const settlement = await getSettlementByNftId(nftId);

    if (settlement) {
      res.status(200).json({
        success: true,
        settled: true,
        data: settlement,
      });
    } else {
      res.status(200).json({
        success: true,
        settled: false,
        message: 'NFT has not been settled',
      });
    }
  } catch (error) {
    console.error('Error checking settlement status:', error);
    res.status(500).json({
      success: false,
      error: error instanceof Error ? error.message : 'Internal server error',
    });
  }
}

// Health check
export async function healthCheck(req: Request, res: Response): Promise<void> {
  res.status(200).json({
    success: true,
    status: 'healthy',
    adminAddress,
    packageId: CONTRACT_CONFIG.packageId,
    protocolUid: CONTRACT_CONFIG.protocol.uid,
    timestamp: new Date().toISOString(),
  });
}
