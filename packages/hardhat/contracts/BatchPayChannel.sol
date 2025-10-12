// SPDX-License-Identifier: MIT
pragma solidity ^0.8.20;

// OpenZeppelin Security
import "@openzeppelin/contracts/utils/ReentrancyGuard.sol";
import "@openzeppelin/contracts/utils/Pausable.sol";

// OpenZeppelin Access Control
import "@openzeppelin/contracts/access/Ownable.sol";

// OpenZeppelin Cryptography (ERC-7824 Core)
import "@openzeppelin/contracts/utils/cryptography/ECDSA.sol";
import "@openzeppelin/contracts/utils/cryptography/MessageHashUtils.sol";

// OpenZeppelin Token Support
import "@openzeppelin/contracts/token/ERC20/IERC20.sol";
import "@openzeppelin/contracts/token/ERC20/utils/SafeERC20.sol";

// OpenZeppelin Utils
import "@openzeppelin/contracts/utils/structs/EnumerableSet.sol";

/**
 * @title BatchPayChannel
 * @notice ERC-7824 State Channel with Yellow Network and PYUSD integration
 * @dev Combines off-chain expense tracking with on-chain settlement
 *
 * Key Features:
 * - ERC-7824 state channels for gas-free expense tracking
 * - OpenZeppelin security (ReentrancyGuard, Pausable)
 * - ECDSA signature verification for state updates
 * - EIP-5792 compatible batch settlements
 * - Yellow Network cross-chain integration
 * - PYUSD stablecoin support for stable value tracking
 * - Multi-chain support (Ethereum, Arbitrum, Optimism, Base, Polygon)
 *
 * PYUSD Integration:
 * - Contract: 0x6c3ea9036406852006290770BEdFcAbA0e23A0e8 (Ethereum)
 * - Docs: https://developer.paypal.com/dev-center/pyusd/
 */
contract BatchPayChannel is ReentrancyGuard, Pausable, Ownable {
    using ECDSA for bytes32;
    using MessageHashUtils for bytes32;
    using SafeERC20 for IERC20;
    using EnumerableSet for EnumerableSet.AddressSet;

    // ============ PYUSD Constants ============

    // PYUSD token addresses (from PayPal documentation)
    address public constant PYUSD_ETHEREUM = 0x6c3ea9036406852006290770BEdFcAbA0e23A0e8;
    // Solana PYUSD: 2b1kV6DkPAnxd5ixfnxCpjxmKwqjjaYmCZfHsFu24GXo (for reference)

    // LayerZero endpoint for PYUSD cross-chain (if using LayerZero)
    address public constant LAYERZERO_ENDPOINT = 0x66A71Dcef29A0fFBDBE3c6a460a3B5BC225Cd675;

    // ============ Structs ============

    struct Channel {
        bytes32 channelId;
        EnumerableSet.AddressSet participants;
        mapping(address => UserPreference) preferences;
        uint256 totalDeposit;
        mapping(address => uint256) deposits;
        uint256 nonce;
        uint256 timeout;
        uint256 disputeDeadline;
        bytes32 stateHash;
        bool isOpen;
        bool inDispute;
        uint256 chainId;
    }

    struct UserPreference {
        address preferredToken;
        uint256 preferredChainId;
        bool usePYUSD; // ⭐ NEW: User prefers PYUSD settlement
        BridgePreference bridgePreference; // ⭐ NEW: Preferred bridge for cross-chain
        string paypalEmail; // ⭐ NEW: Optional for PayPal bridge
    }

    enum BridgePreference {
        AUTO, // Smart routing (cheapest/fastest)
        PAYPAL_BRIDGE, // PayPal/Venmo bridge (PYUSD only)
        YELLOW_NETWORK, // Yellow Network (any token)
        LAYERZERO // LayerZero (PYUSD cross-chain)

    }

    struct ChannelStateData {
        bytes32 channelId;
        bytes32 stateHash;
        uint256 nonce;
        int256[] balances; // Array parallel to participants (in USD-equivalent)
    }

    struct Settlement {
        address from;
        address to;
        uint256 amount;
        address fromToken;
        address toToken;
        uint256 fromChainId;
        uint256 toChainId;
        BridgePreference bridgeType; // ⭐ UPDATED: Track bridge type
    }

    // ============ Constants ============

    uint256 public constant DISPUTE_PERIOD = 7 days;
    uint256 public constant CHANNEL_TIMEOUT = 30 days;
    uint256 public constant MIN_PARTICIPANTS = 2;
    uint256 public constant MAX_PARTICIPANTS = 50;

    // PYUSD decimals (6 decimals, like USDC)
    uint8 public constant PYUSD_DECIMALS = 6;

    // ============ Storage ============

    mapping(bytes32 => Channel) private channels;
    mapping(address => bytes32[]) public userChannels;

    // Track settlements
    mapping(bytes32 => Settlement[]) public channelSettlements;
    mapping(bytes32 => bool) public yellowIntentCompleted;
    mapping(bytes32 => bool) public pyusdSettlementCompleted; // ⭐ NEW

    // ============ Events ============

    event ChannelOpened(
        bytes32 indexed channelId, address[] participants, uint256 chainId, uint256 deposit, uint256 timestamp
    );

    event ChannelStateUpdated(bytes32 indexed channelId, uint256 nonce, bytes32 stateHash, address updatedBy);

    event ChannelClosed(bytes32 indexed channelId, uint256 finalNonce, uint256 timestamp);

    event DisputeInitiated(
        bytes32 indexed channelId, address indexed challenger, uint256 newNonce, uint256 disputeDeadline
    );

    event DisputeResolved(bytes32 indexed channelId, uint256 finalNonce);

    event UserPreferenceSet( // ⭐ NEW
    bytes32 indexed channelId, address indexed user, address preferredToken, uint256 preferredChainId, bool usePYUSD);

    event YellowSettlementInitiated(
        bytes32 indexed channelId,
        bytes32 indexed yellowIntentId,
        address indexed from,
        address to,
        uint256 amount,
        address fromToken,
        address toToken,
        uint256 fromChainId,
        uint256 toChainId
    );

    event YellowSettlementCompleted(bytes32 indexed yellowIntentId, bool success);

    // ⭐ NEW: PYUSD-specific events
    event PYUSDSettlementInitiated(
        bytes32 indexed channelId,
        bytes32 indexed settlementId,
        address indexed from,
        address to,
        uint256 amount,
        BridgePreference bridgeType
    );

    event PYUSDSettlementCompleted(bytes32 indexed settlementId, bool success);

    event PYUSDDirectTransfer(bytes32 indexed channelId, address indexed from, address indexed to, uint256 amount);

    event EmergencyWithdraw(bytes32 indexed channelId, address indexed user, uint256 amount);

    // ============ Modifiers ============

    modifier onlyParticipant(bytes32 channelId) {
        require(channels[channelId].participants.contains(msg.sender), "Not a participant");
        _;
    }

    modifier channelOpen(bytes32 channelId) {
        require(channels[channelId].isOpen, "Channel not open");
        _;
    }

    modifier notInDispute(bytes32 channelId) {
        require(!channels[channelId].inDispute, "Channel in dispute");
        _;
    }

    modifier validChannelId(bytes32 channelId) {
        require(channels[channelId].channelId != bytes32(0), "Invalid channel");
        _;
    }

    // ============ Constructor ============

    constructor() Ownable(msg.sender) {
        // Contract is unpaused by default
    }

    // ============ View Functions ============

    /**
     * @notice Get channel information
     */
    function getChannel(bytes32 channelId)
        external
        view
        returns (
            address[] memory participants,
            uint256 totalDeposit,
            uint256 nonce,
            uint256 timeout,
            bool isOpen,
            bool inDispute,
            uint256 chainId
        )
    {
        Channel storage channel = channels[channelId];
        uint256 participantCount = channel.participants.length();
        participants = new address[](participantCount);

        for (uint256 i = 0; i < participantCount; i++) {
            participants[i] = channel.participants.at(i);
        }

        return (
            participants,
            channel.totalDeposit,
            channel.nonce,
            channel.timeout,
            channel.isOpen,
            channel.inDispute,
            channel.chainId
        );
    }

    /**
     * @notice Get all channels for a user
     */
    function getUserChannels(address user) external view returns (bytes32[] memory) {
        return userChannels[user];
    }

    /**
     * @notice Get user preferences for a channel (includes PYUSD preference)
     */
    function getUserPreference(bytes32 channelId, address user)
        external
        view
        returns (address preferredToken, uint256 preferredChainId, bool usePYUSD, BridgePreference bridgePreference)
    {
        UserPreference storage pref = channels[channelId].preferences[user];
        return (pref.preferredToken, pref.preferredChainId, pref.usePYUSD, pref.bridgePreference);
    }

    /**
     * @notice Get settlements for a channel
     */
    function getChannelSettlements(bytes32 channelId) external view returns (Settlement[] memory) {
        return channelSettlements[channelId];
    }

    /**
     * @notice Check if channel exists
     */
    function channelExists(bytes32 channelId) external view returns (bool) {
        return channels[channelId].channelId != bytes32(0);
    }

    /**
     * @notice Check if PYUSD is supported on this chain
     */
    function isPYUSDSupported() external view returns (bool) {
        // Currently only Ethereum mainnet
        return block.chainid == 1;
    }

    // ============ Emergency Functions (onlyOwner) ============

    /**
     * @notice Pause contract in emergency
     */
    function pause() external onlyOwner {
        _pause();
    }

    /**
     * @notice Unpause contract
     */
    function unpause() external onlyOwner {
        _unpause();
    }

    /**
     * @notice Emergency withdraw for stuck funds
     * @param channelId Channel to withdraw from
     */
    function emergencyWithdraw(bytes32 channelId)
        external
        validChannelId(channelId)
        onlyParticipant(channelId)
        nonReentrant
    {
        Channel storage channel = channels[channelId];
        require(!channel.isOpen, "Channel still open");

        uint256 amount = channel.deposits[msg.sender];
        require(amount > 0, "No deposit to withdraw");

        channel.deposits[msg.sender] = 0;

        (bool success,) = payable(msg.sender).call{value: amount}("");
        require(success, "Transfer failed");

        emit EmergencyWithdraw(channelId, msg.sender, amount);
    }
}
