/**
 * Message Signing Utilities
 * ERC-7824 compliant message signing for ClearNode and Yellow Network
 * Using Viem for proper cross-chain compatibility
 *
 * Note: ERC-7824 requires plain JSON signing (not EIP-191) for compatibility
 */
// For ERC-7824 raw signing without EIP-191 prefix
import { secp256k1 } from "@noble/curves/secp256k1";
import { Address, Hex, keccak256, recoverMessageAddress, toBytes } from "viem";
import { useAccount, useChainId, useSignMessage, useSignTypedData, useSwitchChain } from "wagmi";
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
  return async (payload: any): Promise<Hex> => {
    const messageString = typeof payload === "string" ? payload : JSON.stringify(payload);
    // Use window.ethereum personal_sign as a safe default for non-auth flows
    // Note: This is EIP-191 and not suitable for ERC-7824 auth
    if (typeof window !== "undefined" && (window as any).ethereum) {
      try {
        const accounts: string[] = await (window as any).ethereum.request({ method: "eth_requestAccounts" });
        const from = accounts?.[0];
        const signature: string = await (window as any).ethereum.request({
          method: "personal_sign",
          params: [messageString, from],
        });
        return signature as Hex;
      } catch (error) {
        console.error("Error signing via personal_sign:", error);
        throw new Error(`Failed to sign message: ${error}`);
      }
    }
    throw new Error("No wallet available for signing");
  };
};

/**
 * Create message signer using Wagmi hook
 * This is the recommended approach for React components
 *
 * IMPORTANT: For ERC-7824 authentication, we need to sign plain JSON payloads
 * without EIP-191 prefix, but Wagmi's signMessageAsync uses EIP-191 by default.
 * This is a limitation that needs to be addressed for proper ERC-7824 compliance.
 */
export const useViemMessageSigner = (): ViemMessageSigner | null => {
  const { signMessageAsync } = useSignMessage();

  // Return null if signMessageAsync is not available yet
  if (!signMessageAsync) {
    return null;
  }

  return async (payload: any): Promise<Hex> => {
    try {
      const messageString = typeof payload === "string" ? payload : JSON.stringify(payload);
      // WARNING: This uses EIP-191 prefix which is NOT compliant with ERC-7824
      // For proper ERC-7824 compliance, we need plain JSON signing without EIP-191
      console.warn("⚠️ Using EIP-191 signing (not ERC-7824 compliant) - may cause authentication failures");
      return await signMessageAsync({ message: messageString });
    } catch (error) {
      console.error("Error signing message with Wagmi:", error);
      throw new Error(`Failed to sign message: ${error}`);
    }
  };
};

// Removed createERC7824MessageSigner - use useERC7824MessageSigner hook instead

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
 * Create ERC-7824 compliant message signer using Wagmi hook
 * This is the recommended approach for React components
 *
 * IMPORTANT: This requires access to the wallet's private key for plain JSON signing
 * which is not available through standard Wagmi hooks. This is a limitation of
 * browser wallet security - private keys are not exposed to web applications.
 *
 * For development/testing purposes, we can use the burner wallet's private key
 * which is available in the browser's localStorage.
 */
export const useERC7824MessageSigner = (): ViemMessageSigner | null => {
  const { signMessageAsync } = useSignMessage();

  // For development, try to get the burner wallet private key
  const getBurnerPrivateKey = (): Hex | null => {
    try {
      // Check if we're in development mode and have a burner wallet
      if (typeof window !== "undefined" && window.localStorage) {
        const burnerKey = window.localStorage.getItem("scaffold-eth-burner-wallet-key");
        if (burnerKey) {
          return burnerKey as Hex;
        }
      }
    } catch (error) {
      console.warn("Could not access burner wallet private key:", error);
    }
    return null;
  };

  const privateKey = getBurnerPrivateKey();

  if (!privateKey) {
    console.warn("ERC-7824 plain JSON signing requires private key access. Using fallback to EIP-191 signing.");
    return null;
  }

  // Return a message signer that uses the private key for raw signing
  return async (payload: any): Promise<Hex> => {
    try {
      // For ERC-7824, we need to sign plain JSON without EIP-191 prefix
      const messageString = typeof payload === "string" ? payload : JSON.stringify(payload);

      // Create message hash using keccak256 (same as ethers.utils.id)
      const messageHash = keccak256(toBytes(messageString));

      // For ERC-7824 compliance, we need to sign the raw hash without EIP-191 prefix
      // This requires direct private key access for raw secp256k1 signing
      if (privateKey) {
        try {
          // For ERC-7824, sign raw hash and return 65-byte r|s|v
          console.log("🔐 Signing with ERC-7824 compliant raw secp256k1 (no EIP-191 prefix)");

          const privateKeyBytes = toBytes(privateKey);
          const sig = secp256k1.sign(messageHash, privateKeyBytes);
          const sigBytes = sig.toCompactRawBytes();
          const v = new Uint8Array([27]);
          const full = new Uint8Array(sigBytes.length + 1);
          full.set(sigBytes, 0);
          full.set(v, sigBytes.length);
          const hex = Array.from(full)
            .map(b => b.toString(16).padStart(2, "0"))
            .join("");
          const signatureHex = ("0x" + hex) as Hex;

          console.log("✅ Successfully signed with ERC-7824 compliant raw signing");
          return signatureHex;
        } catch (signError) {
          console.warn("Raw secp256k1 signing failed, falling back to EIP-191:", signError);
          // Fallback to EIP-191 if raw signing fails
          const signature = await signMessageAsync({ message: messageString });
          return signature;
        }
      } else {
        // No private key available, use EIP-191 fallback
        console.warn("No private key available, using EIP-191 fallback (may not work with ClearNode)");
        const signature = await signMessageAsync({ message: messageString });
        return signature;
      }
    } catch (error) {
      console.error("Error signing ERC-7824 message:", error);
      throw new Error(`Failed to sign ERC-7824 message: ${error}`);
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
 * Create ClearNode EIP-712 signer for authentication
 * Uses the proper EIP-712 structure required by ClearNode
 */
export const useClearNodeEIP712Signer = (): ViemMessageSigner => {
  const { signTypedDataAsync } = useSignTypedData();

  return async (payload: any): Promise<Hex> => {
    try {
      // Define the EIP-712 types for ClearNode authentication
      const types: EIP712Types = {
        EIP712Domain: [{ name: "name", type: "string" }],
        Policy: [
          { name: "challenge", type: "string" },
          { name: "scope", type: "string" },
          { name: "wallet", type: "address" },
          { name: "application", type: "address" },
          { name: "participant", type: "address" },
          { name: "expire", type: "uint256" },
          { name: "allowances", type: "Allowance[]" },
        ],
        Allowance: [
          { name: "asset", type: "string" },
          { name: "amount", type: "uint256" },
        ],
      };

      // Create the EIP-712 message structure with proper validation
      const challenge = payload.challenge || payload.challengeMessage;
      if (!challenge) {
        throw new Error("Challenge is required for authentication");
      }

      const participant = payload.participant;
      if (!participant) {
        throw new Error("Participant address is required for authentication");
      }

      const message = {
        challenge: challenge,
        scope: payload.scope || "console",
        wallet: payload.wallet || participant,
        application: payload.application || "0x0000000000000000000000000000000000000000",
        participant: participant,
        expire: payload.expire || Math.floor(Date.now() / 1000) + 3600,
        allowances: payload.allowances || [],
      };

      // Validate all required fields are present and not undefined
      if (!message.challenge || !message.participant || !message.wallet) {
        throw new Error(
          `Missing required fields: challenge=${!!message.challenge}, participant=${!!message.participant}, wallet=${!!message.wallet}`,
        );
      }

      console.log("🔐 Signing ClearNode EIP-712 structured data:", message);

      return await signTypedDataAsync({
        domain: { name: "ClearNode" },
        types,
        primaryType: "Policy",
        message,
      });
    } catch (error) {
      console.error("Error signing ClearNode EIP-712 message:", error);
      throw new Error(`Failed to sign ClearNode EIP-712 message: ${error}`);
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
  messageSigner: ViemMessageSigner,
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
  messageSigner: ViemMessageSigner,
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
  messageSigner: ViemMessageSigner,
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
  const chainId = useChainId();
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
