const hre = require("hardhat");

async function main() {
  const [deployer] = await hre.ethers.getSigners();
  console.log("Deploying contracts with the account:", deployer.address);

  // 1. Deploy Mock Tokens
  // We mint 1 million of each to the deployer for initial liquidity
  const initialSupply = hre.ethers.parseEther("1000000"); 
  
  const Token = await hre.ethers.getContractFactory("MockERC20");
  
  console.log("Deploying TokenA...");
  const tokenA = await Token.deploy("Token A", "TKA", initialSupply);
  await tokenA.waitForDeployment();
  const tokenAAddress = await tokenA.getAddress();
  console.log("TokenA deployed to:", tokenAAddress);

  console.log("Deploying TokenB...");
  const tokenB = await Token.deploy("Token B", "TKB", initialSupply);
  await tokenB.waitForDeployment();
  const tokenBAddress = await tokenB.getAddress();
  console.log("TokenB deployed to:", tokenBAddress);

  // 2. Deploy the DEX
  console.log("Deploying DEX...");
  const DEX = await hre.ethers.getContractFactory("DEX");
  const dex = await DEX.deploy(tokenAAddress, tokenBAddress);
  await dex.waitForDeployment();
  const dexAddress = await dex.getAddress();
  console.log("DEX deployed to:", dexAddress);

  // 3. Initial Setup: Add Liquidity
  // To make the DEX usable immediately, let's add 100 TKA and 100 TKB
  console.log("Setting up initial liquidity...");
  const amountA = hre.ethers.parseEther("100");
  const amountB = hre.ethers.parseEther("100");

  await tokenA.approve(dexAddress, amountA);
  await tokenB.approve(dexAddress, amountB);
  await dex.addLiquidity(amountA, amountB);

  console.log("Liquidity added! DEX is ready for swapping.");
  
  // Summary for your records
  console.log("-----------------------------------------");
  console.log("Deployment Summary:");
  console.log("Token A:", tokenAAddress);
  console.log("Token B:", tokenBAddress);
  console.log("DEX:    ", dexAddress);
  console.log("-----------------------------------------");
}

main()
  .then(() => process.exit(0))
  .catch((error) => {
    console.error(error);
    process.exit(1);
  });