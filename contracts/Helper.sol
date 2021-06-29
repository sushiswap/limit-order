//SPDX-License-Identifier: Unlicense
pragma solidity 0.6.12;
pragma experimental ABIEncoderV2;

import "@boringcrypto/boring-solidity/contracts/BoringOwnable.sol";
import "@boringcrypto/boring-solidity/contracts/BoringBatchable.sol";
import "@boringcrypto/boring-solidity/contracts/libraries/BoringMath.sol";
import "@boringcrypto/boring-solidity/contracts/libraries/BoringERC20.sol";
import "@boringcrypto/boring-solidity/contracts/libraries/BoringRebase.sol";

import "@sushiswap/bentobox-sdk/contracts/IBentoBoxV1.sol";
import "./interfaces/ILimitOrderReceiver.sol";
import "./interfaces/IStopLimitOrder.sol";
import "./interfaces/IOracle.sol";

contract Helper {
    
    using BoringMath for uint256;
    using BoringERC20 for IERC20;
    using RebaseLibrary for Rebase;

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

    IStopLimitOrder public immutable stopLimitOrder;
    IBentoBoxV1 private immutable bentoBox;

    constructor(IStopLimitOrder _stopLimitOrder, IBentoBoxV1 _bentoBox) public {
        stopLimitOrder = _stopLimitOrder;
        bentoBox = _bentoBox;
        _bentoBox.registerProtocol();
    }

}
