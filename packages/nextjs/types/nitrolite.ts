// Import Viem types for compatibility
import type { Address, Hex } from "viem";

/**
 * Nitrolite SDK Type Definitions
 * Comprehensive type definitions for ERC-7824 Nitrolite SDK integration
 * with Viem/Wagmi and Scaffold-ETH compatibility
 */

// Re-export available Nitrolite SDK types
export type {
  // Core SDK types
  RPCRequest,
  RPCResponse,
  RPCMethod,
  RPCAppDefinition,
  RPCAppSessionAllocation,
  RPCAppSession,

  // Message signer types
  MessageSigner,
} from "@erc7824/nitrolite";

// ============ Custom ClearNode Types ============

export interface ClearNodeConfig {
  endpoint: string;
  apiKey?: string;
  timeout: number;
  retryAttempts: number;
  reconnectDelay: number;
}

export interface ClearNodeMessage {
  id?: number;
  method?: string;
  params?: any;
  result?: any;
  error?: {
    code: number;
    message: string;
    data?: any;
  };
}

export interface ClearNodeConnection {
  isConnected: boolean;
  isAuthenticated: boolean;
  jwtToken?: string;
  sessionKey?: string;
  lastPing?: number;
}

// ============ Yellow Network API Types ============

export interface YellowNetworkConfig {
  apiEndpoint: string;
  apiKey?: string;
  timeout: number;
  retryAttempts: number;
}

export interface YellowNetworkQuote {
  fromToken: Address;
  toToken: Address;
  fromAmount: bigint;
  toAmount: bigint;
  fee: bigint;
  estimatedTime: string;
  route: string[];
  yellowChannelId?: string;
  quoteId: string;
  expiresAt: number;
}

export interface YellowNetworkSwapIntent {
  intentId: string;
  from: Address;
  to: Address;
  fromAmount: bigint;
  fromToken: Address;
  toToken: Address;
  fromChainId: number;
  toChainId: number;
  status: "pending" | "confirmed" | "settled" | "failed" | "expired";
  yellowChannelId?: string;
  settlementDeadline?: number;
  createdAt: number;
  updatedAt: number;
}

export interface YellowNetworkChannel {
  channelId: string;
  participants: Address[];
  totalLiquidity: bigint;
  isActive: boolean;
  lastUpdate: number;
}

export interface QuoteParams {
  fromToken: Address;
  toToken: Address;
  fromAmount: bigint;
  fromChainId: number;
  toChainId: number;
  slippageTolerance?: number;
}

export interface SwapIntentRequest {
  from: Address;
  to: Address;
  fromAmount: bigint;
  fromToken: Address;
  toToken: Address;
  fromChainId: number;
  toChainId: number;
  quoteId: string;
  deadline?: number;
  signature?: string;
}

// ============ PYUSD Bridge Types ============

export interface PYUSDBridgeConfig {
  ethereumAddress: Address;
  solanaAddress?: string;
  decimals: number;
  symbol: string;
  name: string;
}

export interface PYUSDBalance {
  address: Address;
  balance: bigint;
  chainId: number;
  lastUpdated: number;
}

export interface PYUSDTransfer {
  from: Address;
  to: Address;
  amount: bigint;
  chainId: number;
  transactionHash?: Hex;
  status: "pending" | "confirmed" | "failed";
}

// ============ State Channel Types ============

export interface ChannelParticipant {
  address: Address;
  balance: bigint;
  weight: number;
}

export interface ChannelState {
  channelId: string;
  participants: ChannelParticipant[];
  nonce: number;
  stateHash: string;
  isOpen: boolean;
  totalDeposit: bigint;
  chainId: number;
}

export interface PaymentRequest {
  amount: bigint;
  recipient: Address;
  token: string;
  description?: string;
}

export interface SettlementRequest {
  channelId: string;
  settlements: Array<{
    from: Address;
    to: Address;
    amount: bigint;
    token: string;
  }>;
}

// ============ Message Signing Types (Viem Compatible) ============

export interface ViemMessageSigner {
  (payload: any): Promise<Hex>;
}

export interface EIP712Domain {
  name: string;
  version: string;
  chainId: number;
  verifyingContract: Address;
}

export interface EIP712Types {
  [key: string]: Array<{ name: string; type: string }>;
}

// ============ Service Integration Types ============

export interface ServiceStatus {
  isConnected: boolean;
  isAuthenticated: boolean;
  lastError?: string;
  lastUpdate: number;
}

export interface ClearNodeServiceStatus extends ServiceStatus {
  jwtToken?: string;
  sessionKey?: string;
}

export interface YellowNetworkServiceStatus extends ServiceStatus {
  activeIntents: number;
  supportedTokens: Address[];
}

export interface PYUSDBridgeServiceStatus extends ServiceStatus {
  supportedChains: number[];
  bridgeAvailable: boolean;
}

// ============ Hook Return Types ============

export interface UseStateChannelReturn {
  // Connection status
  isConnected: boolean;
  isAuthenticated: boolean;

  // Channel state
  currentChannel: ChannelState | null;
  isChannelActive: boolean;

  // Actions
  connect: () => Promise<void>;
  createChannel: (
    participants: Address[],
    allocations: Array<{ participant: Address; asset: string; amount: string }>,
  ) => Promise<string>;
  sendPayment: (payment: PaymentRequest) => Promise<void>;
  closeChannel: () => Promise<void>;

  // Yellow Network
  getQuote: (
    fromToken: Address,
    toToken: Address,
    amount: bigint,
    fromChainId: number,
    toChainId: number,
  ) => Promise<YellowNetworkQuote>;
  submitSwapIntent: (
    from: Address,
    to: Address,
    fromAmount: bigint,
    fromToken: Address,
    toToken: Address,
    fromChainId: number,
    toChainId: number,
  ) => Promise<string>;

  // Status
  isLoading: boolean;
  error: string | null;
}

export interface UsePYUSDContractReturn {
  balance: bigint | undefined;
  approveAsync: (spender: Address, amount: bigint) => Promise<Hex>;
  transferAsync: (to: Address, amount: bigint) => Promise<Hex>;
  allowance: bigint | undefined;
  isLoading: boolean;
  error: string | null;
}

// ============ Error Types ============

export class ClearNodeError extends Error {
  constructor(
    message: string,
    public code?: number,
    public data?: any,
  ) {
    super(message);
    this.name = "ClearNodeError";
  }
}

export class YellowNetworkError extends Error {
  constructor(
    message: string,
    public intentId?: string,
    public status?: string,
  ) {
    super(message);
    this.name = "YellowNetworkError";
  }
}

export class PYUSDBridgeError extends Error {
  constructor(
    message: string,
    public transferId?: string,
    public chainId?: number,
  ) {
    super(message);
    this.name = "PYUSDBridgeError";
  }
}

// ============ Utility Types ============

export type SupportedChain = 1 | 42161 | 10 | 8453 | 137; // Ethereum, Arbitrum, Optimism, Base, Polygon

export interface TokenInfo {
  address: Address;
  symbol: string;
  name: string;
  decimals: number;
  chainId: SupportedChain;
  isStablecoin: boolean;
  hasCrossChainBridge: boolean;
  bridgeOptions: string[];
  paypalBridgeSupported?: boolean;
}

export interface SettlementRoute {
  type: "direct" | "pyusd-direct" | "yellow-network" | "paypal-bridge";
  estimatedTime: string;
  estimatedFee: bigint;
  requiresApproval: boolean;
  description: string;
}

// ============ Event Types ============

export interface ChannelEvent {
  type: "opened" | "closed" | "state_updated" | "dispute_initiated" | "dispute_resolved";
  channelId: string;
  timestamp: number;
  data: any;
}

export interface SettlementEvent {
  type: "initiated" | "confirmed" | "settled" | "failed";
  settlementId: string;
  timestamp: number;
  data: any;
}

export interface YellowNetworkEvent {
  type: "intent_created" | "intent_confirmed" | "intent_settled" | "intent_failed";
  intentId: string;
  timestamp: number;
  data: any;
}

// ============ Configuration Types ============

export interface AppConfiguration {
  clearNode: ClearNodeConfig;
  yellowNetwork: YellowNetworkConfig;
  pyusdBridge: PYUSDBridgeConfig;
  supportedChains: SupportedChain[];
  supportedTokens: TokenInfo[];
  defaultSettlementRoute: SettlementRoute["type"];
}

// ============ API Response Types ============

export interface APIResponse<T = any> {
  success: boolean;
  data?: T;
  error?: string;
  timestamp: number;
}

export interface PaginatedResponse<T = any> extends APIResponse<T[]> {
  pagination: {
    page: number;
    limit: number;
    total: number;
    hasNext: boolean;
    hasPrev: boolean;
  };
}

// ============ Type Guards ============

export function isAddress(value: any): value is Address {
  return typeof value === "string" && /^0x[a-fA-F0-9]{40}$/.test(value);
}

export function isHex(value: any): value is Hex {
  return typeof value === "string" && /^0x[a-fA-F0-9]*$/.test(value);
}

export function isBigInt(value: any): value is bigint {
  return typeof value === "bigint";
}

export function isSupportedChain(chainId: number): chainId is SupportedChain {
  return [1, 42161, 10, 8453, 137].includes(chainId);
}

// ============ Constants ============

export const PYUSD_CONSTANTS = {
  ETHEREUM_ADDRESS: "0x6c3ea9036406852006290770BEdFcAbA0e23A0e8" as const,
  SOLANA_ADDRESS: "2b1kV6DkPAnxd5ixfnxCpjxmKwqjjaYmCZfHsFu24GXo" as const,
  DECIMALS: 6,
  SYMBOL: "PYUSD",
  NAME: "PayPal USD",
  DOCUMENTATION: "https://developer.paypal.com/dev-center/pyusd/",
  FAUCET: "https://faucet.pyusd.com",
} as const;

export const YELLOW_NETWORK_CONSTANTS = {
  ENDPOINT: "wss://clearnet.yellow.com/ws",
  API_ENDPOINT: "https://api.yellow.com",
  SUPPORTED_CHAINS: [1, 42161, 10, 8453, 137] as const,
  SETTLEMENT_TIMEOUT: 24 * 60 * 60 * 1000, // 24 hours in milliseconds
} as const;

export const CLEARNODE_CONSTANTS = {
  ENDPOINT: "wss://clearnet.yellow.com/ws",
  AUTH_SCOPE: "console",
  SESSION_TIMEOUT: 24 * 60 * 60 * 1000, // 24 hours in milliseconds
  RECONNECT_DELAY: 5000, // 5 seconds
  MAX_RETRY_ATTEMPTS: 3,
} as const;
