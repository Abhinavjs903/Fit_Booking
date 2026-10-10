import { prisma } from "../../../lib/db";

export async function GET() {
  try {
    const sessions = await prisma.session.findMany({
      orderBy: {
        startsAt: "asc",
      },
    });

    return Response.json({
      success: true,
      data: sessions,
    });
  } catch (error) {
    console.error("Failed to fetch sessions:", error);

    return Response.json(
      { success: false, message: "Unable to fetch sessions" },
      { status: 500 },
    );
  }
}