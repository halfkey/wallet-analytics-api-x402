# Vultr Deployment - Quick Reference

## 🚀 Deploy in 3 Commands

```bash
# 1. Upload to server (from your local machine)
rsync -avz --exclude 'node_modules' --exclude 'dist' --exclude '.git' \
  . root@YOUR_SERVER_IP:~/wallet-analytics-api/
scp .env.production root@YOUR_SERVER_IP:~/wallet-analytics-api/

# 2. SSH into server
ssh root@YOUR_SERVER_IP

# 3. Run deployment
cd ~/wallet-analytics-api && bash scripts/deploy-vultr.sh
```

---

## 📋 Server Specs

**Recommended Vultr Plan:**
- **$6/month:** 1 vCPU, 1 GB RAM, 25 GB SSD (starter)
- **$12/month:** 1 vCPU, 2 GB RAM, 55 GB SSD (recommended)

**Image:** Ubuntu 24.04 LTS x64

---

## 🔧 Essential Commands

```bash
# View logs
docker logs -f wallet-analytics-api

# Restart API
cd ~/wallet-analytics-api
docker-compose -f docker-compose.simple.yml restart

# Stop API
docker-compose -f docker-compose.simple.yml down

# Start API
docker-compose -f docker-compose.simple.yml up -d

# Check status
docker ps
curl http://localhost:3000/health

# Update API
cd ~/wallet-analytics-api
git pull  # if using git
docker-compose -f docker-compose.simple.yml up -d --build
```

---

## 🌐 Access Your API

**Without domain:**
```bash
http://YOUR_SERVER_IP:3000
http://YOUR_SERVER_IP:3000/health
```

**With domain (after DNS + SSL setup):**
```bash
https://api.yourdomain.com
https://api.yourdomain.com/health
```

---

## 🔒 SSL Setup (5 minutes)

```bash
# Install Nginx & Certbot
sudo apt-get install -y nginx certbot python3-certbot-nginx

# Configure Nginx (see VULTR_DEPLOYMENT.md for full config)
sudo nano /etc/nginx/sites-available/wallet-analytics-api

# Enable site
sudo ln -s /etc/nginx/sites-available/wallet-analytics-api /etc/nginx/sites-enabled/
sudo nginx -t
sudo systemctl restart nginx

# Get SSL certificate
sudo certbot --nginx -d api.yourdomain.com
```

---

## 🆘 Troubleshooting

**Container not starting?**
```bash
docker logs wallet-analytics-api
docker-compose -f docker-compose.simple.yml restart
```

**Can't connect?**
```bash
# Check firewall
sudo ufw status
sudo ufw allow 3000/tcp

# Test locally
curl http://localhost:3000/health
```

**Out of memory?**
```bash
# Check usage
free -h
docker stats

# Add swap
sudo fallocate -l 2G /swapfile
sudo chmod 600 /swapfile
sudo mkswap /swapfile
sudo swapon /swapfile
```

---

## 📊 Monitoring

```bash
# Resource usage
docker stats wallet-analytics-api
htop

# Disk space
df -h

# Server load
uptime
```

---

## 💰 Monthly Cost

- Vultr VPS: $6-12/month
- Database (Neon): Free tier
- Redis (Upstash): Free tier
- **Total: $6-12/month**

---

## 📞 Quick Links

- **Full Guide:** [VULTR_DEPLOYMENT.md](VULTR_DEPLOYMENT.md)
- **Vultr Dashboard:** https://my.vultr.com/
- **Vultr Docs:** https://www.vultr.com/docs/
- **API Docs:** [docs/API.md](docs/API.md)

---

## ✅ Pre-Deployment Checklist

- [ ] Vultr account with credits
- [ ] SSH key added to Vultr
- [ ] `.env.production` file ready with all credentials
- [ ] Domain name (optional, for SSL)

---

## 🎯 After Deployment

1. ✅ Test health endpoint
2. ✅ Test API endpoints
3. ✅ Set up domain & SSL (optional)
4. ✅ Configure monitoring
5. ✅ Update frontend to use new API URL
