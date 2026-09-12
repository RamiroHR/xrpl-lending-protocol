import { Client } from 'xrpl';
import * as dotenv from 'dotenv';

dotenv.config();

const DEVNET_WSS = 'wss://s.devnet.rippletest.net:51233/';

export function getWssEndpoint(): string {
  return process.env.XRPL_WSS ?? DEVNET_WSS;
}

const CONNECTION_TIMEOUT_MS = 20_000;

export async function withClient<T>(fn: (client: Client) => Promise<T>): Promise<T> {
  const client = new Client(getWssEndpoint(), { connectionTimeout: CONNECTION_TIMEOUT_MS });
  await client.connect();
  try {
    return await fn(client);
  } finally {
    await client.disconnect();
  }
}
