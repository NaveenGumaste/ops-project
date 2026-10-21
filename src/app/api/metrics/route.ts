import { NextResponse } from "next/server";
import { getProducts, getOrders, checkDatabaseConnection } from "@/lib/db";

export const dynamic = "force-dynamic";

export async function GET() {
  const dbStatus = await checkDatabaseConnection();
  const products = await getProducts();
  const orders = await getOrders();

  // Count order outcomes
  const successfulOrders = orders.filter(
    (o) => o.status === "COMPLETED",
  ).length;
  const rejectedOrders = orders.filter(
    (o) => o.status === "REJECTED_OUT_OF_STOCK" || o.status === "FAILED",
  ).length;

  // Build standard Prometheus plain text lines
  const lines: string[] = [
    "# HELP b2b_database_connected 1 if PostgreSQL is healthy, 0 if degraded",
    "# TYPE b2b_database_connected gauge",
    `b2b_database_connected ${dbStatus.connected ? 1 : 0}`,
    "",
    "# HELP b2b_database_latency_ms Round-trip latency to Tier 3 PostgreSQL",
    "# TYPE b2b_database_latency_ms gauge",
    `b2b_database_latency_ms ${dbStatus.latencyMs}`,
    "",
    "# HELP b2b_orders_total Total orders processed by status",
    "# TYPE b2b_orders_total counter",
    `b2b_orders_total{status="success"} ${successfulOrders}`,
    `b2b_orders_total{status="rejected"} ${rejectedOrders}`,
    "",
    "# HELP b2b_inventory_stock Current stock remaining per SKU",
    "# TYPE b2b_inventory_stock gauge",
  ];

  for (const product of products) {
    // Escape product name safely for Prometheus labels
    const cleanName = product.name.replace(/"/g, '\\"');
    lines.push(
      `b2b_inventory_stock{sku="${product.sku}",name="${cleanName}"} ${product.stock}`,
    );
  }

  // Prometheus expects standard plain text format
  return new NextResponse(lines.join("\n") + "\n", {
    status: 200,
    headers: {
      "Content-Type": "text/plain; version=0.0.4; charset=utf-8",
      "Cache-Control": "no-store, max-age=0",
    },
  });
}
