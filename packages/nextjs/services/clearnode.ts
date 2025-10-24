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
  createAuthVerifyMessageWithJWT,
  createCloseAppSessionMessage,
  createEIP712AuthMessageSigner,
  createGetChannelsMessage,
  createGetLedgerBalancesMessage,
  parseAnyRPCResponse,
} from "@erc7824/nitrolite";
// Import Viem types
import type { Address } from "viem";
// Import our custom types
import type { ClearNodeConfig, ClearNodeConnection, ViemMessageSigner } from "~~/types/nitrolite";
// Import error class
import { ClearNodeError } from "~~/types/nitrolite";

export class ClearNodeService {
  private ws: WebSocket | null = null;
  private messageSigner: ViemMessageSigner | null = null;
  private config: ClearNodeConfig;
  private participantAddress?: Address;
  private connection: ClearNodeConnection = {
    isConnected: false,
    isAuthenticated: false,
  };
  private messageHandlers: Map<string, (data: any) => void> = new Map();
  private pendingRequests: Map<number, { resolve: (data: any) => void; reject: (error: any) => void }> = new Map();
  private reconnectAttempts = 0;
  private reconnectTimer: NodeJS.Timeout | null = null;
  private requestIdCounter = 0;
  private heartbeatInterval: NodeJS.Timeout | null = null;
  private isReconnecting = false;
  private connectionState: "disconnected" | "connecting" | "connected" | "authenticating" | "authenticated" =
    "disconnected";

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
    // Prevent multiple simultaneous connections
    if (
      this.connectionState === "connecting" ||
      this.connectionState === "connected" ||
      this.connectionState === "authenticating" ||
      this.connectionState === "authenticated"
    ) {
      console.log("ClearNode already connecting or connected, skipping...");
      return Promise.resolve();
    }

    this.connectionState = "connecting";
    this.isReconnecting = false;

    return new Promise((resolve, reject) => {
      try {
        this.ws = new WebSocket(this.config.endpoint);

        this.ws.onopen = () => {
          console.log("✅ Connected to ClearNode");
          this.connectionState = "connected";
          this.connection.isConnected = true;
          this.reconnectAttempts = 0;
          this.setupHeartbeat();
          resolve();
        };

        this.ws.onmessage = event => {
          this.handleMessage(event.data);
        };

        this.ws.onerror = error => {
          console.error("ClearNode WebSocket error:", error);
          this.connectionState = "disconnected";
          this.connection.isConnected = false;
          this.connection.isAuthenticated = false;
          reject(error);
        };

        this.ws.onclose = event => {
          console.log("ClearNode WebSocket closed", event.code, event.reason);
          this.connectionState = "disconnected";
          this.connection.isConnected = false;
          this.connection.isAuthenticated = false;
          this.clearHeartbeat();

          // Only attempt reconnection if not a normal closure and not already reconnecting
          if (event.code !== 1000 && !this.isReconnecting) {
            this.handleReconnect();
          }
        };

        // Set connection timeout
        setTimeout(() => {
          if (this.connectionState === "connecting") {
            this.connectionState = "disconnected";
            reject(new Error("Connection timeout"));
          }
        }, this.config.timeout);
      } catch (error) {
        this.connectionState = "disconnected";
        reject(error);
      }
    });
  }

  /**
   * Authenticate with ClearNode using Nitrolite SDK
   */
  async authenticate(messageSigner: ViemMessageSigner, userAddress: Address, walletClient?: any): Promise<void> {
    if (!this.ws || this.connectionState !== "connected") {
      throw new ClearNodeError("Not connected to ClearNode");
    }

    if (!messageSigner) {
      throw new ClearNodeError("Message signer not available");
    }

    // Prevent multiple simultaneous authentication attempts
    if (["authenticating", "authenticated"].includes(this.connectionState)) {
      console.log("Already authenticating or authenticated with ClearNode, skipping...");
      return Promise.resolve();
    }

    this.connectionState = "authenticating";
    this.messageSigner = messageSigner;

    return new Promise(async (resolve, reject) => {
      try {
        const appName = "BatchPay";
        // Create auth request message using SDK - object-based approach
        const authRequestMsg = await createAuthRequestMessage({
          address: userAddress as `0x${string}`,
          session_key: userAddress as `0x${string}`, // Using same address as session key for simplicity
          app_name: appName,
          expire: (Math.floor(Date.now() / 1000) + 3600).toString(), // 1 hour
          scope: "console",
          application: "0x0000000000000000000000000000000000000000" as `0x${string}`,
          allowances: [],
        });

        // Set up handler for auth responses
        const authHandler = async (message: any) => {
          try {
            console.log("🔍 Received auth message:", JSON.stringify(message, null, 2));
            const method = message.method || (message.res && message.res[1]);
            console.log("🔍 Auth method:", method);

            if (method === "auth_challenge") {
              // Get challenge from response
              const challenge = message.params?.challengeMessage || message.res?.[2]?.[0]?.challengeMessage;

              if (!challenge) {
                throw new ClearNodeError("No challenge received");
              }

              // Build SDK EIP-712 signer using the connected wallet client per docs
              if (!walletClient) {
                throw new ClearNodeError("Wallet client not available for EIP-712 auth signer");
              }

              const eip712Signer = createEIP712AuthMessageSigner(
                walletClient,
                {
                  scope: "console",
                  application: "0x0000000000000000000000000000000000000000",
                  participant: userAddress as `0x${string}`,
                  expire: (Math.floor(Date.now() / 1000) + 3600).toString(),
                  allowances: [],
                },
                { name: appName },
              );

              // Create and send auth verify message using the SDK EIP-712 signer
              const authVerifyMsg = await createAuthVerifyMessage(eip712Signer, message);

              if (this.ws) {
                this.ws.send(authVerifyMsg);
              }
            } else if (method === "auth_verify" || method === "auth_success") {
              // Authentication successful
              const success = message.params?.success !== false && message.res?.[2]?.[0]?.success !== false;

              if (success) {
                this.connectionState = "authenticated";
                this.connection.isAuthenticated = true;
                this.participantAddress = userAddress;
                const jwtToken = message.params?.jwtToken || message.res?.[2]?.[0]?.jwtToken;
                if (jwtToken) {
                  this.connection.jwtToken = jwtToken;
                  this.storeJWTToken(jwtToken);
                }
                this.messageHandlers.delete("auth");
                console.log("✅ Authenticated with ClearNode");
                resolve();
              } else {
                this.connectionState = "connected";
                this.messageHandlers.delete("auth");
                reject(new ClearNodeError("Authentication failed"));
              }
            } else if (message.error || (message.res && message.res[1] === "error")) {
              this.messageHandlers.delete("auth");
              const errorMessage =
                message.error?.message ||
                message.res?.[2]?.[0]?.message ||
                message.params?.error ||
                "Unknown authentication error";
              console.error("❌ ClearNode authentication error:", errorMessage);
              reject(new ClearNodeError(`Authentication failed: ${errorMessage}`));
            }
          } catch (error) {
            this.messageHandlers.delete("auth");
            reject(error);
          }
        };

        this.messageHandlers.set("auth", authHandler);

        // Set authentication timeout - NO FALLBACK
        const authTimeout = setTimeout(() => {
          this.messageHandlers.delete("auth");
          this.connectionState = "connected";
          console.log("❌ Authentication timeout - ClearNode authentication failed");
          reject(new ClearNodeError("Authentication timeout - ClearNode authentication failed"));
        }, 15000); // 15 second timeout

        // Clear timeout on success
        const originalResolve = resolve;
        resolve = () => {
          clearTimeout(authTimeout);
          originalResolve();
        };

        // Send auth request
        if (this.ws) {
          console.log("🔐 Sending authentication request to ClearNode...");
          this.ws.send(authRequestMsg);
        } else {
          clearTimeout(authTimeout);
          reject(new ClearNodeError("WebSocket not connected"));
        }
      } catch (error) {
        this.messageHandlers.delete("auth");
        reject(new ClearNodeError(`Failed to create auth request: ${error}`));
      }
    });
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
      // Create a wrapper that matches the SDK's expected interface
      const sdkMessageSigner = async (payload: any): Promise<`0x${string}`> => {
        try {
          const messageString = typeof payload === "string" ? payload : JSON.stringify(payload);
          return await this.messageSigner!(messageString);
        } catch (error) {
          console.error("Error in SDK message signer:", error);
          throw new Error("Failed to sign message for SDK");
        }
      };

      // Use SDK to create proper app session message (single object, not array)
      const sessionMessage = await createAppSessionMessage(sdkMessageSigner, session);

      if (this.ws) {
        this.ws.send(sessionMessage);
      }
    } catch (error) {
      throw new ClearNodeError(`Failed to create app session: ${error}`);
    }
  }

  /**
   * Send state update using ERC-7824 submit_app_state
   */
  async sendStateUpdate(stateUpdate: any): Promise<void> {
    if (!this.messageSigner || !this.connection.isAuthenticated) {
      throw new ClearNodeError("Not authenticated");
    }

    try {
      // Use proper ERC-7824 submit_app_state format
      const submitAppStateData = {
        req: [
          1,
          "submit_app_state",
          {
            app_session_id: stateUpdate.channelId,
            allocations: stateUpdate.balances.map((balance: string, index: number) => ({
              participant: stateUpdate.participants?.[index] || `0x${index.toString().padStart(40, "0")}`,
              asset: "usdc",
              amount: balance,
            })),
            session_data: JSON.stringify({
              expenses: stateUpdate.expenses || [],
              stateHash: stateUpdate.stateHash,
              nonce: stateUpdate.nonce,
              timestamp: Date.now(),
            }),
          },
          Date.now(),
        ],
      };

      const signature = await this.messageSigner(JSON.stringify(submitAppStateData));
      const submitAppStateMessage = JSON.stringify({
        ...submitAppStateData,
        sig: [signature],
      });

      if (this.ws) {
        this.ws.send(submitAppStateMessage);
        console.log("📤 Sent submit_app_state:", submitAppStateData);
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

    return new Promise(async (resolve, reject) => {
      const handler = (message: any) => {
        const method = message.method || (message.res && message.res[1]);

        if (method === "get_channels") {
          const result = message.result || message.params || (message.res && message.res[2]);
          this.messageHandlers.delete("get_channels");
          resolve(result);
        } else if (message.error || (message.res && message.res[1] === "error")) {
          this.messageHandlers.delete("get_channels");
          reject(new ClearNodeError(`Failed to get channels: ${message.error?.message || "Unknown error"}`));
        }
      };

      this.messageHandlers.set("get_channels", handler);

      try {
        // Create a wrapper that matches the SDK's expected interface
        const sdkMessageSigner = async (payload: any): Promise<`0x${string}`> => {
          try {
            const messageString = typeof payload === "string" ? payload : JSON.stringify(payload);
            return await this.messageSigner!(messageString);
          } catch (error) {
            console.error("Error in SDK message signer:", error);
            throw new Error("Failed to sign message for SDK");
          }
        };

        // Create get channels message - expects address parameter
        const participant = (this.participantAddress || "0x0000000000000000000000000000000000000000") as `0x${string}`;
        const getChannelsMessage = await createGetChannelsMessage(sdkMessageSigner, participant);
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

    return new Promise(async (resolve, reject) => {
      const handler = (message: any) => {
        const method = message.method || (message.res && message.res[1]);

        if (method === "get_ledger_balances") {
          const result = message.result || message.params || (message.res && message.res[2]);
          this.messageHandlers.delete("get_ledger_balances");
          resolve(result);
        } else if (message.error || (message.res && message.res[1] === "error")) {
          this.messageHandlers.delete("get_ledger_balances");
          reject(new ClearNodeError(`Failed to get ledger balances: ${message.error?.message || "Unknown error"}`));
        }
      };

      this.messageHandlers.set("get_ledger_balances", handler);

      try {
        // Create a wrapper that matches the SDK's expected interface
        const sdkMessageSigner = async (payload: any): Promise<`0x${string}`> => {
          try {
            const messageString = typeof payload === "string" ? payload : JSON.stringify(payload);
            return await this.messageSigner!(messageString);
          } catch (error) {
            console.error("Error in SDK message signer:", error);
            throw new Error("Failed to sign message for SDK");
          }
        };

        const getLedgerBalancesMessage = await createGetLedgerBalancesMessage(
          sdkMessageSigner,
          participantAddress as `0x${string}`,
        );
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
      // Create a wrapper that matches the SDK's expected interface
      const sdkMessageSigner = async (payload: any): Promise<`0x${string}`> => {
        try {
          const messageString = typeof payload === "string" ? payload : JSON.stringify(payload);
          return await this.messageSigner!(messageString);
        } catch (error) {
          console.error("Error in SDK message signer:", error);
          throw new Error("Failed to sign message for SDK");
        }
      };

      // SDK expects single object, not array
      const closeSessionMessage = await createCloseAppSessionMessage(sdkMessageSigner, {
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
      // Try to parse using SDK parser
      let message: any;
      try {
        message = parseAnyRPCResponse(data);
      } catch {
        // Fallback to manual parsing
        message = JSON.parse(data);
      }

      console.log("📨 Received message:", JSON.stringify(message, null, 2));

      // Determine message type/method
      const method = message.method || (message.res && message.res[1]);
      console.log("📨 Message method:", method);

      // Handle authentication messages first
      if (this.messageHandlers.has("auth")) {
        this.messageHandlers.get("auth")!(message);
        return;
      }

      // Handle specific method handlers
      if (method && this.messageHandlers.has(method)) {
        this.messageHandlers.get(method)!(message);
        return;
      }

      // Handle other message types
      switch (method) {
        case "session_created":
        case "create_app_session":
          console.log("✅ Session created:", message.result || message.res?.[2]);
          break;
        case "payment":
          console.log("💰 Payment received:", message.params || message.res?.[2]);
          break;
        case "submit_app_state":
          console.log("📊 App state updated:", message.params || message.res?.[2]);
          // Handle app state updates with expenses data
          const appStateData = message.params || message.res?.[2];
          if (appStateData && appStateData.session_data) {
            try {
              const sessionData = JSON.parse(appStateData.session_data);
              console.log("📊 Parsed session data:", sessionData);

              if (sessionData.expenses) {
                console.log("📊 Found expenses in session data:", sessionData.expenses.length);

                // Broadcast to other participants via window events
                const broadcastMessage = {
                  type: "state_update",
                  channelId: appStateData.app_session_id,
                  data: {
                    expenses: sessionData.expenses,
                    stateHash: sessionData.stateHash,
                    nonce: sessionData.nonce,
                    timestamp: sessionData.timestamp,
                    participants: appStateData.allocations?.map((alloc: any) => alloc.participant) || [],
                  },
                };

                console.log("📤 Broadcasting message:", broadcastMessage);
                window.postMessage(broadcastMessage, "*");
                console.log("📤 Broadcasted state update to participants with expenses:", sessionData.expenses.length);
              } else {
                console.log("📊 No expenses found in session data");
              }
            } catch (error) {
              console.error("Error parsing session data:", error);
            }
          } else {
            console.log("📊 No session_data found in app state update");
          }
          break;
        case "error":
          console.error("❌ ClearNode error:", message.error || message.res?.[2]);
          break;
        default:
          console.log("📨 Received message:", message);
      }
    } catch (error) {
      console.error("Error parsing message:", error);
    }
  }

  /**
   * Setup heartbeat to maintain connection
   */
  private setupHeartbeat(): void {
    this.clearHeartbeat();
    this.heartbeatInterval = setInterval(() => {
      if (this.ws && this.ws.readyState === WebSocket.OPEN) {
        try {
          this.ws.send(JSON.stringify({ type: "ping", timestamp: Date.now() }));
        } catch (error) {
          console.error("Heartbeat failed:", error);
          this.clearHeartbeat();
        }
      } else {
        this.clearHeartbeat();
      }
    }, 30000); // 30 seconds
  }

  /**
   * Clear heartbeat interval
   */
  private clearHeartbeat(): void {
    if (this.heartbeatInterval) {
      clearInterval(this.heartbeatInterval);
      this.heartbeatInterval = null;
    }
  }

  /**
   * Handle reconnection with JWT token support
   */
  private handleReconnect(): void {
    if (this.isReconnecting) {
      console.log("Already reconnecting, skipping...");
      return;
    }

    if (this.reconnectAttempts < this.config.retryAttempts) {
      this.isReconnecting = true;
      this.reconnectAttempts++;
      console.log(`Attempting to reconnect (${this.reconnectAttempts}/${this.config.retryAttempts})...`);

      this.reconnectTimer = setTimeout(() => {
        this.connectWithJWT().catch(console.error);
      }, this.config.reconnectDelay);
    } else {
      console.error("Max reconnection attempts reached");
      this.connection.isConnected = false;
      this.connection.isAuthenticated = false;
      this.connectionState = "disconnected";
    }
  }

  /**
   * Reconnect using stored JWT token
   */
  private async connectWithJWT(): Promise<void> {
    try {
      await this.connect();

      // If we have a JWT token, try to authenticate with it
      const storedToken = this.getStoredJWTToken();
      if (storedToken && this.ws) {
        console.log("Reconnecting with JWT token...");
        this.connectionState = "authenticating";

        try {
          const authVerifyMsg = await createAuthVerifyMessageWithJWT(storedToken);
          this.ws.send(authVerifyMsg);

          // Set up handler for JWT auth response
          this.messageHandlers.set("auth", (message: any) => {
            const method = message.method || (message.res && message.res[1]);
            if (method === "auth_verify" || method === "auth_success") {
              const success = message.params?.success !== false && message.res?.[2]?.[0]?.success !== false;
              if (success) {
                this.connectionState = "authenticated";
                this.connection.isAuthenticated = true;
                console.log("✅ Reconnected with JWT");
              } else {
                this.connectionState = "connected";
              }
              this.messageHandlers.delete("auth");
            }
          });
        } catch (error) {
          console.error("Failed to authenticate with JWT:", error);
          this.connectionState = "connected";
        }
      }
    } catch (error) {
      console.error("Failed to reconnect with JWT:", error);
      this.connectionState = "disconnected";
      this.handleReconnect();
    } finally {
      this.isReconnecting = false;
    }
  }

  /**
   * Disconnect from ClearNode
   */
  disconnect(): void {
    this.connectionState = "disconnected";
    this.isReconnecting = false;

    if (this.reconnectTimer) {
      clearTimeout(this.reconnectTimer);
      this.reconnectTimer = null;
    }

    this.clearHeartbeat();

    if (this.ws) {
      this.ws.close(1000, "Normal closure");
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
  getStatus(): ClearNodeConnection & { connectionState: string } {
    return { ...this.connection, connectionState: this.connectionState };
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
