import "dotenv/config";
import { PrismaClient } from "@prisma/client";
import { PrismaPg } from "@prisma/adapter-pg";

const connectionString = process.env.DATABASE_URL;
if (!connectionString) throw new Error("DATABASE_URL not set");

const prisma = new PrismaClient({ adapter: new PrismaPg({ connectionString }) });

const TAGS = [
  { name: "Card Decline", color: "#ef4444" },
  { name: "KYC Stuck", color: "#f59e0b" },
  { name: "Transaction Dispute", color: "#8b5cf6" },
  { name: "Login Issue", color: "#3b82f6" },
  { name: "Card Lost", color: "#ef4444" },
  { name: "Refund Request", color: "#10b981" },
  { name: "Payment Failed", color: "#f59e0b" },
  { name: "Positive", color: "#10b981" },
  { name: "Frustrated", color: "#f59e0b" },
  { name: "Angry", color: "#ef4444" },
  { name: "Resolved by AI", color: "#10b981" },
  { name: "Escalated", color: "#ef4444" },
  { name: "Pending", color: "#f59e0b" },
  { name: "High Priority", color: "#ef4444" },
  { name: "Cards", color: "#3b82f6" },
  { name: "Account", color: "#8b5cf6" },
  { name: "KYC", color: "#f59e0b" },
];

async function main() {
  for (const tag of TAGS) {
    await prisma.tagDefinition.upsert({ where: { name: tag.name }, create: tag, update: {} });
  }
  console.log(`✓ Seeded ${TAGS.length} tags`);
}

main().finally(() => prisma.$disconnect());
