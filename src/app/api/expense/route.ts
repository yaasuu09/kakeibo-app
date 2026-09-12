import { NextResponse } from "next/server";

const GAS_ENDPOINT = "https://script.google.com/macros/s/AKfycbyqMMwjGFmRqwEN8AT_NJnIGPWCDOddlfSrCfFdxBy0dX5k2XI9hCIlXhNqxTHv4Qu3/exec";

export const dynamic = "force-dynamic";

export async function POST(request: Request) {
  try {
    const body = await request.json();

    const gasResponse = await fetch(GAS_ENDPOINT, {
      method: "POST",
      body: JSON.stringify(body),
      headers: {
        "Content-Type": "text/plain;charset=utf-8",
      },
      redirect: "follow",
    });

    if (!gasResponse.ok) {
      return NextResponse.json(
        { status: "error", message: `GAS通信エラー: HTTP ${gasResponse.status}` },
        { status: 502 }
      );
    }

    const data = await gasResponse.json();
    return NextResponse.json(data);
  } catch (error: unknown) {
    console.error("API proxy error to GAS:", error);
    const message = error instanceof Error ? error.message : "GASサーバーとの通信に失敗しました";
    return NextResponse.json(
      { status: "error", message },
      { status: 500 }
    );
  }
}

export async function GET() {
  try {
    const gasResponse = await fetch(GAS_ENDPOINT, {
      redirect: "follow",
    });

    if (!gasResponse.ok) {
      return NextResponse.json({ categories: [], stores: [] }, { status: 502 });
    }

    const data = await gasResponse.json();
    return NextResponse.json(data);
  } catch (error: unknown) {
    console.error("API proxy GET error to GAS:", error);
    return NextResponse.json({ categories: [], stores: [] }, { status: 500 });
  }
}
