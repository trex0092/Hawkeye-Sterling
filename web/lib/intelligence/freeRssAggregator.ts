// Hawkeye Sterling — free public-RSS adverse-media aggregator.
//
// Fans out across ~40 public RSS feeds from major wire services + global
// news outlets and substring-filters titles/descriptions for the subject
// name. ZERO API keys required — all toggled by FREE_RSS_ENABLED=1.
//
// Per-feed timeout 8s, total fan-out parallel; failed feeds are silently
// skipped. Output deduped by URL and emitted as NewsArticle for the
// existing searchAllNews aggregator to merge.

import type { NewsArticle, NewsAdapter } from "./newsAdapters";
import { NULL_NEWS_ADAPTER } from "./newsAdapters";
import { textMentionsAml, matchAmlKeywords } from "./amlKeywords";

const FETCH_TIMEOUT_MS = 8_000;

function abortable<T>(p: Promise<T>, ms = FETCH_TIMEOUT_MS): Promise<T> {
  return Promise.race([
    p,
    new Promise<T>((_, reject) =>
      setTimeout(() => reject(new Error(`rss feed exceeded ${ms}ms`)), ms),
    ),
  ]);
}

interface RssFeed {
  source: string;        // provider id ("reuters", "bbc-rss" etc.)
  outlet: string;        // domain
  url: string;           // RSS endpoint
}

// Curated free public RSS feeds — wire services + global news outlets.
// All public, no key required, terms-of-service permit aggregation
// when properly attributed (we always preserve the canonical link).
const FREE_RSS_FEEDS: RssFeed[] = [
  // ── Wire services
  { source: "reuters-rss", outlet: "reuters.com", url: "https://www.reutersagency.com/feed/?best-topics=business-finance&post_type=best" },
  { source: "ap-rss", outlet: "apnews.com", url: "https://feeds.apnews.com/rss/apf-topnews" },
  { source: "ap-business-rss", outlet: "apnews.com", url: "https://feeds.apnews.com/rss/apf-business" },
  { source: "afp-rss", outlet: "afp.com", url: "https://www.afp.com/en/rss.xml" },

  // ── Investigative journalism (the BIG MISS for niche AML reporting)
  { source: "occrp-rss", outlet: "occrp.org", url: "https://www.occrp.org/en/feed/rss" },
  { source: "icij-rss", outlet: "icij.org", url: "https://www.icij.org/feed/" },
  { source: "bellingcat-rss", outlet: "bellingcat.com", url: "https://www.bellingcat.com/feed/" },
  { source: "intercept-rss", outlet: "theintercept.com", url: "https://theintercept.com/feed/" },
  { source: "reporterbrasil-rss", outlet: "reporterbrasil.org.br", url: "https://reporterbrasil.org.br/feed/" },
  { source: "publica-rss", outlet: "apublica.org", url: "https://apublica.org/feed/" },
  { source: "abraji-rss", outlet: "abraji.org.br", url: "https://www.abraji.org.br/feed" },

  // ── Brazil + Lusophone
  { source: "folha-rss", outlet: "folha.uol.com.br", url: "https://feeds.folha.uol.com.br/poder/rss091.xml" },
  { source: "estadao-rss", outlet: "estadao.com.br", url: "https://www.estadao.com.br/rss/economia.xml" },
  { source: "g1-rss", outlet: "g1.globo.com", url: "https://g1.globo.com/rss/g1/economia/" },
  { source: "valor-rss", outlet: "valor.globo.com", url: "https://valor.globo.com/rss/feed.xml" },
  { source: "veja-rss", outlet: "veja.abril.com.br", url: "https://veja.abril.com.br/feed" },
  { source: "uol-rss", outlet: "uol.com.br", url: "https://rss.uol.com.br/feed/economia.xml" },
  { source: "publico-pt-rss", outlet: "publico.pt", url: "https://www.publico.pt/rss" },

  // ── Turkey
  { source: "hurriyet-rss", outlet: "hurriyet.com.tr", url: "https://www.hurriyet.com.tr/rss/ekonomi" },
  { source: "milliyet-rss", outlet: "milliyet.com.tr", url: "https://www.milliyet.com.tr/rss/rssNew/ekonomiRss.xml" },
  { source: "sabah-rss", outlet: "sabah.com.tr", url: "https://www.sabah.com.tr/rss/ekonomi.xml" },
  { source: "sozcu-rss", outlet: "sozcu.com.tr", url: "https://www.sozcu.com.tr/feed/" },
  { source: "cumhuriyet-rss", outlet: "cumhuriyet.com.tr", url: "https://www.cumhuriyet.com.tr/rss/son_dakika.xml" },
  { source: "t24-rss", outlet: "t24.com.tr", url: "https://t24.com.tr/rss" },
  { source: "bianet-rss", outlet: "bianet.org", url: "https://bianet.org/bianet.rss" },
  { source: "patronlardunyasi-rss", outlet: "patronlardunyasi.com", url: "https://www.patronlardunyasi.com/rss" },
  { source: "diken-rss", outlet: "diken.com.tr", url: "https://www.diken.com.tr/feed/" },

  // ── Spanish-language LATAM + Spain
  { source: "elpais-es-rss", outlet: "elpais.com", url: "https://feeds.elpais.com/mrss-s/pages/ep/site/elpais.com/portada" },
  { source: "elmundo-rss", outlet: "elmundo.es", url: "https://e00-elmundo.uecdn.es/elmundo/rss/portada.xml" },
  { source: "clarin-rss", outlet: "clarin.com", url: "https://www.clarin.com/rss/lo-ultimo/" },
  { source: "lanacion-ar-rss", outlet: "lanacion.com.ar", url: "https://www.lanacion.com.ar/arc/outboundfeeds/rss/" },
  { source: "eluniversal-mx-rss", outlet: "eluniversal.com.mx", url: "https://www.eluniversal.com.mx/rss.xml" },
  { source: "elespectador-rss", outlet: "elespectador.com", url: "https://www.elespectador.com/arc/outboundfeeds/rss/?outputType=xml" },
  { source: "infobae-rss", outlet: "infobae.com", url: "https://www.infobae.com/feeds/rss/" },
  { source: "elfaro-rss", outlet: "elfaro.net", url: "https://elfaro.net/es/rss" },

  // ── French
  { source: "lemonde-rss", outlet: "lemonde.fr", url: "https://www.lemonde.fr/rss/une.xml" },
  { source: "lefigaro-rss", outlet: "lefigaro.fr", url: "https://www.lefigaro.fr/rss/figaro_economie.xml" },
  { source: "liberation-rss", outlet: "liberation.fr", url: "https://www.liberation.fr/arc/outboundfeeds/rss-all/?outputType=xml" },
  { source: "mediapart-rss", outlet: "mediapart.fr", url: "https://www.mediapart.fr/articles/feed" },

  // ── German
  { source: "spiegel-rss", outlet: "spiegel.de", url: "https://www.spiegel.de/wirtschaft/index.rss" },
  { source: "sz-rss", outlet: "sueddeutsche.de", url: "https://rss.sueddeutsche.de/rss/Wirtschaft" },
  { source: "faz-rss", outlet: "faz.net", url: "https://www.faz.net/rss/aktuell/wirtschaft/" },
  { source: "handelsblatt-rss", outlet: "handelsblatt.com", url: "https://www.handelsblatt.com/contentexport/feed/top-themen" },

  // ── Italian
  { source: "repubblica-rss", outlet: "repubblica.it", url: "https://www.repubblica.it/rss/economia/rss2.0.xml" },
  { source: "corriere-rss", outlet: "corriere.it", url: "https://xml2.corriereobjects.it/rss/economia.xml" },
  { source: "ilfatto-rss", outlet: "ilfattoquotidiano.it", url: "https://www.ilfattoquotidiano.it/feed/" },
  { source: "ilsole24ore-rss", outlet: "ilsole24ore.com", url: "https://www.ilsole24ore.com/rss/economia.xml" },

  // ── Russian / CIS (non-state where possible)
  { source: "novayagazeta-rss", outlet: "novayagazeta.eu", url: "https://novayagazeta.eu/feed" },
  { source: "meduza-rss", outlet: "meduza.io", url: "https://meduza.io/rss/all" },
  { source: "kommersant-rss", outlet: "kommersant.ru", url: "https://www.kommersant.ru/RSS/news.xml" },
  { source: "vedomosti-rss", outlet: "vedomosti.ru", url: "https://www.vedomosti.ru/rss/news" },
  { source: "interfax-rss", outlet: "interfax.com", url: "https://www.interfax.com/rss.asp" },

  // ── Arabic / MENA (with editorial independence where available)
  { source: "alarabiya-ar-rss", outlet: "alarabiya.net", url: "https://www.alarabiya.net/.mrss/ar.xml" },
  { source: "aljazeera-ar-rss", outlet: "aljazeera.net", url: "https://www.aljazeera.net/aljazeerarss" },
  { source: "alqabas-rss", outlet: "alqabas.com", url: "https://www.alqabas.com/rss" },
  { source: "youm7-rss", outlet: "youm7.com", url: "https://www.youm7.com/rss/SectionRss?SectionID=88" },
  { source: "alarab-rss", outlet: "alarab.co.uk", url: "https://alarab.co.uk/rss.xml" },

  // ── Africa (investigative)
  { source: "amabhungane-rss", outlet: "amabhungane.org", url: "https://amabhungane.org/feed/" },
  { source: "premiumtimes-rss", outlet: "premiumtimesng.com", url: "https://www.premiumtimesng.com/feed" },
  { source: "thecitizen-rss", outlet: "thecitizen.co.tz", url: "https://www.thecitizen.co.tz/rss" },
  { source: "thecontinent-rss", outlet: "mg.co.za", url: "https://mg.co.za/feed/" },
  { source: "dailymaverick-rss", outlet: "dailymaverick.co.za", url: "https://www.dailymaverick.co.za/section/business-maverick/feed/" },

  // ── UK
  { source: "bbc-rss", outlet: "bbc.co.uk", url: "http://feeds.bbci.co.uk/news/business/rss.xml" },
  { source: "bbc-world-rss", outlet: "bbc.co.uk", url: "http://feeds.bbci.co.uk/news/world/rss.xml" },
  { source: "guardian-rss", outlet: "theguardian.com", url: "https://www.theguardian.com/business/rss" },
  { source: "guardian-world-rss", outlet: "theguardian.com", url: "https://www.theguardian.com/world/rss" },
  { source: "independent-rss", outlet: "independent.co.uk", url: "https://www.independent.co.uk/news/business/rss" },
  { source: "telegraph-rss", outlet: "telegraph.co.uk", url: "https://www.telegraph.co.uk/business/rss.xml" },

  // ── US
  { source: "nyt-business-rss", outlet: "nytimes.com", url: "https://rss.nytimes.com/services/xml/rss/nyt/Business.xml" },
  { source: "nyt-world-rss", outlet: "nytimes.com", url: "https://rss.nytimes.com/services/xml/rss/nyt/World.xml" },
  { source: "wapo-rss", outlet: "washingtonpost.com", url: "https://feeds.washingtonpost.com/rss/business" },
  { source: "npr-rss", outlet: "npr.org", url: "https://feeds.npr.org/1006/rss.xml" },
  { source: "cnn-rss", outlet: "cnn.com", url: "http://rss.cnn.com/rss/money_news_international.rss" },
  { source: "cbs-rss", outlet: "cbsnews.com", url: "https://www.cbsnews.com/latest/rss/business" },
  { source: "axios-rss", outlet: "axios.com", url: "https://api.axios.com/feed/" },
  { source: "politico-rss", outlet: "politico.com", url: "https://rss.politico.com/economy.xml" },
  { source: "thehill-rss", outlet: "thehill.com", url: "https://thehill.com/feed/" },

  // ── Europe (continental)
  { source: "dw-rss", outlet: "dw.com", url: "https://rss.dw.com/atom/rss-en-bus" },
  { source: "france24-rss", outlet: "france24.com", url: "https://www.france24.com/en/business/rss" },
  { source: "rfi-rss", outlet: "rfi.fr", url: "https://www.rfi.fr/en/rss" },
  { source: "euractiv-rss", outlet: "euractiv.com", url: "https://www.euractiv.com/feed" },
  { source: "politico-eu-rss", outlet: "politico.eu", url: "https://www.politico.eu/feed/" },
  { source: "yle-rss", outlet: "yle.fi", url: "https://feeds.yle.fi/uutiset/v1/recent.rss?publisherIds=YLE_NEWS" },

  // ── Middle East
  { source: "aljazeera-rss", outlet: "aljazeera.com", url: "https://www.aljazeera.com/xml/rss/all.xml" },
  { source: "alarabiya-rss", outlet: "alarabiya.net", url: "https://english.alarabiya.net/.mrss/en.xml" },
  { source: "thenational-rss", outlet: "thenationalnews.com", url: "https://www.thenationalnews.com/business/rss" },

  // ── Asia
  { source: "nhk-rss", outlet: "nhk.or.jp", url: "https://www3.nhk.or.jp/nhkworld/en/news/feeds/" },
  { source: "scmp-rss", outlet: "scmp.com", url: "https://www.scmp.com/rss/91/feed" },
  { source: "asiatimes-rss", outlet: "asiatimes.com", url: "https://asiatimes.com/feed/" },
  { source: "thehindu-rss", outlet: "thehindu.com", url: "https://www.thehindu.com/business/feeder/default.rss" },
  { source: "indiatoday-rss", outlet: "indiatoday.in", url: "https://www.indiatoday.in/rss/1206577" },
  { source: "hindustantimes-rss", outlet: "hindustantimes.com", url: "https://www.hindustantimes.com/feeds/rss/business/index.xml" },

  // ── Americas + Oceania
  { source: "globalnews-rss", outlet: "globalnews.ca", url: "https://globalnews.ca/feed/" },
  { source: "cbc-rss", outlet: "cbc.ca", url: "https://www.cbc.ca/cmlink/rss-business" },
  { source: "abc-au-rss", outlet: "abc.net.au", url: "https://www.abc.net.au/news/feed/51892/rss.xml" },

  // ── Africa
  { source: "africanews-rss", outlet: "africanews.com", url: "https://www.africanews.com/rss" },
  { source: "allafrica-rss", outlet: "allafrica.com", url: "https://allafrica.com/tools/headlines/rdf/business/headlines.rdf" },

  // ── International / agencies
  { source: "un-news-rss", outlet: "news.un.org", url: "https://news.un.org/feed/subscribe/en/news/all/rss.xml" },
  { source: "ec-press-rss", outlet: "ec.europa.eu", url: "https://ec.europa.eu/commission/presscorner/api/rss?language=en&pageType=press_release" },
];

// Cheap RSS / Atom parser — extracts <item> or <entry> blocks; we don't
// need a full XML parser since we only consume well-formed feed roots.
function parseFeed(xml: string, source: string, outlet: string): NewsArticle[] {
  const items = xml.match(/<(?:item|entry)>[\s\S]*?<\/(?:item|entry)>/g) ?? [];
  const out: NewsArticle[] = [];
  for (const it of items) {
    const title = stripCdata(/<title[^>]*>([\s\S]*?)<\/title>/.exec(it)?.[1])?.trim();
    let link =
      /<link[^>]*href="([^"]+)"/.exec(it)?.[1]?.trim()
      ?? stripCdata(/<link>([\s\S]*?)<\/link>/.exec(it)?.[1])?.trim();
    if (!title || !link) continue;
    // Some feeds wrap link in atom self-closing; ensure absolute URL.
    if (!/^https?:\/\//i.test(link)) {
      const base = new URL(`https://${outlet}`);
      link = new URL(link, base).toString();
    }
    const pub =
      /<pubDate>([\s\S]*?)<\/pubDate>/.exec(it)?.[1]?.trim()
      ?? /<updated>([\s\S]*?)<\/updated>/.exec(it)?.[1]?.trim()
      ?? /<published>([\s\S]*?)<\/published>/.exec(it)?.[1]?.trim();
    const desc =
      stripCdata(/<description>([\s\S]*?)<\/description>/.exec(it)?.[1])?.trim()
      ?? stripCdata(/<summary[^>]*>([\s\S]*?)<\/summary>/.exec(it)?.[1])?.trim();
    const cleanedDesc = desc ? desc.replace(/<[^>]+>/g, "").trim().slice(0, 240) : undefined;
    out.push({
      source,
      outlet,
      title: title.replace(/<[^>]+>/g, "").trim(),
      url: link,
      publishedAt: pub ? new Date(pub).toISOString() : new Date().toISOString(),
      ...(cleanedDesc ? { snippet: cleanedDesc } : {}),
    });
  }
  return out;
}

function stripCdata(s: string | undefined): string | undefined {
  if (!s) return s;
  return s.replace(/^<!\[CDATA\[/, "").replace(/\]\]>$/, "");
}

async function fetchOne(feed: RssFeed): Promise<string | null> {
  try {
    const res = await abortable(
      fetch(feed.url, {
        headers: { accept: "application/rss+xml,application/atom+xml,application/xml,text/xml,*/*", "user-agent": "HawkeyeSterling/1.0 (compatible; adverse-media)" },
        redirect: "follow",
      }),
    );
    if (!res.ok) return null;
    return await res.text();
  } catch {
    return null;
  }
}

/**
 * Free RSS aggregator. Fans out across all curated public feeds and
 * substring-filters items mentioning the subject name in title or
 * snippet. Returns a single NewsAdapter so the caller can plug it
 * into searchAllNews's flow.
 *
 * DEFAULT-ON: this is now active out-of-the-box because operators
 * shouldn't need to flip a flag to get baseline adverse-media coverage
 * across 60+ jurisdictions. Set FREE_RSS_DISABLED=1 to opt out.
 */
export function freeRssAdapter(): NewsAdapter {
  const disabled = process.env["FREE_RSS_DISABLED"];
  if (disabled === "1" || disabled?.toLowerCase() === "true") return NULL_NEWS_ADAPTER;
  return {
    isAvailable: () => true,
    search: async (subjectName, opts) => {
      const needle = subjectName.toLowerCase();
      // Fan-out parallel; each feed's failure is independent.
      const xmls = await Promise.all(FREE_RSS_FEEDS.map((f) => fetchOne(f).then((x) => ({ feed: f, xml: x }))));
      const articles: NewsArticle[] = [];
      for (const { feed, xml } of xmls) {
        if (!xml) continue;
        const parsed = parseFeed(xml, feed.source, feed.outlet);
        for (const a of parsed) {
          const hay = `${a.title} ${a.snippet ?? ""}`;
          const lower = hay.toLowerCase();
          if (!lower.includes(needle)) continue;
          // Boost: when the article ALSO mentions an AML keyword
          // (FATF predicate / sanctions / CFT terms), tag it. We
          // still surface name-only matches but mark adversely-tagged
          // ones so the consensus engine weights them higher.
          const amlHit = textMentionsAml(hay);
          articles.push({
            ...a,
            ...(amlHit ? {
              snippet: `[AML-tagged: ${matchAmlKeywords(hay).slice(0, 3).join(", ")}] ${a.snippet ?? ""}`.trim(),
            } : {}),
          });
        }
      }
      // Dedupe by URL
      const seen = new Set<string>();
      const deduped = articles.filter((a) => {
        const k = a.url.toLowerCase();
        if (seen.has(k)) return false;
        seen.add(k);
        return true;
      });
      // Cap return at limit
      return deduped.slice(0, opts?.limit ?? 50);
    },
  };
}

/** List of feeds for UI surfaces that want to show coverage. */
export function listFreeRssFeeds(): Array<{ source: string; outlet: string }> {
  return FREE_RSS_FEEDS.map((f) => ({ source: f.source, outlet: f.outlet }));
}
