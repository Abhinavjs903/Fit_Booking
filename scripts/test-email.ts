
import "dotenv/config";
import { sendOtpEmail } from "../lib/email";
import { randomInt } from "node:crypto";

async function main() {
  const email = process.env.TEST_EMAIL;

  if (!email) {
    throw new Error("TEST_EMAIL is missing in .env");
  }

  const testCode = randomInt(100000, 1000000).toString();

  await sendOtpEmail(email, testCode);

  console.log("Test email request sent. Check your inbox and spam folder.");
}

main().catch((error) => {
  console.error("Test email failed:", error.message);
  process.exitCode = 1;
});
