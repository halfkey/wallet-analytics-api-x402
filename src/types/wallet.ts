/** Wallet analytics types */

/** Token account information */
export interface TokenAccount {
  mint: string;
  address: string;
  owner: string;
  amount: string;
  decimals: number;
  uiAmount: number;
  symbol?: string;
  name?: string;
  logoURI?: string;
  priceUSD?: number;
  valueUSD?: number;
}

/** NFT metadata */
export interface NFT {
  mint: string;
  name?: string;
  symbol?: string;
  uri?: string;
  collection?: string;
  verified?: boolean;
  imageUrl?: string;
  floorPriceSOL?: number;
}

/** Wallet overview data */
export interface WalletOverview {
  address: string;
  solBalance: number;
  solBalanceUSD: number;
  totalValueUSD: number;
  tokenCount: number;
  nftCount: number;
  isActive: boolean;
  tokens: TokenAccount[];
  topTokens: TokenAccount[]; // Top 5 by value
}

/** Wallet portfolio data */
export interface WalletPortfolio {
  address: string;
  totalValueUSD: number;
  solBalance: number;
  solBalanceUSD: number;
  tokens: TokenAccount[];
  nfts: NFT[];
  breakdown: {
    sol: number;
    tokens: number;
    nfts: number;
  };
}

/** Transaction activity data */
export interface WalletActivity {
  address: string;
  transactionCount: number;
  firstTransaction?: string;
  lastTransaction?: string;
  recentTransactions: Transaction[];
}

/** Transaction info */
export interface Transaction {
  signature: string;
  timestamp: number;
  type: string;
  status: 'success' | 'failed';
  fee: number;
  description?: string;
}

/** Risk assessment data */
export interface WalletRisk {
  address: string;
  riskScore: number; // 0-100
  riskLevel: 'low' | 'medium' | 'high';
  factors: RiskFactor[];
  warnings: string[];
}

/** Risk factor */
export interface RiskFactor {
  type: string;
  severity: 'low' | 'medium' | 'high';
  description: string;
  impact: number; // 0-100
}
