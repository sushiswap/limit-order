// SPDX-License-Identifier: GPL-3.0

pragma solidity 0.6.12;
pragma experimental ABIEncoderV2;

import "@boringcrypto/boring-solidity/contracts/libraries/BoringERC20.sol";
import "@boringcrypto/boring-solidity/contracts/libraries/BoringMath.sol";
import "./libraries/UniswapV2Library.sol";
import "@sushiswap/core/contracts/uniswapv2/libraries/TransferHelper.sol";
import "@sushiswap/bentobox-sdk/contracts/IBentoBoxV1.sol";
import "./interfaces/ILimitOrderReceiver.sol";

contract SushiSwapLimitOrderReceiver2 is ILimitOrderReceiver {
    using BoringERC20 for IERC20;
    using BoringMath for uint256;

    address private immutable factory;

    IBentoBoxV1 private immutable bentoBox;

    bytes32 private immutable pairCodeHash;

    constructor (address _factory, IBentoBoxV1 _bentoBox, bytes32 _pairCodeHash) public {
        factory = _factory;
        bentoBox = _bentoBox;
        pairCodeHash = _pairCodeHash;
    }

    function onLimitOrder (IERC20 tokenIn, IERC20 tokenOut, uint256 amountIn, uint256 amountMinOut, bytes calldata data) override external {
        
        bentoBox.withdraw(tokenIn, address(this), address(this), amountIn, 0);
        (address[] memory path, uint256 amountExternal, address to, bool keepTokenIn) = abi.decode(data, (address[], uint256, address, bool));
        
        if (keepTokenIn) {
            // amountExternal is the maximum amount of tokenIn we are willing to trade for tokenOut
            uint256 profit = amountIn.sub(_swapTokensForExactTokens(amountMinOut, amountExternal, path, address(bentoBox)));
            bentoBox.deposit(tokenOut, address(bentoBox), msg.sender, amountMinOut, 0);
            tokenIn.safeTransfer(address(bentoBox), profit);
            bentoBox.deposit(tokenIn, address(bentoBox), to, profit, 0);

        } else {
            // amountExternal is the minimum amount of tokenOut we are prepared to recieve in the trade
            uint256 amountOut = _swapExactTokensForTokens(amountIn, amountExternal, path, address(bentoBox));
            bentoBox.deposit(tokenOut, address(bentoBox), msg.sender, amountMinOut, 0);
            bentoBox.deposit(tokenOut, address(bentoBox), to, amountOut.sub(amountMinOut), 0);

        }
    }

    // Swaps an exact amount of tokens for another token through the path passed as an argument
    // Returns the amount of the final token
    function _swapExactTokensForTokens(
        uint256 amountIn,
        uint256 amountOutMin,
        address[] memory path,
        address to
    ) internal returns (uint256 amountOut) {
        uint256[] memory amounts = UniswapV2Library.getAmountsOut(factory, amountIn, path, pairCodeHash);
        amountOut = amounts[amounts.length - 1];
        require(amountOut >= amountOutMin, "insufficient-amount-out");
        IERC20(path[0]).safeTransfer(UniswapV2Library.pairFor(factory, path[0], path[1], pairCodeHash), amountIn);
        _swap(amounts, path, to);
    }

    // Swaps an some input tokens for an exact amount of the output token
    // Returns the amount of input token we traded
    function _swapTokensForExactTokens(
        uint amountOut,
        uint amountInMax,
        address[] memory path,
        address to
    ) internal returns (uint256 amountIn) {
        uint256[] memory amounts = UniswapV2Library.getAmountsIn(factory, amountOut, path, pairCodeHash);
        amountIn = amounts[0];
        require(amountIn <= amountInMax, 'excessive-amount-in');
        IERC20(path[0]).safeTransfer(UniswapV2Library.pairFor(factory, path[0], path[1], pairCodeHash), amountIn);
        _swap(amounts, path, to);
    }

    // requires the initial amount to have already been sent to the first pair
    function _swap(
        uint256[] memory amounts,
        address[] memory path,
        address _to
    ) internal virtual {
        for (uint256 i; i < path.length - 1; i++) {
            (address input, address output) = (path[i], path[i + 1]);
            (address token0, ) = UniswapV2Library.sortTokens(input, output);
            uint256 amountOut = amounts[i + 1];
            (uint256 amount0Out, uint256 amount1Out) = input == token0
                ? (uint256(0), amountOut)
                : (amountOut, uint256(0));
            address to = i < path.length - 2 ? UniswapV2Library.pairFor(factory, output, path[i + 2], pairCodeHash) : _to;
            IUniswapV2Pair(UniswapV2Library.pairFor(factory, input, output, pairCodeHash)).swap(
                amount0Out,
                amount1Out,
                to,
                new bytes(0)
            );
        }
    }

}