import { NextResponse } from "next/server";
import { getOrders, createOrder } from "@/lib/db";

export const dynamic = "force-dynamic";

export async function GET() {
  try {
    const orders = await getOrders();
    return NextResponse.json({
      success: true,
      count: orders.length,
      orders,
    });
  } catch (error) {
    return NextResponse.json(
      {
        success: false,
        error:
          error instanceof Error ? error.message : "Failed to fetch orders",
      },
      { status: 500 },
    );
  }
}

export async function POST(request: Request) {
  try {
    const body = await request.json();
    const {
      productId,
      quantity = 1,
      customerName = "Apex Enterprise Partner",
    } = body;

    if (!productId) {
      return NextResponse.json(
        { success: false, error: "Missing required productId" },
        { status: 400 },
      );
    }

    const qty = parseInt(String(quantity), 10);
    if (isNaN(qty) || qty <= 0) {
      return NextResponse.json(
        { success: false, error: "Quantity must be a positive integer" },
        { status: 400 },
      );
    }

    const result = await createOrder({
      productId,
      quantity: qty,
      customerName,
    });

    if (!result.success) {
      return NextResponse.json(
        {
          success: false,
          error: result.error,
          executionTimeMs: result.executionTimeMs,
          remainingStock: result.remainingStock,
        },
        { status: 409 },
      );
    }

    return NextResponse.json(
      {
        success: true,
        order: result.order,
        executionTimeMs: result.executionTimeMs,
        remainingStock: result.remainingStock,
      },
      { status: 201 },
    );
  } catch (error) {
    return NextResponse.json(
      {
        success: false,
        error:
          error instanceof Error ? error.message : "Order processing failure",
      },
      { status: 500 },
    );
  }
}
