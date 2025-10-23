/**
 * State Channel Hook
 * SE-2 compatible hook for state channel operations
 * Integrates with ClearNode and Yellow Network services
 */
import { useCallback, useEffect, useState } from "react";
import type { Address } from "viem";
import { useAccount, useChainId } from "wagmi";
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
import { useViemMessageSigner } from "~~/utils/messageSigning";
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
  const chainId = useChainId();
  const [isConnected, setIsConnected] = useState(false);
  const [isAuthenticated, setIsAuthenticated] = useState(false);
  const [currentChannel, setCurrentChannel] = useState<ChannelState | null>(null);
  const [isLoading, setIsLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [lastError, setLastError] = useState<string | null>(null);

  // Create message signer using Wagmi hook at the top level
  const messageSigner = useViemMessageSigner();

  // Set message signer on state channel client when available
  useEffect(() => {
    if (messageSigner) {
      stateChannelClient.setMessageSigner(messageSigner);
    }
  }, [messageSigner]);

  // Check connection status
  useEffect(() => {
    const checkStatus = () => {
      const clearNodeStatus = clearNodeService.getStatus();

      setIsConnected(clearNodeStatus.isConnected);
      setIsAuthenticated(clearNodeStatus.isAuthenticated);

      const channel = stateChannelClient.getCurrentChannel();
      setCurrentChannel(channel);
    };

    checkStatus();
    const interval = setInterval(checkStatus, 5000); // Check every 5 seconds

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

    setIsLoading(true);
    setError(null);
    setLastError(null);

    try {
      // Connect to ClearNode
      await clearNodeService.connect();

      // Use the message signer created at the top level

      // Authenticate with ClearNode
      await clearNodeService.authenticate(messageSigner, address as `0x${string}`);

      setIsConnected(true);
      setIsAuthenticated(true);

      notification.success("Connected to ClearNode");
    } catch (err) {
      const errorMessage = err instanceof Error ? err.message : "Failed to connect";
      setError(errorMessage);
      setLastError(errorMessage);
      notification.error(errorMessage);
      throw err;
    } finally {
      setIsLoading(false);
    }
  }, [address, messageSigner]);

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
