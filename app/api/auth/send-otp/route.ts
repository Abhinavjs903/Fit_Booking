
import { createHmac, randomInt } from "node:crypto";
import { prisma } from "../../../../lib/db";
import { sendOtpEmail } from "../../../../lib/email";

const OTP_EXPIRY_MS = 10 * 60 * 1000;
const RESEND_COOLDOWN_MS = 60 * 1000;
const HOURLY_LIMIT = 5;

function hashOtp(userId: string, otp: string) {
  const secret = process.env.OTP_SECRET;

  if (!secret) {
    throw new Error("OTP_SECRET is missing");
  }

  return createHmac("sha256", secret)
    .update(`${userId}:${otp}`)
    .digest("hex");
}

const genericResponse = () =>
  Response.json({
    success: true,
    message: "If your account is eligible, a verification code will be sent.",
  });

export async function POST(request: Request) {
  try {
    const body = await request.json().catch(() => null);
    const username =
      typeof body?.username === "string" ? body.username.trim() : "";

    if (!username || username.length > 100) {
      return Response.json(
        { success: false, message: "A valid username is required." },
        { status: 400 },
      );
    }

    const user = await prisma.user.findUnique({
      where: { username },
    });

    // Do not reveal whether a username exists or is active.
    if (!user || !user.isActive) {
      return genericResponse();
    }

    const now = new Date();
    const recentChallenges = await prisma.otpChallenge.findMany({
      where: {
        userId: user.id,
        createdAt: { gte: new Date(now.getTime() - 60 * 60 * 1000) },
      },
      orderBy: { createdAt: "desc" },
      take: HOURLY_LIMIT,
    });

    const latest = recentChallenges[0];

    if (
      latest &&
      now.getTime() - latest.createdAt.getTime() < RESEND_COOLDOWN_MS
    ) {
      return Response.json(
        {
          success: false,
          message: "Please wait 60 seconds before requesting another code.",
        },
        { status: 429 },
      );
    }

    if (recentChallenges.length >= HOURLY_LIMIT) {
      return Response.json(
        {
          success: false,
          message: "Too many OTP requests. Please try again later.",
        },
        { status: 429 },
      );
    }

    const otp = randomInt(100000, 1000000).toString();
    const codeHash = hashOtp(user.id, otp);
    const expiresAt = new Date(now.getTime() + OTP_EXPIRY_MS);

    // Invalidate older challenges before creating a new one.
    await prisma.otpChallenge.deleteMany({
      where: { userId: user.id },
    });

    const challenge = await prisma.otpChallenge.create({
      data: {
        userId: user.id,
        codeHash,
        expiresAt,
      },
    });

    try {
      await sendOtpEmail(user.email, otp);
    } catch (error) {
      await prisma.otpChallenge.delete({
        where: { id: challenge.id },
      });
      throw error;
    }

    return genericResponse();
  } catch (error) {
    console.error("Send OTP failed:", error);

    return Response.json(
      { success: false, message: "Unable to process the request right now." },
      { status: 500 },
    );
  }
}
