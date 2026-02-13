# CowSwap / CoW Protocol — Skill Research

**Date:** 2026-02-13
**Status:** Research complete, ready for implementation planning

---

## 1. Existing OpenClaw Integrations

No existing OpenClaw skills or published integrations for CowSwap/CoW Protocol were found. This would be a **net-new skill**.

---

## 2. CoW Protocol API & SDK Overview

### Architecture
CoW Protocol is an **intent-based** DEX. Users sign off-chain orders (intents), which solvers then batch and settle on-chain. Users never pay gas for swaps — solvers do.

### Key Components

| Component | Package | Purpose |
|-----------|---------|---------|
| **TradingSdk** | `@cowprotocol/cow-sdk` (or `@cowprotocol/sdk-trading`) | High-level: quote → sign → post in one call |
| **OrderBookApi** | `@cowprotocol/cow-sdk` | Low-level: get quotes, post/cancel orders, get trades |
| **OrderSigningUtils** | `@cowprotocol/cow-sdk` | EIP-712 order signing |
| **ConditionalOrder (ComposableCoW)** | `@cowprotocol/cow-sdk` (composable package) | Programmatic orders (TWAP, stop-loss, etc.) |

### REST API
- Base URL: `https://api.cow.fi/mainnet/` (also `/xdai/`, `/sepolia/`, `/base/`, `/arbitrum_one/`, etc.)
- Swagger docs: `https://api.cow.fi/docs/`
- Key endpoints:
  - `POST /api/v1/quote` — get a quote
  - `POST /api/v1/orders` — submit signed order
  - `GET /api/v1/orders/{UID}` — order status
  - `DELETE /api/v1/orders/{UID}` — soft cancel

### SDK (TypeScript/Node.js)
```bash
npm install @cowprotocol/cow-sdk @cowprotocol/sdk-viem-adapter viem
```

The SDK v7 requires an **adapter** for the web3 library you use:
- `@cowprotocol/sdk-viem-adapter` (recommended for bots — lightest)
- `@cowprotocol/sdk-ethers-v6-adapter`
- `@cowprotocol/sdk-ethers-v5-adapter`

### Supported Chains
Ethereum (1), Gnosis (100), Arbitrum (42161), Base (8453), Polygon (137), Avalanche (43114), BNB (56), Linea (59144), Lens (232), Plasma (9745), Ink (57073), Sepolia (11155111, testnet)

---

## 3. Bot Order Flow

### Simple Swap (Market Order)
```
1. Approve sellToken → GPv2VaultRelayer contract
2. sdk.getQuote({ kind, sellToken, buyToken, amount, ... })
3. Review quote (amounts, costs, slippage)
4. sdk.postSwapOrder(parameters) — signs EIP-712 + posts
5. Poll order status until filled/expired
```

### What a Bot Needs

| Requirement | Details |
|-------------|---------|
| **Private key** | EIP-712 signing (off-chain, gasless for the order itself) |
| **RPC URL** | For on-chain reads (allowance checks, token info) |
| **Token approval** | One-time on-chain tx: approve GPv2VaultRelayer to spend sellToken |
| **No API key** | CoW Protocol API is **public and permissionless** |
| **appCode** | Free identifier string for tracking (e.g. `"openclaw-agent"`) |

### Signing
- Orders are signed off-chain using **EIP-712** typed data
- The SDK handles this via the adapter's signer (private key or wallet)
- Smart contract wallets use **ERC-1271** (presign on-chain)
- Signing scheme options: `EIP712`, `ETHSIGN`, `PRESIGN` (on-chain)

### Token Approval Flow
```typescript
// Check allowance
const allowance = await sdk.getCowProtocolAllowance(tokenAddress)
// If insufficient:
await sdk.approveCowProtocol(tokenAddress) // on-chain tx, costs gas
```
The approval target is the **GPv2VaultRelayer** contract (not the settlement contract).

### Order Types

| Type | SDK Method | Notes |
|------|-----------|-------|
| **Market swap** | `postSwapOrder()` | Quote-based, includes slippage protection |
| **Limit order** | `postLimitOrder()` | Specify exact sell+buy amounts, `validTo` timestamp |
| **TWAP** | ComposableCoW / Programmatic Orders | Requires deploying a smart contract (ComposableCoW framework). Not a simple API call — needs on-chain Safe/smart wallet. |
| **Stop-loss** | Programmatic Orders | Same as TWAP — requires smart contract wallet |

### Cancellation
- **Off-chain (soft)**: `sdk.offChainCancelOrder(orderId)` — free, instant
- **On-chain (hard)**: `sdk.onChainCancelOrder(orderId)` — costs gas, guaranteed

### Selling Native Currency (ETH)
- Special flow: `sdk.postSellNativeCurrencyOrder()` — wraps ETH via on-chain tx, creates order for WETH

---

## 4. Forum / Community Bot Discussions

Could not access forum.cow.fi content directly (web_search unavailable due to missing Brave API key). However, from the SDK docs:

- The SDK is clearly designed for programmatic/bot use (Node.js examples with private keys)
- `appCode` tracking suggests an ecosystem of bot integrators
- UTM tracking in SDK for developer attribution
- No restrictions on bot usage found in docs

---

## 5. Skill Specification Draft

### Skill: `cowswap-trade`

**Description:** Execute token swaps on CoW Protocol (CowSwap) via intent-based orders with MEV protection.

#### Inputs

| Parameter | Type | Required | Description |
|-----------|------|----------|-------------|
| `action` | enum | yes | `swap`, `limit`, `quote`, `cancel`, `status`, `approve` |
| `chainId` | number | yes | Target chain (1, 100, 8453, 42161, etc.) |
| `sellToken` | string | for trades | Token address or symbol to sell |
| `buyToken` | string | for trades | Token address or symbol to buy |
| `amount` | string | for trades | Amount in human-readable units (e.g. "1.5") |
| `kind` | enum | for trades | `sell` or `buy` |
| `limitPrice` | string | for limit | Target price for limit orders |
| `validFor` | number | no | Order validity in minutes (default: 30) |
| `receiver` | string | no | Recipient address (default: signer) |
| `slippageBps` | number | no | Slippage tolerance in basis points |
| `orderId` | string | for cancel/status | Order UID |

#### Outputs

| Field | Description |
|-------|-------------|
| `orderId` | CoW Protocol order UID |
| `status` | Order status (open, fulfilled, cancelled, expired) |
| `executedAmounts` | Actual fill amounts |
| `explorerUrl` | Link to CoW Explorer |
| `quoteDetails` | Quote breakdown (amounts, fees, slippage) |

#### Dependencies

| Dependency | Version | Purpose |
|------------|---------|---------|
| `@cowprotocol/cow-sdk` | ^7.x | Core SDK |
| `@cowprotocol/sdk-viem-adapter` | ^7.x | Blockchain adapter |
| `viem` | ^2.x | Ethereum interactions |

#### Secrets / Config Required

| Secret | Description |
|--------|-------------|
| `PRIVATE_KEY` | Wallet private key for signing orders |
| `RPC_URL` | JSON-RPC endpoint for the target chain |

**No API keys needed** — CoW Protocol API is fully public.

#### Architecture Notes

- The skill should maintain a **token registry** (symbol → address mapping) for UX
- Approval state should be cached/checked before each trade
- Quote → confirm → execute flow allows human-in-the-loop
- Order monitoring via polling `getOrder()` until terminal state

---

## 6. Walls & Considerations

### No Blockers
- ✅ **No API keys** — fully permissionless
- ✅ **No gas for orders** — only for approvals
- ✅ **Testnet available** — Sepolia for testing
- ✅ **Well-documented SDK** with Node.js examples

### Considerations
- ⚠️ **Private key management** — the skill needs access to a signing key. Must integrate with OpenClaw's secret management.
- ⚠️ **Token approvals cost gas** — first trade per token requires an on-chain approval tx (needs ETH/native token for gas)
- ⚠️ **TWAP/programmatic orders** are significantly more complex — require deploying via ComposableCoW framework with a Safe. Recommend starting with swap + limit only.
- ⚠️ **Order may not fill** — CoW orders are intents; if no solver picks them up, they expire. Limit orders especially may never fill.
- ⚠️ **Token decimals** — must be fetched on-chain or from a registry. The SDK requires explicit decimal values.
- ⚠️ **Price impact** — large orders may have significant price impact. Quote should be surfaced to user before execution.
- ⚠️ **Node.js 22+** required by the SDK

### Recommended Implementation Phases

1. **Phase 1:** Quote + Swap (market orders) on Ethereum mainnet
2. **Phase 2:** Limit orders + multi-chain support
3. **Phase 3:** Order monitoring + cancellation
4. **Phase 4:** TWAP (if smart contract wallet integration is feasible)

---

## 7. Example: Minimal Bot Swap (Node.js)

```typescript
import { SupportedChainId, OrderKind, TradingSdk } from '@cowprotocol/cow-sdk'
import { ViemAdapter } from '@cowprotocol/sdk-viem-adapter'
import { createPublicClient, http, privateKeyToAccount } from 'viem'
import { mainnet } from 'viem/chains'

const adapter = new ViemAdapter({
  provider: createPublicClient({ chain: mainnet, transport: http(process.env.RPC_URL) }),
  signer: privateKeyToAccount(process.env.PRIVATE_KEY as `0x${string}`)
})

const sdk = new TradingSdk({
  chainId: SupportedChainId.MAINNET,
  appCode: 'openclaw-agent',
}, {}, adapter)

// Check & approve token if needed
const allowance = await sdk.getCowProtocolAllowance('0x...sellToken')
if (allowance === 0n) {
  await sdk.approveCowProtocol('0x...sellToken')
}

// Execute swap
const { orderId } = await sdk.postSwapOrder({
  kind: OrderKind.SELL,
  sellToken: '0xA0b86991c6218b36c1d19D4a2e9Eb0cE3606eB48', // USDC
  sellTokenDecimals: 6,
  buyToken: '0xC02aaA39b223FE8D0A0e5C4F27eAD9083C756Cc2',  // WETH
  buyTokenDecimals: 18,
  amount: '1000000000', // 1000 USDC
})

console.log(`Order: https://explorer.cow.fi/orders/${orderId}`)
```
