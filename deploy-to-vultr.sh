#!/bin/bash
#
# Quick Vultr Deployment Helper
# Usage: bash deploy-to-vultr.sh YOUR_SERVER_IP
#

set -e

# Check if IP provided
if [ -z "$1" ]; then
    echo "❌ Error: Please provide your Vultr server IP"
    echo "Usage: bash deploy-to-vultr.sh YOUR_SERVER_IP"
    echo ""
    echo "Example: bash deploy-to-vultr.sh 45.77.123.456"
    exit 1
fi

SERVER_IP=$1
echo "🚀 Deploying to Vultr server: $SERVER_IP"
echo ""

# Step 1: Upload files
echo "📤 [1/3] Uploading code to server..."
rsync -avz --progress \
    --exclude 'node_modules' \
    --exclude 'dist' \
    --exclude '.git' \
    --exclude '*.log' \
    --exclude '.env' \
    --exclude '.env.development' \
    . root@$SERVER_IP:~/wallet-analytics-api/

echo ""
echo "📤 [2/3] Uploading environment file..."
scp .env.production root@$SERVER_IP:~/wallet-analytics-api/.env.production

echo ""
echo "✅ Upload complete!"
echo ""
echo "🔧 [3/3] Next step: SSH into server and run deployment"
echo ""
echo "Run these commands:"
echo "  ssh root@$SERVER_IP"
echo "  cd ~/wallet-analytics-api"
echo "  bash scripts/deploy-vultr.sh"
echo ""
echo "Or run this all-in-one command:"
echo "  ssh root@$SERVER_IP 'cd ~/wallet-analytics-api && bash scripts/deploy-vultr.sh'"
echo ""
