// POST /api/imports/process
// Manual Import Center upload. Accepts multipart/form-data: file + optional
// source (else auto-detected). Runs the connector pipeline end-to-end.

export const dynamic = "force-dynamic";

import { NextResponse } from "next/server";
import { runImportPipeline } from "@/lib/connectors/pipeline";

export async function POST(req: Request) {
  const form = await req.formData().catch(() => null);
  if (!form) return NextResponse.json({ error: "Invalid form data" }, { status: 400 });

  const file = form.get("file") as File | null;
  const source = (form.get("source") as string | null) || undefined;
  const companyId = parseInt((form.get("company_id") as string) || "1", 10);
  if (!file) return NextResponse.json({ error: "No file provided" }, { status: 400 });

  const buffer = Buffer.from(await file.arrayBuffer());
  const result = await runImportPipeline({
    buffer, filename: file.name, source, companyId, origin: "manual",
  });

  return NextResponse.json(result, { status: result.ok ? 200 : 422 });
}
