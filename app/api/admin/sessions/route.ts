
import { prisma } from "../../../../lib/db";
import { getCurrentUser } from "../../../../lib/auth";

function getIndiaTime(date: Date) {
  const parts = new Intl.DateTimeFormat("en-GB", {
    timeZone: "Asia/Kolkata",
    hour: "2-digit",
    minute: "2-digit",
    second: "2-digit",
    hourCycle: "h23",
  }).formatToParts(date);

  return Object.fromEntries(
    parts.map((part) => [part.type, part.value]),
  );
}

export async function POST(request: Request) {
  try {
    const currentUser = await getCurrentUser();

    if (!currentUser) {
      return Response.json(
        { success: false, message: "Unauthorized" },
        { status: 401 },
      );
    }

    if (currentUser.role !== "ADMIN") {
      return Response.json(
        { success: false, message: "Admin access required" },
        { status: 403 },
      );
    }

    const body = await request.json();

    if (
      typeof body.startsAt !== "string" ||
      !body.startsAt.trim()
    ) {
      return Response.json(
        { success: false, message: "A valid startsAt date is required" },
        { status: 400 },
      );
    }

    const startsAt = new Date(body.startsAt);

    if (!Number.isFinite(startsAt.getTime())) {
      return Response.json(
        { success: false, message: "A valid startsAt date is required" },
        { status: 400 },
      );
    }

    const indiaTime = getIndiaTime(startsAt);
    const hour = Number(indiaTime.hour);

    if (
      indiaTime.minute !== "00" ||
      indiaTime.second !== "00" ||
      startsAt.getUTCMilliseconds() !== 0 ||
      hour < 4 ||
      hour > 23
    ) {
      return Response.json(
        {
          success: false,
          message:
            "Sessions must start on the hour between 4 AM and 11 PM IST",
        },
        { status: 400 },
      );
    }

    if (startsAt <= new Date()) {
      return Response.json(
        { success: false, message: "Session must be in the future" },
        { status: 400 },
      );
    }

    const session = await prisma.session.create({
      data: {
        startsAt,
        capacity: 20,
        createdById: currentUser.id,
      },
    });

    return Response.json(
      { success: true, data: session },
      { status: 201 },
    );
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
          message: "A session already exists at this time",
        },
        { status: 409 },
      );
    }

    console.error("Failed to create session:", error);

    return Response.json(
      { success: false, message: "Unable to create session" },
      { status: 500 },
    );
  }
}
