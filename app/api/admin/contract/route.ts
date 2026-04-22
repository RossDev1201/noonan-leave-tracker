import { NextResponse } from "next/server";
import { getServerSession } from "next-auth";
import { authOptions } from "@/lib/auth";
import { getAllContractConfigs, upsertContractConfig } from "@/lib/googleSheets";

export const dynamic = "force-dynamic";

export async function GET() {
  const session = await getServerSession(authOptions);
  const user = session?.user as { role?: string } | undefined;
  if (!user || user.role !== "admin") {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }
  const configs = await getAllContractConfigs();
  return NextResponse.json({ configs });
}

export async function PUT(req: Request) {
  const session = await getServerSession(authOptions);
  const user = session?.user as { role?: string } | undefined;
  if (!user || user.role !== "admin") {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }
  const body = await req.json() as {
    employeeId: string;
    contractValue: number;
    hourlyRate: number;
    internetFee: number;
    medicalFee: number;
    department: string;
  };
  if (!body.employeeId) {
    return NextResponse.json({ error: "employeeId required" }, { status: 400 });
  }
  await upsertContractConfig(body);
  return NextResponse.json({ ok: true });
}
