# XRPL Developer Experience Log

Captured during hackathon development — Track 2 Loaded (Permissioned Domains + MPT shares).  
Environment: XRPL public Devnet · Library: `xrpl.js@5.2.0-beta.0` · Protocol: XLS-65/66 V1.1

Severity scale: **Low** (minor inconvenience) · **Medium** (workaround required) · **High** (blocks progress or correctness)

---

## Index

| ID | Title | Category | Severity |
|---|---|---|---|
| [DX-01](#dx-01--interestrate-annualized-formula-produces-unobservable-yield-in-short-duration-vaults) | `InterestRate` annualized formula produces unobservable yield in short-duration vaults | Documentation / UX | Medium |
| [DX-02](#dx-02--devnet-websocket-exposes-only-port-51233-blocked-by-corporate-and-isp-firewalls) | Devnet WebSocket exposes only port 51233, blocked by corporate / ISP firewalls | Infrastructure / DevEx | High |
| [DX-03](#dx-03--xrpljs-default-5s-connectiontimeout-too-short-for-mobile--event-networks) | xrpl.js default 5s `connectionTimeout` too short for mobile / event networks | SDK / UX | Medium |

---

## DX-01 — `InterestRate` annualized formula produces unobservable yield in short-duration vaults

**Category:** Documentation / UX  
**Severity:** Medium  
**Library:** `xrpl.js@5.2.0-beta.0` · XLS-66 V1.1  

### Description

The `InterestRate` field in `LoanSet` is an annualized rate expressed in 1/10th basis points (max `100000` = 100% p.a.). For vaults with compressed Investment phases — as required for hackathon demos or integration tests — this formula produces negligible interest amounts regardless of the rate set.

At the maximum rate of `100000` (100% annualized), a 10-minute single-payment loan on 10,000 XRP yields:

```
interest = 10,000 × 1.0 × (600 / 31,536,000) ≈ 0.19 XRP
PPS delta ≈ 0.000019  (effectively invisible)
```

Even at 100% annualized, PPS does not move in any perceptible way over a sub-hour Investment window. The only practical workaround is to inject yield separately via `VaultDeposit` with `tfVaultDonation`, a mechanism designed for donations — not for simulating loan interest returns. This means the core yield mechanic of the protocol cannot be demonstrated end-to-end without an out-of-band injection step that is not documented as the expected pattern.

This also affects CI/CD pipelines and any integration test that tries to assert PPS growth after a repayment: tests will pass structurally but fail to validate the yield math in any meaningful way without unrealistically long `PaymentInterval` values.

### Reproduction

1. Create a closed-ended vault with Investment phase of 10 minutes.
2. Submit `LoanSet` with `InterestRate: 100000`, `PrincipalRequested: 10000`, `PaymentTotal: 1`, `PaymentInterval: 600`.
3. Submit repayment after drawdown.
4. Observe: PPS delta < 0.00002; `AssetsTotal` increase is sub-XRP.

### Proposed fix

Two complementary improvements:

1. **Add a `PaymentIntervalRate` field** (or equivalent) to `LoanSet` that expresses interest as a flat per-period rate rather than an annualized fraction. This would allow short-duration loans to produce observable yield without requiring astronomically unrealistic annualized rates.

2. **Document the `tfVaultDonation` pattern explicitly** as the recommended approach for test and demo environments. The current docs describe `tfVaultDonation` only as a donation mechanism. A dedicated section — "Simulating yield in short-duration vaults" — would prevent developers from discovering this workaround by accident and would clarify that `InterestRate`-computed interest is insufficient for sub-day vaults.

---

## DX-02 — Devnet WebSocket exposes only port 51233, blocked by corporate / ISP firewalls

**Category:** Infrastructure / DevEx  
**Severity:** High  
**Library:** `xrpl.js@5.2.0-beta.0` · XRPL public Devnet  

### Description

The XRPL public Devnet WebSocket endpoint (`wss://s.devnet.rippletest.net:51233`) exposes only port 51233 for WSS connections. Port 51233 is a non-standard port that many corporate firewalls and some consumer ISPs block by default. There is no fallback on port 443 (standard HTTPS/WSS) for the public Devnet.

When a developer installs `xrpl.js@5.2.0-beta.0` and runs a `server_info` smoke test from a network that blocks port 51233, the client silently times out after 5 seconds:

```
Smoke test FAILED: Error: connect() timed out after 5000 ms. If your internet
connection is working, the rippled server may be blocked or inaccessible.
You can also try setting the 'connectionTimeout' option in the Client constructor.
```

The error message points to the server being blocked but provides no guidance on:
- Which port to check
- How to verify DNS vs TCP-layer reachability independently
- Whether an alternative port or endpoint exists
- Whether the issue is the developer's network or a Devnet outage

DNS resolves correctly (4 IPs returned) but TCP SYN on port 51233 never receives a response. Developers at venues with restrictive networks (hackathons, office buildings, hotels) are silently dead in the water.

### Reproduction

1. Install `xrpl.js@5.2.0-beta.0`.
2. Create a minimal TypeScript file: `new Client('wss://s.devnet.rippletest.net:51233/'); await client.connect();`
3. Run behind a network that blocks non-standard ports (common in corporate/event WiFi).
4. Observe: `connect() timed out after 5000 ms` — no actionable diagnostic.

### Proposed fix

Two improvements:

1. **Expose port 443 on the public Devnet.** Virtually all networks permit outbound HTTPS (port 443). The Testnet already has `wss://s.altnet.rippletest.net:443` — the Devnet should have an equivalent. This single change unblocks developers on restricted networks without any SDK changes.

2. **Improve the timeout error message in xrpl.js.** Include the hostname and port in the error: *"connect() timed out on wss://s.devnet.rippletest.net:51233 after 5000 ms. Port 51233 may be blocked by your firewall. Verify with: `nc -zv s.devnet.rippletest.net 51233`."* A one-line diagnostic command dramatically reduces the time to root-cause network vs. code issues.

---

## DX-03 — xrpl.js default 5s `connectionTimeout` too short for mobile / event networks

**Category:** SDK / UX  
**Severity:** Medium  
**Library:** `xrpl.js@5.2.0-beta.0`

### Description

The `Client` constructor in xrpl.js defaults to `connectionTimeout: 5000` ms. On mobile hotspots and event venue networks (high latency, shared bandwidth), the initial TLS + WebSocket handshake to the Devnet reliably exceeds 5 seconds, causing `connect()` to throw:

```
connect() timed out after 5000 ms. If your internet connection is working,
the rippled server may be blocked or inaccessible.
```

TCP connectivity on port 51233 was confirmed working (`net.createConnection` succeeded), but xrpl.js rejected the connection before the handshake completed. The workaround — passing `{ connectionTimeout: 20000 }` to the `Client` constructor — is not mentioned in the getting-started docs or any quickstart example.

Because the error message says "the rippled server may be blocked or inaccessible," developers correctly diagnose this as a network/firewall issue (DX-02) and spend time on that path before discovering the real cause is a too-short client-side timeout.

### Reproduction

1. On a mobile hotspot or high-latency network, confirm TCP port 51233 is reachable (`net.createConnection` succeeds).
2. Run `new Client('wss://s.devnet.rippletest.net:51233/'); await client.connect();` with default options.
3. Observe: `connect() timed out after 5000 ms` despite TCP being open.
4. Pass `{ connectionTimeout: 20000 }` — connection succeeds.

### Proposed fix

Two improvements:

1. **Increase the default `connectionTimeout` to 15–20 seconds.** A 5s default is appropriate for production mainnet from a data-center; it is not appropriate for developer laptops on event or mobile networks. The cost of a longer default is negligible (scripts wait a bit longer on fast networks); the benefit is eliminating a common false-negative failure mode.

2. **Document `connectionTimeout` in the quickstart and getting-started examples.** A one-line note — *"On slow networks, pass `{ connectionTimeout: 15000 }` to the Client constructor"* — would prevent developers from misdiagnosing this as a firewall or server issue.

---
