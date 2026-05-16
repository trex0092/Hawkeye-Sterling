// GET /api/intel-status
//
// Tells the operator which intelligence-vendor env vars are configured
// vs missing. No secrets are returned — only the boolean "configured"
// status per provider, plus the sign-up URL for unconfigured ones so
// the operator can act on the gap.
//
// Cache-Control: no-store — env vars can change per deploy.

import { NextResponse } from "next/server";
import { activeNewsProviders } from "@/lib/intelligence/newsAdapters";
import { activeCommercialProviders } from "@/lib/intelligence/commercialAdapters";
import { activeRegistryProviders } from "@/lib/intelligence/registryAdapters";
import { activeKycProviders } from "@/lib/intelligence/kycVendorAdapters";
import { activeOnChainProviders } from "@/lib/intelligence/liveAdapters";
import { activeFreeProviders } from "@/lib/intelligence/freeAlwaysOnAdapters";
import { activeCountryRegistryAdapters } from "@/lib/intelligence/countryRegistries";
import { activeCountrySanctionAdapters } from "@/lib/intelligence/countrySanctions";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";
export const maxDuration = 60;

interface ProviderStatus {
  id: string;
  configured: boolean;
  envVars: string[];
  signupUrl?: string;
  tier: "free" | "free-toggle" | "commercial";
  category: string;
}

const PROVIDER_CATALOG: ProviderStatus[] = [
  // ── Tier 2 — free toggles ───────────────────────────────────────
  { id: "hmt-ofsi", category: "country-sanctions", tier: "free-toggle", configured: false, envVars: ["HMT_OFSI_ENABLED"], signupUrl: "https://www.gov.uk/government/publications/the-uk-sanctions-list" },
  { id: "ofac-sdn", category: "country-sanctions", tier: "free-toggle", configured: false, envVars: ["OFAC_SDN_ENABLED"], signupUrl: "https://sanctionssearch.ofac.treas.gov/" },
  { id: "eu-eba", category: "country-sanctions", tier: "free-toggle", configured: false, envVars: ["EU_EBA_ENABLED"], signupUrl: "https://webgate.ec.europa.eu/fsd/fsf" },
  { id: "un-sc", category: "country-sanctions", tier: "free-toggle", configured: false, envVars: ["UN_SC_ENABLED"], signupUrl: "https://www.un.org/securitycouncil/sanctions/information" },
  { id: "au-dfat", category: "country-sanctions", tier: "free-toggle", configured: false, envVars: ["AU_DFAT_ENABLED"], signupUrl: "https://www.dfat.gov.au/international-relations/security/sanctions" },
  { id: "ch-seco", category: "country-sanctions", tier: "free-toggle", configured: false, envVars: ["CH_SECO_ENABLED"], signupUrl: "https://www.seco.admin.ch/" },
  { id: "ca-sema", category: "country-sanctions", tier: "free-toggle", configured: false, envVars: ["CA_SEMA_ENABLED"], signupUrl: "https://www.international.gc.ca/world-monde/international_relations-relations_internationales/sanctions/" },
  { id: "nz-dpmc", category: "country-sanctions", tier: "free-toggle", configured: false, envVars: ["NZ_DPMC_ENABLED"], signupUrl: "https://www.dpmc.govt.nz/" },
  { id: "ae-eocn", category: "country-sanctions", tier: "free-toggle", configured: false, envVars: ["AE_EOCN_ENABLED"], signupUrl: "https://www.uaeiec.gov.ae/" },
  { id: "jp-meti", category: "country-sanctions", tier: "free-toggle", configured: false, envVars: ["JP_METI_ENABLED"], signupUrl: "https://www.meti.go.jp/policy/anpo/englishpage.html" },
  { id: "wikidata", category: "free-always-on", tier: "free-toggle", configured: false, envVars: ["WIKIDATA_ENABLED"], signupUrl: "https://www.wikidata.org/" },
  { id: "worldbank-debar", category: "free-always-on", tier: "free-toggle", configured: false, envVars: ["WORLDBANK_DEBAR_ENABLED"], signupUrl: "https://www.worldbank.org/en/projects-operations/procurement/debarred-firms" },
  { id: "fatf", category: "free-always-on", tier: "free-toggle", configured: false, envVars: ["FATF_ENABLED"], signupUrl: "https://www.fatf-gafi.org/en/countries/black-and-grey-lists.html" },
  { id: "gleif", category: "free-always-on", tier: "free-toggle", configured: false, envVars: ["GLEIF_ENABLED"], signupUrl: "https://www.gleif.org/en/lei-data/gleif-api" },
  { id: "opensanctions-free", category: "free-always-on", tier: "free-toggle", configured: false, envVars: ["OPENSANCTIONS_FREE_ENABLED"], signupUrl: "https://www.opensanctions.org/api/" },
  { id: "opencorporates-free", category: "free-always-on", tier: "free-toggle", configured: false, envVars: ["OPENCORPORATES_FREE_ENABLED"], signupUrl: "https://api.opencorporates.com/documentation/API-Reference" },
  { id: "interpol-red-notices", category: "free-always-on", tier: "free-toggle", configured: false, envVars: ["INTERPOL_RED_NOTICES_ENABLED"], signupUrl: "https://www.interpol.int/en/How-we-work/Notices/Red-Notices/View-Red-Notices" },
  { id: "fbi-most-wanted", category: "free-always-on", tier: "free-toggle", configured: false, envVars: ["FBI_MOST_WANTED_ENABLED"], signupUrl: "https://www.fbi.gov/wanted" },
  { id: "occrp-aleph", category: "free-always-on", tier: "free-toggle", configured: false, envVars: ["OCCRP_ALEPH_ENABLED"], signupUrl: "https://aleph.occrp.org/" },
  { id: "eu-fsf", category: "free-always-on", tier: "free-toggle", configured: false, envVars: ["EU_FSF_ENABLED"], signupUrl: "https://www.opensanctions.org/datasets/eu_fsf/" },
  { id: "un-sc-sanctions", category: "free-always-on", tier: "free-toggle", configured: false, envVars: ["UN_SC_SANCTIONS_ENABLED"], signupUrl: "https://www.opensanctions.org/datasets/un_sc_sanctions/" },
  { id: "bis-entity-list", category: "free-always-on", tier: "free-toggle", configured: false, envVars: ["BIS_ENTITY_LIST_ENABLED"], signupUrl: "https://www.opensanctions.org/datasets/us_bis_elist/" },
  { id: "samgov-exclusions", category: "free-always-on", tier: "free-toggle", configured: false, envVars: ["SAMGOV_EXCLUSIONS_ENABLED"], signupUrl: "https://sam.gov/search/?index=ei" },
  { id: "open-ownership", category: "free-always-on", tier: "free-toggle", configured: false, envVars: ["OPEN_OWNERSHIP_ENABLED"], signupUrl: "https://register.openownership.org/" },
  { id: "eu-transparency-register", category: "free-always-on", tier: "free-toggle", configured: false, envVars: ["EU_TRANSPARENCY_REGISTER_ENABLED"], signupUrl: "https://ec.europa.eu/transparencyregister/" },
  { id: "dfsa-register", category: "free-always-on", tier: "free-toggle", configured: false, envVars: ["DFSA_REGISTER_ENABLED"], signupUrl: "https://www.dfsa.ae/public-register" },
  { id: "adgm-register", category: "free-always-on", tier: "free-toggle", configured: false, envVars: ["ADGM_REGISTER_ENABLED"], signupUrl: "https://www.adgm.com/fsra/public-register" },
  { id: "cbuae-licensed", category: "free-always-on", tier: "free-toggle", configured: false, envVars: ["CBUAE_LICENSED_ENABLED"], signupUrl: "https://centralbank.ae/en/licensed-institutions" },
  { id: "court-listener", category: "free-always-on", tier: "free-toggle", configured: false, envVars: ["COURT_LISTENER_ENABLED"], signupUrl: "https://www.courtlistener.com/api/" },
  { id: "icij-offshore-leaks", category: "free-always-on", tier: "free-toggle", configured: false, envVars: ["ICIJ_OFFSHORE_LEAKS_ENABLED"], signupUrl: "https://offshoreleaks.icij.org/" },
  { id: "imo-ship-registry", category: "free-always-on", tier: "free-toggle", configured: false, envVars: ["IMO_SHIP_REGISTRY_ENABLED"], signupUrl: "https://gisis.imo.org/public/ships/" },
  { id: "faa-aircraft-registry", category: "free-always-on", tier: "free-toggle", configured: false, envVars: ["FAA_AIRCRAFT_REGISTRY_ENABLED"], signupUrl: "https://registry.faa.gov/aircraftinquiry/" },
  { id: "sec-edgar", category: "country-registry", tier: "free-toggle", configured: false, envVars: ["SEC_EDGAR_ENABLED"], signupUrl: "https://www.sec.gov/edgar.shtml" },
  { id: "br-receita", category: "country-registry", tier: "free-toggle", configured: false, envVars: ["BR_RECEITA_ENABLED"], signupUrl: "https://www.receita.fazenda.gov.br/" },
  { id: "co-rues", category: "country-registry", tier: "free-toggle", configured: false, envVars: ["CO_RUES_ENABLED"], signupUrl: "https://www.rues.org.co/" },
  { id: "ua-yedr", category: "country-registry", tier: "free-toggle", configured: false, envVars: ["UA_YEDR_ENABLED"], signupUrl: "https://opendatabot.ua/" },
  { id: "zefix", category: "country-registry", tier: "free-toggle", configured: false, envVars: ["ZEFIX_ENABLED"], signupUrl: "https://www.zefix.ch/" },
  { id: "bronnoysund", category: "country-registry", tier: "free-toggle", configured: false, envVars: ["BRONNOYSUND_ENABLED"], signupUrl: "https://www.brreg.no/" },
  { id: "ytj", category: "country-registry", tier: "free-toggle", configured: false, envVars: ["YTJ_ENABLED"], signupUrl: "https://www.ytj.fi/" },
  { id: "google-news-rss", category: "news", tier: "free-toggle", configured: false, envVars: ["GOOGLE_NEWS_RSS_ENABLED"], signupUrl: "https://news.google.com/" },
  { id: "hackernews", category: "news", tier: "free-toggle", configured: false, envVars: ["HACKER_NEWS_ENABLED"], signupUrl: "https://news.ycombinator.com/" },
  { id: "mastodon", category: "news", tier: "free-toggle", configured: false, envVars: ["MASTODON_INSTANCE"], signupUrl: "https://joinmastodon.org/" },

  // ── Tier 1 — free keys (news/adverse-media) ─────────────────────
  { id: "propublica", category: "news", tier: "free", configured: false, envVars: ["PROPUBLICA_API_KEY"], signupUrl: "https://www.propublica.org/datastore/api" },
  { id: "newsapi", category: "news", tier: "free", configured: false, envVars: ["NEWSAPI_API_KEY"], signupUrl: "https://newsapi.org/register" },
  { id: "gnews", category: "news", tier: "free", configured: false, envVars: ["GNEWS_API_KEY"], signupUrl: "https://gnews.io/register" },
  { id: "marketaux", category: "news", tier: "free", configured: false, envVars: ["MARKETAUX_API_KEY"], signupUrl: "https://www.marketaux.com/account/dashboard" },
  { id: "newsdata", category: "news", tier: "free", configured: false, envVars: ["NEWSDATA_API_KEY"], signupUrl: "https://newsdata.io/register" },
  { id: "mediastack", category: "news", tier: "free", configured: false, envVars: ["MEDIASTACK_API_KEY"], signupUrl: "https://mediastack.com/signup/free" },
  { id: "currents", category: "news", tier: "free", configured: false, envVars: ["CURRENTS_API_KEY"], signupUrl: "https://currentsapi.services/en/register" },
  { id: "newscatcher", category: "news", tier: "free", configured: false, envVars: ["NEWSCATCHER_API_KEY"], signupUrl: "https://newscatcherapi.com/free-news-api" },
  { id: "worldnews", category: "news", tier: "free", configured: false, envVars: ["WORLDNEWS_API_KEY"], signupUrl: "https://worldnewsapi.com/api-key" },
  { id: "thenewsapi", category: "news", tier: "free", configured: false, envVars: ["THENEWSAPI_API_KEY"], signupUrl: "https://www.thenewsapi.com/register" },
  { id: "guardian", category: "news", tier: "free", configured: false, envVars: ["GUARDIAN_API_KEY"], signupUrl: "https://open-platform.theguardian.com/access/" },
  { id: "nyt", category: "news", tier: "free", configured: false, envVars: ["NYT_API_KEY"], signupUrl: "https://developer.nytimes.com/get-started" },
  { id: "alphavantage", category: "news", tier: "free", configured: false, envVars: ["ALPHAVANTAGE_API_KEY"], signupUrl: "https://www.alphavantage.co/support/#api-key" },
  { id: "tiingo", category: "news", tier: "free", configured: false, envVars: ["TIINGO_API_KEY"], signupUrl: "https://api.tiingo.com/account/api/token" },
  { id: "cryptopanic", category: "news", tier: "free", configured: false, envVars: ["CRYPTOPANIC_API_KEY"], signupUrl: "https://cryptopanic.com/developers/api/" },
  { id: "reddit", category: "news", tier: "free", configured: false, envVars: ["REDDIT_CLIENT_ID", "REDDIT_CLIENT_SECRET"], signupUrl: "https://www.reddit.com/prefs/apps" },
  { id: "stocktwits", category: "news", tier: "free", configured: false, envVars: ["STOCKTWITS_API_KEY"], signupUrl: "https://api.stocktwits.com/developers" },
  { id: "aylien", category: "news", tier: "free", configured: false, envVars: ["AYLIEN_APP_ID", "AYLIEN_API_KEY"], signupUrl: "https://aylien.com/news-api" },
  { id: "eventregistry", category: "news", tier: "free", configured: false, envVars: ["EVENTREGISTRY_API_KEY"], signupUrl: "https://eventregistry.org/register" },
  { id: "mediacloud", category: "news", tier: "free", configured: false, envVars: ["MEDIACLOUD_API_KEY"], signupUrl: "https://mediacloud.org/" },
  { id: "stocknews", category: "news", tier: "free", configured: false, envVars: ["STOCKNEWS_API_KEY"], signupUrl: "https://stocknewsapi.com/" },

  // ── Tier 1 — free corporate registries ──────────────────────────
  { id: "companies-house", category: "country-registry", tier: "free", configured: false, envVars: ["COMPANIES_HOUSE_API_KEY"], signupUrl: "https://developer-specs.company-information.service.gov.uk/" },
  { id: "opencorporates", category: "registry", tier: "free", configured: false, envVars: ["OPENCORPORATES_API_KEY"], signupUrl: "https://opencorporates.com/api_accounts/new" },
  { id: "fca-register", category: "country-registry", tier: "free", configured: false, envVars: ["FCA_API_KEY", "FCA_API_EMAIL"], signupUrl: "https://register.fca.org.uk/Services/V0.1/Documentation" },
  { id: "insee-sirene", category: "country-registry", tier: "free", configured: false, envVars: ["INSEE_API_KEY"], signupUrl: "https://api.insee.fr/catalogue/" },
  { id: "kvk", category: "country-registry", tier: "free", configured: false, envVars: ["KVK_API_KEY"], signupUrl: "https://developers.kvk.nl/" },
  { id: "cvr", category: "country-registry", tier: "free", configured: false, envVars: ["CVR_API_KEY"], signupUrl: "https://datafordeler.dk/" },
  { id: "abr", category: "country-registry", tier: "free", configured: false, envVars: ["ABR_API_GUID"], signupUrl: "https://abr.business.gov.au/Tools/WebServices" },
  { id: "nz-companies", category: "country-registry", tier: "free", configured: false, envVars: ["NZ_COMPANIES_API_KEY"], signupUrl: "https://api.business.govt.nz/" },

  // ── Tier 3 — commercial sanctions/PEP ───────────────────────────
  { id: "complyadvantage", category: "sanctions", tier: "commercial", configured: false, envVars: ["COMPLYADVANTAGE_API_KEY"], signupUrl: "https://complyadvantage.com/contact-sales/" },
  { id: "lseg-world-check", category: "sanctions", tier: "commercial", configured: false, envVars: ["LSEG_WORLDCHECK_API_KEY"], signupUrl: "https://www.lseg.com/en/risk-intelligence/world-check" },
  { id: "dowjones-rc", category: "sanctions", tier: "commercial", configured: false, envVars: ["DOWJONES_RC_API_KEY"], signupUrl: "https://professional.dowjones.com/risk/" },
  { id: "sayari", category: "sanctions", tier: "commercial", configured: false, envVars: ["SAYARI_API_KEY"], signupUrl: "https://sayari.com/contact/" },
  { id: "acuris-rdc", category: "sanctions", tier: "commercial", configured: false, envVars: ["ACURIS_RDC_API_KEY"], signupUrl: "https://www.acurisriskintelligence.com/" },
  { id: "quantexa", category: "sanctions", tier: "commercial", configured: false, envVars: ["QUANTEXA_API_KEY", "QUANTEXA_BASE_URL"], signupUrl: "https://www.quantexa.com/" },
  { id: "namescan", category: "sanctions", tier: "commercial", configured: false, envVars: ["NAMESCAN_API_KEY"], signupUrl: "https://namescan.io/" },

  // ── Commercial premium news ─────────────────────────────────────
  { id: "reuters-rdp", category: "news", tier: "commercial", configured: false, envVars: ["RDP_USERNAME", "RDP_PASSWORD", "RDP_APP_KEY"], signupUrl: "https://developers.lseg.com/" },
  { id: "factiva", category: "news", tier: "commercial", configured: false, envVars: ["FACTIVA_USER_ID", "FACTIVA_PASSWORD", "FACTIVA_CLIENT_ID"], signupUrl: "https://professional.dowjones.com/factiva/" },
  { id: "bloomberg", category: "news", tier: "commercial", configured: false, envVars: ["BLOOMBERG_API_KEY"], signupUrl: "https://www.bloomberg.com/professional/" },
  { id: "factset", category: "news", tier: "commercial", configured: false, envVars: ["FACTSET_USERNAME", "FACTSET_API_KEY"], signupUrl: "https://www.factset.com/" },
  { id: "spglobal", category: "news", tier: "commercial", configured: false, envVars: ["SPGLOBAL_API_KEY"], signupUrl: "https://www.spglobal.com/marketintelligence/" },
  { id: "lexisnexis-newsdesk", category: "news", tier: "commercial", configured: false, envVars: ["LEXISNEXIS_NEWSDESK_API_KEY"], signupUrl: "https://internationalsales.lexisnexis.com/" },
  { id: "dataminr", category: "news", tier: "commercial", configured: false, envVars: ["DATAMINR_CLIENT_ID", "DATAMINR_CLIENT_SECRET"], signupUrl: "https://www.dataminr.com/contact" },
  { id: "meltwater", category: "news", tier: "commercial", configured: false, envVars: ["MELTWATER_API_KEY", "MELTWATER_USER_KEY"], signupUrl: "https://www.meltwater.com/en/contact" },
  { id: "rane", category: "news", tier: "commercial", configured: false, envVars: ["RANE_API_KEY"], signupUrl: "https://www.ranenetwork.com/" },
  { id: "maplecroft", category: "news", tier: "commercial", configured: false, envVars: ["MAPLECROFT_API_KEY"], signupUrl: "https://www.maplecroft.com/" },
  { id: "janes", category: "news", tier: "commercial", configured: false, envVars: ["JANES_API_KEY"], signupUrl: "https://www.janes.com/contact" },

  // ── KYC ─────────────────────────────────────────────────────────
  { id: "onfido", category: "kyc", tier: "commercial", configured: false, envVars: ["ONFIDO_API_KEY"], signupUrl: "https://onfido.com/contact/" },
  { id: "jumio", category: "kyc", tier: "commercial", configured: false, envVars: ["JUMIO_API_TOKEN", "JUMIO_API_SECRET"], signupUrl: "https://www.jumio.com/contact/" },
  { id: "trulioo", category: "kyc", tier: "commercial", configured: false, envVars: ["TRULIOO_API_KEY"], signupUrl: "https://www.trulioo.com/contact-us" },
  { id: "persona", category: "kyc", tier: "commercial", configured: false, envVars: ["PERSONA_API_KEY", "PERSONA_TEMPLATE_ID"], signupUrl: "https://withpersona.com/contact" },
  { id: "veriff", category: "kyc", tier: "commercial", configured: false, envVars: ["VERIFF_API_KEY"], signupUrl: "https://www.veriff.com/" },
  { id: "sumsub", category: "kyc", tier: "commercial", configured: false, envVars: ["SUMSUB_APP_TOKEN"], signupUrl: "https://sumsub.com/contact-us/" },

  // ── On-chain ────────────────────────────────────────────────────
  { id: "chainalysis", category: "onchain", tier: "commercial", configured: false, envVars: ["CHAINALYSIS_API_KEY"], signupUrl: "https://www.chainalysis.com/contact-us/" },
  { id: "trm", category: "onchain", tier: "commercial", configured: false, envVars: ["TRM_API_KEY"], signupUrl: "https://www.trmlabs.com/contact" },
  { id: "elliptic", category: "onchain", tier: "commercial", configured: false, envVars: ["ELLIPTIC_API_KEY"], signupUrl: "https://www.elliptic.co/contact-us" },

  // ── Premium news / research (Nov 2026 expansion +13) ─────────────
  { id: "refinitiv-connect", category: "news", tier: "commercial", configured: false, envVars: ["REFINITIV_CONNECT_API_KEY"], signupUrl: "https://developers.refinitiv.com/" },
  { id: "businesswire", category: "news", tier: "commercial", configured: false, envVars: ["BUSINESSWIRE_API_KEY"], signupUrl: "https://www.businesswire.com/portal/site/home/" },
  { id: "pr-newswire", category: "news", tier: "commercial", configured: false, envVars: ["PRNEWSWIRE_API_KEY"], signupUrl: "https://www.prnewswire.com/" },
  { id: "globe-newswire", category: "news", tier: "commercial", configured: false, envVars: ["GLOBENEWSWIRE_API_KEY"], signupUrl: "https://www.globenewswire.com/" },
  { id: "acuity-knowledge", category: "news", tier: "commercial", configured: false, envVars: ["ACUITY_KNOWLEDGE_API_KEY"], signupUrl: "https://www.acuitykp.com/" },
  { id: "moodys-analytics", category: "news", tier: "commercial", configured: false, envVars: ["MOODYS_ANALYTICS_API_KEY"], signupUrl: "https://www.moodysanalytics.com/" },
  { id: "omfif", category: "news", tier: "commercial", configured: false, envVars: ["OMFIF_API_KEY"], signupUrl: "https://www.omfif.org/" },
  { id: "centralbanking", category: "news", tier: "commercial", configured: false, envVars: ["CENTRALBANKING_API_KEY"], signupUrl: "https://www.centralbanking.com/" },
  { id: "global-finance", category: "news", tier: "commercial", configured: false, envVars: ["GLOBAL_FINANCE_API_KEY"], signupUrl: "https://gfmag.com/" },
  { id: "eurofinas", category: "news", tier: "commercial", configured: false, envVars: ["EUROFINAS_API_KEY"], signupUrl: "https://www.eurofinas.org/" },
  { id: "ihs-markit", category: "news", tier: "commercial", configured: false, envVars: ["IHS_MARKIT_API_KEY"], signupUrl: "https://ihsmarkit.com/" },
  { id: "eikon-news", category: "news", tier: "commercial", configured: false, envVars: ["EIKON_NEWS_API_KEY"], signupUrl: "https://eikon.refinitiv.com/" },
  { id: "nikkei-asia", category: "news", tier: "commercial", configured: false, envVars: ["NIKKEI_ASIA_API_KEY"], signupUrl: "https://asia.nikkei.com/" },

  // ── Sanctions / PEP commercial (Nov 2026 expansion +6) ───────────
  { id: "refine-intelligence", category: "sanctions", tier: "commercial", configured: false, envVars: ["REFINE_INTELLIGENCE_API_KEY"], signupUrl: "https://www.refine-intelligence.com/" },
  { id: "lucinity", category: "sanctions", tier: "commercial", configured: false, envVars: ["LUCINITY_API_KEY"], signupUrl: "https://www.lucinity.com/" },
  { id: "hummingbird", category: "sanctions", tier: "commercial", configured: false, envVars: ["HUMMINGBIRD_API_KEY"], signupUrl: "https://hummingbird.co/" },
  { id: "salvares", category: "sanctions", tier: "commercial", configured: false, envVars: ["SALVARES_API_KEY"], signupUrl: "https://salv.com/" },
  { id: "fenergo", category: "sanctions", tier: "commercial", configured: false, envVars: ["FENERGO_API_KEY"], signupUrl: "https://www.fenergo.com/" },
  { id: "napier", category: "sanctions", tier: "commercial", configured: false, envVars: ["NAPIER_API_KEY"], signupUrl: "https://www.napier.ai/" },

  // ── Registry / UBO (Nov 2026 expansion +6) ───────────────────────
  { id: "altares-dnb", category: "registry", tier: "commercial", configured: false, envVars: ["ALTARES_DNB_API_KEY"], signupUrl: "https://www.altares.com/" },
  { id: "infogreffe", category: "registry", tier: "commercial", configured: false, envVars: ["INFOGREFFE_API_KEY"], signupUrl: "https://www.infogreffe.fr/" },
  { id: "creditsafe", category: "registry", tier: "commercial", configured: false, envVars: ["CREDITSAFE_API_KEY"], signupUrl: "https://www.creditsafe.com/" },
  { id: "veridus", category: "registry", tier: "commercial", configured: false, envVars: ["VERIDUS_API_KEY"], signupUrl: "https://www.veridus.com/" },
  { id: "corpwatch", category: "registry", tier: "free-toggle", configured: false, envVars: ["CORPWATCH_ENABLED"], signupUrl: "https://corpwatch.org/api" },
  { id: "data-axle", category: "registry", tier: "commercial", configured: false, envVars: ["DATA_AXLE_API_KEY"], signupUrl: "https://www.data-axle.com/" },

  // ── KYC / IDV (Nov 2026 expansion +6) ────────────────────────────
  { id: "ekata", category: "kyc", tier: "commercial", configured: false, envVars: ["EKATA_API_KEY"], signupUrl: "https://ekata.com/" },
  { id: "fourthline", category: "kyc", tier: "commercial", configured: false, envVars: ["FOURTHLINE_API_KEY"], signupUrl: "https://www.fourthline.com/" },
  { id: "microblink", category: "kyc", tier: "commercial", configured: false, envVars: ["MICROBLINK_API_KEY"], signupUrl: "https://microblink.com/" },
  { id: "regula", category: "kyc", tier: "commercial", configured: false, envVars: ["REGULA_API_KEY"], signupUrl: "https://regulaforensics.com/" },
  { id: "veridas", category: "kyc", tier: "commercial", configured: false, envVars: ["VERIDAS_API_KEY"], signupUrl: "https://veridas.com/" },
  { id: "passbase", category: "kyc", tier: "commercial", configured: false, envVars: ["PASSBASE_API_KEY"], signupUrl: "https://www.passbase.com/" },

  // ── On-chain (Nov 2026 expansion +4) ─────────────────────────────
  { id: "ciphertrace", category: "onchain", tier: "commercial", configured: false, envVars: ["CIPHERTRACE_API_KEY"], signupUrl: "https://ciphertrace.com/" },
  { id: "lukka", category: "onchain", tier: "commercial", configured: false, envVars: ["LUKKA_API_KEY"], signupUrl: "https://lukka.tech/" },
  { id: "solidus-labs", category: "onchain", tier: "commercial", configured: false, envVars: ["SOLIDUS_LABS_API_KEY"], signupUrl: "https://www.soliduslabs.com/" },
  { id: "blocktrace", category: "onchain", tier: "commercial", configured: false, envVars: ["BLOCKTRACE_API_KEY"], signupUrl: "https://www.blocktrace.com/" },

  // ── LLM (operator already has this for AI features) ─────────────
  { id: "claude-adverse-media", category: "news", tier: "free", configured: false, envVars: ["ANTHROPIC_API_KEY"], signupUrl: "https://console.anthropic.com/" },
];

function isToggleOn(envKey: string): boolean {
  const v = process.env[envKey];
  // Non-_ENABLED env vars (e.g. MASTODON_INSTANCE, ALEPH_API_KEY) require actual values.
  if (!envKey.endsWith("_ENABLED")) return !!v && v.length > 0;
  // Boolean _ENABLED toggles: per featureFlags.ts they default to ON.
  // Only disable when explicitly set to "0" or "false".
  if (v === "0" || v?.toLowerCase() === "false") return false;
  return true;
}

function isKeySet(envKey: string): boolean {
  const v = process.env[envKey];
  return !!v && v.length > 0;
}

export async function GET(req: Request): Promise<NextResponse> {
  const { enforce } = await import("@/lib/server/enforce");
  const gate = await enforce(req);
  if (!gate.ok) return gate.response;
  // Resolve `configured` per provider
  const providers = PROVIDER_CATALOG.map((p) => {
    const allSet = p.tier === "free-toggle"
      ? p.envVars.every(isToggleOn)
      : p.envVars.every(isKeySet);
    return { ...p, configured: allSet };
  });

  // Categories with totals + active counts
  const byCategory = new Map<string, { total: number; configured: number }>();
  for (const p of providers) {
    const c = byCategory.get(p.category) ?? { total: 0, configured: 0 };
    c.total += 1;
    if (p.configured) c.configured += 1;
    byCategory.set(p.category, c);
  }

  const categories = Array.from(byCategory.entries()).map(([category, c]) => ({
    category,
    total: c.total,
    configured: c.configured,
    missing: c.total - c.configured,
  }));

  // Active provider lists from the actual aggregator functions (real
  // ground-truth — should agree with our catalog).
  const activeFromAggregators = {
    news: activeNewsProviders(),
    sanctions: activeCommercialProviders(),
    registry: activeRegistryProviders(),
    kyc: activeKycProviders(),
    onchain: activeOnChainProviders(),
    "free-always-on": activeFreeProviders(),
    countryRegistries: activeCountryRegistryAdapters().map((a) => a.jurisdiction),
    countrySanctions: activeCountrySanctionAdapters().map((a) => a.listName),
  };

  const totalConfigured = providers.filter((p) => p.configured).length;
  const totalAvailable = providers.length;

  // Highest-impact recommendations (next 5 unconfigured by tier)
  const recommendations = providers
    .filter((p) => !p.configured)
    .sort((a, b) => {
      const order = { "free-toggle": 0, free: 1, commercial: 2 };
      return order[a.tier] - order[b.tier];
    })
    .slice(0, 10);

  return NextResponse.json(
    {
      ok: true,
      totalConfigured,
      totalAvailable,
      coveragePct: Math.round((totalConfigured / totalAvailable) * 100),
      categories,
      providers,
      activeFromAggregators,
      recommendations,
      generatedAt: new Date().toISOString(),
    },
    {
      headers: {
        ...gate.headers,
        "cache-control": "no-store",
        "access-control-allow-origin": process.env["NEXT_PUBLIC_APP_URL"] ?? "https://hawkeye-sterling.netlify.app",
      },
    },
  );
}
