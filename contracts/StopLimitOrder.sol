//SPDX-License-Identifier: Unlicense
pragma solidity 0.6.12;
pragma experimental ABIEncoderV2;

import "hardhat/console.sol";
import "@boringcrypto/boring-solidity/contracts/BoringOwnable.sol";
import "@boringcrypto/boring-solidity/contracts/BoringBatchable.sol";
import "@boringcrypto/boring-solidity/contracts/libraries/BoringMath.sol";
import "@boringcrypto/boring-solidity/contracts/libraries/BoringERC20.sol";
import "@boringcrypto/boring-solidity/contracts/libraries/BoringRebase.sol";
import "@sushiswap/bentobox-sdk/contracts/IBentoBoxV1.sol";
import "./interfaces/ILimitOrderReceiver.sol";
import "./interfaces/IOracle.sol";

// TODO: Run prettier?
contract StopLimitOrder is BoringOwnable, BoringBatchable {
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

    // See https://eips.ethereum.org/EIPS/eip-191
    string private constant EIP191_PREFIX_FOR_EIP712_STRUCTURED_DATA = "\x19\x01";
    bytes32 private constant DOMAIN_SEPARATOR_SIGNATURE_HASH = keccak256("EIP712Domain(string name,uint256 chainId,address verifyingContract)");
    bytes32 private constant ORDER_TYPEHASH = keccak256("LimitOrder(address maker,address tokenIn,address tokenOut,uint256 amountIn,uint256 amountOut,address recipient,uint256 startTime,uint256 endTime,uint256 stopPrice,address oracleAddress,bytes32 oracleData)");
    bytes32 private immutable _DOMAIN_SEPARATOR;
    uint256 public immutable deploymentChainId;
    IBentoBoxV1 private immutable bentoBox;

    uint256 public constant FEE_DIVISOR=1e6;
    
    // what should the externalOrderFee be? Can it be a constant
    uint256 public externalOrderFee;
    address public feeTo;

    mapping(ILimitOrderReceiver => bool) private isWhiteListed;
    mapping(address => mapping(bytes32 => bool)) public cancelledOrder;
    mapping(bytes32 => uint256) public orderStatus;

    mapping(IERC20 => uint256) public feesCollected;

    // what should be logged for UI purposes
    event LogFillOrder(address indexed maker, bytes32 indexed digest, ILimitOrderReceiver receiver, uint256 fillAmount);
    event LogOrderCancelled(address indexed user, bytes32 indexed digest);
    event LogSetFees(address indexed feeTo, uint256 externalOrderFee);
    event LogWhiteListReceiver(ILimitOrderReceiver indexed receiver);
    event LogFeesCollected(IERC20 indexed token, address indexed feeTo, uint256 amount);
    
    constructor(uint256 _externalOrderFee, IBentoBoxV1 _bentoBox) public {
        uint256 chainId;
        assembly {
            chainId := chainid()
        }
        deploymentChainId = chainId;
        _DOMAIN_SEPARATOR = _calculateDomainSeparator(chainId);

        externalOrderFee = _externalOrderFee;

        feeTo = msg.sender;

        bentoBox = _bentoBox;

        _bentoBox.registerProtocol();
    }

    /// @dev Calculate the DOMAIN_SEPARATOR
    function _calculateDomainSeparator(uint256 chainId) internal view returns (bytes32) {
        return keccak256(
            abi.encode(
                DOMAIN_SEPARATOR_SIGNATURE_HASH,
                keccak256("LimitOrder"),
                chainId,
                address(this)
            )
        );
    }

    /// @dev Return the DOMAIN_SEPARATOR
    function DOMAIN_SEPARATOR() internal view returns (bytes32) {
        uint256 chainId;
        assembly {chainId := chainid()}
        return chainId == deploymentChainId ? _DOMAIN_SEPARATOR : _calculateDomainSeparator(chainId);
    }

    function _getDigest(OrderArgs memory order, IERC20 tokenIn, IERC20 tokenOut) internal view returns(bytes32 digest) {
        bytes32 encoded = keccak256(
            abi.encode(
                ORDER_TYPEHASH,
                order.maker,
                tokenIn,
                tokenOut,
                order.amountIn,
                order.amountOut,
                order.recipient,
                order.startTime,
                order.endTime,
                order.stopPrice,
                order.oracleAddress,
                keccak256(order.oracleData)
            )
        );
        
        digest =
            keccak256(
                abi.encodePacked(
                    EIP191_PREFIX_FOR_EIP712_STRUCTURED_DATA,
                    DOMAIN_SEPARATOR(),
                    encoded
                )
            );
    }


    function _preFillOrder(OrderArgs memory order, IERC20 tokenIn, IERC20 tokenOut, ILimitOrderReceiver receiver) internal returns (bytes32 digest, uint256 amountToBeReturned, uint256 amountToBeFilled) {
        
        {
            if(order.oracleAddress != IOracle(0)){
                (bool success, uint256 rate) = order.oracleAddress.get(order.oracleData);
                require(success && rate > order.stopPrice, "Stop price not reached");
            }
        }

        digest = _getDigest(order, tokenIn, tokenOut);
        
        require(!cancelledOrder[order.maker][digest], "LimitOrder: Cancelled");

        require(order.startTime <= block.timestamp && block.timestamp <= order.endTime, "order-expired");

        require(ecrecover(digest, order.v, order.r, order.s) == order.maker, "Limit: not maker");


        uint256 newFilledAmount;
        {
        uint256 currentFilledAmount = orderStatus[digest];
        newFilledAmount = currentFilledAmount.add(order.amountToFill);
        amountToBeFilled = newFilledAmount <= order.amountIn ? 
                                order.amountToFill :
                                order.amountIn.sub(currentFilledAmount);
        }
        // Amount is either the right amount or short changed
        amountToBeReturned = order.amountOut.mul(amountToBeFilled) / order.amountIn;
        // Effects
        orderStatus[digest] = newFilledAmount;

        bentoBox.transfer(tokenIn, order.maker, address(receiver), bentoBox.toShare(tokenIn, amountToBeFilled, false));

        emit LogFillOrder(order.maker, digest, receiver, amountToBeFilled);
    }

    function _fillOrderInternal(
        IERC20 tokenIn, 
        IERC20 tokenOut, 
        ILimitOrderReceiver receiver, 
        bytes calldata data, 
        uint256 amountToFill, 
        uint256 amountToBeReturned, 
        uint256 fee)
    internal returns(uint256 _feesCollected){
        receiver.onLimitOrder(tokenIn, tokenOut, amountToFill, amountToBeReturned.add(fee), data);

        _feesCollected = feesCollected[tokenOut];
        require(bentoBox.balanceOf(tokenOut, address(this)) >= bentoBox.toShare(tokenOut, amountToBeReturned.add(fee), true).add(_feesCollected), "Limit: not enough");
    }

    function fillOrder(
            OrderArgs memory order,
            IERC20 tokenIn,
            IERC20 tokenOut, 
            ILimitOrderReceiver receiver, 
            bytes calldata data) 
    public {
        require(isWhiteListed[receiver], "LimitOrder: not whitelisted");
        
        (, uint256 amountToBeReturned, uint256 amountToBeFilled) = _preFillOrder(order, tokenIn, tokenOut, receiver);
        
        _fillOrderInternal(tokenIn, tokenOut, receiver, data, amountToBeFilled, amountToBeReturned, 0);

        bentoBox.transfer(tokenOut, address(this), order.recipient, bentoBox.toShare(tokenOut, amountToBeReturned, false));

    }

    function fillOrderOpen(
            OrderArgs memory order,
            IERC20 tokenIn,
            IERC20 tokenOut, 
            ILimitOrderReceiver receiver, 
            bytes calldata data) 
    public {
        (, uint256 amountToBeReturned, uint256 amountToBeFilled) = _preFillOrder(order, tokenIn, tokenOut, receiver);
        uint256 fee = amountToBeReturned.mul(externalOrderFee) / FEE_DIVISOR;

        uint256 _feesCollected = _fillOrderInternal(tokenIn, tokenOut, receiver, data, amountToBeFilled, amountToBeReturned, fee);

        feesCollected[tokenOut] = _feesCollected.add(bentoBox.toShare(tokenOut, fee, true));

        bentoBox.transfer(tokenOut, address(this), order.recipient, bentoBox.toShare(tokenOut, amountToBeReturned, false));
    }

    function batchFillOrder(
            OrderArgs[] memory order,
            IERC20 tokenIn,
            IERC20 tokenOut,
            ILimitOrderReceiver receiver, 
            bytes calldata data) 
    external {
        require(isWhiteListed[receiver], "LimitOrder: not whitelisted");

        uint256[] memory amountToBeReturned = new uint256[](order.length);
        uint256 totalAmountToBeFilled;
        uint256 totalAmountToBeReturned;

        for(uint256 i = 0; i < order.length; i++) {
            uint256 amountToBeFilled;
            (, amountToBeReturned[i], amountToBeFilled) = _preFillOrder(order[i], tokenIn, tokenOut, receiver);

            totalAmountToBeFilled = totalAmountToBeFilled.add(amountToBeFilled);
            totalAmountToBeReturned = totalAmountToBeReturned.add(amountToBeReturned[i]);
        }
        _fillOrderInternal(tokenIn, tokenOut, receiver, data, totalAmountToBeFilled, totalAmountToBeReturned, 0);

        Rebase memory bentoBoxTotals = bentoBox.totals(tokenOut);

        for(uint256 i = 0; i < order.length; i++) {
            bentoBox.transfer(tokenOut, address(this), order[i].recipient, bentoBoxTotals.toBase(amountToBeReturned[i], false));
        }
    }

    function batchFillOrderOpen(
            OrderArgs[] memory order,
            IERC20 tokenIn,
            IERC20 tokenOut,
            ILimitOrderReceiver receiver, 
            bytes calldata data) 
    external {
        uint256[] memory amountToBeReturned = new uint256[](order.length);
        uint256 totalAmountToBeFilled;
        uint256 totalAmountToBeReturned;

        for(uint256 i = 0; i < order.length; i++) {
            uint256 amountToBeFilled;
            (, amountToBeReturned[i], amountToBeFilled) = _preFillOrder(order[i], tokenIn, tokenOut, receiver);

            totalAmountToBeFilled = totalAmountToBeFilled.add(amountToBeFilled);
            totalAmountToBeReturned = totalAmountToBeReturned.add(amountToBeReturned[i]);
        }
        
        uint256 totalFee = totalAmountToBeReturned.mul(externalOrderFee) / FEE_DIVISOR;

        {
            
        uint256 _feesCollected = _fillOrderInternal(tokenIn, tokenOut, receiver, data, totalAmountToBeFilled, totalAmountToBeReturned, totalFee);
        feesCollected[tokenOut] = _feesCollected.add(bentoBox.toShare(tokenOut, totalFee, true));

        }

        Rebase memory bentoBoxTotals = bentoBox.totals(tokenOut);

        for(uint256 i = 0; i < order.length; i++) {
            bentoBox.transfer(tokenOut, address(this), order[i].recipient, bentoBoxTotals.toBase(amountToBeReturned[i], false));
        }


    }
    
    function cancelOrder(bytes32 hash) public {
        cancelledOrder[msg.sender][hash] = true;
        emit LogOrderCancelled(msg.sender, hash);
    }

    function swipeFees(IERC20 token) public {
        feesCollected[token] = 1;
        uint256 balance = bentoBox.balanceOf(token, address(this)).sub(1);
        bentoBox.transfer(token, address(this), feeTo, balance);
        emit LogFeesCollected(token, feeTo, balance);
    }

    function swipe (IERC20 token) public {
        uint256 balance = token.balanceOf(address(this));
        token.safeTransfer(feeTo, balance);
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
