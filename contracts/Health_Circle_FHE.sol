pragma solidity ^0.8.24;
import { FHE, euint32, ebool } from "@fhevm/solidity/lib/FHE.sol";
import { SepoliaConfig } from "@fhevm/solidity/config/ZamaConfig.sol";

contract HealthCircleFHE is SepoliaConfig {
    using FHE for euint32;
    using FHE for ebool;

    error NotOwner();
    error NotProvider();
    error Paused();
    error CooldownActive();
    error BatchNotOpen();
    error InvalidBatchId();
    error InvalidCooldown();
    error ReplayAttempt();
    error StateMismatch();
    error ProofVerificationFailed();
    error AlreadyProcessed();

    struct DecryptionContext {
        uint256 batchId;
        bytes32 stateHash;
        bool processed;
    }

    struct UserSubmission {
        euint32 encryptedCondition;
        euint32 encryptedStatus;
    }

    struct Batch {
        bool isOpen;
        uint256 totalSubmissions;
        uint256 totalConditionSum;
        uint256 totalStatusSum;
        mapping(address => bool) hasSubmitted;
    }

    address public owner;
    mapping(address => bool) public providers;
    bool public paused;
    uint256 public cooldownSeconds;
    mapping(address => uint256) public lastSubmissionTime;
    mapping(address => uint256) public lastDecryptionRequestTime;

    uint256 public currentBatchId;
    mapping(uint256 => Batch) public batches;

    mapping(uint256 => DecryptionContext) public decryptionContexts;
    mapping(uint256 => UserSubmission) public userSubmissions; // batchId -> UserSubmission

    event OwnershipTransferred(address indexed previousOwner, address indexed newOwner);
    event ProviderAdded(address indexed provider);
    event ProviderRemoved(address indexed provider);
    event ContractPaused(address indexed account);
    event ContractUnpaused(address indexed account);
    event CooldownSet(uint256 oldCooldown, uint256 newCooldown);
    event BatchOpened(uint256 indexed batchId);
    event BatchClosed(uint256 indexed batchId, uint256 totalSubmissions);
    event SubmissionAdded(uint256 indexed batchId, address indexed provider);
    event DecryptionRequested(uint256 indexed requestId, uint256 indexed batchId);
    event DecryptionCompleted(uint256 indexed requestId, uint256 indexed batchId, uint256 avgCondition, uint256 avgStatus);

    modifier onlyOwner() {
        if (msg.sender != owner) revert NotOwner();
        _;
    }

    modifier onlyProvider() {
        if (!providers[msg.sender]) revert NotProvider();
        _;
    }

    modifier whenNotPaused() {
        if (paused) revert Paused();
        _;
    }

    modifier submissionRateLimited() {
        if (block.timestamp < lastSubmissionTime[msg.sender] + cooldownSeconds) {
            revert CooldownActive();
        }
        lastSubmissionTime[msg.sender] = block.timestamp;
        _;
    }

    modifier decryptionRateLimited() {
        if (block.timestamp < lastDecryptionRequestTime[msg.sender] + cooldownSeconds) {
            revert CooldownActive();
        }
        lastDecryptionRequestTime[msg.sender] = block.timestamp;
        _;
    }

    constructor() {
        owner = msg.sender;
        providers[msg.sender] = true;
        cooldownSeconds = 60; // Default 1 minute cooldown
        emit ProviderAdded(msg.sender);
    }

    function transferOwnership(address newOwner) external onlyOwner {
        address previousOwner = owner;
        owner = newOwner;
        emit OwnershipTransferred(previousOwner, newOwner);
    }

    function addProvider(address provider) external onlyOwner {
        providers[provider] = true;
        emit ProviderAdded(provider);
    }

    function removeProvider(address provider) external onlyOwner {
        providers[provider] = false;
        emit ProviderRemoved(provider);
    }

    function setPaused(bool _paused) external onlyOwner {
        paused = _paused;
        if (_paused) {
            emit ContractPaused(msg.sender);
        } else {
            emit ContractUnpaused(msg.sender);
        }
    }

    function setCooldown(uint256 newCooldownSeconds) external onlyOwner {
        if (newCooldownSeconds == 0) revert InvalidCooldown();
        uint256 oldCooldown = cooldownSeconds;
        cooldownSeconds = newCooldownSeconds;
        emit CooldownSet(oldCooldown, newCooldownSeconds);
    }

    function openBatch() external onlyOwner whenNotPaused {
        currentBatchId++;
        Batch storage batch = batches[currentBatchId];
        batch.isOpen = true;
        batch.totalSubmissions = 0;
        // totalConditionSum and totalStatusSum remain 0
        emit BatchOpened(currentBatchId);
    }

    function closeBatch(uint256 batchId) external onlyOwner {
        if (batchId == 0 || batchId > currentBatchId) revert InvalidBatchId();
        Batch storage batch = batches[batchId];
        if (!batch.isOpen) revert BatchNotOpen();
        batch.isOpen = false;
        emit BatchClosed(batchId, batch.totalSubmissions);
    }

    function submitEncryptedData(
        euint32 encryptedCondition,
        euint32 encryptedStatus
    ) external onlyProvider whenNotPaused submissionRateLimited {
        if (currentBatchId == 0 || !batches[currentBatchId].isOpen) {
            revert BatchNotOpen();
        }
        if (batches[currentBatchId].hasSubmitted[msg.sender]) {
            revert AlreadyProcessed(); // Provider already submitted to this batch
        }

        _initIfNeeded(encryptedCondition);
        _initIfNeeded(encryptedStatus);

        Batch storage batch = batches[currentBatchId];
        batch.totalSubmissions++;
        batch.hasSubmitted[msg.sender] = true;

        userSubmissions[currentBatchId] = UserSubmission(encryptedCondition, encryptedStatus);

        emit SubmissionAdded(currentBatchId, msg.sender);
    }

    function requestBatchDecryption(uint256 batchId) external onlyOwner whenNotPaused decryptionRateLimited {
        if (batchId == 0 || batchId > currentBatchId) revert InvalidBatchId();
        if (batches[batchId].isOpen) revert BatchNotOpen(); // Must be closed

        UserSubmission storage submission = userSubmissions[batchId];
        _initIfNeeded(submission.encryptedCondition);
        _initIfNeeded(submission.encryptedStatus);

        euint32 memory totalCondition = submission.encryptedCondition;
        euint32 memory totalStatus = submission.encryptedStatus;

        // Prepare ciphertexts for decryption
        bytes32[] memory cts = new bytes32[](2);
        cts[0] = totalCondition.toBytes32();
        cts[1] = totalStatus.toBytes32();

        bytes32 stateHash = _hashCiphertexts(cts);
        uint256 requestId = FHE.requestDecryption(cts, this.myCallback.selector);

        decryptionContexts[requestId] = DecryptionContext({
            batchId: batchId,
            stateHash: stateHash,
            processed: false
        });

        emit DecryptionRequested(requestId, batchId);
    }

    function myCallback(
        uint256 requestId,
        bytes memory cleartexts,
        bytes memory proof
    ) public {
        DecryptionContext storage ctx = decryptionContexts[requestId];

        if (ctx.processed) revert ReplayAttempt();

        // 1. Rebuild ciphertexts from current contract state
        UserSubmission storage submission = userSubmissions[ctx.batchId];
        _requireInitialized(submission.encryptedCondition);
        _requireInitialized(submission.encryptedStatus);

        euint32 memory currentTotalCondition = submission.encryptedCondition;
        euint32 memory currentTotalStatus = submission.encryptedStatus;

        bytes32[] memory currentCts = new bytes32[](2);
        currentCts[0] = currentTotalCondition.toBytes32();
        currentCts[1] = currentTotalStatus.toBytes32();

        // 2. Recalculate state hash
        bytes32 currentStateHash = _hashCiphertexts(currentCts);

        // 3. State verification
        if (currentStateHash != ctx.stateHash) {
            revert StateMismatch();
        }

        // 4. Proof verification
        if (!FHE.checkSignatures(requestId, cleartexts, proof)) {
            revert ProofVerificationFailed();
        }

        // 5. Decode cleartexts
        uint256 totalConditionCleartext = abi.decode(cleartexts, (uint256));
        cleartexts = cleartexts[32:]; // Advance pointer
        uint256 totalStatusCleartext = abi.decode(cleartexts, (uint256));

        // 6. Finalize
        ctx.processed = true;

        // Emit event with results (averages if needed, or totals)
        // For this example, emitting totals. Averages would require division.
        emit DecryptionCompleted(requestId, ctx.batchId, totalConditionCleartext, totalStatusCleartext);
    }

    function _hashCiphertexts(bytes32[] memory cts) internal pure returns (bytes32) {
        return keccak256(abi.encode(cts, address(this)));
    }

    function _initIfNeeded(euint32 cipher) internal {
        if (!cipher.isInitialized()) {
            cipher = FHE.asEuint32(0);
        }
    }

    function _requireInitialized(euint32 cipher) internal pure {
        if (!cipher.isInitialized()) {
            revert("Ciphertext not initialized");
        }
    }
}