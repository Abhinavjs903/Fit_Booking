export async function POST() {
  const response = Response.json({ success: true, message: "Logged out" });
  response.headers.append(
    "Set-Cookie",
    "auth_token=; HttpOnly; Path=/; SameSite=Lax; Max-Age=0",
  );
  return response;
}
