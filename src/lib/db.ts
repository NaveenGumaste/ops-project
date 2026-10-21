import { randomUUID } from "node:crypto";
import { Pool, PoolClient } from "pg";
import { Product, Order, HealthStatus } from "./types";

// Initial seed products for B2B cloud and data center hardware
const INITIAL_PRODUCTS: Product[] = [
  {
    id: "prod-h100",
    sku: "NV-H100-80G-SXM5",
    name: "NVIDIA H100 Tensor Core GPU 80GB SXM5",
    category: "Compute",
    price: 32500,
    stock: 5,
    max_stock: 10,
    description:
      "Enterprise high-density AI accelerator with 3.35 TB/s memory bandwidth.",
    specs: [
      "80GB HBM3 Memory",
      "SXM5 Form Factor",
      "700W TDP",
      "Gen5 PCIe / NVLink 4",
    ],
  },
  {
    id: "prod-epyc",
    sku: "AMD-EPYC-9654-2P",
    name: "Dual AMD EPYC 9654 96-Core 2U Server Node",
    category: "Compute",
    price: 18900,
    stock: 8,
    max_stock: 15,
    description:
      "192-core / 384-thread dual-socket hyperscale compute server node.",
    specs: [
      "192 Total Cores",
      "1.5TB DDR5 ECC Registered",
      "2x 100GbE QSFP28",
      "Redundant 2000W PSU",
    ],
  },
  {
    id: "prod-switch",
    sku: "MLX-SN4600-64Q",
    name: "NVIDIA Spectrum-3 64-Port 100GbE Spine Switch",
    category: "Networking",
    price: 14200,
    stock: 12,
    max_stock: 20,
    description:
      "Ultra-low-latency 12.8Tbps non-blocking RoCEv2 datacenter spine switch.",
    specs: [
      "64x 100GbE QSFP28",
      "12.8 Tbps Throughput",
      "Sub-400ns Port Latency",
      "Dual Hot-Swap Fans",
    ],
  },
  {
    id: "prod-storage",
    sku: "SAN-NVME-61TB-E3S",
    name: "PureFlex 61.44TB NVMe-oF Gen5 Storage Array",
    category: "Storage",
    price: 24800,
    stock: 4,
    max_stock: 8,
    description:
      "Ultra-dense all-flash NVMe over RoCE target for high-throughput AI workloads.",
    specs: [
      "61.44TB Raw NVMe",
      "Gen5 PCIe Dual-Port",
      "2.8M IOPS 4K Random",
      "Active-Active Controllers",
    ],
  },
  {
    id: "prod-pdu",
    sku: "APC-PDU-3P-48A",
    name: "Schneider APC 3-Phase Intelligent 48A Switched PDU",
    category: "Power",
    price: 3400,
    stock: 16,
    max_stock: 30,
    description:
      "Remotely managed rack power distribution unit with outlet-level metering.",
    specs: [
      "400V 3-Phase Delta",
      "24x C13 & 12x C19 Outlets",
      "SNMPv3 / TLS Management",
      "Environmental Sensors",
    ],
  },
];

// In-memory simulation fallback (active until Phase 1 starts PostgreSQL container)
let memoryProducts: Product[] = JSON.parse(JSON.stringify(INITIAL_PRODUCTS));
let memoryOrders: Order[] = [];
let memoryLockQueue = Promise.resolve();

// Global PG Pool instance
let pool: Pool | null = null;
let isPostgresAvailable = false;
let lastDbCheck = 0;
let dbCheckLatency = 0;
let lastErrorMsg = "";

function getPool(): Pool {
  if (!pool) {
    const connectionString =
      process.env.DATABASE_URL ||
      `postgres://${process.env.PGUSER || "postgres"}:${process.env.PGPASSWORD || "postgres"}@${
        process.env.PGHOST || "localhost"
      }:${process.env.PGPORT || "5432"}/${process.env.PGDATABASE || "inventory_db"}`;

    pool = new Pool({
      connectionString,
      connectionTimeoutMillis: 5000,
      idleTimeoutMillis: 10000,
      max: 20,
    });

    pool.on("error", (err) => {
      console.warn("[PostgreSQL Pool Warning]:", err.message);
      isPostgresAvailable = false;
    });
  }
  return pool;
}

// Initialize tables in PostgreSQL if connected
async function initPostgresTables(client: PoolClient) {
  await client.query(`
    CREATE TABLE IF NOT EXISTS products (
      id VARCHAR(64) PRIMARY KEY,
      sku VARCHAR(64) UNIQUE NOT NULL,
      name VARCHAR(255) NOT NULL,
      category VARCHAR(64) NOT NULL,
      price NUMERIC(12, 2) NOT NULL,
      stock INT NOT NULL CHECK (stock >= 0),
      max_stock INT NOT NULL,
      description TEXT,
      specs JSONB
    );

    CREATE TABLE IF NOT EXISTS orders (
      id VARCHAR(64) PRIMARY KEY,
      order_number VARCHAR(64) UNIQUE NOT NULL,
      product_id VARCHAR(64) REFERENCES products(id),
      product_name VARCHAR(255) NOT NULL,
      customer_name VARCHAR(255) NOT NULL,
      quantity INT NOT NULL,
      unit_price NUMERIC(12, 2) NOT NULL,
      total_price NUMERIC(12, 2) NOT NULL,
      status VARCHAR(32) NOT NULL,
      created_at TIMESTAMP WITH TIME ZONE DEFAULT CURRENT_TIMESTAMP,
      execution_time_ms NUMERIC(8, 2) NOT NULL,
      note TEXT
    );
  `);

  const countRes = await client.query("SELECT COUNT(*) FROM products");
  if (parseInt(countRes.rows[0].count, 10) === 0) {
    for (const prod of INITIAL_PRODUCTS) {
      await client.query(
        `INSERT INTO products (id, sku, name, category, price, stock, max_stock, description, specs)
         VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9)`,
        [
          prod.id,
          prod.sku,
          prod.name,
          prod.category,
          prod.price,
          prod.stock,
          prod.max_stock,
          prod.description,
          JSON.stringify(prod.specs),
        ],
      );
    }
  }
}

// Test PostgreSQL connectivity with quick caching
export async function checkDatabaseConnection(): Promise<{
  connected: boolean;
  latencyMs: number;
  error?: string;
}> {
  const now = Date.now();
  // Cache check for 5 seconds to prevent latency spikes while postgres container is offline
  if (now - lastDbCheck < 5000) {
    return {
      connected: isPostgresAvailable,
      latencyMs: dbCheckLatency,
      error: lastErrorMsg,
    };
  }

  const start = performance.now();
  try {
    const p = getPool();
    const client = await p.connect();
    try {
      await client.query("SELECT 1;");
      await initPostgresTables(client);
      isPostgresAvailable = true;
      dbCheckLatency = Math.round((performance.now() - start) * 10) / 10;
      lastDbCheck = now;
      lastErrorMsg = "";
      return { connected: true, latencyMs: dbCheckLatency };
    } finally {
      client.release();
    }
  } catch (err: unknown) {
    isPostgresAvailable = false;
    dbCheckLatency = Math.round((performance.now() - start) * 10) / 10;
    lastDbCheck = now;
    lastErrorMsg = err instanceof Error ? err.message : String(err);
    return { connected: false, latencyMs: dbCheckLatency, error: lastErrorMsg };
  }
}

// Health Check API helper
export async function getHealthStatus(): Promise<HealthStatus> {
  const dbStatus = await checkDatabaseConnection();
  return {
    status: dbStatus.connected ? "healthy" : "degraded",
    uptime_seconds: Math.floor(process.uptime()),
    database: {
      connected: dbStatus.connected,
      mode: dbStatus.connected ? "postgres" : "simulated_memory",
      latency_ms: dbStatus.latencyMs,
      error: dbStatus.error,
    },
    tier: {
      tier1_nginx: "bypassed_direct_port_3000",
      tier2_nextjs: "running",
      tier3_postgres: dbStatus.connected ? "connected" : "simulated_fallback",
    },
    timestamp: new Date().toISOString(),
  };
}

// Fetch all products
export async function getProducts(): Promise<Product[]> {
  const conn = await checkDatabaseConnection();
  if (conn.connected) {
    const p = getPool();
    const res = await p.query(
      "SELECT id, sku, name, category, price::float as price, stock, max_stock, description, specs FROM products ORDER BY category, name",
    );
    return res.rows.map((row) => ({
      ...row,
      specs: Array.isArray(row.specs)
        ? row.specs
        : typeof row.specs === "string"
          ? JSON.parse(row.specs)
          : [],
    }));
  }
  return memoryProducts;
}

// Fetch all orders
export async function getOrders(): Promise<Order[]> {
  const conn = await checkDatabaseConnection();
  if (conn.connected) {
    const p = getPool();
    const res = await p.query(
      "SELECT id, order_number, product_id, product_name, customer_name, quantity, unit_price::float as unit_price, total_price::float as total_price, status, created_at, execution_time_ms::float as execution_time_ms, note FROM orders ORDER BY created_at DESC LIMIT 50",
    );
    return res.rows;
  }
  return [...memoryOrders].reverse().slice(0, 50);
}

// Reset inventory to initial stock
export async function resetInventory(): Promise<void> {
  const conn = await checkDatabaseConnection();
  if (conn.connected) {
    const p = getPool();
    const client = await p.connect();
    try {
      await client.query("BEGIN;");
      await client.query("DELETE FROM orders;");
      for (const prod of INITIAL_PRODUCTS) {
        await client.query("UPDATE products SET stock = $1 WHERE id = $2", [
          prod.stock,
          prod.id,
        ]);
      }
      await client.query("COMMIT;");
    } catch (e) {
      await client.query("ROLLBACK;");
      throw e;
    } finally {
      client.release();
    }
  } else {
    memoryProducts = JSON.parse(JSON.stringify(INITIAL_PRODUCTS));
    memoryOrders = [];
  }
}

// Create an order using Row-Level Locking (SELECT ... FOR UPDATE)
export async function createOrder(params: {
  productId: string;
  quantity: number;
  customerName: string;
}): Promise<{
  success: boolean;
  order?: Order;
  error?: string;
  executionTimeMs: number;
  remainingStock?: number;
}> {
  const start = performance.now();
  const conn = await checkDatabaseConnection();

  if (conn.connected) {
    // TIER 3 POSTGRESQL PRODUCTION TRANSACTION WITH ROW-LEVEL LOCKING
    const p = getPool();
    const client = await p.connect();
    try {
      await client.query("BEGIN;");

      // CRITICAL ROW-LEVEL LOCK: SELECT ... FOR UPDATE
      const productRes = await client.query(
        "SELECT id, sku, name, price::float as price, stock FROM products WHERE id = $1 FOR UPDATE",
        [params.productId],
      );

      if (productRes.rowCount === 0) {
        await client.query("ROLLBACK;");
        const execTime = Math.round((performance.now() - start) * 10) / 10;
        return {
          success: false,
          error: "Product not found",
          executionTimeMs: execTime,
        };
      }

      const product = productRes.rows[0];

      if (product.stock < params.quantity) {
        await client.query("ROLLBACK;");
        const execTime = Math.round((performance.now() - start) * 10) / 10;
        return {
          success: false,
          error: `Insufficient stock: Requested ${params.quantity}, only ${product.stock} units remaining.`,
          executionTimeMs: execTime,
          remainingStock: product.stock,
        };
      }

      const newStock = product.stock - params.quantity;
      await client.query("UPDATE products SET stock = $1 WHERE id = $2", [
        newStock,
        product.id,
      ]);

      const orderId = `ord-${randomUUID()}`;
      const orderNumber = `ORD-${Date.now()}-${randomUUID().slice(0, 8).toUpperCase()}`;
      const totalPrice = product.price * params.quantity;
      const execTime = Math.round((performance.now() - start) * 10) / 10;

      const orderInsertRes = await client.query(
        `INSERT INTO orders (id, order_number, product_id, product_name, customer_name, quantity, unit_price, total_price, status, execution_time_ms, note)
         VALUES ($1, $2, $3, $4, $5, $6, $7, $8, 'COMPLETED', $9, $10)
         RETURNING id, order_number, product_id, product_name, customer_name, quantity, unit_price::float as unit_price, total_price::float as total_price, status, created_at, execution_time_ms::float as execution_time_ms`,
        [
          orderId,
          orderNumber,
          product.id,
          product.name,
          params.customerName || "Enterprise Buyer",
          params.quantity,
          product.price,
          totalPrice,
          execTime,
          "Committed via PostgreSQL Row-Level Lock (FOR UPDATE)",
        ],
      );

      await client.query("COMMIT;");

      return {
        success: true,
        order: orderInsertRes.rows[0],
        executionTimeMs: execTime,
        remainingStock: newStock,
      };
    } catch (err) {
      await client.query("ROLLBACK;");
      const execTime = Math.round((performance.now() - start) * 10) / 10;
      const msg = err instanceof Error ? err.message : String(err);
      return { success: false, error: msg, executionTimeMs: execTime };
    } finally {
      client.release();
    }
  } else {
    // IN-MEMORY MUTEX LOCK (Simulates PostgreSQL FOR UPDATE queue for local preview)
    return new Promise((resolve) => {
      memoryLockQueue = memoryLockQueue.then(async () => {
        await new Promise((r) => setTimeout(r, 20));

        const targetProduct = memoryProducts.find(
          (p) => p.id === params.productId,
        );
        const execTime = Math.round((performance.now() - start) * 10) / 10;

        if (!targetProduct) {
          return resolve({
            success: false,
            error: "Product not found",
            executionTimeMs: execTime,
          });
        }

        if (targetProduct.stock < params.quantity) {
          const rejectedOrder: Order = {
            id: `rej-${randomUUID()}`,
            order_number: `REJ-${Date.now()}-${randomUUID().slice(0, 8).toUpperCase()}`,
            product_id: targetProduct.id,
            product_name: targetProduct.name,
            customer_name: params.customerName || "Enterprise Buyer",
            quantity: params.quantity,
            unit_price: targetProduct.price,
            total_price: targetProduct.price * params.quantity,
            status: "REJECTED_OUT_OF_STOCK",
            created_at: new Date().toISOString(),
            execution_time_ms: execTime,
            note: "Transaction Aborted: Insufficient Stock (Simulated Row Lock)",
          };
          memoryOrders.push(rejectedOrder);
          return resolve({
            success: false,
            error: `Insufficient stock: Requested ${params.quantity}, only ${targetProduct.stock} units remaining.`,
            executionTimeMs: execTime,
            remainingStock: targetProduct.stock,
          });
        }

        targetProduct.stock -= params.quantity;

        const newOrder: Order = {
          id: `ord-${randomUUID()}`,
          order_number: `ORD-${Date.now()}-${randomUUID().slice(0, 8).toUpperCase()}`,
          product_id: targetProduct.id,
          product_name: targetProduct.name,
          customer_name: params.customerName || "Enterprise Buyer",
          quantity: params.quantity,
          unit_price: targetProduct.price,
          total_price: targetProduct.price * params.quantity,
          status: "COMPLETED",
          created_at: new Date().toISOString(),
          execution_time_ms: execTime,
          note: "Committed via In-Memory Atomic Lock (Postgres will replace in Phase 1)",
        };

        memoryOrders.push(newOrder);
        return resolve({
          success: true,
          order: newOrder,
          executionTimeMs: execTime,
          remainingStock: targetProduct.stock,
        });
      });
    });
  }
}
