import { Connection, PublicKey, LAMPORTS_PER_SOL } from '@solana/web3.js';
import { TOKEN_PROGRAM_ID, TOKEN_2022_PROGRAM_ID } from '@solana/spl-token';
import { config } from '../config/index.js';
import { cacheService } from './cache.js';
import { logger } from '../utils/logger.js';
import { withRetry } from '../utils/rpcErrorHandler.js';
import type { TokenAccount, WalletOverview, NFT, WalletPortfolio, WalletActivity, Transaction, WalletRisk, RiskFactor } from '../types/wallet.js';

/** Solana RPC service using Helius */
export class SolanaService {
  private connection: Connection;
  private heliusApiKey: string;

  constructor() {
    const rpcUrl = config.solana.network === 'mainnet-beta'
      ? config.solana.heliusRpcUrlMainnet
      : config.solana.heliusRpcUrlDevnet;

    if (!rpcUrl) {
      throw new Error(`RPC URL not configured for network: ${config.solana.network}`);
    }

    this.connection = new Connection(rpcUrl, 'confirmed');

    // Extract API key from URL
    const match = rpcUrl.match(/api-key=([^&]+)/);
    this.heliusApiKey = match?.[1] ?? '';

    logger.info({
      network: config.solana.network,
      endpoint: rpcUrl.replace(this.heliusApiKey, '***'),
    }, 'Solana service initialized');
  }

  /**
   * Get the connection instance (public accessor)
   */
  getConnection(): Connection {
    return this.connection;
  }

  /**
   * Get SOL balance for a wallet
   */
  async getSOLBalance(address: string): Promise<number> {
    return withRetry(
      async () => {
        const pubkey = new PublicKey(address);
        const balance = await this.connection.getBalance(pubkey);
        return balance / LAMPORTS_PER_SOL;
      },
      { maxRetries: 2 },
      `Get SOL balance for ${address}`
    );
  }

  /**
   * Get all token accounts for a wallet using Helius DAS API
   */
  async getTokenAccounts(address: string): Promise<TokenAccount[]> {
    const cacheKey = `tokens:${address}`;
    const cached = await cacheService.get<TokenAccount[]>(cacheKey);

    if (cached) {
      logger.debug({ address }, 'Using cached token accounts');
      return cached;
    }

    try {
      const pubkey = new PublicKey(address);

      // Get SPL Token accounts
      const tokenAccounts = await this.connection.getParsedTokenAccountsByOwner(
        pubkey,
        { programId: TOKEN_PROGRAM_ID }
      );

      // Get Token-2022 accounts
      const token2022Accounts = await this.connection.getParsedTokenAccountsByOwner(
        pubkey,
        { programId: TOKEN_2022_PROGRAM_ID }
      );

      const allAccounts = [...tokenAccounts.value, ...token2022Accounts.value];

      const tokens: TokenAccount[] = allAccounts
        .map((account) => {
          const info = account.account.data.parsed.info;
          const amount = info.tokenAmount;

          return {
            mint: info.mint,
            address: account.pubkey.toString(),
            owner: info.owner,
            amount: amount.amount,
            decimals: amount.decimals,
            uiAmount: amount.uiAmount || 0,
          };
        })
        .filter((token) => token.uiAmount > 0); // Only non-zero balances

      // Enrich with metadata (if available)
      await this.enrichTokenMetadata(tokens);

      // Cache for 5 minutes
      await cacheService.set(cacheKey, tokens, 300);

      logger.debug({ address, count: tokens.length }, 'Fetched token accounts');
      return tokens;
    } catch (error) {
      logger.error({ error, address }, 'Error fetching token accounts');
      throw new Error('Failed to fetch token accounts');
    }
  }

  /**
   * Enrich token accounts with metadata (name, symbol, logo)
   */
  private async enrichTokenMetadata(tokens: TokenAccount[]): Promise<void> {
    if (tokens.length === 0) return;

    try {
      // Use Helius DAS API to get token metadata
      const heliusUrl = `https://mainnet.helius-rpc.com/?api-key=${this.heliusApiKey}`;

      const mints = tokens.map(t => t.mint);

      const response = await fetch(heliusUrl, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          jsonrpc: '2.0',
          id: 'token-metadata',
          method: 'getAssetBatch',
          params: {
            ids: mints,
          },
        }),
      });

      const data = await response.json() as { result?: any[] };

      if (data.result) {
        const metadataMap = new Map(
          data.result.map((asset: any) => [asset.id, asset])
        );

        tokens.forEach((token) => {
          const metadata = metadataMap.get(token.mint);
          if (metadata?.content) {
            token.name = metadata.content?.metadata?.name;
            token.symbol = metadata.content?.metadata?.symbol;
            token.logoURI = metadata.content?.links?.image || metadata.content?.files?.[0]?.uri;
          }
        });
      }
    } catch (error) {
      logger.warn({ error }, 'Failed to enrich token metadata, continuing without it');
      // Don't fail the request if metadata enrichment fails
    }
  }

  /**
   * Get token prices from Jupiter API v3
   */
  async getTokenPrices(mints: string[]): Promise<Map<string, number>> {
    if (mints.length === 0) return new Map();

    const cacheKey = `prices:${mints.sort().join(',')}`;
    const cached = await cacheService.get<Record<string, number>>(cacheKey);

    if (cached) {
      return new Map(Object.entries(cached));
    }

    try {
      const response = await fetch(
        `https://lite-api.jup.ag/price/v3?ids=${mints.join(',')}`
      );

      const data = await response.json();
      const priceMap = new Map<string, number>();

      // v3 API response structure: { [mint]: { usdPrice: number } }
      if (data) {
        Object.entries(data).forEach(([mint, info]: [string, any]) => {
          if (info?.usdPrice) {
            priceMap.set(mint, info.usdPrice);
          }
        });
      }

      // Cache for 2 minutes
      await cacheService.set(cacheKey, Object.fromEntries(priceMap), 120);

      return priceMap;
    } catch (error) {
      logger.warn({ error }, 'Failed to fetch token prices from Jupiter');
      return new Map();
    }
  }

  /**
   * Get SOL price in USD using Jupiter API v3
   */
  async getSOLPrice(): Promise<number> {
    const cacheKey = 'price:SOL';
    const cached = await cacheService.get<number>(cacheKey);

    if (cached) {
      return cached;
    }

    try {
      const solMint = 'So11111111111111111111111111111111111111112';
      const response = await fetch(`https://lite-api.jup.ag/price/v3?ids=${solMint}`);
      const data = await response.json() as Record<string, { usdPrice?: number }>;

      const price = data[solMint]?.usdPrice || 0;

      // Cache for 2 minutes
      await cacheService.set(cacheKey, price, 120);

      return price;
    } catch (error) {
      logger.warn({ error }, 'Failed to fetch SOL price');
      return 0;
    }
  }

  /**
   * Get NFT count using Helius DAS API
   */
  async getNFTCount(address: string): Promise<number> {
    const cacheKey = `nft-count:${address}`;
    const cached = await cacheService.get<number>(cacheKey);

    if (cached !== null) {
      return cached;
    }

    try {
      const heliusUrl = `https://mainnet.helius-rpc.com/?api-key=${this.heliusApiKey}`;

      const response = await fetch(heliusUrl, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          jsonrpc: '2.0',
          id: 'nft-count',
          method: 'getAssetsByOwner',
          params: {
            ownerAddress: address,
            page: 1,
            limit: 1,
            displayOptions: {
              showFungible: false,
            },
          },
        }),
      });

      const data = await response.json() as { result?: { total?: number } };
      const count = data.result?.total || 0;

      // Cache for 10 minutes
      await cacheService.set(cacheKey, count, 600);

      return count;
    } catch (error) {
      logger.warn({ error, address }, 'Failed to fetch NFT count');
      return 0;
    }
  }

  /**
   * Get NFT details using Helius DAS API
   */
  async getNFTs(address: string, limit: number = 50): Promise<NFT[]> {
    const cacheKey = `nfts:${address}:${limit}`;
    const cached = await cacheService.get<NFT[]>(cacheKey);

    if (cached) {
      logger.debug({ address, count: cached.length }, 'Using cached NFTs');
      return cached;
    }

    try {
      const heliusUrl = `https://mainnet.helius-rpc.com/?api-key=${this.heliusApiKey}`;

      const response = await fetch(heliusUrl, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          jsonrpc: '2.0',
          id: 'nft-details',
          method: 'getAssetsByOwner',
          params: {
            ownerAddress: address,
            page: 1,
            limit,
            displayOptions: {
              showFungible: false,
              showCollectionMetadata: true,
            },
          },
        }),
      });

      const data = await response.json() as { result?: { items?: any[] } };
      const assets = data.result?.items || [];

      const nfts: NFT[] = assets.map((asset: any) => ({
        mint: asset.id,
        name: asset.content?.metadata?.name,
        symbol: asset.content?.metadata?.symbol,
        uri: asset.content?.json_uri,
        collection: asset.grouping?.find((g: any) => g.group_key === 'collection')?.group_value,
        verified: asset.creators?.some((c: any) => c.verified) || false,
        imageUrl: asset.content?.links?.image || asset.content?.files?.[0]?.uri,
      }));

      // Cache for 10 minutes
      await cacheService.set(cacheKey, nfts, 600);

      logger.debug({ address, count: nfts.length }, 'Fetched NFT details');
      return nfts;
    } catch (error) {
      logger.warn({ error, address }, 'Failed to fetch NFT details');
      return [];
    }
  }

  /**
   * Check if wallet is active (has recent transactions)
   */
  async isWalletActive(address: string): Promise<boolean> {
    try {
      const pubkey = new PublicKey(address);
      const signatures = await this.connection.getSignaturesForAddress(pubkey, { limit: 1 });

      if (signatures.length === 0) return false;

      // Consider active if transaction within last 30 days
      const lastTxTime = signatures[0]?.blockTime;
      if (!lastTxTime) return false;

      const thirtyDaysAgo = Math.floor(Date.now() / 1000) - (30 * 24 * 60 * 60);
      return lastTxTime > thirtyDaysAgo;
    } catch (error) {
      logger.warn({ error, address }, 'Failed to check wallet activity');
      return false;
    }
  }

  /**
   * Get wallet overview with all analytics data
   */
  async getWalletOverview(address: string): Promise<WalletOverview> {
    const startTime = Date.now();
    const cacheKey = `overview:${address}`;
    const cached = await cacheService.get<WalletOverview>(cacheKey);

    if (cached) {
      logger.debug({ address, duration: Date.now() - startTime }, 'Using cached wallet overview');
      return cached;
    }

    logger.info({ address }, 'Fetching wallet overview');

    try {
      // Validate address
      new PublicKey(address);

      // Fetch all data in parallel with individual timing
      const parallelStart = Date.now();
      const timings: Record<string, number> = {};

      const [solBalance, tokens, nftCount, isActive, solPrice] = await Promise.all([
        (async () => { const t0 = Date.now(); const r = await this.getSOLBalance(address); timings['solBalance'] = Date.now() - t0; return r; })(),
        (async () => { const t0 = Date.now(); const r = await this.getTokenAccounts(address); timings['tokenAccounts'] = Date.now() - t0; return r; })(),
        (async () => { const t0 = Date.now(); const r = await this.getNFTCount(address); timings['nftCount'] = Date.now() - t0; return r; })(),
        (async () => { const t0 = Date.now(); const r = await this.isWalletActive(address); timings['isActive'] = Date.now() - t0; return r; })(),
        (async () => { const t0 = Date.now(); const r = await this.getSOLPrice(); timings['solPrice'] = Date.now() - t0; return r; })(),
      ]);
      const parallelDuration = Date.now() - parallelStart;
      logger.info({ parallelDuration, tokenCount: tokens.length, timings }, '⏱️  Parallel data fetch complete');

      // Get token prices
      const priceStart = Date.now();
      const tokenMints = tokens.map(t => t.mint);
      const prices = await this.getTokenPrices(tokenMints);
      const priceDuration = Date.now() - priceStart;
      logger.info({ priceDuration, tokenMints: tokenMints.length }, '⏱️  Token prices fetched');

      // Calculate token values
      tokens.forEach((token) => {
        const price = prices.get(token.mint);
        if (price) {
          token.priceUSD = price;
          token.valueUSD = token.uiAmount * price;
        }
      });

      // Calculate total value
      const solBalanceUSD = solBalance * solPrice;
      const tokenValueUSD = tokens.reduce((sum, t) => sum + (t.valueUSD || 0), 0);
      const totalValueUSD = solBalanceUSD + tokenValueUSD;

      // Get top 5 tokens by value
      const topTokens = [...tokens]
        .filter(t => t.valueUSD && t.valueUSD > 0)
        .sort((a, b) => (b.valueUSD || 0) - (a.valueUSD || 0))
        .slice(0, 5);

      const overview: WalletOverview = {
        address,
        solBalance,
        solBalanceUSD,
        totalValueUSD,
        tokenCount: tokens.length,
        nftCount,
        isActive,
        tokens,
        topTokens,
      };

      // Cache for 5 minutes
      await cacheService.set(cacheKey, overview, 300);

      const totalDuration = Date.now() - startTime;
      logger.info({
        address,
        solBalance,
        totalValueUSD,
        tokenCount: tokens.length,
        nftCount,
        timing: {
          total: totalDuration,
          parallel: parallelDuration,
          prices: priceDuration,
        },
      }, 'Wallet overview fetched successfully');

      return overview;
    } catch (error) {
      logger.error({ error, address }, 'Error fetching wallet overview');
      throw new Error('Failed to fetch wallet overview');
    }
  }

  /**
   * Get detailed wallet portfolio
   */
  async getWalletPortfolio(address: string): Promise<WalletPortfolio> {
    const cacheKey = `portfolio:${address}`;
    const cached = await cacheService.get<WalletPortfolio>(cacheKey);

    if (cached) {
      logger.debug({ address }, 'Using cached wallet portfolio');
      return cached;
    }

    logger.info({ address }, 'Fetching wallet portfolio');

    try {
      // Validate address
      new PublicKey(address);

      // Fetch all data in parallel
      const [solBalance, tokens, nfts, solPrice] = await Promise.all([
        this.getSOLBalance(address),
        this.getTokenAccounts(address),
        this.getNFTs(address, 100), // Get up to 100 NFTs
        this.getSOLPrice(),
      ]);

      // Get token prices
      const tokenMints = tokens.map(t => t.mint);
      const prices = await this.getTokenPrices(tokenMints);

      // Calculate token values
      tokens.forEach((token) => {
        const price = prices.get(token.mint);
        if (price) {
          token.priceUSD = price;
          token.valueUSD = token.uiAmount * price;
        }
      });

      // Calculate portfolio breakdown
      const solBalanceUSD = solBalance * solPrice;
      const tokensValueUSD = tokens.reduce((sum, t) => sum + (t.valueUSD || 0), 0);
      const nftsValueUSD = 0; // NFT floor prices could be added here
      const totalValueUSD = solBalanceUSD + tokensValueUSD + nftsValueUSD;

      const portfolio: WalletPortfolio = {
        address,
        totalValueUSD,
        solBalance,
        solBalanceUSD,
        tokens: tokens.sort((a, b) => (b.valueUSD || 0) - (a.valueUSD || 0)), // Sort by value
        nfts,
        breakdown: {
          sol: solBalanceUSD,
          tokens: tokensValueUSD,
          nfts: nftsValueUSD,
        },
      };

      // Cache for 5 minutes
      await cacheService.set(cacheKey, portfolio, 300);

      logger.info({
        address,
        totalValue: totalValueUSD,
        tokenCount: tokens.length,
        nftCount: nfts.length,
      }, 'Wallet portfolio fetched successfully');

      return portfolio;
    } catch (error) {
      logger.error({ error, address }, 'Error fetching wallet portfolio');
      throw new Error('Failed to fetch wallet portfolio');
    }
  }

  /**
   * Get wallet transaction activity using Helius Enhanced Transactions API
   */
  async getWalletActivity(address: string, limit: number = 100): Promise<WalletActivity> {
    const cacheKey = `activity:${address}:${limit}`;
    const cached = await cacheService.get<WalletActivity>(cacheKey);

    if (cached) {
      logger.debug({ address }, 'Using cached wallet activity');
      return cached;
    }

    logger.info({ address }, 'Fetching wallet activity');

    try {
      // Validate address
      const pubkey = new PublicKey(address);

      // Get transaction signatures
      const signatures = await this.connection.getSignaturesForAddress(pubkey, { limit });

      if (signatures.length === 0) {
        const emptyActivity: WalletActivity = {
          address,
          transactionCount: 0,
          recentTransactions: [],
        };

        await cacheService.set(cacheKey, emptyActivity, 300);
        return emptyActivity;
      }

      // Use Helius Enhanced Transactions API for detailed transaction info
      const heliusUrl = `https://mainnet.helius-rpc.com/?api-key=${this.heliusApiKey}`;

      // Get up to 100 recent transactions with details
      const signaturesToFetch = signatures.slice(0, Math.min(limit, 100)).map(s => s.signature);

      const response = await fetch(heliusUrl, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          jsonrpc: '2.0',
          id: 'activity-txs',
          method: 'getTransaction',
          params: signaturesToFetch.map(sig => [
            sig,
            {
              encoding: 'jsonParsed',
              maxSupportedTransactionVersion: 0,
            },
          ]),
        }),
      });

      const data = await response.json() as { result?: any[] };

      // Parse enhanced transactions
      const recentTransactions: Transaction[] = signatures.slice(0, 10).map((sig, idx) => {
        const tx = data.result?.[idx];

        return {
          signature: sig.signature,
          timestamp: sig.blockTime || 0,
          type: this.inferTransactionType(tx),
          status: sig.err ? 'failed' : 'success',
          fee: tx?.meta?.fee ? tx.meta.fee / LAMPORTS_PER_SOL : 0,
          description: this.generateTransactionDescription(tx),
        };
      });

      // Get first and last transaction timestamps
      const firstTransaction = signatures.length > 0
        ? new Date((signatures[signatures.length - 1]?.blockTime || 0) * 1000).toISOString()
        : undefined;

      const lastTransaction = signatures.length > 0
        ? new Date((signatures[0]?.blockTime || 0) * 1000).toISOString()
        : undefined;

      const activity: WalletActivity = {
        address,
        transactionCount: signatures.length,
        firstTransaction,
        lastTransaction,
        recentTransactions,
      };

      // Cache for 5 minutes
      await cacheService.set(cacheKey, activity, 300);

      logger.info({
        address,
        txCount: signatures.length,
        recentTxs: recentTransactions.length,
      }, 'Wallet activity fetched successfully');

      return activity;
    } catch (error) {
      logger.error({ error, address }, 'Error fetching wallet activity');
      throw new Error('Failed to fetch wallet activity');
    }
  }

  /**
   * Get the actual first transaction of a wallet by paginating backwards
   */
  private async getFirstTransaction(pubkey: PublicKey): Promise<{ blockTime: number | null; signature: string } | null> {
    let oldestSignature: { blockTime: number | null; signature: string } | null = null;
    let before: string | undefined = undefined;
    let iterations = 0;
    const maxIterations = 10; // Limit to prevent infinite loops (10 * 1000 = 10,000 transactions)

    while (iterations < maxIterations) {
      const signatures = await this.connection.getSignaturesForAddress(pubkey, {
        limit: 1000,
        before,
      });

      if (signatures.length === 0) {
        break;
      }

      // The last signature in the batch is the oldest
      const lastSig = signatures[signatures.length - 1];
      if (lastSig) {
        oldestSignature = {
          blockTime: lastSig.blockTime ?? null,
          signature: lastSig.signature,
        };
      }

      // If we got fewer than 1000, we've reached the end
      if (signatures.length < 1000) {
        break;
      }

      // Continue pagination from the oldest signature
      if (oldestSignature) {
        before = oldestSignature.signature;
      }
      iterations++;
    }

    return oldestSignature;
  }

  /**
   * Get wallet risk assessment
   */
  async getWalletRisk(address: string): Promise<WalletRisk> {
    const cacheKey = `risk:${address}`;
    const cached = await cacheService.get<WalletRisk>(cacheKey);

    if (cached) {
      logger.debug({ address }, 'Using cached wallet risk assessment');
      return cached;
    }

    logger.info({ address }, 'Performing wallet risk assessment');

    try {
      // Validate address
      const pubkey = new PublicKey(address);

      // Fetch necessary data for risk assessment
      // OPTIMIZATION: Reduced signature limit from 1000 to 100 for faster response
      // This is sufficient for risk assessment as we only need to estimate activity level
      const [overview, firstTx, recentSignatures] = await Promise.all([
        this.getWalletOverview(address),
        // Fetch the actual first transaction
        this.getFirstTransaction(pubkey),
        // Fetch recent signatures for transaction count estimation (reduced from 1000 to 100)
        this.connection.getSignaturesForAddress(pubkey, { limit: 100 }),
      ]);

      const factors: RiskFactor[] = [];
      const warnings: string[] = [];
      let totalRiskScore = 0;

      // Factor 1: Wallet Age (newer = higher risk)
      if (firstTx?.blockTime) {
        const firstTxDate = new Date(firstTx.blockTime * 1000);
        const walletAgeDays = Math.floor((Date.now() - firstTxDate.getTime()) / (1000 * 60 * 60 * 24));

        if (walletAgeDays < 7) {
          const impact = 30;
          factors.push({
            type: 'wallet_age',
            severity: 'high',
            description: `Wallet is very new (${walletAgeDays} days old)`,
            impact,
          });
          totalRiskScore += impact;
          warnings.push('Newly created wallet - exercise caution');
        } else if (walletAgeDays < 30) {
          const impact = 15;
          factors.push({
            type: 'wallet_age',
            severity: 'medium',
            description: `Wallet is relatively new (${walletAgeDays} days old)`,
            impact,
          });
          totalRiskScore += impact;
        } else {
          factors.push({
            type: 'wallet_age',
            severity: 'low',
            description: `Wallet age: ${walletAgeDays} days`,
            impact: 0,
          });
        }
      }

      // Factor 2: Transaction Volume (very low or very high = suspicious)
      // Note: We sample up to 100 recent signatures, so actualTxCount represents recent activity
      const actualTxCount = recentSignatures.length;

      if (actualTxCount < 5) {
        const impact = 20;
        factors.push({
          type: 'low_activity',
          severity: 'medium',
          description: `Very low transaction count (${actualTxCount} recent transactions)`,
          impact,
        });
        totalRiskScore += impact;
        warnings.push('Low transaction history - limited on-chain reputation');
      } else if (actualTxCount === 100) {
        // If we maxed out our sample, wallet is highly active
        const impact = 5;
        factors.push({
          type: 'high_activity',
          severity: 'low',
          description: `High transaction activity (100+ recent transactions)`,
          impact,
        });
        totalRiskScore += impact;
      }

      // Factor 3: Portfolio Concentration (single token = higher risk)
      if (overview.tokenCount === 0 && overview.solBalance < 0.1) {
        const impact = 25;
        factors.push({
          type: 'empty_wallet',
          severity: 'high',
          description: 'Wallet has minimal or no holdings',
          impact,
        });
        totalRiskScore += impact;
        warnings.push('Empty or nearly empty wallet');
      } else if (overview.tokenCount === 1) {
        const impact = 15;
        factors.push({
          type: 'concentrated_portfolio',
          severity: 'medium',
          description: 'Portfolio is concentrated in a single token',
          impact,
        });
        totalRiskScore += impact;
      }

      // Factor 4: Total Value (honeypot detection)
      if (overview.totalValueUSD > 100000) {
        const impact = 5;
        factors.push({
          type: 'high_value',
          severity: 'low',
          description: `High total value ($${overview.totalValueUSD.toFixed(2)})`,
          impact,
        });
        totalRiskScore += impact;
        warnings.push('High-value wallet - potential honeypot or whale');
      }

      // Factor 5: Activity Pattern (inactive wallets)
      if (!overview.isActive) {
        const impact = 10;
        factors.push({
          type: 'inactive',
          severity: 'low',
          description: 'No recent transaction activity (30+ days)',
          impact,
        });
        totalRiskScore += impact;
      }

      // Calculate final risk score (capped at 100)
      const riskScore = Math.min(totalRiskScore, 100);

      // Determine risk level
      let riskLevel: 'low' | 'medium' | 'high';
      if (riskScore < 30) {
        riskLevel = 'low';
      } else if (riskScore < 60) {
        riskLevel = 'medium';
      } else {
        riskLevel = 'high';
      }

      const risk: WalletRisk = {
        address,
        riskScore,
        riskLevel,
        factors,
        warnings,
      };

      // Cache for 10 minutes
      await cacheService.set(cacheKey, risk, 600);

      logger.info({
        address,
        riskScore,
        riskLevel,
        factorCount: factors.length,
      }, 'Wallet risk assessment completed');

      return risk;
    } catch (error) {
      logger.error({ error, address }, 'Error performing risk assessment');
      throw new Error('Failed to assess wallet risk');
    }
  }

  /**
   * Infer transaction type from transaction data
   */
  private inferTransactionType(tx: any): string {
    if (!tx?.transaction?.message) return 'Unknown';

    const instructions = tx.transaction.message.instructions || [];

    // Check for common program IDs
    for (const ix of instructions) {
      const programId = ix.programId?.toString() || '';

      if (programId === 'TokenkegQfeZyiNwAJbNbGKPFXCWuBvf9Ss623VQ5DA') {
        return 'Token Transfer';
      }
      if (programId === '11111111111111111111111111111111') {
        return 'SOL Transfer';
      }
      if (programId.includes('Swap')) {
        return 'Swap';
      }
      if (programId.includes('Stake')) {
        return 'Staking';
      }
    }

    return 'Transaction';
  }

  /**
   * Generate human-readable transaction description
   */
  private generateTransactionDescription(tx: any): string {
    if (!tx?.transaction?.message) return 'Transaction';

    const instructions = tx.transaction.message.instructions || [];

    if (instructions.length === 0) return 'Transaction';

    // Simple description based on first instruction
    const firstIx = instructions[0];
    const programId = firstIx.programId?.toString() || '';

    if (programId === 'TokenkegQfeZyiNwAJbNbGKPFXCWuBvf9Ss623VQ5DA') {
      return 'Token operation';
    }
    if (programId === '11111111111111111111111111111111') {
      return 'SOL transfer';
    }

    return `Program interaction (${instructions.length} instruction${instructions.length > 1 ? 's' : ''})`;
  }

  /**
   * Validate a Solana address
   */
  isValidAddress(address: string): boolean {
    try {
      new PublicKey(address);
      return true;
    } catch {
      return false;
    }
  }

  /**
   * Warm up cache and connections to avoid cold start latency
   */
  async warmup(): Promise<void> {
    try {
      logger.info('🔥 Warming up Solana service...');

      // 1. Initialize connection by fetching cluster version
      const version = await this.connection.getVersion();
      logger.debug({ version }, 'RPC connection established');

      // 2. Fetch SOL price to warm up Jupiter API connection
      try {
        await this.getSOLPrice();
        logger.debug('SOL price cache warmed');
      } catch (error) {
        logger.warn('Failed to warm SOL price cache (non-critical)');
      }

      // 3. Test a simple RPC call to ensure connection pool is ready
      const slot = await this.connection.getSlot();
      logger.debug({ slot }, 'RPC connection pool ready');

      logger.info('✅ Solana service warmup complete');
    } catch (error) {
      logger.warn({ error }, 'Solana service warmup failed (non-critical)');
    }
  }
}

/** Singleton instance - lazy loaded */
let instance: SolanaService | null = null;

export function getSolanaService(): SolanaService {
  if (!instance) {
    instance = new SolanaService();
  }
  return instance;
}

// Export as a direct reference for convenience
export const solanaService = {
  get connection() { return getSolanaService().getConnection(); },
  warmup: () => getSolanaService().warmup(),
  getSOLBalance: (address: string) => getSolanaService().getSOLBalance(address),
  getTokenAccounts: (address: string) => getSolanaService().getTokenAccounts(address),
  getTokenPrices: (mints: string[]) => getSolanaService().getTokenPrices(mints),
  getSOLPrice: () => getSolanaService().getSOLPrice(),
  getNFTCount: (address: string) => getSolanaService().getNFTCount(address),
  getNFTs: (address: string, limit?: number) => getSolanaService().getNFTs(address, limit),
  isWalletActive: (address: string) => getSolanaService().isWalletActive(address),
  getWalletOverview: (address: string) => getSolanaService().getWalletOverview(address),
  getWalletPortfolio: (address: string) => getSolanaService().getWalletPortfolio(address),
  getWalletActivity: (address: string, limit?: number) => getSolanaService().getWalletActivity(address, limit),
  getWalletRisk: (address: string) => getSolanaService().getWalletRisk(address),
  isValidAddress: (address: string) => getSolanaService().isValidAddress(address),
};
