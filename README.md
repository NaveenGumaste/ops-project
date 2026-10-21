# B2B Ops Inventory and Fulfillment

A three-tier inventory and order fulfillment demo built with Next.js, PostgreSQL, Docker Compose, Nginx, Prometheus, Grafana, and AWS Terraform. It includes inventory and order APIs, a health endpoint, Prometheus metrics, a local container stack, and an AWS deployment path using EC2 and RDS.

## Architecture

| Tier | Service | Role |
| --- | --- | --- |
| Edge | Nginx | Accepts HTTP traffic on port 80 and proxies requests to Next.js. |
| Application | Next.js 16, React 19, TypeScript | Renders the inventory UI and serves the API routes. |
| Data | PostgreSQL 17 | Stores inventory and orders; order creation uses row-level locks. |
| Monitoring | Prometheus and Grafana | Scrapes app metrics and provides a local dashboard. |
| AWS deployment | Terraform, EC2, RDS, CloudWatch | Provisions the network and application/database infrastructure. |

The app has an in-memory fallback when PostgreSQL is unavailable. That mode is useful for a quick UI preview, but it does not persist inventory or orders.

## Requirements

For local development, install:

- Docker Desktop with Docker Compose, or Node.js 20+ and npm.
- Git to clone the repository.

For AWS deployment, also install and configure the AWS CLI, Terraform 1.5+, and OpenSSH client tools (`ssh`, `scp`, and `ssh-keygen`). The deployment script is PowerShell and expects to run from the repository root.

## Run the full local stack

From the repository root:

```powershell
Copy-Item .env.example .env
notepad .env
```

Set unique values for `POSTGRES_PASSWORD` and `GRAFANA_ADMIN_PASSWORD` in `.env` before starting the stack. Use long random alphanumeric values and keep `.env` private. Then start the services:

```powershell
docker compose up --build -d
docker compose ps
```

Open the app at <http://localhost>. The Compose stack starts Nginx, Next.js, PostgreSQL, Prometheus, and Grafana. It seeds the local database from `db/init.sql` and keeps PostgreSQL data in a Docker volume.

Local service URLs:

- App: <http://localhost>
- Prometheus: <http://localhost:9090>
- Grafana: <http://localhost:3001> (username: `admin`; use the value of `GRAFANA_ADMIN_PASSWORD`)
- Health API: <http://localhost/api/health>
- Inventory API: <http://localhost/api/inventory>
- Orders API: <http://localhost/api/orders>
- Prometheus metrics: <http://localhost/api/metrics>

Compose supplies the app container with a PostgreSQL connection string using `POSTGRES_USER`, `POSTGRES_PASSWORD`, and `POSTGRES_DB` from `.env`. The Compose file requires both passwords instead of using known defaults. Keep `.env` private.

To follow app logs or stop the stack:

```powershell
docker compose logs -f web
docker compose down
```

The database volume remains after `docker compose down`. To remove the volume and its data as well, run `docker compose down -v`.

## Run Next.js without Docker

Install dependencies and create a local environment file:

```powershell
npm ci
Copy-Item .env.example .env
```

Edit `DATABASE_URL` in `.env` to point to a PostgreSQL database reachable from your machine, then start the development server:

```powershell
npm run dev
```

Open <http://localhost:3000>. On first database connection, the app creates the tables and seeds the initial products. If PostgreSQL is unavailable, the app uses its in-memory fallback. The fallback resets when the process restarts.

Useful project commands:

```powershell
npm run lint
npm run build
npm run start
```

## Environment variables

| Variable | Used by | Purpose |
| --- | --- | --- |
| `DATABASE_URL` | Next.js | PostgreSQL connection string. Compose builds the local container's value from the `POSTGRES_*` settings. |
| `POSTGRES_USER` | Local Compose | Local PostgreSQL username (defaults to `postgres`). |
| `POSTGRES_PASSWORD` | Local Compose | Required local PostgreSQL password; set it in `.env`. |
| `POSTGRES_DB` | Local Compose | Local database name (defaults to `inventory_db`). |
| `GRAFANA_ADMIN_PASSWORD` | Local Compose | Required password for the local Grafana admin account. |
| `aws_region` | Terraform | AWS region; defaults to `ap-south-1`. |
| `db_username` | Terraform | RDS master username. |
| `db_password` | Terraform | Required sensitive RDS master password; provide it in an ignored local `terraform.tfvars` file. |

Never commit `.env`, `terraform.tfvars`, Terraform state, or other credentials. The Terraform state contains sensitive infrastructure values even when Terraform marks an output as sensitive.

## Deploy to AWS

The Terraform configuration creates a VPC, public and private subnets, security groups, an EC2 host, a private PostgreSQL 17 RDS instance, and CloudWatch CPU alarms. The deployment script packages the app, copies it to EC2 over SSH, seeds RDS, and starts the production Docker Compose file.

1. Configure AWS credentials for the account and region you intend to use. Review `terraform/main.tf` before applying. In particular, restrict the EC2 SSH ingress rule from `0.0.0.0/0` to your public IP in CIDR form (for example, `203.0.113.10/32`). The app's production Nginx listener uses plain HTTP on port 80; add TLS and a domain before serving real users.
2. Create a local Terraform variables file. It is ignored by Git:

   ```powershell
   @"
   aws_region  = "ap-south-1"
   db_username = "postgres_admin"
   db_password = "REPLACE_WITH_32_RANDOM_ALPHANUMERIC_CHARACTERS"
   "@ | Set-Content .\terraform\terraform.tfvars
   ```

   Replace the password placeholder with a strong, unique, 32+ character alphanumeric password. Keep this file private.
3. Create the SSH key expected by `deploy-to-aws.ps1` if you do not already have it:

   ```powershell
   ssh-keygen -t ed25519 -f "$HOME/.ssh/id_ed25519"
   ```

4. Initialize and review the Terraform plan, then provision the AWS resources:

   ```powershell
   Push-Location .\terraform
   terraform init
   terraform validate
   terraform plan -var-file=terraform.tfvars
   terraform apply -var-file=terraform.tfvars
   Pop-Location
   ```

5. From the repository root, deploy the application:

   ```powershell
   .\deploy-to-aws.ps1
   ```

The script uses AWS Instance Connect, so keep the AWS CLI credentials active and ensure the SSH key pair exists. Terraform defaults to the Mumbai region (`ap-south-1`). AWS resources can incur charges; review the plan and current AWS pricing before applying.

To remove the resources when finished:

```powershell
Push-Location .\terraform
terraform destroy -var-file=terraform.tfvars
Pop-Location
```

Destroying the RDS instance deletes its database. Back up any data you need first.

## Contributions

Bug reports and improvements are welcome through GitHub issues and pull requests. GitHub Copilot may be used as an optional coding assistant; contributors should review AI-generated suggestions and validate changes before submitting them.
