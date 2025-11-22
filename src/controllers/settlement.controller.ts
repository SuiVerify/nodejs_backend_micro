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
  getSettlementsByUser,
  SettlementRecord,
} from '../services/database.service';
import protocolConfig from '../../data/protocol-config.json';

// Settlement request interface - all data from frontend
interface SettlementRequest {
  // Enclave verification tx digest (from ZK verification)
  enclaveTxDigest: string;
  // DID NFT that was verified
  didVerifiedId: string;
  didNftName?: string;
  // User who completed verification
  userAddress: string;
}

// Validate Sui object ID format (0x + 64 hex characters)
function isValidSuiId(id: string): boolean {
  return /^0x[a-fA-F0-9]{64}$/.test(id);
}

// Validate Sui tx digest format (base58, typically 43-44 chars)
function isValidTxDigest(digest: string): boolean {
  return /^[1-9A-HJ-NP-Za-km-z]{43,44}$/.test(digest);
}

// Settle NFT payment on-chain
export async function settleNftPayment(req: Request, res: Response): Promise<void> {
  try {
    const { enclaveTxDigest, didVerifiedId, didNftName, userAddress } = req.body as SettlementRequest;

    // Validate required fields
    if (!enclaveTxDigest) {
      res.status(400).json({
        success: false,
        error: 'enclaveTxDigest is required',
      });
      return;
    }

    if (!didVerifiedId) {
      res.status(400).json({
        success: false,
        error: 'didVerifiedId is required',
      });
      return;
    }

    if (!userAddress) {
      res.status(400).json({
        success: false,
        error: 'userAddress is required',
      });
      return;
    }

    // Validate DID NFT ID format
    if (!isValidSuiId(didVerifiedId)) {
      res.status(400).json({
        success: false,
        error: 'Invalid didVerifiedId format. Expected 0x + 64 hex characters',
      });
      return;
    }

    // Validate user address format
    if (!isValidSuiId(userAddress)) {
      res.status(400).json({
        success: false,
        error: 'Invalid userAddress format. Expected 0x + 64 hex characters',
      });
      return;
    }

    // Validate enclave tx digest format
    if (!isValidTxDigest(enclaveTxDigest)) {
      res.status(400).json({
        success: false,
        error: 'Invalid enclaveTxDigest format. Expected base58 transaction digest',
      });
      return;
    }

    // Check if DID NFT is already settled
    const alreadySettled = await isNftSettled(didVerifiedId);
    if (alreadySettled) {
      const existingSettlement = await getSettlementByNftId(didVerifiedId);
      res.status(409).json({
        success: false,
        error: 'DID NFT has already been settled',
        data: existingSettlement,
      });
      return;
    }

    console.log(`\n=== Processing Settlement ===`);
    console.log(`Enclave TX: ${enclaveTxDigest}`);
    console.log(`DID NFT: ${didVerifiedId}`);
    console.log(`User: ${userAddress}`);

    // Build the transaction
    const tx = new Transaction();

    // ============================================================
    // OPTION 1: settle_nft_payment (NO fund transfer, just marks settled)
    // Uncomment below if you want to use this instead
    // ============================================================
    // tx.moveCall({
    //   target: `${CONTRACT_CONFIG.packageId}::payment::settle_nft_payment`,
    //   arguments: [
    //     // Arg0: &mut PaymentRegistry (shared object)
    //     tx.sharedObjectRef({
    //       objectId: CONTRACT_CONFIG.paymentRegistry.objectId,
    //       initialSharedVersion: CONTRACT_CONFIG.paymentRegistry.initialSharedVersion,
    //       mutable: true,
    //     }),
    //     // Arg1: &PaymentCap (owned object)
    //     tx.object(CONTRACT_CONFIG.paymentCap.objectId),
    //     // Arg2: u64 (protocol_uid)
    //     tx.pure.u64(CONTRACT_CONFIG.protocol.uid),
    //     // Arg3: ID (nft_id) - pass as address type
    //     tx.pure.address(didVerifiedId),
    //     // Arg4: String (nft_name)
    //     tx.pure.string(didNftName || 'Unknown NFT'),
    //     // Arg5: &Clock (shared object, immutable)
    //     tx.sharedObjectRef({
    //       objectId: CONTRACT_CONFIG.clock.objectId,
    //       initialSharedVersion: '1',
    //       mutable: false,
    //     }),
    //   ],
    // });

    // ============================================================
    // OPTION 2: settle_nft_payment_with_vault (WITH fund transfer)
    // Transfers settlement fee from protocol vault to SuiVerify treasury
    // ============================================================
    tx.moveCall({
      target: `${CONTRACT_CONFIG.packageId}::payment::settle_nft_payment_with_vault`,
      arguments: [
        // Arg0: &mut PaymentRegistry (shared object)
        tx.sharedObjectRef({
          objectId: CONTRACT_CONFIG.paymentRegistry.objectId,
          initialSharedVersion: CONTRACT_CONFIG.paymentRegistry.initialSharedVersion,
          mutable: true,
        }),
        // Arg1: &PaymentCap (owned object)
        tx.object(CONTRACT_CONFIG.paymentCap.objectId),
        // Arg2: &mut ProtocolVault (shared object)
        tx.sharedObjectRef({
          objectId: CONTRACT_CONFIG.protocol.vault.objectId,
          initialSharedVersion: CONTRACT_CONFIG.protocol.vault.initialSharedVersion,
          mutable: true,
        }),
        // Arg3: u64 (protocol_uid)
        tx.pure.u64(CONTRACT_CONFIG.protocol.uid),
        // Arg4: ID (nft_id) - pass as address type
        tx.pure.address(didVerifiedId),
        // Arg5: String (nft_name)
        tx.pure.string(didNftName || 'Unknown NFT'),
        // Arg6: &Clock (shared object, immutable)
        tx.sharedObjectRef({
          objectId: CONTRACT_CONFIG.clock.objectId,
          initialSharedVersion: '1',
          mutable: false,
        }),
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

    console.log(`Payment TX: ${result.digest}`);

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

    // Store complete settlement record in database
    const settlementRecord: SettlementRecord = {
      // Enclave verification
      enclave_tx_digest: enclaveTxDigest,
      // DID NFT
      did_verified_id: didVerifiedId,
      did_nft_name: didNftName,
      // Protocol info
      protocol_uid: CONTRACT_CONFIG.protocol.uid,
      protocol_name: protocolConfig.protocol.name,
      protocol_address: CONTRACT_CONFIG.protocol.address,
      // User info
      user_address: userAddress,
      // Payment settlement
      payment_tx_digest: result.digest,
      settlement_amount: CONTRACT_CONFIG.constants.settlementFee,
      // Metadata
      timestamp: Date.now(),
      status: 'success',
    };

    await storeSettlement(settlementRecord);
    console.log('Settlement stored in database');
    console.log(`=== Settlement Complete ===\n`);

    // Return success response with all data
    res.status(200).json({
      success: true,
      message: 'NFT payment settled successfully',
      data: {
        enclaveTxDigest,
        didVerifiedId,
        didNftName,
        protocolUid: CONTRACT_CONFIG.protocol.uid,
        protocolName: protocolConfig.protocol.name,
        protocolAddress: CONTRACT_CONFIG.protocol.address,
        userAddress,
        paymentTxDigest: result.digest,
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

// Check settlement status for a DID NFT
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
        message: 'DID NFT has not been settled',
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

// Get settlements by user address
export async function getUserSettlements(req: Request, res: Response): Promise<void> {
  try {
    const { userAddress } = req.params;

    if (!userAddress) {
      res.status(400).json({
        success: false,
        error: 'userAddress is required',
      });
      return;
    }

    const settlements = await getSettlementsByUser(userAddress);

    res.status(200).json({
      success: true,
      count: settlements.length,
      data: settlements,
    });
  } catch (error) {
    console.error('Error getting user settlements:', error);
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
    protocolName: protocolConfig.protocol.name,
    timestamp: new Date().toISOString(),
  });
}
