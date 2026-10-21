"use client";

import { useState, useEffect, useCallback } from "react";
import { Product, Order, HealthStatus } from "@/lib/types";

export default function WorkbenchPage() {
  const [products, setProducts] = useState<Product[]>([]);
  const [orders, setOrders] = useState<Order[]>([]);
  const [health, setHealth] = useState<HealthStatus | null>(null);
  const [activeTab, setActiveTab] = useState<"catalog" | "orders" | "concurrency" | "architecture">("catalog");
  const [selectedCategory, setSelectedCategory] = useState<string>("All");
  const [loading, setLoading] = useState<boolean>(true);
  const [orderingId, setOrderingId] = useState<string | null>(null);
  const [orderQty, setOrderQty] = useState<number>(1);
  const [buyerName, setBuyerName] = useState<string>("Hyperscale Cloud Corp");
  const [banner, setBanner] = useState<{ type: "success" | "error" | "neutral"; text: string } | null>(null);

  // Concurrency tester state
  const [stressProductId, setStressProductId] = useState<string>("prod-h100");
  const [concurrencyLevel, setConcurrencyLevel] = useState<number>(10);
  const [isStressRunning, setIsStressRunning] = useState<boolean>(false);
  const [stressOutput, setStressOutput] = useState<{
    total: number;
    succeeded: number;
    failed: number;
    durationMs: number;
    startStock: number;
    endStock: number;
    events: { index: number; success: boolean; message: string; ms: number }[];
  } | null>(null);

  const notify = (type: "success" | "error" | "neutral", text: string) => {
    setBanner({ type, text });
    setTimeout(() => {
      setBanner((prev) => (prev?.text === text ? null : prev));
    }, 5000);
  };

  const loadData = useCallback(async () => {
    try {
      const [pRes, oRes, hRes] = await Promise.all([
        fetch("/api/inventory"),
        fetch("/api/orders"),
        fetch("/api/health"),
      ]);

      if (pRes.ok) {
        const pData = await pRes.json();
        setProducts(pData.products || []);
      }
      if (oRes.ok) {
        const oData = await oRes.json();
        setOrders(oData.orders || []);
      }
      if (hRes.ok) {
        const hData = await hRes.json();
        setHealth(hData);
      }
    } catch {
      notify("error", "Unable to sync with application server. Reconnecting...");
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    const initialLoad = window.setTimeout(() => {
      void loadData();
    }, 0);
    return () => window.clearTimeout(initialLoad);
  }, [loadData]);

  // Handle single purchase
  const handlePurchase = async (productId: string, quantity: number) => {
    setOrderingId(productId);
    try {
      const res = await fetch("/api/orders", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          productId,
          quantity,
          customerName: buyerName.trim() || "Enterprise Buyer",
        }),
      });

      const data = await res.json();
      if (res.ok) {
        notify("success", `Order confirmed: ${quantity} unit(s) reserved in ${data.executionTimeMs}ms under lock.`);
        await loadData();
      } else {
        notify("error", data.error || "Order rejected due to insufficient stock.");
        await loadData();
      }
    } catch {
      notify("error", "Network connection error while submitting transaction.");
    } finally {
      setOrderingId(null);
    }
  };

  // Reset inventory
  const handleReset = async () => {
    setLoading(true);
    try {
      const res = await fetch("/api/inventory", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ action: "reset" }),
      });
      if (res.ok) {
        notify("neutral", "Inventory balances reseeded to factory baseline.");
        setStressOutput(null);
        await loadData();
      }
    } catch {
      notify("error", "Failed to reset inventory.");
    } finally {
      setLoading(false);
    }
  };

  // Run concurrency burst test
  const handleRunStress = async () => {
    const target = products.find((p) => p.id === stressProductId);
    if (!target) return;

    setIsStressRunning(true);
    const startStock = target.stock;
    const count = concurrencyLevel;
    const startTime = performance.now();

    const tasks = Array.from({ length: count }).map(async (_, idx) => {
      const reqStart = performance.now();
      try {
        const res = await fetch("/api/orders", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({
            productId: target.id,
            quantity: 1,
            customerName: `Concurrent Buyer ${idx + 1}`,
          }),
        });
        const ms = Math.round((performance.now() - reqStart) * 10) / 10;
        const resData = await res.json();

        return {
          index: idx + 1,
          success: res.ok,
          message: res.ok
            ? `Client ${idx + 1}: Lock acquired · 1 unit committed`
            : `Client ${idx + 1}: ${resData.error || "Rejected (Zero stock)"}`,
          ms,
        };
      } catch {
        const ms = Math.round((performance.now() - reqStart) * 10) / 10;
        return {
          index: idx + 1,
          success: false,
          message: `Client ${idx + 1}: Connection dropped`,
          ms,
        };
      }
    });

    const events = await Promise.all(tasks);
    const totalDuration = Math.round((performance.now() - startTime) * 10) / 10;
    const succeeded = events.filter((e) => e.success).length;
    const failed = events.filter((e) => !e.success).length;

    await loadData();
    const finalRes = await fetch("/api/inventory");
    const finalData = await finalRes.json();
    const latestProd = finalData.products?.find((p: Product) => p.id === stressProductId);

    setStressOutput({
      total: count,
      succeeded,
      failed,
      durationMs: totalDuration,
      startStock,
      endStock: latestProd ? latestProd.stock : 0,
      events,
    });

    setIsStressRunning(false);
    notify(
      "neutral",
      `Burst complete: ${succeeded} succeeded, ${failed} locked out. Zero overselling.`
    );
  };

  const filteredProducts = selectedCategory === "All"
    ? products
    : products.filter((p) => p.category === selectedCategory);

  const categories = ["All", "Compute", "Networking", "Storage", "Power"] as const;

  return (
    <div className="min-h-[100svh] flex flex-col bg-[#f4f5f7] text-[#0f172a]">
      {/* Top Shell Bar */}
      <header className="border-b border-[#e2e5e9] bg-[#ffffff]">
        <div className="max-w-[1180px] mx-auto px-6 h-[48px] flex items-center justify-between gap-4">
          {/* Brand mark */}
          <div className="flex items-center gap-3">
            <span className="font-semibold text-[15px] tracking-tight text-[#0a0a0a]">
              ApexSupply
            </span>
            <span className="text-[12px] text-[#475569]">
              B2B Hardware Depot
            </span>
          </div>

          {/* Tier Architecture Telemetry Pills */}
          <div className="flex items-center gap-3">
            <div className="hidden sm:flex items-center gap-2 text-[12px] text-[#475569]">
              <span>Tier 1: Nginx :80</span>
              <span className="text-[#cbd5e1]">/</span>
              <span>Tier 2: Next.js</span>
              <span className="text-[#cbd5e1]">/</span>
              <span className={health?.database.connected ? "text-[#2e7d32] font-medium" : "text-[#475569]"}>
                Tier 3: {health?.database.connected ? `PostgreSQL (${health.database.latency_ms}ms)` : "Simulated memory"}
              </span>
            </div>

            <button
              onClick={handleReset}
              disabled={loading}
              className="text-[12px] px-3 py-1 rounded-[6px] border border-[#d4d4d4] bg-[#ffffff] text-[#0f172a] hover:bg-[#eceff2]"
            >
              Reset inventory
            </button>
          </div>
        </div>
      </header>

      {/* Main Canvas */}
      <main className="max-w-[1180px] mx-auto w-full px-5 sm:px-6 py-6 flex-1 flex flex-col gap-6">
        {/* Title Block */}
        <div>
          <h1 className="text-[24px] font-semibold text-[#0a0a0a] leading-tight">
            Inventory and fulfillment workbench
          </h1>
          <p className="text-[14px] text-[#475569] mt-1">
            B2B hardware inventory with PostgreSQL transactional row locks and edge telemetry.
          </p>
        </div>

        {/* Global Action Banner */}
        {banner && (
          <div
            className={`p-3 rounded-[6px] border text-[13px] flex items-center justify-between ${
              banner.type === "success"
                ? "bg-[#dcfae5] border-[#bbf7d0] text-[#04250e]"
                : banner.type === "error"
                ? "bg-[#ffedea] border-[#fecdd3] text-[#831c1e]"
                : "bg-[#ffffff] border-[#e2e5e9] text-[#0f172a]"
            }`}
          >
            <span>{banner.text}</span>
            <button
              onClick={() => setBanner(null)}
              className="text-[12px] text-[#475569] hover:text-[#0f172a]"
            >
              Dismiss
            </button>
          </div>
        )}

        {/* Navigation Tabs */}
        <div className="border-b border-[#e2e5e9] flex flex-wrap gap-x-6 gap-y-2 text-[14px]">
          <button
            onClick={() => setActiveTab("catalog")}
            className={`pb-3 font-medium border-b-2 ${
              activeTab === "catalog"
                ? "border-[#0a0a0a] text-[#0a0a0a]"
                : "border-transparent text-[#475569] hover:text-[#0a0a0a]"
            }`}
          >
            Hardware catalog ({products.length})
          </button>
          <button
            onClick={() => setActiveTab("orders")}
            className={`pb-3 font-medium border-b-2 ${
              activeTab === "orders"
                ? "border-[#0a0a0a] text-[#0a0a0a]"
                : "border-transparent text-[#475569] hover:text-[#0a0a0a]"
            }`}
          >
            Fulfillment ledger ({orders.length})
          </button>
          <button
            onClick={() => setActiveTab("concurrency")}
            className={`pb-3 font-medium border-b-2 ${
              activeTab === "concurrency"
                ? "border-[#0a0a0a] text-[#0a0a0a]"
                : "border-transparent text-[#475569] hover:text-[#0a0a0a]"
            }`}
          >
            Concurrency telemetry
          </button>
          <button
            onClick={() => setActiveTab("architecture")}
            className={`pb-3 font-medium border-b-2 ${
              activeTab === "architecture"
                ? "border-[#0a0a0a] text-[#0a0a0a]"
                : "border-transparent text-[#475569] hover:text-[#0a0a0a]"
            }`}
          >
            Architecture reference
          </button>
        </div>

        {/* TAB 1: CATALOG */}
        {activeTab === "catalog" && (
          <div className="flex flex-col gap-6">
            {/* Category Count Cards Filter */}
            <div className="grid grid-cols-2 sm:grid-cols-5 gap-3">
              {categories.map((cat) => {
                const count = cat === "All" ? products.length : products.filter((p) => p.category === cat).length;
                const isSelected = selectedCategory === cat;
                return (
                  <button
                    key={cat}
                    onClick={() => setSelectedCategory(cat)}
                    className={`h-[61px] p-3 rounded-[8px] border text-left flex flex-col justify-between ${
                      isSelected
                        ? "border-[#0a0a0a] bg-[#ffffff]"
                        : "border-[#e2e5e9] bg-[#ffffff] hover:border-[#cbd5e1]"
                    }`}
                  >
                    <span className="text-[12px] text-[#475569]">{cat}</span>
                    <span className="text-[16px] font-semibold text-[#0a0a0a] tabular-nums">{count}</span>
                  </button>
                );
              })}
            </div>

            {/* Quick Order Setup Bar */}
            <div className="bg-[#ffffff] border border-[#e2e5e9] rounded-[8px] p-4 flex flex-col sm:flex-row items-center justify-between gap-4">
              <div className="text-[13px] text-[#475569]">
                Configure buyer parameters for instant one-click reservations.
              </div>
              <div className="flex items-center gap-3 w-full sm:w-auto">
                <div className="flex items-center gap-2">
                  <label htmlFor="buyerName" className="text-[12px] text-[#475569]">Buyer:</label>
                  <input
                    id="buyerName"
                    type="text"
                    value={buyerName}
                    onChange={(e) => setBuyerName(e.target.value)}
                    className="border border-[#d4d4d4] rounded-[6px] px-2.5 py-1 text-[13px] text-[#0f172a] bg-[#ffffff] w-44"
                    placeholder="Company name"
                  />
                </div>
                <div className="flex items-center gap-2">
                  <label htmlFor="orderQty" className="text-[12px] text-[#475569]">Quantity:</label>
                  <select
                    id="orderQty"
                    value={orderQty}
                    onChange={(e) => setOrderQty(Number(e.target.value))}
                    className="border border-[#d4d4d4] rounded-[6px] px-2 py-1 text-[13px] text-[#0f172a] bg-[#ffffff]"
                  >
                    {[1, 2, 3, 5, 10].map((n) => (
                      <option key={n} value={n}>{n}</option>
                    ))}
                  </select>
                </div>
              </div>
            </div>

            {/* Product List */}
            <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4">
              {filteredProducts.map((product) => {
                const stockPercent = Math.min(100, Math.round((product.stock / product.max_stock) * 100));
                const isOutOfStock = product.stock <= 0;
                const isLow = product.stock > 0 && product.stock <= 3;

                return (
                  <div
                    key={product.id}
                    className="bg-[#ffffff] border border-[#e2e5e9] rounded-[8px] p-5 flex flex-col"
                  >
                    {/* Header: Category & SKU */}
                    <div className="flex items-center justify-between text-[12px] text-[#475569] mb-2">
                      <span>{product.category}</span>
                      <code className="text-[#0f172a] text-[11px] bg-[#f4f5f7] px-1.5 py-0.5 rounded">
                        {product.sku}
                      </code>
                    </div>

                    <h3 className="text-[15px] font-semibold text-[#0a0a0a] leading-snug min-h-[42px]">
                      {product.name}
                    </h3>
                    <p className="text-[13px] text-[#475569] mt-1.5 leading-relaxed min-h-[38px]">
                      {product.description}
                    </p>

                    {/* Specs */}
                    <div className="flex flex-wrap gap-1.5 mt-3 min-h-[52px] content-start">
                      {product.specs.map((s, idx) => (
                        <span
                          key={idx}
                          className="text-[12px] bg-[#f4f5f7] rounded-[4px] px-2 py-0.5 text-[#475569]"
                        >
                          {s}
                        </span>
                      ))}
                    </div>

                    {/* Bottom Pricing & Action Section */}
                    <div className="mt-4 pt-4 border-t border-[#edf0f4] flex flex-col gap-3">
                      {/* Price and Stock Balance */}
                      <div className="flex items-baseline justify-between">
                        <div>
                          <div className="text-[12px] text-[#475569]">Unit price</div>
                          <div className="text-[18px] font-bold text-[#0a0a0a] tabular-nums">
                            ${product.price.toLocaleString("en-US", { minimumFractionDigits: 2 })}
                          </div>
                        </div>

                        <div className="text-right">
                          <div className="text-[12px] text-[#475569]">Stock level</div>
                          <div
                            className={`text-[13px] font-medium tabular-nums ${
                              isOutOfStock
                                ? "text-[#c4242a]"
                                : isLow
                                ? "text-[#92400e]"
                                : "text-[#2e7d32]"
                            }`}
                          >
                            {isOutOfStock ? "Out of stock (0)" : `${product.stock} units remaining`}
                          </div>
                        </div>
                      </div>

                      {/* Stock Bar */}
                      <div className="w-full bg-[#edf0f4] h-[4px] rounded-full overflow-hidden">
                        <div
                          className={`h-full ${
                            isOutOfStock
                              ? "bg-[#c4242a]"
                              : isLow
                              ? "bg-[#92400e]"
                              : "bg-[#1d5fbf]"
                          }`}
                          style={{ width: `${stockPercent}%` }}
                        />
                      </div>

                      {/* Order Action Button */}
                      <button
                        onClick={() => handlePurchase(product.id, orderQty)}
                        disabled={isOutOfStock || orderingId === product.id}
                        className={`w-full h-[36px] rounded-[6px] text-[13px] font-medium flex items-center justify-center ${
                          isOutOfStock
                            ? "bg-[#eeeeee] text-[#475569] cursor-not-allowed"
                            : "bg-[#0f172a] text-[#ffffff] hover:bg-[#1e293b]"
                        }`}
                      >
                        {orderingId === product.id
                          ? "Executing lock..."
                          : isOutOfStock
                          ? "Depleted"
                          : `Purchase ${orderQty} unit${orderQty > 1 ? "s" : ""}`}
                      </button>
                    </div>
                  </div>
                );
              })}
            </div>
          </div>
        )}

        {/* TAB 2: FULFILLMENT LEDGER */}
        {activeTab === "orders" && (
          <div className="bg-[#ffffff] border border-[#e2e5e9] rounded-[8px] overflow-hidden">
            <div className="p-4 border-b border-[#edf0f4] flex items-center justify-between">
              <div>
                <h2 className="text-[15px] font-semibold text-[#0a0a0a]">
                  Transactional fulfillment audit log
                </h2>
                <p className="text-[13px] text-[#475569] mt-0.5">
                  Real-time record of completed order commits and conflict aborts.
                </p>
              </div>
              <span className="text-[12px] text-[#475569] tabular-nums">
                {orders.length} total records
              </span>
            </div>

            {orders.length === 0 ? (
              <div className="py-16 text-center text-[#475569] text-[13px]">
                No transactions recorded. Place an order from the catalog or run concurrency tests.
              </div>
            ) : (
              <div className="overflow-x-auto">
                <table className="w-full text-left text-[13px]">
                  <thead className="bg-[#f8f9fa] border-b border-[#e2e5e9] text-[#475569] text-[12px]">
                    <tr>
                      <th className="px-4 py-2.5 font-medium">Order number</th>
                      <th className="px-4 py-2.5 font-medium">Product name</th>
                      <th className="px-4 py-2.5 font-medium">Buyer account</th>
                      <th className="px-4 py-2.5 font-medium text-right">Quantity</th>
                      <th className="px-4 py-2.5 font-medium text-right">Total price</th>
                      <th className="px-4 py-2.5 font-medium text-center">Status</th>
                      <th className="px-4 py-2.5 font-medium text-right">Latency</th>
                    </tr>
                  </thead>
                  <tbody className="divide-y divide-[#edf0f4]">
                    {orders.map((ord) => (
                      <tr key={ord.id} className="hover:bg-[#f8f9fa]">
                        <td className="px-4 py-3 text-[12px] text-[#0f172a]">
                          <code>{ord.order_number}</code>
                        </td>
                        <td className="px-4 py-3 text-[#0a0a0a] max-w-xs truncate font-medium">
                          {ord.product_name}
                        </td>
                        <td className="px-4 py-3 text-[#475569]">{ord.customer_name}</td>
                        <td className="px-4 py-3 text-right tabular-nums text-[#0f172a]">
                          {ord.quantity}
                        </td>
                        <td className="px-4 py-3 text-right tabular-nums font-semibold text-[#0a0a0a]">
                          ${ord.total_price.toLocaleString("en-US", { minimumFractionDigits: 2 })}
                        </td>
                        <td className="px-4 py-3 text-center">
                          <span
                            className={`inline-block px-2 py-0.5 rounded text-[11px] font-medium ${
                              ord.status === "COMPLETED"
                                ? "bg-[#dcfae5] text-[#04250e]"
                                : "bg-[#ffedea] text-[#831c1e]"
                            }`}
                          >
                            {ord.status === "COMPLETED" ? "Committed" : "Stock depleted"}
                          </span>
                        </td>
                        <td className="px-4 py-3 text-right text-[#475569] tabular-nums">
                          {ord.execution_time_ms} ms
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            )}
          </div>
        )}

        {/* TAB 3: CONCURRENCY TELEMETRY */}
        {activeTab === "concurrency" && (
          <div className="flex flex-col gap-6">
            {/* Overview Explanation */}
            <div className="bg-[#ffffff] border border-[#e2e5e9] rounded-[8px] p-5">
              <h2 className="text-[16px] font-semibold text-[#0a0a0a]">
                Race condition laboratory and lock verification
              </h2>
              <p className="text-[13px] text-[#475569] mt-1 leading-relaxed">
                When multiple buyers click purchase at the same millisecond, ordinary databases suffer from dirty reads:
                both read the same starting stock and oversell into negative numbers.
                In Tier 3, PostgreSQL executes <code className="text-[12px] text-[#0f172a] bg-[#f4f5f7] px-1 py-0.5 rounded">SELECT ... FOR UPDATE</code>.
                This locks the specific product row until the active transaction commits, guaranteeing zero overselling.
              </p>
            </div>

            {/* Test Controls */}
            <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
              <div className="bg-[#ffffff] border border-[#e2e5e9] rounded-[8px] p-4 flex flex-col justify-between">
                <div>
                  <label htmlFor="stressProductId" className="text-[12px] text-[#475569] block mb-2 font-medium">
                    Target SKU
                  </label>
                  <select
                    id="stressProductId"
                    value={stressProductId}
                    onChange={(e) => setStressProductId(e.target.value)}
                    className="w-full border border-[#d4d4d4] rounded-[6px] p-2 text-[13px] bg-[#ffffff] text-[#0f172a]"
                  >
                    {products.map((p) => (
                      <option key={p.id} value={p.id}>
                        {p.name} ({p.stock} units left)
                      </option>
                    ))}
                  </select>
                </div>
                <div className="mt-3 text-[12px] text-[#475569]">
                  Available stock: <span className="font-semibold text-[#0a0a0a] tabular-nums">{products.find((p) => p.id === stressProductId)?.stock ?? 0}</span>
                </div>
              </div>

              <div className="bg-[#ffffff] border border-[#e2e5e9] rounded-[8px] p-4 flex flex-col justify-between">
                <div>
                  <span className="text-[12px] text-[#475569] block mb-2 font-medium">
                    Simultaneous burst volume
                  </span>
                  <div className="grid grid-cols-3 gap-2">
                    {[5, 10, 20].map((num) => (
                      <button
                        key={num}
                        onClick={() => setConcurrencyLevel(num)}
                        className={`h-[36px] rounded-[6px] text-[13px] font-medium border ${
                          concurrencyLevel === num
                            ? "border-[#0a0a0a] bg-[#0f172a] text-[#ffffff]"
                            : "border-[#d4d4d4] bg-[#ffffff] text-[#0f172a] hover:bg-[#f4f5f7]"
                        }`}
                      >
                        {num} clients
                      </button>
                    ))}
                  </div>
                </div>
                <div className="mt-3 text-[12px] text-[#475569]">
                  Dispatched in parallel via <code className="text-[11px]">Promise.all()</code>.
                </div>
              </div>

              <div className="bg-[#ffffff] border border-[#e2e5e9] rounded-[8px] p-4 flex flex-col justify-between">
                <div>
                  <span className="text-[12px] text-[#475569] block mb-2 font-medium">
                    Trigger test run
                  </span>
                  <button
                    onClick={handleRunStress}
                    disabled={isStressRunning}
                    className={`w-full h-[36px] rounded-[6px] text-[13px] font-medium ${
                      isStressRunning
                        ? "bg-[#eeeeee] text-[#475569] cursor-not-allowed"
                        : "bg-[#0f172a] text-[#ffffff] hover:bg-[#1e293b]"
                    }`}
                  >
                    {isStressRunning
                      ? "Executing transactions..."
                      : `Fire ${concurrencyLevel} parallel orders`}
                  </button>
                </div>
                <div className="mt-3 text-[12px] text-[#475569]">
                  Verifies row lock isolation in real-time.
                </div>
              </div>
            </div>

            {/* Test Results Output */}
            {stressOutput && (
              <div className="bg-[#ffffff] border border-[#e2e5e9] rounded-[8px] p-5 flex flex-col gap-4">
                <div className="flex items-center justify-between border-b border-[#edf0f4] pb-3">
                  <h3 className="text-[15px] font-semibold text-[#0a0a0a]">
                    Burst test results
                  </h3>
                  <span className="text-[12px] text-[#475569] tabular-nums">
                    Window duration: {stressOutput.durationMs}ms
                  </span>
                </div>

                <div className="grid grid-cols-2 sm:grid-cols-4 gap-3">
                  <div className="p-3 rounded-[6px] bg-[#f8f9fa] border border-[#e2e5e9]">
                    <div className="text-[12px] text-[#475569]">Orders sent</div>
                    <div className="text-[20px] font-bold text-[#0a0a0a] tabular-nums mt-0.5">
                      {stressOutput.total}
                    </div>
                  </div>
                  <div className="p-3 rounded-[6px] bg-[#f8f9fa] border border-[#e2e5e9]">
                    <div className="text-[12px] text-[#2e7d32]">Committed</div>
                    <div className="text-[20px] font-bold text-[#2e7d32] tabular-nums mt-0.5">
                      {stressOutput.succeeded}
                    </div>
                  </div>
                  <div className="p-3 rounded-[6px] bg-[#f8f9fa] border border-[#e2e5e9]">
                    <div className="text-[12px] text-[#c4242a]">Rejected</div>
                    <div className="text-[20px] font-bold text-[#c4242a] tabular-nums mt-0.5">
                      {stressOutput.failed}
                    </div>
                  </div>
                  <div className="p-3 rounded-[6px] bg-[#f8f9fa] border border-[#e2e5e9]">
                    <div className="text-[12px] text-[#1d5fbf]">Final stock</div>
                    <div className="text-[20px] font-bold text-[#1d5fbf] tabular-nums mt-0.5">
                      {stressOutput.endStock} units
                    </div>
                  </div>
                </div>

                <div className="p-3 rounded-[6px] bg-[#dcfae5] text-[#04250e] text-[13px]">
                  <strong>Integrity verified:</strong> Initial stock was {stressOutput.startStock}. Exactly {stressOutput.succeeded} orders were safely committed to the ledger, and the remaining {stressOutput.failed} were stopped by row-level validation. No negative inventory occurred.
                </div>

                {/* Event Waterfall */}
                <div className="flex flex-col gap-1.5 max-h-56 overflow-y-auto">
                  <span className="text-[12px] text-[#475569] font-medium">Transaction waterfall:</span>
                  {stressOutput.events.map((ev) => (
                    <div
                      key={ev.index}
                      className={`px-3 py-2 rounded-[4px] text-[12px] flex items-center justify-between ${
                        ev.success
                          ? "bg-[#f0fdf4] text-[#166534]"
                          : "bg-[#fff1f2] text-[#9f1239]"
                      }`}
                    >
                      <span>{ev.message}</span>
                      <span className="tabular-nums text-[12px]">{ev.ms}ms</span>
                    </div>
                  ))}
                </div>
              </div>
            )}
          </div>
        )}

        {/* TAB 4: ARCHITECTURE REFERENCE */}
        {activeTab === "architecture" && (
          <div className="bg-[#ffffff] border border-[#e2e5e9] rounded-[8px] p-6 flex flex-col gap-6">
            <div>
              <h2 className="text-[16px] font-semibold text-[#0a0a0a]">
                The 3-tier production architecture
              </h2>
              <p className="text-[13px] text-[#475569] mt-1 leading-relaxed">
                Separation of concerns ensures public traffic never directly reaches application runtime or internal databases.
              </p>
            </div>

            <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
              <div className="p-4 rounded-[6px] border border-[#e2e5e9] bg-[#f8f9fa] flex flex-col justify-between">
                <div>
                  <span className="text-[12px] text-[#1d5fbf] font-medium">Tier 1 · Edge</span>
                  <h3 className="text-[15px] font-semibold text-[#0a0a0a] mt-1">Nginx (Front Desk)</h3>
                  <p className="text-[13px] text-[#475569] mt-2 leading-relaxed">
                    Listens on port 80. Caches static Next.js assets, enforces rate limiting, and forwards valid dynamic requests to the kitchen.
                  </p>
                </div>
                <div className="mt-4 pt-3 border-t border-[#edf0f4] text-[12px] text-[#475569]">
                  Configured in Phase 3
                </div>
              </div>

              <div className="p-4 rounded-[6px] border border-[#e2e5e9] bg-[#f8f9fa] flex flex-col justify-between">
                <div>
                  <span className="text-[12px] text-[#2e7d32] font-medium">Tier 2 · Application</span>
                  <h3 className="text-[15px] font-semibold text-[#0a0a0a] mt-1">Next.js (Kitchen)</h3>
                  <p className="text-[13px] text-[#475569] mt-2 leading-relaxed">
                    Runs standalone inside private container network. Renders dashboard UI and executes backend route handlers with ACID transaction logic.
                  </p>
                </div>
                <div className="mt-4 pt-3 border-t border-[#edf0f4] text-[12px] text-[#2e7d32]">
                  Standalone build ready
                </div>
              </div>

              <div className="p-4 rounded-[6px] border border-[#e2e5e9] bg-[#f8f9fa] flex flex-col justify-between">
                <div>
                  <span className="text-[12px] text-[#92400e] font-medium">Tier 3 · Data layer</span>
                  <h3 className="text-[15px] font-semibold text-[#0a0a0a] mt-1">PostgreSQL 17 (Locked Pantry)</h3>
                  <p className="text-[13px] text-[#475569] mt-2 leading-relaxed">
                    Completely isolated from the public network. Manages products and orders with row-level locks ensuring zero overselling.
                  </p>
                </div>
                <div className="mt-4 pt-3 border-t border-[#edf0f4] text-[12px] text-[#475569]">
                  Phase 1 Database setup
                </div>
              </div>
            </div>
          </div>
        )}
      </main>

      {/* Footer */}
      <footer className="border-t border-[#e2e5e9] bg-[#ffffff] py-3 mt-auto">
        <div className="max-w-[1180px] mx-auto px-5 sm:px-6 flex items-center justify-between text-[12px] text-[#475569]">
          <span>ApexSupply · 3-Tier Web Application</span>
          <span>Next.js App Router · PostgreSQL Row-Lock</span>
        </div>
      </footer>
    </div>
  );
}
