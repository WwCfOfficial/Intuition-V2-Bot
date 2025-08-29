import { ethers } from 'ethers';
import solc from 'solc';
import fs from 'fs';
import path from 'path';
import readline from 'readline';
import chalk from 'chalk';
import Table from 'cli-table3';
import axios from 'axios';

// Configuration embedded in main.js
const config = {
  network: {
    l2Rpc: 'https://testnet.rpc.intuition.systems/http',
    nativeSymbol: 'tTRUST',
    explorerTx: 'https://testnet.explorer.intuition.systems/tx/',
    label: 'Intuition Testnet (13579)',
    arbSys: '0x0000000000000000000000000000000000000064',
    baseSepoliaRpc: 'https://base-sepolia.rpc.dev.caldera.xyz/'
  },
  watchlist: {
    erc20: [],
    erc721: []
  },
  withdraw: {
    enabled: true,
    destination: '0x000000000000000000000000000000000000dEaD',
    amountEth: 0.0001
  },
  belridge: {
    enabled: true,
    amountEth: 0.0001,
    gasPriceGwei: 0.1,
    gasLimit: 115460
  },
  randomNative: {
    enabled: true,
    txCount: 5,
    minEth: 0.00001,
    maxEth: 0.00005,
    delaySec: 5
  },
  erc20: {
    enabled: true,
    name: 'RANDOM',
    symbol: 'RANDOM',
    decimals: 18,
    supply: 1_000_000,
    autoSend: {
      enabled: true,
      txCount: 5,
      amountPerTx: 250,
      delaySec: 5
    }
  },
  nft: {
    enabled: true,
    name: 'RANDOM',
    symbol: 'RND',
    supply: 333,
    mintChunk: 100,
    autoSend: {
      enabled: true,
      txCount: 5,
      delaySec: 5
    }
  },
  retry: {
    maxAttempts: 3,
    delaySec: 2
  }
};

const Random = {
  symbol(len = 3) {
    const ABC = 'ABCDEFGHIJKLMNOPQRSTUVWXYZ';
    return Array.from({ length: len }, () => ABC[Math.floor(Math.random() * ABC.length)]).join('');
  },
  tokenName(prefix = 'Token') {
    return `${prefix}-${this.symbol(3)}${Math.floor(100 + Math.random() * 900)}`;
  },
  nftName(prefix = 'NFT') {
    return `${prefix}-${this.symbol(3)}${Math.floor(100 + Math.random() * 900)}`;
  },
  float(min, max, digits = 8) {
    const v = Math.random() * (max - min) + min;
    return Number(v.toFixed(digits));
  }
};

// File paths for storing last deployed contracts and watchlist
const LAST_ERC20 = path.join(process.cwd(), 'last_deployed_erc20.json');
const LAST_NFT = path.join(process.cwd(), 'last_deployed_nft.json');
const WL_FILE = path.join(process.cwd(), 'watchlist.json');
const PK_FILE = path.join(process.cwd(), 'pk.txt');

// Global configuration for transaction counts
const globalConfig = {
  randomNativeTxCount: config.randomNative.txCount || 5,
  erc20AutoSendTxCount: config.erc20.autoSend?.txCount || 5,
  nftAutoSendTxCount: config.nft.autoSend?.txCount || 5,
  belridgeTxCount: 1
};

// ---- BANNER ----
const asciiBannerLines = [
  "██╗███╗   ██╗████████╗██╗   ██╗██╗████████╗██╗ ██████╗ ███╗   ██╗",
  "██║████╗  ██║╚══██╔══╝██║   ██║██║╚══██╔══╝██║██╔═══██╗████╗  ██║",
  "██║██╔██╗ ██║   ██║   ██║   ██║██║   ██║   ██║██║   ██║██╔██╗ ██║",
  "██║██║╚██╗██║   ██║   ██║   ██║██║   ██║   ██║██║   ██║██║╚██╗██║",
  "██║██║ ╚████║   ██║   ╚██████╔╝██║   ██║   ██║╚██████╔╝██║ ╚████║",
  "╚═╝╚═╝  ╚═══╝   ╚═╝    ╚═════╝ ╚═╝   ╚═╝   ╚═╝ ╚═════╝ ╚═╝  ╚═══╝",
  "",
  "       Intuition Testnet Bot v2.0 - Created By WwCfOfficial       ",
  "                  LETS DO THIS TESTNET EASY                  ",
];

// Utility functions
const sleep = (ms) => new Promise((r) => setTimeout(r, ms));
const explorer = (tx) => `${config.network.explorerTx}${tx}`;
const randomAddress = () => ethers.Wallet.createRandom().address;
const fmtUnits = (bn, dec = 18) => ethers.utils.formatUnits(bn, dec);

function formatLogMessage(msg) {
  const timestamp = new Date().toLocaleTimeString("en-US", { hour12: false });
  msg = (msg || "").toString().trim();
  if (!msg) return chalk.hex("#CCCCCC")(`[${timestamp}] Empty log`);

  const parts = msg.split("|").map((s) => s?.trim() || "");
  const walletName = parts[0] || "System";

  if (
    parts.length >= 3 &&
    (parts[2]?.includes("successful") ||
      parts[2]?.includes("Confirmed") ||
      parts[2]?.includes("Approved"))
  ) {
    const logParts = parts[2].split(/successful:|Confirmed:|Approved:/);
    const message = logParts[0]?.trim() || "";
    const hashPart = logParts[1]?.trim() || "";
    return chalk.green.bold(
      `[${timestamp}] ${walletName.padEnd(25)} | ${message}${
        hashPart ? "Confirmed: " : "successful: "
      }${chalk.greenBright.bold(hashPart || "")}`
    );
  }

  if (
    parts.length >= 2 &&
    (parts[1]?.includes("Starting") ||
      parts[1]?.includes("Processing") ||
      parts[1]?.includes("Approving"))
  ) {
    return chalk.hex("#C71585").bold(
      `[${timestamp}] ${walletName.padEnd(25)} | ${parts[1]}`
    );
  }

  if (parts.length >= 2 && parts[1]?.includes("Warning")) {
    return chalk.yellow.bold(
      `[${timestamp}] ${walletName.padEnd(25)} | ${parts.slice(1).join(" | ")}`
    );
  }

  if (msg.includes("Error") || msg.includes("failed")) {
    const errorMsg = parts.length > 2 ? parts.slice(2).join(" | ").trim() : msg;
    return chalk.red.bold(
      `[${timestamp}] ${walletName.padEnd(25)} | ${errorMsg}`
    );
  }

  return chalk.hex("#CCCCCC")(
    `[${timestamp}] ${walletName.padEnd(25)} | ${
      parts.slice(parts.length >= 2 ? 1 : 0).join(" | ") || msg
    }`
  );
}

function ensurePK() {
  try {
    if (!fs.existsSync(PK_FILE)) throw new Error('pk.txt not found');
    const pk = fs.readFileSync(PK_FILE, 'utf8').trim();
    if (!pk || !ethers.utils.isHexString(pk, 32)) throw new Error('Invalid private key in pk.txt');
    return pk.startsWith("0x") ? pk : `0x${pk}`;
  } catch (e) {
    throw new Error(chalk.red(`Error reading private key: ${e.message}`));
  }
}

function provider() {
  return new ethers.providers.JsonRpcProvider(config.network.l2Rpc);
}

function baseSepoliaProvider() {
  return new ethers.providers.JsonRpcProvider(config.network.baseSepoliaRpc);
}

function signer(p) {
  return new ethers.Wallet(ensurePK(), p);
}

function save(file, data) {
  try {
    fs.writeFileSync(file, JSON.stringify(data, null, 2));
  } catch {}
}

function read(file) {
  try {
    return fs.existsSync(file) ? JSON.parse(fs.readFileSync(file, 'utf8')) : null;
  } catch {
    return null;
  }
}

function uniqLower(arr) {
  const s = new Set();
  const out = [];
  for (const a of arr || []) {
    if (!a) continue;
    const k = a.toLowerCase();
    if (!s.has(k)) {
      s.add(k);
      out.push(a);
    }
  }
  return out;
}

// Transaction stats tracking
const stats = {
  total: 0,
  success: 0,
  failed: 0,
  pending: 0,
  gasGwei: 0,
};

function pushStats() {
  const table = new Table({
    head: ['Metric', 'Value'],
    colWidths: [25, 20],
    style: { head: ['cyan'] },
  });

  const denom = stats.success + stats.failed || 1;
  table.push(
    ['Total Transactions', stats.total],
    ['Success Rate', `${((stats.success / denom) * 100).toFixed(2)}%`],
    ['Failed Transactions', stats.failed],
    ['Pending Transactions', stats.pending],
    ['Current Gas Price', `${Number(stats.gasGwei || 0).toFixed(2)} Gwei`]
  );

  console.log(chalk.cyan('\n=== Transaction Stats ==='));
  console.log(table.toString());
}

function onPending() {
  stats.pending += 1;
}

function onSuccess(receipt) {
  stats.total += 1;
  stats.success += 1;
  stats.pending = Math.max(0, stats.pending - 1);
  if (receipt?.effectiveGasPrice) {
    try {
      stats.gasGwei = Number(ethers.utils.formatUnits(receipt.effectiveGasPrice, 'gwei'));
    } catch {}
  }
}

function onFailed() {
  stats.total += 1;
  stats.failed += 1;
  stats.pending = Math.max(0, stats.pending - 1);
}

// ABI for Arbitrum's ArbSys contract
const ARBSYS_ABI = ['function withdrawEth(address destination) payable returns (uint256)'];

// Solidity source for ERC20 contract
const ERC20_SRC = `
// SPDX-License-Identifier: MIT
pragma solidity ^0.8.20;
contract SimpleERC20 {
    string public name; string public symbol; uint8 public decimals; uint256 public totalSupply;
    mapping(address => uint256) public balanceOf;
    mapping(address => mapping(address => uint256)) public allowance;

    event Transfer(address indexed from, address indexed to, uint256 value);
    event Approval(address indexed owner, address indexed spender, uint256 value);

    constructor(string memory _n, string memory _s, uint8 _d, uint256 _supply) {
        name = _n; symbol = _s; decimals = _d; totalSupply = _supply; balanceOf[msg.sender] = _supply;
        emit Transfer(address(0), msg.sender, _supply);
    }

    function transfer(address to, uint256 val) public returns (bool) {
        require(to != address(0), "zero");
        uint256 b = balanceOf[msg.sender]; require(b >= val, "bal");
        unchecked { balanceOf[msg.sender] = b - val; balanceOf[to] += val; }
        emit Transfer(msg.sender, to, val); return true;
    }

    function approve(address spender, uint256 val) public returns (bool) {
        allowance[msg.sender][spender] = val; emit Approval(msg.sender, spender, val); return true;
    }

    function transferFrom(address from, address to, uint256 val) public returns (bool) {
        require(to != address(0), "zero");
        uint256 b = balanceOf[from]; require(b >= val, "bal");
        uint256 a = allowance[from][msg.sender]; require(a >= val, "allow");
        unchecked { balanceOf[from] = b - val; allowance[from][msg.sender] = a - val; balanceOf[to] += val; }
        emit Transfer(from, to, val); return true;
    }
}
`;

// Solidity source for ERC721 contract
const ERC721_SRC = `
// SPDX-License-Identifier: MIT
pragma solidity ^0.8.20;
contract SimpleERC721Batch {
    string public name; string public symbol; address public owner; uint256 public maxSupply; uint256 public currentIndex;
    mapping(uint256 => address) private _owners; mapping(address => uint256) private _balances;
    mapping(uint256 => address) private _tokenApprovals; mapping(address => mapping(address => bool)) private _operatorApprovals;
    event Transfer(address indexed from, address indexed to, uint256 indexed tokenId);
    event Approval(address indexed owner, address indexed approved, uint256 indexed tokenId);
    event ApprovalForAll(address indexed owner, address indexed operator, bool approved);
    modifier onlyOwner() { require(msg.sender == owner, "not owner"); _; }
    constructor(string memory _n, string memory _s, uint256 _max) { require(_max > 0, "max=0"); name = _n; symbol = _s; owner = msg.sender; maxSupply = _max; currentIndex = 0; }
    function totalSupply() public view returns (uint256) { return currentIndex; }
    function balanceOf(address _o) public view returns (uint256) { require(_o != address(0), "zero"); return _balances[_o]; }
    function ownerOf(uint256 tokenId) public view returns (address) { address o = _owners[tokenId]; require(o != address(0), "nonexistent"); return o; }
    function approve(address to, uint256 tokenId) public { address o = ownerOf(tokenId); require(to != o, "self"); require(msg.sender == o || isApprovedForAll(o, msg.sender), "not allowed"); _tokenApprovals[tokenId] = to; emit Approval(o, to, tokenId); }
    function getApproved(uint256 tokenId) public view returns (address) { require(_owners[tokenId] != address(0), "nonexistent"); return _tokenApprovals[tokenId]; }
    function setApprovalForAll(address operator, bool approved) public { require(operator != msg.sender, "self"); _operatorApprovals[msg.sender][operator] = approved; emit ApprovalForAll(msg.sender, operator, approved); }
    function isApprovedForAll(address _o, address op) public view returns (bool) { return _operatorApprovals[_o][op]; }
    function transferFrom(address from, address to, uint256 tokenId) public { require(_isApprovedOrOwner(msg.sender, tokenId), "not allowed"); _transfer(from, to, tokenId); }
    function safeTransferFrom(address from, address to, uint256 tokenId) public { transferFrom(from, to, tokenId); }
    function safeTransferFrom(address from, address to, uint256 tokenId, bytes calldata) public { transferFrom(from, to, tokenId); }
    function ownerMintBatch(uint256 count) external onlyOwner { require(count > 0, "count=0"); require(currentIndex + count <= maxSupply, "exceeds"); uint256 start = currentIndex + 1; uint256 end = currentIndex + count; for (uint256 id = start; id <= end; id++) { _mint(msg.sender, id); } currentIndex = end; }
    function _mint(address to, uint256 tokenId) internal { require(to != address(0), "zero"); require(_owners[tokenId] == address(0), "exists"); _owners[tokenId] = to; _balances[to] += 1; emit Transfer(address(0), to, tokenId); }
    function _transfer(address from, address to, uint256 tokenId) internal { require(ownerOf(tokenId) == from, "owner"); require(to != address(0), "zero"); delete _tokenApprovals[tokenId]; _balances[from] -= 1; _balances[to] += 1; _owners[tokenId] = to; emit Transfer(from, to, tokenId); }
    function _isApprovedOrOwner(address spender, uint256 tokenId) internal view returns (bool) { address o = ownerOf(tokenId); return (spender == o || getApproved(tokenId) == spender || isApprovedForAll(o, spender)); }
}
`;

function compileSol(sources) {
  const input = {
    language: 'Solidity',
    sources,
    settings: {
      optimizer: { enabled: true, runs: 200 },
      outputSelection: { '*': { '*': ['abi', 'evm.bytecode.object'] } },
    },
  };
  const out = JSON.parse(solc.compile(JSON.stringify(input)));
  const errs = (out.errors || []).filter((e) => e.severity === 'error');
  if (errs.length) throw new Error(chalk.red(errs.map((e) => e.formattedMessage).join('\n')));
  return out;
}

async function sendRawTracked(w, tx, fallbackGasLimit, label = 'TX', retryCount = 0) {
  const maxRetries = config.retry?.maxAttempts || 3;
  const retryDelay = (config.retry?.delaySec || 2) * 1000;

  try {
    if (!tx.gasLimit) {
      try {
        const est = await w.estimateGas(tx);
        tx.gasLimit = est.mul(120).div(100);
      } catch {
        if (fallbackGasLimit) tx.gasLimit = ethers.BigNumber.from(fallbackGasLimit);
      }
    }
    onPending();
    const resp = await w.sendTransaction(tx);
    console.log(formatLogMessage(`System | Pending ${label}: ${resp.hash}`));
    const rec = await resp.wait();
    onSuccess(rec);
    console.log(formatLogMessage(`System | Success ${label}: Confirmed: ${rec.transactionHash}`));
    console.log(chalk.blue(`Explorer Link: ${explorer(rec.transactionHash)}`));
    return rec;
  } catch (e) {
    if (e.message.includes('connection refused') && retryCount < maxRetries) {
      console.log(formatLogMessage(`System | Warning: Connection refused, retrying ${label} (${retryCount + 1}/${maxRetries})...`));
      await sleep(retryDelay);
      return sendRawTracked(w, tx, fallbackGasLimit, label, retryCount + 1);
    }
    onFailed();
    console.error(formatLogMessage(`System | Error: Failed ${label}: ${e.message || e}`));
    throw e;
  }
}

async function sendContractTracked(txPromise, label = 'TX', retryCount = 0) {
  const maxRetries = config.retry?.maxAttempts || 3;
  const retryDelay = (config.retry?.delaySec || 2) * 1000;

  try {
    onPending();
    const tx = await txPromise;
    console.log(formatLogMessage(`System | Pending ${label}: ${tx.hash}`));
    const rec = await tx.wait();
    onSuccess(rec);
    console.log(formatLogMessage(`System | Success ${label}: Confirmed: ${rec.transactionHash}`));
    console.log(chalk.blue(`Explorer Link: ${explorer(rec.transactionHash)}`));
    return rec;
  } catch (e) {
    if (e.message.includes('connection refused') && retryCount < maxRetries) {
      console.log(formatLogMessage(`System | Warning: Connection refused, retrying ${label} (${retryCount + 1}/${maxRetries})...`));
      await sleep(retryDelay);
      return sendContractTracked(txPromise, label, retryCount + 1);
    }
    onFailed();
    console.error(formatLogMessage(`System | Error: Failed ${label}: ${e.message || e}`));
    throw e;
  }
}

function loadWatchlist() {
  const disk = read(WL_FILE) || { erc20: [], erc721: [] };
  const base = config.watchlist || { erc20: [], erc721: [] };
  const last20 = read(LAST_ERC20);
  const last721 = read(LAST_NFT);

  const erc20 = uniqLower([...(base.erc20 || []), ...(disk.erc20 || []), ...(last20?.address ? [last20.address] : [])]);
  const erc721 = uniqLower([...(base.erc721 || []), ...(disk.erc721 || []), ...(last721?.address ? [last721.address] : [])]);

  return { erc20, erc721 };
}

function saveWatchlist(wl) {
  save(WL_FILE, { erc20: uniqLower(wl.erc20 || []), erc721: uniqLower(wl.erc721 || []) });
}

function addToWatchlist(type, address) {
  const wl = loadWatchlist();
  if (type === 'erc20') wl.erc20 = uniqLower([...(wl.erc20 || []), address]);
  if (type === 'erc721') wl.erc721 = uniqLower([...(wl.erc721 || []), address]);
  saveWatchlist(wl);
}

async function getERC20Meta(address, user, w) {
  const abi = [
    'function name() view returns (string)',
    'function symbol() view returns (string)',
    'function decimals() view returns (uint8)',
    'function balanceOf(address) view returns (uint256)',
  ];
  const c = new ethers.Contract(address, abi, w);
  const [name, symbol, decimals, bal] = await Promise.all([
    c.name().catch(() => 'ERC20'),
    c.symbol().catch(() => 'TKN'),
    c.decimals().catch(() => 18),
    c.balanceOf(user).catch(() => ethers.constants.Zero),
  ]);
  return {
    type: 'erc20',
    address,
    name,
    symbol,
    balanceRaw: bal,
    decimals,
    balanceText: `${fmtUnits(bal, decimals)} ${symbol}`,
  };
}

async function getERC721Meta(address, user, w) {
  const abi = [
    'function name() view returns (string)',
    'function symbol() view returns (string)',
    'function balanceOf(address) view returns (uint256)',
  ];
  const c = new ethers.Contract(address, abi, w);
  const [name, symbol, bal] = await Promise.all([
    c.name().catch(() => 'NFT'),
    c.symbol().catch(() => 'NFT'),
    c.balanceOf(user).catch(() => ethers.constants.Zero),
  ]);
  return {
    type: 'erc721',
    address,
    name,
    symbol,
    balanceRaw: bal,
    balanceText: `${bal.toString()} ${symbol}`,
  };
}

async function refreshTokenPanel(w) {
  const addr = await w.getAddress();
  const wl = loadWatchlist();

  const jobs = [...wl.erc20.map((a) => getERC20Meta(a, addr, w)), ...wl.erc721.map((a) => getERC721Meta(a, addr, w))];

  const results = [];
  for (const job of jobs) {
    try {
      results.push(await job);
    } catch {}
  }

  const filtered = results.filter((r) => r.balanceRaw && !r.balanceRaw.isZero && !r.balanceRaw.isZero()) || results;

  const table = new Table({
    head: ['Type', 'Name', 'Symbol', 'Balance', 'Address'],
    colWidths: [10, 20, 15, 20, 45],
    style: { head: ['cyan'] },
  });

  if (filtered.length === 0) {
    console.log(chalk.gray('\n=== Token Balances ===\nNo tokens with positive balance.'));
  } else {
    filtered.slice(0, 10).forEach((meta) => {
      table.push([
        meta.type.toUpperCase(),
        meta.name,
        meta.symbol,
        meta.balanceText,
        meta.address,
      ]);
    });
    console.log(chalk.cyan('\n=== Token Balances ==='));
    console.log(table.toString());
  }
}

async function withdrawL2toL1(w) {
  const arb = new ethers.Contract(config.network.arbSys, ARBSYS_ABI, w);
  const call = await arb.populateTransaction.withdrawEth(config.withdraw.destination);
  call.to = config.network.arbSys;
  call.value = ethers.utils.parseEther(String(config.withdraw.amountEth));
  console.log(formatLogMessage(`System | Processing Withdraw ${config.withdraw.amountEth} ${config.network.nativeSymbol} to ${config.withdraw.destination}`));
  const rec = await sendRawTracked(w, call, 300000, 'Withdraw');
}

async function belridgeTrustToBaseSepolia(w, pBaseSepolia) {
  const addr = await w.getAddress();
  const arb = new ethers.Contract(config.network.arbSys, ARBSYS_ABI, w);
  const amount = ethers.utils.parseEther(String(config.belridge.amountEth));
  const gasPrice = ethers.utils.parseUnits(String(config.belridge.gasPriceGwei), 'gwei');
  const balance = await w.getBalance();

  console.log(formatLogMessage(`System | Checking balance for Belridge Trust: ${fmtUnits(balance)} ${config.network.nativeSymbol}`));
  const totalCost = amount.add(gasPrice.mul(config.belridge.gasLimit));
  if (balance.lt(totalCost)) {
    throw new Error(`Insufficient balance: Required ${fmtUnits(totalCost)} ${config.network.nativeSymbol}, Available ${fmtUnits(balance)}`);
  }

  const call = await arb.populateTransaction.withdrawEth(addr);
  call.to = config.network.arbSys;
  call.value = amount;
  call.gasLimit = ethers.BigNumber.from(config.belridge.gasLimit);
  call.gasPrice = gasPrice;

  console.log(formatLogMessage(`System | Processing Belridge Trust Withdraw ${config.belridge.amountEth} ${config.network.nativeSymbol} to Base Sepolia (${addr})`));
  const rec = await sendRawTracked(w, call, config.belridge.gasLimit, `Belridge Trust Withdraw`);

  console.log(chalk.yellow(`Note: Withdrawal may require a challenge period. Check Base Sepolia explorer later: https://sepolia.basescan.org/address/${addr}`));

  const baseBalance = await pBaseSepolia.getBalance(addr).catch(() => ethers.constants.Zero);
  console.log(formatLogMessage(`System | Base Sepolia Balance: ${fmtUnits(baseBalance)} ETH`));
}

async function randomNativeTransfers(w) {
  const { minEth, maxEth, delaySec } = config.randomNative;
  for (let i = 0; i < globalConfig.randomNativeTxCount; i++) {
    try {
      const to = randomAddress();
      const amt = Random.float(minEth, maxEth, 8);
      console.log(formatLogMessage(`System | Processing Native Transfer [${i + 1}/${globalConfig.randomNativeTxCount}] ${amt} ${config.network.nativeSymbol} to ${to}`));
      const rec = await sendRawTracked(w, { to, value: ethers.utils.parseEther(amt.toFixed(8)) }, 21000, `Native #${i + 1}`);
      if (i < globalConfig.randomNativeTxCount - 1 && delaySec > 0) {
        await sleep(delaySec * 1000);
      }
    } catch (e) {
      onFailed();
      console.error(formatLogMessage(`System | Error: Skipped Native #${i + 1}: ${e.message || e}`));
      continue;
    }
  }
}

async function deployERC20(w) {
  const name = config.erc20.name === 'RANDOM' ? Random.tokenName('Token') : config.erc20.name;
  const symbol = config.erc20.symbol === 'RANDOM' ? Random.symbol(3) : config.erc20.symbol;
  const decimals = Number(config.erc20.decimals || 18);
  const supply = ethers.utils.parseUnits(String(config.erc20.supply || 0), decimals);

  console.log(formatLogMessage(`System | Processing Deploying ERC20: ${name} (${symbol}) with supply=${config.erc20.supply}, decimals=${decimals}`));

  const out = compileSol({ 'SimpleERC20.sol': { content: ERC20_SRC } });
  const c = out.contracts['SimpleERC20.sol']['SimpleERC20'];
  const factory = new ethers.ContractFactory(c.abi, '0x' + c.evm.bytecode.object, w);

  onPending();
  const contract = await factory.deploy(name, symbol, decimals, supply, { gasLimit: 5_000_000 });
  console.log(formatLogMessage(`System | Pending Deploy TX: ${contract.deployTransaction.hash}`));
  const rec = await contract.deployTransaction.wait();
  onSuccess(rec);
  console.log(formatLogMessage(`System | Success ERC20 deployed at ${contract.address}: Confirmed: ${rec.transactionHash}`));
  console.log(chalk.blue(`Explorer Link: ${explorer(rec.transactionHash)}`));

  addToWatchlist('erc20', contract.address);

  save(LAST_ERC20, { address: contract.address, name, symbol, decimals });
  return { address: contract.address, name, symbol, decimals };
}

async function autoSendERC20(w, meta) {
  const cfg = config.erc20.autoSend;
  let address = meta?.address || read(LAST_ERC20)?.address;
  if (!address || !ethers.utils.isAddress(address)) throw new Error(chalk.red('ERC20 address not found'));

  const token = new ethers.Contract(address, [
    'function symbol() view returns (string)',
    'function decimals() view returns (uint8)',
    'function balanceOf(address) view returns (uint256)',
    'function transfer(address,uint256) returns (bool)',
  ], w);

  const [symbol, decimals] = await Promise.all([token.symbol().catch(() => 'TKN'), token.decimals().catch(() => 18)]);

  for (let i = 0; i < globalConfig.erc20AutoSendTxCount; i++) {
    try {
      const to = randomAddress();
      const amountRaw = ethers.utils.parseUnits(String(cfg.amountPerTx), decimals);
      console.log(formatLogMessage(`System | Processing ERC20 Transfer [${i + 1}/${globalConfig.erc20AutoSendTxCount}] ${cfg.amountPerTx} ${symbol} to ${to}`));
      const rec = await sendContractTracked(token.transfer(to, amountRaw), `ERC20 #${i + 1}`);
      if (i < globalConfig.erc20AutoSendTxCount - 1 && cfg.delaySec > 0) {
        await sleep(cfg.delaySec * 1000);
      }
    } catch (e) {
      onFailed();
      console.error(formatLogMessage(`System | Error: Skipped ERC20 #${i + 1}: ${e.message || e}`));
      continue;
    }
  }
}

async function deployNFT(w) {
  const name = config.nft.name === 'RANDOM' ? Random.nftName('NFT') : config.nft.name;
  const symbol = config.nft.symbol || 'NFT';
  const supply = Number(config.nft.supply || 0);
  const chunk = Number(config.nft.mintChunk || 100);
  if (supply <= 0) throw new Error(chalk.red('NFT supply must be > 0'));

  console.log(formatLogMessage(`System | Processing Deploying NFT: ${name} (${symbol}) with supply=${supply}, chunk=${chunk}`));

  const out = compileSol({ 'SimpleERC721Batch.sol': { content: ERC721_SRC } });
  const c = out.contracts['SimpleERC721Batch.sol']['SimpleERC721Batch'];
  const factory = new ethers.ContractFactory(c.abi, '0x' + c.evm.bytecode.object, w);

  onPending();
  const contract = await factory.deploy(name, symbol, ethers.BigNumber.from(supply), { gasLimit: 6_000_000 });
  console.log(formatLogMessage(`System | Pending Deploy TX: ${contract.deployTransaction.hash}`));
  const rec = await contract.deployTransaction.wait();
  onSuccess(rec);
  console.log(formatLogMessage(`System | Success NFT deployed at ${contract.address}: Confirmed: ${rec.transactionHash}`));
  console.log(chalk.blue(`Explorer Link: ${explorer(rec.transactionHash)}`));

  const nft = new ethers.Contract(contract.address, c.abi, w);

  let minted = 0;
  while (minted < supply) {
    try {
      const count = Math.min(chunk, supply - minted);
      console.log(formatLogMessage(`System | Processing Minting batch ${count} (minted=${minted}/${supply})`));
      const r = await sendContractTracked(nft.ownerMintBatch(count, { gasLimit: 3_000_000 }), `Mint ${minted + 1}..${minted + count}`);
      minted += count;
    } catch (e) {
      onFailed();
      console.error(formatLogMessage(`System | Error: Skipped Mint ${minted + 1}..${minted + count}: ${e.message || e}`));
      continue;
    }
  }

  addToWatchlist('erc721', contract.address);

  save(LAST_NFT, { address: contract.address, name, symbol, totalSupply: supply, nextToSend: 1 });
  return { address: contract.address, name, symbol, totalSupply: supply };
}

async function autoSendNFT(w, meta) {
  const cfg = config.nft.autoSend;
  const saved = read(LAST_NFT);
  const address = meta?.address || saved?.address;
  if (!address || !ethers.utils.isAddress(address)) throw new Error(chalk.red('NFT address not found'));

  const nft = new ethers.Contract(address, [
    'function name() view returns (string)',
    'function symbol() view returns (string)',
    'function totalSupply() view returns (uint256)',
    'function balanceOf(address) view returns (uint256)',
    'function ownerOf(uint256) view returns (address)',
    'function transferFrom(address,address,uint256)',
  ], w);

  const from = await w.getAddress();
  const total = saved?.totalSupply || (await nft.totalSupply().catch(() => ethers.constants.Zero)).toNumber();
  let cursor = saved?.nextToSend || 1;

  for (let i = 0; i < globalConfig.nftAutoSendTxCount && cursor <= total; i++) {
    try {
      let owner;
      try {
        owner = await nft.ownerOf(cursor);
      } catch {
        cursor++;
        i--;
        continue;
      }
      if (owner.toLowerCase() !== from.toLowerCase()) {
        cursor++;
        i--;
        continue;
      }

      const to = randomAddress();
      console.log(formatLogMessage(`System | Processing NFT Transfer [${i + 1}/${globalConfig.nftAutoSendTxCount}] #${cursor} to ${to}`));
      const rec = await sendContractTracked(nft.transferFrom(from, to, cursor, { gasLimit: 300_000 }), `NFT #${cursor}`);
      cursor++;
      if (i < globalConfig.nftAutoSendTxCount - 1 && cfg.delaySec > 0) {
        await sleep(cfg.delaySec * 1000);
      }
    } catch (e) {
      onFailed();
      console.error(formatLogMessage(`System | Error: Skipped NFT #${cursor}: ${e.message || e}`));
      cursor++;
      continue;
    }
  }

  save(LAST_NFT, { ...(saved || {}), address, totalSupply: total, nextToSend: cursor });
}

async function refreshWallet(w, p, pBaseSepolia) {
  const addr = await w.getAddress();
  const [bal, balBase, fee, nonce] = await Promise.all([
    p.getBalance(addr),
    pBaseSepolia.getBalance(addr).catch(() => ethers.constants.Zero),
    p.getFeeData(),
    p.getTransactionCount(addr, 'latest'),
  ]);
  if (fee?.maxFeePerGas) {
    try {
      stats.gasGwei = Number(ethers.utils.formatUnits(fee.maxFeePerGas, 'gwei'));
    } catch {}
  }

  const table = new Table({
    head: ['Field', 'Value'],
    colWidths: [20, 50],
    style: { head: ['cyan'] },
  });

  table.push(
    ['Address', addr],
    ['Intuition Balance', `${fmtUnits(bal, 18)} ${config.network.nativeSymbol}`],
    ['Base Sepolia Balance', `${fmtUnits(balBase, 18)} ETH`],
    ['Network', config.network.label],
    ['Gas Price', fee.maxFeePerGas ? `${ethers.utils.formatUnits(fee.maxFeePerGas, 'gwei')} Gwei` : '0'],
    ['Nonce', nonce]
  );

  console.log(chalk.cyan('\n=== Wallet Info ==='));
  console.log(table.toString());
}

const rl = readline.createInterface({
  input: process.stdin,
  output: process.stdout,
});

function requestInput(promptText, type = "text", defaultValue = "") {
  return new Promise((resolve) => {
    rl.question(
      chalk.greenBright(`${promptText}${defaultValue ? ` [${defaultValue}]` : ""}: `),
      (value) => {
        if (type === "number") value = Number(value);
        if (value === "" || (type === "number" && isNaN(value))) value = defaultValue;
        resolve(value);
      }
    );
  });
}

async function setTransactionCount() {
  const logger = (message) => console.log(formatLogMessage(message));

  const newBelridgeTxCount = await requestInput(
    "Enter number of Belridge Trust withdrawals",
    "number",
    globalConfig.belridgeTxCount.toString()
  );
  if (isNaN(newBelridgeTxCount) || newBelridgeTxCount <= 0) {
    logger(`System | Error: Invalid Belridge Trust withdrawal count. Keeping current: ${globalConfig.belridgeTxCount}`);
  } else {
    globalConfig.belridgeTxCount = newBelridgeTxCount;
    logger(`System | Success: Set Belridge Trust withdrawal count to: ${newBelridgeTxCount}`);
  }

  const newRandomNativeTxCount = await requestInput(
    "Enter number of random native transfers",
    "number",
    globalConfig.randomNativeTxCount.toString()
  );
  if (isNaN(newRandomNativeTxCount) || newRandomNativeTxCount <= 0) {
    logger(`System | Error: Invalid random native transfer count. Keeping current: ${globalConfig.randomNativeTxCount}`);
  } else {
    globalConfig.randomNativeTxCount = newRandomNativeTxCount;
    logger(`System | Success: Set random native transfer count to: ${newRandomNativeTxCount}`);
  }

  const newErc20AutoSendTxCount = await requestInput(
    "Enter number of ERC20 auto-send transactions",
    "number",
    globalConfig.erc20AutoSendTxCount.toString()
  );
  if (isNaN(newErc20AutoSendTxCount) || newErc20AutoSendTxCount <= 0) {
    logger(`System | Error: Invalid ERC20 auto-send count. Keeping current: ${globalConfig.erc20AutoSendTxCount}`);
  } else {
    globalConfig.erc20AutoSendTxCount = newErc20AutoSendTxCount;
    logger(`System | Success: Set ERC20 auto-send count to: ${newErc20AutoSendTxCount}`);
  }

  const newNftAutoSendTxCount = await requestInput(
    "Enter number of NFT auto-send transactions",
    "number",
    globalConfig.nftAutoSendTxCount.toString()
  );
  if (isNaN(newNftAutoSendTxCount) || newNftAutoSendTxCount <= 0) {
    logger(`System | Error: Invalid NFT auto-send count. Keeping current: ${globalConfig.nftAutoSendTxCount}`);
  } else {
    globalConfig.nftAutoSendTxCount = newNftAutoSendTxCount;
    logger(`System | Success: Set NFT auto-send count to: ${newNftAutoSendTxCount}`);
  }
}

// CLI Menu
const MENU_ITEMS = [
  '01 > Belridge Trust - Base Sepolia',
  '02 > Bridge L2 -> L1',
  '03 > Random Native Transfers',
  '04 > Deploy ERC-20',
  '05 > Auto-send ERC-20',
  '06 > Deploy NFT (ERC721)',
  '07 > Auto-send NFT (ERC721)',
  '08 > Set Transaction Count',
  '09 > Show Balance',
  '10 > Show Stats',
  '11 > Run All Transactions',
  '12 > Exit',
];

function displayBannerAndMenu(wAddress) {
  console.clear();
  console.log(chalk.hex("#D8BFD8").bold(asciiBannerLines.join("\n")));
  console.log(chalk.gray(`\nWallet: ${wAddress}`));
  console.log(chalk.blueBright.bold("\n>=== Intuition Testnet Bot Menu ===<"));
  MENU_ITEMS.forEach((item) => {
    console.log(chalk.blue(`  ${item.padEnd(35)} <`));
  });
  console.log(chalk.blueBright.bold(">=================================<"));
}

let isRunning = false;

async function handleMenuSelection(idx, w, p, pBaseSepolia) {
  if (isRunning) {
    console.log(formatLogMessage('System | Warning: Operation in progress... please wait.'));
    return;
  }
  isRunning = true;

  try {
    console.log(formatLogMessage(`System | Starting ${MENU_ITEMS[idx].slice(5)}`));
    switch (idx) {
      case 0:
        if (config.belridge.enabled) {
          for (let i = 0; i < globalConfig.belridgeTxCount; i++) {
            console.log(formatLogMessage(`System | Processing Belridge Trust Withdrawal [${i + 1}/${globalConfig.belridgeTxCount}]`));
            await belridgeTrustToBaseSepolia(w, pBaseSepolia);
            if (i < globalConfig.belridgeTxCount - 1 && config.retry.delaySec > 0) {
              await sleep(config.retry.delaySec * 1000);
            }
          }
        } else {
          console.log(formatLogMessage('System | Warning: Belridge Trust disabled in config.'));
        }
        break;
      case 1:
        await withdrawL2toL1(w);
        break;
      case 2:
        await randomNativeTransfers(w);
        break;
      case 3:
        await deployERC20(w);
        break;
      case 4:
        await autoSendERC20(w, null);
        break;
      case 5:
        await deployNFT(w);
        break;
      case 6:
        await autoSendNFT(w, null);
        break;
      case 7:
        await setTransactionCount();
        break;
      case 8:
        await refreshWallet(w, p, pBaseSepolia);
        await refreshTokenPanel(w);
        break;
      case 9:
        pushStats();
        break;
      case 10:
        if (config.belridge.enabled) {
          for (let i = 0; i < globalConfig.belridgeTxCount; i++) {
            console.log(formatLogMessage(`System | Processing Belridge Trust Withdrawal [${i + 1}/${globalConfig.belridgeTxCount}]`));
            await belridgeTrustToBaseSepolia(w, pBaseSepolia);
            if (i < globalConfig.belridgeTxCount - 1 && config.retry.delaySec > 0) {
              await sleep(config.retry.delaySec * 1000);
            }
          }
        }
        if (config.withdraw.enabled) await withdrawL2toL1(w);
        if (config.randomNative.enabled) await randomNativeTransfers(w);
        let erc20Meta = null;
        if (config.erc20.enabled) erc20Meta = await deployERC20(w);
        if (config.erc20.autoSend?.enabled) await autoSendERC20(w, erc20Meta);
        let nftMeta = null;
        if (config.nft.enabled) nftMeta = await deployNFT(w);
        if (config.nft.autoSend?.enabled) await autoSendNFT(w, nftMeta);
        break;
      case 11:
        console.log(formatLogMessage('System | Success: Exiting...'));
        rl.close();
        process.exit(0);
      default:
        console.log(formatLogMessage('System | Error: Invalid option selected.'));
    }
    console.log(formatLogMessage(`System | Completed ${MENU_ITEMS[idx].slice(5)}`));
  } catch (e) {
    console.error(formatLogMessage(`System | Error: ${e.message || e}`));
  } finally {
    isRunning = false;
  }
}

async function main() {
  const logger = (message) => console.log(formatLogMessage(message));
  const p = provider();
  const pBaseSepolia = baseSepoliaProvider();
  const w = signer(p);
  const wAddress = await w.getAddress();

  async function prompt() {
    displayBannerAndMenu(wAddress);
    const choice = await requestInput(`Select an option (1-${MENU_ITEMS.length})`, "number");
    const idx = parseInt(choice) - 1;
    if (!isNaN(idx) && idx >= 0 && idx < MENU_ITEMS.length) {
      await handleMenuSelection(idx, w, p, pBaseSepolia);
    } else {
      logger(`System | Error: Invalid input. Please enter a number between 1 and ${MENU_ITEMS.length}.`);
    }
    await requestInput("Press Enter to continue...");
    prompt();
  }

  prompt();
}

main().catch((e) => {
  console.error(formatLogMessage(`System | Error: Fatal error: ${e.message || e}`));
  process.exit(1);
});
