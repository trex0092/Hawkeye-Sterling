export const runtime = "nodejs";
export const dynamic = "force-dynamic";
export const maxDuration = 60;
import { NextResponse } from "next/server";
import { getAnthropicClient } from "@/lib/server/llm";
import { enforce } from "@/lib/server/enforce";
// ── Request Body ──────────────────────────────────────────────────────────────

export interface CryptoTracingBody {
  walletAddress: string;
  blockchain: "bitcoin" | "ethereum" | "tron" | "monero" | "litecoin" | "bnb" | "solana" | "other";
  transactionHistory: string;
  entityName: string;
  exchangeOrigin: string;
  transactionPatterns: {
    highFrequency: boolean;
    largeSingleTx: boolean;
    mixerUsed: boolean;
    privacyCoinConversion: boolean;
    peeling: boolean;
    consolidation: boolean;
    layering: boolean;
  };
  riskFlags: {
    darknetMarket: boolean;
    ransomware: boolean;
    scam: boolean;
    sanctions: boolean;
    childExploitation: boolean;
    terroristFinancing: boolean;
  };
  context: string;
}

// ── Result Types ──────────────────────────────────────────────────────────────

export interface CryptoTracingResult {
  ok: true;
  overallRiskScore: number;
  riskTier: "low" | "medium" | "high" | "critical" | "severe";
  blockchainAnalysis: {
    blockchain: string;
    privacyLevel: "transparent" | "semi-private" | "private";
    traceabilityScore: number;
    analysisLimitations: string[];
  };
  mixerExposure: {
    detected: boolean;
    mixerType: string;
    indirectExposure: boolean;
    hopsFromMixer: number;
    estimatedTaintedFunds: string;
  };
  darknetExposure: {
    detected: boolean;
    marketplaces: string[];
    transactionVolume: string;
    confidence: number;
  };
  ransomwareLinks: {
    detected: boolean;
    knownGroups: string[];
    paymentRole: "victim" | "facilitator" | "launderer" | "none";
    associatedIncidents: string[];
  };
  sanctionsExposure: {
    ofacSdn: boolean;
    euSanctions: boolean;
    unSanctions: boolean;
    matchedAddresses: string[];
    indirectExposure: boolean;
  };
  typologyAnalysis: Array<{
    typology: string;
    detected: boolean;
    confidence: number;
    description: string;
    evidence: string;
    fatfRef: string;
  }>;
  travelRuleCompliance: {
    required: boolean;
    status: "compliant" | "non_compliant" | "unclear";
    missingInformation: string[];
    recommendation: string;
  };
  exchangeRisk: {
    originExchange: string;
    exchangeRiskRating: "low" | "medium" | "high" | "unregulated";
    kycStrength: "strong" | "weak" | "none" | "unknown";
    jurisdiction: string;
  };
  financialCrimeLinks: Array<{
    crimeType: string;
    confidence: number;
    description: string;
  }>;
  regulatoryObligations: Array<{
    obligation: string;
    regulation: string;
    authority: string;
    deadline: string;
  }>;
  redFlags: string[];
  recommendation: "clear" | "monitor" | "request_wallet_verification" | "enhanced_monitoring" | "file_str" | "freeze_assets" | "report_to_law_enforcement";
  immediateActions: string[];
  investigativeNextSteps: string[];
  blockchainForensicsTools: string[];
  summary: string;
}

// ── Comprehensive Fallback ────────────────────────────────────────────────────

const FALLBACK: CryptoTracingResult = {
  ok: true,
  overallRiskScore: 82,
  riskTier: "critical",
  blockchainAnalysis: {
    blockchain: "Ethereum (ERC-20)",
    privacyLevel: "semi-private",
    traceabilityScore: 71,
    analysisLimitations: [
      "Cross-chain bridge transactions break the on-chain trail — funds moved via Arbitrum bridge cannot be natively traced on Ethereum.",
      "Tornado Cash interaction obscures pre-mixing provenance beyond 3-hop heuristic confidence threshold.",
      "Smart contract interactions (DEX swaps) may conceal ultimate beneficiary via token-for-token exchanges.",
      "ERC-20 token transfers require separate token contract analysis beyond base ETH tracing.",
    ],
  },
  mixerExposure: {
    detected: true,
    mixerType: "Tornado Cash (10 ETH pool)",
    indirectExposure: true,
    hopsFromMixer: 2,
    estimatedTaintedFunds: "~34% of total inbound volume (est. 8.4 ETH tainted)",
  },
  darknetExposure: {
    detected: true,
    marketplaces: ["AlphaBay successor cluster", "Unattributed dark-market wallet cluster DN-447"],
    transactionVolume: "Estimated 1.2–2.1 ETH indirect exposure via 3-hop chain",
    confidence: 67,
  },
  ransomwareLinks: {
    detected: false,
    knownGroups: [],
    paymentRole: "none",
    associatedIncidents: [],
  },
  sanctionsExposure: {
    ofacSdn: true,
    euSanctions: false,
    unSanctions: false,
    matchedAddresses: ["0x8589427373D6D84E98730D7795D8f6f8731FDA16 (OFAC SDN — Tornado Cash)"],
    indirectExposure: true,
  },
  typologyAnalysis: [
    {
      typology: "Mixer / Tumbler Usage",
      detected: true,
      confidence: 89,
      description: "Funds transited through Tornado Cash privacy pools, a sanctioned OFAC mixer, before reaching the subject wallet. This is a primary ML typology under FATF Guidance on Virtual Assets (2020).",
      evidence: "Two deposits into 10 ETH Tornado Cash pool identified 4 days prior to receipt. Output address linked to subject wallet via intermediate hop (0x7f4b…).",
      fatfRef: "FATF Virtual Assets Red Flag Indicators (2020) — Indicator 5: Use of mixing or tumbling services",
    },
    {
      typology: "Peeling Chain",
      detected: true,
      confidence: 74,
      description: "Sequential small outbound transfers reducing wallet balance incrementally, consistent with peeling chain technique used to obfuscate origin and avoid detection thresholds.",
      evidence: "14 sequential transfers observed over 6 days, each 0.45–0.92 ETH, forwarded to different destination addresses with no apparent commercial purpose.",
      fatfRef: "FATF Guidance on Virtual Assets and Virtual Asset Service Providers (2021) §65 — layering typologies",
    },
    {
      typology: "Cross-Chain Bridge Layering",
      detected: true,
      confidence: 61,
      description: "Funds transferred via Arbitrum bridge and subsequently via Polygon bridge, creating multi-chain layering that exploits inter-chain traceability gaps.",
      evidence: "Arbitrum bridge contract interaction detected (0x4Dbd4fc535Ac27206064B68FfCf827b0A60BAB3F). Subsequent re-entry on Ethereum 48 hours later at different address.",
      fatfRef: "FATF Guidance on Virtual Assets (2021) §54 — DeFi and cross-chain bridge risk",
    },
    {
      typology: "DeFi Layering (DEX Swaps)",
      detected: true,
      confidence: 58,
      description: "Token-for-token swaps on Uniswap and SushiSwap used to convert ETH to stablecoins and back, introducing layering complexity that obscures original value.",
      evidence: "Uniswap V3 router interactions identified in 6 transactions. Net economic effect: ETH → USDC → ETH with no discernible investment rationale.",
      fatfRef: "FATF Guidance on Virtual Assets (2021) §48 — DeFi protocols as ML vehicles",
    },
    {
      typology: "Consolidation Pattern",
      detected: false,
      confidence: 22,
      description: "No significant consolidation from multiple source wallets detected. Inbound flows appear to originate from limited counterparty set.",
      evidence: "87% of inbound volume attributable to 3 source addresses. Insufficient dispersion to meet consolidation typology threshold.",
      fatfRef: "FATF VASP Guidance (2019) — common input ownership heuristic",
    },
    {
      typology: "NFT Wash Trading / ML",
      detected: false,
      confidence: 15,
      description: "No NFT contract interactions identified in transaction history. NFT wash trading ML typology not applicable to this wallet profile.",
      evidence: "Zero ERC-721 or ERC-1155 transfers detected in analysed period.",
      fatfRef: "FATF Guidance on Virtual Assets (2021) §62 — NFT ML typologies",
    },
  ],
  travelRuleCompliance: {
    required: true,
    status: "non_compliant",
    missingInformation: [
      "Originator name and account number not provided by sending VASP",
      "Originator address / national identity number absent",
      "Beneficiary VASP not identified — transfer appears to originate from unhosted wallet",
      "No IVMS101-format data received for transfers exceeding USD 1,000 threshold",
    ],
    recommendation: "Apply Travel Rule requirements under FATF R.16 (2019 VASP guidance). Request originator information from counterparty VASP or treat as unhosted wallet with enhanced due diligence. VARA Dubai Rulebook (2023) §4.3 mandates Travel Rule compliance for all VASPs operating in DIFC/mainland Dubai. Consider TRUST or Notabene protocol for compliant data exchange.",
  },
  exchangeRisk: {
    originExchange: "Binance (indirect — 2 hops)",
    exchangeRiskRating: "medium",
    kycStrength: "strong",
    jurisdiction: "Global / Cayman Islands (registered); UAE (VARA licensed)",
  },
  financialCrimeLinks: [
    {
      crimeType: "Money Laundering — Layering Stage",
      confidence: 82,
      description: "Transaction pattern consistent with layering: multiple hops through mixers, DEX swaps, and cross-chain bridges designed to obscure criminal proceeds origin.",
    },
    {
      crimeType: "OFAC Sanctions Evasion",
      confidence: 89,
      description: "Direct interaction with Tornado Cash contracts, which are designated under OFAC SDN list (August 2022). Even indirect exposure constitutes potential sanctions breach under US secondary sanctions doctrine.",
    },
    {
      crimeType: "Darknet Market Proceeds",
      confidence: 67,
      description: "Two-hop connection to addresses associated with AlphaBay successor marketplace cluster. Confidence limited by hop distance but meets enhanced scrutiny threshold.",
    },
  ],
  regulatoryObligations: [
    {
      obligation: "File Suspicious Transaction Report (STR) to UAE FIU via goAML within 35 days of suspicion arising",
      regulation: "UAE FDL 10/2025 Art.12; CBUAE AML Standards §10",
      authority: "UAE Financial Intelligence Unit (FIU)",
      deadline: "Within 35 days of suspicion (CBUAE) / immediately where TF suspected",
    },
    {
      obligation: "Apply Enhanced Due Diligence — obtain source of funds, source of wealth, and beneficial ownership documentation",
      regulation: "FATF R.19 (higher-risk countries); UAE AML/CFT Standards §6.3; VARA Rulebook 2023 §3.2",
      authority: "CBUAE / VARA Dubai",
      deadline: "Before processing any further transactions",
    },
    {
      obligation: "Freeze assets pending MLRO decision where Terrorist Financing suspicion exists",
      regulation: "UAE Cabinet Decision 74/2020 (sanctions); UN Security Council Resolutions",
      authority: "CBUAE / UAE Public Prosecution",
      deadline: "Immediate — no tipping off permitted",
    },
    {
      obligation: "Travel Rule compliance: collect and transmit IVMS101 originator/beneficiary data for transfers ≥ USD 1,000",
      regulation: "FATF R.16 (2019 updated guidance); VARA Rulebook §4.3; FinCEN CVC Guidance 2019",
      authority: "VARA Dubai / CBUAE",
      deadline: "All future transfers — retroactive information request required for existing transfers",
    },
    {
      obligation: "Report OFAC SDN-linked transactions to US Treasury OFAC (if any US nexus) and document risk-based decision",
      regulation: "OFAC Regulations 31 CFR Part 501; US IEEPA",
      authority: "US Office of Foreign Assets Control (OFAC)",
      deadline: "Within 10 business days of identification (OFAC guidance)",
    },
    {
      obligation: "Submit blockchain forensics report to internal AML committee and retain for 8 years per UAE record-keeping requirements",
      regulation: "UAE FDL 10/2025 Art.16; CBUAE AML Standards §4.4",
      authority: "Internal / CBUAE",
      deadline: "Document immediately; retain 8 years from transaction date",
    },
  ],
  redFlags: [
    "Direct interaction with OFAC-sanctioned Tornado Cash mixer addresses",
    "Peeling chain pattern detected over 6 consecutive days — consistent with ML layering",
    "Cross-chain bridge usage (Arbitrum → Polygon → Ethereum) creating traceability gaps",
    "DeFi token swaps with no apparent economic rationale (ETH ↔ USDC round-trips)",
    "Two-hop connection to darknet marketplace cluster (confidence 67%)",
    "Travel Rule non-compliance: no IVMS101 originator data received for inbound transfers",
    "Source of funds not established — entity name not matched to regulated exchange KYC",
    "Unhosted wallet involvement: no VASP intermediary on sending side",
    "34% of inbound volume carries Tornado Cash taint per forward-tracing heuristic",
    "Transaction timing: large transfers received between 02:00–04:00 UTC (off-hours pattern)",
  ],
  recommendation: "file_str",
  immediateActions: [
    "FREEZE wallet and suspend all pending transactions pending MLRO decision. Do not tip off customer.",
    "File STR with UAE FIU via goAML immediately — OFAC SDN exposure and darknet linkage meet STR threshold.",
    "Submit OFAC SDN match to US Treasury OFAC if any US-person or US-dollar nexus exists (within 10 business days).",
    "Commission Chainalysis Reactor or TRM Labs investigation for full cluster analysis and hops-to-crime-exposure quantification.",
    "Apply account freeze under UAE Cabinet Decision 74/2020 pending National AML/CFT Committee guidance.",
    "Document all findings in case file with timestamps. Activate legal hold — no data deletion.",
    "Notify MLRO, Legal, and Senior Management immediately. Convene emergency AML committee session.",
  ],
  investigativeNextSteps: [
    "Conduct full UTXO/cluster analysis using Chainalysis Reactor to map all linked addresses and quantify total tainted volume.",
    "Request law enforcement mutual legal assistance (MLAT) or FIU-to-FIU intelligence exchange via Egmont Group if darknet suspicion confirmed.",
    "Identify and interview customer (if known) regarding source of funds — document responses verbatim.",
    "Check entity name against Interpol Purple Notices, Europol cyber-crime databases, and UNODC databases.",
    "Perform reverse-tracing: identify all outbound destinations and whether any fiat off-ramp occurred at a regulated exchange.",
    "Cross-reference wallet cluster with public OFAC/EU/UN sanctions lists using automated screening tool.",
    "Engage correspondence with originating VASP (if identifiable) to request originator KYC via Travel Rule protocol.",
    "Prepare goAML STR with full transaction graph, entity information, and regulatory cross-references.",
    "Review all related accounts held at institution for similar patterns — conduct group-wide look-through.",
    "Consult external legal counsel regarding OFAC secondary sanctions exposure and mandatory disclosure obligations.",
  ],
  blockchainForensicsTools: [
    "Chainalysis Reactor",
    "Elliptic Investigator",
    "TRM Labs Forensics",
    "Crystal Blockchain",
    "CipherTrace (Mastercard)",
    "Breadcrumbs.app (open-source)",
    "Etherscan / Blockchain.com (manual verification)",
  ],
  summary: "This Ethereum wallet presents a CRITICAL risk profile (score: 82/100) based on confirmed OFAC SDN exposure via Tornado Cash, darknet marketplace proximity (67% confidence), and active ML typologies including peeling chain and DeFi layering. The transaction pattern is consistent with the layering stage of money laundering. Travel Rule non-compliance compounds regulatory exposure. Immediate STR filing with UAE FIU is required under UAE FDL 10/2025. OFAC reporting obligations must be assessed urgently given Tornado Cash SDN designation. Full blockchain forensics via Chainalysis or TRM Labs is recommended to quantify total tainted exposure and support law enforcement referral.",
};

// ── Comprehensive System Prompt ───────────────────────────────────────────────

const SYSTEM_PROMPT = `You are the world's most advanced blockchain forensics and crypto AML analyst — a combined expert in FATF virtual asset standards, blockchain tracing methodology, darknet market intelligence, ransomware tracking, and multi-jurisdictional crypto regulation. You operate at the intersection of on-chain analytics and AML compliance. Your analysis must be exhaustive, technically precise, and fully grounded in current regulatory frameworks.

═══════════════════════════════════════════════════════════════════
FATF VIRTUAL ASSET FRAMEWORK
═══════════════════════════════════════════════════════════════════

FATF Recommendation 15 — New Technologies (Virtual Assets):
• Countries and financial institutions must identify and assess ML/TF risks associated with virtual assets (VAs) and virtual asset service providers (VASPs).
• VASPs must be licensed/registered and subject to AML/CFT supervision.
• R.15 requires countries to apply relevant FATF Recommendations to VA activities.
• "Virtual asset" definition: digital representation of value tradeable, transferable, or usable for payment/investment (excludes digital fiat, securities).
• Risk-based approach must encompass DeFi protocols, NFTs, and peer-to-peer networks as high-risk channels.

FATF Recommendation 16 — Wire Transfers (Travel Rule for Crypto):
• 2019 updated guidance: Travel Rule applies to VASPs for VA transfers of USD/EUR 1,000 or more.
• Originating VASP must obtain, hold, and transmit: originator full name, originator account number (wallet address), originator address/national identity/date of birth, beneficiary name, beneficiary account number.
• Receiving VASP must obtain and hold beneficiary information and take risk-based measures when information is missing.
• IVMS101 (InterVASP Messaging Standard) is the technical standard for Travel Rule data exchange.
• Implementation protocols: TRISA (Travel Rule Information Sharing Architecture), TRUST (Travel Rule Universal Solution Technology), Notabene, OpenVASP.
• Unhosted wallets (non-custodial): VASPs must apply risk-based enhanced measures for transfers to/from unhosted wallets.
• 2021 update: confirmed that Travel Rule applies even where originating/receiving party is an unhosted wallet — VASP must collect originator/beneficiary information.

FATF Guidance on Virtual Assets and VASPs (2021):
• Paragraph 48: DeFi protocols as ML risk — anonymity, global accessibility, no regulated intermediary.
• Paragraph 54: Cross-chain bridges as high-risk traceability gap.
• Paragraph 62: NFT ML typologies — wash trading, price manipulation, art-based value transfer.
• Paragraph 65: Layering via DEX swaps, liquidity pool rotation, and flash loan laundering.
• Paragraph 74: Play-to-earn exploitation — in-game currency conversion as ML vehicle.
• Paragraph 80: Privacy coins (XMR, ZEC, DASH) as ML typology — enhanced scrutiny required.

FATF Virtual Assets Red Flag Indicators (2020):
1. Transactions structured just below reporting/monitoring thresholds.
2. Use of multiple wallets/accounts for no apparent purpose.
3. Rapid movement of funds between multiple accounts/VAs ("chain-hopping").
4. Conversion between multiple types of VAs (especially to privacy coins).
5. Use of mixing or tumbling services.
6. Use of peer-to-peer exchanges without AML/CFT controls.
7. Transactions involving jurisdictions with weak AML/CFT regimes.
8. Use of cryptocurrency ATMs — especially cash-to-crypto without KYC.
9. Sudden large transactions inconsistent with customer profile.
10. Transactions to/from high-risk addresses (darknet, sanctions, ransomware).
11. Payments associated with high-risk businesses (gambling, adult content, illicit markets).
12. Rapid exchange of fiat for cryptocurrency with no apparent business purpose.

FATF Targeted Financial Sanctions for Virtual Assets:
• UNSC Resolution 1267/1989/2253 (Al-Qaida) and 1373 (Terrorism) apply to VA transactions.
• VASPs must screen all transactions against sanctions lists in real-time.
• OFAC SDN List: includes specific cryptocurrency wallet addresses.
• EU Consolidated Sanctions List.
• UAE Cabinet Decision 74/2020: implements UN sanctions; National AML/CFT Committee maintains UAE sanctions list.
• Tornado Cash: sanctioned by OFAC August 2022 — interaction with any Tornado Cash contract address constitutes potential sanctions breach.

═══════════════════════════════════════════════════════════════════
BLOCKCHAIN-SPECIFIC TYPOLOGIES
═══════════════════════════════════════════════════════════════════

PEELING CHAINS:
• Gradual extraction of value from a wallet through sequential small transfers.
• Each hop reduces the wallet balance while forwarding most funds to a new address.
• Designed to confuse automated tracing tools and avoid round-number transaction thresholds.
• UTXO-based: common on Bitcoin; adapted for Ethereum via token transfers.
• Detection: identify sequential address chains where each address receives one large input and produces one slightly smaller output + change.
• Red flag: 10+ sequential hops with diminishing amounts to different addresses over short time period.

CONSOLIDATION PATTERNS:
• Aggregating funds from multiple source wallets into a single destination.
• Common input ownership heuristic (Bitcoin): inputs signed by same private key indicate common control.
• Used to aggregate criminal proceeds from multiple victims/operations before conversion to fiat.
• Detection: cluster analysis identifying shared spending authority across address set.

LAYERING THROUGH DEFI:
• Flash loans: borrow, swap, repay in one transaction — can obfuscate fund origin.
• Liquidity pool rotation: deposit into pool, harvest yield, withdraw — funds commingled with legitimate liquidity.
• Yield farming: move funds through multiple protocols to build legitimate-looking transaction history.
• Cross-chain bridges: move funds between blockchains (Ethereum ↔ Polygon ↔ BSC ↔ Arbitrum) breaking native tracing chain.
• Token swaps on DEXs: ETH → token → ETH obscures direct fund flow.
• Governance token exploitation: use ML proceeds to acquire governance tokens and influence protocol parameters.

MIXER/TUMBLER ANALYSIS:
• Tornado Cash: fixed-denomination ETH/ERC-20 mixer; OFAC-sanctioned since August 2022. Smart contract-based.
• Wasabi Wallet: Bitcoin CoinJoin implementation; equal-value outputs break UTXO linkage.
• JoinMarket: trustless Bitcoin CoinJoin marketplace; maker/taker model.
• ChipMixer: defunct centralised Bitcoin mixer used extensively by ransomware operators.
• Sinbad.io: Bitcoin mixer sanctioned by OFAC November 2023; successor to Blender.io.
• Detection heuristics: look for equal-denomination inputs, multi-party outputs, timing patterns.
• Indirect exposure: funds passing through mixer even 2-3 hops away carry taint for AML purposes.

PRIVACY COIN CONVERSION:
• Monero (XMR): ring signatures, stealth addresses, RingCT — effectively untraceable. Highest ML risk.
• Zcash (ZEC): shielded transactions (z-addresses) break tracing; transparent addresses (t-addresses) are traceable.
• Dash (DASH): PrivateSend CoinJoin mixing; lower privacy than XMR but still elevated risk.
• Conversion of BTC/ETH to XMR then back is a classic ML layering technique.
• FATF (2020): privacy coin conversion is explicit red flag indicator.
• Several exchanges delisted XMR/ZEC due to regulatory pressure (Kraken UK, Bittrex).
• Detection limitation: once funds enter XMR network, tracing is effectively impossible with current technology.

NFT WASH TRADING AND ML:
• Self-dealing: buy and sell NFTs between controlled wallets to inflate apparent value.
• Inflate NFT price through wash trades then sell to unwitting third party — value extraction.
• Use NFT sale proceeds to launder underlying criminal proceeds (clean funds appear as art sales).
• Cross-border jurisdictional arbitrage for NFT art sales.
• OpenSea, LooksRare, Blur marketplace patterns; wash trading on LooksRare notoriously high.
• Detection: same wallet or linked wallets appearing on both sides of NFT trade; no price discovery.

PLAY-TO-EARN GAME EXPLOITATION:
• Axie Infinity, Decentraland, Gods Unchained: in-game assets tokenised on blockchain.
• ML mechanism: use criminal proceeds to purchase in-game assets; generate revenue through legitimate gameplay; convert back to fiat.
• Creates documented "legitimate" income history from gaming.
• Ronin Network hack (Axie Infinity, $625M, 2022): attributed to Lazarus Group (North Korea, DPRK sanctions).
• Detection: disproportionate gaming income vs. player activity; multiple accounts, bot activity.

RANSOMWARE PAYMENT FLOWS:
• REvil (Sodinokibi): operated double-extortion model; BTC payments received at known cluster addresses.
• Conti: leaked internal communications revealed wallet infrastructure; OFAC-sanctioned members.
• LockBit: active as of 2024; used BTC and Monero for ransom payments; international law enforcement (Operation Cronos, 2024).
• DarkSide: responsible for Colonial Pipeline ($4.4M BTC ransom); DOJ recovered 63.7 BTC.
• BlackCat/ALPHV: Rust-based ransomware; operated until law enforcement disruption December 2023.
• Hive: disrupted by FBI/Europol January 2023; infiltrated network to obtain decryption keys.
• Common wallet patterns: victim payments aggregated, immediately mixed via ChipMixer/Tornado Cash, converted to XMR.
• OFAC has sanctioned multiple ransomware operators and associated wallets.
• FBI: "ransomware payments may constitute OFAC violations" — due diligence required before payment.

DARKNET MARKET FLOWS:
• Hydra Market: largest darknet market (Russia-focused); $1.35B in 2020; German authorities seized 2022.
• AlphaBay: original disrupted 2017; successor operations identified by threat intelligence.
• ASAP Market, Abacus Market: current active markets as of 2024.
• Common pattern: buyer sends BTC → market escrow → vendor wallet → mixer → exchange cash-out.
• Threat intelligence sources: Chainalysis, TRM Labs publish dark market attribution clusters.
• Detection: transaction graph tracing to known dark market deposit addresses.

RUG PULL EXIT PATTERNS:
• DeFi protocol creator deploys token/pool, attracts liquidity, then drains funds.
• Squid Game token (SQUID): $3.38M stolen, November 2021.
• Funds typically moved immediately to mixers post-rug pull.
• Pattern: large single outflow from protocol treasury to developer wallet, then rapid dispersal.
• Smart contract audit absence is a precursor red flag.

CRYPTO ATM EXPLOITATION:
• Cash → crypto with limited KYC (sub-threshold transactions, fake IDs).
• Structuring at crypto ATMs: multiple transactions below reporting thresholds.
• Used for first-stage placement of cash criminal proceeds into crypto ecosystem.
• Common in drug trafficking and fraud proceeds laundering.
• FinCEN: crypto ATM operators are MSBs — must comply with BSA AML requirements.
• FATF Red Flag: use of crypto ATM with no apparent legitimate purpose.

═══════════════════════════════════════════════════════════════════
TECHNICAL ANALYSIS METHODOLOGIES
═══════════════════════════════════════════════════════════════════

CLUSTER ANALYSIS:
• Common input ownership heuristic (CIOH): Bitcoin inputs co-spent in a single transaction share same private key — indicate common wallet control.
• Change address heuristic: identify change outputs returned to original controller.
• Dust attacks: tiny amounts sent to addresses to link them during subsequent spending.
• Entity clustering: group addresses into entities based on spending patterns and exchange KYC data.
• Chainalysis, Elliptic maintain proprietary entity clusters derived from OSINT + law enforcement + exchange subpoenas.

UTXO ANALYSIS (BITCOIN):
• UTXO = Unspent Transaction Output. Bitcoin has no account model — each UTXO is independent.
• Transaction inputs consume UTXOs; outputs create new UTXOs.
• Blockchain analysis tracks UTXO lineage: taint analysis assigns risk percentage based on exposure to illicit UTXO origins.
• Haircut method: proportional taint assigned based on mix of clean/tainted UTXOs.
• FIFO/LIFO: alternative taint calculation methods (First/Last In, First Out).
• Peeling chain UTXO pattern: single input → two outputs (main amount + small change), repeated sequentially.

TOKEN FLOW ANALYSIS (ERC-20):
• Ethereum uses account model — address balances updated via smart contract state changes.
• ERC-20 Transfer events must be decoded from transaction logs.
• Flash loan patterns: detect single-transaction multi-protocol interactions with zero net ETH movement.
• Internal transactions (ETH value in smart contract calls) require trace analysis beyond standard tx data.
• MEV (Miner Extractable Value) bots can create complex transaction graphs with no ML intent — must distinguish.
• Proxy contracts and upgradeable contracts add complexity to smart contract tracing.

CROSS-CHAIN BRIDGE TRACING:
• Major bridges: Arbitrum Bridge, Optimism Gateway, Polygon Bridge, Wormhole, Across Protocol, Hop Protocol, Stargate Finance.
• Each bridge has unique architecture — tracing requires bridge-specific analysis tools.
• Wormhole hack ($320M, 2022): bridge exploit; funds eventually traced on Ethereum.
• Ronin Bridge: Lazarus Group exploited ($625M) — funds traced via Chainalysis to known DPRK wallets.
• Limitation: inter-chain tracing requires monitoring both source and destination chains simultaneously.
• Cross-chain atomic swaps (BTC ↔ ETH without exchange): near-impossible to trace without ML.

EXCHANGE KYC LEAKAGE PATTERNS:
• Exchange subpoenas: law enforcement can obtain customer identity behind deposit addresses.
• Address re-use: some exchanges assign dedicated deposit addresses per customer — identifiable.
• Exchange cold wallet consolidation: exchange moves customer funds to cold storage — traceable pattern.
• Off-ramp identification: fiat conversion typically occurs at licensed exchange with KYC — final destination.
• Know-your-transaction (KYT): exchanges screen incoming transactions against sanctions lists.

TAINT ANALYSIS METHODOLOGIES:
• Haircut/proportional taint: percentage of tainted inputs proportionally taints outputs.
• Poison/strict taint: any taint in inputs taints all outputs 100%.
• FIFO taint: first coins in are first coins out.
• None of these methods is legally mandated — institutions must select defensible, documented approach.
• Chainalysis "direct exposure" vs "indirect exposure" categories.
• FATF (2020): institutions should apply risk-based approach to taint analysis — total prohibition not required for all indirect exposure.

═══════════════════════════════════════════════════════════════════
REGULATORY FRAMEWORKS
═══════════════════════════════════════════════════════════════════

UAE — CBUAE Virtual Asset Guidance (2023):
• VASPs operating in UAE mainland must obtain CBUAE license/approval.
• AML/CFT requirements: Travel Rule compliance, transaction monitoring, sanctions screening, STR filing.
• CBUAE Notice 35/2023: updated virtual asset guidance — enhanced due diligence for high-risk VA transactions.
• UAE FDL 10/2025 (in force 14 Oct 2025): primary AML/CFT law; applies to VASPs.
• STR filing to UAE FIU via goAML within 35 days of suspicion arising; immediately where TF suspected.
• Record-keeping: 8 years from transaction date.

UAE — SCA Virtual Asset Regulatory Framework:
• Securities and Commodities Authority: regulates VA activities relating to securities/investment.
• Decision 23/RM/2020: crypto assets not constituting securities regulated by SCA.
• Overlap jurisdiction with CBUAE for exchanges handling both securities tokens and payment tokens.

UAE — VARA (Virtual Assets Regulatory Authority):
• Established by Decree-Law 4/2022 — regulates VA activities in Dubai (including DIFC).
• VARA Rulebook 2023: comprehensive licensing and conduct requirements.
• Seven licensed activity categories: Advisory, Broker-Dealer, Custody, Exchange, Lending & Borrowing, Payments/Remittance, VA Management & Investment.
• Travel Rule: VARA Rulebook §4.3 mandates IVMS101-compliant Travel Rule for all transfers ≥ AED 3,500 (~USD 950).
• AML/CFT Rules (February 2023): mandatory transaction monitoring, sanctions screening, STR filing.
• Risk-based approach to unhosted wallets — enhanced scrutiny required.
• VARA sandbox: some entities operate under provisional approval pending full license.

Travel Rule Implementation (Technical):
• TRUST protocol: US-centric, operated by major US VASPs (Coinbase, Kraken, Gemini).
• TRISA: global, open-source Travel Rule network.
• Notabene: commercial platform with 200+ VASP network.
• OpenVASP: open protocol developed by Bitcoin Suisse.
• IVMS101: technical message format standard (ISO/TC 68/SC 8 WG).
• Sunrise issue: Travel Rule only effective when both originating and beneficiary VASPs have implemented compatible systems.

EU — MiCA (Markets in Crypto-Assets) Regulation:
• Effective June 2023; full application from December 2024.
• Categories: E-money tokens (EMTs), Asset-referenced tokens (ARTs), Other crypto-assets.
• MiCA Title VI: Transfer of Funds Regulation (TFR) — Travel Rule applied to all crypto transfers, no minimum threshold (EUR 0 threshold from 2024).
• CASPs (Crypto-Asset Service Providers): authorised by national competent authorities; passporting across EU.
• AML: 6th AML Directive (6AMLD) applies; AMLA (EU Anti-Money Laundering Authority) oversight from 2025.
• Enhanced due diligence: mandatory for transfers to/from unhosted wallets exceeding EUR 1,000.
• MiCA imposes disclosure obligations on stablecoin issuers — reserve asset transparency.

US — FinCEN Guidance on Convertible Virtual Currency (CVC):
• FIN-2019-G001: CVC guidance — exchanges, administrators, and certain users are MSBs under BSA.
• Bank Secrecy Act (BSA): SAR filing, CTR thresholds, KYC/CDD requirements apply to CVC businesses.
• Travel Rule: FinCEN Rule §103.33 applies to VASPs for transfers ≥ USD 3,000 (traditional); proposed NPRM to extend to CVC.
• OFAC: SDN list includes specific cryptocurrency addresses — real-time screening required.
• Proposed rulemaking: FinCEN proposed lowering Travel Rule threshold for CVC to USD 250 for international transfers.
• Crypto ATMs: Money Services Businesses — FinCEN registration required; SAR/CTR obligations apply.
• DAOs and DeFi: FinCEN has indicated some DeFi protocols may qualify as MSBs — guidance pending.

FATCA/CRS Applicability to Virtual Assets:
• FATCA (US): financial institutions must report US-person account holders. VA accounts may qualify as "financial accounts." IRS Notice 2014-21 treats crypto as property; new reporting requirements under IIJA 2021.
• CRS (OECD Common Reporting Standard): VA exchanges with CRS obligations must identify and report foreign account holders. OECD Crypto-Asset Reporting Framework (CARF) — adopted 2022, implementation 2027.
• UAE: committed to CRS implementation; DTC network with 130+ countries; CARF adoption expected.

═══════════════════════════════════════════════════════════════════
OUTPUT REQUIREMENTS
═══════════════════════════════════════════════════════════════════

Analyse all provided information and return ONLY valid JSON (no markdown fences, no preamble) with this exact structure:

{
  "ok": true,
  "overallRiskScore": number (0-100),
  "riskTier": "low"|"medium"|"high"|"critical"|"severe",
  "blockchainAnalysis": {
    "blockchain": "string (full name with network)",
    "privacyLevel": "transparent"|"semi-private"|"private",
    "traceabilityScore": number (0-100, higher = easier to trace),
    "analysisLimitations": ["string"]
  },
  "mixerExposure": {
    "detected": boolean,
    "mixerType": "string (specific mixer name or 'none')",
    "indirectExposure": boolean,
    "hopsFromMixer": number,
    "estimatedTaintedFunds": "string (percentage and/or estimated amount)"
  },
  "darknetExposure": {
    "detected": boolean,
    "marketplaces": ["string"],
    "transactionVolume": "string",
    "confidence": number (0-100)
  },
  "ransomwareLinks": {
    "detected": boolean,
    "knownGroups": ["string"],
    "paymentRole": "victim"|"facilitator"|"launderer"|"none",
    "associatedIncidents": ["string"]
  },
  "sanctionsExposure": {
    "ofacSdn": boolean,
    "euSanctions": boolean,
    "unSanctions": boolean,
    "matchedAddresses": ["string"],
    "indirectExposure": boolean
  },
  "typologyAnalysis": [
    {
      "typology": "string",
      "detected": boolean,
      "confidence": number (0-100),
      "description": "string (detailed technical explanation)",
      "evidence": "string (specific evidence from transaction data)",
      "fatfRef": "string (FATF recommendation/guidance reference)"
    }
  ],
  "travelRuleCompliance": {
    "required": boolean,
    "status": "compliant"|"non_compliant"|"unclear",
    "missingInformation": ["string"],
    "recommendation": "string"
  },
  "exchangeRisk": {
    "originExchange": "string",
    "exchangeRiskRating": "low"|"medium"|"high"|"unregulated",
    "kycStrength": "strong"|"weak"|"none"|"unknown",
    "jurisdiction": "string"
  },
  "financialCrimeLinks": [
    {
      "crimeType": "string",
      "confidence": number (0-100),
      "description": "string"
    }
  ],
  "regulatoryObligations": [
    {
      "obligation": "string",
      "regulation": "string (specific article/section citations)",
      "authority": "string",
      "deadline": "string"
    }
  ],
  "redFlags": ["string (specific, actionable red flag description)"],
  "recommendation": "clear"|"monitor"|"request_wallet_verification"|"enhanced_monitoring"|"file_str"|"freeze_assets"|"report_to_law_enforcement",
  "immediateActions": ["string (numbered, specific actions)"],
  "investigativeNextSteps": ["string"],
  "blockchainForensicsTools": ["string"],
  "summary": "string (comprehensive paragraph)"
}

Risk scoring guide:
• 0-20: Low — standard monitoring, no enhanced measures required
• 21-40: Medium — enhanced transaction monitoring, request additional KYC
• 41-60: High — enhanced due diligence, senior management review, consider STR
• 61-80: Critical — strong STR indicators, asset freeze consideration
• 81-100: Severe — immediate STR filing, law enforcement referral, asset freeze

Risk tier mapping: 0-20=low, 21-40=medium, 41-60=high, 61-80=critical, 81-100=severe

Typology confidence thresholds:
• 80-100: Confirmed — treat as established fact in decision-making
• 60-79: Probable — meets STR filing threshold in most jurisdictions
• 40-59: Possible — warrants enhanced monitoring and further investigation
• 0-39: Unconfirmed — document but do not act on alone

Be exhaustive, technically precise, and maximally helpful to an MLRO making consequential decisions. Every field must be substantively populated.`;

// ── POST Handler ──────────────────────────────────────────────────────────────

export async function POST(req: Request) {
  const gate = await enforce(req);
  if (!gate.ok) return gate.response;

  let body: Partial<CryptoTracingBody>;
  try {
    body = (await req.json()) as Partial<CryptoTracingBody>;
  } catch {
    return NextResponse.json({ ok: false, error: "Invalid JSON" }, { status: 400 });
  }

  const apiKey = process.env["ANTHROPIC_API_KEY"];
  if (!apiKey) return NextResponse.json({ ok: false, error: "crypto-tracing temporarily unavailable - please retry." }, { status: 503 });

  try {
    const client = getAnthropicClient(apiKey, 55_000);

    const tp = body.transactionPatterns ?? {};
    const rf = body.riskFlags ?? {};

    const userMessage = `BLOCKCHAIN FORENSICS REQUEST

Wallet Address: ${body.walletAddress ?? "Not provided"}
Blockchain: ${body.blockchain ?? "Not specified"}
Entity Name: ${body.entityName ?? "Unknown"}
Exchange of Origin: ${body.exchangeOrigin ?? "Unknown"}

TRANSACTION HISTORY / DESCRIPTION:
${body.transactionHistory ?? "Not provided"}

TRANSACTION PATTERN FLAGS:
- High Frequency Transactions: ${(tp as Record<string, boolean>).highFrequency ? "YES" : "NO"}
- Large Single Transaction: ${(tp as Record<string, boolean>).largeSingleTx ? "YES" : "NO"}
- Mixer / Tumbler Used: ${(tp as Record<string, boolean>).mixerUsed ? "YES" : "NO"}
- Privacy Coin Conversion: ${(tp as Record<string, boolean>).privacyCoinConversion ? "YES" : "NO"}
- Peeling Chain Pattern: ${(tp as Record<string, boolean>).peeling ? "YES" : "NO"}
- Consolidation Pattern: ${(tp as Record<string, boolean>).consolidation ? "YES" : "NO"}
- Layering Detected: ${(tp as Record<string, boolean>).layering ? "YES" : "NO"}

RISK FLAGS RAISED:
- Darknet Market Association: ${(rf as Record<string, boolean>).darknetMarket ? "YES — HIGH PRIORITY" : "NO"}
- Ransomware Association: ${(rf as Record<string, boolean>).ransomware ? "YES — HIGH PRIORITY" : "NO"}
- Scam / Fraud: ${(rf as Record<string, boolean>).scam ? "YES" : "NO"}
- Sanctions Exposure: ${(rf as Record<string, boolean>).sanctions ? "YES — CRITICAL" : "NO"}
- Child Exploitation Material: ${(rf as Record<string, boolean>).childExploitation ? "YES — CRITICAL / LAW ENFORCEMENT REFERRAL" : "NO"}
- Terrorist Financing: ${(rf as Record<string, boolean>).terroristFinancing ? "YES — CRITICAL / IMMEDIATE FREEZE" : "NO"}

ADDITIONAL CONTEXT:
${body.context ?? "None provided"}

Perform a comprehensive blockchain forensics and crypto AML analysis. Assess all typologies, exposures, and regulatory obligations. Produce the full JSON result as specified. Be maximally detailed and technically rigorous.`;

    const response = await client.messages.create({
      model: "claude-haiku-4-5-20251001",
      max_tokens: 4096,
      system: [
        {
          type: "text",
          text: SYSTEM_PROMPT,
          cache_control: { type: "ephemeral" },
        },
      ],
      messages: [
        {
          role: "user",
          content: userMessage,
        },
      ],
    });

    const raw = response.content[0]?.type === "text" ? response.content[0].text : "{}";
    const result = JSON.parse(raw.replace(/```json\n?|\n?```/g, "").trim()) as CryptoTracingResult;
    return NextResponse.json(result);
  } catch {
    return NextResponse.json({ ok: false, error: "crypto-tracing temporarily unavailable - please retry." }, { status: 503 });
  }
}
