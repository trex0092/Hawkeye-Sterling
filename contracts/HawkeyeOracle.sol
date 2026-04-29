// SPDX-License-Identifier: MIT
pragma solidity ^0.8.24;

/// @title HawkeyeOracle — on-chain screening oracle
/// @notice Lets DeFi protocols block sanctioned wallets without sending any
///         user data off-chain. The oracle publishes a merkle root of the
///         sanctioned-address set maintained by Hawkeye Sterling; client
///         contracts call `isSanctioned(address, proof)` with an inclusion
///         proof returned by the REST API.
/// @dev    The trust model: oracle updater is a multi-sig controlled by the
///         Hawkeye MLRO + auditor. Clients can pin a specific root for a
///         given transaction using `rootAt(uint256)` if they want
///         deterministic replays.
contract HawkeyeOracle {
    // ------------------------------------------------------------------
    // Roles
    // ------------------------------------------------------------------

    address public admin;
    mapping(address => bool) public updaters;

    modifier onlyAdmin() {
        require(msg.sender == admin, "oracle: not admin");
        _;
    }

    modifier onlyUpdater() {
        require(updaters[msg.sender], "oracle: not updater");
        _;
    }

    // ------------------------------------------------------------------
    // State
    // ------------------------------------------------------------------

    /// @notice Current merkle root of the sanctioned address set
    bytes32 public currentRoot;

    /// @notice Epoch counter — increments every publish
    uint256 public epoch;

    /// @notice Epoch → root (so clients can pin replay transactions)
    mapping(uint256 => bytes32) public rootAt;

    /// @notice Epoch → publish timestamp
    mapping(uint256 => uint256) public publishedAt;

    /// @notice Emergency circuit-breaker: when true, isSanctioned() always
    ///         returns true (fail-closed). Used during list-poisoning
    ///         incidents.
    bool public failClosed;

    // ------------------------------------------------------------------
    // Events
    // ------------------------------------------------------------------

    event RootPublished(uint256 indexed epoch, bytes32 root, uint256 timestamp);
    event UpdaterSet(address indexed updater, bool enabled);
    event FailClosedSet(bool failClosed);
    event AdminTransferred(address indexed previous, address indexed next);

    // ------------------------------------------------------------------
    // Construction
    // ------------------------------------------------------------------

    constructor(address initialUpdater) {
        admin = msg.sender;
        updaters[initialUpdater] = true;
        emit UpdaterSet(initialUpdater, true);
    }

    // ------------------------------------------------------------------
    // Admin
    // ------------------------------------------------------------------

    function setUpdater(address updater, bool enabled) external onlyAdmin {
        updaters[updater] = enabled;
        emit UpdaterSet(updater, enabled);
    }

    function setFailClosed(bool value) external onlyAdmin {
        failClosed = value;
        emit FailClosedSet(value);
    }

    function transferAdmin(address next) external onlyAdmin {
        require(next != address(0), "oracle: zero admin");
        emit AdminTransferred(admin, next);
        admin = next;
    }

    // ------------------------------------------------------------------
    // Updater
    // ------------------------------------------------------------------

    /// @notice Publish a new sanctioned-address root. Updaters are expected
    ///         to run at the screening cadence (hourly on Pro tier).
    function publishRoot(bytes32 root) external onlyUpdater {
        require(root != bytes32(0), "oracle: zero root");
        epoch += 1;
        currentRoot = root;
        rootAt[epoch] = root;
        publishedAt[epoch] = block.timestamp;
        emit RootPublished(epoch, root, block.timestamp);
    }

    // ------------------------------------------------------------------
    // Query
    // ------------------------------------------------------------------

    /// @notice Returns true if `subject` is proven to be in the current
    ///         sanctioned set via the supplied merkle `proof`. Fail-closed
    ///         mode returns true unconditionally.
    function isSanctioned(address subject, bytes32[] calldata proof) external view returns (bool) {
        if (failClosed) return true;
        bytes32 leaf = keccak256(abi.encodePacked(subject));
        return _verify(proof, currentRoot, leaf);
    }

    /// @notice Same as `isSanctioned` but pinned to a specific epoch — used
    ///         by audit replays so a transaction's verdict is reproducible.
    function isSanctionedAt(
        address subject,
        uint256 pinnedEpoch,
        bytes32[] calldata proof
    ) external view returns (bool) {
        bytes32 root = rootAt[pinnedEpoch];
        require(root != bytes32(0), "oracle: unknown epoch");
        bytes32 leaf = keccak256(abi.encodePacked(subject));
        return _verify(proof, root, leaf);
    }

    // ------------------------------------------------------------------
    // Internal: OpenZeppelin-compatible merkle proof verification
    // ------------------------------------------------------------------

    function _verify(bytes32[] calldata proof, bytes32 root, bytes32 leaf) internal pure returns (bool) {
        bytes32 computed = leaf;
        for (uint256 i = 0; i < proof.length; ++i) {
            bytes32 sibling = proof[i];
            computed = computed < sibling
                ? keccak256(abi.encodePacked(computed, sibling))
                : keccak256(abi.encodePacked(sibling, computed));
        }
        return computed == root;
    }
}
