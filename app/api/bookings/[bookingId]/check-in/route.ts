import { prisma } from "../../../../../lib/db";
import { getCurrentUser } from "../../../../../lib/auth";

export async function POST(
  request: Request,
  { params }: { params: Promise<{ bookingId: string }> },
) {
  try {
    const user = await getCurrentUser();

    if (!user) {
      return Response.json(
        { success: false, message: "Unauthorized" },
        { status: 401 },
      );
    }

    if (user.role !== "MEMBER") {
      return Response.json(
        { success: false, message: "Member access required" },
        { status: 403 },
      );
    }

    const { bookingId } = await params;
    const body = await request.json();

    if (typeof body.code !== "string" || !/^\d{6}$/.test(body.code)) {
      return Response.json(
        { success: false, message: "A valid six-digit code is required" },
        { status: 400 },
      );
    }

    const result = await prisma.$transaction(async (tx) => {
      const booking = await tx.booking.findUnique({
        where: { id: bookingId },
        include: { session: true },
      });

      if (!booking || booking.userId !== user.id) {
        return {
          status: 404,
          body: { success: false, message: "Booking not found" },
        };
      }

      if (booking.status !== "CONFIRMED") {
        return {
          status: 409,
          body: { success: false, message: "Booking is not confirmed" },
        };
      }

      const now = new Date();
      const start = booking.session.startsAt;
      const end = new Date(start.getTime() + 60 * 60 * 1000);

      if (now < start || now >= end) {
        return {
          status: 400,
          body: {
            success: false,
            message: "Check-in is only allowed during the session hour",
          },
        };
      }

      if (!booking.checkInCode || booking.checkInCode !== body.code) {
        return {
          status: 400,
          body: { success: false, message: "Invalid check-in code" },
        };
      }

      const updated = await tx.booking.updateMany({
        where: {
          id: booking.id,
          userId: user.id,
          status: "CONFIRMED",
          checkInCode: body.code,
        },
        data: {
          status: "ATTENDED",
          checkInCode: null,
        },
      });

      if (updated.count !== 1) {
        return {
          status: 409,
          body: {
            success: false,
            message: "Code already used or booking has changed",
          },
        };
      }

      return {
        status: 200,
        body: { success: true, message: "Check-in successful" },
      };
    });

    return Response.json(result.body, { status: result.status });
  } catch (error) {
    console.error("Member check-in failed:", error);

    return Response.json(
      { success: false, message: "Unable to complete check-in" },
      { status: 500 },
    );
  }
}
