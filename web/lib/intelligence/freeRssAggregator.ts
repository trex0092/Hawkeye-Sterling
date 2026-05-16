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
import { flagOn } from "./featureFlags";

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
  // ── Wire services + flagship news (multi-channel)
  { source: "reuters-rss", outlet: "reuters.com", url: "https://www.reutersagency.com/feed/?best-topics=business-finance&post_type=best" },
  { source: "reuters-world-rss", outlet: "reuters.com", url: "https://www.reutersagency.com/feed/?best-topics=world&post_type=best" },
  { source: "reuters-markets-rss", outlet: "reuters.com", url: "https://www.reutersagency.com/feed/?best-topics=markets&post_type=best" },
  { source: "reuters-regulation-rss", outlet: "reuters.com", url: "https://www.reutersagency.com/feed/?best-topics=regulation&post_type=best" },
  { source: "ap-rss", outlet: "apnews.com", url: "https://feeds.apnews.com/rss/apf-topnews" },
  { source: "ap-business-rss", outlet: "apnews.com", url: "https://feeds.apnews.com/rss/apf-business" },
  { source: "afp-rss", outlet: "afp.com", url: "https://www.afp.com/en/rss.xml" },
  // Bloomberg — limited public RSS via Bloomberg syndication
  { source: "bloomberg-rss", outlet: "bloomberg.com", url: "https://feeds.bloomberg.com/markets/news.rss" },
  { source: "bloomberg-politics-rss", outlet: "bloomberg.com", url: "https://feeds.bloomberg.com/politics/news.rss" },
  { source: "bloomberg-business-rss", outlet: "bloomberg.com", url: "https://feeds.bloomberg.com/business/news.rss" },
  // BBC — multi-channel
  { source: "bbc-politics-rss", outlet: "bbc.co.uk", url: "http://feeds.bbci.co.uk/news/politics/rss.xml" },
  { source: "bbc-uk-rss", outlet: "bbc.co.uk", url: "http://feeds.bbci.co.uk/news/uk/rss.xml" },
  { source: "bbc-tech-rss", outlet: "bbc.co.uk", url: "http://feeds.bbci.co.uk/news/technology/rss.xml" },
  // Amazon-region environmental + AML investigations (catches the
  // illegal-gold / wildlife-trafficking / TBML stories that hit
  // Brazilian DTVMs like Ourominas).
  { source: "amazoniareal-rss", outlet: "amazoniareal.com.br", url: "https://amazoniareal.com.br/feed/" },
  { source: "infoamazonia-rss", outlet: "infoamazonia.org", url: "https://infoamazonia.org/feed/" },
  { source: "mongabay-rss", outlet: "mongabay.com", url: "https://news.mongabay.com/feed/" },
  // Insight / regulatory + business-intelligence specialists
  { source: "ensia-rss", outlet: "ensia.com", url: "https://ensia.com/feed/" },
  { source: "engineeringnews-rss", outlet: "engineeringnews.co.za", url: "https://www.engineeringnews.co.za/rss" },
  { source: "intelligenceonline-rss", outlet: "intelligenceonline.com", url: "https://www.intelligenceonline.com/rss" },
  { source: "africaintelligence-rss", outlet: "africaintelligence.com", url: "https://www.africaintelligence.com/rss" },

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

  // ─────────────────────────────────────────────────────────────────
  // EXPANDED COVERAGE
  // ─────────────────────────────────────────────────────────────────

  // ── US + Canada extended
  { source: "cnbc-rss", outlet: "cnbc.com", url: "https://search.cnbc.com/rs/search/combinedcms/view.xml?partnerId=wrss01&id=10000664" },
  { source: "msnbc-rss", outlet: "msnbc.com", url: "https://www.msnbc.com/feeds/latest" },
  { source: "foxbusiness-rss", outlet: "foxbusiness.com", url: "https://moxie.foxbusiness.com/google-publisher/latest.xml" },
  { source: "usatoday-rss", outlet: "usatoday.com", url: "https://www.usatoday.com/marketing/rss/news/" },
  { source: "latimes-rss", outlet: "latimes.com", url: "https://www.latimes.com/business/rss2.0.xml" },
  { source: "chicagotribune-rss", outlet: "chicagotribune.com", url: "https://www.chicagotribune.com/arc/outboundfeeds/rss/" },
  { source: "bostonglobe-rss", outlet: "bostonglobe.com", url: "https://www.bostonglobe.com/rss/business" },
  { source: "torontostar-rss", outlet: "thestar.com", url: "https://www.thestar.com/feeds.articles.business.rss" },
  { source: "globeandmail-rss", outlet: "theglobeandmail.com", url: "https://www.theglobeandmail.com/business/?service=rss" },
  { source: "marshallproject-rss", outlet: "themarshallproject.org", url: "https://www.themarshallproject.org/rss/recent.rss" },

  // ── UK extended
  { source: "thetimes-rss", outlet: "thetimes.co.uk", url: "https://www.thetimes.co.uk/business/rss" },
  { source: "dailymail-rss", outlet: "dailymail.co.uk", url: "https://www.dailymail.co.uk/articles.rss?columnname=mol-fe-channel-money" },
  { source: "thesun-rss", outlet: "thesun.co.uk", url: "https://www.thesun.co.uk/feed/" },
  { source: "mirror-rss", outlet: "mirror.co.uk", url: "https://www.mirror.co.uk/news/?service=rss" },
  { source: "dailyexpress-rss", outlet: "express.co.uk", url: "https://www.express.co.uk/posts/rss/1/uk" },

  // ── Continental Europe extended
  { source: "diezeit-rss", outlet: "zeit.de", url: "https://newsfeed.zeit.de/wirtschaft/index" },
  { source: "welt-rss", outlet: "welt.de", url: "https://www.welt.de/feeds/section/wirtschaft.rss" },
  { source: "bild-rss", outlet: "bild.de", url: "https://www.bild.de/rssfeeds/vw-wirtschaft/vw-wirtschaft-16728880,view=rss2.bild.xml" },
  { source: "tagesspiegel-rss", outlet: "tagesspiegel.de", url: "https://www.tagesspiegel.de/contentexport/feed/wirtschaft" },
  { source: "nrc-rss", outlet: "nrc.nl", url: "https://www.nrc.nl/rss/" },
  { source: "volkskrant-rss", outlet: "volkskrant.nl", url: "https://www.volkskrant.nl/economie/rss.xml" },
  { source: "fd-rss", outlet: "fd.nl", url: "https://fd.nl/?widget=rss" },
  { source: "hs-rss", outlet: "hs.fi", url: "https://www.hs.fi/rss/talous.xml" },
  { source: "aftonbladet-rss", outlet: "aftonbladet.se", url: "https://www.aftonbladet.se/nyheter/rss.xml" },
  { source: "dagensnyheter-rss", outlet: "dn.se", url: "https://www.dn.se/ekonomi/rss/" },
  { source: "vg-rss", outlet: "vg.no", url: "https://www.vg.no/rss/feed/?categories=Næringsliv&format=rss" },
  { source: "aftenposten-rss", outlet: "aftenposten.no", url: "https://www.aftenposten.no/rss" },
  { source: "berlingske-rss", outlet: "berlingske.dk", url: "https://www.berlingske.dk/business/rss" },
  { source: "politiken-rss", outlet: "politiken.dk", url: "https://politiken.dk/rss/erhverv.rss" },

  // ── East Asia extended
  { source: "asahi-rss", outlet: "asahi.com", url: "https://www.asahi.com/rss/asahi/business.rdf" },
  { source: "mainichi-rss", outlet: "mainichi.jp", url: "https://mainichi.jp/rss/etc/economy.rss" },
  { source: "yomiuri-rss", outlet: "yomiuri.co.jp", url: "https://www.yomiuri.co.jp/rss/yol/economy/feed.xml" },
  { source: "japantimes-rss", outlet: "japantimes.co.jp", url: "https://www.japantimes.co.jp/news/business/feed/" },
  { source: "koreaherald-rss", outlet: "koreaherald.com", url: "https://www.koreaherald.com/common/rss_xml.php?ct=102" },
  { source: "joongang-rss", outlet: "koreajoongangdaily.joins.com", url: "https://koreajoongangdaily.joins.com/section/business/rss" },
  { source: "chosun-rss", outlet: "english.chosun.com", url: "https://english.chosun.com/svc/rss/rss.xml" },
  { source: "hankyoreh-rss", outlet: "hani.co.kr", url: "https://www.hani.co.kr/rss/economy/" },
  { source: "channelnewsasia-rss", outlet: "channelnewsasia.com", url: "https://www.channelnewsasia.com/api/v1/rss-outbound-feed?_format=xml&category=6511" },
  { source: "straitstimes-rss", outlet: "straitstimes.com", url: "https://www.straitstimes.com/news/business/rss.xml" },
  { source: "bangkokpost-rss", outlet: "bangkokpost.com", url: "https://www.bangkokpost.com/rss/data/business.xml" },
  { source: "thestar-my-rss", outlet: "thestar.com.my", url: "https://www.thestar.com.my/rss/news" },
  { source: "todayonline-rss", outlet: "todayonline.com", url: "https://www.todayonline.com/feed/rss" },
  { source: "inquirer-rss", outlet: "inquirer.net", url: "https://newsinfo.inquirer.net/feed" },
  { source: "rappler-rss", outlet: "rappler.com", url: "https://www.rappler.com/feed/" },

  // ── India extended
  { source: "livemint-rss", outlet: "livemint.com", url: "https://www.livemint.com/rss/news" },
  { source: "businessstandard-rss", outlet: "business-standard.com", url: "https://www.business-standard.com/rss/home_page_top_stories.rss" },
  { source: "economictimes-rss", outlet: "economictimes.indiatimes.com", url: "https://economictimes.indiatimes.com/rssfeeds/1977021501.cms" },
  { source: "tribuneindia-rss", outlet: "tribuneindia.com", url: "https://www.tribuneindia.com/rss/feed?catId=23" },

  // ── LATAM extended
  { source: "globo-rss", outlet: "oglobo.globo.com", url: "https://oglobo.globo.com/rss/economia.xml" },
  { source: "exame-rss", outlet: "exame.com", url: "https://exame.com/feed/" },
  { source: "cartacapital-rss", outlet: "cartacapital.com.br", url: "https://www.cartacapital.com.br/feed/" },
  { source: "brasil247-rss", outlet: "brasil247.com", url: "https://www.brasil247.com/rss" },
  { source: "piaui-rss", outlet: "piaui.folha.uol.com.br", url: "https://piaui.folha.uol.com.br/feed/" },
  { source: "aristegui-rss", outlet: "aristeguinoticias.com", url: "https://aristeguinoticias.com/feed/" },
  { source: "animalpolitico-rss", outlet: "animalpolitico.com", url: "https://www.animalpolitico.com/feed" },
  { source: "reforma-rss", outlet: "reforma.com", url: "https://www.reforma.com/rss/portada.xml" },
  { source: "milenio-rss", outlet: "milenio.com", url: "https://www.milenio.com/rss/negocios" },
  { source: "excelsior-rss", outlet: "excelsior.com.mx", url: "https://www.excelsior.com.mx/rss.xml" },
  { source: "eltiempo-co-rss", outlet: "eltiempo.com", url: "https://www.eltiempo.com/rss/economia.xml" },
  { source: "elcomercio-pe-rss", outlet: "elcomercio.pe", url: "https://elcomercio.pe/feed/" },
  { source: "elmercurio-cl-rss", outlet: "elmercurio.com", url: "https://www.elmercurio.com/blogs/rss.xml" },
  { source: "latercera-rss", outlet: "latercera.com", url: "https://www.latercera.com/feed/" },

  // ── Russian + CIS independent extended
  { source: "moscowtimes-rss", outlet: "themoscowtimes.com", url: "https://www.themoscowtimes.com/rss/news" },
  { source: "theinsider-rss", outlet: "theins.ru", url: "https://theins.ru/feed" },
  { source: "istories-rss", outlet: "istories.media", url: "https://istories.media/rss" },
  { source: "verstka-rss", outlet: "verstka.media", url: "https://verstka.media/rss" },
  { source: "holod-rss", outlet: "holod.media", url: "https://holod.media/feed/" },
  { source: "mediazona-rss", outlet: "zona.media", url: "https://zona.media/rss" },
  { source: "bell-rss", outlet: "thebell.io", url: "https://thebell.io/rss" },
  { source: "ng-rss", outlet: "ng.ru", url: "https://www.ng.ru/rss/economics.xml" },

  // ── MENA extended
  { source: "daraj-rss", outlet: "daraj.media", url: "https://daraj.media/feed/" },
  { source: "madamasr-rss", outlet: "madamasr.com", url: "https://www.madamasr.com/en/feed/" },
  { source: "thenewarab-rss", outlet: "thenewarab.com", url: "https://www.thenewarab.com/news.xml" },
  { source: "middleeasteye-rss", outlet: "middleeasteye.net", url: "https://www.middleeasteye.net/rss" },
  { source: "amwaj-rss", outlet: "amwaj.media", url: "https://amwaj.media/feed/" },
  { source: "hespress-rss", outlet: "hespress.com", url: "https://en.hespress.com/feed" },
  { source: "tunisienumerique-rss", outlet: "tunisienumerique.com", url: "https://www.tunisienumerique.com/feed/" },

  // ── Africa extended
  { source: "saharareporters-rss", outlet: "saharareporters.com", url: "https://saharareporters.com/feed" },
  { source: "africaconfidential-rss", outlet: "africa-confidential.com", url: "https://www.africa-confidential.com/feed/" },
  { source: "iss-rss", outlet: "issafrica.org", url: "https://issafrica.org/iss-today/feed" },
  { source: "thecitizen-tz-rss", outlet: "thecitizen.co.tz", url: "https://www.thecitizen.co.tz/tanzania/rss" },
  { source: "businesslive-rss", outlet: "businesslive.co.za", url: "https://www.businesslive.co.za/feeds/businessday/business/" },
  { source: "newsday-zw-rss", outlet: "newsday.co.zw", url: "https://www.newsday.co.zw/feed/" },
  { source: "businessday-ng-rss", outlet: "businessday.ng", url: "https://businessday.ng/feed/" },
  { source: "cipesa-rss", outlet: "cipesa.org", url: "https://cipesa.org/feed/" },

  // ── Turkey independent extended
  { source: "halktv-rss", outlet: "halktv.com.tr", url: "https://www.halktv.com.tr/service/rss.php" },
  { source: "birgun-rss", outlet: "birgun.net", url: "https://www.birgun.net/rss" },
  { source: "evrensel-rss", outlet: "evrensel.net", url: "https://www.evrensel.net/rss/haber.xml" },
  { source: "karar-rss", outlet: "karar.com", url: "https://www.karar.com/rss/anasayfa.xml" },
  { source: "ahval-rss", outlet: "ahvalnews.com", url: "https://ahvalnews.com/rss" },
  { source: "stockholm-cf-rss", outlet: "stockholmcf.org", url: "https://stockholmcf.org/feed/" },
  { source: "turkishminute-rss", outlet: "turkishminute.com", url: "https://www.turkishminute.com/feed/" },

  // ── Asia investigative + regional
  { source: "asiasentinel-rss", outlet: "asiasentinel.com", url: "https://www.asiasentinel.com/feed" },
  { source: "thediplomat-rss", outlet: "thediplomat.com", url: "https://thediplomat.com/feed/" },
  { source: "foreignpolicy-rss", outlet: "foreignpolicy.com", url: "https://foreignpolicy.com/feed/" },
  { source: "globalvoices-rss", outlet: "globalvoices.org", url: "https://globalvoices.org/feed/" },

  // ── Tech & financial niche (catches crypto + market manipulation cases)
  { source: "techcrunch-rss", outlet: "techcrunch.com", url: "https://techcrunch.com/feed/" },
  { source: "wired-rss", outlet: "wired.com", url: "https://www.wired.com/feed/rss" },
  { source: "verge-rss", outlet: "theverge.com", url: "https://www.theverge.com/rss/index.xml" },
  { source: "arstechnica-rss", outlet: "arstechnica.com", url: "https://feeds.arstechnica.com/arstechnica/index" },
  { source: "venturebeat-rss", outlet: "venturebeat.com", url: "https://venturebeat.com/feed/" },
  { source: "coindesk-rss", outlet: "coindesk.com", url: "https://www.coindesk.com/arc/outboundfeeds/rss/" },
  { source: "theblock-rss", outlet: "theblock.co", url: "https://www.theblock.co/rss.xml" },
  { source: "decrypt-rss", outlet: "decrypt.co", url: "https://decrypt.co/feed" },
  { source: "cointelegraph-rss", outlet: "cointelegraph.com", url: "https://cointelegraph.com/rss" },
  { source: "krebsonsecurity-rss", outlet: "krebsonsecurity.com", url: "https://krebsonsecurity.com/feed/" },
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
      try {
        const base = new URL(`https://${outlet}`);
        link = new URL(link, base).toString();
      } catch {
        continue;
      }
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
  if (!flagOn("free-rss")) return NULL_NEWS_ADAPTER;
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
