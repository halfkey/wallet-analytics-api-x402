#!/bin/bash

# Production Deployment Script
# This script helps deploy the Wallet Analytics API to production

set -e  # Exit on error

echo "🚀 Wallet Analytics API - Production Deployment"
echo "================================================"
echo ""

# Check if .env.production exists
if [ ! -f .env.production ]; then
    echo "❌ Error: .env.production file not found"
    echo ""
    echo "Please create .env.production from the template:"
    echo "  cp .env.production.template .env.production"
    echo ""
    echo "Then edit .env.production with your production values."
    exit 1
fi

# Check if Docker is installed
if ! command -v docker &> /dev/null; then
    echo "❌ Error: Docker is not installed"
    echo "Please install Docker: https://docs.docker.com/get-docker/"
    exit 1
fi

# Check if docker-compose is installed
if ! command -v docker-compose &> /dev/null; then
    echo "❌ Error: docker-compose is not installed"
    echo "Please install docker-compose: https://docs.docker.com/compose/install/"
    exit 1
fi

echo "✅ Prerequisites check passed"
echo ""

# Ask for confirmation
read -p "Deploy to production? (y/N) " -n 1 -r
echo ""
if [[ ! $REPLY =~ ^[Yy]$ ]]; then
    echo "Deployment cancelled."
    exit 0
fi

echo ""
echo "📦 Building Docker image..."
docker-compose -f docker-compose.production.yml build

echo ""
echo "🗄️  Starting database..."
docker-compose -f docker-compose.production.yml up -d db

echo ""
echo "⏳ Waiting for database to be ready..."
sleep 10

echo ""
echo "📊 Running database migrations..."
docker-compose -f docker-compose.production.yml run --rm api sh -c "node -e \"
const { Pool } = require('pg');
const pool = new Pool({ connectionString: process.env.DATABASE_URL });
pool.query('CREATE TABLE IF NOT EXISTS payment_proofs (id SERIAL PRIMARY KEY, nonce VARCHAR(255) UNIQUE NOT NULL, wallet VARCHAR(255) NOT NULL, amount DECIMAL(10,2) NOT NULL, currency VARCHAR(10) NOT NULL, signature TEXT NOT NULL, network VARCHAR(50) NOT NULL, created_at TIMESTAMP DEFAULT NOW())').then(() => {
  console.log('✅ Database tables created');
  pool.end();
  process.exit(0);
}).catch(err => {
  console.error('❌ Database migration failed:', err);
  pool.end();
  process.exit(1);
});
\""

echo ""
echo "🚀 Starting API server..."
docker-compose -f docker-compose.production.yml up -d api

echo ""
echo "⏳ Waiting for API to be ready..."
sleep 5

echo ""
echo "🏥 Checking health..."
for i in {1..10}; do
    if curl -s http://localhost:3000/health > /dev/null; then
        echo "✅ API is healthy!"
        break
    fi
    if [ $i -eq 10 ]; then
        echo "❌ API failed to start. Check logs:"
        echo "   docker-compose -f docker-compose.production.yml logs api"
        exit 1
    fi
    echo "   Attempt $i/10..."
    sleep 3
done

echo ""
echo "✅ Deployment successful!"
echo ""
echo "📊 Service Information:"
echo "   API URL: http://localhost:3000"
echo "   Health: http://localhost:3000/health"
echo "   Database: PostgreSQL on localhost:5432"
echo ""
echo "📝 Useful commands:"
echo "   View logs:    docker-compose -f docker-compose.production.yml logs -f"
echo "   Stop:         docker-compose -f docker-compose.production.yml down"
echo "   Restart:      docker-compose -f docker-compose.production.yml restart"
echo "   Status:       docker-compose -f docker-compose.production.yml ps"
echo ""
echo "🎉 Your API is now running in production mode!"
