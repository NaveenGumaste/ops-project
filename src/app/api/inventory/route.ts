import { NextResponse } from "next/server";
import { getProducts, resetInventory } from "@/lib/db";

export const dynamic = "force-dynamic";

export async function GET() {
  try {
    const products = await getProducts();
    return NextResponse.json(
      {
        success: true,
        count: products.length,
        products,
      },
      {
        headers: {
          "X-Tier": "Tier-2-Nextjs-Kitchen",
        },
      },
    );
  } catch (error) {
    return NextResponse.json(
      {
        success: false,
        error:
          error instanceof Error ? error.message : "Failed to fetch inventory",
      },
      { status: 500 },
    );
  }
}

export async function POST(request: Request) {
  try {
    const body = await request.json().catch(() => ({}));
    if (body.action === "reset") {
      await resetInventory();
      const products = await getProducts();
      return NextResponse.json({
        success: true,
        message: "Inventory reset to baseline seed state.",
        products,
      });
    }

    return NextResponse.json(
      { success: false, error: "Unsupported action" },
      { status: 400 },
    );
  } catch (error) {
    return NextResponse.json(
      {
        success: false,
        error:
          error instanceof Error ? error.message : "Failed to process request",
      },
      { status: 500 },
    );
  }
}
