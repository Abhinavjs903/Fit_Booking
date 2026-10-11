
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

      // Serialize cancellation and promotion for this session.
      const lockedSessions = await tx.$queryRaw<{ id: string }[]>`
        SELECT "id"
        FROM "Session"
        WHERE "id" = ${initialBooking.sessionId}
        FOR UPDATE
      `;

      if (lockedSessions.length === 0) {
        return {
          status: 404,
          body: {
            success: false,
            message: "Session not found",
          },
        };
      }

      // Re-check after obtaining the session lock.
      const booking = await tx.booking.findUnique({
        where: { id: bookingId },
      });

      if (
        !booking ||
        booking.userId !== user.id ||
        booking.status !== "CONFIRMED"
      ) {
        return {
          status: 409,
          body: {
            success: false,
            message: "This booking cannot be cancelled",
          },
        };
      }

      const session = await tx.session.findUnique({
        where: { id: booking.sessionId },
      });

      if (!session || session.startsAt <= new Date()) {
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
        data: { status: "CANCELLED" },
      });

      // FIFO: oldest waitlist entry gets the released slot.
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
            message: "Booking cancelled. The slot is now available.",
          },
        };
      }

      const existingNextBooking = await tx.booking.findUnique({
        where: {
          userId_sessionId: {
            userId: nextEntry.userId,
            sessionId: booking.sessionId,
          },
        },
      });

      if (
        existingNextBooking &&
        existingNextBooking.status !== "CANCELLED"
      ) {
        // Clean up a stale waitlist entry rather than creating
        // a duplicate booking for this member.
        await tx.waitlistEntry.delete({
          where: { id: nextEntry.id },
        });

        return {
          status: 200,
          body: {
            success: true,
            message:
              "Booking cancelled. A stale waitlist entry was removed; promotion may need another attempt.",
          },
        };
      }

      if (existingNextBooking) {
        await tx.booking.update({
          where: { id: existingNextBooking.id },
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
            "Booking cancelled and the next waitlisted member was promoted.",
        },
      };
    });

    return Response.json(result.body, { status: result.status });
  } catch (error) {
    console.error("Booking cancellation failed:", error);

    return Response.json(
      { success: false, message: "Unable to cancel booking" },
      { status: 500 },
    );
  }
}
