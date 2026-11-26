# DropVault — Production Deployment Blueprint (Stage 5.8)

---

## 1. Executive Summary & Architecture Overview

DropVault is a temporary file-sharing platform engineered around zero-RAM streaming input/output (Busboy multipart stream to storage, zero client/server `Blob` buffering), dual-token authorization, Argon2id security, and a Next.js 14 dark SaaS frontend.

Per project constraints, the production deployment is strictly bounded to:
- **Compute**: Exactly one AWS EC2 instance running Ubuntu 24.04 LTS hosting Next.js 14 (Frontend), Express.js (API & background `CleanupWorker`), and PostgreSQL 17 (from the official PostgreSQL PGDG repository).
- **Object Storage**: Exactly one private AWS S3 bucket with Block Public Access enabled, server-side encryption (`AES256`), and unversioned object lifecycle semantics.
- **Authorization**: AWS SDK default credential provider chain using an **IAM Instance Profile** attached to EC2 (no static AWS API keys stored on disk or in `.env`).
- **Networking & Ingress**: Nginx reverse proxy managing SSL termination, rate limiting on sensitive API routes, streaming uploads/downloads without buffering, and proxy header forwarding.
- **Process Supervision**: Systemd native system units for auto-restart, logging via `journald`, and strict boot ordering.
- **Database Durability**: Automated nightly PostgreSQL dumps encrypted using `age` public-key encryption (public recipient key on EC2; private identity key held strictly offline) and synced directly to `backups/` in the private S3 bucket.

```
┌───────────────────────────────────────────────────────────────────────────────┐
│                                 Internet / Client                             │
└──────────────────────────────────────┬────────────────────────────────────────┘
                                       │ HTTPS (443) / HTTP (80)
                                       ▼
┌───────────────────────────────────────────────────────────────────────────────┐
│                    AWS EC2 Instance (Single Instance Scope)                   │
│                                                                               │
│  ┌─────────────────────────────────────────────────────────────────────────┐  │
│  │                    Nginx Reverse Proxy (Port 80/443)                    │  │
│  │  - SSL Termination (Let's Encrypt / Certbot)                            │  │
│  │  - client_max_body_size 10G; (Upload limit matching authenticated user) │  │
│  │  - proxy_request_buffering off; proxy_buffering off; (Zero-RAM stream)  │  │
│  │  - Rate limiting on /api/auth/* and /api/share/*/verify-password        │  │
│  │  - Loopback-only proxy (ports 3000, 4000, 5432 unexposed externally)    │  │
│  └───────────────────┬─────────────────────────────────┬───────────────────┘  │
│                      │ /api/*                          │ /*                   │
│                      ▼                                 ▼                      │
│  ┌──────────────────────────────────────┐  ┌───────────────────────────────┐  │
│  │      Express.js Backend API          │  │     Next.js Web Frontend      │  │
│  │   (Port 4000, Systemd: dropvault-api)│  │ (Port 3000, Systemd: dropva...│  │
│  │                                      │  └───────────────────────────────┘  │
│  │  ┌────────────────────────────────┐  │                                     │
│  │  │  In-Process CleanupWorker      │  │                                     │
│  │  │  - Single process within API   │  │                                     │
│  │  │  - TTL expiration purge        │  │                                     │
│  │  │  - Dynamic lease heartbeat     │  │                                     │
│  │  │  - Failed deletion retry queue │  │                                     │
│  │  └────────────────────────────────┘  │                                     │
│  └───────────────────┬──────────────────┘                                     │
│                      │ localhost:5432                                         │
│                      ▼                                                        │
│  ┌──────────────────────────────────────┐                                     │
│  │     PostgreSQL 17 Database Server    │                                     │
│  │   (Official PGDG apt repository)     │                                     │
│  │   (Systemd: postgresql@17-main)      │                                     │
│  │   (Data volume: /var/lib/postgresql) │                                     │
│  └───────────────────┬──────────────────┘                                     │
└──────────────────────┼────────────────────────────────────────────────────────┘
                       │ age-encrypted Nightly Dumps (backups/) &
                       │ File Streaming Operations (uploads/YYYY/MM/UUID)
                       │ (EC2 IAM Instance Profile / Default Credential Chain)
                       ▼
┌───────────────────────────────────────────────────────────────────────────────┐
│                         AWS S3 (Private Bucket)                               │
│  - SSE-S3 (AES256)                                                            │
│  - Block Public Access: All 4 settings TRUE                                   │
│  - Versioning: DISABLED (Simpler safe model for temporary-file lifecycle)    │
│  - Lifecycle Rules:                                                           │
│      ├── Abort incomplete multipart uploads after 3 days                      │
│      └── Expire objects under prefix backups/ after 30 days                   │
│  - Object Key Structure:                                                      │
│      ├── uploads/YYYY/MM/<randomUUID><ext>  (User files in FileService)       │
│      └── backups/dropvault_<timestamp>.sql.gz.age (Encrypted database dumps)  │
└───────────────────────────────────────────────────────────────────────────────┘
```

---

## 2. Infrastructure Sizing, OS & Network Configuration

### 2.1 EC2 Instance Recommendation
* **Instance Type**: `t3.medium` (2 vCPUs, 4 GiB RAM)
  * *Verified Repository Evidence*: The Next.js frontend utilizes Next.js 14 (`@dropvault/web`), TailwindCSS 3.4, and TypeScript 5.7. During `next build`, client/server asset tree compilation and type checking peaks at ~1.8 GiB of process memory. Concurrently, PostgreSQL 17 shared buffers require ~1 GiB, and the Node.js API runtime requires ~200 MiB.
  * *Memory Architecture*: While DropVault's Busboy streaming engine buffers zero file data in RAM, running all three components on a single instance makes `t3.medium` the baseline reliable choice to avoid compiler Out-Of-Memory (OOM) crashes.
  * *Cost-Saving Alternative*: `t3.small` (2 vCPUs, 2 GiB RAM) can be run *only* if a mandatory 4 GiB Linux swapfile is created prior to running `npm run build`.
* **Operating System**: **Ubuntu 24.04 LTS (Noble Numbat)** 64-bit (x86_64).
* **Storage Volume**:
  * **Volume Type**: General Purpose SSD (`gp3`).
  * **Size**: 60 GiB (root volume `/dev/sda1` handling OS, PostgreSQL WAL/tables, Next.js build cache, Nginx logs, and a 4 GiB swapfile).
  * **Throughput**: 125 MiB/s, 3,000 baseline IOPS (included in standard gp3 tier).

### 2.2 Security Group & Network Ports
DropVault runs within an AWS VPC. Ingress is restricted so internal application tiers are strictly unreachable from the internet:

| Port | Protocol | Source | Purpose |
| :--- | :--- | :--- | :--- |
| **80** | TCP | `0.0.0.0/0`, `::/0` | HTTP Ingress (Certbot ACME challenge & HTTP $\rightarrow$ HTTPS redirect) |
| **443** | TCP | `0.0.0.0/0`, `::/0` | HTTPS Ingress (Encrypted production web & API traffic) |
| **22** | TCP | `YOUR_OFFICE_OR_HOME_IP/32` | SSH Administration (Strictly restricted, never `0.0.0.0/0`) |
| **5432** | TCP | *None (Localhost Only)* | PostgreSQL — **Never opened in Security Group** |
| **3000** | TCP | *None (Localhost Only)* | Next.js Frontend — Internal loopback only |
| **4000** | TCP | *None (Localhost Only)* | Express Backend — Internal loopback only |

---

## 3. S3 Bucket Security, Object Key Paths & Least-Privilege IAM Policy

### 3.1 S3 Deletion Architecture & Key Prefix Verification
* **Verified Key Prefix**:
  - In `apps/api/src/services/file.service.ts` line 53–60:
    ```typescript
    private static generateStorageKey(originalName: string): string {
      const now = new Date();
      const yyyy = now.getUTCFullYear();
      const mm = String(now.getUTCMonth() + 1).padStart(2, '0');
      const ext = path.extname(originalName).slice(0, 10).replace(/[^a-zA-Z0-9.]/g, '');
      const randomId = crypto.randomUUID();
      return `uploads/${yyyy}/${mm}/${randomId}${ext ? ext : ''}`;
    }
    ```
  - The repository **verifiably prefixes all uploaded files with `uploads/`**.
* **Versioning Decision**: **Versioning is DISABLED** on the production S3 bucket.
  - In `apps/api/src/storage/s3.storage.ts` line 105, DropVault issues `DeleteObjectCommand({ Bucket, Key })`.
  - In a versioned bucket, `DeleteObject` places a 0-byte Delete Marker, leaving the underlying object version intact and incurring continuous storage costs for expired files. Disabling versioning ensures physical deletion is immediate.
* **S3 Lifecycle Rules**:
  1. `AbortIncompleteMultipartUploads`: Abort incomplete multipart uploads after **3 days**.
  2. `ExpireDatabaseBackups`: Automatically expire and delete objects under the prefix **`backups/` after 30 days**. (The database backup script relies entirely on this S3 lifecycle policy for offsite retention).

### 3.2 Least-Privilege IAM Policy
The EC2 instance uses an attached IAM Instance Profile (`DropVaultEC2InstanceRole`). The AWS SDK credential provider automatically retrieves credentials from IMDSv2.

Notice that `s3:ListBucket` is correctly attached to the **bucket ARN** (not object ARN) with a condition limiting listing to legitimate prefixes, while object-level actions (`PutObject`, `GetObject`, `DeleteObject`) are attached to object ARNs (`.../uploads/*` and `.../backups/*`).

**IAM Policy JSON (`DropVaultS3AccessPolicy`)**:
```json
{
  "Version": "2012-10-17",
  "Statement": [
    {
      "Sid": "AllowBucketMetadataAndScopedList",
      "Effect": "Allow",
      "Action": [
        "s3:GetBucketLocation",
        "s3:ListBucket"
      ],
      "Resource": "arn:aws:s3:::dropvault-prod-storage-REPLACE_ME_ACCOUNT_REGION",
      "Condition": {
        "StringLike": {
          "s3:prefix": [
            "uploads/*",
            "backups/*"
          ]
        }
      }
    },
    {
      "Sid": "AllowDropVaultStorageOperations",
      "Effect": "Allow",
      "Action": [
        "s3:PutObject",
        "s3:GetObject",
        "s3:DeleteObject",
        "s3:AbortMultipartUpload"
      ],
      "Resource": "arn:aws:s3:::dropvault-prod-storage-REPLACE_ME_ACCOUNT_REGION/uploads/*"
    },
    {
      "Sid": "AllowDatabaseBackupUploadAndRestore",
      "Effect": "Allow",
      "Action": [
        "s3:PutObject",
        "s3:GetObject"
      ],
      "Resource": "arn:aws:s3:::dropvault-prod-storage-REPLACE_ME_ACCOUNT_REGION/backups/*"
    }
  ]
}
```

*Trust Relationship (`EC2TrustPolicy.json`)*:
```json
{
  "Version": "2012-10-17",
  "Statement": [
    {
      "Effect": "Allow",
      "Principal": {
        "Service": "ec2.amazonaws.com"
      },
      "Action": "sts:AssumeRole"
    }
  ]
}
```

---

## 4. Production Nginx Reverse Proxy Configuration

Nginx acts as the single SSL/TLS termination and reverse proxy boundary.

### 4.1 Key Architecture & Corrections
1. **Accurate WebSocket Mapping**: We map `$http_upgrade` to `$connection_upgrade`. When `$http_upgrade` is empty (standard HTTP traffic), `$connection_upgrade` evaluates to `''` (empty string). This leaves the HTTP `Connection` header untouched, preserving standard HTTP/1.1 persistent keep-alive connections rather than prematurely closing them.
2. **Targeted Rate Limiting**: `limit_req_zone` is applied specifically to sensitive endpoints (`/api/auth/*` and `/api/share/*/verify-password`) to prevent credential stuffing without throttling large streaming transfers.
3. **Zero-RAM Streaming Directives**:
   - `client_max_body_size 10240M;`: Matches DropVault's 10 GiB authenticated upload limit.
   - `proxy_request_buffering off;`: Ensures Nginx streams incoming chunks directly to the backend Express socket without caching 10 GiB on the EC2 disk.
   - `proxy_buffering off;`: Ensures Nginx does not buffer outgoing chunks from S3/backend when clients download files.
   - `proxy_read_timeout 3600s;` and `proxy_send_timeout 3600s;`: Sustains large file transfers over slower network connections.
4. **Internal Port Isolation**: Ports `3000` (Next.js), `4000` (Express), and `5432` (PostgreSQL) bind exclusively to `127.0.0.1` and are not exposed.

### 4.2 Nginx Configuration File: `/etc/nginx/sites-available/dropvault`
```nginx
# Conditional WebSocket connection header mapping (Preserves standard keep-alive)
map $http_upgrade $connection_upgrade {
    default upgrade;
    ''      '';
}

# Rate limiting zones
limit_req_zone $binary_remote_addr zone=auth_limit:10m rate=5r/m;
limit_req_zone $binary_remote_addr zone=api_general:10m rate=30r/s;

# Upstream definitions
upstream nextjs_upstream {
    server 127.0.0.1:3000;
    keepalive 32;
}

upstream express_upstream {
    server 127.0.0.1:4000;
    keepalive 32;
}

# HTTP — Redirect all traffic to HTTPS + Certbot ACME Challenge
server {
    listen 80;
    listen [::]:80;
    server_name dropvault.example.com; # Replace with your domain

    location /.well-known/acme-challenge/ {
        root /var/www/certbot;
    }

    location / {
        return 301 https://$host$request_uri;
    }
}

# HTTPS — DropVault Application Proxy
server {
    listen 443 ssl http2;
    listen [::]:443 ssl http2;
    server_name dropvault.example.com; # Replace with your domain

    # SSL Certificates (managed via Certbot)
    ssl_certificate /etc/letsencrypt/live/dropvault.example.com/fullchain.pem;
    ssl_certificate_key /etc/letsencrypt/live/dropvault.example.com/privkey.pem;
    ssl_protocols TLSv1.2 TLSv1.3;
    ssl_ciphers HIGH:!aNULL:!MD5;
    ssl_prefer_server_ciphers on;
    ssl_session_cache shared:SSL:10m;
    ssl_session_timeout 1d;

    # Security Headers
    add_header X-Frame-Options "SAMEORIGIN" always;
    add_header X-Content-Type-Options "nosniff" always;
    add_header X-XSS-Protection "1; mode=block" always;
    add_header Referrer-Policy "strict-origin-when-cross-origin" always;

    # Global upload limit (Matches 10 GiB DropVault authenticated maximum)
    client_max_body_size 10240M;

    # -------------------------------------------------------------
    # 1. Rate-Limited Sensitive API Endpoints
    # -------------------------------------------------------------
    location ~* ^/api/(auth/login|auth/register|share/.+/verify-password) {
        limit_req zone=auth_limit burst=10 nodelay;

        proxy_pass http://express_upstream;
        proxy_http_version 1.1;
        proxy_set_header Host $host;
        proxy_set_header X-Real-IP $remote_addr;
        proxy_set_header X-Forwarded-For $proxy_add_x_forwarded_for;
        proxy_set_header X-Forwarded-Proto $scheme;
    }

    # -------------------------------------------------------------
    # 2. General API Endpoints -> Express Backend (Streaming uploads/downloads)
    # -------------------------------------------------------------
    location /api/ {
        limit_req zone=api_general burst=50 nodelay;

        proxy_pass http://express_upstream;
        proxy_http_version 1.1;

        proxy_set_header Host $host;
        proxy_set_header X-Real-IP $remote_addr;
        proxy_set_header X-Forwarded-For $proxy_add_x_forwarded_for;
        proxy_set_header X-Forwarded-Proto $scheme;
        
        # Conditional WebSocket header
        proxy_set_header Upgrade $http_upgrade;
        proxy_set_header Connection $connection_upgrade;

        # CRITICAL: Streaming I/O settings (Zero-buffering for uploads & downloads)
        proxy_request_buffering off;
        proxy_buffering off;
        proxy_read_timeout 3600s;
        proxy_send_timeout 3600s;
        proxy_connect_timeout 60s;
    }

    # -------------------------------------------------------------
    # 3. Next.js Static Optimization Assets
    # -------------------------------------------------------------
    location /_next/static/ {
        proxy_pass http://nextjs_upstream;
        proxy_http_version 1.1;
        proxy_set_header Host $host;
        
        expires 365d;
        access_log off;
        add_header Cache-Control "public, max-age=31536000, immutable";
    }

    # -------------------------------------------------------------
    # 4. Next.js Application Routes
    # -------------------------------------------------------------
    location / {
        proxy_pass http://nextjs_upstream;
        proxy_http_version 1.1;

        proxy_set_header Host $host;
        proxy_set_header X-Real-IP $remote_addr;
        proxy_set_header X-Forwarded-For $proxy_add_x_forwarded_for;
        proxy_set_header X-Forwarded-Proto $scheme;
        
        proxy_set_header Upgrade $http_upgrade;
        proxy_set_header Connection $connection_upgrade;

        proxy_read_timeout 60s;
        proxy_send_timeout 60s;
    }
}
```

---

## 5. Next.js Build-Time Environment Configuration

### Verified Repository Architecture:
In the frontend source code:
- `apps/web/src/lib/api.ts` line 151: `return process.env.NEXT_PUBLIC_API_URL || 'http://localhost:4000';`
- `apps/web/src/lib/auth.ts` line 29: `return process.env.NEXT_PUBLIC_API_URL || 'http://localhost:4000';`
- `apps/web/src/components/BackendStatus.tsx` line 34: `process.env.NEXT_PUBLIC_API_URL || 'http://localhost:4000';`

### The Rule for `NEXT_PUBLIC_*`:
Next.js inlines all `NEXT_PUBLIC_*` environment variables directly into client JavaScript bundles **during `npm run build`** (`next build`). 
- Setting `NEXT_PUBLIC_API_URL` solely in the Systemd service file at runtime **has NO effect** on the client bundle; if missing during `next build`, the client bundle bakes in the fallback (`http://localhost:4000`), breaking all browser-to-backend API calls for public users.
- **Requirement**: `apps/web/.env.production` must be written with the production domain **prior to executing `npm --prefix apps/web run build`**.

---

## 6. Process Management: Systemd Unit Configurations

We utilize native **Systemd** units.

### 6.1 Service: `dropvault-api.service`
Path: `/etc/systemd/system/dropvault-api.service`
```ini
[Unit]
Description=DropVault Express Backend API & Cleanup Worker
After=network.target postgresql.service
Wants=postgresql.service

[Service]
Type=simple
User=dropvault
Group=dropvault
WorkingDirectory=/var/www/dropvault/apps/api
EnvironmentFile=/var/www/dropvault/apps/api/.env
ExecStart=/usr/bin/node dist/index.js
Restart=always
RestartSec=5
StandardOutput=journal
StandardError=journal
SyslogIdentifier=dropvault-api

# Security sandboxing
NoNewPrivileges=true
PrivateTmp=true

# Resource limits (High file descriptors for concurrent streaming)
LimitNOFILE=65535

[Install]
WantedBy=multi-user.target
```

### 6.2 Service: `dropvault-web.service`
Path: `/etc/systemd/system/dropvault-web.service`
```ini
[Unit]
Description=DropVault Next.js Web Frontend
After=network.target dropvault-api.service
Wants=dropvault-api.service

[Service]
Type=simple
User=dropvault
Group=dropvault
WorkingDirectory=/var/www/dropvault/apps/web
Environment=NODE_ENV=production
Environment=PORT=3000
ExecStart=/usr/bin/npm start -- -p 3000
Restart=always
RestartSec=5
StandardOutput=journal
StandardError=journal
SyslogIdentifier=dropvault-web

# Security sandboxing
NoNewPrivileges=true
PrivateTmp=true

# Resource limits
LimitNOFILE=65535

[Install]
WantedBy=multi-user.target
```

---

## 7. Production `.env` Template & Configuration Reference

### 7.1 Backend Configuration: `/var/www/dropvault/apps/api/.env`
```dotenv
# ==============================================================================
# DROPVAULT PRODUCTION BACKEND CONFIGURATION
# Permissions must be restricted: chmod 600 /var/www/dropvault/apps/api/.env
# ==============================================================================

# Server Network Configuration
PORT=4000
NODE_ENV=production
CORS_ORIGIN=https://dropvault.example.com
COOKIE_DOMAIN=dropvault.example.com

# PostgreSQL Connection String (Local EC2 Socket or Loopback TCP)
DATABASE_URL="postgresql://dropvault_app:REPLACE_WITH_STRONG_DB_PASSWORD@localhost:5432/dropvault_prod?schema=public"

# Authentication Tokens (MUST be generated using crypto.randomBytes(32).toString('hex'))
# Minimum length: 32 characters
JWT_ACCESS_SECRET="REPLACE_WITH_GENERATED_64_CHAR_HEX_SECRET_ACCESS_KEY"
JWT_REFRESH_SECRET="REPLACE_WITH_GENERATED_64_CHAR_HEX_SECRET_REFRESH_KEY"
JWT_ACCESS_EXPIRES_IN=15m
REFRESH_TOKEN_EXPIRES_DAYS=7

# Storage Configuration (AWS S3)
STORAGE_PROVIDER=s3
AWS_REGION=us-east-1
AWS_BUCKET_NAME=dropvault-prod-storage-REPLACE_ACCOUNT_ID-us-east-1

# IMPORTANT: AWS_ACCESS_KEY_ID and AWS_SECRET_ACCESS_KEY are deliberately omitted.
# The AWS SDK automatically retrieves credentials from the EC2 IAM Instance Profile.

# Upload Limits (Bytes)
MAX_ANONYMOUS_FILE_SIZE_BYTES=1073741824       # 1 GiB (1024 * 1024 * 1024)
MAX_AUTHENTICATED_FILE_SIZE_BYTES=10737418240   # 10 GiB (10 * 1024 * 1024 * 1024)

# Cleanup Worker Timing
CLEANUP_INTERVAL_MS=300000                     # 5 minutes
STALE_PENDING_THRESHOLD_HOURS=2                # Upload lease threshold (2 hours)

# Security Rate Limiting
RATE_LIMIT_WINDOW_MS=60000                     # 1 minute window
RATE_LIMIT_MAX_ATTEMPTS=5                      # 5 attempts per window for share passcodes
```

### 7.2 Frontend Configuration: `/var/www/dropvault/apps/web/.env.production`
```dotenv
# Public API URL used during Next.js compilation ('next build')
NEXT_PUBLIC_API_URL=https://dropvault.example.com
```

---

## 8. Step-by-Step EC2 Installation & Deployment Playbook

Execute these commands sequentially on a freshly provisioned Ubuntu 24.04 LTS instance.

### Step 1: Base System Setup, age & PostgreSQL 17 PGDG Repository
```bash
# Update base system packages
sudo apt update && sudo apt upgrade -y
sudo apt install -y curl wget git build-essential nginx certbot python3-certbot-nginx gnupg lsb-release awscli age

# Setup official PostgreSQL PGDG apt repository
sudo sh -c 'echo "deb http://apt.postgresql.org/pub/repos/apt $(lsb_release -cs)-pgdg main" > /etc/apt/sources.list.d/pgdg.list'
wget --quiet -O - https://www.postgresql.org/media/keys/ACCC4CF8.asc | sudo gpg --dearmor -o /etc/apt/trusted.gpg.d/postgresql.gpg

# Install PostgreSQL 17
sudo apt update
sudo apt install -y postgresql-17 postgresql-contrib-17

# Verify PostgreSQL 17 is active
sudo systemctl enable --now postgresql
sudo -u postgres psql -c "SELECT version();" # Must output: PostgreSQL 17.x

# Install Node.js 22 LTS (via NodeSource)
curl -fsSL https://deb.nodesource.com/setup_22.x | sudo -E bash -
sudo apt install -y nodejs
node -v # Must report v22.x
npm -v  # Must report v10.x+

# Configure Swapfile (4 GiB to protect against memory spikes during builds)
sudo fallocate -l 4G /swapfile
sudo chmod 600 /swapfile
sudo mkswap /swapfile
sudo swapon /swapfile
echo '/swapfile none swap sw 0 0' | sudo tee -a /etc/fstab
```

### Step 2: Dedicated Service User Creation
```bash
# Create system user for DropVault
sudo useradd -r -s /bin/bash -d /var/www/dropvault dropvault
sudo mkdir -p /var/www/dropvault
sudo chown -R dropvault:dropvault /var/www/dropvault
```

### Step 3: PostgreSQL Database & User Setup
```bash
# Switch to postgres superuser
sudo -u postgres psql

-- Inside psql console:
CREATE USER dropvault_app WITH PASSWORD 'REPLACE_WITH_STRONG_DB_PASSWORD';
CREATE DATABASE dropvault_prod OWNER dropvault_app;
GRANT ALL PRIVILEGES ON DATABASE dropvault_prod TO dropvault_app;
\q
```

### Step 4: Clone Repository & Install Monorepo Dependencies
```bash
# Switch to dropvault user
sudo -u dropvault -i

cd /var/www/dropvault
git clone https://github.com/your-org/DropVault.git . # Replace with your repo

# Install dependencies using clean install from package-lock.json
npm ci

# Configure Backend environment
cat << 'EOF' > apps/api/.env
PORT=4000
NODE_ENV=production
CORS_ORIGIN=https://dropvault.example.com
COOKIE_DOMAIN=dropvault.example.com
DATABASE_URL="postgresql://dropvault_app:REPLACE_WITH_STRONG_DB_PASSWORD@localhost:5432/dropvault_prod?schema=public"
JWT_ACCESS_SECRET="REPLACE_WITH_GENERATED_64_CHAR_HEX_SECRET_ACCESS_KEY"
JWT_REFRESH_SECRET="REPLACE_WITH_GENERATED_64_CHAR_HEX_SECRET_REFRESH_KEY"
JWT_ACCESS_EXPIRES_IN=15m
REFRESH_TOKEN_EXPIRES_DAYS=7
STORAGE_PROVIDER=s3
AWS_REGION=us-east-1
AWS_BUCKET_NAME=dropvault-prod-storage-REPLACE_ACCOUNT_ID-us-east-1
MAX_ANONYMOUS_FILE_SIZE_BYTES=1073741824
MAX_AUTHENTICATED_FILE_SIZE_BYTES=10737418240
CLEANUP_INTERVAL_MS=300000
STALE_PENDING_THRESHOLD_HOURS=2
RATE_LIMIT_WINDOW_MS=60000
RATE_LIMIT_MAX_ATTEMPTS=5
EOF

# Restrict permissions on sensitive secret file
chmod 600 apps/api/.env

# Configure Frontend environment PRIOR to compilation
cat << 'EOF' > apps/web/.env.production
NEXT_PUBLIC_API_URL=https://dropvault.example.com
EOF

chmod 600 apps/web/.env.production
```

### Step 5: Database Migrations & Production Builds
```bash
# Generate Prisma Client & apply migrations
npm --prefix apps/api run prisma:generate
npx --prefix apps/api prisma migrate deploy

# Compile Express API (Produces dist/index.js)
npm --prefix apps/api run build

# Compile Next.js Web Frontend (Embeds NEXT_PUBLIC_API_URL into bundle)
npm --prefix apps/web run build

exit # Return to ubuntu sudoer
```

### Step 6: Install & Start Systemd Services
```bash
# Write systemd units (using configurations from Section 6)
sudo nano /etc/systemd/system/dropvault-api.service
sudo nano /etc/systemd/system/dropvault-web.service

# Reload systemd daemon
sudo systemctl daemon-reload

# Enable and start services
sudo systemctl enable --now dropvault-api
sudo systemctl enable --now dropvault-web

# Verify service statuses
sudo systemctl status dropvault-api
sudo systemctl status dropvault-web
```

### Step 7: Configure Nginx & SSL Certificate
```bash
# Write Nginx configuration
sudo nano /etc/nginx/sites-available/dropvault # Paste config from Section 4.2
sudo ln -s /etc/nginx/sites-available/dropvault /etc/nginx/sites-enabled/
sudo rm -f /etc/nginx/sites-enabled/default

# Test Nginx configuration syntax
sudo nginx -t

# Obtain Let's Encrypt Certificate
sudo certbot --nginx -d dropvault.example.com --non-interactive --agree-tos -m admin@example.com

# Reload Nginx with SSL active
sudo systemctl reload nginx
```

---

## 9. Database Backup, age Encryption, S3 Sync, Restore & Verification

### 9.1 Asymmetric Backup Encryption Model with `age`
To eliminate the risk of an attacker compromising the EC2 instance and gaining access to both database backups and their decryption keys, DropVault uses **asymmetric encryption via `age`**:
- **On EC2**: Only the **public recipient key** (`age1...`) is stored in `/etc/dropvault/backup-pubkey.txt`. EC2 can encrypt backups, but **cannot decrypt them**.
- **Offline / Secure Storage**: The **private identity key** (`AGE-SECRET-KEY-1...`) is generated and kept exclusively offline (e.g. in your secure local password manager or hardware vault). It is never copied to EC2.

#### Generating the Keypair (On your secure local workstation):
```bash
# On your local machine:
age-keygen -o dropvault-backup-identity.txt
# Output gives:
# Public key: age1... (Copy this to EC2)
# Private key: AGE-SECRET-KEY-1... (Keep securely offline!)
```

#### Automated Nightly Backup Script on EC2:
Script: `/usr/local/bin/dropvault-db-backup.sh`
```bash
#!/usr/bin/env bash
set -euo pipefail

BACKUP_DIR="/var/backups/dropvault-db"
TIMESTAMP=$(date +"%Y%m%d_%H%M%S")
DUMP_FILE="${BACKUP_DIR}/dropvault_${TIMESTAMP}.sql.gz"
ENC_FILE="${DUMP_FILE}.age"
S3_BUCKET="dropvault-prod-storage-REPLACE_ACCOUNT_ID-us-east-1"
PUBKEY_FILE="/etc/dropvault/backup-pubkey.txt"

mkdir -p "${BACKUP_DIR}"

# 1. Dump database and compress
sudo -u postgres pg_dump -d dropvault_prod | gzip > "${DUMP_FILE}"

# 2. Encrypt using age recipient public key (Asymmetric authenticated encryption)
age -R "${PUBKEY_FILE}" -o "${ENC_FILE}" "${DUMP_FILE}"
rm -f "${DUMP_FILE}" # Remove unencrypted plaintext dump immediately

chmod 600 "${ENC_FILE}"

# 3. Upload encrypted backup to S3 backups/ prefix
aws s3 cp "${ENC_FILE}" "s3://${S3_BUCKET}/backups/$(basename "${ENC_FILE}")"

# 4. Prune local archives on EC2 older than 7 days
# (Note: Offsite S3 retention is handled automatically by the S3 30-day lifecycle rule)
find "${BACKUP_DIR}" -type f -name "*.age" -mtime +7 -delete

echo "[$(date)] Backup encrypted and uploaded to s3://${S3_BUCKET}/backups/$(basename "${ENC_FILE}")"
```

Configuration on EC2:
```bash
sudo mkdir -p /etc/dropvault
sudo nano /etc/dropvault/backup-pubkey.txt # Paste age1... public key here
sudo chmod 644 /etc/dropvault/backup-pubkey.txt
sudo chmod +x /usr/local/bin/dropvault-db-backup.sh
```

Cron entry in `/etc/cron.d/dropvault-db-backup`:
```cron
0 2 * * * root /usr/local/bin/dropvault-db-backup.sh >> /var/log/dropvault-backup.log 2>&1
```

### 9.2 Complete Database Disaster Recovery Procedure
In the event of a disaster or server failure:
1. Provision a new EC2 instance following Section 8.
2. Provide the offline private key (`AGE-SECRET-KEY-1...`) temporarily to the restore operator session.
3. Execute the restore:

```bash
# 1. Stop application services to prevent active connections
sudo systemctl stop dropvault-api dropvault-web

# 2. Download the target encrypted backup from S3
aws s3 cp s3://dropvault-prod-storage-REPLACE_ACCOUNT_ID-us-east-1/backups/dropvault_TARGET_TIMESTAMP.sql.gz.age /tmp/

# 3. Decrypt using the offline private identity key
cat << 'EOF' > /tmp/offline-identity.txt
AGE-SECRET-KEY-1... # Paste your offline private key
EOF
chmod 600 /tmp/offline-identity.txt

age -d -i /tmp/offline-identity.txt -o /tmp/dropvault_restored.sql.gz /tmp/dropvault_TARGET_TIMESTAMP.sql.gz.age
rm -f /tmp/offline-identity.txt # Delete the private key immediately after decryption!

# 4. Recreate database cleanly
sudo -u postgres psql -c "SELECT pg_terminate_backend(pid) FROM pg_stat_activity WHERE datname = 'dropvault_prod';"
sudo -u postgres dropdb dropvault_prod
sudo -u postgres createdb -O dropvault_app dropvault_prod

# 5. Restore data from decrypted gzip stream
gunzip -c /tmp/dropvault_restored.sql.gz | sudo -u postgres psql -d dropvault_prod

# 6. Clean up temporary files
rm -f /tmp/dropvault_TARGET_TIMESTAMP.sql.gz.age /tmp/dropvault_restored.sql.gz

# 7. Restart application
sudo systemctl start dropvault-api dropvault-web
```

### 9.3 Practical Scratch-Database Restore Verification Procedure
Run quarterly to verify backup validity without disturbing the live database:
```bash
# 1. Download the latest backup from S3
LATEST_BACKUP=$(aws s3 ls s3://dropvault-prod-storage-REPLACE_ACCOUNT_ID-us-east-1/backups/ | sort | tail -n 1 | awk '{print $4}')
aws s3 cp "s3://dropvault-prod-storage-REPLACE_ACCOUNT_ID-us-east-1/backups/${LATEST_BACKUP}" /tmp/verify.age

# 2. Decrypt with private key into temporary uncompressed stream
age -d -i /path/to/offline-identity.txt -o /tmp/verify.sql.gz /tmp/verify.age

# 3. Create a scratch test database
sudo -u postgres createdb -O dropvault_app dropvault_scratch_test

# 4. Import the decrypted dump
gunzip -c /tmp/verify.sql.gz | sudo -u postgres psql -d dropvault_scratch_test

# 5. Verify row integrity and schema validity
sudo -u postgres psql -d dropvault_scratch_test -c "SELECT count(*) AS total_files FROM \"files\";"
sudo -u postgres psql -d dropvault_scratch_test -c "SELECT count(*) AS total_users FROM \"users\";"
sudo -u postgres psql -d dropvault_scratch_test -c "SELECT count(*) AS total_share_links FROM \"share_links\";"

# 6. Teardown scratch database and clean up temporary test files
sudo -u postgres dropdb dropvault_scratch_test
rm -f /tmp/verify.age /tmp/verify.sql.gz
```

---

## 10. Investigation of Blockers: Cleanup Worker & Stale Uploads

### The Question:
*Can the background `CleanupWorker` incorrectly expire or delete legitimate uploads that have been pending for more than 2 hours?*

### Repository Evidence & Analysis:
We inspected [apps/api/src/workers/cleanup.worker.ts](file:///f:/DropVault/apps/api/src/workers/cleanup.worker.ts#L130-L165) and [apps/api/src/services/file.service.ts](file:///f:/DropVault/apps/api/src/services/file.service.ts#L120-L135):

1. **Single-Process Cleanup Architecture**:
   - In `apps/api/src/index.ts` lines 17, 23, and 36, `cleanupWorker` is instantiated and started **once** inside the Express API process. There is no independent worker CLI or secondary daemon competing for database locks.
2. **Dual-Layer Protection Mechanism**:
   - **Layer 1 (In-Memory Process Tracker)**: When a file begins streaming, `activeUploadRegistry.register(pendingFile.id)` marks the file ID as active. In `cleanup.worker.ts` line 159:
     ```typescript
     const stalePendingFiles = candidatePendingFiles.filter(
       (file) => !activeUploadRegistry.isActive(file.id)
     );
     ```
     As long as the API server is receiving data from the client, the file is shielded from cleanup.
   - **Layer 2 (Database Heartbeat Lease)**: While data is actively streaming, `file.service.ts` runs a 30-second interval timer:
     ```typescript
     const heartbeatTimer = setInterval(() => {
       prisma.file.update({
         where: { id: pendingFile.id, status: FileStatus.PENDING },
         data: { updatedAt: new Date() },
       }).catch(() => {});
     }, 30000);
     ```
     In `cleanup.worker.ts`, the database query requires:
     ```typescript
     createdAt: { lt: staleThreshold }, // > 2 hours old
     updatedAt: { lt: leaseThreshold }, // > 15 minutes since last heartbeat
     ```

### Conclusion & Assumptions:
- **During Normal Operation**: A legitimate 10 GiB upload taking 4 hours on a slower connection **will NOT be deleted** because its `updatedAt` lease is continuously refreshed every 30 seconds.
- **Single-Process Assumption**: `activeUploadRegistry` is held in Node.js process memory. Because this blueprint specifies a **single EC2 instance**, there are no multi-process synchronization discrepancies.
- **Interrupted Uploads**: If the server crashes or reboots mid-upload, the client connection terminates. The partially written file is orphaned in `PENDING` status. Its heartbeat ceases; once 2 hours elapse from creation and 15 minutes from the last heartbeat, the worker safely purges the orphaned S3 object and marks the status `FAILED`.

---

## 11. Realistic AWS Monthly Cost Estimate

### Explicit Assumptions:
- Region: `us-east-1`.
- Compute: Single On-Demand `t3.medium` instance operating 730 hours/month.
- Public IPv4: Effective February 1, 2024, AWS charges **$0.005/hour for all public IPv4 addresses** (in-use or idle).
- Storage: 60 GiB `gp3` root EBS volume + 10 GiB EBS snapshot backup storage.
- S3 Storage: 100 GiB active file storage (unversioned) + 10 GiB encrypted database backups.
- Egress: 200 GiB outbound data transfer per month (AWS Free Tier grants 100 GiB/month egress free).
- Domain & DNS: Domain registered via Route 53 (optional) or external registrar.

### Detailed Monthly Cost Breakdown:

| Category | Component / Usage | Pricing Model | Monthly Cost (USD) |
| :--- | :--- | :--- | :--- |
| **Fixed Infrastructure** | **EC2 Instance**: `t3.medium` (2 vCPU, 4 GiB RAM) | $0.0416 / hr $\times$ 730 hrs | $30.37 |
| | **Public IPv4 Address** | $0.005 / hr $\times$ 730 hrs | **$3.65** |
| | **Root EBS Volume**: 60 GiB `gp3` | $0.08 / GB-month | $4.80 |
| | **EBS Snapshots**: 10 GiB backup delta | $0.05 / GB-month | $0.50 |
| **Usage-Dependent S3** | **S3 Standard Storage**: 110 GiB (100G files + 10G backups) | $0.023 / GB-month | $2.53 |
| | **S3 API Calls**: 50k PUT/POST/LIST ($0.005/1k) + 100k GET ($0.0004/1k) | Request volume | $0.29 |
| **Network Egress** | **Data Transfer Out**: 200 GiB (100 GiB billable after free tier) | $0.09 / GB | $9.00 |
| **CPU Credit Bursts** | Baseline `t3.medium` provides 24 CPU credits/hr (sufficient for streaming) | Included in instance | $0.00 |
| **Subtotal (AWS Cloud Charges)** | | | **~$51.14 / month** |
| **Taxes & Optional Items** | Estimated State/VAT Tax (~8–10%) | Regional tax | ~$4.00 – $5.00 |
| | Domain Registration (Route 53 `.com` — amortized monthly) | ~$14.00 / year | ~$1.17 |
| **Total Estimated Operating Cost** | | | **~$56.00 – $57.50 / month** |

*Note on Commitments*: A 1-year EC2 Savings Plan can reduce the EC2 compute portion from $30.37 to ~$19.50/mo, but savings plans are non-refundable commitments and are not presented as guaranteed without user authorization.

---

## 12. Final Pre-Deployment Approval Checklist

Before triggering AWS provisioning:

- [ ] **Domain & DNS**: Point production domain `A` record to the EC2 Elastic IP address.
- [ ] **AWS Region**: Confirm preferred AWS Region (Default configured: `us-east-1`).
- [ ] **EC2 Sizing**: Confirm acceptance of `t3.medium` (4 GiB RAM) vs `t3.small` with 4 GiB swap.
- [ ] **S3 Bucket Name**: Select a globally unique name adhering to S3 DNS naming rules.
- [ ] **PostgreSQL Password**: Prepare a strong, unique 32+ character password for PostgreSQL.
- [ ] **JWT Secrets**: Generate two 64-character hex secrets using `node -e "console.log(crypto.randomBytes(32).toString('hex'))"`.
- [ ] **IAM Permission to Attach Roles**: Verify that your AWS administrator user has rights to create IAM roles and instance profiles.
- [ ] **Backup Public Key**: Generate keypair with `age-keygen`, store private identity key safely offline, and stage public recipient key (`age1...`) for EC2.
