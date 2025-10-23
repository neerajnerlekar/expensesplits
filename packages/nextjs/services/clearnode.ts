/**
 * ClearNode Service
 * ERC-7824 compliant WebSocket connection to Yellow Network ClearNode
 * Using Nitrolite SDK for proper protocol compliance
 *
 * Reference: https://github.com/erc7824/clearnode
 * Endpoint: wss://clearnet.yellow.com/ws
 */
// Import Nitrolite SDK functions
import {
  type RPCAppDefinition,
  type RPCAppSessionAllocation,
  createAppSessionMessage,
  createAuthRequestMessage,
  createAuthVerifyMessage,
  createCloseAppSessionMessage,
  createGetChannelsMessage,
  createGetLedgerBalancesMessage,
} from "@erc7824/nitrolite";
// Import Viem types
import type { Address } from "viem";
// Import our custom types
import type { ClearNodeConfig, ClearNodeConnection, ClearNodeMessage, ViemMessageSigner } from "~~/types/nitrolite";
// Import error class
import { ClearNodeError } from "~~/types/nitrolite";
// Import Viem message signing utilities
import { createClearNodeDomain, createViemEIP712Signer } from "~~/utils/messageSigning";

export class ClearNodeService {
  private ws: WebSocket | null = null;
  private messageSigner: ViemMessageSigner | null = null;
  private eip712Signer: ViemMessageSigner | null = null;
  private config: ClearNodeConfig;
  private connection: ClearNodeConnection = {
    isConnected: false,
    isAuthenticated: false,
  };
  private messageHandlers: Map<string, (data: any) => void> = new Map();
  private reconnectAttempts = 0;
  private reconnectTimer: NodeJS.Timeout | null = null;

  constructor(config: Partial<ClearNodeConfig> = {}) {
    this.config = {
      endpoint: "wss://clearnet.yellow.com/ws",
      timeout: 30000,
      retryAttempts: 3,
      reconnectDelay: 5000,
      ...config,
    };
  }

  /**
   * Connect to ClearNode WebSocket
   */
  async connect(): Promise<void> {
    return new Promise((resolve, reject) => {
      try {
        this.ws = new WebSocket(this.config.endpoint);

        this.ws.onopen = () => {
          console.log("✅ Connected to ClearNode");
          this.connection.isConnected = true;
          this.reconnectAttempts = 0;
          resolve();
        };

        this.ws.onmessage = event => {
          this.handleMessage(event.data);
        };

        this.ws.onerror = error => {
          console.error("ClearNode WebSocket error:", error);
          reject(error);
        };

        this.ws.onclose = () => {
          console.log("ClearNode WebSocket closed");
          this.connection.isConnected = false;
          this.connection.isAuthenticated = false;
          this.handleReconnect();
        };

        // Set connection timeout
        setTimeout(() => {
          if (!this.connection.isConnected) {
            reject(new Error("Connection timeout"));
          }
        }, this.config.timeout);
      } catch (error) {
        reject(error);
      }
    });
  }

  /**
   * Authenticate with ClearNode using Nitrolite SDK
   */
  async authenticate(messageSigner: ViemMessageSigner, userAddress: Address): Promise<void> {
    if (!this.ws || !this.connection.isConnected) {
      throw new ClearNodeError("Not connected to ClearNode");
    }

    this.messageSigner = messageSigner;
    this.eip712Signer = createViemEIP712Signer(createClearNodeDomain(1)); // Default to Ethereum mainnet

    return new Promise((resolve, reject) => {
      // Set up authentication message handler
      const authHandler = (message: ClearNodeMessage) => {
        if (message.method === "auth_challenge") {
          this.handleAuthChallenge(message, userAddress)
            .then(() => {
              this.connection.isAuthenticated = true;
              this.messageHandlers.delete("auth");
              resolve();
            })
            .catch(reject);
        } else if (message.method === "auth_success") {
          this.connection.isAuthenticated = true;
          this.connection.jwtToken = message.result?.jwtToken;
          this.connection.sessionKey = message.result?.sessionKey;
          this.messageHandlers.delete("auth");
          resolve();
        } else if (message.error) {
          this.messageHandlers.delete("auth");
          reject(
            new ClearNodeError(
              `Authentication failed: ${message.error.message}`,
              message.error.code,
              message.error.data,
            ),
          );
        }
      };

      this.messageHandlers.set("auth", authHandler);

      try {
        // Use SDK to create proper auth request message
        const authRequestMessage = createAuthRequestMessage(
          this.messageSigner,
          userAddress,
          "console", // scope
        );

        if (this.ws) {
          this.ws.send(authRequestMessage);
        }
      } catch (error) {
        this.messageHandlers.delete("auth");
        reject(new ClearNodeError(`Failed to create auth request: ${error}`));
      }
    });
  }

  /**
   * Handle authentication challenge using SDK
   */
  private async handleAuthChallenge(message: ClearNodeMessage, userAddress: Address): Promise<void> {
    if (!this.eip712Signer) {
      throw new ClearNodeError("EIP-712 signer not set");
    }

    const challenge = message.params?.challengeMessage;
    if (!challenge) {
      throw new ClearNodeError("No challenge received");
    }

    try {
      // Use SDK to create proper auth verify message with EIP-712 signature
      const authVerifyMessage = createAuthVerifyMessage(this.eip712Signer, userAddress, {
        challengeMessage: challenge,
      });

      if (this.ws) {
        this.ws.send(authVerifyMessage);
      }
    } catch (error) {
      throw new ClearNodeError(`Failed to create auth verify message: ${error}`);
    }
  }

  /**
   * Create application session using SDK
   */
  async createAppSession(session: {
    definition: RPCAppDefinition;
    allocations: RPCAppSessionAllocation[];
  }): Promise<void> {
    if (!this.messageSigner || !this.connection.isAuthenticated) {
      throw new ClearNodeError("Not authenticated");
    }

    try {
      // Use SDK to create proper app session message
      const sessionMessage = createAppSessionMessage(this.messageSigner, session);

      if (this.ws) {
        this.ws.send(sessionMessage);
      }
    } catch (error) {
      throw new ClearNodeError(`Failed to create app session: ${error}`);
    }
  }

  /**
   * Send state update (custom implementation since SDK doesn't have this)
   */
  async sendStateUpdate(stateUpdate: any): Promise<void> {
    if (!this.messageSigner || !this.connection.isAuthenticated) {
      throw new ClearNodeError("Not authenticated");
    }

    try {
      // Create custom state update message since SDK doesn't provide this
      const stateUpdateData = {
        type: "state_update",
        channelId: stateUpdate.channelId,
        stateHash: stateUpdate.stateHash,
        nonce: stateUpdate.nonce,
        balances: stateUpdate.balances,
        timestamp: Date.now(),
      };

      const signature = await this.messageSigner(JSON.stringify(stateUpdateData));
      const stateUpdateMessage = JSON.stringify({
        ...stateUpdateData,
        signature,
      });

      if (this.ws) {
        this.ws.send(stateUpdateMessage);
      }
    } catch (error) {
      throw new ClearNodeError(`Failed to send state update: ${error}`);
    }
  }

  /**
   * Get channels using SDK
   */
  async getChannels(): Promise<any[]> {
    if (!this.messageSigner || !this.connection.isAuthenticated) {
      throw new ClearNodeError("Not authenticated");
    }

    return new Promise((resolve, reject) => {
      const handler = (message: ClearNodeMessage) => {
        if (message.result) {
          this.messageHandlers.delete("get_channels");
          resolve(message.result);
        } else if (message.error) {
          this.messageHandlers.delete("get_channels");
          reject(
            new ClearNodeError(
              `Failed to get channels: ${message.error.message}`,
              message.error.code,
              message.error.data,
            ),
          );
        }
      };

      this.messageHandlers.set("get_channels", handler);

      try {
        const getChannelsMessage = createGetChannelsMessage(this.messageSigner);
        if (this.ws) {
          this.ws.send(getChannelsMessage);
        }
      } catch (error) {
        this.messageHandlers.delete("get_channels");
        reject(new ClearNodeError(`Failed to create get channels message: ${error}`));
      }
    });
  }

  /**
   * Get ledger balances using SDK
   */
  async getLedgerBalances(participantAddress: Address): Promise<any> {
    if (!this.messageSigner || !this.connection.isAuthenticated) {
      throw new ClearNodeError("Not authenticated");
    }

    return new Promise((resolve, reject) => {
      const handler = (message: ClearNodeMessage) => {
        if (message.result) {
          this.messageHandlers.delete("get_ledger_balances");
          resolve(message.result);
        } else if (message.error) {
          this.messageHandlers.delete("get_ledger_balances");
          reject(
            new ClearNodeError(
              `Failed to get ledger balances: ${message.error.message}`,
              message.error.code,
              message.error.data,
            ),
          );
        }
      };

      this.messageHandlers.set("get_ledger_balances", handler);

      try {
        const getLedgerBalancesMessage = createGetLedgerBalancesMessage(this.messageSigner, participantAddress);
        if (this.ws) {
          this.ws.send(getLedgerBalancesMessage);
        }
      } catch (error) {
        this.messageHandlers.delete("get_ledger_balances");
        reject(new ClearNodeError(`Failed to create get ledger balances message: ${error}`));
      }
    });
  }

  /**
   * Close app session using SDK
   */
  async closeAppSession(sessionId: string): Promise<void> {
    if (!this.messageSigner || !this.connection.isAuthenticated) {
      throw new ClearNodeError("Not authenticated");
    }

    try {
      const closeSessionMessage = createCloseAppSessionMessage(this.messageSigner, {
        app_session_id: sessionId as `0x${string}`,
        allocations: [],
      });

      if (this.ws) {
        this.ws.send(closeSessionMessage);
      }
    } catch (error) {
      throw new ClearNodeError(`Failed to close app session: ${error}`);
    }
  }

  /**
   * Send payment message (legacy method - should use state channels)
   */
  async sendPayment(amount: string, recipient: Address, token: string = "usdc"): Promise<void> {
    if (!this.messageSigner || !this.connection.isAuthenticated) {
      throw new ClearNodeError("Not authenticated");
    }

    try {
      const paymentData = {
        type: "payment",
        amount,
        recipient,
        token,
        timestamp: Date.now(),
      };

      const signature = await this.messageSigner(JSON.stringify(paymentData));

      const paymentMessage = {
        ...paymentData,
        signature,
      };

      if (this.ws) {
        this.ws.send(JSON.stringify(paymentMessage));
      }
    } catch (error) {
      throw new ClearNodeError(`Failed to send payment: ${error}`);
    }
  }

  /**
   * Handle incoming messages
   */
  private handleMessage(data: string): void {
    try {
      const message = JSON.parse(data);

      // Handle authentication messages
      if (this.messageHandlers.has("auth")) {
        this.messageHandlers.get("auth")!(message);
        return;
      }

      // Handle other message types
      switch (message.method) {
        case "session_created":
          console.log("✅ Session created:", message.result?.sessionId);
          break;
        case "payment":
          console.log("💰 Payment received:", message.params?.amount);
          break;
        case "state_update":
          console.log("📊 State updated:", message.params);
          break;
        case "error":
          console.error("❌ ClearNode error:", message.error);
          break;
        default:
          console.log("📨 Received message:", message);
      }
    } catch (error) {
      console.error("Error parsing message:", error);
    }
  }

  /**
   * Handle reconnection with JWT token support
   */
  private handleReconnect(): void {
    if (this.reconnectAttempts < this.config.retryAttempts) {
      this.reconnectAttempts++;
      console.log(`Attempting to reconnect (${this.reconnectAttempts}/${this.config.retryAttempts})...`);

      this.reconnectTimer = setTimeout(() => {
        this.connectWithJWT().catch(console.error);
      }, this.config.reconnectDelay);
    } else {
      console.error("Max reconnection attempts reached");
      this.connection.isConnected = false;
      this.connection.isAuthenticated = false;
    }
  }

  /**
   * Reconnect using stored JWT token
   */
  private async connectWithJWT(): Promise<void> {
    try {
      await this.connect();

      // If we have a JWT token, try to authenticate with it
      if (this.connection.jwtToken && this.messageSigner) {
        // TODO: Implement JWT-based reconnection
        // This would use createAuthVerifyMessageWithJWT from SDK
        console.log("Reconnecting with JWT token...");
      }
    } catch (error) {
      console.error("Failed to reconnect with JWT:", error);
      this.handleReconnect();
    }
  }

  /**
   * Disconnect from ClearNode
   */
  disconnect(): void {
    if (this.reconnectTimer) {
      clearTimeout(this.reconnectTimer);
      this.reconnectTimer = null;
    }

    if (this.ws) {
      this.ws.close();
      this.ws = null;
    }

    this.connection.isConnected = false;
    this.connection.isAuthenticated = false;
    this.connection.jwtToken = undefined;
    this.connection.sessionKey = undefined;
    this.reconnectAttempts = 0;
  }

  /**
   * Get connection status
   */
  getStatus(): ClearNodeConnection {
    return { ...this.connection };
  }

  /**
   * Store JWT token for reconnection
   */
  private storeJWTToken(token: string): void {
    this.connection.jwtToken = token;
    // Store in localStorage for persistence
    if (typeof window !== "undefined") {
      localStorage.setItem("clearnode_jwt", token);
    }
  }

  /**
   * Retrieve JWT token from storage
   */
  private getStoredJWTToken(): string | null {
    if (typeof window !== "undefined") {
      return localStorage.getItem("clearnode_jwt");
    }
    return null;
  }
}

// Export singleton instance
export const clearNodeService = new ClearNodeService();
