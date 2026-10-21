export interface Product {
  id: string;
  sku: string;
  name: string;
  category: "Compute" | "Networking" | "Storage" | "Power";
  price: number;
  stock: number;
  max_stock: number;
  description: string;
  specs: string[];
}

export interface Order {
  id: string;
  order_number: string;
  product_id: string;
  product_name: string;
  customer_name: string;
  quantity: number;
  unit_price: number;
  total_price: number;
  status: "COMPLETED" | "REJECTED_OUT_OF_STOCK" | "FAILED";
  created_at: string;
  execution_time_ms: number;
  note?: string;
}

export interface HealthStatus {
  status: "healthy" | "degraded" | "offline";
  uptime_seconds: number;
  database: {
    connected: boolean;
    mode: "postgres" | "simulated_memory";
    latency_ms: number;
    active_connections?: number;
    error?: string;
  };
  tier: {
    tier1_nginx: "ready" | "bypassed_direct_port_3000";
    tier2_nextjs: "running";
    tier3_postgres: "connected" | "simulated_fallback";
  };
  timestamp: string;
}

export interface ConcurrencyTestResult {
  batch_id: string;
  product_id: string;
  requested_orders: number;
  successful_orders: number;
  failed_orders: number;
  initial_stock: number;
  remaining_stock: number;
  total_duration_ms: number;
  individual_results: {
    request_index: number;
    order_id?: string;
    status: "SUCCESS" | "STOCK_DEPLETED" | "LOCKED_OUT" | "ERROR";
    message: string;
    duration_ms: number;
  }[];
}
