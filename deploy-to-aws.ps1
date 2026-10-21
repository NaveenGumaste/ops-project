# AWS Production 1-Click Deployment Script
$ErrorActionPreference = "Stop"

Write-Host "🔍 Reading Terraform outputs from Mumbai (ap-south-1)..." -ForegroundColor Cyan
Push-Location "$PSScriptRoot\terraform"
try {
    $EC2_IP = (terraform output -raw ec2_public_ip).Trim()
    $INSTANCE_ID = (terraform output -raw ec2_instance_id).Trim()
    $RDS_ENDPOINT_RAW = (terraform output -raw rds_endpoint).Trim()
    $DB_URL = (terraform output -raw database_url_template).Trim()
} finally {
    Pop-Location
}

# If the instance was restarted and has a new IP, fetch the active IP directly from AWS
$ACTIVE_IP = (aws ec2 describe-instances --instance-ids $INSTANCE_ID --region ap-south-1 --query "Reservations[0].Instances[0].PublicIpAddress" --output text).Trim()
if ($ACTIVE_IP -and $ACTIVE_IP -ne "None") {
    $EC2_IP = $ACTIVE_IP
}

$RDS_HOST = $RDS_ENDPOINT_RAW.Split(":")[0]
$REGION = "ap-south-1"
$SSH_KEY = "$HOME/.ssh/id_ed25519"
$SSH_PUB = "$HOME/.ssh/id_ed25519.pub"

Write-Host "🎯 Target EC2 Host: $EC2_IP ($INSTANCE_ID)" -ForegroundColor Green
Write-Host "🎯 Target RDS Host: $RDS_HOST" -ForegroundColor Green

Write-Host "📦 1. Packaging application source..." -ForegroundColor Cyan
tar --exclude='node_modules' --exclude='.next' --exclude='.git' --exclude='terraform' -czf app.tar.gz src public db nginx Dockerfile .dockerignore next.config.ts package.json package-lock.json tsconfig.json docker-compose.prod.yml

Write-Host "🔑 2. Authorizing SSH access via AWS Instance Connect (ap-south-1)..." -ForegroundColor Cyan
aws ec2-instance-connect send-ssh-public-key `
    --instance-id $INSTANCE_ID `
    --instance-os-user ubuntu `
    --ssh-public-key "file://$SSH_PUB" `
    --region $REGION | Out-Null

Write-Host "🚀 3. Uploading codebase to EC2 host ($EC2_IP)..." -ForegroundColor Cyan
scp -o StrictHostKeyChecking=no -i $SSH_KEY app.tar.gz ubuntu@${EC2_IP}:/home/ubuntu/

Write-Host "⚙️ 4. Ensuring swap space, seeding RDS, and launching containers..." -ForegroundColor Cyan
$remoteCommands = @"
set -e

# Ensure 2GB swapfile is enabled to avoid memory thrashing during builds
if [ ! -f /swapfile ]; then
    echo "💾 Creating 2GB swapfile..."
    sudo fallocate -l 2G /swapfile
    sudo chmod 600 /swapfile
    sudo mkswap /swapfile
    sudo swapon /swapfile
    echo '/swapfile none swap sw 0 0' | sudo tee -a /etc/fstab
fi

mkdir -p ~/app
tar -xzf ~/app.tar.gz -C ~/app
cd ~/app

# Write production environment
cat <<EOF > .env
DATABASE_URL=$DB_URL
PGSSLMODE=require
NODE_TLS_REJECT_UNAUTHORIZED=0
EOF

# Seed Amazon RDS PostgreSQL 17 using a one-off Docker container inside the VPC
echo "🌱 Seeding Amazon RDS PostgreSQL 17..."
docker run --rm -v `$(pwd)/db/init.sql:/init.sql postgres:17-alpine \
    psql "$DB_URL" -f /init.sql

# Launch the production 3-tier stack
echo "🚢 Starting Nginx & Next.js containers..."
docker compose -f docker-compose.prod.yml up -d --build
"@

# Re-authenticate SSH key before executing remote commands
aws ec2-instance-connect send-ssh-public-key `
    --instance-id $INSTANCE_ID `
    --instance-os-user ubuntu `
    --ssh-public-key "file://$SSH_PUB" `
    --region $REGION | Out-Null

ssh -o StrictHostKeyChecking=no -i $SSH_KEY ubuntu@${EC2_IP} $remoteCommands

Remove-Item app.tar.gz -ErrorAction SilentlyContinue

Write-Host ""
Write-Host "==========================================================" -ForegroundColor Green
Write-Host "🎉 PRODUCTION DEPLOYMENT TO MUMBAI (ap-south-1) COMPLETE!" -ForegroundColor Green
Write-Host "🌐 Visit your live application at: http://$EC2_IP" -ForegroundColor Yellow
Write-Host "==========================================================" -ForegroundColor Green
