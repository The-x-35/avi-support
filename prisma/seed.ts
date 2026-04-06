import "dotenv/config";
import { PrismaClient } from "@prisma/client";
import { PrismaPg } from "@prisma/adapter-pg";

const connectionString = process.env.DATABASE_URL;

if (!connectionString) {
  throw new Error("DATABASE_URL environment variable is not set");
}

const prisma = new PrismaClient({
  adapter: new PrismaPg({ connectionString }),
});

const TAG_DEFINITIONS = [
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

const USERS = [
  { name: "Priya Sharma", email: "priya.sharma@example.com", phone: "+91 98765 43210" },
  { name: "Rohit Verma", email: "rohit.v@example.com", phone: "+91 87654 32109" },
  { name: "Ananya Singh", email: "ananya.s@example.com", phone: "+91 76543 21098" },
  { name: "Karan Mehta", email: "karan.m@example.com", phone: "+91 65432 10987" },
  { name: "Divya Patel", email: "divya.p@example.com", phone: "+91 54321 09876" },
  { name: "Arjun Nair", email: "arjun.n@example.com", phone: "+91 43210 98765" },
  { name: "Sneha Gupta", email: "sneha.g@example.com", phone: "+91 32109 87654" },
  { name: "Vikram Joshi", email: "vikram.j@example.com", phone: "+91 21098 76543" },
];

const CONVERSATION_TEMPLATES = [
  {
    category: "CARDS" as const,
    messages: [
      { senderType: "USER" as const, content: "My card got declined at a restaurant today. It's embarrassing. What's going on?" },
      { senderType: "AI" as const, content: "I'm sorry to hear that — that's definitely frustrating. A few things could cause a decline: insufficient balance, a merchant restriction, or a temporary block. Can you tell me the last 4 digits of your card? I'll check the transaction status right away." },
      { senderType: "USER" as const, content: "It ends in 4821. I had enough balance, I checked just before going in." },
      { senderType: "AI" as const, content: "Thanks. I can see the decline on card **4821** — it looks like it was flagged by our fraud detection system because the merchant category was unusual for your spending pattern. I've cleared the flag. Your card should work now. Try a small transaction to confirm." },
      { senderType: "USER" as const, content: "Okay it worked now! Thanks for the quick fix." },
      { senderType: "AI" as const, content: "Glad to hear it! If this happens again, you can always unblock it directly from the app under Card Settings. Is there anything else I can help with?" },
    ],
    status: "RESOLVED" as const,
    tags: ["Card Decline", "Positive", "Resolved by AI", "Cards"],
  },
  {
    category: "KYC" as const,
    messages: [
      { senderType: "USER" as const, content: "I submitted my KYC documents 3 days ago and still no update. This is ridiculous." },
      { senderType: "AI" as const, content: "I understand the frustration — 3 days is longer than our usual processing time. Let me check the status of your KYC submission right now." },
      { senderType: "USER" as const, content: "Please hurry, I can't use my full limit until this is done" },
      { senderType: "AI" as const, content: "Your KYC is currently in manual review — it was flagged for a second check because one of your documents had a minor quality issue. The review team will complete this within 24 hours. I'll make a note to prioritize your case. You'll get a notification as soon as it's done." },
      { senderType: "USER" as const, content: "Fine. Just make sure it actually happens this time." },
    ],
    status: "PENDING" as const,
    tags: ["KYC Stuck", "Frustrated", "Pending", "KYC"],
  },
  {
    category: "SPENDS" as const,
    messages: [
      { senderType: "USER" as const, content: "There's a charge of ₹2,450 from 'MRKT ONLINE' that I didn't make. I need this investigated immediately." },
      { senderType: "AI" as const, content: "I've flagged this transaction for dispute. To protect your account, I've temporarily blocked the card linked to this transaction. A refund investigation typically takes 5-7 business days. Do you want me to issue a replacement card while the dispute is in progress?" },
      { senderType: "USER" as const, content: "Yes please issue a new card. And I want this resolved ASAP." },
      { senderType: "AI" as const, content: "Done — a new card has been ordered and will arrive within 3-5 business days. Your dispute case number is **DIS-2024-8821**. You'll receive email updates as the investigation progresses. If the charge is confirmed as unauthorized, the full amount will be refunded." },
    ],
    status: "ESCALATED" as const,
    tags: ["Transaction Dispute", "Angry", "Escalated"],
  },
  {
    category: "ACCOUNT" as const,
    messages: [
      { senderType: "USER" as const, content: "Hi, I'm trying to update my registered phone number but the OTP isn't coming" },
      { senderType: "AI" as const, content: "Thanks for reaching out. OTP delivery issues can happen due to network delays or carrier filtering. Can you confirm: is the number you're updating to a new Indian number? Also, have you tried requesting the OTP again after 30 seconds?" },
      { senderType: "USER" as const, content: "Yes it's a new number, +91 98765 43210. I've tried 5 times already." },
      { senderType: "AI" as const, content: "Got it. I've triggered a direct OTP to that number — it bypasses the standard delivery and should arrive within 60 seconds. Also checking: are you in a good network coverage area? Sometimes certain providers filter SMS in low signal." },
      { senderType: "USER" as const, content: "Got it! Thank you so much." },
    ],
    status: "RESOLVED" as const,
    tags: ["Login Issue", "Positive", "Resolved by AI", "Account"],
  },
  {
    category: "GENERAL" as const,
    messages: [
      { senderType: "USER" as const, content: "What's the maximum transaction limit per day on the Avici card?" },
      { senderType: "AI" as const, content: "For standard accounts, the daily transaction limit is ₹1,00,000. If you've completed KYC and are on a Premium plan, it goes up to ₹5,00,000. You can also request a temporary limit increase from the app under **Card Settings → Limits** for specific transactions. Want me to check what limit is currently set on your account?" },
      { senderType: "USER" as const, content: "Yes please check" },
      { senderType: "AI" as const, content: "Your current daily limit is ₹1,00,000 — you're on the standard plan. To increase this, you can upgrade to Premium directly from the app. Is there a specific transaction you're planning that needs a higher limit?" },
    ],
    status: "OPEN" as const,
    tags: ["Pending", "Cards"],
  },
];

async function main() {
  console.log("Seeding database...");

  // Create tag definitions
  for (const def of TAG_DEFINITIONS) {
    await prisma.tagDefinition.upsert({
      where: { name: def.name },
      create: def,
      update: {},
    });
  }
  console.log("✓ Tag definitions created");

  // Create admin agent
  const adminAgent = await prisma.agent.upsert({
    where: { email: "admin@avici.club" },
    create: {
      email: "admin@avici.club",
      name: "Arpit Singh",
      role: "ADMIN",
      googleId: "seed-admin-google-id",
    },
    update: {},
  });

  const agent2 = await prisma.agent.upsert({
    where: { email: "agent@avici.club" },
    create: {
      email: "agent@avici.club",
      name: "Support Agent",
      role: "AGENT",
      googleId: "seed-agent-google-id",
    },
    update: {},
  });

  console.log("✓ Agents created");

  // Create end users
  const endUsers = [];
  for (const u of USERS) {
    const user = await prisma.endUser.upsert({
      where: { externalId: `ext-${u.email}` },
      create: {
        externalId: `ext-${u.email}`,
        name: u.name,
        email: u.email,
        phone: u.phone,
      },
      update: {},
    });
    endUsers.push(user);
  }
  console.log("✓ End users created");

  // Create conversations
  for (let i = 0; i < CONVERSATION_TEMPLATES.length; i++) {
    const template = CONVERSATION_TEMPLATES[i];
    const user = endUsers[i % endUsers.length];
    const createdAt = new Date(Date.now() - (i * 2 + 1) * 60 * 60 * 1000);

    const conversation = await prisma.conversation.create({
      data: {
        userId: user.id,
        categories: [template.category],
        status: template.status,
        priority: template.status === "ESCALATED" ? "HIGH" : "MEDIUM",
        isAiPaused: template.status === "ESCALATED",
        lastMessageAt: new Date(createdAt.getTime() + template.messages.length * 5 * 60 * 1000),
        createdAt,
        messages: {
          create: template.messages.map((msg, msgIdx) => ({
            senderType: msg.senderType,
            content: msg.content,
            createdAt: new Date(createdAt.getTime() + msgIdx * 5 * 60 * 1000),
            senderId: (msg.senderType as string) === "AGENT" ? adminAgent.id : null,
          })),
        },
      },
    });

    // Add tags
    for (const tagName of template.tags) {
      const def = await prisma.tagDefinition.findUnique({ where: { name: tagName } });
      if (def) {
        await prisma.tag.create({
          data: { conversationId: conversation.id, definitionId: def.id },
        });
      }
    }
  }

  // Create a few more varied conversations
  for (let i = 5; i < 20; i++) {
    const user = endUsers[i % endUsers.length];
    const template = CONVERSATION_TEMPLATES[i % CONVERSATION_TEMPLATES.length];
    const createdAt = new Date(Date.now() - i * 30 * 60 * 1000);

    const statuses = ["OPEN", "PENDING", "RESOLVED", "ESCALATED", "OPEN", "OPEN"] as const;
    const conversation = await prisma.conversation.create({
      data: {
        userId: user.id,
        categories: [template.category],
        status: statuses[i % statuses.length],
        priority: ["LOW", "MEDIUM", "MEDIUM", "HIGH", "CRITICAL"][i % 5] as any,
        isAiPaused: i % 4 === 0,
        lastMessageAt: new Date(createdAt.getTime() + 10 * 60 * 1000),
        createdAt,
        messages: {
          create: template.messages.slice(0, Math.min(template.messages.length, i % 3 + 2)).map((msg, msgIdx) => ({
            senderType: msg.senderType,
            content: msg.content,
            createdAt: new Date(createdAt.getTime() + msgIdx * 2 * 60 * 1000),
          })),
        },
      },
    });

    // Tags for varied conversations
    for (const tagName of template.tags.slice(0, 2)) {
      const def = await prisma.tagDefinition.findUnique({ where: { name: tagName } });
      if (def) {
        await prisma.tag.upsert({
          where: { conversationId_definitionId_source: { conversationId: conversation.id, definitionId: def.id, source: "AGENT" } },
          create: { conversationId: conversation.id, definitionId: def.id, source: "AGENT" },
          update: {},
        });
      }
    }
  }

  console.log("✓ Conversations created");

  // Create a demo segment
  await prisma.segment.upsert({
    where: { id: "demo-segment-1" },
    create: {
      id: "demo-segment-1",
      name: "Frustrated KYC users",
      description: "Users with frustrated sentiment in KYC category",
      filters: {
        operator: "AND",
        conditions: [
          { field: "category", operator: "eq", value: "KYC" },
          { field: "sentiment", operator: "eq", value: "frustrated" },
        ],
      },
      createdById: adminAgent.id,
      isPinned: true,
    },
    update: {},
  });

  await prisma.segment.upsert({
    where: { id: "demo-segment-2" },
    create: {
      id: "demo-segment-2",
      name: "High priority open tickets",
      description: "Open conversations with high or critical priority",
      filters: {
        operator: "AND",
        conditions: [
          { field: "status", operator: "eq", value: "OPEN" },
          { field: "priority", operator: "in", value: "HIGH,CRITICAL" },
        ],
      },
      createdById: adminAgent.id,
      isPinned: false,
    },
    update: {},
  });

  console.log("✓ Segments created");
  console.log("\nSeed complete!");
  console.log(`Admin: admin@avici.club`);
  console.log(`Agent: agent@avici.club`);
}

main()
  .catch((e) => {
    console.error(e);
    process.exit(1);
  })
  .finally(() => prisma.$disconnect());
