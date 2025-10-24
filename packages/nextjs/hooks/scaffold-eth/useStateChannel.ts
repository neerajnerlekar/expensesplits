/**
 * State Channel Hook
 * SE-2 compatible hook for state channel operations
 * Integrates with ClearNode and Yellow Network services
 */
import { useCallback, useEffect, useState } from "react";
import type { Address } from "viem";
import { useAccount, useChainId, useWalletClient } from "wagmi";
import { clearNodeService } from "~~/services/clearnode";
import { stateChannelClient } from "~~/services/stateChannelClient";
import { yellowNetworkService } from "~~/services/yellowNetwork";
import type {
  ChannelState,
  PaymentRequest,
  QuoteParams,
  SwapIntentRequest,
  YellowNetworkQuote,
  YellowNetworkSwapIntent,
} from "~~/types/nitrolite";
import { useERC7824MessageSigner, useViemMessageSigner } from "~~/utils/messageSigning";
import { notification } from "~~/utils/scaffold-eth";

export interface UseStateChannelReturn {
  // Connection status
  isConnected: boolean;
  isAuthenticated: boolean;
  chainId: number | undefined;

  // Channel state
  currentChannel: ChannelState | null;
  isChannelActive: boolean;

  // Actions
  connect: () => Promise<void>;
  disconnect: () => Promise<void>;
  createChannel: (
    participants: Address[],
    allocations: Array<{ participant: Address; asset: string; amount: string }>,
  ) => Promise<string>;
  sendPayment: (payment: PaymentRequest) => Promise<void>;
  closeChannel: () => Promise<void>;

  // Yellow Network
  getQuote: (params: QuoteParams) => Promise<YellowNetworkQuote>;
  submitSwapIntent: (request: SwapIntentRequest) => Promise<YellowNetworkSwapIntent>;
  getIntentStatus: (intentId: string) => Promise<any>;
  getSettlementDetails: (intentId: string) => Promise<any>;

  // Status
  isLoading: boolean;
  error: string | null;
  lastError: string | null;
}

export const useStateChannel = (): UseStateChannelReturn => {
  const { address } = useAccount();
  const { data: walletClient } = useWalletClient();
  const chainId = useChainId();
  const [isConnected, setIsConnected] = useState(false);
  const [isAuthenticated, setIsAuthenticated] = useState(false);
  const [currentChannel, setCurrentChannel] = useState<ChannelState | null>(null);
  const [isLoading, setIsLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [lastError, setLastError] = useState<string | null>(null);

  // Create message signer using Wagmi hook at the top level
  const messageSigner = useViemMessageSigner();

  // Try to get ERC-7824 compliant message signer for authentication
  const erc7824MessageSigner = useERC7824MessageSigner();

  // For ClearNode authentication, we need a basic message signer that the SDK can use
  // The SDK's createEIP712AuthMessageSigner will handle the EIP-712 signing internally
  // Use ERC-7824 signer if available (for raw signing), otherwise fall back to standard
  const finalMessageSigner = erc7824MessageSigner || messageSigner;

  // Set message signer on state channel client when available
  useEffect(() => {
    if (finalMessageSigner) {
      stateChannelClient.setMessageSigner(finalMessageSigner);
      // Clear any previous errors when message signer becomes available
      setError(null);
      setLastError(null);

      // Log which signer is being used
      if (finalMessageSigner === erc7824MessageSigner) {
        console.log("✅ Using ERC-7824 compliant message signer (SDK will handle EIP-712)");
      } else {
        console.log("⚠️ Using fallback EIP-191 message signer (SDK will handle EIP-712)");
      }
    }
  }, [finalMessageSigner, erc7824MessageSigner]);

  // Check connection status
  useEffect(() => {
    const checkStatus = () => {
      const clearNodeStatus = clearNodeService.getStatus();

      // Update states based on connection state
      setIsConnected(clearNodeStatus.isConnected);
      setIsAuthenticated(clearNodeStatus.isAuthenticated);

      const channel = stateChannelClient.getCurrentChannel();
      setCurrentChannel(channel);

      // Log connection state for debugging
      if (clearNodeStatus.connectionState) {
        console.log(
          `ClearNode state: ${clearNodeStatus.connectionState}, connected: ${clearNodeStatus.isConnected}, authenticated: ${clearNodeStatus.isAuthenticated}`,
        );
      }
    };

    checkStatus();
    const interval = setInterval(checkStatus, 2000); // Check every 2 seconds for better responsiveness

    return () => clearInterval(interval);
  }, []);

  // Connect to ClearNode
  const connect = useCallback(async () => {
    if (!address) {
      const errorMessage = "Wallet not connected";
      setError(errorMessage);
      setLastError(errorMessage);
      throw new Error(errorMessage);
    }

    if (!finalMessageSigner) {
      const errorMessage = "Message signer not available. Please wait for wallet to initialize.";
      setError(errorMessage);
      setLastError(errorMessage);
      throw new Error(errorMessage);
    }

    setIsLoading(true);
    setError(null);
    setLastError(null);

    try {
      // Connect to ClearNode
      await clearNodeService.connect();

      // Authenticate with ClearNode using SDK EIP-712 signer via walletClient
      await clearNodeService.authenticate(finalMessageSigner, address as `0x${string}`, walletClient);

      // Wait a moment for state to propagate
      await new Promise(resolve => setTimeout(resolve, 500));

      // Check final status
      const finalStatus = clearNodeService.getStatus();
      setIsConnected(finalStatus.isConnected);
      setIsAuthenticated(finalStatus.isAuthenticated);

      if (finalStatus.isAuthenticated) {
        notification.success("Connected and authenticated with ClearNode");
      } else {
        throw new Error("Failed to authenticate with ClearNode");
      }
    } catch (err) {
      const errorMessage = err instanceof Error ? err.message : "Failed to connect";
      setError(errorMessage);
      setLastError(errorMessage);
      notification.error(errorMessage);
      throw err;
    } finally {
      setIsLoading(false);
    }
  }, [address, finalMessageSigner, walletClient]);

  // Auto-retry connection when message signer becomes available
  useEffect(() => {
    if (messageSigner && walletClient && address && !isConnected && !isLoading) {
      // Small delay to ensure everything is properly initialized
      const timer = setTimeout(() => {
        connect().catch(console.error);
      }, 1000);
      return () => clearTimeout(timer);
    }
  }, [messageSigner, walletClient, address, isConnected, isLoading, connect]);

  // Auto-retry authentication if stuck in authenticating state
  useEffect(() => {
    if (isConnected && !isAuthenticated && messageSigner && walletClient && address) {
      const authTimeout = setTimeout(() => {
        console.log("🔄 Retrying authentication...");
        connect().catch(console.error);
      }, 15000); // 15 seconds

      return () => clearTimeout(authTimeout);
    }
  }, [isConnected, isAuthenticated, messageSigner, walletClient, address, connect]);

  // Disconnect from ClearNode
  const disconnect = useCallback(async () => {
    try {
      await clearNodeService.disconnect();
      setIsConnected(false);
      setIsAuthenticated(false);
      setCurrentChannel(null);
      notification.success("Disconnected from ClearNode");
    } catch (err) {
      const errorMessage = err instanceof Error ? err.message : "Failed to disconnect";
      setError(errorMessage);
      setLastError(errorMessage);
      notification.error(errorMessage);
    }
  }, []);

  // Create state channel
  const createChannel = useCallback(
    async (
      participants: Address[],
      allocations: Array<{ participant: Address; asset: string; amount: string }>,
    ): Promise<string> => {
      if (!isAuthenticated) {
        const errorMessage = "Not authenticated with ClearNode";
        setError(errorMessage);
        setLastError(errorMessage);
        throw new Error(errorMessage);
      }

      if (!address) {
        const errorMessage = "Wallet not connected";
        setError(errorMessage);
        setLastError(errorMessage);
        throw new Error(errorMessage);
      }

      setIsLoading(true);
      setError(null);
      setLastError(null);

      try {
        const channelId = await stateChannelClient.createChannel(
          participants,
          allocations.map(alloc => ({
            participant: alloc.participant as `0x${string}`,
            asset: alloc.asset,
            amount: alloc.amount,
          })),
        );

        setCurrentChannel(stateChannelClient.getCurrentChannel());
        notification.success("State channel created successfully");
        return channelId;
      } catch (err) {
        const errorMessage = err instanceof Error ? err.message : "Failed to create channel";
        setError(errorMessage);
        setLastError(errorMessage);
        notification.error(errorMessage);
        throw err;
      } finally {
        setIsLoading(false);
      }
    },
    [isAuthenticated, address],
  );

  // Send payment
  const sendPayment = useCallback(
    async (payment: PaymentRequest) => {
      if (!isAuthenticated) {
        throw new Error("Not authenticated with ClearNode");
      }

      setIsLoading(true);
      setError(null);

      try {
        await stateChannelClient.sendPayment(payment);
        setCurrentChannel(stateChannelClient.getCurrentChannel());
      } catch (err) {
        const errorMessage = err instanceof Error ? err.message : "Failed to send payment";
        setError(errorMessage);
        throw err;
      } finally {
        setIsLoading(false);
      }
    },
    [isAuthenticated],
  );

  // Close channel
  const closeChannel = useCallback(async () => {
    if (!isAuthenticated) {
      throw new Error("Not authenticated with ClearNode");
    }

    setIsLoading(true);
    setError(null);

    try {
      await stateChannelClient.closeChannel();
      setCurrentChannel(null);
    } catch (err) {
      const errorMessage = err instanceof Error ? err.message : "Failed to close channel";
      setError(errorMessage);
      throw err;
    } finally {
      setIsLoading(false);
    }
  }, [isAuthenticated]);

  // Get Yellow Network quote
  const getQuote = useCallback(
    async (params: QuoteParams): Promise<YellowNetworkQuote> => {
      if (!address) {
        const errorMessage = "Wallet not connected";
        setError(errorMessage);
        setLastError(errorMessage);
        throw new Error(errorMessage);
      }

      try {
        const quote = await yellowNetworkService.getQuote(params);
        notification.success("Quote received from Yellow Network");
        return quote;
      } catch (err) {
        const errorMessage = err instanceof Error ? err.message : "Failed to get quote";
        setError(errorMessage);
        setLastError(errorMessage);
        notification.error(errorMessage);
        throw err;
      }
    },
    [address],
  );

  // Submit swap intent
  const submitSwapIntent = useCallback(
    async (request: SwapIntentRequest): Promise<YellowNetworkSwapIntent> => {
      if (!address) {
        const errorMessage = "Wallet not connected";
        setError(errorMessage);
        setLastError(errorMessage);
        throw new Error(errorMessage);
      }

      try {
        const intent = await yellowNetworkService.submitSwapIntent(request);
        notification.success("Swap intent submitted to Yellow Network");
        return intent;
      } catch (err) {
        const errorMessage = err instanceof Error ? err.message : "Failed to submit swap intent";
        setError(errorMessage);
        setLastError(errorMessage);
        notification.error(errorMessage);
        throw err;
      }
    },
    [address],
  );

  // Get intent status
  const getIntentStatus = useCallback(async (intentId: string) => {
    try {
      return await yellowNetworkService.getIntentStatus(intentId);
    } catch (err) {
      const errorMessage = err instanceof Error ? err.message : "Failed to get intent status";
      setError(errorMessage);
      setLastError(errorMessage);
      throw err;
    }
  }, []);

  // Get settlement details
  const getSettlementDetails = useCallback(async (intentId: string) => {
    try {
      return await yellowNetworkService.getSettlementDetails(intentId);
    } catch (err) {
      const errorMessage = err instanceof Error ? err.message : "Failed to get settlement details";
      setError(errorMessage);
      setLastError(errorMessage);
      throw err;
    }
  }, []);

  return {
    isConnected,
    isAuthenticated,
    chainId,
    currentChannel,
    isChannelActive: stateChannelClient.isChannelActive(),
    connect,
    disconnect,
    createChannel,
    sendPayment,
    closeChannel,
    getQuote,
    submitSwapIntent,
    getIntentStatus,
    getSettlementDetails,
    isLoading,
    error,
    lastError,
  };
};
