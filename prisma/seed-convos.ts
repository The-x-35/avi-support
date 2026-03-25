import "dotenv/config";
import { PrismaClient } from "@prisma/client";
import { PrismaPg } from "@prisma/adapter-pg";

const connectionString = process.env.DATABASE_URL!;
const prisma = new PrismaClient({ adapter: new PrismaPg({ connectionString }) });

const USERS = [
  { externalId: "user_rahul_01", name: "Rahul Sharma", email: "rahul@example.com" },
  { externalId: "user_priya_02", name: "Priya Nair", email: "priya@example.com" },
  { externalId: "user_amit_03", name: "Amit Patel", email: "amit@example.com" },
  { externalId: "user_sara_04", name: "Sara Khan", email: "sara@example.com" },
  { externalId: "user_dev_05", name: "Dev Mehta", email: "dev@example.com" },
  { externalId: "user_neha_06", name: "Neha Gupta", email: "neha@example.com" },
  { externalId: "user_arjun_07", name: "Arjun Singh", email: "arjun@example.com" },
  { externalId: "user_pooja_08", name: "Pooja Reddy", email: "pooja@example.com" },
];

const CONVOS: Array<{
  userIdx: number;
  category: string;
  status: string;
  priority: string;
  isAiPaused: boolean;
  tagNames: string[];
  messages: Array<{ senderType: "USER" | "AI" | "AGENT"; content: string; offsetMin: number }>;
}> = [
  {
    userIdx: 0,
    category: "CARDS",
    status: "OPEN",
    priority: "HIGH",
    isAiPaused: false,
    tagNames: ["Card Decline", "High Priority"],
    messages: [
      { senderType: "USER", content: "My card got declined at the grocery store. This is the third time this week!", offsetMin: 30 },
      { senderType: "AI", content: "I'm sorry to hear your card was declined. Let me help you resolve this. Could you tell me if you received any error message at the terminal?", offsetMin: 29 },
      { senderType: "USER", content: "It just said 'declined' nothing else. My balance is fine.", offsetMin: 28 },
      { senderType: "AI", content: "I can see your account has sufficient balance. This could be a temporary hold or a security flag. I'm checking your card status now.", offsetMin: 27 },
      { senderType: "USER", content: "Please fix this ASAP. I need my card for daily expenses.", offsetMin: 25 },
    ],
  },
  {
    userIdx: 1,
    category: "KYC",
    status: "PENDING",
    priority: "MEDIUM",
    isAiPaused: true,
    tagNames: ["KYC Stuck"],
    messages: [
      { senderType: "USER", content: "I submitted my KYC documents 5 days ago but my account is still not verified.", offsetMin: 120 },
      { senderType: "AI", content: "I understand your concern. KYC verification typically takes 2-3 business days. Let me check the status of your application.", offsetMin: 119 },
      { senderType: "USER", content: "It's been 5 days! I need to use my account.", offsetMin: 115 },
      { senderType: "AI", content: "I can see your documents were received. There seems to be a minor issue with the address proof. Our team has been notified.", offsetMin: 114 },
      { senderType: "AGENT", content: "Hi Priya, I'm Ananya from the KYC team. I've reviewed your documents and we need a clearer photo of your utility bill. Could you resubmit?", offsetMin: 60 },
      { senderType: "USER", content: "Sure, I'll upload it now. Which page of the form?", offsetMin: 55 },
    ],
  },
  {
    userIdx: 2,
    category: "SPENDS",
    status: "ESCALATED",
    priority: "CRITICAL",
    isAiPaused: true,
    tagNames: ["Transaction Dispute", "Angry", "Escalated"],
    messages: [
      { senderType: "USER", content: "There's an unauthorized transaction of ₹45,000 on my account! I did NOT make this payment.", offsetMin: 240 },
      { senderType: "AI", content: "I understand this is very concerning. I'm flagging this transaction immediately and escalating to our fraud team. Your account has been temporarily secured.", offsetMin: 239 },
      { senderType: "USER", content: "This is unacceptable. I want my money back RIGHT NOW.", offsetMin: 235 },
      { senderType: "AI", content: "I completely understand your frustration. I've raised an urgent dispute case. A specialist will contact you within the hour.", offsetMin: 234 },
      { senderType: "AGENT", content: "Hi Amit, I'm Rohan from our fraud resolution team. I've blocked your card and initiated a chargeback. You'll receive a provisional credit within 24 hours.", offsetMin: 180 },
      { senderType: "USER", content: "24 hours?? I need the money now!", offsetMin: 175 },
      { senderType: "AGENT", content: "I understand. I've escalated this to priority processing. You should see the credit within 2-4 hours. Case ID: FRD-2024-7823", offsetMin: 170 },
    ],
  },
  {
    userIdx: 3,
    category: "ACCOUNT",
    status: "RESOLVED",
    priority: "LOW",
    isAiPaused: false,
    tagNames: ["Login Issue", "Resolved by AI", "Positive"],
    messages: [
      { senderType: "USER", content: "I can't login to my account. It says password incorrect but I'm sure it's right.", offsetMin: 480 },
      { senderType: "AI", content: "Let me help you regain access. Have you tried the 'Forgot Password' option? I can also send an OTP to your registered mobile number.", offsetMin: 479 },
      { senderType: "USER", content: "Yes please send OTP", offsetMin: 476 },
      { senderType: "AI", content: "I've sent an OTP to your registered mobile ending in **45. Please enter it within 10 minutes.", offsetMin: 475 },
      { senderType: "USER", content: "Got it! That worked. I'm in now. Thank you!", offsetMin: 470 },
      { senderType: "AI", content: "Great! I'd recommend updating your password to something strong. Is there anything else I can help you with?", offsetMin: 469 },
      { senderType: "USER", content: "No that's all. You were super helpful, thanks!", offsetMin: 468 },
    ],
  },
  {
    userIdx: 4,
    category: "CARDS",
    status: "OPEN",
    priority: "MEDIUM",
    isAiPaused: false,
    tagNames: ["Card Lost"],
    messages: [
      { senderType: "USER", content: "I lost my debit card. Need to block it immediately.", offsetMin: 15 },
      { senderType: "AI", content: "I've immediately blocked your card ending in 4521. No new transactions can be made. Would you like to order a replacement card?", offsetMin: 14 },
      { senderType: "USER", content: "Yes please. Same address on file.", offsetMin: 12 },
      { senderType: "AI", content: "Your replacement card has been ordered and will arrive in 3-5 business days. Tracking number will be sent to your email.", offsetMin: 11 },
    ],
  },
  {
    userIdx: 5,
    category: "SPENDS",
    status: "OPEN",
    priority: "MEDIUM",
    isAiPaused: false,
    tagNames: ["Refund Request"],
    messages: [
      { senderType: "USER", content: "I returned a product but the refund hasn't hit my account yet. It's been 8 days.", offsetMin: 60 },
      { senderType: "AI", content: "I can see a refund of ₹2,340 is pending from the merchant. Refunds typically take 5-7 business days. It should appear by tomorrow.", offsetMin: 59 },
      { senderType: "USER", content: "The merchant says they've already processed it.", offsetMin: 56 },
      { senderType: "AI", content: "In that case, it may be in processing on our end. I'll flag this for manual review and you should see the credit within 24 hours.", offsetMin: 55 },
    ],
  },
  {
    userIdx: 6,
    category: "GENERAL",
    status: "OPEN",
    priority: "LOW",
    isAiPaused: false,
    tagNames: ["Pending"],
    messages: [
      { senderType: "USER", content: "What is the daily transaction limit for my account?", offsetMin: 5 },
      { senderType: "AI", content: "Your current daily transaction limit is ₹1,00,000 for online transactions and ₹50,000 for ATM withdrawals. Would you like to increase this?", offsetMin: 4 },
      { senderType: "USER", content: "Yes can I increase the online limit to 2 lakhs?", offsetMin: 2 },
    ],
  },
  {
    userIdx: 7,
    category: "ACCOUNT",
    status: "CLOSED",
    priority: "LOW",
    isAiPaused: false,
    tagNames: ["Positive"],
    messages: [
      { senderType: "USER", content: "I want to update my registered email address.", offsetMin: 720 },
      { senderType: "AI", content: "Sure! For security, I'll need to verify your identity first. Please provide the OTP sent to your current registered mobile number.", offsetMin: 719 },
      { senderType: "USER", content: "Done. The OTP is 847291", offsetMin: 716 },
      { senderType: "AI", content: "Identity verified. Please provide your new email address.", offsetMin: 715 },
      { senderType: "USER", content: "new email: pooja.r@email.com", offsetMin: 714 },
      { senderType: "AI", content: "Your email has been updated to pooja.r@email.com. A confirmation has been sent to both your old and new email addresses. Is there anything else?", offsetMin: 713 },
      { senderType: "USER", content: "That's all, thanks!", offsetMin: 712 },
    ],
  },
  {
    userIdx: 0,
    category: "SPENDS",
    status: "OPEN",
    priority: "HIGH",
    isAiPaused: false,
    tagNames: ["Payment Failed"],
    messages: [
      { senderType: "USER", content: "My UPI payment failed but money was debited from my account", offsetMin: 10 },
      { senderType: "AI", content: "I can see a failed UPI transaction of ₹3,500 to @merchant_upi. The amount will be automatically refunded within 24-48 hours per RBI guidelines.", offsetMin: 9 },
      { senderType: "USER", content: "It's urgent I need to pay this now", offsetMin: 7 },
      { senderType: "AI", content: "I understand. The auto-refund is guaranteed but takes time. You can retry the payment - your account will be debited only once.", offsetMin: 6 },
    ],
  },
  {
    userIdx: 2,
    category: "CARDS",
    status: "RESOLVED",
    priority: "MEDIUM",
    isAiPaused: false,
    tagNames: ["Card Decline", "Resolved by AI"],
    messages: [
      { senderType: "USER", content: "My international transactions are not working on my card.", offsetMin: 1440 },
      { senderType: "AI", content: "International transactions may be disabled by default for security. I can enable them for your card. Which regions do you need?", offsetMin: 1439 },
      { senderType: "USER", content: "I'm traveling to the US and UK next week.", offsetMin: 1436 },
      { senderType: "AI", content: "I've enabled international transactions for USA and UK on your card. This will be active for 30 days. Safe travels!", offsetMin: 1435 },
      { senderType: "USER", content: "Perfect, thank you!", offsetMin: 1434 },
    ],
  },
];

async function main() {
  console.log("Seeding conversations...");

  // Upsert end users
  const users = await Promise.all(
    USERS.map((u) =>
      prisma.endUser.upsert({
        where: { externalId: u.externalId },
        create: u,
        update: { name: u.name, email: u.email },
      })
    )
  );

  // Get agents and tag definitions
  const agents = await prisma.agent.findMany({ select: { id: true } });
  const tagDefs = await prisma.tagDefinition.findMany({ select: { id: true, name: true } });
  const tagMap = new Map(tagDefs.map((t) => [t.name, t.id]));

  const now = Date.now();

  for (const c of CONVOS) {
    const user = users[c.userIdx];
    const agent = agents[Math.floor(Math.random() * agents.length)];

    const lastMsgTime = new Date(now - c.messages[c.messages.length - 1].offsetMin * 60 * 1000);

    const conv = await prisma.conversation.create({
      data: {
        userId: user.id,
        category: c.category as never,
        status: c.status as never,
        priority: c.priority as never,
        isAiPaused: c.isAiPaused,
        assignedAgentId: c.isAiPaused && agents.length > 0 ? agent.id : null,
        lastMessageAt: lastMsgTime,
      },
    });

    // Create messages
    for (const m of c.messages) {
      await prisma.message.create({
        data: {
          conversationId: conv.id,
          senderType: m.senderType,
          senderId: m.senderType === "AGENT" && agents.length > 0 ? agent.id : null,
          content: m.content,
          createdAt: new Date(now - m.offsetMin * 60 * 1000),
        },
      });
    }

    // Apply tags
    for (const tagName of c.tagNames) {
      const defId = tagMap.get(tagName);
      if (defId) {
        await prisma.tag.upsert({
          where: { conversationId_definitionId: { conversationId: conv.id, definitionId: defId } },
          create: { conversationId: conv.id, definitionId: defId },
          update: {},
        });
      }
    }

    console.log(`  Created conv #${conv.id}: ${user.name} — ${c.category} [${c.status}]`);
  }

  console.log("Done!");
}

main()
  .catch(console.error)
  .finally(() => prisma.$disconnect());
