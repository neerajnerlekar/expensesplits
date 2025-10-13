// SPDX-License-Identifier: MIT
pragma solidity ^0.8.20;

// OpenZeppelin Security
import "@openzeppelin/contracts/utils/ReentrancyGuard.sol";
import "@openzeppelin/contracts/utils/Pausable.sol";

// OpenZeppelin Access Control
import "@openzeppelin/contracts/access/AccessControl.sol";

// OpenZeppelin Token Support
import "@openzeppelin/contracts/token/ERC20/IERC20.sol";
import "@openzeppelin/contracts/token/ERC20/utils/SafeERC20.sol";

/**
 * @title YellowNetworkAdapter
 * @notice Adapter contract for Yellow Network cross-chain settlements
 * @dev Integrates with Yellow Network for any token to any token swaps
 *
 * Key Features:
 * - Cross-chain token swaps via Yellow Network
 * - OpenZeppelin AccessControl for role-based permissions
 * - SafeERC20 for secure token transfers
 * - Intent tracking and settlement management
 * - Multi-chain support
 *
 * Yellow Network Integration:
 * - Layer-3 decentralized clearing network
 * - Real-time cross-chain trading without bridges
 * - State channels for instant settlements
 * - Any ERC-20 to any ERC-20 swaps
 */
contract YellowNetworkAdapter is ReentrancyGuard, Pausable, AccessControl {
    using SafeERC20 for IERC20;

    // ============ Roles ============

    bytes32 public constant BROKER_ROLE = keccak256("BROKER_ROLE");
    bytes32 public constant ADMIN_ROLE = keccak256("ADMIN_ROLE");
    bytes32 public constant SETTLEMENT_ROLE = keccak256("SETTLEMENT_ROLE");

    // ============ Structs ============

    struct SwapIntent {
        bytes32 intentId;
        address from;
        address to;
        uint256 fromAmount;
        address fromToken;
        address toToken;
        uint256 fromChainId;
        uint256 toChainId;
        uint256 timestamp;
        IntentStatus status;
        bytes32 yellowChannelId;
        uint256 settlementDeadline;
    }

    enum IntentStatus {
        PENDING, // Intent created, waiting for Yellow Network
        CONFIRMED, // Yellow Network confirmed the intent
        SETTLED, // Settlement completed
        FAILED, // Settlement failed
        EXPIRED // Intent expired

    }

    struct YellowChannel {
        bytes32 channelId;
        address[] participants;
        uint256 totalLiquidity;
        mapping(address => uint256) liquidity;
        bool isActive;
        uint256 lastUpdate;
    }

    // ============ Constants ============

    uint256 public constant SETTLEMENT_TIMEOUT = 24 hours;
    uint256 public constant MIN_LIQUIDITY = 1000 * 10 ** 6; // 1000 USDC equivalent
    uint256 public constant MAX_INTENT_AGE = 7 days;

    // ============ Storage ============

    mapping(bytes32 => SwapIntent) public swapIntents;
    mapping(bytes32 => YellowChannel) public yellowChannels;
    mapping(address => bytes32[]) public userIntents;

    // Track settlements
    mapping(bytes32 => bool) public intentCompleted;
    mapping(bytes32 => uint256) public settlementFees;

    // Yellow Network configuration
    address public yellowNetworkEndpoint;
    uint256 public yellowNetworkChainId;
    bool public yellowNetworkEnabled;

    // ============ Events ============

    event SwapIntentCreated(
        bytes32 indexed intentId,
        address indexed from,
        address indexed to,
        uint256 fromAmount,
        address fromToken,
        address toToken,
        uint256 fromChainId,
        uint256 toChainId
    );

    event SwapIntentConfirmed(bytes32 indexed intentId, bytes32 indexed yellowChannelId, uint256 settlementDeadline);

    event SwapIntentSettled(bytes32 indexed intentId, uint256 toAmount, bool success);

    event YellowChannelOpened(bytes32 indexed channelId, address[] participants, uint256 totalLiquidity);

    event YellowChannelClosed(bytes32 indexed channelId, uint256 finalLiquidity);

    event SettlementFeeCollected(bytes32 indexed intentId, uint256 feeAmount, address token);

    // ============ Modifiers ============

    modifier onlyBroker() {
        require(hasRole(BROKER_ROLE, msg.sender), "Not a broker");
        _;
    }

    modifier onlySettlement() {
        require(hasRole(SETTLEMENT_ROLE, msg.sender), "Not authorized for settlement");
        _;
    }

    modifier validIntent(bytes32 intentId) {
        require(swapIntents[intentId].intentId != bytes32(0), "Invalid intent");
        _;
    }

    modifier intentNotExpired(bytes32 intentId) {
        require(block.timestamp <= swapIntents[intentId].timestamp + MAX_INTENT_AGE, "Intent expired");
        _;
    }

    // ============ Constructor ============

    constructor(address _yellowNetworkEndpoint, uint256 _yellowNetworkChainId) {
        _grantRole(DEFAULT_ADMIN_ROLE, msg.sender);
        _grantRole(ADMIN_ROLE, msg.sender);
        _grantRole(BROKER_ROLE, msg.sender);
        _grantRole(SETTLEMENT_ROLE, msg.sender);

        yellowNetworkEndpoint = _yellowNetworkEndpoint;
        yellowNetworkChainId = _yellowNetworkChainId;
        yellowNetworkEnabled = true;
    }

    // ============ Yellow Network Integration ============

    /**
     * @notice Create a swap intent for Yellow Network
     * @param from Sender address
     * @param to Recipient address
     * @param fromAmount Amount to swap
     * @param fromToken Source token address
     * @param toToken Destination token address
     * @param fromChainId Source chain ID
     * @param toChainId Destination chain ID
     * @return intentId Unique intent identifier
     */
    function createSwapIntent(
        address from,
        address to,
        uint256 fromAmount,
        address fromToken,
        address toToken,
        uint256 fromChainId,
        uint256 toChainId
    ) external onlyBroker whenNotPaused nonReentrant returns (bytes32 intentId) {
        require(from != address(0), "Invalid from address");
        require(to != address(0), "Invalid to address");
        require(fromAmount > 0, "Invalid amount");
        require(fromToken != address(0), "Invalid from token");
        require(toToken != address(0), "Invalid to token");
        require(fromChainId != toChainId, "Same chain swap not supported");

        // Generate unique intent ID
        intentId = keccak256(
            abi.encodePacked(
                from, to, fromAmount, fromToken, toToken, fromChainId, toChainId, block.timestamp, block.number
            )
        );

        // Create swap intent
        swapIntents[intentId] = SwapIntent({
            intentId: intentId,
            from: from,
            to: to,
            fromAmount: fromAmount,
            fromToken: fromToken,
            toToken: toToken,
            fromChainId: fromChainId,
            toChainId: toChainId,
            timestamp: block.timestamp,
            status: IntentStatus.PENDING,
            yellowChannelId: bytes32(0),
            settlementDeadline: 0
        });

        userIntents[from].push(intentId);

        emit SwapIntentCreated(intentId, from, to, fromAmount, fromToken, toToken, fromChainId, toChainId);

        return intentId;
    }

    /**
     * @notice Confirm swap intent with Yellow Network
     * @param intentId Intent identifier
     * @param yellowChannelId Yellow Network channel ID
     * @param settlementDeadline When settlement must complete
     */
    function confirmSwapIntent(bytes32 intentId, bytes32 yellowChannelId, uint256 settlementDeadline)
        external
        onlyBroker
        validIntent(intentId)
        intentNotExpired(intentId)
    {
        SwapIntent storage intent = swapIntents[intentId];
        require(intent.status == IntentStatus.PENDING, "Intent not pending");
        require(settlementDeadline > block.timestamp, "Invalid deadline");

        intent.status = IntentStatus.CONFIRMED;
        intent.yellowChannelId = yellowChannelId;
        intent.settlementDeadline = settlementDeadline;

        emit SwapIntentConfirmed(intentId, yellowChannelId, settlementDeadline);
    }

    /**
     * @notice Complete swap settlement
     * @param intentId Intent identifier
     * @param toAmount Actual amount received
     * @param success Whether settlement succeeded
     */
    function completeSwapSettlement(bytes32 intentId, uint256 toAmount, bool success)
        external
        onlySettlement
        validIntent(intentId)
    {
        SwapIntent storage intent = swapIntents[intentId];
        require(intent.status == IntentStatus.CONFIRMED, "Intent not confirmed");
        require(block.timestamp <= intent.settlementDeadline, "Settlement deadline passed");

        intent.status = success ? IntentStatus.SETTLED : IntentStatus.FAILED;
        intentCompleted[intentId] = success;

        emit SwapIntentSettled(intentId, toAmount, success);
    }

    /**
     * @notice Open Yellow Network channel
     * @param participants Channel participants
     * @param initialLiquidity Initial liquidity amount
     * @return channelId Yellow Network channel ID
     */
    function openYellowChannel(address[] calldata participants, uint256 initialLiquidity)
        external
        onlyBroker
        whenNotPaused
        nonReentrant
        returns (bytes32 channelId)
    {
        require(participants.length >= 2, "Need at least 2 participants");
        require(initialLiquidity >= MIN_LIQUIDITY, "Insufficient liquidity");

        // Generate channel ID
        channelId = keccak256(abi.encodePacked(participants, initialLiquidity, block.timestamp, block.number));

        YellowChannel storage channel = yellowChannels[channelId];
        channel.channelId = channelId;
        channel.totalLiquidity = initialLiquidity;
        channel.isActive = true;
        channel.lastUpdate = block.timestamp;

        // Add participants
        for (uint256 i = 0; i < participants.length; i++) {
            channel.participants.push(participants[i]);
            channel.liquidity[participants[i]] = initialLiquidity / participants.length;
        }

        emit YellowChannelOpened(channelId, participants, initialLiquidity);

        return channelId;
    }

    /**
     * @notice Close Yellow Network channel
     * @param channelId Channel identifier
     * @param finalLiquidity Final liquidity amount
     */
    function closeYellowChannel(bytes32 channelId, uint256 finalLiquidity) external onlyBroker validIntent(channelId) {
        YellowChannel storage channel = yellowChannels[channelId];
        require(channel.isActive, "Channel not active");

        channel.isActive = false;
        channel.totalLiquidity = finalLiquidity;
        channel.lastUpdate = block.timestamp;

        emit YellowChannelClosed(channelId, finalLiquidity);
    }

    // ============ View Functions ============

    /**
     * @notice Get swap intent details
     */
    function getSwapIntent(bytes32 intentId)
        external
        view
        returns (
            address from,
            address to,
            uint256 fromAmount,
            address fromToken,
            address toToken,
            uint256 fromChainId,
            uint256 toChainId,
            IntentStatus status,
            uint256 timestamp
        )
    {
        SwapIntent storage intent = swapIntents[intentId];
        return (
            intent.from,
            intent.to,
            intent.fromAmount,
            intent.fromToken,
            intent.toToken,
            intent.fromChainId,
            intent.toChainId,
            intent.status,
            intent.timestamp
        );
    }

    /**
     * @notice Get user's swap intents
     */
    function getUserIntents(address user) external view returns (bytes32[] memory) {
        return userIntents[user];
    }

    /**
     * @notice Check if intent is completed
     */
    function isIntentCompleted(bytes32 intentId) external view returns (bool) {
        return intentCompleted[intentId];
    }

    /**
     * @notice Get Yellow Network configuration
     */
    function getYellowNetworkConfig() external view returns (address endpoint, uint256 chainId, bool enabled) {
        return (yellowNetworkEndpoint, yellowNetworkChainId, yellowNetworkEnabled);
    }

    // ============ Admin Functions ============

    /**
     * @notice Update Yellow Network endpoint
     */
    function updateYellowNetworkEndpoint(address newEndpoint) external onlyRole(ADMIN_ROLE) {
        require(newEndpoint != address(0), "Invalid endpoint");
        yellowNetworkEndpoint = newEndpoint;
    }

    /**
     * @notice Enable/disable Yellow Network
     */
    function setYellowNetworkEnabled(bool enabled) external onlyRole(ADMIN_ROLE) {
        yellowNetworkEnabled = enabled;
    }

    /**
     * @notice Pause contract
     */
    function pause() external onlyRole(ADMIN_ROLE) {
        _pause();
    }

    /**
     * @notice Unpause contract
     */
    function unpause() external onlyRole(ADMIN_ROLE) {
        _unpause();
    }

    /**
     * @notice Grant broker role
     */
    function grantBrokerRole(address account) external onlyRole(ADMIN_ROLE) {
        grantRole(BROKER_ROLE, account);
    }

    /**
     * @notice Revoke broker role
     */
    function revokeBrokerRole(address account) external onlyRole(ADMIN_ROLE) {
        revokeRole(BROKER_ROLE, account);
    }
}
