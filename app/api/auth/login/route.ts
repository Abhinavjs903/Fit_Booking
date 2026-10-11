
import { compare } from "bcryptjs";
import { SignJWT } from "jose";
import { prisma } from "../../../../lib/db";

export async function POST(request: Request) {
  try {
    const body = await request.json();
    const { username, password } = body;

    if (
      typeof username !== "string" ||
      typeof password !== "string" ||
      !username.trim() ||
      !password
    ) {
      return Response.json(
        { success: false, message: "Username and password are required" },
        { status: 400 },
      );
    }

    const user = await prisma.user.findUnique({
      where: { username: username.trim() },
    });

    if (!user || !(await compare(password, user.passwordHash))) {
      return Response.json(
        { success: false, message: "Invalid username or password" },
        { status: 401 },
      );
    }

    if (!user.isActive) {
      return Response.json(
        { success: false, message: "Account is not activated" },
        { status: 403 },
      );
    }

    const secret = process.env.JWT_SECRET;

    if (!secret) {
      throw new Error("JWT_SECRET is missing");
    }

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
      message: "Login successful",
      user: {
        id: user.id,
        username: user.username,
        memberCode: user.memberCode,
        role: user.role,
      },
    });

    response.headers.append(
      "Set-Cookie",
      `auth_token=${token}; HttpOnly; Path=/; SameSite=Lax; Max-Age=28800${
        process.env.NODE_ENV === "production" ? "; Secure" : ""
      }`,
    );

    return response;
  } catch (error) {
    console.error("Login failed:", error);

    return Response.json(
      { success: false, message: "Unable to process login" },
      { status: 500 },
    );
  }
}
