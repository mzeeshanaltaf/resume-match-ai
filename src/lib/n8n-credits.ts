import { callN8nWebhook } from "./n8n";
import { getUserData } from "./n8n-data";
import type {
  CreditBalanceResponse,
  CreditHistoryResponse,
} from "@/types/n8n";

const WEBHOOK_ID = process.env.N8N_CREDITS_WEBHOOK_ID!;

export function signupCredits(userId: string): Promise<{ success: boolean }> {
  return callN8nWebhook<{ success: boolean }>(WEBHOOK_ID, {
    event_type: "signup_credits",
    user_id: userId,
  });
}

export async function getRemainingCredits(
  userId: string
): Promise<CreditBalanceResponse> {
  const data = await getUserData(userId);
  return { current_balance: data.remaining_credit };
}

export async function getCreditHistory(
  userId: string
): Promise<CreditHistoryResponse> {
  const data = await getUserData(userId);
  return data.credit_history;
}
