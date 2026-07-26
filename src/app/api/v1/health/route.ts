import { NextResponse } from "next/server";

const NO_STORE_HEADERS = {
  "Cache-Control": "no-store, max-age=0",
};

export async function GET() {
  return NextResponse.json(
    {
      success: true,
      data: { status: "ok" },
    },
    { headers: NO_STORE_HEADERS }
  );
}
