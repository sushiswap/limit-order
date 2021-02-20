//SPDX-License-Identifier: Unlicense
pragma solidity 0.6.12;
pragma experimental ABIEncoderV2;

import "hardhat/console.sol";
import "@boringcrypto/boring-solidity/contracts/BoringOwnable.sol";
import "@boringcrypto/boring-solidity/contracts/BoringBatchable.sol";
import "@boringcrypto/boring-solidity/contracts/libraries/BoringMath.sol";
import "@boringcrypto/boring-solidity/contracts/libraries/BoringERC20.sol";
import "./interfaces/ILimitOrderReceiver.sol";

// TODO: Run prettier?
contract LimitOrder is BoringOwnable, BoringBatchable {
    using BoringMath for uint256;
    using BoringERC20 for IERC20;

    struct OrderArgs {
        address maker; 
        uint256 amountIn; 
        uint256 amountOut; 
        address recipient; 
        uint8 v; 
        bytes32 r;
        bytes32 s; 
        uint256 amountToFill;
    }

    // See https://eips.ethereum.org/EIPS/eip-191
    string private constant EIP191_PREFIX_FOR_EIP712_STRUCTURED_DATA = "\x19\x01";
    bytes32 private constant DOMAIN_SEPARATOR_SIGNATURE_HASH = keccak256("EIP712Domain(string name,uint256 chainId,address verifyingContract)");
    bytes32 private constant ORDER_TYPEHASH = keccak256("LimitOrder(address maker,address tokenIn,address tokenOut,uint256 amountIn,uint256 amountOut,address recipient)");
    bytes32 private immutable DOMAIN_SEPARATOR;

    uint256 public constant FEE_DIVISOR=1e6;
    uint256 public externalOrderFee;
    address public feeTo;

    mapping(ILimitOrderReceiver => bool) private isWhiteListed;
    mapping(address => mapping(bytes32 => bool)) public cancelledOrder;
    mapping(bytes32 => uint256) public orderStatus;

    mapping(IERC20 => uint256) public feesCollected;

    // TODO: This event doesn't tell you anything about the order. Should this include the order details?
    event LogFillOrder(bytes32 indexed digest, ILimitOrderReceiver receiver, uint256 fillShare);
    event LogOrderCancelled(address indexed user, bytes32 indexed digest);
    event LogSetFees(address indexed feeTo, uint256 externalOrderFee);
    event LogWhiteListReceiver(ILimitOrderReceiver indexed receiver);
    event LogFeesCollected(IERC20 indexed token, address indexed feeTo, uint256 amount);
    
    constructor(uint256 _externalOrderFee) public {
        uint256 chainId;
        assembly {
            chainId := chainid()
        }
        DOMAIN_SEPARATOR = keccak256(
            abi.encode(
                DOMAIN_SEPARATOR_SIGNATURE_HASH,
                keccak256("LimitOrder"),
                chainId,
                address(this)
            )
        );

        externalOrderFee = _externalOrderFee;
    }

    function _preFillOrder(OrderArgs memory order, IERC20 tokenIn, IERC20 tokenOut, ILimitOrderReceiver receiver) internal view returns (bytes32 digest, uint256 amountToBeReturned) {
        digest =
            keccak256(
                abi.encodePacked(
                    EIP191_PREFIX_FOR_EIP712_STRUCTURED_DATA,
                    DOMAIN_SEPARATOR,
                    keccak256(
                        abi.encode(
                            ORDER_TYPEHASH,
                            order.maker,
                            tokenIn,
                            tokenOut,
                            order.amountIn,
                            order.amountOut,
                            order.recipient
                        )
                    )
                )
            );
        
        require(!cancelledOrder[order.maker][digest], "LimitOrder: Cancelled");

        require(ecrecover(digest, order.v, order.r, order.s) == order.maker, "Limit: not maker");
        
        // Amount is either the right amount or short changed
        amountToBeReturned = order.amountOut.mul(order.amountToFill) / order.amountIn;

        uint256 newFilledAmount = orderStatus[digest].add(order.amountToFill);
        require(newFilledAmount <= order.amountIn, "Order: don't go over 100%");

        // Effects
        orderStatus[digest] = newFilledAmount;

        tokenIn.safeTransferFrom(order.maker, address(receiver), order.amountToFill);
        emit LogFillOrder(digest, receiver, order.amountToFill);
    }

    function _fillOrderInternal(IERC20 tokenIn, IERC20 tokenOut, ILimitOrderReceiver receiver, bytes calldata data, uint256 amountToFill, uint256 amountToBeReturned) internal {
        receiver.onLimitOrder(tokenIn, tokenOut, order.amountToFill, amountToBeReturned, data);

        uint256 _feesCollected = feesCollected[tokenOut];
        require(tokenOut.balanceOf(address(this)) >= amountToBeReturned.add(_feesCollected), "Limit: not enough");
    }

    function fillOrder(
            OrderArgs memory order,
            IERC20 tokenIn,
            IERC20 tokenOut, 
            ILimitOrderReceiver receiver, 
            bytes calldata data) 
    public {
        require(isWhiteListed[receiver], "LimitOrder: not whitelisted");
        
        (bytes32 digest, uint256 amountToBeReturned) = _preFillOrder(order, tokenIn, tokenOut, receiver);
        
        _fillOrderInternal(tokenIn, tokenOut, receiver, data, amountToFill, amountToBeReturned);

        tokenOut.safeTransfer(order.recipient, amountToBeReturned);
    }

    function fillOrderOpen(
            OrderArgs memory order,
            IERC20 tokenIn,
            IERC20 tokenOut, 
            ILimitOrderReceiver receiver, 
            bytes calldata data) 
    public {
        (bytes32 digest, uint256 amountToBeReturned) = _preFillOrder(order, tokenIn, tokenOut, receiver);
        _fillOrderInternal(tokenIn, tokenOut, receiver, data, amountToFill, amountToBeReturned);

        uint256 fee = amountToBeReturned.mul(externalOrderFee) / FEE_DIVISOR;
        feesCollected[tokenOut] = _feesCollected.add(fee);
        // TODO: This seems wrong: taking the fee from the user... this way they get less returned depending on how the order was executed.
        // Either they always pay a fee, so the whitelisted call reduces the amountToBeReturned by the fee amount OR the fee gets added, so the order
        // executes at a higher price.
        tokenOut.safeTransfer(order.recipient, amountToBeReturned.sub(fee));
    }

    // Fix up like above, IF you like this way if doing it.    
    function batchFillOrder(
            OrderArgs[] memory order,
            IERC20 tokenIn,
            IERC20 tokenOut,
            ILimitOrderReceiver receiver, 
            bytes calldata data) 
    external {
        uint256[] memory amountToBeReturned = new uint256[](order.length);
        uint256 totalAmountToBeFilled;
        uint256 totalAmountToBeReturned;

        for(uint256 i = 0; 0 < order.length; i++) {
            bytes32 (digest, amountToBeReturned[i]) = _preFillOrder(order[i], tokenIn, tokenOut, receiver);

            totalAmountToBeFilled = totalAmountToBeFilled.add(order[i].amountToFill);
            totalAmountToBeReturned = totalAmountToBeReturned.add(amountToBeReturned[i]);
        }
        
        receiver.onLimitOrder(tokenIn, tokenOut, totalAmountToBeFilled, totalAmountToBeReturned, data);

        uint256 _feesCollected = feesCollected[tokenOut];
        require(tokenOut.balanceOf(address(this)) >= totalAmountToBeReturned.add(_feesCollected), "Limit: not enough");

        if(isWhiteListed[receiver]) {
            for(uint256 i = 0; 0 < order.length; i++) {
                tokenOut.safeTransfer(order[i].recipient, amountToBeReturned[i]);
            }   
        } else {
            for(uint256 i = 0; 0 < order.length; i++) {
                uint256 fee = amountToBeReturned[i].mul(externalOrderFee) / FEE_DIVISOR;
                tokenOut.safeTransfer(order[i].recipient, amountToBeReturned[i].sub(fee));
            }
            uint256 totalFee = totalAmountToBeReturned.mul(externalOrderFee) / FEE_DIVISOR;
            feesCollected[tokenOut] = _feesCollected.add(totalFee);
        }
    }
    
    function cancelOrder(bytes32 hash) public {
        cancelledOrder[msg.sender][hash] = true;
        emit LogOrderCancelled(msg.sender, hash);
    }

    function swipeFees (IERC20 token) public {
        feesCollected[token] = 1;
        uint256 balance = token.balanceOf(address(this)).sub(1);
        token.safeTransfer(feeTo, balance);
        emit LogFeesCollected(token, feeTo, balance);
    }

    function setFees(address _feeTo, uint256 _externalOrderFee) external onlyOwner {
        feeTo = _feeTo;
        externalOrderFee = _externalOrderFee;
        emit LogSetFees(_feeTo, _externalOrderFee);
    }

    function whiteListReceiver(ILimitOrderReceiver receiver) external onlyOwner {
        isWhiteListed[receiver] = true;
        emit LogWhiteListReceiver(receiver);
    }
}
