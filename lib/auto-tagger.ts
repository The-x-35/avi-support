/**
 * Regex-based category guesser.
 * Runs on every user message — no AI calls, zero latency.
 * Returns the detected category (CARDS | ACCOUNT | SPENDS | KYC | GENERAL | OTHER)
 * and a confidence score, or null if nothing matches with enough confidence.
 */

export type Category = "CARDS" | "ACCOUNT" | "SPENDS" | "KYC" | "GENERAL" | "OTHER";

export interface CategoryGuess {
  category: Category;
  confidence: number;
}

interface CategoryRule {
  category: Category;
  confidence: number;
  pattern: RegExp;
}

const RULES: CategoryRule[] = [
  // ─── CARDS ───────────────────────────────────────────────────────────────────
  { category: "CARDS", confidence: 0.9,
    pattern: /\b(cards?|credit card|debit card|atm|my card|new card|virtual card|card block|card lost|card stolen|card limit|card pin|card activat|card declin|card rejected|card not work|card fail|card replace|card reissue|card number|blocked card|lost card|stolen card)\b/i },

  // ─── ACCOUNT ─────────────────────────────────────────────────────────────────
  { category: "ACCOUNT", confidence: 0.9,
    pattern: /\b(account|login|log in|sign in|password|otp|locked out|account locked|account suspended|account blocked|account frozen|account disabled|account access|forgot password|reset password|can't login|cannot login|profile update|change email|change phone|account setting|security alert)\b/i },

  // ─── SPENDS ──────────────────────────────────────────────────────────────────
  { category: "SPENDS", confidence: 0.9,
    pattern: /\b(refund|money back|reimburse|chargeback|dispute|unauthorized|wrong charge|double charge|overcharged|charged twice|extra charge|pending transaction|failed transaction|payment failed|payment pending|transaction missing|amount deducted|emi failed|emi due|money deducted|not received money)\b/i },

  // ─── KYC ─────────────────────────────────────────────────────────────────────
  { category: "KYC", confidence: 0.9,
    pattern: /\b(kyc|verification|verify|re-kyc|e-kyc|video kyc|document|aadhaar|aadhar|pan card|passport|driving licence|identity proof|address proof|pending verification|verification failed|verification rejected|not verified)\b/i },

  // ─── GENERAL ─────────────────────────────────────────────────────────────────
  { category: "GENERAL", confidence: 0.75,
    pattern: /\b(how do|how can|what is|where can|when will|help|information|question|query|explain|understand|feature|service|product|plan|offer|interest rate|fee)\b/i },
];

/**
 * Guess the category from a single message.
 * Returns the best match above threshold, or null.
 */
export function guessCategory(text: string): CategoryGuess | null {
  // Try all rules, pick highest confidence match
  let best: CategoryGuess | null = null;

  for (const rule of RULES) {
    if (rule.pattern.test(text)) {
      if (!best || rule.confidence > best.confidence) {
        best = { category: rule.category, confidence: rule.confidence };
      }
    }
  }

  return best;
}
