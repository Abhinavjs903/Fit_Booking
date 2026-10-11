
import { prisma } from "../../../../lib/db";

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
  const adminApiKey = process.env.ADMIN_API_KEY;

  if (!adminApiKey || request.headers.get("x-admin-key") !== adminApiKey) {
    return Response.json(
      { success: false, message: "Unauthorized" },
      { status: 401 },
    );
  }

  try {
    const body = await request.json();
    const startsAt = new Date(body.startsAt);

    if (
      typeof body.startsAt !== "string" ||
      !Number.isFinite(startsAt.getTime())
    ) {
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
          message: "Sessions must start on the hour between 4 AM and 11 PM IST",
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

    const admin = await prisma.user.findUnique({
      where: { username: process.env.ADMIN_USERNAME ?? "admin" },
    });

    if (!admin || admin.role !== "ADMIN" || !admin.isActive) {
      return Response.json(
        { success: false, message: "Active admin account not found" },
        { status: 403 },
      );
    }

    const session = await prisma.session.create({
      data: {
        startsAt,
        capacity: 20,
        createdById: admin.id,
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
        { success: false, message: "A session already exists at this time" },
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
