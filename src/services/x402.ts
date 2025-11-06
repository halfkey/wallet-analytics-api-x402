import { config } from '../config/index.js';

/** USDC token address on Solana mainnet */
const USDC_MINT = 'EPjFWdd5AufqSSqeM2qN1xzybapC8G4wEGGkZwyTDt1v';

/** x402 protocol version */
const X402_VERSION = 1;

/** Payment requirement for x402 protocol */
export interface X402PaymentRequirement {
  scheme: 'exact';
  network: 'solana-mainnet';
  maxAmountRequired: string; // Amount in atomic units (smallest denomination)
  resource: string;
  payTo: string;
  asset: string; // USDC SPL token address
  maxTimeoutSeconds: number;
}

/** x402 payment required response */
export interface X402PaymentRequired {
  x402Version: number;
  accepts: X402PaymentRequirement[];
  error: string;
}

/** x402 payment payload from client */
export interface X402Payment {
  x402Version: number;
  scheme: string;
  network: string;
  payload: {
    signature: string;
    fromAddress: string;
  };
}

/** x402 payment response after settlement */
export interface X402PaymentResponse {
  success: boolean;
  txHash: string;
  networkId: string;
}

/**
 * Convert USDC amount to atomic units (6 decimals for USDC)
 * @param usdcAmount Amount in USDC (e.g., 0.01)
 * @returns Amount in atomic units as string
 */
export function usdcToAtomicUnits(usdcAmount: number): string {
  const atomicUnits = Math.floor(usdcAmount * 1_000_000); // USDC has 6 decimals
  return atomicUnits.toString();
}

/**
 * Create x402 payment requirement
 * @param resource The requested resource path
 * @param usdcAmount Amount in USDC
 * @returns x402 payment requirement object
 */
export function createPaymentRequirement(
  resource: string,
  usdcAmount: number
): X402PaymentRequirement {
  return {
    scheme: 'exact',
    network: 'solana-mainnet',
    maxAmountRequired: usdcToAtomicUnits(usdcAmount),
    resource,
    payTo: config.payment.recipientAddress || '',
    asset: USDC_MINT,
    maxTimeoutSeconds: 300, // 5 minutes
  };
}

/**
 * Create x402 payment required response
 * @param resource The requested resource path
 * @param usdcAmount Amount in USDC
 * @returns x402 payment required response
 */
export function createPaymentRequiredResponse(
  resource: string,
  usdcAmount: number
): X402PaymentRequired {
  return {
    x402Version: X402_VERSION,
    accepts: [createPaymentRequirement(resource, usdcAmount)],
    error: 'Payment Required',
  };
}

/**
 * Verify x402 payment via PayAI facilitator
 * @param payment Payment payload from X-PAYMENT header
 * @param requirement Payment requirement that was sent
 * @returns True if payment is valid
 */
export async function verifyPayment(
  payment: X402Payment,
  requirement: X402PaymentRequirement
): Promise<boolean> {
  try {
    // Call PayAI facilitator verify endpoint
    const response = await fetch(`${config.payment.facilitatorUrl}/verify`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
      },
      body: JSON.stringify({
        x402Version: payment.x402Version,
        paymentHeader: payment,
        paymentRequirements: requirement,
      }),
    });

    if (!response.ok) {
      console.error('Payment verification failed:', response.statusText);
      return false;
    }

    const result = await response.json() as { isValid: boolean; invalidReason?: string };
    return result.isValid === true;
  } catch (error) {
    console.error('Error verifying payment:', error);
    return false;
  }
}

/**
 * Settle x402 payment via PayAI facilitator
 * @param payment Payment payload from X-PAYMENT header
 * @returns Payment response with transaction hash
 */
export async function settlePayment(
  payment: X402Payment
): Promise<X402PaymentResponse | null> {
  try {
    // Call PayAI facilitator settle endpoint
    const response = await fetch(`${config.payment.facilitatorUrl}/settle`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
      },
      body: JSON.stringify({
        x402Version: payment.x402Version,
        paymentHeader: payment,
      }),
    });

    if (!response.ok) {
      console.error('Payment settlement failed:', response.statusText);
      return null;
    }

    const result = await response.json() as {
      success: boolean;
      error?: string;
      txHash?: string;
      networkId?: string
    };

    if (!result.success) {
      console.error('Settlement returned error:', result.error);
      return null;
    }

    return {
      success: true,
      txHash: result.txHash || '',
      networkId: result.networkId || '',
    };
  } catch (error) {
    console.error('Error settling payment:', error);
    return null;
  }
}

/**
 * Parse X-PAYMENT header
 * @param header Base64-encoded payment header
 * @returns Parsed payment object or null
 */
export function parsePaymentHeader(header: string): X402Payment | null {
  try {
    const decoded = Buffer.from(header, 'base64').toString('utf-8');
    const payment = JSON.parse(decoded) as X402Payment;

    // Validate required fields
    if (
      !payment.x402Version ||
      !payment.scheme ||
      !payment.network ||
      !payment.payload
    ) {
      return null;
    }

    return payment;
  } catch (error) {
    console.error('Error parsing payment header:', error);
    return null;
  }
}
