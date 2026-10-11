
import { prisma } from "../../../lib/db";
import { getCurrentUser } from "../../../lib/auth";

export async function GET() {
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

    const bookings = await prisma.booking.findMany({
      where: { userId: user.id },
      include: {
        session: true,
      },
      orderBy: {
        createdAt: "desc",
      },
    });

    const waitlistEntries = await prisma.waitlistEntry.findMany({
      where: { userId: user.id },
      include: {
        session: true,
      },
      orderBy: {
        createdAt: "desc",
      },
    });

    return Response.json({
      success: true,
      data: { bookings, waitlistEntries },
    });
  } catch (error) {
    console.error("Failed to fetch bookings:", error);

    return Response.json(
      { success: false, message: "Unable to fetch bookings" },
      { status: 500 },
    );
  }
}

export async function POST(request: Request) {
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

    const body = await request.json();
    const sessionId = body?.sessionId;

    if (typeof sessionId !== "string" || !sessionId.trim()) {
      return Response.json(
        { success: false, message: "A valid sessionId is required" },
        { status: 400 },
      );
    }

    const result = await prisma.$transaction(async (tx) => {
      // Lock this session row so concurrent bookings for the same
      // session are processed one at a time.
      const lockedSessions = await tx.$queryRaw<{ id: string }[]>`
        SELECT "id"
        FROM "Session"
        WHERE "id" = ${sessionId}
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

      const session = await tx.session.findUnique({
        where: { id: sessionId },
      });

      if (!session) {
        return {
          status: 404,
          body: { success: false, message: "Session not found" },
        };
      }

      if (session.startsAt <= new Date()) {
        return {
          status: 400,
          body: {
            success: false,
            message: "This session is no longer available for booking",
          },
        };
      }

      const existingBooking = await tx.booking.findUnique({
        where: {
          userId_sessionId: {
            userId: user.id,
            sessionId,
          },
        },
      });

      if (
        existingBooking &&
        existingBooking.status !== "CANCELLED"
      ) {
        return {
          status: 409,
          body: {
            success: false,
            message: "You already have a booking for this session",
          },
        };
      }

      const existingWaitlist = await tx.waitlistEntry.findUnique({
        where: {
          userId_sessionId: {
            userId: user.id,
            sessionId,
          },
        },
      });

      const confirmedCount = await tx.booking.count({
        where: {
          sessionId,
          status: "CONFIRMED",
        },
      });

      if (confirmedCount < session.capacity) {
        const booking = existingBooking
          ? await tx.booking.update({
              where: { id: existingBooking.id },
              data: { status: "CONFIRMED" },
            })
          : await tx.booking.create({
              data: {
                userId: user.id,
                sessionId,
                status: "CONFIRMED",
              },
            });

        if (existingWaitlist) {
          await tx.waitlistEntry.delete({
            where: { id: existingWaitlist.id },
          });
        }

        return {
          status: 201,
          body: {
            success: true,
            message: "Session booked successfully",
            data: booking,
          },
        };
      }

      if (existingWaitlist) {
        return {
          status: 409,
          body: {
            success: false,
            message: "You are already on this session's waitlist",
          },
        };
      }

      const waitlistEntry = await tx.waitlistEntry.create({
        data: {
          userId: user.id,
          sessionId,
        },
      });

      return {
        status: 201,
        body: {
          success: true,
          message: "Session is full. You have been added to the waitlist",
          data: waitlistEntry,
        },
      };
    });

    return Response.json(result.body, { status: result.status });
  } catch (error) {
    if (
      typeof error === "object" &&
      error !== null &&
      "code" in error &&
      error.code === "P2002"
    ) {
      return Response.json(
        {
          success: false,
          message: "A booking or waitlist entry already exists",
        },
        { status: 409 },
      );
    }

    console.error("Booking request failed:", error);

    return Response.json(
      { success: false, message: "Unable to process booking" },
      { status: 500 },
    );
  }
}
