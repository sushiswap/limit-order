//SPDX-License-Identifier: Unlicense
pragma solidity 0.6.12;
pragma experimental ABIEncoderV2;

import "./IOracle.sol";
import "./ILimitOrderReceiver.sol";

interface IStopLimitOrder {
    
    struct OrderArgs {
        address maker; 
        uint256 amountIn; 
        uint256 amountOut; 
        address recipient; 
        uint256 startTime;
        uint256 endTime;
        uint256 stopPrice;
        IOracle oracleAddress;
        bytes oracleData;
        uint256 amountToFill;
        uint8 v; 
        bytes32 r;
        bytes32 s;
    }

    function cancelledOrder(address user, bytes32 digest) external view returns (bool);
    
    function orderStatus(bytes32 digest) external view returns (uint256);
    
    function fillOrder(
            OrderArgs memory order,
            IERC20 tokenIn,
            IERC20 tokenOut, 
            ILimitOrderReceiver receiver, 
            bytes calldata data) external;

    function fillOrderOpen(
            OrderArgs memory order,
            IERC20 tokenIn,
            IERC20 tokenOut, 
            ILimitOrderReceiver receiver, 
            bytes calldata data) external;

    function batchFillOrder(
            OrderArgs[] memory order,
            IERC20 tokenIn,
            IERC20 tokenOut,
            ILimitOrderReceiver receiver, 
            bytes calldata data) external;

    function batchFillOrderOpen(
            OrderArgs[] memory order,
            IERC20 tokenIn,
            IERC20 tokenOut,
            ILimitOrderReceiver receiver, 
            bytes calldata data) external;
    
    function cancelOrder(bytes32 hash) external;

    function swipeFees(IERC20 token) external;

    function swipe (IERC20 token) external;

    function setFees(address _feeTo, uint256 _externalOrderFee) external;

    function whiteListReceiver(ILimitOrderReceiver receiver) external;

}