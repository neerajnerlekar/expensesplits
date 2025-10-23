/**
 * State Channel Client
 * ERC-7824 compliant state channel management using Nitrolite SDK
 * Handles off-chain operations and on-chain settlements
 */
// Import Nitrolite SDK functions
// Import services
import { clearNodeService } from "./clearnode";
import { type RPCAppDefinition, type RPCAppSessionAllocation } from "@erc7824/nitrolite";
// Import Viem types
import type { Address } from "viem";
// Import our custom types
import type { ChannelState, PaymentRequest, ViemMessageSigner } from "~~/types/nitrolite";
// Import utilities
import { notification } from "~~/utils/scaffold-eth";

// Local interfaces for state channel operations
export interface StateChannelConfig {
  protocol: string;
  quorum: number;
  challengePeriod: number;
}

export interface StateChannelSession {
  sessionId: string;
  channelId: string;
  participants: Address[];
  allocations: RPCAppSessionAllocation[];
  isActive: boolean;
  createdAt: number;
}

export class StateChannelClient {
  private clearNode = clearNodeService;
  private currentChannel: ChannelState | null = null;
  private currentSession: StateChannelSession | null = null;
  private messageHandlers: Map<string, (data: any) => void> = new Map();
  private messageSigner: ViemMessageSigner | null = null;

  constructor() {
    this.setupMessageHandlers();
  }

  /**
   * Set message signer for SDK operations
   */
  setMessageSigner(signer: ViemMessageSigner): void {
    this.messageSigner = signer;
  }

  /**
   * Create a new state channel using Nitrolite SDK
   */
  async createChannel(
    participants: Address[],
    initialAllocations: RPCAppSessionAllocation[],
    config: StateChannelConfig = {
      protocol: "payment-app-v1",
      quorum: 100,
      challengePeriod: 0,
    },
  ): Promise<string> {
    if (!this.messageSigner) {
      throw new Error("Message signer not set");
    }

    try {
      // Create app definition using SDK structure
      const appDefinition: RPCAppDefinition = {
        protocol: config.protocol,
        participants: participants as `0x${string}`[],
        weights: new Array(participants.length).fill(100 / participants.length),
        quorum: config.quorum,
        challenge: config.challengePeriod,
        nonce: Date.now(),
      } as RPCAppDefinition;

      // Create session using SDK structure
      const session = {
        definition: appDefinition,
        allocations: initialAllocations,
      };

      // Send to ClearNode (SDK handles message creation internally)
      await this.clearNode.createAppSession(session);

      const channelId = this.generateChannelId(participants);
      const sessionId = this.generateSessionId();

      // Create local session tracking
      this.currentSession = {
        sessionId,
        channelId,
        participants,
        allocations: initialAllocations,
        isActive: true,
        createdAt: Date.now(),
      };

      // Create local channel state
      this.currentChannel = {
        channelId,
        participants: participants.map((addr, index) => ({
          address: addr,
          balance: BigInt(initialAllocations[index]?.amount || "0"),
          weight: 100 / participants.length,
        })),
        nonce: 0,
        stateHash: "",
        isOpen: true,
        totalDeposit: initialAllocations.reduce((sum, alloc) => sum + BigInt(alloc.amount), 0n),
        chainId: 1, // Default to Ethereum mainnet
      };

      notification.success("State channel created successfully!");
      return channelId;
    } catch (error) {
      console.error("Error creating channel:", error);
      notification.error("Failed to create state channel");
      throw error;
    }
  }

  /**
   * Send payment through state channel
   */
  async sendPayment(payment: PaymentRequest): Promise<void> {
    if (!this.currentChannel) {
      throw new Error("No active channel");
    }

    try {
      // Convert amount to string for ClearNode
      const amountStr = payment.amount.toString();

      await this.clearNode.sendPayment(amountStr, payment.recipient, payment.token);

      // Update local state
      this.updateLocalState(payment);

      notification.success(`Payment of ${amountStr} sent to ${payment.recipient}`);
    } catch (error) {
      console.error("Error sending payment:", error);
      notification.error("Failed to send payment");
      throw error;
    }
  }

  /**
   * Update channel state using Nitrolite SDK
   */
  async updateChannelState(newBalances: bigint[]): Promise<void> {
    if (!this.currentChannel || !this.messageSigner) {
      throw new Error("No active channel or message signer not set");
    }

    try {
      // Create state update using SDK structure
      const stateUpdate = {
        channelId: this.currentChannel.channelId,
        stateHash: this.generateStateHash(newBalances),
        nonce: this.currentChannel.nonce + 1,
        balances: newBalances.map(b => Number(b)),
        timestamp: Date.now(),
      };

      // Send to ClearNode (no SDK helper for state updates yet)
      await this.clearNode.sendStateUpdate(stateUpdate);

      // Update local state
      this.currentChannel.nonce++;
      this.currentChannel.stateHash = stateUpdate.stateHash;
      this.currentChannel.participants = this.currentChannel.participants.map((p, i) => ({
        ...p,
        balance: newBalances[i] || p.balance,
      }));

      notification.success("Channel state updated successfully");
    } catch (error) {
      console.error("Error updating channel state:", error);
      notification.error("Failed to update channel state");
      throw error;
    }
  }

  /**
   * Close channel using Nitrolite SDK
   */
  async closeChannel(): Promise<void> {
    if (!this.currentChannel || !this.currentSession || !this.messageSigner) {
      throw new Error("No active channel or session");
    }

    try {
      // Send to ClearNode (SDK handles message creation internally)
      await this.clearNode.closeAppSession(this.currentSession.sessionId);

      // Update local state
      this.currentChannel.isOpen = false;
      this.currentSession.isActive = false;

      notification.success("Channel closed successfully");
    } catch (error) {
      console.error("Error closing channel:", error);
      notification.error("Failed to close channel");
      throw error;
    }
  }

  /**
   * Get current channel state
   */
  getCurrentChannel(): ChannelState | null {
    return this.currentChannel;
  }

  /**
   * Get participant balance
   */
  getParticipantBalance(address: Address): bigint {
    if (!this.currentChannel) return 0n;

    const participant = this.currentChannel.participants.find(p => p.address === address);
    return participant?.balance || 0n;
  }

  /**
   * Check if channel is active
   */
  isChannelActive(): boolean {
    return this.currentChannel?.isOpen || false;
  }

  /**
   * Setup message handlers for ClearNode
   */
  private setupMessageHandlers(): void {
    this.messageHandlers.set("payment", data => {
      console.log("Payment received:", data);
      // Update local state when payment is received
      this.handleIncomingPayment(data);
    });

    this.messageHandlers.set("state_update", data => {
      console.log("State update received:", data);
      // Update local state when state is updated
      this.handleStateUpdate(data);
    });
  }

  /**
   * Handle incoming payment
   */
  private handleIncomingPayment(paymentData: any): void {
    if (!this.currentChannel) return;

    const { amount, sender, recipient } = paymentData;

    // Update balances
    this.currentChannel.participants = this.currentChannel.participants.map(p => {
      if (p.address === recipient) {
        return { ...p, balance: p.balance + BigInt(amount) };
      }
      if (p.address === sender) {
        return { ...p, balance: p.balance - BigInt(amount) };
      }
      return p;
    });

    notification.success(`Received payment of ${amount} from ${sender}`);
  }

  /**
   * Handle state update
   */
  private handleStateUpdate(stateData: any): void {
    if (!this.currentChannel) return;

    const { balances, nonce } = stateData;

    // Update channel state
    this.currentChannel.nonce = nonce;
    this.currentChannel.participants = this.currentChannel.participants.map((p, i) => ({
      ...p,
      balance: BigInt(balances[i] || 0),
    }));

    console.log("Channel state updated:", this.currentChannel);
  }

  /**
   * Update local state after payment
   */
  private updateLocalState(payment: PaymentRequest): void {
    if (!this.currentChannel) return;

    // Find sender (current user) and recipient
    const senderIndex = this.currentChannel.participants.findIndex(
      p => p.address === payment.recipient, // This should be the current user's address
    );
    const recipientIndex = this.currentChannel.participants.findIndex(p => p.address === payment.recipient);

    if (senderIndex !== -1 && recipientIndex !== -1) {
      this.currentChannel.participants[senderIndex].balance -= payment.amount;
      this.currentChannel.participants[recipientIndex].balance += payment.amount;
    }
  }

  /**
   * Generate channel ID
   */
  private generateChannelId(participants: Address[]): string {
    const timestamp = Date.now();
    const participantsStr = participants.sort().join("");
    const data = participantsStr + timestamp;
    // Convert string to hex using web-safe approach
    const hex = Array.from(data)
      .map(c => c.charCodeAt(0).toString(16).padStart(2, "0"))
      .join("");
    return `0x${hex}`;
  }

  /**
   * Generate session ID
   */
  private generateSessionId(): string {
    const timestamp = Date.now();
    const random = Math.random().toString(36).substring(2);
    return `session_${timestamp}_${random}`;
  }

  /**
   * Generate state hash
   */
  private generateStateHash(balances: bigint[]): string {
    const balancesStr = balances.map(b => b.toString()).join(",");
    const data = balancesStr + Date.now();
    // Convert string to hex using web-safe approach
    const hex = Array.from(data)
      .map(c => c.charCodeAt(0).toString(16).padStart(2, "0"))
      .join("");
    return `0x${hex}`;
  }

  /**
   * Get current session
   */
  getCurrentSession(): StateChannelSession | null {
    return this.currentSession;
  }

  /**
   * Disconnect from state channel
   */
  disconnect(): void {
    this.currentChannel = null;
    this.clearNode.disconnect();
  }
}

// Export singleton instance
export const stateChannelClient = new StateChannelClient();
