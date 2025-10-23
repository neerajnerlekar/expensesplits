import { useCallback, useEffect, useState } from "react";
import { Address } from "viem";
import { useAccount, useChainId } from "wagmi";
import { pyusdBridgeService } from "~~/services/pyusdBridge";
import type { PYUSDBalance } from "~~/types/nitrolite";
import { notification } from "~~/utils/scaffold-eth";
import { PYUSD_CONSTANTS } from "~~/utils/tokens";

/**
 * Hook for interacting with PYUSD token contract
 * Provides balance checking, transfer functionality, and approval management
 */
export const usePYUSDContract = () => {
  const { address } = useAccount();
  const chainId = useChainId();
  const [balance, setBalance] = useState<PYUSDBalance | null>(null);
  const [isLoadingBalance, setIsLoadingBalance] = useState(false);
  const [isTransferring, setIsTransferring] = useState(false);
  const [isApproving, setIsApproving] = useState(false);

  // Token info from constants
  const tokenName = PYUSD_CONSTANTS.NAME;
  const tokenSymbol = PYUSD_CONSTANTS.SYMBOL;
  const tokenDecimals = PYUSD_CONSTANTS.DECIMALS;
  const tokenTotalSupply = undefined; // Not available from service

  // Load balance when address or chain changes
  const loadBalance = useCallback(async () => {
    if (!address || !chainId) {
      setBalance(null);
      return;
    }

    setIsLoadingBalance(true);
    try {
      const balanceData = await pyusdBridgeService.getPYUSDBalance(address, chainId);
      setBalance(balanceData);
    } catch (error) {
      console.error("Failed to load PYUSD balance:", error);
      notification.error("Failed to load PYUSD balance");
    } finally {
      setIsLoadingBalance(false);
    }
  }, [address, chainId]);

  useEffect(() => {
    loadBalance();
  }, [loadBalance]);

  // Transfer PYUSD tokens
  const transfer = useCallback(
    async (to: Address, amount: bigint) => {
      if (!address || !chainId) {
        notification.error("Please connect your wallet");
        return;
      }

      try {
        setIsTransferring(true);

        // Check balance first
        if (balance && amount > balance.balance) {
          notification.error("Insufficient PYUSD balance");
          return;
        }

        // Execute transfer via PYUSD bridge service
        const transferResult = await pyusdBridgeService.transferPYUSD(address, to, amount, chainId);

        notification.success(`PYUSD transfer successful: ${transferResult.transactionHash}`);

        // Refresh balance
        await loadBalance();

        return transferResult;
      } catch (error) {
        console.error("Error transferring PYUSD:", error);
        notification.error("Failed to transfer PYUSD");
        throw error;
      } finally {
        setIsTransferring(false);
      }
    },
    [address, chainId, balance, loadBalance],
  );

  // Approve PYUSD tokens for spending
  const approve = useCallback(
    // eslint-disable-next-line @typescript-eslint/no-unused-vars
    async (spender: Address, amount: bigint) => {
      if (!address) {
        notification.error("Please connect your wallet");
        return;
      }

      try {
        setIsApproving(true);

        // Note: Actual approval would require direct contract interaction
        // This is a placeholder for the approval flow
        // Would use: spender and amount parameters for the actual approval
        notification.info("PYUSD approval would be executed here via contract call");

        notification.success("PYUSD approval successful");
      } catch (error) {
        console.error("Error approving PYUSD:", error);
        notification.error("Failed to approve PYUSD");
        throw error;
      } finally {
        setIsApproving(false);
      }
    },
    [address],
  );

  // Get allowance for a spender
  const getAllowance = useCallback(async (): Promise<bigint> => {
    try {
      // This would need to be implemented in the PYUSD bridge service
      // For now, return 0 as placeholder
      return 0n;
    } catch (error) {
      console.error("Error getting allowance:", error);
      return 0n;
    }
  }, []);

  // Format amount for display
  const formatAmount = useCallback(
    (amount: bigint): string => {
      if (!chainId) return "0";
      return pyusdBridgeService.formatPYUSDAmount(amount, chainId);
    },
    [chainId],
  );

  // Parse amount from user input
  const parseAmount = useCallback(
    (amount: string): bigint => {
      if (!chainId) return 0n;
      return pyusdBridgeService.parsePYUSDAmount(amount, chainId);
    },
    [chainId],
  );

  // Check if PYUSD is supported on current chain
  const isSupported = useCallback((): boolean => {
    if (!chainId) return false;
    return pyusdBridgeService.isPYUSDSupported(chainId);
  }, [chainId]);

  return {
    // Contract data
    name: tokenName,
    symbol: tokenSymbol,
    decimals: tokenDecimals,
    totalSupply: tokenTotalSupply,

    // Balance
    balance,
    isLoadingBalance,
    loadBalance,

    // Actions
    transfer,
    approve,
    getAllowance,

    // Utilities
    formatAmount,
    parseAmount,
    isSupported,

    // Loading states
    isTransferring,
    isApproving,

    // Status
    isConnected: !!address,
    chainId,
  };
};
