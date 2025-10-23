/**
 * Supported tokens for BatchPay settlements
 * Reference: https://developer.paypal.com/dev-center/pyusd/
 */

export interface Token {
  symbol: string;
  name: string;
  address: string;
  chains: number[];
  solanaAddress?: string;
  decimals: number;
  icon: string;
  isStablecoin: boolean;
  pegged?: string;
  hasCrossChainBridge: boolean;
  bridgeOptions: string[];
  paypalBridgeSupported?: boolean;
  description?: string;
}

export const SUPPORTED_TOKENS: Token[] = [
  {
    symbol: "ETH",
    name: "Ethereum",
    address: "0x0000000000000000000000000000000000000000",
    chains: [1, 42161, 10, 8453], // Ethereum, Arbitrum, Optimism, Base
    decimals: 18,
    icon: "/tokens/eth.svg",
    isStablecoin: false,
    hasCrossChainBridge: true,
    bridgeOptions: ["yellow", "native"],
  },
  {
    symbol: "PYUSD", // ⭐ PayPal USD
    name: "PayPal USD",
    address: "0x6c3ea9036406852006290770BEdFcAbA0e23A0e8", // Ethereum
    chains: [1], // Ethereum (also available on Solana with different address)
    solanaAddress: "2b1kV6DkPAnxd5ixfnxCpjxmKwqjjaYmCZfHsFu24GXo",
    decimals: 6,
    icon: "/tokens/pyusd.svg",
    isStablecoin: true,
    pegged: "USD",
    hasCrossChainBridge: true,
    bridgeOptions: ["paypal", "layerzero", "yellow"],
    paypalBridgeSupported: true, // Special: Can use PayPal/Venmo bridge
    description: "PayPal USD - Stablecoin backed 1:1 by USD deposits and US treasuries",
  },
  {
    symbol: "USDC",
    name: "USD Coin",
    address: "0xA0b86991c6218b36c1d19D4a2e9Eb0cE3606eB48",
    chains: [1, 42161, 10, 8453, 137], // Multi-chain
    decimals: 6,
    icon: "/tokens/usdc.svg",
    isStablecoin: true,
    pegged: "USD",
    hasCrossChainBridge: true,
    bridgeOptions: ["yellow", "cctp"],
  },
  {
    symbol: "DAI",
    name: "Dai Stablecoin",
    address: "0x6B175474E89094C44Da98b954EedeAC495271d0F",
    chains: [1, 42161, 10, 137],
    decimals: 18,
    icon: "/tokens/dai.svg",
    isStablecoin: true,
    pegged: "USD",
    hasCrossChainBridge: true,
    bridgeOptions: ["yellow"],
  },
];

// PYUSD Constants (from PayPal documentation)
export const PYUSD_CONSTANTS = {
  ETHEREUM_ADDRESS: "0x6c3ea9036406852006290770BEdFcAbA0e23A0e8" as const,
  SOLANA_ADDRESS: "2b1kV6DkPAnxd5ixfnxCpjxmKwqjjaYmCZfHsFu24GXo" as const,
  DECIMALS: 6,
  SYMBOL: "PYUSD",
  NAME: "PayPal USD",
  DOCUMENTATION: "https://developer.paypal.com/dev-center/pyusd/",
  FAUCET: "https://faucet.pyusd.com", // For testing
};

export const isPYUSD = (tokenAddress: string): boolean => {
  return tokenAddress.toLowerCase() === PYUSD_CONSTANTS.ETHEREUM_ADDRESS.toLowerCase();
};

export const getPYUSDForChain = (chainId: number): string | null => {
  if (chainId === 1) return PYUSD_CONSTANTS.ETHEREUM_ADDRESS; // Ethereum
  if (chainId === 501) return PYUSD_CONSTANTS.SOLANA_ADDRESS; // Solana (for reference)
  return null;
};

/**
 * Get token by address and chain
 */
export const getTokenByAddress = (address: string, chainId: number): Token | null => {
  return (
    SUPPORTED_TOKENS.find(
      token => token.address.toLowerCase() === address.toLowerCase() && token.chains.includes(chainId),
    ) || null
  );
};

/**
 * Get all tokens supported on a specific chain
 */
export const getTokensForChain = (chainId: number): Token[] => {
  return SUPPORTED_TOKENS.filter(token => token.chains.includes(chainId));
};

/**
 * Check if a token supports PayPal bridge
 */
export const supportsPayPalBridge = (token: Token): boolean => {
  return token.paypalBridgeSupported === true;
};

/**
 * Get bridge options for a token
 */
export const getBridgeOptions = (token: Token): string[] => {
  return token.bridgeOptions;
};

/**
 * Format token amount with proper decimals
 */
export const formatTokenAmount = (amount: bigint, decimals: number): string => {
  const divisor = 10n ** BigInt(decimals);
  const wholePart = amount / divisor;
  const fractionalPart = amount % divisor;

  if (fractionalPart === 0n) {
    return wholePart.toString();
  }

  const fractionalStr = fractionalPart.toString().padStart(decimals, "0");
  const trimmedFractional = fractionalStr.replace(/0+$/, "");

  if (trimmedFractional === "") {
    return wholePart.toString();
  }

  return `${wholePart}.${trimmedFractional}`;
};

/**
 * Parse token amount from string to bigint
 */
export const parseTokenAmount = (amount: string, decimals: number): bigint => {
  const [wholePart, fractionalPart = ""] = amount.split(".");
  const paddedFractional = fractionalPart.padEnd(decimals, "0").slice(0, decimals);
  const wholeBigInt = BigInt(wholePart) * 10n ** BigInt(decimals);
  const fractionalBigInt = BigInt(paddedFractional);

  return wholeBigInt + fractionalBigInt;
};
