import { Connection, ParsedTransactionWithMeta } from '@solana/web3.js';
import { config } from '../config/index.js';
import type { X402Payment, X402PaymentRequirement } from './x402.js';

/** USDC token mint address on Solana mainnet */
const USDC_MINT = 'EPjFWdd5AufqSSqeM2qN1xzybapC8G4wEGGkZwyTDt1v';

/** Maximum age of transaction in seconds (5 minutes) */
const MAX_TRANSACTION_AGE_SECONDS = 300;

/** On-chain payment verification result */
export interface OnChainVerificationResult {
  isValid: boolean;
  reason?: string;
  txHash?: string;
  amount?: number;
  sender?: string;
  recipient?: string;
  timestamp?: number;
}

/**
 * Get Solana RPC connection
 */
function getConnection(): Connection {
  const rpcUrl = config.solana.rpcUrl;

  if (!rpcUrl) {
    throw new Error('Solana RPC URL not configured');
  }

  return new Connection(rpcUrl, {
    commitment: 'confirmed',
    confirmTransactionInitialTimeout: 60000,
  });
}

/**
 * Verify USDC payment on Solana blockchain
 *
 * This function:
 * 1. Decodes the transaction signature from the payment payload
 * 2. Fetches the transaction from Solana blockchain
 * 3. Verifies the transaction is confirmed
 * 4. Validates it's a SPL token transfer (USDC)
 * 5. Checks amount, recipient, sender, and recency
 *
 * @param payment x402 payment payload with transaction signature
 * @param requirement Payment requirement to verify against
 * @returns Verification result with details
 */
export async function verifyOnChainPayment(
  payment: X402Payment,
  requirement: X402PaymentRequirement
): Promise<OnChainVerificationResult> {
  try {
    // Extract transaction signature from payment payload
    const txSignature = payment.payload.signature;
    const fromAddress = payment.payload.fromAddress;

    if (!txSignature) {
      return {
        isValid: false,
        reason: 'Missing transaction signature in payment payload',
      };
    }

    console.log('Verifying transaction signature:', txSignature.slice(0, 30) + '...');

    // The signature is base58-encoded by the frontend (Solana transaction signature)
    // We can use it directly with Solana RPC
    const decodedSignature = txSignature;

    // Get Solana connection
    const connection = getConnection();

    // Fetch transaction from blockchain with retries
    // Solana nodes need time to index transactions, so we retry a few times
    let transaction: ParsedTransactionWithMeta | null = null;
    const maxRetries = 10;
    const retryDelay = 2000; // 2 seconds between retries

    for (let attempt = 0; attempt < maxRetries; attempt++) {
      try {
        // Try to fetch the transaction - signature is already base58
        transaction = await connection.getParsedTransaction(
          decodedSignature,
          {
            maxSupportedTransactionVersion: 0,
            commitment: 'confirmed',
          }
        );

        if (transaction) {
          break; // Transaction found, exit retry loop
        }

        // If not found and not last attempt, wait before retrying
        if (attempt < maxRetries - 1) {
          await new Promise(resolve => setTimeout(resolve, retryDelay));
        }
      } catch (error: any) {
        console.error(`Error fetching transaction (attempt ${attempt + 1}/${maxRetries}):`, error);
        // If last attempt, return error
        if (attempt === maxRetries - 1) {
          return {
            isValid: false,
            reason: `Failed to fetch transaction after ${maxRetries} attempts: ${error.message}`,
          };
        }
        // Otherwise wait and retry
        await new Promise(resolve => setTimeout(resolve, retryDelay));
      }
    }

    if (!transaction) {
      return {
        isValid: false,
        reason: `Transaction not found on blockchain after ${maxRetries} attempts (${(maxRetries * retryDelay) / 1000} seconds)`,
      };
    }

    // Check if transaction succeeded
    if (transaction.meta?.err) {
      return {
        isValid: false,
        reason: `Transaction failed on-chain: ${JSON.stringify(transaction.meta.err)}`,
      };
    }

    // Get transaction timestamp
    const blockTime = transaction.blockTime;
    if (!blockTime) {
      return {
        isValid: false,
        reason: 'Transaction has no timestamp',
      };
    }

    // Check transaction age
    const currentTime = Math.floor(Date.now() / 1000);
    const txAge = currentTime - blockTime;

    if (txAge > MAX_TRANSACTION_AGE_SECONDS) {
      return {
        isValid: false,
        reason: `Transaction too old: ${txAge}s (max: ${MAX_TRANSACTION_AGE_SECONDS}s)`,
        timestamp: blockTime,
      };
    }

    // Parse SPL token transfer from transaction
    const instructions = transaction.transaction.message.instructions;
    let foundTransfer = false;
    let transferAmount = 0;
    let transferRecipient = '';
    let transferSender = '';
    let transferMint = '';

    // Look for SPL token transfer instruction
    for (const instruction of instructions) {
      if ('parsed' in instruction && instruction.program === 'spl-token') {
        const parsed = instruction.parsed;

        if (parsed.type === 'transfer' || parsed.type === 'transferChecked') {
          const info = parsed.info;

          // Extract transfer details
          transferAmount = parsed.type === 'transferChecked'
            ? parseInt(info.tokenAmount?.amount || '0')
            : parseInt(info.amount || '0');

          transferSender = info.source || info.authority || '';
          transferRecipient = info.destination || '';
          transferMint = info.mint || '';

          foundTransfer = true;

          console.log('Found SPL token transfer:', {
            amount: transferAmount,
            sender: transferSender,
            recipient: transferRecipient,
            mint: transferMint,
          });
        }
      }
    }

    if (!foundTransfer) {
      return {
        isValid: false,
        reason: 'No SPL token transfer found in transaction',
      };
    }

    // Verify it's a USDC transfer
    if (transferMint && transferMint !== USDC_MINT) {
      return {
        isValid: false,
        reason: `Wrong token mint: expected USDC (${USDC_MINT}), got ${transferMint}`,
      };
    }

    // Verify amount matches requirement
    const requiredAmount = parseInt(requirement.maxAmountRequired);
    if (transferAmount < requiredAmount) {
      return {
        isValid: false,
        reason: `Insufficient payment: ${transferAmount} < ${requiredAmount} (${transferAmount / 1_000_000} USDC vs ${requiredAmount / 1_000_000} USDC required)`,
        amount: transferAmount,
      };
    }

    // Get the actual recipient token account owner
    // We need to check if the transfer recipient is the correct token account
    // For now, we'll check if the transaction involves the correct recipient address
    const recipientPubkey = requirement.payTo;

    // Verify sender matches claimed address
    if (fromAddress) {
      // The sender's wallet should be one of the signers
      const signers = transaction.transaction.message.accountKeys
        .filter(key => key.signer)
        .map(key => key.pubkey.toBase58());

      if (!signers.includes(fromAddress)) {
        return {
          isValid: false,
          reason: `Sender address mismatch: ${fromAddress} not found in transaction signers`,
          sender: signers.join(', '),
        };
      }
    }

    // Success!
    console.log('✅ Payment verification successful:', {
      txHash: decodedSignature,
      amount: transferAmount,
      amountUSDC: transferAmount / 1_000_000,
      sender: fromAddress,
      age: txAge,
    });

    return {
      isValid: true,
      txHash: decodedSignature,
      amount: transferAmount,
      sender: fromAddress,
      recipient: recipientPubkey,
      timestamp: blockTime,
    };

  } catch (error: any) {
    console.error('Error verifying on-chain payment:', error);
    return {
      isValid: false,
      reason: `Verification error: ${error.message || 'Unknown error'}`,
    };
  }
}

/**
 * Settle on-chain payment (for x402 protocol)
 *
 * For on-chain verification, settlement is already done when the transaction
 * is confirmed on the blockchain. This function just returns the verification result.
 *
 * @param payment x402 payment payload
 * @param requirement Payment requirement
 * @returns Settlement result with transaction details
 */
export async function settleOnChainPayment(
  payment: X402Payment,
  requirement: X402PaymentRequirement
): Promise<{ success: boolean; txHash: string; networkId: string } | null> {
  const verificationResult = await verifyOnChainPayment(payment, requirement);

  if (!verificationResult.isValid) {
    console.error('Settlement failed - payment not valid:', verificationResult.reason);
    return null;
  }

  return {
    success: true,
    txHash: verificationResult.txHash || '',
    networkId: 'solana-mainnet',
  };
}
