
import { prisma } from "../../../../lib/db";
import { getCurrentUser } from "../../../../lib/auth";

type RouteContext = {
  params: Promise<{ bookingId: string }>;
};

export async function DELETE(
  _request: Request,
  { params }: RouteContext,
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

    if (!bookingId) {
      return Response.json(
        { success: false, message: "Booking ID is required" },
        { status: 400 },
      );
    }

    const result = await prisma.$transaction(async (tx) => {
      const initialBooking = await tx.booking.findUnique({
        where: { id: bookingId },
      });

      if (!initialBooking || initialBooking.userId !== user.id) {
        return {
          status: 404,
          body: {
            success: false,
            message: "Booking not found",
          },
        };
      }

      // Lock this session while cancelling and promoting.
      await tx.$queryRaw<{ id: string }[]>`
        SELECT "id"
        FROM "Session"
        WHERE "id" = ${initialBooking.sessionId}
        FOR UPDATE
      `;

      const booking = await tx.booking.findUnique({
        where: { id: bookingId },
        include: { session: true },
      });

      if (
        !booking ||
        booking.userId !== user.id
      ) {
        return {
          status: 404,
          body: {
            success: false,
            message: "Booking not found",
          },
        };
      }

      if (booking.status !== "CONFIRMED") {
        return {
          status: 409,
          body: {
            success: false,
            message: "Only confirmed bookings can be cancelled",
          },
        };
      }

      if (booking.session.startsAt <= new Date()) {
        return {
          status: 400,
          body: {
            success: false,
            message: "A session that has started cannot be cancelled",
          },
        };
      }

      await tx.booking.update({
        where: { id: booking.id },
        data: {
          status: "CANCELLED",
          checkInCode: null,
        },
      });

      // Promote the oldest waitlisted member first.
      const nextEntry = await tx.waitlistEntry.findFirst({
        where: { sessionId: booking.sessionId },
        orderBy: [
          { createdAt: "asc" },
          { id: "asc" },
        ],
      });

      if (!nextEntry) {
        return {
          status: 200,
          body: {
            success: true,
            message: "Booking cancelled. The slot is available.",
          },
        };
      }

      const existingBooking = await tx.booking.findUnique({
        where: {
          userId_sessionId: {
            userId: nextEntry.userId,
            sessionId: booking.sessionId,
          },
        },
      });

      if (
        existingBooking &&
        existingBooking.status !== "CANCELLED"
      ) {
        // Remove stale entry; don't create a duplicate booking.
        await tx.waitlistEntry.delete({
          where: { id: nextEntry.id },
        });

        return {
          status: 200,
          body: {
            success: true,
            message:
              "Booking cancelled. A stale waitlist entry was removed; promotion needs another attempt.",
          },
        };
      }

      if (existingBooking) {
        await tx.booking.update({
          where: { id: existingBooking.id },
          data: {
            status: "CONFIRMED",
            checkInCode: null,
          },
        });
      } else {
        await tx.booking.create({
          data: {
            userId: nextEntry.userId,
            sessionId: booking.sessionId,
            status: "CONFIRMED",
          },
        });
      }

      await tx.waitlistEntry.delete({
        where: { id: nextEntry.id },
      });

      return {
        status: 200,
        body: {
          success: true,
          message:
            "Booking cancelled and next waitlisted member promoted.",
        },
      };
    });

    return Response.json(result.body, {
      status: result.status,
    });
  } catch (error) {
    console.error("Booking cancellation failed:", error);

    return Response.json(
      {
        success: false,
        message: "Unable to cancel booking",
      },
      { status: 500 },
    );
  }
}
