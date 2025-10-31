import { describe, it, expect, beforeEach, afterEach } from 'vitest';
import { databaseService } from '../../../src/services/database.js';

describe('DatabaseService', () => {
  describe('connection', () => {
    it('should be connected', () => {
      expect(databaseService.connected).toBe(true);
    });

    it('should return connection stats', async () => {
      const stats = await databaseService.getStats();
      expect(stats.connected).toBe(true);
      expect(typeof stats.poolSize).toBe('number');
      expect(typeof stats.idleCount).toBe('number');
    });
  });

  describe('query execution', () => {
    it('should execute a simple query', async () => {
      const result = await databaseService.query('SELECT 1 + 1 as sum');
      expect(result.rows).toHaveLength(1);
      expect(result.rows[0]?.sum).toBe(2);
    });

    it('should execute parameterized query', async () => {
      const result = await databaseService.query<{ result: number }>(
        'SELECT $1::int + $2::int as result',
        [5, 10]
      );
      expect(result.rows[0]?.result).toBe(15);
    });

    it('should handle queries with no results', async () => {
      const result = await databaseService.query('SELECT 1 WHERE false');
      expect(result.rows).toHaveLength(0);
    });
  });

  describe('payment_proofs table', () => {
    const testNonce = `test-nonce-${Date.now()}`;

    afterEach(async () => {
      // Clean up test data
      await databaseService.query('DELETE FROM payment_proofs WHERE nonce = $1', [testNonce]);
    });

    it('should insert payment proof', async () => {
      const result = await databaseService.query(
        `INSERT INTO payment_proofs
         (nonce, wallet_address, amount_usdc, endpoint, proof_data, expires_at)
         VALUES ($1, $2, $3, $4, $5, NOW() + INTERVAL '5 minutes')
         RETURNING id, nonce`,
        [
          testNonce,
          'TestWallet123',
          0.05,
          '/api/v1/wallet/test/overview',
          JSON.stringify({ signature: 'test' }),
        ]
      );

      expect(result.rows).toHaveLength(1);
      expect(result.rows[0]?.nonce).toBe(testNonce);
    });

    it('should prevent duplicate nonces', async () => {
      // Insert first time
      await databaseService.query(
        `INSERT INTO payment_proofs
         (nonce, wallet_address, amount_usdc, endpoint, proof_data, expires_at)
         VALUES ($1, $2, $3, $4, $5, NOW() + INTERVAL '5 minutes')`,
        [
          testNonce,
          'TestWallet123',
          0.05,
          '/api/v1/wallet/test/overview',
          JSON.stringify({ signature: 'test' }),
        ]
      );

      // Try to insert again with same nonce
      await expect(
        databaseService.query(
          `INSERT INTO payment_proofs
           (nonce, wallet_address, amount_usdc, endpoint, proof_data, expires_at)
           VALUES ($1, $2, $3, $4, $5, NOW() + INTERVAL '5 minutes')`,
          [
            testNonce,
            'TestWallet123',
            0.05,
            '/api/v1/wallet/test/overview',
            JSON.stringify({ signature: 'test' }),
          ]
        )
      ).rejects.toThrow();
    });

    it('should query payment proofs by nonce', async () => {
      // Insert test data
      await databaseService.query(
        `INSERT INTO payment_proofs
         (nonce, wallet_address, amount_usdc, endpoint, proof_data, expires_at)
         VALUES ($1, $2, $3, $4, $5, NOW() + INTERVAL '5 minutes')`,
        [
          testNonce,
          'TestWallet123',
          0.05,
          '/api/v1/wallet/test/overview',
          JSON.stringify({ signature: 'test' }),
        ]
      );

      // Query it back
      const result = await databaseService.query(
        'SELECT * FROM payment_proofs WHERE nonce = $1',
        [testNonce]
      );

      expect(result.rows).toHaveLength(1);
      expect(result.rows[0]?.wallet_address).toBe('TestWallet123');
      expect(parseFloat(result.rows[0]?.amount_usdc)).toBe(0.05);
    });
  });

  describe('api_requests table', () => {
    let testId: number;

    afterEach(async () => {
      if (testId) {
        await databaseService.query('DELETE FROM api_requests WHERE id = $1', [testId]);
      }
    });

    it('should insert API request log', async () => {
      const result = await databaseService.query(
        `INSERT INTO api_requests
         (endpoint, wallet_address, response_time_ms, cache_hit)
         VALUES ($1, $2, $3, $4)
         RETURNING id`,
        ['/api/v1/wallet/test/overview', 'TestWallet123', 150, true]
      );

      expect(result.rows).toHaveLength(1);
      testId = result.rows[0]?.id;
      expect(testId).toBeGreaterThan(0);
    });

    it('should query API request statistics', async () => {
      const result = await databaseService.query(
        'SELECT COUNT(*) as count FROM api_requests'
      );

      expect(result.rows).toHaveLength(1);
      expect(typeof result.rows[0]?.count).toBe('string'); // COUNT returns string
    });
  });

  describe('transactions', () => {
    it('should support transactions', async () => {
      const client = await databaseService.getClient();

      try {
        await client.query('BEGIN');
        await client.query('SELECT 1');
        await client.query('COMMIT');
      } finally {
        client.release();
      }
    });

    it('should rollback on error', async () => {
      const client = await databaseService.getClient();
      const testNonce = `transaction-test-${Date.now()}`;

      try {
        await client.query('BEGIN');

        // Insert a record
        await client.query(
          `INSERT INTO payment_proofs
           (nonce, wallet_address, amount_usdc, endpoint, proof_data, expires_at)
           VALUES ($1, $2, $3, $4, $5, NOW() + INTERVAL '5 minutes')`,
          [
            testNonce,
            'TestWallet123',
            0.05,
            '/api/v1/wallet/test/overview',
            JSON.stringify({ signature: 'test' }),
          ]
        );

        // Rollback
        await client.query('ROLLBACK');
      } finally {
        client.release();
      }

      // Verify record was not inserted
      const result = await databaseService.query(
        'SELECT * FROM payment_proofs WHERE nonce = $1',
        [testNonce]
      );
      expect(result.rows).toHaveLength(0);
    });
  });
});
