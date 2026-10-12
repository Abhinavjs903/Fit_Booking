
import { createHmac, timingSafeEqual } from "node:crypto";
import { SignJWT } from "jose";
import { prisma } from "../../../../lib/db";

const MAX_ATTEMPTS = 5;

function hashOtp(userId: string, otp: string) {
  const secret = process.env.OTP_SECRET;
  if (!secret) throw new Error("OTP_SECRET is missing");

  return createHmac("sha256", secret)
    .update(`${userId}:${otp}`)
    .digest("hex");
}

export async function POST(request: Request) {
  try {
    const body = await request.json().catch(() => null);
    const username =
      typeof body?.username === "string" ? body.username.trim() : "";
    const otp = typeof body?.otp === "string" ? body.otp.trim() : "";

    if (!username || !/^\d{6}$/.test(otp)) {
      return Response.json(
        { success: false, message: "Invalid username or verification code." },
        { status: 400 }
      );
    }

    const user = await prisma.user.findUnique({ where: { username } });

    // OTP login is reserved for member001.
    if (
      !user ||
      !user.isActive ||
      !["member001", "member-001"].includes(user.username)
    ) {
      return Response.json(
        { success: false, message: "Invalid or expired verification code." },
        { status: 401 }
      );
    }

    const challenge = await prisma.otpChallenge.findFirst({
      where: { userId: user.id, consumedAt: null },
      orderBy: { createdAt: "desc" },
    });

    if (!challenge) {
      return Response.json(
        { success: false, message: "Invalid or expired verification code." },
        { status: 401 }
      );
    }

    const now = new Date();

    if (
      challenge.expiresAt <= now ||
      challenge.attempts >= MAX_ATTEMPTS
    ) {
      await prisma.otpChallenge.updateMany({
        where: { id: challenge.id, consumedAt: null },
        data: { consumedAt: now },
      });

      return Response.json(
        { success: false, message: "Invalid or expired verification code." },
        { status: 401 }
      );
    }

    const expected = Buffer.from(challenge.codeHash, "hex");
    const actual = Buffer.from(hashOtp(user.id, otp), "hex");
    const matches =
      expected.length === actual.length &&
      timingSafeEqual(expected, actual);

    if (!matches) {
      await prisma.otpChallenge.updateMany({
        where: {
          id: challenge.id,
          consumedAt: null,
          attempts: { lt: MAX_ATTEMPTS },
        },
        data: { attempts: { increment: 1 } },
      });

      return Response.json(
        { success: false, message: "Invalid or expired verification code." },
        { status: 401 }
      );
    }

    // Atomically consume the OTP so it cannot be reused.
    const consumed = await prisma.otpChallenge.updateMany({
      where: {
        id: challenge.id,
        consumedAt: null,
        expiresAt: { gt: now },
        attempts: { lt: MAX_ATTEMPTS },
      },
      data: { consumedAt: now },
    });

    if (consumed.count !== 1) {
      return Response.json(
        { success: false, message: "Invalid or expired verification code." },
        { status: 401 }
      );
    }

    const secret = process.env.JWT_SECRET;
    if (!secret) throw new Error("JWT_SECRET is missing");

    const token = await new SignJWT({
      role: user.role,
      username: user.username,
    })
      .setProtectedHeader({ alg: "HS256" })
      .setSubject(user.id)
      .setIssuedAt()
      .setExpirationTime("8h")
      .sign(new TextEncoder().encode(secret));

    const response = Response.json({
      success: true,
      message: "Login successful.",
      user: {
        id: user.id,
        username: user.username,
        role: user.role,
      },
    });

    response.headers.append(
      "Set-Cookie",
      `auth_token=${token}; HttpOnly; Path=/; SameSite=Lax; Max-Age=28800${
        process.env.NODE_ENV === "production" ? "; Secure" : ""
      }`
    );

    return response;
  } catch (error) {
    console.error("Verify OTP failed:", error);

    return Response.json(
      { success: false, message: "Unable to process the request right now." },
      { status: 500 }
    );
  }
}
