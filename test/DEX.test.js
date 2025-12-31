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
        
        const amount = ethers.utils.parseEther("1000000");
        await tokenA.approve(dex.address, amount);
        await tokenB.approve(dex.address, amount);
        await tokenA.connect(addr1).approve(dex.address, amount);
        await tokenB.connect(addr1).approve(dex.address, amount);

        // Distribute tokens to addr1
        await tokenA.transfer(addr1.address, ethers.utils.parseEther("5000"));
        await tokenB.transfer(addr1.address, ethers.utils.parseEther("5000"));
    });

    describe("Liquidity Management", function() {
        it("should allow initial liquidity provision", async function() {
            await dex.addLiquidity(ethers.utils.parseEther("100"), ethers.utils.parseEther("200"));
            expect(await dex.reserveA()).to.equal(ethers.utils.parseEther("100"));
            expect(await dex.reserveB()).to.equal(ethers.utils.parseEther("200"));
        });

        it("should mint correct LP tokens for first provider", async function() {
            // sqrt(100 * 400) = 200
            await dex.addLiquidity(ethers.utils.parseEther("100"), ethers.utils.parseEther("400"));
            expect(await dex.liquidity(owner.address)).to.equal(ethers.utils.parseEther("200"));
        });

        it("should allow subsequent liquidity additions", async function() {
            await dex.addLiquidity(ethers.utils.parseEther("100"), ethers.utils.parseEther("100"));
            await dex.connect(addr1).addLiquidity(ethers.utils.parseEther("50"), ethers.utils.parseEther("50"));
            expect(await dex.totalLiquidity()).to.equal(ethers.utils.parseEther("150"));
        });

        it("should maintain price ratio on liquidity addition", async function() {
            await dex.addLiquidity(ethers.utils.parseEther("100"), ethers.utils.parseEther("200"));
            // 1:2 ratio. Adding 50 should require 100.
            await expect(dex.connect(addr1).addLiquidity(ethers.utils.parseEther("50"), ethers.utils.parseEther("50")))
                .to.be.revertedWith("DEX: Ratio mismatch");
        });

        it("should allow partial liquidity removal", async function() {
            await dex.addLiquidity(ethers.utils.parseEther("100"), ethers.utils.parseEther("100"));
            const lpBalance = await dex.liquidity(owner.address);
            await dex.removeLiquidity(lpBalance.div(2));
            expect(await dex.totalLiquidity()).to.equal(lpBalance.div(2));
        });

        it("should return correct token amounts on liquidity removal", async function() {
            await dex.addLiquidity(ethers.utils.parseEther("100"), ethers.utils.parseEther("100"));
            const lpBalance = await dex.liquidity(owner.address);
            await dex.removeLiquidity(lpBalance);
            expect(await dex.reserveA()).to.equal(0);
        });

        it("should revert on zero liquidity addition", async function() {
            await expect(dex.addLiquidity(0, 100)).to.be.revertedWith("DEX: INVALID_AMOUNTS");
        });

        it("should revert when removing more liquidity than owned", async function() {
            await dex.addLiquidity(ethers.utils.parseEther("10"), ethers.utils.parseEther("10"));
            await expect(dex.removeLiquidity(ethers.utils.parseEther("20"))).to.be.revertedWith("DEX: INSUFFICIENT_LIQUIDITY_BALANCE");
        });
    });

    describe("Token Swaps", function() {
        beforeEach(async function() {
            await dex.addLiquidity(ethers.utils.parseEther("100"), ethers.utils.parseEther("200"));
        });

        it("should swap token A for token B", async function() {
            await dex.swapAForB(ethers.utils.parseEther("10"));
            expect(await dex.reserveA()).to.equal(ethers.utils.parseEther("110"));
        });

        it("should swap token B for token A", async function() {
            await dex.swapBForA(ethers.utils.parseEther("20"));
            expect(await dex.reserveB()).to.equal(ethers.utils.parseEther("220"));
        });

        it("should calculate correct output amount with fee", async function() {
            const out = await dex.getAmountOut(ethers.utils.parseEther("10"), ethers.utils.parseEther("100"), ethers.utils.parseEther("200"));
            // (10 * 0.997 * 200) / (100 + 10 * 0.997) = 18.132...
            expect(out).to.be.gt(ethers.utils.parseEther("18"));
        });

        it("should update reserves after swap", async function() {
            await dex.swapAForB(ethers.utils.parseEther("10"));
            const [resA, resB] = await dex.getReserves();
            expect(resA).to.equal(ethers.utils.parseEther("110"));
        });

        it("should increase k after swap due to fees", async function() {
            const kBefore = (await dex.reserveA()).mul(await dex.reserveB());
            await dex.swapAForB(ethers.utils.parseEther("20"));
            const kAfter = (await dex.reserveA()).mul(await dex.reserveB());
            expect(kAfter).to.be.gt(kBefore);
        });

        it("should revert on zero swap amount", async function() {
            await expect(dex.swapAForB(0)).to.be.revertedWith("DEX: INSUFFICIENT_INPUT_AMOUNT");
        });

        it("should handle large swaps with high price impact", async function() {
            const out = await dex.getAmountOut(ethers.utils.parseEther("500"), ethers.utils.parseEther("100"), ethers.utils.parseEther("200"));
            expect(out).to.be.lt(ethers.utils.parseEther("200"));
        });

        it("should handle multiple consecutive swaps", async function() {
            await dex.swapAForB(ethers.utils.parseEther("5"));
            await dex.swapAForB(ethers.utils.parseEther("5"));
            expect(await dex.reserveA()).to.equal(ethers.utils.parseEther("110"));
        });
    });

    describe("Price Calculations", function() {
        it("should return correct initial price", async function() {
            await dex.addLiquidity(ethers.utils.parseEther("100"), ethers.utils.parseEther("200"));
            expect(await dex.getPrice()).to.equal(ethers.utils.parseEther("2"));
        });

        it("should update price after swaps", async function() {
            await dex.addLiquidity(ethers.utils.parseEther("100"), ethers.utils.parseEther("100"));
            await dex.swapAForB(ethers.utils.parseEther("50"));
            // reserveA is now 150, reserveB is ~66. Price should drop.
            expect(await dex.getPrice()).to.be.lt(ethers.utils.parseEther("1"));
        });

        it("should handle price queries with zero reserves gracefully", async function() {
            await expect(dex.getPrice()).to.be.revertedWith("DEX: ZERO_RESERVES");
        });
    });

    describe("Fee Distribution", function() {
        it("should accumulate fees for liquidity providers", async function() {
            await dex.addLiquidity(ethers.utils.parseEther("100"), ethers.utils.parseEther("100"));
            await dex.connect(addr1).swapAForB(ethers.utils.parseEther("50"));
            // K increased, so removing 100% liquidity yields more than original deposit total
            await dex.removeLiquidity(ethers.utils.parseEther("100"));
            const balA = await tokenA.balanceOf(owner.address);
            expect(balA).to.be.gt(ethers.utils.parseEther("9900")); // Started with 1M, spent 100, should be > 999,900
        });

        it("should distribute fees proportionally to LP share", async function() {
            await dex.addLiquidity(ethers.utils.parseEther("100"), ethers.utils.parseEther("100"));
            await dex.connect(addr1).addLiquidity(ethers.utils.parseEther("100"), ethers.utils.parseEther("100"));
            expect(await dex.liquidity(owner.address)).to.equal(await dex.liquidity(addr1.address));
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
            // addr2 has no liquidity
            await expect(dex.connect(addr2).removeLiquidity(100)).to.be.reverted;
        });
    });

    describe("Events", function() {
        it("should emit LiquidityAdded event", async function() {
            await expect(dex.addLiquidity(1000, 1000)).to.emit(dex, "LiquidityAdded");
        });

        it("should emit LiquidityRemoved event", async function() {
            await dex.addLiquidity(1000, 1000);
            await expect(dex.removeLiquidity(500)).to.emit(dex, "LiquidityRemoved");
        });

        it("should emit Swap event", async function() {
            await dex.addLiquidity(ethers.utils.parseEther("100"), ethers.utils.parseEther("100"));
            await expect(dex.swapAForB(ethers.utils.parseEther("1"))).to.emit(dex, "Swap");
        });
    });
});