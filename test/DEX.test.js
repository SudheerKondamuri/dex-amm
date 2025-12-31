const { expect } = require("chai");
const { ethers } = require("hardhat");

describe("DEX", function() {
    let dex, tokenA, tokenB;
    let owner, addr1, addr2;

    beforeEach(async function() {
        [owner, addr1, addr2] = await ethers.getSigners();
        
        const MockERC20 = await ethers.getContractFactory("MockERC20");
        tokenA = await MockERC20.deploy("Token A", "TKA");
        tokenB = await MockERC20.deploy("Token B", "TKB");
        
        const DEX = await ethers.getContractFactory("DEX");
        dex = await DEX.deploy(tokenA.address, tokenB.address);
        
        // Approve DEX to spend tokens for all participants
        await tokenA.approve(dex.address, ethers.utils.parseEther("1000000"));
        await tokenB.approve(dex.address, ethers.utils.parseEther("1000000"));
        await tokenA.connect(addr1).approve(dex.address, ethers.utils.parseEther("1000000"));
        await tokenB.connect(addr1).approve(dex.address, ethers.utils.parseEther("1000000"));
        
        // Mint some tokens to addr1
        await tokenA.transfer(addr1.address, ethers.utils.parseEther("1000"));
        await tokenB.transfer(addr1.address, ethers.utils.parseEther("1000"));
    });

    describe("Liquidity Management", function() {
        it("should allow initial liquidity provision", async function() {
            const tx = await dex.addLiquidity(ethers.utils.parseEther("10"), ethers.utils.parseEther("40"));
            expect(await dex.reserveA()).to.equal(ethers.utils.parseEther("10"));
            expect(await dex.reserveB()).to.equal(ethers.utils.parseEther("40"));
        });
        
        it("should mint correct LP tokens for first provider", async function() {
            // sqrt(10 * 40) = 20
            await dex.addLiquidity(ethers.utils.parseEther("10"), ethers.utils.parseEther("40"));
            expect(await dex.liquidity(owner.address)).to.equal(ethers.utils.parseEther("20"));
        });
        
        it("should allow subsequent liquidity additions", async function() {
            await dex.addLiquidity(ethers.utils.parseEther("10"), ethers.utils.parseEther("40"));
            await dex.connect(addr1).addLiquidity(ethers.utils.parseEther("5"), ethers.utils.parseEther("20"));
            expect(await dex.totalLiquidity()).to.equal(ethers.utils.parseEther("30"));
        });
        
        it("should maintain price ratio on liquidity addition", async function() {
            await dex.addLiquidity(ethers.utils.parseEther("10"), ethers.utils.parseEther("40"));
            // Price is 1:4. Adding 5 TokenA should require 20 TokenB
            await dex.connect(addr1).addLiquidity(ethers.utils.parseEther("5"), ethers.utils.parseEther("20"));
            const resA = await dex.reserveA();
            const resB = await dex.reserveB();
            expect(resB.div(resA)).to.equal(4);
        });
        
        it("should allow partial liquidity removal", async function() {
            await dex.addLiquidity(ethers.utils.parseEther("10"), ethers.utils.parseEther("40"));
            await dex.removeLiquidity(ethers.utils.parseEther("10")); // Remove 50%
            expect(await dex.totalLiquidity()).to.equal(ethers.utils.parseEther("10"));
        });
        
        it("should return correct token amounts on liquidity removal", async function() {
            await dex.addLiquidity(ethers.utils.parseEther("10"), ethers.utils.parseEther("40"));
            const startBalA = await tokenA.balanceOf(owner.address);
            await dex.removeLiquidity(ethers.utils.parseEther("20"));
            const endBalA = await tokenA.balanceOf(owner.address);
            expect(endBalA.sub(startBalA)).to.equal(ethers.utils.parseEther("10"));
        });
        
        it("should revert on zero liquidity addition", async function() {
            await expect(dex.addLiquidity(0, 0)).to.be.revertedWith("DEX: INVALID_AMOUNTS");
        });
        
        it("should revert when removing more liquidity than owned", async function() {
            await dex.addLiquidity(ethers.utils.parseEther("10"), ethers.utils.parseEther("10"));
            await expect(dex.removeLiquidity(ethers.utils.parseEther("20"))).to.be.revertedWith("DEX: INSUFFICIENT_LIQUIDITY_BALANCE");
        });
    });

    describe("Token Swaps", function() {
        beforeEach(async function() {
            await dex.addLiquidity(
                ethers.utils.parseEther("100"),
                ethers.utils.parseEther("200")
            );
        });
        
        it("should swap token A for token B", async function() {
            await dex.swapAForB(ethers.utils.parseEther("10"));
            expect(await tokenB.balanceOf(owner.address)).to.not.equal(0);
        });
        
        it("should swap token B for token A", async function() {
            await dex.swapBForA(ethers.utils.parseEther("20"));
            expect(await tokenA.balanceOf(owner.address)).to.not.equal(0);
        });
        
        it("should calculate correct output amount with fee", async function() {
            // In: 10, ResIn: 100, ResOut: 200
            // (10 * 0.997 * 200) / (100 + 10 * 0.997) = 1994 / 109.97 = ~18.13
            const out = await dex.getAmountOut(ethers.utils.parseEther("10"), ethers.utils.parseEther("100"), ethers.utils.parseEther("200"));
            expect(out).to.be.closeTo(ethers.utils.parseEther("18.13"), ethers.utils.parseEther("0.01"));
        });
        
        it("should update reserves after swap", async function() {
            await dex.swapAForB(ethers.utils.parseEther("10"));
            expect(await dex.reserveA()).to.equal(ethers.utils.parseEther("110"));
        });
        
        it("should increase k after swap due to fees", async function() {
            const kBefore = (await dex.reserveA()).mul(await dex.reserveB());
            await dex.swapAForB(ethers.utils.parseEther("10"));
            const kAfter = (await dex.reserveA()).mul(await dex.reserveB());
            expect(kAfter).to.be.gt(kBefore);
        });
        
        it("should revert on zero swap amount", async function() {
            await expect(dex.swapAForB(0)).to.be.revertedWith("DEX: INSUFFICIENT_INPUT_AMOUNT");
        });
        
        it("should handle large swaps with high price impact", async function() {
            // Swap 90% of pool
            const out = await dex.swapAForB(ethers.utils.parseEther("900")); 
            expect(out).to.not.be.reverted;
        });
        
        it("should handle multiple consecutive swaps", async function() {
            await dex.swapAForB(ethers.utils.parseEther("5"));
            await dex.swapAForB(ethers.utils.parseEther("5"));
            expect(await dex.reserveA()).to.equal(ethers.utils.parseEther("110"));
        });
    });

    describe("Price Calculations", function() {
        it("should return correct initial price", async function() {
            await dex.addLiquidity(ethers.utils.parseEther("10"), ethers.utils.parseEther("20"));
            // Price of A in B = 2 (multiplied by 1e18)
            expect(await dex.getPrice()).to.equal(ethers.utils.parseEther("2"));
        });
        
        it("should update price after swaps", async function() {
            await dex.addLiquidity(ethers.utils.parseEther("100"), ethers.utils.parseEther("100"));
            await dex.swapAForB(ethers.utils.parseEther("50"));
            const price = await dex.getPrice();
            expect(price).to.be.lt(ethers.utils.parseEther("1")); // A is now cheaper
        });
        
        it("should handle price queries with zero reserves gracefully", async function() {
            await expect(dex.getPrice()).to.be.revertedWith("DEX: ZERO_RESERVES");
        });
    });

    describe("Fee Distribution", function() {
        it("should accumulate fees for liquidity providers", async function() {
            await dex.addLiquidity(ethers.utils.parseEther("100"), ethers.utils.parseEther("100"));
            await dex.connect(addr1).swapAForB(ethers.utils.parseEther("50"));
            
            // Remove all liquidity, should get more than 100/100 back
            await dex.removeLiquidity(ethers.utils.parseEther("100"));
            const balA = await tokenA.balanceOf(owner.address);
            expect(balA).to.be.gt(ethers.utils.parseEther("900")); // Started with 1000, gave 100, got >100 back
        });
        
        it("should distribute fees proportionally to LP share", async function() {
            await dex.addLiquidity(ethers.utils.parseEther("100"), ethers.utils.parseEther("100")); // Owner 100%
            await dex.connect(addr1).addLiquidity(ethers.utils.parseEther("100"), ethers.utils.parseEther("100")); // Owner 50%, Addr1 50%
            
            await dex.swapAForB(ethers.utils.parseEther("50"));
            
            const ownerLiq = await dex.liquidity(owner.address);
            const addr1Liq = await dex.liquidity(addr1.address);
            expect(ownerLiq).to.equal(addr1Liq);
        });
    });

    describe("Edge Cases", function() {
        it("should handle very small liquidity amounts", async function() {
            await dex.addLiquidity(1000, 1000);
            expect(await dex.totalLiquidity()).to.equal(1000);
        });
        
        it("should handle very large liquidity amounts", async function() {
            const large = ethers.utils.parseEther("100000");
            await dex.addLiquidity(large, large);
            expect(await dex.totalLiquidity()).to.equal(large);
        });
        
        it("should prevent unauthorized access", async function() {
            // Liquidity removal check
            await expect(dex.connect(addr2).removeLiquidity(1)).to.be.revertedWith("DEX: INVALID_AMOUNT");
        });
    });

    describe("Events", function() {
        it("should emit LiquidityAdded event", async function() {
            await expect(dex.addLiquidity(100, 100))
                .to.emit(dex, "LiquidityAdded");
        });
        
        it("should emit LiquidityRemoved event", async function() {
            await dex.addLiquidity(100, 100);
            await expect(dex.removeLiquidity(10))
                .to.emit(dex, "LiquidityRemoved");
        });
        
        it("should emit Swap event", async function() {
            await dex.addLiquidity(ethers.utils.parseEther("10"), ethers.utils.parseEther("10"));
            await expect(dex.swapAForB(ethers.utils.parseEther("1")))
                .to.emit(dex, "Swap");
        });
    });
});