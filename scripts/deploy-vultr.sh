#!/bin/bash
#
# Vultr VPS Deployment Script
# Deploys Wallet Analytics API to a fresh Ubuntu server
#
# Usage: bash deploy-vultr.sh

set -e  # Exit on error

echo "🚀 Wallet Analytics API - Vultr Deployment"
echo "=========================================="
echo ""

# Colors
RED='\033[0;31m'
GREEN='\033[0;32m'
YELLOW='\033[1;33m'
NC='\033[0m' # No Color

# Step 1: Update system
echo -e "${GREEN}[1/8]${NC} Updating system packages..."
sudo apt-get update -qq
sudo apt-get upgrade -y -qq

# Step 2: Install Docker
echo -e "${GREEN}[2/8]${NC} Installing Docker..."
if ! command -v docker &> /dev/null; then
    # Install Docker
    curl -fsSL https://get.docker.com -o get-docker.sh
    sudo sh get-docker.sh
    sudo usermod -aG docker $USER
    rm get-docker.sh

    # Start Docker
    sudo systemctl enable docker
    sudo systemctl start docker
    echo "✅ Docker installed successfully"
else
    echo "✅ Docker already installed"
fi

# Step 3: Install Docker Compose
echo -e "${GREEN}[3/8]${NC} Installing Docker Compose..."
if ! command -v docker-compose &> /dev/null; then
    sudo curl -L "https://github.com/docker/compose/releases/latest/download/docker-compose-$(uname -s)-$(uname -m)" -o /usr/local/bin/docker-compose
    sudo chmod +x /usr/local/bin/docker-compose
    echo "✅ Docker Compose installed successfully"
else
    echo "✅ Docker Compose already installed"
fi

# Step 4: Install additional tools
echo -e "${GREEN}[4/8]${NC} Installing additional tools..."
sudo apt-get install -y -qq git curl nano ufw

# Step 5: Configure firewall
echo -e "${GREEN}[5/8]${NC} Configuring firewall..."
sudo ufw --force enable
sudo ufw allow 22/tcp   # SSH
sudo ufw allow 80/tcp   # HTTP
sudo ufw allow 443/tcp  # HTTPS
sudo ufw allow 3000/tcp # API (we'll use nginx reverse proxy later)
echo "✅ Firewall configured"

# Step 6: Create deployment directory
echo -e "${GREEN}[6/8]${NC} Setting up deployment directory..."
mkdir -p ~/wallet-analytics-api
cd ~/wallet-analytics-api

# Step 7: Check for .env.production
echo -e "${GREEN}[7/8]${NC} Checking environment configuration..."
if [ ! -f .env.production ]; then
    echo -e "${YELLOW}⚠️  .env.production not found!${NC}"
    echo "Please create .env.production with your credentials."
    echo "You can copy from .env.production.template"
    echo ""
    echo "Required variables:"
    echo "  - HELIUS_RPC_URL_MAINNET"
    echo "  - DATABASE_URL"
    echo "  - UPSTASH_REDIS_REST_URL"
    echo "  - UPSTASH_REDIS_REST_TOKEN"
    exit 1
fi

# Step 8: Deploy
echo -e "${GREEN}[8/8]${NC} Deploying application..."
echo "Building Docker image..."
docker build -t wallet-analytics-api:latest . -q

echo "Starting containers..."
docker-compose -f docker-compose.simple.yml down 2>/dev/null || true
docker-compose -f docker-compose.simple.yml up -d

echo ""
echo -e "${GREEN}✅ Deployment Complete!${NC}"
echo ""
echo "=========================================="
echo "📊 Deployment Summary"
echo "=========================================="
echo "Status: $(docker ps --filter name=wallet-analytics-api --format '{{.Status}}')"
echo "Container: wallet-analytics-api"
echo "Port: 3000"
echo ""
echo "🌐 Access your API:"
echo "  http://$(curl -s ifconfig.me):3000"
echo "  http://$(curl -s ifconfig.me):3000/health"
echo ""
echo "📝 Useful commands:"
echo "  View logs:    docker logs -f wallet-analytics-api"
echo "  Restart:      docker-compose -f docker-compose.simple.yml restart"
echo "  Stop:         docker-compose -f docker-compose.simple.yml down"
echo "  Update:       git pull && docker-compose -f docker-compose.simple.yml up -d --build"
echo ""
echo "🔒 Next steps:"
echo "  1. Set up Nginx reverse proxy for HTTPS"
echo "  2. Configure domain name"
echo "  3. Set up SSL certificate (Let's Encrypt)"
echo "  4. Configure automated backups"
echo ""
