//SPDX-License-Identifier: Unlicense
pragma solidity 0.6.12;
pragma experimental ABIEncoderV2;


import "hardhat/console.sol";
import "@boringcrypto/boring-solidity/contracts/BoringOwnable.sol";
import "@boringcrypto/boring-solidity/contracts/BoringBatchable.sol";
import "@boringcrypto/boring-solidity/contracts/libraries/BoringMath.sol";
import "@boringcrypto/boring-solidity/contracts/libraries/BoringERC20.sol";
import "./interfaces/ILimitOrderReceiver.sol";

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

    function fillOrder(
            OrderArgs memory order,
            IERC20 tokenIn,
            IERC20 tokenOut, 
            ILimitOrderReceiver receiver, 
            bytes calldata data) 
    public {

        bytes32 digest =
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

        address recoveredAddress = ecrecover(digest, order.v, order.r, order.s);
        require(recoveredAddress == order.maker && recoveredAddress != address(0), "Limit: not maker");

        // Amount is either the right amount or short changed
        uint256 amountToBeReturned = order.amountOut.mul(order.amountToBeFilled) / order.amountIn;

        uint256 newFilledAmount = orderStatus[digest].add(order.amountToBeFilled);
        require(newFilledAmount <= order.amountIn, "Order: don't go over 100%");

        // Effects
        orderStatus[digest] = newFilledAmount;

        tokenIn.safeTransferFrom(recoveredAddress, address(receiver), order.amountToBeFilled);

        receiver.onLimitOrder(tokenIn, tokenOut, order.amountToBeFilled, amountToBeReturned, data);

        uint256 _feesCollected = feesCollected[tokenOut];
        require(tokenOut.balanceOf(address(this)) >= amountToBeReturned.add(_feesCollected), "Limit: not enough");

        if(isWhiteListed[receiver]) {
            tokenOut.safeTransfer(order.recipient, amountToBeReturned);
        } else {
            uint256 fee = amountToBeReturned.mul(externalOrderFee) / FEE_DIVISOR;
            feesCollected[tokenOut] = _feesCollected.add(fee);
            tokenOut.safeTransfer(order.recipient, amountToBeReturned.sub(fee));
        }
        
        emit LogFillOrder(digest, receiver, order.fillShare);

    }
    
    struct TotalAmounts {
        uint256 amountToBeFilled;
        uint256 amountToBeReturned;
    }

    struct BatchFillOrderArgs {
        IERC20 tokenIn;
        IERC20 tokenOut; 
        ILimitOrderReceiver receiver;
    }

    function batchFillOrder(
            OrderArgs[] memory order,
            BatchFillOrderArgs memory args,
            bytes calldata data) 
    external {
        uint256[] memory amountToBeReturned = new uint256[](order.length);
        TotalAmounts memory totals;

        for(uint256 i = 0; 0 < order.length; i++) {

            bytes32 digest =
            keccak256(
                abi.encodePacked(
                    EIP191_PREFIX_FOR_EIP712_STRUCTURED_DATA,
                    DOMAIN_SEPARATOR,
                    keccak256(
                        abi.encode(
                            ORDER_TYPEHASH,
                            order[i].maker,
                            args.tokenIn,
                            args.tokenOut,
                            order[i].amountIn,
                            order[i].amountOut,
                            order[i].recipient
                        )
                    )
                )
            );
        
            require(!cancelledOrder[order[i].maker][digest], "LimitOrder: Cancelled");

            address recoveredAddress = ecrecover(digest, order[i].v, order[i].r, order[i].s);
            require(recoveredAddress == order[i].maker && recoveredAddress != address(0), "Limit: not maker");

            totals.amountToBeFilled = totals.amountToBeFilled.add(order[i].amountToBeFilled);
            
            amountToBeReturned[i] = order[i].amountOut.mul(order[i].amountToBeFilled) / order[i].amountIn;
            totals.amountToBeReturned = totals.amountToBeReturned.add(amountToBeReturned[i]);

            uint256 newFilledAmount = orderStatus[digest].add(order[i].amountToBeFilled);
            require(newFilledAmount <= order[i].amountIn, "Order: don't go over 100%");

            // Effects
            orderStatus[digest] = newFilledAmount;

            args.tokenIn.safeTransferFrom(recoveredAddress, address(args.receiver), order[i].amountToBeFilled);

            emit LogFillOrder(digest, args.receiver, order[i].fillShare);
        }
        
        args.receiver.onLimitOrder(args.tokenIn, args.tokenOut, totals.amountToBeFilled, totals.amountToBeReturned, data);

        uint256 _feesCollected = feesCollected[args.tokenOut];
        require(args.tokenOut.balanceOf(address(this)) >= totals.amountToBeReturned.add(_feesCollected), "Limit: not enough");

        if(isWhiteListed[args.receiver]) {
            for(uint256 i = 0; 0 < order.length; i++) {
                args.tokenOut.safeTransfer(order[i].recipient, amountToBeReturned[i]);
            }   
        } else {
            for(uint256 i = 0; 0 < order.length; i++) {
                uint256 fee = amountToBeReturned[i].mul(externalOrderFee) / FEE_DIVISOR;
                args.tokenOut.safeTransfer(order[i].recipient, amountToBeReturned[i].sub(fee));
            }
            uint256 totalFee = totals.amountToBeReturned.mul(externalOrderFee) / FEE_DIVISOR;
            feesCollected[args.tokenOut] = _feesCollected.add(totalFee);
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
