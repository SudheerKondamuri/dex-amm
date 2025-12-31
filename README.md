# DEX AMM Project

## Overview
This project is a simplified **Decentralized Exchange (DEX)** based on the **Automated Market Maker (AMM)** protocol. It implements a **Constant Product Market Making** strategy (`x * y = k`) to enable decentralized token swaps, liquidity provision, and fee accumulation without a centralized order book.

## Features
- Initial and subsequent liquidity provision
- Proportional liquidity removal
- Token swaps using constant product formula
- 0.3% swap fee distributed to LPs
- Integrated LP share tracking

## Architecture
- `DEX.sol`: Core AMM logic and reserve management
- `MockERC20.sol`: ERC20 token for testing
- Built with Hardhat
- Uses OpenZeppelin ReentrancyGuard

## Mathematical Implementation

### Constant Product Formula
`x * y = k`

### Fee Calculation
`amountInWithFee = (amountIn * 997) / 1000`

### LP Token Minting
- First LP: `sqrt(amountA * amountB)`
- Subsequent LPs: `(amountA * totalLiquidity) / reserveA`

## Setup Instructions

### Prerequisites
- Docker
- Docker Compose
- Git
- Node.js

### Installation

1. Clone the repository:
```bash
git clone https://github.com/SudheerKondamuri/dex-amm
cd dex-amm
```

2. Start Docker environment:
```bash
docker-compose up -d
```

3. Compile contracts:
```bash
docker-compose exec app npm run compile
```

4. Run tests:
```bash
docker-compose exec app npm test
```

5. Check coverage:
```bash
docker-compose exec app npm run coverage
```

6. Stop Docker:
```bash
docker-compose down
```

## Running Tests Locally (without Docker)
```bash
npm install
npm run compile
npm test
```

## Known Limitations
- Single trading pair per contract
- No frontend UI
- No slippage protection

## Security Considerations
- Reentrancy protection
- Internal reserve tracking
- Safe integer math

## Project Structure
```text
dex-amm/
├── contracts/
│   ├── DEX.sol
│   ├── MockERC20.sol
├── test/
│   └── DEX.test.js
├── scripts/
│   └── deploy.js
├── Dockerfile
├── docker-compose.yml
├── hardhat.config.js
├── package.json
└── README.md
```
