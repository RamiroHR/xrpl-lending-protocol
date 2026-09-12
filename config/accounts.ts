import { Wallet } from 'xrpl';
import * as dotenv from 'dotenv';

dotenv.config();

function requireSeed(envKey: string): string {
  const val = process.env[envKey];
  if (!val) throw new Error(`Missing required env var: ${envKey} — run scripts/01_setup_accounts.ts first`);
  return val;
}

export interface Accounts {
  investorA: Wallet;
  investorB: Wallet;
  borrower: Wallet;
  broker: Wallet;
  uncredentialed: Wallet;
}

export function loadAccounts(): Accounts {
  return {
    investorA: Wallet.fromSeed(requireSeed('INVESTOR_A_SEED')),
    investorB: Wallet.fromSeed(requireSeed('INVESTOR_B_SEED')),
    borrower: Wallet.fromSeed(requireSeed('BORROWER_SEED')),
    broker: Wallet.fromSeed(requireSeed('BROKER_SEED')),
    uncredentialed: Wallet.fromSeed(requireSeed('UNCREDENTIALED_SEED')),
  };
}
