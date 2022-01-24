//SPDX-License-Identifier: Unlicense
pragma solidity 0.6.12;
pragma experimental ABIEncoderV2;

import "@boringcrypto/boring-solidity/contracts/libraries/BoringMath.sol";
import "@boringcrypto/boring-solidity/contracts/libraries/BoringERC20.sol";
import "@boringcrypto/boring-solidity/contracts/libraries/BoringRebase.sol";
import "./libraries/UniswapV2Library.sol";

import "@sushiswap/bentobox-sdk/contracts/IBentoBoxV1.sol";
import "./interfaces/ILimitOrderReceiver.sol";
import "./interfaces/IStopLimitOrder.sol";
import "./interfaces/IOracle.sol";

contract Helper2 {
    using BoringMath for uint256;
    using BoringERC20 for IERC20;
    using RebaseLibrary for Rebase;

    struct OrderInfo {
        uint256 filledAmount;
        bool cancelled;
        uint256 tokenInBalance;
    }

    struct OrderUserInfo {
        uint256 filledAmount;
        bool cancelled;
        uint256 makersBentoBalance;
        bool approvedMasterContract;
    }

    struct PoolInfo {
        uint256 tokenAPoolBalance;
        uint256 tokenBPoolBalance;
    }

    IStopLimitOrder public immutable stopLimitOrder;
    IBentoBoxV1 public immutable bentoBox;
    address public immutable factory;
    bytes32 public immutable pairCodeHash;

    constructor(
        IStopLimitOrder _stopLimitOrder,
        IBentoBoxV1 _bentoBox,
        address _factory,
        bytes32 _pairCodeHash
    ) public {
        stopLimitOrder = _stopLimitOrder;
        bentoBox = _bentoBox;
        factory = _factory;
        pairCodeHash = _pairCodeHash;
    }

    function getOrderInfo(address[] memory users, bytes32[] memory digests)
        public
        view
        returns (OrderInfo[] memory)
    {
        OrderInfo[] memory info = new OrderInfo[](users.length);

        for (uint256 i = 0; i < users.length; i++) {
            info[i].filledAmount = stopLimitOrder.orderStatus(digests[i]);
            info[i].cancelled = stopLimitOrder.cancelledOrder(
                users[i],
                digests[i]
            );
        }

        return info;
    }

    function getOrderUserInfo(
        address[] memory users,
        IERC20[] memory tokens,
        bytes32[] memory digests
    ) public view returns (OrderUserInfo[] memory) {
        OrderUserInfo[] memory info = new OrderUserInfo[](users.length);

        for (uint256 i = 0; i < users.length; i++) {
            info[i].filledAmount = stopLimitOrder.orderStatus(digests[i]);
            info[i].cancelled = stopLimitOrder.cancelledOrder(
                users[i],
                digests[i]
            );
            info[i].makersBentoBalance = bentoBox.balanceOf(
                tokens[i],
                users[i]
            );
            info[i].approvedMasterContract = bentoBox.masterContractApproved(
                address(stopLimitOrder),
                users[i]
            );
        }

        return info;
    }

    function getPoolInfo(IERC20[] memory tokensA, IERC20[] memory tokensB)
        public
        view
        returns (PoolInfo[] memory)
    {
        PoolInfo[] memory info = new PoolInfo[](tokensA.length);

        for (uint256 i = 0; i < tokensA.length; i++) {
            address pair = UniswapV2Library.pairFor(
                factory,
                address(tokensA[i]),
                address(tokensB[i]),
                pairCodeHash
            );

            info[i].tokenAPoolBalance = tokensA[i].balanceOf(pair);
            info[i].tokenBPoolBalance = tokensB[i].balanceOf(pair);
        }

        return info;
    }

    function getOrderInfoWithBalance(
        address[] memory users,
        IERC20[] memory tokens,
        bytes32[] memory digests
    ) public view returns (OrderInfo[] memory) {
        OrderInfo[] memory info = new OrderInfo[](users.length);

        for (uint256 i = 0; i < users.length; i++) {
            info[i].filledAmount = stopLimitOrder.orderStatus(digests[i]);
            info[i].cancelled = stopLimitOrder.cancelledOrder(
                users[i],
                digests[i]
            );
            info[i].tokenInBalance = bentoBox.balanceOf(tokens[i], users[i]);
        }

        return info;
    }
}
