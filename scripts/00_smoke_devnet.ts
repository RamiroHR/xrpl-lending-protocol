import { withClient } from '../config/client';

async function main(): Promise<void> {
  console.log(`Connecting to ${process.env.XRPL_WSS ?? 'wss://s.devnet.rippletest.net:51233/'} …`);

  await withClient(async (client) => {
    const res = await client.request({ command: 'server_info' });
    const info = res.result.info;

    console.log('server_state    :', info.server_state);
    console.log('complete_ledgers:', info.complete_ledgers);
    console.log('build_version   :', info.build_version);
    console.log('\nDevnet connection OK');
  });
}

main().catch((err: Error) => {
  console.error('Smoke test FAILED:', err.message);
  process.exit(1);
});
