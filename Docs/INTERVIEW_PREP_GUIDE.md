# 🎯 B2B Hardware Inventory & Fulfillment System
## The Ultimate DevOps & Full-Stack Interview Cheat Sheet

This document is your high-impact study guide. It is structured so you can read it, remember the core concepts, and confidently answer questions from hiring managers and technical recruiters.

---

## 1. The 30-Second Elevator Pitch
> *"I designed a three-tier B2B inventory and order fulfillment application using Next.js, PostgreSQL, Nginx, and Docker. Order creation uses PostgreSQL row-level locking to protect stock, and Terraform provisions an AWS environment in Mumbai with the database in private subnets. Prometheus, Grafana, and CloudWatch provide application and infrastructure monitoring."*

---

## 2. Architecture: The 3 Tiers (Restaurant Analogy)

| Tier | Component | Analogy | What it does |
| :--- | :--- | :--- | :--- |
| **Tier 1** | **Nginx** | **The Front Desk & Maître d'** | Single public entry point (Port 80/443). Handles Gzip compression, caches immutable Next.js static assets for 1 year, and reverse proxies requests to the kitchen. |
| **Tier 2** | **Next.js (App Router)** | **The Kitchen** | Runs inside a private container using Next.js `standalone` output and Node 20. Serves the interactive UI dashboard and API endpoints (`/api/health`, `/api/inventory`, `/api/orders`, `/api/metrics`). Runs as a non-root system user. |
| **Tier 3** | **PostgreSQL 17 / RDS** | **The Locked Pantry** | Stores products and transactions. The RDS subnet group spans private subnets in two Availability Zones; the database security group accepts PostgreSQL traffic from the EC2 security group. It enforces atomic inventory transactions. |

---

## 3. Top 4 Technical Highlights (Stories for Interviews)

### Story 1: Preventing Race Conditions & Overselling (The Concurrency Fix)
- **The Problem:** When two enterprise buyers click "Purchase" on the last remaining NVIDIA H100 GPU at the exact same millisecond, a standard `SELECT stock` followed by `UPDATE stock` causes an inventory race condition where both orders succeed, creating negative inventory.
- **My Solution:** I wrapped the transaction inside `BEGIN; ... COMMIT;` and used PostgreSQL **Row-Level Locking: `SELECT ... FOR UPDATE`**.
- **How it works:** The first transaction locks the specific product row. Concurrent transactions must queue and wait. As soon as stock hits 0, subsequent transactions trigger an immediate `ROLLBACK;` and return a clean HTTP `409 Conflict`.
- **Validation to perform:** Run 10 simultaneous orders against 5 available units and verify that exactly 5 succeed, the remaining orders fail, and stock reaches 0. This repository does not include a committed stress-test harness, so capture the result before describing it as a measured test.

### Story 2: Zero-Trust Network Isolation (Security Hardening)
- **The Problem:** In development, developers frequently expose application ports (`3000`) and database ports (`5432`) to the host, exposing internal layers to port scanning and direct attacks.
- **My Solution:** `docker-compose.yml` exposes Nginx on port 80 while Next.js and PostgreSQL have no host port mappings and communicate over the private `app-network`. Prometheus and Grafana also publish host ports (9090 and 3001) for local monitoring, so restrict those ports when the host is reachable by untrusted machines.

### Story 3: Production Cloud Infrastructure with Terraform (AWS Mumbai `ap-south-1`)
- **My Solution:** I wrote declarative Terraform code to provision:
  1. A custom VPC (`10.0.0.0/16`) with an Internet Gateway.
  2. A public subnet for EC2 and two private subnets across distinct Availability Zones for the RDS DB subnet group. The current configuration does not enable a Multi-AZ RDS deployment.
  3. **Chained Security Groups:** The RDS Security Group allows port 5432 **strictly** from the EC2 Security Group ID, establishing least-privilege access.
  4. **Amazon RDS PostgreSQL 17.5** in private subnets, with inbound PostgreSQL access limited to the EC2 security group. The current Terraform resource does not explicitly enable storage encryption or configure backup retention.
  5. **1-Command Teardown (`terraform destroy`):** Wipes all cloud resources in 3 minutes to eliminate billing waste.

### Story 4: Managing Memory Pressure During EC2 Builds
- **The Problem:** Building a Next.js image on a small EC2 host can create memory pressure during compilation.
- **My Solution:** `deploy-to-aws.ps1` creates a 2 GB swapfile on the EC2 host if one does not already exist. This adds swap capacity for the Docker build; it does not change the configured EC2 instance type or guarantee a specific build time.

---

## 4. Full-Stack Observability & Monitoring

I implemented the **Two Pillars of Monitoring**:

```
[ Next.js Kitchen ] ──(Exposes /api/metrics)──> [ Prometheus ] ──> [ Grafana ] (Visual TV)
                                                        │
[ EC2 & RDS Hypervisor ] ──────────────────────> [ AWS CloudWatch Alarms ] (Emergency Siren)
```

1. **In-App Metrics Exporter:** Built a custom Next.js endpoint (`/api/metrics`) that reports Prometheus text exposition data:
   - `b2b_database_connected` (Gauge: 1 or 0)
   - `b2b_database_latency_ms` (Gauge: query round-trip time)
   - `b2b_orders_total` (Counter: success vs rejected orders)
   - `b2b_inventory_stock` (Gauge: real-time stock per SKU)
2. **Prometheus:** Scrapes `/api/metrics` every 5 seconds.
3. **Grafana:** Displays visual gauges and bar charts that bounce in real time during concurrency load tests.
4. **AWS CloudWatch Alarms:** Automated infrastructure safety net configured via Terraform (`CPUUtilization >= 80%` on EC2 or RDS trips an immediate alert).

---

## 5. Likely Interview Questions & Model Answers

### Q1: *"Why put Nginx in front of Next.js? Next.js already has its own server."*
> **Answer:** *"Nginx gives the stack a single HTTP entry point, applies Gzip compression and long-lived cache headers to immutable Next.js assets, and forwards requests to the app container. Next.js and PostgreSQL are not published on host ports in the local Compose stack. TLS termination and DDoS protection are not configured in this repository and would need to be added at the edge before production use."*

### Q2: *"How did you prevent database overselling under high concurrency?"*
> **Answer:** *"I avoided optimistic locking and application-level checks, which fail under distributed horizontal scaling. Instead, I used PostgreSQL's native row-level locking using `SELECT ... FOR UPDATE` inside an atomic transaction. This guarantees that only one transaction can evaluate and decrement stock for a given SKU at a time, enforcing ACID consistency at the database engine level."*

### Q3: *"How is your database secured in AWS?"*
> **Answer:** *"The Amazon RDS instance is placed in private subnets with no route to the Internet Gateway. Its security group allows inbound TCP 5432 only from the EC2 security group, and the application connection string requires SSL with `sslmode=require`. The EC2 SSH rule is open to all IPv4 addresses by default in this sample and should be restricted to the operator's IP before deployment."*

### Q4: *"Why did you use Terraform instead of the AWS Management Console?"*
> **Answer:** *"Manual configuration in the AWS console is error-prone, untracked, and dangerous for cloud budgets. With Terraform, our entire infrastructure is version-controlled, reproducible, and self-documenting. Most importantly, running `terraform destroy` ensures that every subnet, disk, and database instance is cleanly deleted when testing concludes, preventing orphaned resource costs."*

### Q5: *"What is the difference between a Gauge and a Counter in Prometheus?"*
> **Answer:** *"A Counter is a cumulative metric that only ever increases—like total orders processed (`b2b_orders_total`). A Gauge represents a numerical value that can go up or down arbitrarily—like available inventory stock (`b2b_inventory_stock`) or database latency (`b2b_database_latency_ms`)."*

---

## 6. Quick Tech Stack Summary

- **Frontend & App Server:** Next.js 16 (App Router, Turbopack, Tailwind CSS v4, Node 20 Standalone).
- **Edge & Proxy:** Nginx (Alpine), Gzip, Static Cache-Control.
- **Database:** PostgreSQL 17 locally and Amazon RDS PostgreSQL 17.5 in AWS (subnet group spans two Availability Zones; Multi-AZ deployment and explicit storage encryption are not enabled in the current Terraform configuration).
- **Containerization:** Docker, Docker Compose, Multi-stage Dockerfiles.
- **Infrastructure as Code:** Terraform (AWS Provider v5).
- **Cloud Provider:** AWS (VPC, public/private subnets, security groups, EC2 `t3.small` by default, RDS `db.t4g.micro`, CloudWatch).
- **Observability:** Prometheus, Grafana, AWS CloudWatch Metric Alarms.

