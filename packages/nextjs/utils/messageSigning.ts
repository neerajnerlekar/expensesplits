/**
 * Message Signing Utilities
 * ERC-7824 compliant message signing for ClearNode and Yellow Network
 * Using Viem for proper cross-chain compatibility
 *
 * Note: ERC-7824 requires plain JSON signing (not EIP-191) for compatibility
 */
import { Address, Hex, recoverMessageAddress } from "viem";
import { useAccount, useSignMessage, useSignTypedData, useSwitchChain } from "wagmi";
import type { EIP712Domain, EIP712Types, ViemMessageSigner } from "~~/types/nitrolite";

/**
 * Create message signer for ERC-7824 compliance using Viem
 * Signs plain JSON payloads (not EIP-191) for cross-chain compatibility
 *
 * Implementation follows erc7824.txt lines 533-554:
 * - Use raw message signing without EIP-191 prefix
 * - Compatible with non-EVM chains
 */
export const createViemMessageSigner = (): ViemMessageSigner => {
  // eslint-disable-next-line @typescript-eslint/no-unused-vars
  return async (payload: any): Promise<Hex> => {
    try {
      // For now, we'll use a mock implementation since we need a viem client
      // In a real implementation, this would use the connected wallet
      throw new Error(
        "createViemMessageSigner requires a viem client. Use useViemMessageSigner() in React components instead.",
      );
    } catch (error) {
      console.error("Error signing message with Viem:", error);
      throw new Error(`Failed to sign message: ${error}`);
    }
  };
};

/**
 * Create message signer using Wagmi hook
 * This is the recommended approach for React components
 */
export const useViemMessageSigner = (): ViemMessageSigner => {
  const { signMessageAsync } = useSignMessage();

  return async (payload: any): Promise<Hex> => {
    try {
      const messageString = typeof payload === "string" ? payload : JSON.stringify(payload);
      return await signMessageAsync({ message: messageString });
    } catch (error) {
      console.error("Error signing message with Wagmi:", error);
      throw new Error(`Failed to sign message: ${error}`);
    }
  };
};

/**
 * Create EIP-712 message signer for structured data using Viem
 * Used for authentication with ClearNode
 */
// eslint-disable-next-line @typescript-eslint/no-unused-vars
export const createViemEIP712Signer = (domain: EIP712Domain): ViemMessageSigner => {
  // eslint-disable-next-line @typescript-eslint/no-unused-vars
  return async (payload: any): Promise<Hex> => {
    try {
      // For now, we'll use a mock implementation since we need a viem client
      // In a real implementation, this would use the connected wallet
      throw new Error(
        "createViemEIP712Signer requires a viem client. Use useViemEIP712Signer() in React components instead.",
      );
    } catch (error) {
      console.error("Error signing EIP-712 message with Viem:", error);
      throw new Error(`Failed to sign EIP-712 message: ${error}`);
    }
  };
};

/**
 * Create EIP-712 signer using Wagmi hook
 * Recommended for React components
 */
export const useViemEIP712Signer = (domain: EIP712Domain): ViemMessageSigner => {
  const { signTypedDataAsync } = useSignTypedData();

  return async (payload: any): Promise<Hex> => {
    try {
      const types: EIP712Types = {
        EIP712Domain: [
          { name: "name", type: "string" },
          { name: "version", type: "string" },
          { name: "chainId", type: "uint256" },
          { name: "verifyingContract", type: "address" },
        ],
        AuthChallenge: [
          { name: "challenge", type: "string" },
          { name: "participant", type: "address" },
          { name: "timestamp", type: "uint256" },
        ],
      };

      return await signTypedDataAsync({
        domain,
        types,
        primaryType: "AuthChallenge",
        message: payload,
      });
    } catch (error) {
      console.error("Error signing EIP-712 message with Wagmi:", error);
      throw new Error(`Failed to sign EIP-712 message: ${error}`);
    }
  };
};

/**
 * Verify message signature using Viem
 */
export const verifyMessageSignature = async (
  message: string,
  signature: Hex,
  expectedSigner: Address,
): Promise<boolean> => {
  try {
    // Use Viem's recoverMessageAddress to verify signature
    const recoveredAddress = await recoverMessageAddress({
      message,
      signature,
    });

    return recoveredAddress.toLowerCase() === expectedSigner.toLowerCase();
  } catch (error) {
    console.error("Error verifying signature with Viem:", error);
    return false;
  }
};

/**
 * Create authentication domain for ClearNode
 */
export const createClearNodeDomain = (chainId: number): EIP712Domain => {
  return {
    name: "ClearNode",
    version: "1",
    chainId,
    verifyingContract: "0x0000000000000000000000000000000000000000" as Address,
  };
};

/**
 * Create state channel domain
 */
export const createStateChannelDomain = (chainId: number, contractAddress: Address): EIP712Domain => {
  return {
    name: "BatchPayChannel",
    version: "1",
    chainId,
    verifyingContract: contractAddress,
  };
};

/**
 * Sign state update message
 */
export const signStateUpdate = async (
  messageSigner: MessageSigner,
  channelId: string,
  stateHash: string,
  nonce: number,
  balances: bigint[],
): Promise<Hex> => {
  const stateUpdate = {
    channelId,
    stateHash,
    nonce,
    balances: balances.map(b => b.toString()),
    timestamp: Date.now(),
  };

  return await messageSigner(stateUpdate);
};

/**
 * Sign payment message
 */
export const signPayment = async (
  messageSigner: MessageSigner,
  amount: string,
  recipient: Address,
  token: string = "usdc",
): Promise<Hex> => {
  const payment = {
    type: "payment",
    amount,
    recipient,
    token,
    timestamp: Date.now(),
  };

  return await messageSigner(payment);
};

/**
 * Sign session creation message
 */
export const signSessionCreation = async (
  messageSigner: MessageSigner,
  protocol: string,
  participants: Address[],
  allocations: Array<{ participant: Address; asset: string; amount: string }>,
): Promise<Hex> => {
  const session = {
    type: "session_create",
    protocol,
    participants,
    allocations,
    timestamp: Date.now(),
  };

  return await messageSigner(session);
};

/**
 * Get current user address using Wagmi
 * This is the recommended approach for React components
 */
export const useCurrentUserAddress = (): Address | undefined => {
  const { address } = useAccount();
  return address;
};

/**
 * Get current chain ID using Wagmi
 * This is the recommended approach for React components
 */
export const useCurrentChainId = (): number | undefined => {
  const { chainId } = useAccount();
  return chainId;
};

/**
 * Switch to specific chain using Wagmi
 * This is the recommended approach for React components
 */
export const useSwitchChainHook = () => {
  const { switchChain } = useSwitchChain();
  return switchChain;
};

/**
 * Legacy functions for non-React contexts
 * These should be avoided in favor of Wagmi hooks
 */

/**
 * Check if wallet is available
 */
export const isWalletAvailable = (): boolean => {
  return typeof window !== "undefined" && !!window.ethereum;
};

/**
 * Get current user address from window.ethereum (legacy)
 * @deprecated Use useCurrentUserAddress() instead
 */
export const getCurrentUserAddress = async (): Promise<Address> => {
  if (!window.ethereum) {
    throw new Error("Wallet not installed");
  }

  try {
    const accounts = await window.ethereum.request({
      method: "eth_requestAccounts",
    });

    if (accounts.length === 0) {
      throw new Error("No accounts found");
    }

    return accounts[0] as Address;
  } catch (error) {
    console.error("Error getting user address:", error);
    throw new Error("Failed to get user address");
  }
};

/**
 * Get current chain ID from window.ethereum (legacy)
 * @deprecated Use useCurrentChainId() instead
 */
export const getCurrentChainId = async (): Promise<number> => {
  if (!window.ethereum) {
    throw new Error("Wallet not installed");
  }

  try {
    const chainId = await window.ethereum.request({
      method: "eth_chainId",
    });

    return parseInt(chainId, 16);
  } catch (error) {
    console.error("Error getting chain ID:", error);
    throw new Error("Failed to get chain ID");
  }
};

/**
 * Switch to specific chain using window.ethereum (legacy)
 * @deprecated Use useSwitchChain() instead
 */
export const switchToChain = async (chainId: number): Promise<void> => {
  if (!window.ethereum) {
    throw new Error("Wallet not installed");
  }

  try {
    await window.ethereum.request({
      method: "wallet_switchEthereumChain",
      params: [{ chainId: `0x${chainId.toString(16)}` }],
    });
  } catch (error: any) {
    // If chain is not added, try to add it
    if (error.code === 4902) {
      await addChain(chainId);
    } else {
      throw error;
    }
  }
};

/**
 * Add new chain to wallet (legacy)
 * @deprecated Use useSwitchChain() instead
 */
export const addChain = async (chainId: number): Promise<void> => {
  if (!window.ethereum) {
    throw new Error("Wallet not installed");
  }

  const chainConfigs: Record<number, any> = {
    1: {
      chainName: "Ethereum Mainnet",
      rpcUrls: ["https://mainnet.infura.io/v3/"],
      nativeCurrency: { name: "Ether", symbol: "ETH", decimals: 18 },
    },
    42161: {
      chainName: "Arbitrum One",
      rpcUrls: ["https://arb1.arbitrum.io/rpc"],
      nativeCurrency: { name: "Ether", symbol: "ETH", decimals: 18 },
    },
    10: {
      chainName: "Optimism",
      rpcUrls: ["https://mainnet.optimism.io"],
      nativeCurrency: { name: "Ether", symbol: "ETH", decimals: 18 },
    },
    8453: {
      chainName: "Base",
      rpcUrls: ["https://mainnet.base.org"],
      nativeCurrency: { name: "Ether", symbol: "ETH", decimals: 18 },
    },
  };

  const config = chainConfigs[chainId];
  if (!config) {
    throw new Error(`Chain ${chainId} not supported`);
  }

  await window.ethereum.request({
    method: "wallet_addEthereumChain",
    params: [
      {
        chainId: `0x${chainId.toString(16)}`,
        ...config,
      },
    ],
  });
};
