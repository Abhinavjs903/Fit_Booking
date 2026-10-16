
import "dotenv/config";
import { prisma } from "../lib/db";

const BASE_URL = process.env.TEST_BASE_URL ?? "http://localhost:3000";

function nextSessionTime() {
  // Choose a future session at 10 AM IST, 8 days from today.
  const now = new Date();
  const indiaDate = new Intl.DateTimeFormat("en-CA", {
    timeZone: "Asia/Kolkata",
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
  }).format(now);

  const [year, month, day] = indiaDate.split("-").map(Number);
  const target = new Date(Date.UTC(year, month - 1, day + 8));
  const date = [
    target.getUTCFullYear(),
    String(target.getUTCMonth() + 1).padStart(2, "0"),
    String(target.getUTCDate()).padStart(2, "0"),
  ].join("-");

  return `${date}T10:00`;
}

async function requestJson(
  path: string,
  options: RequestInit = {},
) {
  const response = await fetch(`${BASE_URL}${path}`, options);
  const data = await response.json().catch(() => ({}));
  return { response, data };
}

async function login(username: string, password: string) {
  const { response, data } = await requestJson("/api/auth/login", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ username, password }),
  });

  if (!response.ok) {
    throw new Error(`Login failed for ${username}: HTTP ${response.status}`);
  }

  const cookie = response.headers.get("set-cookie");
  const token = cookie?.match(/auth_token=([^;]+)/)?.[1];

  if (!token) {
    throw new Error(`Auth cookie missing for ${username}`);
  }

  return `auth_token=${token}`;
}

async function main() {
  const adminPassword = process.env.SEED_ADMIN_PASSWORD;
  const memberPassword = process.env.SEED_MEMBER_PASSWORD;

  if (!adminPassword || !memberPassword) {
    throw new Error(
      "Required seed password variables are missing from .env",
    );
  }

  // Authenticate as admin and create a dedicated future test session.
  const adminCookie = await login("admin", adminPassword);
  const startsAt = nextSessionTime();

  const { response: sessionResponse, data: sessionData } =
    await requestJson("/api/admin/sessions", {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        Cookie: adminCookie,
      },
      body: JSON.stringify({ startsAt }),
    });

  if (!sessionResponse.ok || !sessionData.data?.id) {
    throw new Error(
      `Session creation failed: HTTP ${sessionResponse.status}. ` +
      `${sessionData.message ?? "Check the API response."}`,
    );
  }

  const sessionId = sessionData.data.id as string;
  console.log(`Test session created: ${startsAt} IST`);
  console.log("Logging in demo members...");

  try {
    // Log in all 50 members before issuing concurrent bookings.
    const members: { username: string; cookie: string }[] = [];

    for (let i = 1; i <= 50; i++) {
      const username = `member${String(i).padStart(3, "0")}`;
      members.push({
        username,
        cookie: await login(username, memberPassword),
      });
    }

    console.log("Sending 50 booking requests concurrently...");

    const results = await Promise.all(
      members.map(async (member) => {
        try {
          const { response, data } = await requestJson(
            "/api/bookings",
            {
              method: "POST",
              headers: {
                "Content-Type": "application/json",
                Cookie: member.cookie,
              },
              body: JSON.stringify({ sessionId }),
            },
          );

          return {
            username: member.username,
            status: response.status,
            message: data.message ?? "",
          };
        } catch {
          return {
            username: member.username,
            status: 0,
            message: "Request failed",
          };
        }
      }),
    );

    const confirmedResponses = results.filter(
      (r) => r.message === "Session booked successfully",
    ).length;

    const waitlistResponses = results.filter(
      (r) =>
        r.message ===
        "Session is full. You have been added to the waitlist",
    ).length;

    const errors = results.filter(
      (r) =>
        r.message !== "Session booked successfully" &&
        r.message !==
          "Session is full. You have been added to the waitlist",
    );

    // Verify actual persisted database state, not just HTTP responses.
    const [confirmedInDb, waitlistInDb] = await Promise.all([
      prisma.booking.count({
        where: { sessionId, status: "CONFIRMED" },
      }),
      prisma.waitlistEntry.count({ where: { sessionId } }),
    ]);

    console.log("\n--- CAPACITY TEST RESULTS ---");
    console.log(`HTTP confirmed responses: ${confirmedResponses}`);
    console.log(`HTTP waitlist responses: ${waitlistResponses}`);
    console.log(`Confirmed bookings in DB: ${confirmedInDb}`);
    console.log(`Waitlist entries in DB: ${waitlistInDb}`);
    console.log(`Unexpected responses: ${errors.length}`);

    if (errors.length > 0) {
      console.log("Unexpected response details:");
      console.table(errors);
    }

    const passed =
      confirmedInDb === 20 &&
      waitlistInDb === 30 &&
      errors.length === 0;

    console.log(
      passed ? "\nPASS: Capacity and waitlist test passed." :
        "\nFAIL: Review the counts and unexpected responses above.",
    );

    if (!passed) {
      process.exitCode = 1;
    }
  } finally {
    // Keep the test session and its bookings for inspection.
    await prisma.$disconnect();
  }
}

main().catch(async (error) => {
  console.error("Test could not complete:", error.message);
  await prisma.$disconnect();
  process.exitCode = 1;
});
