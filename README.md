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

# Install dependencies
```bash
sudo apt update -y
sudo apt install -y build-essential curl git
```

# Install Node.js 20 via NVM
```bash
curl -o- https://raw.githubusercontent.com/nvm-sh/nvm/v0.39.7/install.sh | bash
export NVM_DIR="$HOME/.nvm"
. "$NVM_DIR/nvm.sh"
nvm install 20
nvm alias default 20
```

# Prepare the project directory
```bash
mkdir -p $HOME/intuition-bot && cd $HOME/intuition-bot
npm init -y
npm pkg set type=module
```

# Install dependencies (ethers v5 required)
```bash
npm install ethers@5 solc chalk cli-table3 axios
```

⚠️ Using ethers@5 is critical. v6 will break JsonRpcProvider.

# Add your testnet private key (test funds only!)
```bash
echo "0xYOUR_TESTNET_PRIVATE_KEY" > pk.txt
```

# Download the bot file
```bash
wget https://raw.githubusercontent.com/WwCfOfficial/Intuition-V2-Bot/main/IntuitionV2.js
```

# Run the bot
```bash
node IntuitionV2.js
```

# Additionally Follow 
# Run it (plain) or inside screen

Plain run
```bash
cd $HOME/intuition-bot
node IntuitionV2.js
```

Run inside screen (so it keeps running after you disconnect)
```bash
screen -S intuition
cd $HOME/intuition-bot
node IntuitionV2.js
```
# Detach: press Ctrl+A then D
# Reattach later:
```bash
screen -r intuition
```
# Kill the session (from inside): Ctrl+C to stop the bot, then `exit`

# You should see:

>=== Intuition Testnet Bot Menu ===<
  
  01 > Belridge Trust - Base Sepolia  <
  02 > Bridge L2 -> L1                <
  ...
Select an option (1-12):

The solc warning (node:…) Invalid asm.js is normal and can be ignored.

# Before Run Bot Follow That 
# Go to the Intuition Testnet Portal

## Open your browser and visit:
https://portal.intuition.systems/

Connect your testnet wallet (MetaMask or any wallet you use) to the portal.

## Request testnet funds from the faucet

Faucet URL: https://testnet.hub.intuition.systems/

Enter your wallet address (the same one in pk.txt)

Click “Request Testnet Funds” or similar button

You will receive small amounts of tTRUST or testnet ETH to cover transactions.

## Check your wallet balance

Make sure your wallet shows enough tTRUST to cover the bot’s transactions.

You can also check in the bot menu:

Option 09 > Show Balance

## Run your bot again

Once your wallet has funds, select 11 > Run All Transactions

The bot will now process without the “Insufficient balance” error.

💡 Tip: Always use testnet keys here, never your mainnet wallet. You can request more funds from the faucet if needed.