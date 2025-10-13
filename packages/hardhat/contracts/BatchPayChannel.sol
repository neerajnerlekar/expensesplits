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
        bool usePYUSD; //User prefers PYUSD settlement
        BridgePreference bridgePreference; //Preferred bridge for cross-chain
        string paypalEmail; //Optional for PayPal bridge
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
        BridgePreference bridgeType; // UPDATED: Track bridge type
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
    mapping(bytes32 => bool) public pyusdSettlementCompleted;

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

    event UserPreferenceSet(
        bytes32 indexed channelId, address indexed user, address preferredToken, uint256 preferredChainId, bool usePYUSD
    );

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

    //PYUSD-specific events
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

    // ============ Channel Lifecycle Functions ============

    /**
     * @notice Open a new state channel (ERC-7824)
     * @param participants Array of participant addresses (2-50 participants)
     * @param chainId Primary chain ID for this channel
     * @return channelId Unique identifier for the channel
     */
    function openChannel(address[] calldata participants, uint256 chainId)
        external
        payable
        whenNotPaused
        nonReentrant
        returns (bytes32 channelId)
    {
        require(
            participants.length >= MIN_PARTICIPANTS && participants.length <= MAX_PARTICIPANTS,
            "Invalid participant count"
        );
        require(msg.value > 0, "Deposit required");
        require(chainId > 0, "Invalid chain ID");

        // Validate no duplicate participants
        for (uint256 i = 0; i < participants.length; i++) {
            require(participants[i] != address(0), "Invalid participant");
            for (uint256 j = i + 1; j < participants.length; j++) {
                require(participants[i] != participants[j], "Duplicate participant");
            }
        }

        // Generate unique channel ID
        channelId = keccak256(abi.encodePacked(participants, chainId, block.timestamp, block.number, msg.sender));

        Channel storage channel = channels[channelId];
        channel.channelId = channelId;
        channel.totalDeposit = msg.value;
        channel.deposits[msg.sender] = msg.value;
        channel.nonce = 0;
        channel.timeout = block.timestamp + CHANNEL_TIMEOUT;
        channel.isOpen = true;
        channel.chainId = chainId;

        // Add participants using EnumerableSet for O(1) lookups
        for (uint256 i = 0; i < participants.length; i++) {
            channel.participants.add(participants[i]);
            userChannels[participants[i]].push(channelId);
        }

        emit ChannelOpened(channelId, participants, chainId, msg.value, block.timestamp);
    }

    /**
     * @notice Set user's preferred settlement token and chain with PYUSD support
     * @param channelId Channel identifier
     * @param preferredToken Token address user wants to receive (can be PYUSD)
     * @param preferredChainId Chain ID user wants to receive on
     * @param usePYUSD Whether user prefers PYUSD settlement
     * @param bridgePreference Preferred bridge type for cross-chain
     * @param paypalEmail Optional PayPal email for PayPal bridge
     */
    function setUserPreference(
        bytes32 channelId,
        address preferredToken,
        uint256 preferredChainId,
        bool usePYUSD,
        BridgePreference bridgePreference,
        string calldata paypalEmail
    ) external validChannelId(channelId) onlyParticipant(channelId) channelOpen(channelId) {
        require(preferredChainId > 0, "Invalid chain ID");

        // If usePYUSD is true, validate token is PYUSD
        if (usePYUSD) {
            require(
                preferredToken == PYUSD_ETHEREUM || preferredToken == address(0),
                "Token must be PYUSD if usePYUSD is true"
            );
        }

        Channel storage channel = channels[channelId];
        channel.preferences[msg.sender] = UserPreference({
            preferredToken: usePYUSD ? PYUSD_ETHEREUM : preferredToken,
            preferredChainId: preferredChainId,
            usePYUSD: usePYUSD,
            bridgePreference: bridgePreference,
            paypalEmail: paypalEmail
        });

        emit UserPreferenceSet(channelId, msg.sender, preferredToken, preferredChainId, usePYUSD);
    }

    /**
     * @notice Update channel state off-chain (ERC-7824 core function)
     * @dev Verifies all participant signatures using ECDSA
     * @param channelId Channel identifier
     * @param newState New channel state data
     * @param signatures Array of signatures from all participants
     */
    function updateState(bytes32 channelId, ChannelStateData calldata newState, bytes[] calldata signatures)
        external
        validChannelId(channelId)
        onlyParticipant(channelId)
        channelOpen(channelId)
        notInDispute(channelId)
    {
        Channel storage channel = channels[channelId];

        require(newState.channelId == channelId, "Channel ID mismatch");
        require(newState.nonce > channel.nonce, "Nonce must increase");
        require(newState.balances.length == channel.participants.length(), "Balance array length mismatch");
        require(_verifySignatures(channelId, newState, signatures), "Invalid signatures");

        // Verify balances sum to zero (closed economy)
        int256 sum = 0;
        for (uint256 i = 0; i < newState.balances.length; i++) {
            sum += newState.balances[i];
        }
        require(sum == 0, "Balances must sum to zero");

        // Update channel state
        channel.stateHash = newState.stateHash;
        channel.nonce = newState.nonce;

        emit ChannelStateUpdated(channelId, newState.nonce, newState.stateHash, msg.sender);
    }

    /**
     * @notice Verify signatures using OpenZeppelin ECDSA
     * @dev Implements EIP-191 signed message standard via MessageHashUtils
     * @param channelId Channel identifier
     * @param state Channel state to verify
     * @param signatures Array of signatures to verify
     * @return bool True if all signatures are valid
     */
    function _verifySignatures(bytes32 channelId, ChannelStateData calldata state, bytes[] calldata signatures)
        internal
        view
        returns (bool)
    {
        Channel storage channel = channels[channelId];
        uint256 participantCount = channel.participants.length();

        require(signatures.length == participantCount, "Need all participant signatures");

        // Create message hash (EIP-191 format)
        bytes32 messageHash = keccak256(abi.encodePacked(channelId, state.stateHash, state.nonce, state.balances));

        // Convert to Ethereum Signed Message format using OpenZeppelin
        bytes32 ethSignedHash = messageHash.toEthSignedMessageHash();

        // Track which participants have signed
        bool[] memory hasSigned = new bool[](participantCount);

        for (uint256 i = 0; i < signatures.length; i++) {
            // Recover signer using OpenZeppelin ECDSA
            address recovered = ethSignedHash.recover(signatures[i]);

            // Check if recovered address is a participant
            require(channel.participants.contains(recovered), "Invalid signer");

            // Find participant index
            for (uint256 j = 0; j < participantCount; j++) {
                address participant = channel.participants.at(j);
                if (recovered == participant && !hasSigned[j]) {
                    hasSigned[j] = true;
                    break;
                }
            }
        }

        // Verify all participants signed
        for (uint256 i = 0; i < participantCount; i++) {
            if (!hasSigned[i]) return false;
        }

        return true;
    }

    /**
     * @notice Close channel with final state (requires all signatures)
     * @param channelId Channel identifier
     * @param finalState Final channel state
     * @param signatures Signatures from all participants
     */
    function closeChannel(bytes32 channelId, ChannelStateData calldata finalState, bytes[] calldata signatures)
        external
        validChannelId(channelId)
        onlyParticipant(channelId)
        channelOpen(channelId)
        nonReentrant
    {
        Channel storage channel = channels[channelId];

        // If in dispute, wait for dispute period
        if (channel.inDispute) {
            require(block.timestamp >= channel.disputeDeadline, "Dispute period not over");
        }

        require(_verifySignatures(channelId, finalState, signatures), "Invalid signatures");

        require(finalState.nonce >= channel.nonce, "Cannot use old state");

        channel.isOpen = false;
        channel.stateHash = finalState.stateHash;
        channel.nonce = finalState.nonce;

        emit ChannelClosed(channelId, finalState.nonce, block.timestamp);
    }

    /**
     * @notice Challenge current state with a higher nonce state
     * @param channelId Channel identifier
     * @param higherNonceState State with higher nonce
     * @param signatures Valid signatures for the new state
     */
    function challengeState(bytes32 channelId, ChannelStateData calldata higherNonceState, bytes[] calldata signatures)
        external
        validChannelId(channelId)
        onlyParticipant(channelId)
        channelOpen(channelId)
    {
        Channel storage channel = channels[channelId];

        require(higherNonceState.nonce > channel.nonce, "Must provide higher nonce");
        require(_verifySignatures(channelId, higherNonceState, signatures), "Invalid signatures");

        channel.stateHash = higherNonceState.stateHash;
        channel.nonce = higherNonceState.nonce;
        channel.inDispute = true;
        channel.disputeDeadline = block.timestamp + DISPUTE_PERIOD;

        emit DisputeInitiated(channelId, msg.sender, higherNonceState.nonce, channel.disputeDeadline);
    }

    /**
     * @notice Force close channel after timeout
     * @param channelId Channel identifier
     */
    function forceClose(bytes32 channelId) external validChannelId(channelId) onlyParticipant(channelId) nonReentrant {
        Channel storage channel = channels[channelId];
        require(block.timestamp >= channel.timeout, "Timeout not reached");

        channel.isOpen = false;

        emit ChannelClosed(channelId, channel.nonce, block.timestamp);
    }

    // ============ PYUSD Settlement Functions ============

    /**
     * @notice Direct PYUSD transfer (same chain, no bridge)
     * @dev Uses OpenZeppelin SafeERC20 for secure transfers
     * @param channelId Channel identifier
     * @param recipient Recipient address
     * @param amount Amount in PYUSD (6 decimals)
     */
    function settlePYUSDDirect(bytes32 channelId, address recipient, uint256 amount)
        external
        validChannelId(channelId)
        onlyParticipant(channelId)
        nonReentrant
    {
        require(!channels[channelId].isOpen, "Close channel first");
        require(recipient != address(0), "Invalid recipient");
        require(amount > 0, "Invalid amount");

        // Use OpenZeppelin SafeERC20 for secure transfer
        IERC20(PYUSD_ETHEREUM).safeTransferFrom(msg.sender, recipient, amount);

        emit PYUSDDirectTransfer(channelId, msg.sender, recipient, amount);
    }

    /**
     * @notice Initiate PYUSD settlement via PayPal bridge
     * @dev Transfers PYUSD to PayPal receiving address for cross-chain settlement
     * @param channelId Channel identifier
     * @param recipient Recipient address
     * @param amount Amount in PYUSD
     * @param paypalReceivingAddress PayPal-generated receiving address
     */
    function settlePYUSDViaPayPal(bytes32 channelId, address recipient, uint256 amount, address paypalReceivingAddress)
        external
        validChannelId(channelId)
        onlyParticipant(channelId)
        nonReentrant
        returns (bytes32 settlementId)
    {
        require(!channels[channelId].isOpen, "Close channel first");
        require(recipient != address(0), "Invalid recipient");
        require(amount > 0, "Invalid amount");
        require(paypalReceivingAddress != address(0), "Invalid PayPal address");

        // Generate settlement ID
        settlementId = keccak256(abi.encodePacked(channelId, msg.sender, recipient, amount, block.timestamp));

        // Transfer PYUSD to PayPal receiving address
        IERC20(PYUSD_ETHEREUM).safeTransferFrom(msg.sender, paypalReceivingAddress, amount);

        emit PYUSDSettlementInitiated(
            channelId, settlementId, msg.sender, recipient, amount, BridgePreference.PAYPAL_BRIDGE
        );

        return settlementId;
    }

    /**
     * @notice Mark PYUSD settlement as completed
     * @param settlementId Settlement identifier
     * @param success Whether settlement succeeded
     */
    function completePYUSDSettlement(bytes32 settlementId, bool success) external onlyOwner {
        pyusdSettlementCompleted[settlementId] = success;
        emit PYUSDSettlementCompleted(settlementId, success);
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
