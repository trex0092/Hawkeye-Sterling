// Hawkeye Sterling — multi-chain crypto risk heuristics.
//
// Extends src/brain/lib/crypto-risk.ts with chain-native heuristics for
// Ethereum, Polygon, Arbitrum, Optimism, Solana and Bitcoin. Each chain
// has its own address shape, its own canonical stablecoin contracts and
// its own known high-risk protocol addresses (mixers, sanctioned
// bridges, OFAC-designated DEXes).

export type Chain =
  | 'bitcoin'
  | 'ethereum'
  | 'polygon'
  | 'arbitrum'
  | 'optimism'
  | 'solana';

const ADDRESS_SHAPE: Record<Chain, RegExp> = {
  bitcoin: /^(bc1|[13])[a-zA-HJ-NP-Z0-9]{25,62}$/,
  ethereum: /^0x[0-9a-fA-F]{40}$/,
  polygon: /^0x[0-9a-fA-F]{40}$/,
  arbitrum: /^0x[0-9a-fA-F]{40}$/,
  optimism: /^0x[0-9a-fA-F]{40}$/,
  solana: /^[1-9A-HJ-NP-Za-km-z]{32,44}$/,
};

export interface MultiChainWallet {
  chain: Chain;
  address: string;
}

/** Infer which chain(s) an address could belong to based on shape. */
export function inferChain(address: string): Chain[] {
  const out: Chain[] = [];
  for (const [c, re] of Object.entries(ADDRESS_SHAPE)) {
    if (re.test(address)) out.push(c as Chain);
  }
  return out;
}

/** Known staking / bridge / DEX / mixer addresses by category. Seed list
 *  only — production overrides via Phase 5 ingestion. */
export const KNOWN_PROTOCOLS: Record<
  Chain,
  { bridges: ReadonlySet<string>; staking: ReadonlySet<string>; dex: ReadonlySet<string>; mixers: ReadonlySet<string> }
> = {
  ethereum: {
    // Canonical bridge contracts (Polygon PoS Bridge, Arbitrum Gateway,
    // Optimism Standard Bridge, Hop Protocol).
    bridges: new Set([
      '0x40ec5b33f54e0e8a33a975908c5ba1c14e5bbbdf',
      '0x8eb8a3b98659cce290402893d0123abb75e3ab28',
      '0x99c9fc46f92e8a1c0dec1b1747d010903e884be1',
      '0xb8901acb165ed027e32754e0ffe830802919727f',
    ]),
    staking: new Set([
      '0x00000000219ab540356cbb839cbe05303d7705fa', // ETH2 deposit contract
      '0xae7ab96520de3a18e5e111b5eaab095312d7fe84', // stETH
      '0xac3e018457b222d93114458476f3e3416abbe38f', // sfrxETH
    ]),
    dex: new Set([
      '0xe592427a0aece92de3edee1f18e0157c05861564', // Uniswap V3 Router
      '0x1111111254eeb25477b68fb85ed929f73a960582', // 1inch V5
      '0xdef1c0ded9bec7f1a1670819833240f027b25eff', // 0x Exchange
    ]),
    mixers: new Set([
      // Tornado Cash pools (OFAC SDN 2022-08).
      '0x8589427373d6d84e98730d7795d8f6f8731fda16',
      '0x722122df12d4e14e13ac3b6895a86e84145b6967',
      '0xdd4c48c0b24039969fc16d1cdf626eab821d3384',
      '0xd90e2f925da726b50c4ed8d0fb90ad053324f31b',
      '0xd96f2b1c14db8458374d9aca76e26c3d18364307',
      '0x4736dcf1b7a3d580672ccce6213c03bf1cbcdaa1',
      '0xd691f27f38b395864ea86cfc7253969b409c362d',
      '0x23773e65ed146a459791799d01336db287f25334',
    ]),
  },
  polygon: {
    bridges: new Set([
      '0xa0c68c638235ee32657e8f720a23cec1bfc77c77', // Polygon PoS Bridge root manager
    ]),
    staking: new Set([
      '0x5e3ef299fddf15eaa0432e6e66473ace8c13d908', // Lido Polygon
    ]),
    dex: new Set([
      '0xa5e0829caced8ffdd4de3c43696c57f7d7a678ff', // QuickSwap
      '0x1b02da8cb0d097eb8d57a175b88c7d8b47997506', // Sushi Polygon
    ]),
    mixers: new Set(),
  },
  arbitrum: {
    bridges: new Set([
      '0x4dbd4fc535ac27206064b68ffcf827b0a60bab3f', // L1 Gateway Router
      '0x72ce9c846789fdb6fc1f34ac4ad25dd9ef7031ef', // L1 Arb Bridge
    ]),
    staking: new Set([]),
    dex: new Set([
      '0xe592427a0aece92de3edee1f18e0157c05861564', // Uniswap V3 router
      '0xa0fb1b11ccA5871fb0225B64308e249B97804E99', // Camelot
    ]),
    mixers: new Set(),
  },
  optimism: {
    bridges: new Set([
      '0x99c9fc46f92e8a1c0dec1b1747d010903e884be1', // Optimism Standard Bridge
      '0x467194771dae2967aef3ecbedd3bf9a310c76c65', // Portal
    ]),
    staking: new Set(),
    dex: new Set([
      '0xe592427a0aece92de3edee1f18e0157c05861564', // Uniswap V3
      '0x9c12939390052919af3155f41bf4160fd3666a6f', // Velodrome
    ]),
    mixers: new Set(),
  },
  solana: {
    bridges: new Set([
      'wormholeknkunqguorpfuef9dcnn4hx6jeb5kcsq7qqu', // Wormhole (sanctioned fragments)
    ]),
    staking: new Set(),
    dex: new Set([
      '9WzdxwBbmkg8ZTbNMqUxvQRAyrZzDsGYdLVL9zYtAWWM', // Jupiter Aggregator
      'srmqPvymJeFKQ4zGQed1GFppgkRHL9kaELCbyksJtPX', // Serum DEX V3 (defunct)
    ]),
    mixers: new Set(),
  },
  bitcoin: {
    bridges: new Set(),
    staking: new Set(),
    dex: new Set(),
    mixers: new Set([
      // ChipMixer (designated 2023-03)
      'bc1qa5wkgaew2dkv56kfvj49j0av5nml45x9ek9hz6',
    ]),
  },
};

export interface MultiChainProfile {
  chainsSeen: Chain[];
  crossAssetLinked: boolean;
  bridgeHits: Array<{ chain: Chain; address: string }>;
  stakingHits: Array<{ chain: Chain; address: string }>;
  dexHits: Array<{ chain: Chain; address: string }>;
  mixerHits: Array<{ chain: Chain; address: string }>;
  unifiedRiskScore: number; // 0..1
}

export function profileMultiChain(wallets: MultiChainWallet[]): MultiChainProfile {
  const chainsSeen = new Set<Chain>();
  const bridgeHits: MultiChainProfile['bridgeHits'] = [];
  const stakingHits: MultiChainProfile['stakingHits'] = [];
  const dexHits: MultiChainProfile['dexHits'] = [];
  const mixerHits: MultiChainProfile['mixerHits'] = [];

  for (const w of wallets) {
    chainsSeen.add(w.chain);
    const proto = KNOWN_PROTOCOLS[w.chain];
    if (!proto) continue;
    const lower = w.address.toLowerCase();
    if (proto.bridges.has(lower)) bridgeHits.push({ chain: w.chain, address: w.address });
    if (proto.staking.has(lower)) stakingHits.push({ chain: w.chain, address: w.address });
    if (proto.dex.has(lower)) dexHits.push({ chain: w.chain, address: w.address });
    if (proto.mixers.has(lower)) mixerHits.push({ chain: w.chain, address: w.address });
  }

  const crossAssetLinked = chainsSeen.size >= 2;
  // Risk contributions: mixers dominate (0.5), bridges push up under
  // cross-asset evidence (0.15), multi-chain by itself adds 0.1.
  let score = 0;
  score += Math.min(0.5, mixerHits.length * 0.5);
  score += Math.min(0.15, bridgeHits.length * 0.05);
  score += Math.min(0.15, dexHits.length * 0.03);
  if (crossAssetLinked) score += 0.1;
  score = Math.min(1, score);

  return {
    chainsSeen: Array.from(chainsSeen),
    crossAssetLinked,
    bridgeHits,
    stakingHits,
    dexHits,
    mixerHits,
    unifiedRiskScore: Number(score.toFixed(3)),
  };
}

/** Detect fiat transactions whose memo / reference field mentions
 *  crypto — a low-tech but high-recall signal for crypto-in-fiat
 *  laundering typologies (FATF R.15). */
export function detectHiddenCryptoInFiat(
  transactions: Array<{ memo?: string; reference?: string; note?: string }>,
): Array<{ index: number; term: string }> {
  const patterns = [
    /\bBTC\b/i,
    /\bETH\b/i,
    /\bUSDT\b/i,
    /\bUSDC\b/i,
    /\bbinance\b/i,
    /\bcoinbase\b/i,
    /\bkraken\b/i,
    /\btether\b/i,
    /\bwallet\b/i,
    /\bcrypto\b/i,
    /\bbitcoin\b/i,
    /\bethereum\b/i,
    /\bsolana\b/i,
    /\btornado\b/i,
    /\bmixer\b/i,
  ];
  const out: Array<{ index: number; term: string }> = [];
  transactions.forEach((tx, i) => {
    const text = `${tx.memo ?? ''} ${tx.reference ?? ''} ${tx.note ?? ''}`;
    for (const p of patterns) {
      const m = text.match(p);
      if (m) {
        out.push({ index: i, term: m[0] });
        break;
      }
    }
  });
  return out;
}
