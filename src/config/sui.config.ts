import { SuiClient, getFullnodeUrl } from '@mysten/sui/client';
import { Ed25519Keypair } from '@mysten/sui/keypairs/ed25519';
import { decodeSuiPrivateKey } from '@mysten/sui/cryptography';
import protocolConfig from '../../data/protocol-config.json';

// Environment variables
const SUI_NETWORK = process.env.SUI_NETWORK || 'testnet';
const ADMIN_PRIVATE_KEY = process.env.ADMIN_PRIVATE_KEY;

if (!ADMIN_PRIVATE_KEY) {
  throw new Error('ADMIN_PRIVATE_KEY environment variable is required');
}

// Initialize Sui client
const rpcUrl = process.env.SUI_RPC_URL || getFullnodeUrl(SUI_NETWORK as 'testnet' | 'mainnet' | 'devnet');
export const suiClient = new SuiClient({ url: rpcUrl });

// Parse admin keypair from private key
function getAdminKeypair(): Ed25519Keypair {
  const privateKey = ADMIN_PRIVATE_KEY!;

  // Handle suiprivkey format
  if (privateKey.startsWith('suiprivkey')) {
    const { secretKey } = decodeSuiPrivateKey(privateKey);
    return Ed25519Keypair.fromSecretKey(secretKey);
  }

  // Handle hex format
  if (privateKey.startsWith('0x')) {
    const keyBytes = Buffer.from(privateKey.slice(2), 'hex');
    return Ed25519Keypair.fromSecretKey(keyBytes);
  }

  // Handle base64 format
  const keyBytes = Buffer.from(privateKey, 'base64');
  return Ed25519Keypair.fromSecretKey(keyBytes);
}

export const adminKeypair = getAdminKeypair();
export const adminAddress = adminKeypair.getPublicKey().toSuiAddress();

// Contract configuration from protocol-config.json
export const CONTRACT_CONFIG = {
  packageId: protocolConfig.contracts.packageId,
  paymentRegistry: {
    objectId: protocolConfig.contracts.paymentRegistry.objectId,
    initialSharedVersion: protocolConfig.contracts.paymentRegistry.initialSharedVersion,
  },
  paymentCap: {
    objectId: protocolConfig.contracts.paymentCap.objectId,
  },
  clock: {
    objectId: protocolConfig.contracts.clock.objectId,
  },
  protocol: {
    uid: protocolConfig.protocol.uid,
    address: protocolConfig.protocol.address,
    vault: {
      objectId: protocolConfig.protocol.vault.objectId,
      initialSharedVersion: protocolConfig.protocol.vault.initialSharedVersion,
    },
  },
  constants: {
    settlementFee: protocolConfig.constants.settlementFee,
    minVaultAmount: protocolConfig.constants.minVaultAmount,
  },
};

// Contract function names
export const CONTRACT_FUNCTIONS = {
  settleNftPaymentWithVault: 'settle_nft_payment_with_vault',
};

console.log('=== Sui Configuration Loaded ===');
console.log(`Network: ${SUI_NETWORK}`);
console.log(`RPC URL: ${rpcUrl}`);
console.log(`Admin Address: ${adminAddress}`);
console.log(`Package ID: ${CONTRACT_CONFIG.packageId}`);
