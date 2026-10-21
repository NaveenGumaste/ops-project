-- Tier 3: Database Schema for B2B Inventory & Order Fulfillment

-- 1. Products Table (The Pantry Shelves)
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

-- 2. Orders Table (The Transaction Ledger)
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

-- 3. Initial Enterprise Stock Seeding
INSERT INTO products (id, sku, name, category, price, stock, max_stock, description, specs)
VALUES 
(
    'prod-h100',
    'NV-H100-80G-SXM5',
    'NVIDIA H100 Tensor Core GPU 80GB SXM5',
    'Compute',
    32500.00,
    5,
    10,
    'Enterprise high-density AI accelerator with 3.35 TB/s memory bandwidth.',
    '["80GB HBM3 Memory", "SXM5 Form Factor", "700W TDP", "Gen5 PCIe / NVLink 4"]'::jsonb
),
(
    'prod-epyc',
    'AMD-EPYC-9654-2P',
    'Dual AMD EPYC 9654 96-Core 2U Server Node',
    'Compute',
    18900.00,
    8,
    15,
    '192-core / 384-thread dual-socket hyperscale compute server node.',
    '["192 Total Cores", "1.5TB DDR5 ECC Registered", "2x 100GbE QSFP28", "Redundant 2000W PSU"]'::jsonb
),
(
    'prod-switch',
    'MLX-SN4600-64Q',
    'NVIDIA Spectrum-3 64-Port 100GbE Spine Switch',
    'Networking',
    14200.00,
    12,
    20,
    'Ultra-low-latency 12.8Tbps non-blocking RoCEv2 datacenter spine switch.',
    '["64x 100GbE QSFP28", "12.8 Tbps Throughput", "Sub-400ns Port Latency", "Dual Hot-Swap Fans"]'::jsonb
),
(
    'prod-storage',
    'SAN-NVME-61TB-E3S',
    'PureFlex 61.44TB NVMe-oF Gen5 Storage Array',
    'Storage',
    24800.00,
    4,
    8,
    'Ultra-dense all-flash NVMe over RoCE target for high-throughput AI workloads.',
    '["61.44TB Raw NVMe", "Gen5 PCIe Dual-Port", "2.8M IOPS 4K Random", "Active-Active Controllers"]'::jsonb
),
(
    'prod-pdu',
    'APC-PDU-3P-48A',
    'Schneider APC 3-Phase Intelligent 48A Switched PDU',
    'Power',
    3400.00,
    16,
    30,
    'Remotely managed rack power distribution unit with outlet-level metering.',
    '["400V 3-Phase Delta", "24x C13 & 12x C19 Outlets", "SNMPv3 / TLS Management", "Environmental Sensors"]'::jsonb
)
ON CONFLICT (id) DO NOTHING;