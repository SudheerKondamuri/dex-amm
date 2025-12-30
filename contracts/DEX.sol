// SPDX-License-Identifier: UNLICENSED
pragma solidity ^0.8.0;

import "@openzeppelin/contracts/token/ERC20/IERC20.sol";
import "@openzeppelin/contracts/security/ReentrancyGuard.sol";

contract DEX is ReentrancyGuard {
    address public tokenA;
    address public tokenB;
    uint256 public reserveA;
    uint256 public reserveB;
    uint256 public totalLiquidity;
    mapping(address => uint256) public liquidity;

    event LiquidityAdded(address indexed provider, uint256 amountA, uint256 amountB, uint256 liquidityMinted);
    event LiquidityRemoved(address indexed provider, uint256 amountA, uint256 amountB, uint256 liquidityBurned);
    event Swap(address indexed trader, address indexed tokenIn, address indexed tokenOut, uint256 amountIn, uint256 amountOut);

    constructor(address _tokenA, address _tokenB) {
        tokenA = _tokenA;
        tokenB = _tokenB;
    }

    /// @dev Internal helper for square root (Babylonian method)
    function _sqrt(uint y) internal pure returns (uint z) {
        if (y > 3) {
            z = y;
            uint x = y / 2 + 1;
            while (x < z) {
                z = x;
                x = (y / x + x) / 2;
            }
        } else if (y != 0) {
            z = 1;
        }
    }

    function addLiquidity(uint256 amountA, uint256 amountB) 
        external 
        nonReentrant 
        returns (uint256 liquidityMinted) 
    {
        require(amountA > 0 && amountB > 0, "DEX: INVALID_AMOUNTS");
        
        if (totalLiquidity == 0) {
            // First provider sets initial ratio
            liquidityMinted = _sqrt(amountA * amountB);
        } else {
            // Must match current pool ratio
            // Formula: (amountIn * totalLiquidity) / currentReserve
            liquidityMinted = (amountA * totalLiquidity) / reserveA;
        }

        require(liquidityMinted > 0, "DEX: INSUFFICIENT_LIQUIDITY_MINTED");

        // Transfer tokens from user to contract
        IERC20(tokenA).transferFrom(msg.sender, address(this), amountA);
        IERC20(tokenB).transferFrom(msg.sender, address(this), amountB);

        // Update state
        liquidity[msg.sender] += liquidityMinted;
        totalLiquidity += liquidityMinted;
        reserveA += amountA;
        reserveB += amountB;

        emit LiquidityAdded(msg.sender, amountA, amountB, liquidityMinted);
    }

    function removeLiquidity(uint256 liquidityAmount) 
        external 
        nonReentrant 
        returns (uint256 amountA, uint256 amountB) 
    {
        require(liquidityAmount > 0, "DEX: INVALID_AMOUNT");
        require(liquidity[msg.sender] >= liquidityAmount, "DEX: INSUFFICIENT_LIQUIDITY_BALANCE");

        // Calculate proportional shares
        amountA = (liquidityAmount * reserveA) / totalLiquidity;
        amountB = (liquidityAmount * reserveB) / totalLiquidity;

        // Update state (Check-Effects-Interactions pattern)
        liquidity[msg.sender] -= liquidityAmount;
        totalLiquidity -= liquidityAmount;
        reserveA -= amountA;
        reserveB -= amountB;

        // Send tokens back
        IERC20(tokenA).transfer(msg.sender, amountA);
        IERC20(tokenB).transfer(msg.sender, amountB);

        emit LiquidityRemoved(msg.sender, amountA, amountB, liquidityAmount);
    }

    function swapAForB(uint256 amountAIn) external returns (uint256 amountBOut) {
        require(amountAIn > 0, "DEX: INVALID_INPUT");
        amountBOut = getAmountOut(amountAIn, reserveA, reserveB);
        
        IERC20(tokenA).transferFrom(msg.sender, address(this), amountAIn);
        IERC20(tokenB).transfer(msg.sender, amountBOut);

        reserveA += amountAIn;
        reserveB -= amountBOut;

        emit Swap(msg.sender, tokenA, tokenB, amountAIn, amountBOut);
    }

    function swapBForA(uint256 amountBIn) external returns (uint256 amountAOut) {
        require(amountBIn > 0, "DEX: INVALID_INPUT");
        amountAOut = getAmountOut(amountBIn, reserveB, reserveA);

        IERC20(tokenB).transferFrom(msg.sender, address(this), amountBIn);
        IERC20(tokenA).transfer(msg.sender, amountAOut);

        reserveB += amountBIn;
        reserveA -= amountAOut;

        emit Swap(msg.sender, tokenB, tokenA, amountBIn, amountAOut);
    }

    function getPrice() external view returns (uint256 price) {
        require(reserveA > 0, "DEX: ZERO_RESERVES");
        // Returns price of A in terms of B
        return (reserveB * 1e18) / reserveA; 
    }

    function getReserves() external view returns (uint256 _reserveA, uint256 _reserveB) {
        return (reserveA, reserveB);
    }

    function getAmountOut(uint256 amountIn, uint256 reserveIn, uint256 reserveOut) 
        public 
        pure 
        returns (uint256 amountBOut) 
    {
        require(amountIn > 0, "DEX: INSUFFICIENT_INPUT_AMOUNT");
        require(reserveIn > 0 && reserveOut > 0, "DEX: INSUFFICIENT_LIQUIDITY");

        // 0.3% fee: amountInWithFee = amountIn * 997 / 1000
        uint256 amountInWithFee = amountIn * 997;
        uint256 numerator = amountInWithFee * reserveOut;
        uint256 denominator = (reserveIn * 1000) + amountInWithFee;
        amountBOut = numerator / denominator;
    }
}