import { prisma } from "../../../../../lib/db";
import { getCurrentUser } from "../../../../../lib/auth";

export async function PATCH(request: Request, { params }: { params: Promise<{ fineId: string }> }) {
  try {
    const admin = await getCurrentUser();
    if (!admin) return Response.json({ success: false, message: "Unauthorized" }, { status: 401 });
    if (admin.role !== "ADMIN") return Response.json({ success: false, message: "Admin access required" }, { status: 403 });

    const { fineId } = await params;
    const body = await request.json().catch(() => ({}));
    if (body?.action !== "WAIVE" && body?.action !== "MARK_PAID") {
      return Response.json({ success: false, message: "action must be WAIVE or MARK_PAID" }, { status: 400 });
    }

    const fine = await prisma.fine.findUnique({ where: { id: fineId } });
    if (!fine) return Response.json({ success: false, message: "Fine not found" }, { status: 404 });
    if (fine.status !== "UNPAID") return Response.json({ success: false, message: "Only unpaid fines can be updated" }, { status: 409 });

    const updated = await prisma.fine.update({
      where: { id: fineId },
      data: body.action === "WAIVE" ? { status: "WAIVED", waivedById: admin.id } : { status: "PAID" },
    });
    return Response.json({ success: true, message: body.action === "WAIVE" ? "Fine waived" : "Fine marked as paid", data: updated });
  } catch (error) {
    console.error("Fine update failed:", error);
    return Response.json({ success: false, message: "Unable to update fine" }, { status: 500 });
  }
}
