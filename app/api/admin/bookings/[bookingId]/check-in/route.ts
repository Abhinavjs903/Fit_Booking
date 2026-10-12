
import { randomInt } from "crypto";
import { prisma } from "../../../../../../lib/db";
import { getCurrentUser } from "../../../../../../lib/auth";

export async function POST(
  _request: Request,
  { params }: { params: Promise<{ bookingId: string }> },
) {
  try {
    const admin = await getCurrentUser();

    if (!admin) {
      return Response.json(
        { success: false, message: "Unauthorized" },
        { status: 401 },
      );
    }

    if (admin.role !== "ADMIN") {
      return Response.json(
        { success: false, message: "Admin access required" },
        { status: 403 },
      );
    }

    const { bookingId } = await params;

    const booking = await prisma.booking.findUnique({
      where: { id: bookingId },
      include: { session: true },
    });

    if (!booking) {
      return Response.json(
        { success: false, message: "Booking not found" },
        { status: 404 },
      );
    }

    if (booking.status !== "CONFIRMED") {
      return Response.json(
        { success: false, message: "Booking is not confirmed" },
        { status: 409 },
      );
    }

    const now = new Date();
    const sessionStart = booking.session.startsAt;
    const sessionEnd = new Date(sessionStart.getTime() + 60 * 60 * 1000);

    if (now < sessionStart || now >= sessionEnd) {
      return Response.json(
        {
          success: false,
          message: "Check-in codes can only be generated during the session hour",
        },
        { status: 400 },
      );
    }

    const code = String(randomInt(0, 1_000_000)).padStart(6, "0");

    const updated = await prisma.booking.update({
      where: { id: booking.id },
      data: { checkInCode: code },
      select: { id: true, checkInCode: true },
    });

    return Response.json({
      success: true,
      message: "Check-in code generated",
      data: updated,
    });
  } catch (error) {
    console.error("Check-in code generation failed:", error);

    return Response.json(
      { success: false, message: "Unable to generate check-in code" },
      { status: 500 },
    );
  }
}
