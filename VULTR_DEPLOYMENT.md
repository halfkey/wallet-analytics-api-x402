# Vultr VPS Deployment Guide

Complete guide to deploy your Wallet Analytics API on Vultr VPS.

## 📋 Prerequisites

- Vultr account with credits
- SSH key pair (we'll create one if needed)
- Your environment credentials ready

## 🚀 Quick Start (15 minutes)

### Step 1: Create Vultr Server

1. **Log in to Vultr Dashboard:** https://my.vultr.com/

2. **Deploy New Server:**
   - Click **"Deploy +"** → **"Deploy New Server"**

3. **Choose Server Type:**
   - **Server Type:** Cloud Compute - Shared CPU
   - **Location:** Choose closest to your users (e.g., New York, Los Angeles, Atlanta)

4. **Choose Image:**
   - **Operating System:** Ubuntu 24.04 LTS x64

5. **Choose Plan:**
   - **Recommended:** $6/month (1 vCPU, 1GB RAM, 25GB SSD, 1TB bandwidth)
   - **Minimum:** $6/month plan
   - **Optimal:** $12/month (2 vCPU, 2GB RAM) for production

6. **Add SSH Key (Important!):**
   - If you have an SSH key, add it now
   - If not, see "SSH Key Setup" below

7. **Server Settings:**
   - **Server Hostname:** `wallet-analytics-api`
   - **Server Label:** `Wallet Analytics API Production`
   - **Enable Auto Backups:** Optional (+20% cost, recommended)
   - **Enable IPv6:** Yes (free)

8. **Deploy Server:**
   - Click **"Deploy Now"**
   - Wait 2-3 minutes for server to provision

### Step 2: SSH Key Setup (if you don't have one)

**On your local machine:**

```bash
# Generate SSH key
ssh-keygen -t ed25519 -C "your_email@example.com"

# Display public key
cat ~/.ssh/id_ed25519.pub

# Copy the output and add it to Vultr dashboard:
# Settings → SSH Keys → Add SSH Key
```

### Step 3: Connect to Your Server

**Get your server IP from Vultr dashboard**, then connect:

```bash
# Replace YOUR_SERVER_IP with actual IP
ssh root@YOUR_SERVER_IP
```

**First time connecting:**
- Type `yes` to accept the fingerprint
- You should now be logged into your Vultr server!

### Step 4: Upload Your Project

**Option A: From your local machine (recommended):**

```bash
# On your LOCAL machine (open a new terminal, not the SSH session)
cd /home/trap/code/wallet-analytics-api

# Upload project to server (replace YOUR_SERVER_IP)
rsync -avz --exclude 'node_modules' --exclude 'dist' --exclude '.git' \
  . root@YOUR_SERVER_IP:~/wallet-analytics-api/

# Upload environment file
scp .env.production root@YOUR_SERVER_IP:~/wallet-analytics-api/.env.production
```

**Option B: Clone from Git:**

```bash
# On your SERVER (SSH session)
cd ~
git clone https://github.com/yourusername/wallet-analytics-api.git
cd wallet-analytics-api

# Create .env.production manually
nano .env.production
# Paste your environment variables, save with Ctrl+X, Y, Enter
```

### Step 5: Run Deployment Script

**On your SERVER (SSH session):**

```bash
cd ~/wallet-analytics-api

# Run automated deployment
bash scripts/deploy-vultr.sh
```

**The script will:**
1. ✅ Update system packages
2. ✅ Install Docker & Docker Compose
3. ✅ Configure firewall
4. ✅ Build Docker image
5. ✅ Start the API container

**This takes about 5-10 minutes.**

### Step 6: Verify Deployment

**Check if API is running:**

```bash
# Check container status
docker ps

# View logs
docker logs -f wallet-analytics-api

# Test health endpoint
curl http://localhost:3000/health

# Get your public IP
curl ifconfig.me
```

**Test from your local machine:**

```bash
# Replace YOUR_SERVER_IP with your Vultr server IP
curl http://YOUR_SERVER_IP:3000/health
curl http://YOUR_SERVER_IP:3000/
```

---

## 🌐 Set Up Domain & SSL (Optional but Recommended)

### Step 1: Point Domain to Vultr Server

1. **Get your server IP** from Vultr dashboard
2. **In your domain registrar** (Namecheap, GoDaddy, Cloudflare, etc.):
   - Add an **A record**: `api.yourdomain.com` → `YOUR_SERVER_IP`
   - Wait 5-15 minutes for DNS propagation

### Step 2: Install Nginx & SSL

**On your SERVER:**

```bash
# Install Nginx
sudo apt-get install -y nginx

# Install Certbot for SSL
sudo apt-get install -y certbot python3-certbot-nginx

# Configure Nginx
sudo nano /etc/nginx/sites-available/wallet-analytics-api
```

**Paste this configuration** (replace `api.yourdomain.com`):

```nginx
server {
    listen 80;
    server_name api.yourdomain.com;

    location / {
        proxy_pass http://localhost:3000;
        proxy_http_version 1.1;
        proxy_set_header Upgrade $http_upgrade;
        proxy_set_header Connection 'upgrade';
        proxy_set_header Host $host;
        proxy_set_header X-Real-IP $remote_addr;
        proxy_set_header X-Forwarded-For $proxy_add_x_forwarded_for;
        proxy_set_header X-Forwarded-Proto $scheme;
        proxy_cache_bypass $http_upgrade;
    }
}
```

**Enable the site:**

```bash
# Create symbolic link
sudo ln -s /etc/nginx/sites-available/wallet-analytics-api /etc/nginx/sites-enabled/

# Test configuration
sudo nginx -t

# Restart Nginx
sudo systemctl restart nginx
```

**Get SSL certificate:**

```bash
# Get free SSL from Let's Encrypt
sudo certbot --nginx -d api.yourdomain.com

# Follow prompts:
# - Enter your email
# - Agree to terms
# - Choose to redirect HTTP to HTTPS (option 2)
```

**Done! Your API is now available at:**
- `https://api.yourdomain.com`
- `https://api.yourdomain.com/health`

---

## 📊 Monitoring & Maintenance

### View Logs

```bash
# Real-time logs
docker logs -f wallet-analytics-api

# Last 100 lines
docker logs --tail 100 wallet-analytics-api

# Logs with timestamps
docker logs -t wallet-analytics-api
```

### Restart API

```bash
cd ~/wallet-analytics-api
docker-compose -f docker-compose.simple.yml restart
```

### Update API

```bash
cd ~/wallet-analytics-api

# Pull latest changes (if using Git)
git pull

# Rebuild and restart
docker-compose -f docker-compose.simple.yml down
docker build -t wallet-analytics-api:latest .
docker-compose -f docker-compose.simple.yml up -d
```

### Check Resource Usage

```bash
# Check container stats
docker stats wallet-analytics-api

# Check disk usage
df -h

# Check memory usage
free -h

# Check server load
htop  # Press F10 to exit
```

### Automated Backups

**Database:** Your Neon PostgreSQL is automatically backed up!

**Application backups** (optional):

```bash
# Create backup directory
mkdir -p ~/backups

# Add to crontab for daily backups
crontab -e

# Add this line:
0 2 * * * docker exec wallet-analytics-api tar -czf /tmp/backup.tar.gz /app && docker cp wallet-analytics-api:/tmp/backup.tar.gz ~/backups/backup-$(date +\%Y\%m\%d).tar.gz
```

---

## 🔧 Troubleshooting

### Container Won't Start

```bash
# Check logs for errors
docker logs wallet-analytics-api

# Check if port 3000 is already in use
sudo lsof -i :3000

# Restart Docker service
sudo systemctl restart docker
```

### Out of Memory

```bash
# Check memory usage
free -h

# Upgrade to 2GB plan on Vultr
# Or add swap space:
sudo fallocate -l 2G /swapfile
sudo chmod 600 /swapfile
sudo mkswap /swapfile
sudo swapon /swapfile
echo '/swapfile none swap sw 0 0' | sudo tee -a /etc/fstab
```

### Can't Connect to API

```bash
# Check if container is running
docker ps

# Check if port 3000 is open
sudo ufw status

# Allow port 3000 if needed
sudo ufw allow 3000/tcp

# Test locally first
curl http://localhost:3000/health

# Check Nginx (if using)
sudo systemctl status nginx
sudo nginx -t
```

### SSL Certificate Issues

```bash
# Renew certificate manually
sudo certbot renew

# Test certificate renewal
sudo certbot renew --dry-run

# Auto-renewal is set up by default via cron
```

---

## 💰 Cost Breakdown

### Vultr Server Costs

| Plan | vCPU | RAM | Storage | Bandwidth | Monthly Cost |
|------|------|-----|---------|-----------|--------------|
| Starter | 1 | 1 GB | 25 GB | 1 TB | $6 |
| Recommended | 1 | 2 GB | 55 GB | 2 TB | $12 |
| Production | 2 | 4 GB | 80 GB | 3 TB | $24 |

### Additional Services (already set up)

- **Neon PostgreSQL:** Free tier (3 GiB storage)
- **Upstash Redis:** Free tier (10k commands/day)
- **Helius RPC:** Free tier (depends on usage)

**Total estimated cost:** $6-12/month (just the Vultr server!)

---

## 🚀 Performance Optimization

### 1. Enable Gzip Compression

**Edit Nginx config:**

```nginx
gzip on;
gzip_types application/json;
gzip_min_length 1000;
```

### 2. Add Response Caching

**In Nginx config:**

```nginx
proxy_cache_path /var/cache/nginx levels=1:2 keys_zone=api_cache:10m max_size=1g inactive=60m;

location / {
    proxy_cache api_cache;
    proxy_cache_valid 200 5m;
    add_header X-Cache-Status $upstream_cache_status;
    # ... rest of proxy settings
}
```

### 3. Monitor with Uptime Robot

- Sign up at https://uptimerobot.com (free)
- Add monitor for `https://api.yourdomain.com/health`
- Get alerts if API goes down

---

## 🔐 Security Checklist

- ✅ Firewall configured (UFW)
- ✅ SSH key authentication
- ✅ Non-root user in Docker container
- ✅ SSL/HTTPS enabled
- ✅ Environment variables secured
- ✅ Auto-updates enabled
- ⬜ Fail2ban (optional, blocks brute force)
- ⬜ Log monitoring (optional)

### Enable Auto-Updates

```bash
sudo apt-get install -y unattended-upgrades
sudo dpkg-reconfigure -plow unattended-upgrades
```

---

## 📞 Support

**Vultr Documentation:**
- Knowledge Base: https://www.vultr.com/docs/
- Status Page: https://status.vultr.com/

**Issues?**
- Check logs: `docker logs wallet-analytics-api`
- Check API health: `curl localhost:3000/health`
- Restart: `docker-compose -f docker-compose.simple.yml restart`

---

## 🎉 You're Live!

Your Wallet Analytics API is now running on Vultr with:
- ✅ Public IP access
- ✅ Automatic restarts
- ✅ Health monitoring
- ✅ Production-grade infrastructure

**Next Steps:**
1. Test all endpoints from Postman or curl
2. Update your frontend to use the new API URL
3. Monitor logs for the first 24 hours
4. Set up domain & SSL for production use
5. Configure monitoring & alerts

Happy deploying! 🚀
