import { prisma } from "../../../../../../lib/db";
import { getCurrentUser } from "../../../../../../lib/auth";

export async function POST(_request: Request, { params }: { params: Promise<{ sessionId: string }> }) {
  try {
    const admin = await getCurrentUser();
    if (!admin) return Response.json({ success: false, message: "Unauthorized" }, { status: 401 });
    if (admin.role !== "ADMIN") return Response.json({ success: false, message: "Admin access required" }, { status: 403 });

    const { sessionId } = await params;
    const session = await prisma.session.findUnique({ where: { id: sessionId } });
    if (!session) return Response.json({ success: false, message: "Session not found" }, { status: 404 });
    if (new Date() < new Date(session.startsAt.getTime() + 60 * 60 * 1000)) {
      return Response.json({ success: false, message: "Session can only be closed after it ends" }, { status: 400 });
    }

    const noShows = await prisma.$transaction(async (tx) => {
      await tx.booking.updateMany({
        where: { sessionId, status: "CONFIRMED" },
        data: { status: "NO_SHOW", checkInCode: null },
      });
      const bookings = await tx.booking.findMany({
        where: { sessionId, status: "NO_SHOW" },
        select: { id: true, userId: true },
      });
      for (const booking of bookings) {
        await tx.fine.upsert({
          where: { bookingId: booking.id },
          update: {},
          create: { bookingId: booking.id, userId: booking.userId, amount: 20, reason: "NO_SHOW" },
        });
      }
      return bookings.length;
    });

    return Response.json({ success: true, message: "Session closed; no-show fines processed", data: { noShows, fineAmount: 20 } });
  } catch (error) {
    console.error("Session close failed:", error);
    return Response.json({ success: false, message: "Unable to close session" }, { status: 500 });
  }
}
