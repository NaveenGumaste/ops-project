# B2B Hardware Inventory and Fulfillment System
## Interview Preparation Guide

Use this guide to describe the implementation accurately. Add personal context and measured results only when you have verified them yourself.

## 1. 30-second overview

> I built a three-tier inventory and order fulfillment demo using Next.js, PostgreSQL, Nginx, Docker Compose, Terraform, and AWS. Order creation uses a PostgreSQL transaction with row-level locking to prevent stock from going below zero. The repository includes a local monitoring stack and Terraform configuration for an EC2 application host and a private RDS database.

## 2. Architecture

| Tier | Component | What it does |
| --- | --- | --- |
| Edge | Nginx | Listens on port 80, applies gzip and cache headers, and proxies requests to Next.js. |
| Application | Next.js App Router | Runs with standalone output on Node.js 20. The Docker image runs the app as the non-root **nextjs** user. API routes provide health, inventory, orders, and Prometheus metrics. |
| Data | PostgreSQL 17 / Amazon RDS PostgreSQL 17.5 | Stores products and orders. Local Compose does not publish PostgreSQL on a host port. Terraform places RDS in a private subnet group and sets **publicly_accessible = false**. |

The local Compose stack also publishes Prometheus on port 9090 and Grafana on port 3001. The application and database containers are not published on host ports. Compose uses a regular Docker bridge network; it is not marked **internal**.

## 3. Technical stories

### Story 1: Preventing inventory overselling

- **Situation:** Concurrent buyers may request the last units of the same product.
- **Task:** Keep stock from becoming negative when requests arrive at the same time.
- **Action:** The order route calls a database transaction that locks the product row with **SELECT ... FOR UPDATE**, checks stock, updates inventory, inserts the order, and commits. Insufficient stock returns HTTP 409. When PostgreSQL is unavailable, the application uses an in-memory fallback; that mode does not validate PostgreSQL locking.
- **Validation:** **scripts/stress-test.ps1** sends parallel requests after checking that the health endpoint reports PostgreSQL mode. Run it only against an isolated local database: with **-ConfirmReset**, it deletes existing orders and resets inventory before the test. The default H100 seed has five units, so the default ten-request run expects five successes and five rejections. Do not describe those results as measured until you run the script and inspect its output.

Run the local Compose stack first, then:

~~~powershell
pwsh -File scripts/stress-test.ps1 -ConfirmReset
~~~

### Story 2: Standalone container build

The Dockerfile separates dependency installation, build, and runtime stages. The runtime stage copies the Next.js standalone output and static assets, and runs as the non-root **nextjs** user. This reduces the runtime contents compared with shipping the full development tree, but this repository does not record a measured image-size comparison.

### Story 3: Network boundaries

- In local Compose, Nginx publishes port 80; Prometheus and Grafana publish ports 9090 and 3001. The Next.js app and PostgreSQL have no host port mappings.
- In AWS, the EC2 security group accepts HTTP on port 80. RDS is configured as not publicly accessible, and its security group accepts PostgreSQL traffic from the EC2 security group.
- The Terraform EC2 security group currently permits SSH from **0.0.0.0/0**. Restrict that rule before deployment in a real environment.
- Nginx listens on HTTP port 80; TLS termination is not configured in this repository. Describe the setup as basic network separation, not a complete zero-trust or production security design.

### Story 4: AWS infrastructure

Terraform describes a VPC with a public subnet for EC2 and two private subnets in separate Availability Zones for the RDS subnet group. The RDS instance uses **db.t4g.micro**, is marked not publicly accessible, and is reachable through the EC2 security group. The default EC2 instance type is **t3.small**.

The two-subnet RDS subnet group does not make the database instance Multi-AZ; the RDS resource does not enable **multi_az**. Storage encryption is also not explicitly configured. The deploy script packages the app, uploads it to EC2, seeds RDS, and starts the production Compose file after Terraform, AWS credentials, and SSH prerequisites are in place. It also configures a 2 GB swap file on the EC2 host. Avoid promising a fixed deployment or teardown time.

## 4. Monitoring

- The Next.js **/api/metrics** endpoint emits Prometheus text format for database connectivity and latency, order status counts, and inventory by SKU.
- Prometheus is configured to scrape the app every five seconds.
- Grafana is provisioned with Prometheus as a data source. Dashboard definitions are not checked into this repository.
- The order metric is calculated from the most recent orders returned by the app, so describe it as demo monitoring rather than a lifetime order counter.
- Terraform defines CloudWatch CPU alarms for EC2 and RDS.

## 5. Likely interview questions

### Why put Nginx in front of Next.js?

Nginx provides one HTTP entry point, gzip compression, cache headers for immutable Next.js assets, and reverse proxying to the app. Static asset requests are still proxied to Next.js by this configuration; Nginx is not serving the files directly from its own disk.

### How does order creation prevent overselling?

The PostgreSQL path begins a transaction and locks the selected product row with **SELECT ... FOR UPDATE**. It checks the locked stock value before updating it and creating the order. A request that cannot be fulfilled is rolled back and receives HTTP 409. The in-memory fallback uses a JavaScript lock queue and should not be presented as a PostgreSQL concurrency test.

### How is the AWS database isolated?

The RDS instance is configured as not publicly accessible, uses a subnet group spanning two private subnets, and accepts inbound port 5432 only from the EC2 security group. The current Terraform does not enable Multi-AZ or explicitly configure storage encryption. The EC2 SSH ingress rule is open to all IPv4 addresses and should be restricted.

The production Compose file sets **PGSSLMODE=require** and also sets **NODE_TLS_REJECT_UNAUTHORIZED=0**, which disables Node.js certificate verification. Do not claim that the deployment validates the RDS server certificate; remove that override and configure the appropriate CA trust before relying on certificate validation.

### Why use Terraform?

Terraform makes the declared AWS resources reviewable and repeatable. Its state tracks the resources it manages, and **terraform destroy** can remove those managed resources when they are no longer needed. Confirm the target workspace and state before applying or destroying infrastructure.

### What is the difference between a Prometheus gauge and a counter?

A gauge can rise or fall, such as current inventory. A counter is intended to be cumulative. In this demo, the order metric is derived from the recent order list, so it is not a durable lifetime counter.

## 6. Technology summary

- Next.js 16 App Router, React 19, TypeScript, Node.js 20
- Nginx with gzip and cache headers
- PostgreSQL 17 locally and Amazon RDS PostgreSQL 17.5
- Docker and Docker Compose
- Terraform with AWS VPC, EC2, RDS, security groups, and CloudWatch alarms
- Prometheus and Grafana
- PowerShell 7 stress-test script for local PostgreSQL concurrency checks
