
import "dotenv/config";
import bcrypt from "bcryptjs";
import { prisma } from "../lib/db";

async function main() {
  const adminPassword = process.env.SEED_ADMIN_PASSWORD;
  const memberPassword = process.env.SEED_MEMBER_PASSWORD;

  if (!adminPassword || !memberPassword) {
    throw new Error(
      "SEED_ADMIN_PASSWORD and SEED_MEMBER_PASSWORD are required",
    );
  }

  const adminHash = await bcrypt.hash(adminPassword, 12);
  const memberHash = await bcrypt.hash(memberPassword, 12);

  await prisma.user.upsert({
    where: { username: "admin" },
    update: {
  passwordHash: adminHash,
  role: "ADMIN",
  isActive: true,
},
    create: {
      username: "admin",
      email: "admin@example.test",
      passwordHash: adminHash,
      memberCode: "GYM-ADMIN",
      role: "ADMIN",
      isActive: true,
    },
  });

  for (let i = 1; i <= 50; i++) {
    const number = String(i).padStart(3, "0");

    await prisma.user.upsert({
      where: { username: `member${number}` },
      update: {},
      create: {
        username: `member${number}`,
        email: `member${number}@example.test`,
        passwordHash: memberHash,
        memberCode: `GYM-${String(i).padStart(4, "0")}`,
        role: "MEMBER",
        isActive: false,
      },
    });
  }

  console.log("Seed complete: 1 admin and 50 members.");
}

main()
  .catch((error) => {
    console.error("Seed failed:", error);
    process.exitCode = 1;
  })
  .finally(async () => {
    await prisma.$disconnect();
  });
