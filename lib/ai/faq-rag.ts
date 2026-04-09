import { readFileSync } from "fs";
import { join } from "path";

interface FAQEntry {
  category: string;
  question: string;
  answer: string;
  isCommon: boolean;
}

let faqEntries: FAQEntry[] | null = null;

const STOP_WORDS = new Set([
  "i", "me", "my", "we", "our", "you", "your", "it", "its", "the", "a", "an",
  "is", "are", "was", "were", "be", "been", "being", "have", "has", "had",
  "do", "does", "did", "will", "would", "could", "should", "may", "might",
  "can", "to", "of", "in", "for", "on", "with", "at", "by", "from", "as",
  "into", "through", "during", "before", "after", "above", "below", "between",
  "and", "but", "or", "nor", "not", "no", "so", "if", "then", "than", "too",
  "very", "just", "about", "up", "out", "how", "what", "when", "where", "why",
  "who", "which", "that", "this", "these", "those", "am", "all", "each",
  "every", "both", "few", "more", "most", "other", "some", "such", "only",
  "own", "same", "also", "here", "there", "again", "once", "get", "got",
  "going", "still", "don", "won", "doesn", "didn", "isn", "aren", "wasn",
  "weren", "hasn", "haven", "hadn", "don't", "doesn't", "didn't", "won't",
  "wouldn't", "can't", "cannot", "couldn't", "shouldn't", "isn't", "aren't",
  "wasn't", "weren't", "hasn't", "haven't", "hadn't",
]);

function parseFAQ(): FAQEntry[] {
  if (faqEntries) return faqEntries;

  const faqPath = join(process.cwd(), "public", "FAQ.md");
  const content = readFileSync(faqPath, "utf-8");
  const lines = content.split("\n");

  const entries: FAQEntry[] = [];
  let currentCategory = "";
  let currentQuestion = "";
  let currentAnswer = "";
  let isCommon = false;

  function pushEntry() {
    if (currentQuestion && currentAnswer.trim()) {
      entries.push({
        category: currentCategory,
        question: currentQuestion,
        answer: currentAnswer.trim(),
        isCommon,
      });
    }
  }

  for (const line of lines) {
    // Category header: ## Category
    if (line.startsWith("## ") && !line.startsWith("## Table")) {
      pushEntry();
      currentCategory = line.replace("## ", "").trim();
      currentQuestion = "";
      currentAnswer = "";
      isCommon = false;
      continue;
    }

    // Question header: ### Question text
    if (line.startsWith("### ")) {
      pushEntry();
      const raw = line.replace("### ", "").trim();
      isCommon = raw.includes("*(common)*");
      currentQuestion = raw
        .replace(/\s*\*\(common\)\*\s*/g, "")
        .replace(/\s*\*\(occasional\)\*\s*/g, "")
        .trim();
      currentAnswer = "";
      continue;
    }

    // Skip metadata / ToC lines
    if (line.startsWith("> ") || line.startsWith("- [")) continue;
    if (line === "---") continue;

    // Accumulate answer
    if (currentQuestion) {
      currentAnswer += line + "\n";
    }
  }

  pushEntry(); // last entry
  faqEntries = entries;
  return entries;
}

function tokenize(text: string): string[] {
  return text
    .toLowerCase()
    .replace(/[^a-z0-9\s]/g, " ")
    .split(/\s+/)
    .filter((w) => w.length > 2 && !STOP_WORDS.has(w));
}

function scoreEntry(entry: FAQEntry, queryTokens: string[]): number {
  const entryTokens = new Set(
    tokenize(`${entry.question} ${entry.answer}`)
  );

  let score = 0;
  for (const qt of queryTokens) {
    if (entryTokens.has(qt)) {
      score += 2; // exact match
      continue;
    }
    // partial / substring match
    for (const et of entryTokens) {
      if (et.includes(qt) || qt.includes(et)) {
        score += 0.5;
        break;
      }
    }
  }

  if (entry.isCommon) score += 0.5;
  return score;
}

// Map workspace conversation categories → FAQ section names
const CATEGORY_MAP: Record<string, string> = {
  CARDS: "Card",
  ACCOUNT: "Account",
  SPENDS: "Billing",
  KYC: "KYC",
  GENERAL: "General",
  OTHER: "General",
};

/**
 * Retrieve the most relevant FAQ entries for a user message.
 * Uses the conversation's categories for a relevance boost, then
 * keyword scoring to rank all entries.
 */
export function retrieveFAQContext(
  userMessage: string,
  categories: string[],
  maxEntries = 5
): string {
  const entries = parseFAQ();
  const queryTokens = tokenize(userMessage);

  if (queryTokens.length === 0) return "";

  const relevantFaqCategories = categories
    .map((c) => CATEGORY_MAP[c])
    .filter(Boolean);

  const scored = entries.map((entry) => {
    let score = scoreEntry(entry, queryTokens);
    if (relevantFaqCategories.includes(entry.category)) {
      score *= 1.5;
    }
    return { entry, score };
  });

  scored.sort((a, b) => b.score - a.score);

  const top = scored.filter((s) => s.score > 0).slice(0, maxEntries);
  if (top.length === 0) return "";

  return top
    .map(({ entry }) => `[${entry.category}] Q: ${entry.question}\nA: ${entry.answer}`)
    .join("\n\n---\n\n");
}
