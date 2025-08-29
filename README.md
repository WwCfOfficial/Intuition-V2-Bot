# 🤖 Intuition V2 Testnet Automation Bot

An automation script for the **Intuition Testnet (chain 13579)** that helps you interact with the L2 and Base Sepolia testnet.

This bot provides a CLI menu to:
- Bridge funds (Belridge Trust → Base Sepolia, L2 → L1)
- Send random native testnet transfers
- Deploy and auto-send ERC-20 tokens
- Deploy and auto-send ERC-721 NFTs
- Show balances and stats
- Run all supported actions automatically

⚠️ **For Testnet Purposes Only.** Never use real/private keys with mainnet funds.  
See [DISCLAIMER.md](./DISCLAIMER.md) for details.

---

## ✨ Features
- **Belridge Withdraw:** Move testnet ETH (tTRUST) to Base Sepolia  
- **Bridge L2 → L1:** Withdraw funds to a specified address  
- **Random Transfers:** Send small amounts to random wallets  
- **ERC-20 Tools:** Deploy test ERC-20 and auto-distribute  
- **ERC-721 Tools:** Deploy test NFT collection and auto-distribute  
- **Stats & Balance:** Track funds, tokens, and deployed contracts  

---

## ⚡ Quick Start (Ubuntu VPS)

```bash
# Install dependencies
sudo apt update -y
sudo apt install -y build-essential curl git

# Install Node.js 20 via NVM
curl -o- https://raw.githubusercontent.com/nvm-sh/nvm/v0.39.7/install.sh | bash
export NVM_DIR="$HOME/.nvm"
. "$NVM_DIR/nvm.sh"
nvm install 20
nvm alias default 20

# Get project
mkdir -p $HOME/intuition-bot && cd $HOME/intuition-bot
npm init -y
npm pkg set type=module
npm i ethers solc chalk cli-table3 axios

# Add your testnet private key (test funds only!)
echo "0xYOUR_TESTNET_PRIVATE_KEY" > pk.txt

# Put the bot file
wget https://raw.githubusercontent.com/YOUR_GITHUB_USERNAME/intuition-bot/main/IntuitionV2.js

# Run it
node IntuitionV2.js
