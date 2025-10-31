import { databaseService } from '../src/services/database.js';

/** Database schema for payment proofs and audit logs */
const schema = `
-- Payment audit logs
CREATE TABLE IF NOT EXISTS payment_proofs (
  id SERIAL PRIMARY KEY,
  nonce VARCHAR(64) UNIQUE NOT NULL,
  wallet_address VARCHAR(44) NOT NULL,
  amount_usdc DECIMAL(10, 6) NOT NULL,
  endpoint VARCHAR(255) NOT NULL,
  proof_data JSONB NOT NULL,
  verified_at TIMESTAMP DEFAULT NOW(),
  expires_at TIMESTAMP NOT NULL,
  created_at TIMESTAMP DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_payment_nonce ON payment_proofs(nonce);
CREATE INDEX IF NOT EXISTS idx_payment_wallet ON payment_proofs(wallet_address);
CREATE INDEX IF NOT EXISTS idx_payment_created_at ON payment_proofs(created_at);

-- Analytics and metrics
CREATE TABLE IF NOT EXISTS api_requests (
  id SERIAL PRIMARY KEY,
  endpoint VARCHAR(255) NOT NULL,
  wallet_address VARCHAR(44),
  response_time_ms INTEGER,
  cache_hit BOOLEAN DEFAULT FALSE,
  error_code VARCHAR(50),
  created_at TIMESTAMP DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_api_endpoint ON api_requests(endpoint);
CREATE INDEX IF NOT EXISTS idx_api_created_at ON api_requests(created_at);

-- Function to auto-delete expired payment proofs
CREATE OR REPLACE FUNCTION delete_expired_payment_proofs()
RETURNS void AS $$
BEGIN
  DELETE FROM payment_proofs WHERE expires_at < NOW();
END;
$$ LANGUAGE plpgsql;
`;

/** Run database migrations */
async function setupDatabase() {
  console.log('🚀 Setting up database schema...\n');

  try {
    await databaseService.connect();

    if (!databaseService.connected) {
      console.error('❌ Database connection failed. Cannot set up schema.');
      process.exit(1);
    }

    console.log('📝 Creating tables and indexes...');
    await databaseService.query(schema);

    console.log('\n✅ Database schema created successfully!\n');
    console.log('Tables created:');
    console.log('  - payment_proofs (for x402 payment audit)');
    console.log('  - api_requests (for analytics)');

    await databaseService.disconnect();
    process.exit(0);
  } catch (error) {
    console.error('\n❌ Failed to set up database:', error);
    await databaseService.disconnect();
    process.exit(1);
  }
}

// Run if executed directly
setupDatabase();
