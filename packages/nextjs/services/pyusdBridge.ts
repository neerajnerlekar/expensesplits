/**
 * PYUSD Bridge Service
 * Handles PYUSD same-chain transfers and balance checking
 *
 * Focus: Same-chain PYUSD operations only
 * Cross-chain transfers should use Yellow Network
 */
// Import Viem types
import type { Address, Hex } from "viem";
// Import our custom types
import type { PYUSDBalance, PYUSDBridgeConfig, PYUSDBridgeServiceStatus, PYUSDTransfer } from "~~/types/nitrolite";
// Import error class
import { PYUSDBridgeError } from "~~/types/nitrolite";
// Import utilities
import { notification } from "~~/utils/scaffold-eth";
import { PYUSD_CONSTANTS } from "~~/utils/tokens";

export class PYUSDBridgeService {
  private config: PYUSDBridgeConfig;
  private status: PYUSDBridgeServiceStatus = {
    isConnected: false,
    isAuthenticated: false,
    supportedChains: [1, 42161, 10, 8453, 137], // Ethereum, Arbitrum, Optimism, Base, Polygon
    bridgeAvailable: false,
    lastError: undefined,
    lastUpdate: Date.now(),
  };

  constructor(config: Partial<PYUSDBridgeConfig> = {}) {
    this.config = {
      ethereumAddress: PYUSD_CONSTANTS.ETHEREUM_ADDRESS,
      decimals: PYUSD_CONSTANTS.DECIMALS,
      symbol: PYUSD_CONSTANTS.SYMBOL,
      name: PYUSD_CONSTANTS.NAME,
      ...config,
    };
  }

  /**
   * Check if PYUSD is supported on the given chain
   */
  isPYUSDSupported(chainId: number): boolean {
    return this.status.supportedChains.includes(chainId);
  }

  /**
   * Validate same-chain transfer
   */
  validateSameChainTransfer(fromChainId: number, toChainId: number): void {
    if (fromChainId !== toChainId) {
      throw new PYUSDBridgeError(
        `Cross-chain PYUSD transfers not supported. Use Yellow Network for cross-chain transfers.`,
        undefined,
        fromChainId,
      );
    }

    if (!this.isPYUSDSupported(fromChainId)) {
      throw new PYUSDBridgeError(`PYUSD not supported on chain ${fromChainId}`, undefined, fromChainId);
    }
  }

  /**
   * Get PYUSD balance for user on specific chain
   * TODO: Integrate with actual PYUSD contract calls
   */
  async getPYUSDBalance(address: Address, chainId: number): Promise<PYUSDBalance> {
    try {
      this.validateSameChainTransfer(chainId, chainId);

      // TODO: Replace with actual contract call
      // const balance = await this.callPYUSDContract(chainId, 'balanceOf', [address]);

      // Mock implementation for development
      const balance = 0n; // Placeholder

      this.status.lastUpdate = Date.now();
      return {
        address,
        balance,
        chainId,
        lastUpdated: Date.now(),
      };
    } catch (error) {
      this.status.lastError = `Failed to get PYUSD balance: ${error}`;
      this.status.lastUpdate = Date.now();
      throw new PYUSDBridgeError(`Failed to get PYUSD balance: ${error}`, undefined, chainId);
    }
  }

  /**
   * Transfer PYUSD on same chain
   * TODO: Integrate with actual PYUSD contract calls
   */
  async transferPYUSD(from: Address, to: Address, amount: bigint, chainId: number): Promise<PYUSDTransfer> {
    try {
      this.validateSameChainTransfer(chainId, chainId);

      // TODO: Replace with actual contract call
      // const txHash = await this.callPYUSDContract(chainId, 'transfer', [to, amount]);

      // Mock implementation for development
      const txHash = `0x${Math.random().toString(16).substring(2, 66)}` as Hex;

      const transfer: PYUSDTransfer = {
        from,
        to,
        amount,
        chainId,
        transactionHash: txHash,
        status: "pending",
      };

      this.status.lastUpdate = Date.now();
      notification.success(`PYUSD transfer initiated: ${this.formatPYUSDAmount(amount, chainId)}`);

      return transfer;
    } catch (error) {
      this.status.lastError = `Failed to transfer PYUSD: ${error}`;
      this.status.lastUpdate = Date.now();
      throw new PYUSDBridgeError(`Failed to transfer PYUSD: ${error}`, undefined, chainId);
    }
  }

  /**
   * Get PYUSD token info for display
   */
  getPYUSDInfo(chainId: number): PYUSDBridgeConfig {
    if (!this.isPYUSDSupported(chainId)) {
      throw new PYUSDBridgeError(`PYUSD not supported on chain ${chainId}`, undefined, chainId);
    }

    return {
      ethereumAddress: this.config.ethereumAddress,
      decimals: this.config.decimals,
      symbol: this.config.symbol,
      name: this.config.name,
    };
  }

  /**
   * Get service status
   */
  getStatus(): PYUSDBridgeServiceStatus {
    return { ...this.status };
  }

  /**
   * Check if bridge is available (always false for same-chain only)
   */
  isBridgeAvailable(): boolean {
    return false; // No cross-chain bridge available
  }

  /**
   * Format PYUSD amount for display
   */
  formatPYUSDAmount(amount: bigint, chainId: number): string {
    const info = this.getPYUSDInfo(chainId);
    const divisor = 10n ** BigInt(info.decimals);
    const wholePart = amount / divisor;
    const fractionalPart = amount % divisor;

    if (fractionalPart === 0n) {
      return `${wholePart} ${info.symbol}`;
    }

    const fractionalStr = fractionalPart.toString().padStart(info.decimals, "0");
    const trimmedFractional = fractionalStr.replace(/0+$/, "");

    if (trimmedFractional === "") {
      return `${wholePart} ${info.symbol}`;
    }

    return `${wholePart}.${trimmedFractional} ${info.symbol}`;
  }

  /**
   * Parse PYUSD amount from user input
   */
  parsePYUSDAmount(amount: string, chainId: number): bigint {
    const info = this.getPYUSDInfo(chainId);
    const [wholePart, fractionalPart = ""] = amount.split(".");
    const paddedFractional = fractionalPart.padEnd(info.decimals, "0").slice(0, info.decimals);
    const wholeBigInt = BigInt(wholePart) * 10n ** BigInt(info.decimals);
    const fractionalBigInt = BigInt(paddedFractional);

    return wholeBigInt + fractionalBigInt;
  }
}

// Export singleton instance
export const pyusdBridgeService = new PYUSDBridgeService();

// Re-export PYUSDBalance type for external use
export type { PYUSDBalance } from "~~/types/nitrolite";
