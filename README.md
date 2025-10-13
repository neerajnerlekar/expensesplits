# BatchPay - Cross-Chain Expense Splitter with PYUSD

A production-grade cross-chain expense splitting application that combines ERC-7824 state channels, EIP-5792 batch settlements, Yellow Network integration, and PYUSD stablecoin support.

## 🚀 Core Innovation

BatchPay combines four cutting-edge technologies:

1. **ERC-7824 State Channels** - Off-chain expense tracking (zero gas, instant updates)
2. **EIP-5792 Batch Settlements** - Multiple payments in one transaction
3. **Yellow Network Integration** - Cross-chain settlements (any token → any token)
4. **PYUSD Integration** - PayPal's stablecoin for stable expense tracking

**Result**: Track expenses for free in stable USD value, settle across chains with any token including PYUSD, and save 95%+ on gas fees.

## 🏗️ Architecture

### Smart Contracts (OpenZeppelin + Security)

- **BatchPayChannel.sol** - ERC-7824 state channels with PYUSD support
- **YellowNetworkAdapter.sol** - Yellow Network integration for cross-chain swaps
- **OpenZeppelin Security** - ReentrancyGuard, Pausable, AccessControl, SafeERC20

### Frontend (Scaffold-ETH 2)

- **Next.js Frontend** - React with TypeScript
- **Wagmi Hooks** - useScaffoldReadContract, useScaffoldWriteContract
- **RainbowKit** - Wallet connection
- **Tailwind CSS** - Responsive design

## 🛠️ Development Setup

### Prerequisites

- Node.js 18+
- Yarn 3.2+
- Git

### Installation

```bash
# Clone the repository
git clone <repository-url>
cd test5792

# Install dependencies
yarn install

# Start local blockchain
yarn chain

# Deploy contracts
yarn deploy

# Start frontend
yarn start
```

### Development Flow

1. `yarn chain` - Start local Hardhat network
2. `yarn deploy` - Deploy BatchPayChannel + YellowAdapter
3. `yarn start` - Launch frontend on http://localhost:3000
4. Navigate to `/batchpay` to use the app
5. Use `/debug` to test contract functions

## 💰 PYUSD Integration

### PayPal USD (PYUSD) Support

BatchPay integrates PayPal's stablecoin for stable expense tracking:

- **Ethereum**: `0x6c3ea9036406852006290770BEdFcAbA0e23A0e8`
- **Solana**: `2b1kV6DkPAnxd5ixfnxCpjxmKwqjjaYmCZfHsFu24GXo`
- **Decimals**: 6 (like USDC)
- **Pegged**: 1:1 USD

### PayPal Bridge Integration

Cross-chain PYUSD transfers via PayPal/Venmo:

```typescript
// Example: Bridge PYUSD from Ethereum to Solana
const bridgeService = new PYUSDBridgeService();

const quote = await bridgeService.getBridgeQuote({
  amount: BigInt("1000000"), // 1 PYUSD (6 decimals)
  fromChain: "ethereum",
  toChain: "solana",
  userEmail: "user@example.com",
  destinationAddress: "0x...",
});

// Process:
// 1. Send PYUSD to PayPal receiving address
// 2. PayPal credits user's account (~30 seconds)
// 3. User sends from PayPal to destination
// 4. Recipient receives PYUSD in < 1 minute
```

### PYUSD Bridge Service

```typescript
import { pyusdBridgeService } from "~~/services/pyusdBridge";

// Get PayPal receiving address
const depositAddress = await pyusdBridgeService.getPayPalReceivingAddress(
  "user@example.com",
  "ethereum"
);

// Check bridge availability
const isAvailable = pyusdBridgeService.isPayPalBridgeAvailable(1, 501);

// Format PYUSD amounts
const formatted = pyusdBridgeService.formatPYUSDAmount(
  BigInt("1000000"), // 1 PYUSD
  1 // Ethereum chain ID
);
```

## 🌐 Yellow Network Integration

### Cross-Chain Swaps

Yellow Network enables any ERC-20 to any ERC-20 swaps across chains:

```solidity
// Create swap intent
bytes32 intentId = yellowAdapter.createSwapIntent(
  from,           // Sender address
  to,             // Recipient address
  fromAmount,     // Amount to swap
  fromToken,      // Source token (e.g., ETH)
  toToken,        // Destination token (e.g., PYUSD)
  fromChainId,    // Source chain (e.g., Ethereum)
  toChainId       // Destination chain (e.g., Arbitrum)
);
```

### Yellow Network Adapter

```typescript
// Frontend integration
const { writeContractAsync } = useScaffoldWriteContract({
  contractName: "YellowNetworkAdapter",
});

// Create swap intent
await writeContractAsync({
  functionName: "createSwapIntent",
  args: [from, to, fromAmount, fromToken, toToken, fromChainId, toChainId],
});
```

## 🔧 Smart Contract Usage

### Creating a Channel

```typescript
const { writeContractAsync } = useScaffoldWriteContract({
  contractName: "BatchPayChannel",
});

// Create channel with participants
await writeContractAsync({
  functionName: "openChannel",
  args: [
    [participant1, participant2, participant3], // Participants
    chainId, // Chain ID
  ],
  value: parseEther("0.01"), // Initial deposit
});
```

### Setting PYUSD Preferences

```typescript
// Set user preference for PYUSD settlement
await writeContractAsync({
  functionName: "setUserPreference",
  args: [
    channelId,
    PYUSD_ETHEREUM_ADDRESS, // Preferred token
    targetChainId, // Target chain
    true, // usePYUSD
    BridgePreference.PAYPAL_BRIDGE, // Bridge preference
    "user@example.com", // PayPal email
  ],
});
```

### PYUSD Settlement

```typescript
// Direct PYUSD transfer (same chain)
await writeContractAsync({
  functionName: "settlePYUSDDirect",
  args: [channelId, recipient, amount],
});

// PYUSD via PayPal bridge
await writeContractAsync({
  functionName: "settlePYUSDViaPayPal",
  args: [channelId, recipient, amount, paypalAddress],
});
```

## 🧪 Testing

### Run Tests

```bash
# Run all tests
yarn test

# Run specific test file
yarn test BatchPayChannel.test.ts

# Run with gas reporting
yarn test --gas-report
```

### Test Coverage

```bash
# Generate coverage report
yarn coverage
```

## 🚀 Deployment

### Local Development

```bash
# Deploy to local network
yarn deploy

# Deploy specific contract
yarn deploy --tags BatchPayChannel
```

### Production Deployment

```bash
# Deploy to mainnet
yarn deploy --network mainnet

# Deploy to testnet
yarn deploy --network sepolia
```

### Multi-Chain Deployment

```bash
# Deploy to multiple networks
yarn deploy --network ethereum
yarn deploy --network arbitrum
yarn deploy --network optimism
yarn deploy --network base
```

## 📱 Frontend Features

### Dashboard (`/batchpay`)

- Channel list with user's channels
- Quick actions for creating channels
- PYUSD integration information
- Yellow Network status

### Channel Creation (`/batchpay/create`)

- Add participants with address validation
- Set initial deposit amount
- Chain selection
- PYUSD preference setup

### Channel Details (`/batchpay/[channelId]`)

- Expense tracking and balances
- PYUSD token selector
- Cross-chain settlement options
- Yellow Network integration

## 🔒 Security Features

### OpenZeppelin Integration

- **ReentrancyGuard** - Prevents reentrancy attacks
- **Pausable** - Emergency pause functionality
- **AccessControl** - Role-based permissions
- **SafeERC20** - Secure token transfers
- **ECDSA** - Signature verification

### ERC-7824 Compliance

- Off-chain state updates with signature verification
- Dispute resolution with challenge mechanism
- Timeout protection with force close
- Balance validation (sum to zero)

## 🌍 Multi-Chain Support

### Supported Networks

- **Ethereum** - Mainnet and testnets
- **Arbitrum** - Layer 2 scaling
- **Optimism** - Layer 2 scaling
- **Base** - Coinbase L2
- **Polygon** - Sidechain

### Cross-Chain Features

- Yellow Network for any token swaps
- PYUSD PayPal bridge for stablecoin transfers
- EIP-5792 batch settlements
- Multi-chain channel management

## 📊 Gas Optimization

### State Channels (ERC-7824)

- **Off-chain updates**: 0 gas for expense tracking
- **On-chain settlement**: Only final state committed
- **Batch operations**: Multiple updates in one transaction

### EIP-5792 Integration

- **Batch settlements**: Multiple payments in one transaction
- **Gas savings**: 95%+ reduction in gas costs
- **User experience**: Single transaction for complex operations

## 🛡️ Error Handling

### Contract Errors

```typescript
try {
  await writeContractAsync({
    functionName: "openChannel",
    args: [participants, chainId],
    value: deposit,
  });
} catch (error) {
  const parsedError = getParsedError(error);
  notification.error(parsedError);
}
```

### Network Errors

```typescript
// Handle network switching
const { switchChain } = useSwitchChain();

if (chainId !== targetChainId) {
  await switchChain({ chainId: targetChainId });
}
```

## 📈 Performance

### Optimizations

- **State channels**: Instant off-chain updates
- **Batch operations**: Reduced transaction count
- **Yellow Network**: Optimized cross-chain routing
- **PYUSD bridge**: Fast PayPal integration

### Monitoring

```typescript
// Track channel performance
const { data: channelInfo } = useScaffoldReadContract({
  contractName: "BatchPayChannel",
  functionName: "getChannel",
  args: [channelId],
});
```

## 🤝 Contributing

### Development Guidelines

1. Follow Scaffold-ETH 2 patterns
2. Use OpenZeppelin best practices
3. Implement comprehensive tests
4. Follow TypeScript strict mode
5. Use incremental git commits

### Code Style

- ESLint configuration
- Prettier formatting
- TypeScript strict mode
- Comprehensive error handling

## 📄 License

MIT License - see LICENSE file for details.

## 🔗 Links

- **PYUSD Documentation**: https://developer.paypal.com/dev-center/pyusd/
- **Yellow Network**: https://yellow.org/
- **ERC-7824**: https://eips.ethereum.org/EIPS/eip-7824
- **EIP-5792**: https://eips.ethereum.org/EIPS/eip-5792
- **Scaffold-ETH 2**: https://github.com/scaffold-eth/scaffold-eth-2

## 🆘 Support

For support and questions:

1. Check the documentation
2. Review the test files
3. Open an issue on GitHub
4. Join the community Discord

---

**Built with ❤️ using Scaffold-ETH 2, OpenZeppelin, and cutting-edge Web3 technologies.**
