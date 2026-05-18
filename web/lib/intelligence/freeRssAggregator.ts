// Hawkeye Sterling — free public-RSS adverse-media aggregator.
//
// Fans out across ~40 public RSS feeds from major wire services + global
// news outlets and substring-filters titles/descriptions for the subject
// name. ZERO API keys required — all toggled by FREE_RSS_ENABLED=1.
//
// Per-feed timeout 8s, total fan-out parallel; failed feeds are silently
// skipped. Output deduped by URL and emitted as NewsArticle for the
// existing searchAllNews aggregator to merge.

import { NULL_NEWS_ADAPTER, type NewsArticle, type NewsAdapter } from "./newsAdapters";
import { textMentionsAml, matchAmlKeywords } from "./amlKeywords";
import { flagOn } from "./featureFlags";

const FETCH_TIMEOUT_MS = 8_000;

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

  // ── Regulatory / Law Enforcement / AML-specific (highest AML value)
  { source: "usdoj-rss", outlet: "justice.gov", url: "https://www.justice.gov/news/rss" },
  { source: "usdoj-ofac-rss", outlet: "home.treasury.gov", url: "https://home.treasury.gov/system/files/126/ofac.xml" },
  { source: "fincen-rss", outlet: "fincen.gov", url: "https://www.fincen.gov/news/rss" },
  { source: "sec-enforcement-rss", outlet: "sec.gov", url: "https://www.sec.gov/rss/litigation/litreleases.xml" },
  { source: "sec-news-rss", outlet: "sec.gov", url: "https://www.sec.gov/rss/news/pressreleases.xml" },
  { source: "cftc-rss", outlet: "cftc.gov", url: "https://www.cftc.gov/rss/pressreleases.xml" },
  { source: "fdic-rss", outlet: "fdic.gov", url: "https://www.fdic.gov/news/press-releases/rss.xml" },
  { source: "fatf-rss", outlet: "fatf-gafi.org", url: "https://www.fatf-gafi.org/en/rss.xml" },
  { source: "fsb-rss", outlet: "fsb.org", url: "https://www.fsb.org/rss/feed/" },
  { source: "bis-rss", outlet: "bis.org", url: "https://www.bis.org/rss/speeches.xml" },
  { source: "europol-rss", outlet: "europol.europa.eu", url: "https://www.europol.europa.eu/rss.xml" },
  { source: "eurojust-rss", outlet: "eurojust.europa.eu", url: "https://www.eurojust.europa.eu/rss.xml" },
  { source: "fca-rss", outlet: "fca.org.uk", url: "https://www.fca.org.uk/rss.xml" },
  { source: "nca-rss", outlet: "nationalcrimeagency.gov.uk", url: "https://www.nationalcrimeagency.gov.uk/rss" },
  { source: "ofsi-rss", outlet: "gov.uk", url: "https://www.gov.uk/government/organisations/office-of-financial-sanctions-implementation.atom" },
  { source: "ecb-rss", outlet: "ecb.europa.eu", url: "https://www.ecb.europa.eu/rss/press.html" },
  { source: "acams-rss", outlet: "acams.org", url: "https://www.acams.org/en/news/rss" },
  { source: "tracfinancial-rss", outlet: "economie.gouv.fr", url: "https://www.economie.gouv.fr/tracfin/rss" },
  { source: "imf-news-rss", outlet: "imf.org", url: "https://www.imf.org/en/News/rss?language=eng&type=press-release" },
  { source: "worldbank-news-rss", outlet: "worldbank.org", url: "https://www.worldbank.org/en/news/rss" },
  { source: "interpol-rss", outlet: "interpol.int", url: "https://www.interpol.int/en/Internet-of-Things-Security/rss" },
  { source: "fbi-rss", outlet: "fbi.gov", url: "https://www.fbi.gov/feeds/fbi_news/pressrel/pressrel.rss" },

  // ── Caribbean / Offshore Finance (BVI, Cayman, Panama, Bahamas — major financial crime corridor)
  { source: "caymancompass-rss", outlet: "caymancompass.com", url: "https://www.caymancompass.com/feed/" },
  { source: "caribbeanjournal-rss", outlet: "caribjournal.com", url: "https://www.caribjournal.com/feed/" },
  { source: "jamaicagleaner-rss", outlet: "jamaica-gleaner.com", url: "https://jamaica-gleaner.com/feed/rss.xml" },
  { source: "jamaicaobserver-rss", outlet: "jamaicaobserver.com", url: "https://www.jamaicaobserver.com/rss.xml" },
  { source: "trinidadexpress-rss", outlet: "trinidadexpress.com", url: "https://trinidadexpress.com/feed/" },
  { source: "loopnews-rss", outlet: "loopnews.com", url: "https://looptt.com/content/news/feed/rss.xml" },
  { source: "antiguaobserver-rss", outlet: "antiguaobserver.com", url: "https://antiguaobserver.com/feed/" },
  { source: "bvinews-rss", outlet: "bvinews.com", url: "https://www.bvinews.com/feed/" },
  { source: "bahamaspress-rss", outlet: "thebahamasweekly.com", url: "https://www.thebahamasweekly.com/rss_feed.php" },
  { source: "panamapost-rss", outlet: "panamapost.com", url: "https://panamapost.com/feed/" },

  // ── West / East Africa (missing national papers + investigative)
  { source: "punchng-rss", outlet: "punchng.com", url: "https://punchng.com/feed/" },
  { source: "vanguardngr-rss", outlet: "vanguardngr.com", url: "https://www.vanguardngr.com/feed/" },
  { source: "thenation-ng-rss", outlet: "thenationonlineng.net", url: "https://thenationonlineng.net/feed/" },
  { source: "ghanaweb-rss", outlet: "ghanaweb.com", url: "https://ghanaweb.com/GhanaHomePage/rss/business.xml" },
  { source: "myjoyonline-rss", outlet: "myjoyonline.com", url: "https://www.myjoyonline.com/feed/" },
  { source: "dailymonitor-ug-rss", outlet: "monitor.co.ug", url: "https://www.monitor.co.ug/uganda/rss" },
  { source: "standardmedia-ke-rss", outlet: "standardmedia.co.ke", url: "https://www.standardmedia.co.ke/rss/news" },
  { source: "eastafrican-rss", outlet: "theeastafrican.co.ke", url: "https://www.theeastafrican.co.ke/rss.xml" },
  { source: "ethiopianreporter-rss", outlet: "thereporterethiopia.com", url: "https://www.thereporterethiopia.com/feed" },
  { source: "addisstandard-rss", outlet: "addisstandard.com", url: "https://addisstandard.com/feed/" },
  { source: "sudantribune-rss", outlet: "sudantribune.com", url: "https://sudantribune.com/feed/" },
  { source: "allafrica-invest-rss", outlet: "allafrica.com", url: "https://allafrica.com/tools/headlines/rdf/economy/headlines.rdf" },

  // ── South Asia (Pakistan, Bangladesh, Sri Lanka)
  { source: "dawn-rss", outlet: "dawn.com", url: "https://www.dawn.com/feeds/home" },
  { source: "expresstribune-rss", outlet: "tribune.com.pk", url: "https://tribune.com.pk/feed/home" },
  { source: "geo-news-rss", outlet: "geo.tv", url: "https://www.geo.tv/rss/top_stories" },
  { source: "thenews-pk-rss", outlet: "thenews.com.pk", url: "https://www.thenews.com.pk/rss/home" },
  { source: "dailystar-bd-rss", outlet: "thedailystar.net", url: "https://www.thedailystar.net/frontpage/rss.xml" },
  { source: "prothomalo-rss", outlet: "en.prothomalo.com", url: "https://en.prothomalo.com/feed" },
  { source: "bdnews24-rss", outlet: "bdnews24.com", url: "https://bdnews24.com/rss" },
  { source: "dailymirror-lk-rss", outlet: "dailymirror.lk", url: "https://www.dailymirror.lk/latest-news/2/rss.xml" },
  { source: "adaderana-rss", outlet: "adaderana.lk", url: "https://www.adaderana.lk/rss.php" },

  // ── Myanmar / Cambodia / Laos (sanctions + narcotics focus)
  { source: "irrawaddy-rss", outlet: "irrawaddy.com", url: "https://www.irrawaddy.com/feed" },
  { source: "mizzima-rss", outlet: "mizzima.com", url: "https://mizzima.com/feeds/nid/0" },
  { source: "myanmarnow-rss", outlet: "myanmar-now.org", url: "https://myanmar-now.org/en/rss" },
  { source: "khmertimes-rss", outlet: "khmertimeskh.com", url: "https://www.khmertimeskh.com/feed/" },
  { source: "phnompenhpost-rss", outlet: "phnompenhpost.com", url: "https://www.phnompenhpost.com/rss.xml" },
  { source: "vientianetimes-rss", outlet: "vientianetimes.org.la", url: "https://www.vientianetimes.org.la/feed/" },

  // ── Eastern Europe / Baltic gaps
  { source: "delfi-lt-rss", outlet: "en.delfi.lt", url: "https://en.delfi.lt/rss" },
  { source: "lsm-rss", outlet: "eng.lsm.lv", url: "https://eng.lsm.lv/rss" },
  { source: "err-rss", outlet: "news.err.ee", url: "https://news.err.ee/rss" },
  { source: "idnes-rss", outlet: "idnes.cz", url: "https://servis.idnes.cz/rss.aspx?c=zpravodajstvi" },
  { source: "digi24-rss", outlet: "digi24.ro", url: "https://www.digi24.ro/rss" },
  { source: "g4media-rss", outlet: "g4media.ro", url: "https://www.g4media.ro/feed" },
  { source: "hvg-rss", outlet: "hvg.hu", url: "https://hvg.hu/rss" },
  { source: "n1-rss", outlet: "n1info.com", url: "https://n1info.com/feed/" },
  { source: "jutarnji-rss", outlet: "jutarnji.hr", url: "https://www.jutarnji.hr/rss" },
  { source: "kapital-bg-rss", outlet: "capital.bg", url: "https://www.capital.bg/rss/" },
  { source: "novinite-rss", outlet: "novinite.com", url: "https://www.novinite.com/rss.xml" },
  { source: "aktuality-rss", outlet: "aktuality.sk", url: "https://www.aktuality.sk/rss/feed/" },
  { source: "sme-sk-rss", outlet: "sme.sk", url: "https://www.sme.sk/rss/sme/economy" },

  // ── Caucasus / Central Asia
  { source: "ocmedia-rss", outlet: "oc-media.org", url: "https://oc-media.org/feed/" },
  { source: "civilgeorgia-rss", outlet: "civil.ge", url: "https://civil.ge/feed" },
  { source: "azerbaijani-rss", outlet: "azernews.az", url: "https://www.azernews.az/rss/" },
  { source: "armenianweekly-rss", outlet: "armenianweekly.com", url: "https://armenianweekly.com/feed/" },
  { source: "ferghana-rss", outlet: "fergana.agency", url: "https://fergana.agency/feed/" },
  { source: "kloop-rss", outlet: "kloop.kg", url: "https://kloop.kg/feed/" },
  { source: "rferl-ca-rss", outlet: "rferl.org", url: "https://www.rferl.org/api/zjmqjmiyus_zym_ptyisvut" },
  { source: "inform-kz-rss", outlet: "inform.kz", url: "https://inform.kz/en/rss" },

  // ── Investigative + financial crime specialists (missing from existing list)
  { source: "gijn-rss", outlet: "gijn.org", url: "https://gijn.org/feed/" },
  { source: "organized-crime-rss", outlet: "globalinitiative.net", url: "https://globalinitiative.net/feed/" },
  { source: "insightcrime-rss", outlet: "insightcrime.org", url: "https://insightcrime.org/feed/" },
  { source: "corruptionwatch-rss", outlet: "corruptionwatch.org.za", url: "https://www.corruptionwatch.org.za/feed/" },
  { source: "transparency-rss", outlet: "transparency.org", url: "https://www.transparency.org/en/rss" },
  { source: "globalwitness-rss", outlet: "globalwitness.org", url: "https://www.globalwitness.org/feed/" },
  { source: "financialtransparency-rss", outlet: "financialtransparency.org", url: "https://financialtransparency.org/feed/" },
  { source: "taxjustice-rss", outlet: "taxjustice.net", url: "https://taxjustice.net/feed/" },
  { source: "gfintegrity-rss", outlet: "gfintegrity.org", url: "https://gfintegrity.org/feed/" },
  { source: "stopthetrafficrss", outlet: "stopthetraffik.org", url: "https://www.stopthetraffik.org/feed/" },
  { source: "c4ads-rss", outlet: "c4ads.org", url: "https://c4ads.org/feed/" },
  { source: "atimes-rss", outlet: "asiatimes.com", url: "https://asiatimes.com/category/finance/feed/" },
  { source: "investigativeeurope-rss", outlet: "investigativeeurope.eu", url: "https://www.investigativeeurope.eu/feed/" },
  { source: "crimemag-rss", outlet: "thecrimemagazine.com", url: "https://www.thecrimemagazine.com/feed/" },
  { source: "fatfplatform-rss", outlet: "fatf-gafi.org", url: "https://www.fatf-gafi.org/en/countries/rss.xml" },

  // ── Lebanon / Iraq / Libya / Syria (MENA conflict zones — high sanctions activity)
  { source: "lorienttodayrss", outlet: "lorientlejour.com", url: "https://www.lorientlejour.com/rss" },
  { source: "rudaw-rss", outlet: "rudaw.net", url: "https://www.rudaw.net/english/rss.xml" },
  { source: "kurdistan24-rss", outlet: "kurdistan24.net", url: "https://www.kurdistan24.net/rss" },
  { source: "libyaobserver-rss", outlet: "libyaobserver.ly", url: "https://libyaobserver.ly/rss.xml" },
  { source: "syriadirect-rss", outlet: "syriadirect.org", url: "https://syriadirect.org/feed/" },
  { source: "arabweekly-rss", outlet: "thearabweekly.com", url: "https://thearabweekly.com/rss.xml" },

  // ── Pacific / Oceania
  { source: "nzherald-rss", outlet: "nzherald.co.nz", url: "https://www.nzherald.co.nz/arc/outboundfeeds/rss/section/business/" },
  { source: "rnz-rss", outlet: "rnz.co.nz", url: "https://www.rnz.co.nz/rss/business.xml" },
  { source: "stuff-nz-rss", outlet: "stuff.co.nz", url: "https://www.stuff.co.nz/rss/national" },
  { source: "smh-rss", outlet: "smh.com.au", url: "https://www.smh.com.au/rss/business.xml" },
  { source: "theaustralian-rss", outlet: "theaustralian.com.au", url: "https://www.theaustralian.com.au/feed/rss" },
  { source: "afr-rss", outlet: "afr.com", url: "https://www.afr.com/rss" },
  { source: "abc-au-business-rss", outlet: "abc.net.au", url: "https://www.abc.net.au/news/feed/51892/rss.xml" },
  { source: "fijitimes-rss", outlet: "fijitimes.com", url: "https://www.fijitimes.com/feed/" },
  { source: "rnzpacific-rss", outlet: "rnz.co.nz", url: "https://www.rnz.co.nz/rss/pacific.xml" },
  { source: "pngpost-rss", outlet: "postcourier.com.pg", url: "https://www.postcourier.com.pg/feed/" },

  // ── Israel / Palestine
  { source: "haaretz-rss", outlet: "haaretz.com", url: "https://www.haaretz.com/cmlink/1.628765" },
  { source: "jpost-rss", outlet: "jpost.com", url: "https://www.jpost.com/rss/rssfeedsfrontpage.aspx" },
  { source: "timesofisrael-rss", outlet: "timesofisrael.com", url: "https://www.timesofisrael.com/feed/" },
  { source: "i24news-rss", outlet: "i24news.tv", url: "https://www.i24news.tv/en/rss" },
  { source: "ynetnews-rss", outlet: "ynetnews.com", url: "https://www.ynetnews.com/category/3082" },

  // ── Gulf states (UAE, Saudi, Qatar, Kuwait)
  { source: "arabnews-rss", outlet: "arabnews.com", url: "https://www.arabnews.com/rss.xml" },
  { source: "saudigazette-rss", outlet: "saudigazette.com.sa", url: "https://saudigazette.com.sa/rss/home" },
  { source: "khaleejtimes-rss", outlet: "khaleejtimes.com", url: "https://www.khaleejtimes.com/feed" },
  { source: "gulfnews-rss", outlet: "gulfnews.com", url: "https://gulfnews.com/rss" },
  { source: "gulftimes-rss", outlet: "gulf-times.com", url: "https://www.gulf-times.com/rss" },
  { source: "arabtimes-rss", outlet: "arabtimesonline.com", url: "https://www.arabtimesonline.com/news/feed/" },
  { source: "gulfbusiness-rss", outlet: "gulfbusiness.com", url: "https://gulfbusiness.com/feed/" },
  { source: "zawya-rss", outlet: "zawya.com", url: "https://www.zawya.com/rss/mena/news" },

  // ── EU financial regulators (CRITICAL for AML compliance intelligence)
  { source: "eba-rss", outlet: "eba.europa.eu", url: "https://www.eba.europa.eu/rss.xml" },
  { source: "esma-rss", outlet: "esma.europa.eu", url: "https://www.esma.europa.eu/rss" },
  { source: "eiopa-rss", outlet: "eiopa.europa.eu", url: "https://www.eiopa.europa.eu/rss.xml" },
  { source: "bafin-rss", outlet: "bafin.de", url: "https://www.bafin.de/SiteGlobals/Functions/RSSFeed/EN/RSSNewsfeed_en.xml" },
  { source: "cssf-rss", outlet: "cssf.lu", url: "https://www.cssf.lu/en/feed/" },
  { source: "amf-fr-rss", outlet: "amf-france.org", url: "https://www.amf-france.org/en/rss.xml" },
  { source: "acpr-rss", outlet: "acpr.banque-france.fr", url: "https://acpr.banque-france.fr/rss.xml" },
  { source: "afm-nl-rss", outlet: "afm.nl", url: "https://www.afm.nl/en/rss" },
  { source: "fma-at-rss", outlet: "fma.gv.at", url: "https://www.fma.gv.at/en/rss.xml" },
  { source: "mfsa-mt-rss", outlet: "mfsa.mt", url: "https://www.mfsa.mt/feed/" },
  { source: "knf-pl-rss", outlet: "knf.gov.pl", url: "https://www.knf.gov.pl/rss/rss_newsy_en.xml" },
  { source: "bancaditalia-rss", outlet: "bancaditalia.it", url: "https://www.bancaditalia.it/media/comunicati/rss-en.xml" },
  { source: "bancaespana-rss", outlet: "bde.es", url: "https://www.bde.es/rss/en/noticias.xml" },
  { source: "cnmv-rss", outlet: "cnmv.es", url: "https://www.cnmv.es/portal/rss/RSSNoticias.ashx?lang=en" },
  { source: "dnb-nl-rss", outlet: "dnb.nl", url: "https://www.dnb.nl/en/rss/" },
  { source: "sfb-ch-rss", outlet: "finma.ch", url: "https://www.finma.ch/en/rss.xml" },
  { source: "fma-li-rss", outlet: "fma-li.li", url: "https://www.fma-li.li/en/rss.xml" },

  // ── More US regulatory / enforcement
  { source: "occ-rss", outlet: "occ.gov", url: "https://www.occ.gov/news-issuances/news-releases/rss.xml" },
  { source: "federalreserve-rss", outlet: "federalreserve.gov", url: "https://www.federalreserve.gov/feeds/press_all.xml" },
  { source: "finra-rss", outlet: "finra.org", url: "https://www.finra.org/rss/news-releases" },
  { source: "dhs-rss", outlet: "dhs.gov", url: "https://www.dhs.gov/dhs-updates/rss.xml" },
  { source: "state-dept-rss", outlet: "state.gov", url: "https://www.state.gov/rss-feeds/press-releases/" },
  { source: "usaid-rss", outlet: "usaid.gov", url: "https://www.usaid.gov/rss/press-releases" },
  { source: "treasury-rss", outlet: "home.treasury.gov", url: "https://home.treasury.gov/system/files/126/treasury.xml" },
  { source: "ice-hsi-rss", outlet: "ice.gov", url: "https://www.ice.gov/rss/news.xml" },
  { source: "dea-rss", outlet: "dea.gov", url: "https://www.dea.gov/rss-feeds" },

  // ── Balkan investigative
  { source: "birn-rss", outlet: "balkaninsight.com", url: "https://balkaninsight.com/feed/" },
  { source: "risemoldova-rss", outlet: "rise.md", url: "https://www.rise.md/rss" },
  { source: "occrp-investigations-rss", outlet: "occrp.org", url: "https://www.occrp.org/en/investigations/feed/rss" },
  { source: "balkaneu-rss", outlet: "balkaneu.com", url: "https://balkaneu.com/feed/" },
  { source: "exit-al-rss", outlet: "exit.al", url: "https://exit.al/en/feed/" },
  { source: "euobserver-rss", outlet: "euobserver.com", url: "https://euobserver.com/rss/feed.xml" },

  // ── Crypto / digital asset intelligence (financial crime focus)
  { source: "chainalysis-rss", outlet: "chainalysis.com", url: "https://www.chainalysis.com/blog/feed/" },
  { source: "elliptic-rss", outlet: "elliptic.co", url: "https://www.elliptic.co/blog/rss.xml" },
  { source: "trmlabs-rss", outlet: "trmlabs.com", url: "https://www.trmlabs.com/post/rss.xml" },
  { source: "ciphertrace-rss", outlet: "ciphertrace.com", url: "https://ciphertrace.com/feed/" },
  { source: "coindesk-policy-rss", outlet: "coindesk.com", url: "https://www.coindesk.com/arc/outboundfeeds/rss/category/policy/" },
  { source: "bitcoinmagazine-rss", outlet: "bitcoinmagazine.com", url: "https://bitcoinmagazine.com/.rss/full/" },
  { source: "cryptoslate-rss", outlet: "cryptoslate.com", url: "https://cryptoslate.com/feed/" },
  { source: "dlnews-rss", outlet: "dlnews.com", url: "https://www.dlnews.com/rss" },

  // ── More Latin America gaps
  { source: "semana-co-rss", outlet: "semana.com", url: "https://www.semana.com/rss.xml" },
  { source: "elcomercio-ec-rss", outlet: "elcomercio.com", url: "https://www.elcomercio.com/feed" },
  { source: "elpais-uy-rss", outlet: "elpais.com.uy", url: "https://www.elpais.com.uy/rss/inicio.rss" },
  { source: "prensalibre-rss", outlet: "prensalibre.com", url: "https://www.prensalibre.com/feed/" },
  { source: "laprensa-hn-rss", outlet: "laprensa.hn", url: "https://www.laprensa.hn/feed/" },
  { source: "elnuevoherald-rss", outlet: "elnuevoherald.com", url: "https://www.elnuevoherald.com/latest-news/rss2.0.xml" },
  { source: "pagina12-rss", outlet: "pagina12.com.ar", url: "https://www.pagina12.com.ar/rss/portada" },
  { source: "perfil-rss", outlet: "perfil.com", url: "https://www.perfil.com/rss.html" },
  { source: "elpulso-ve-rss", outlet: "elpulso.net", url: "https://elpulso.net/feed/" },
  { source: "runrunes-rss", outlet: "runrun.es", url: "https://runrun.es/feed/" },
  { source: "correobolivia-rss", outlet: "correodelsur.com", url: "https://correodelsur.com/feed.xml" },
  { source: "larazon-bo-rss", outlet: "la-razon.com", url: "https://www.la-razon.com/feed/" },

  // ── India investigative + regional
  { source: "thewire-in-rss", outlet: "thewire.in", url: "https://thewire.in/rss" },
  { source: "theprint-rss", outlet: "theprint.in", url: "https://theprint.in/feed/" },
  { source: "scroll-in-rss", outlet: "scroll.in", url: "https://scroll.in/rss" },
  { source: "ndtv-rss", outlet: "ndtv.com", url: "https://feeds.feedburner.com/ndtvnews-top-stories" },
  { source: "newslaundry-rss", outlet: "newslaundry.com", url: "https://www.newslaundry.com/feed" },
  { source: "thequint-rss", outlet: "thequint.com", url: "https://www.thequint.com/rss/news" },

  // ── Nepal / Sri Lanka
  { source: "nepalitimes-rss", outlet: "nepalitimes.com", url: "https://www.nepalitimes.com/feed/" },
  { source: "kathmandupost-rss", outlet: "kathmandupost.com", url: "https://kathmandupost.com/rss" },
  { source: "dailymirrorlk-rss", outlet: "dailymirror.lk", url: "https://www.dailymirror.lk/business-news/rss.xml" },
  { source: "colombopage-rss", outlet: "colombopage.com", url: "https://www.colombopage.com/rss_feed.xml" },

  // ── Southeast Asia gaps
  { source: "jakartapost-rss", outlet: "thejakartapost.com", url: "https://www.thejakartapost.com/rss/business.xml" },
  { source: "vnexpress-rss", outlet: "vnexpress.net", url: "https://vnexpress.net/rss/business.rss" },
  { source: "malaymail-rss", outlet: "malaymail.com", url: "https://www.malaymail.com/feed" },
  { source: "freemsia-rss", outlet: "freemalaysiatoday.com", url: "https://www.freemalaysiatoday.com/feed/" },
  { source: "coconuts-rss", outlet: "coconuts.co", url: "https://coconuts.co/feed/" },
  { source: "nationth-rss", outlet: "nationthailand.com", url: "https://www.nationthailand.com/rss/politics" },
  { source: "manilatimes-rss", outlet: "manilatimes.net", url: "https://www.manilatimes.net/feed/" },
  { source: "abs-cbn-rss", outlet: "abs-cbn.com", url: "https://www.abs-cbn.com/rss/news" },
  { source: "businessmirror-rss", outlet: "businessmirror.com.ph", url: "https://businessmirror.com.ph/feed/" },

  // ── More East Asia
  { source: "shanghaidaily-rss", outlet: "shine.cn", url: "https://www.shine.cn/rss/news/nation/" },
  { source: "sixthtone-rss", outlet: "sixthtone.com", url: "https://www.sixthtone.com/rss" },
  { source: "caixin-rss", outlet: "caixinglobal.com", url: "https://www.caixinglobal.com/rss/en/rss.xml" },
  { source: "scmp-hk-rss", outlet: "scmp.com", url: "https://www.scmp.com/rss/5/feed" },
  { source: "hkfp-rss", outlet: "hongkongfp.com", url: "https://hongkongfp.com/feed/" },
  { source: "nikkei-rss", outlet: "asia.nikkei.com", url: "https://asia.nikkei.com/rss/feed/nar" },

  // ── Ukraine / Belarus / Moldova (active conflict/sanctions zone)
  { source: "kyivindependent-rss", outlet: "kyivindependent.com", url: "https://kyivindependent.com/feed/" },
  { source: "ukrainianpravda-rss", outlet: "pravda.com.ua", url: "https://www.pravda.com.ua/eng/rss/" },
  { source: "ukrinform-rss", outlet: "ukrinform.net", url: "https://www.ukrinform.net/rss/block-lastnews.xml" },
  { source: "eurasianet-rss", outlet: "eurasianet.org", url: "https://eurasianet.org/rss.xml" },
  { source: "naviny-rss", outlet: "naviny.online", url: "https://naviny.online/rss" },
  { source: "euroradio-rss", outlet: "euroradio.fm", url: "https://euroradio.fm/rss" },

  // ── More Nordic / Baltic
  { source: "svt-rss", outlet: "svt.se", url: "https://www.svt.se/nyheter/rss.xml" },
  { source: "kauppalehti-rss", outlet: "kauppalehti.fi", url: "https://www.kauppalehti.fi/xml/feed" },
  { source: "borsen-dk-rss", outlet: "borsen.dk", url: "https://borsen.dk/nyheder/rss" },
  { source: "dagbladet-rss", outlet: "dagbladet.no", url: "https://www.dagbladet.no/feed/rss" },
  { source: "e24-no-rss", outlet: "e24.no", url: "https://e24.no/rss/2" },
  { source: "diena-lt-rss", outlet: "en.diena.lt", url: "https://en.diena.lt/rss" },

  // ── AML / compliance specialized trade press
  { source: "complianceweek-rss", outlet: "complianceweek.com", url: "https://www.complianceweek.com/rss" },
  { source: "risknet-rss", outlet: "risk.net", url: "https://www.risk.net/rss" },
  { source: "amlwatchdog-rss", outlet: "amlwatchdog.com", url: "https://amlwatchdog.com/feed/" },
  { source: "acamstoday-rss", outlet: "acamstoday.org", url: "https://www.acamstoday.org/feed/" },
  { source: "kycaml-rss", outlet: "financialcrimenews.com", url: "https://financialcrimenews.com/feed/" },
  { source: "tookitaki-rss", outlet: "tookitaki.com", url: "https://tookitaki.com/blog/feed/" },
  { source: "jdsupra-fin-rss", outlet: "jdsupra.com", url: "https://www.jdsupra.com/topics/financial-regulation/rss" },
  { source: "globcompliancenews-rss", outlet: "globalcompliancenews.com", url: "https://globalcompliancenews.com/feed/" },
  { source: "mlro-rss", outlet: "themoneylaundering.com", url: "https://www.themoneylaundering.com/feed/" },
  { source: "lexology-finreg-rss", outlet: "lexology.com", url: "https://www.lexology.com/rss?topic=anti-money-laundering" },

  // ── More Africa (Central / Southern / Horn)
  { source: "zimbabwesituation-rss", outlet: "zimbabwesituation.com", url: "https://www.zimbabwesituation.com/feed/" },
  { source: "lusakatimes-rss", outlet: "lusakatimes.com", url: "https://www.lusakatimes.com/feed/" },
  { source: "malawi24-rss", outlet: "malawi24.com", url: "https://malawi24.com/feed/" },
  { source: "namnews-rss", outlet: "namibian.com.na", url: "https://www.namibian.com.na/rss" },
  { source: "mofax-rss", outlet: "mofax.co.mz", url: "https://www.mofax.co.mz/feed/" },
  { source: "africareport-rss", outlet: "theafricareport.com", url: "https://www.theafricareport.com/feed/" },
  { source: "modernghana-rss", outlet: "modernghana.com", url: "https://www.modernghana.com/rss/" },
  { source: "herald-zw-rss", outlet: "herald.co.zw", url: "https://www.herald.co.zw/feed/" },
  { source: "almerijadaily-rss", outlet: "algeriapress.dz", url: "https://www.aps.dz/en/rss" },
  { source: "tunis-afrique-rss", outlet: "tap.info.tn", url: "https://www.tap.info.tn/en/rss" },

  // ── Trade finance / shipping (TBML — trade-based money laundering)
  { source: "gtr-rss", outlet: "gtreview.com", url: "https://www.gtreview.com/feed/" },
  { source: "tfg-rss", outlet: "tradefinanceglobal.com", url: "https://www.tradefinanceglobal.com/feed/" },
  { source: "lloydslist-rss", outlet: "lloydslist.com", url: "https://www.lloydslist.com/rss.xml" },
  { source: "tradewinds-rss", outlet: "tradewindsnews.com", url: "https://www.tradewindsnews.com/rss" },
  { source: "offshore-energy-rss", outlet: "offshore-energy.biz", url: "https://www.offshore-energy.biz/feed/" },
  { source: "gcaptain-rss", outlet: "gcaptain.com", url: "https://gcaptain.com/feed/" },
  { source: "maritimeexec-rss", outlet: "maritime-executive.com", url: "https://maritime-executive.com/rss" },

  // ── Global wire services (native-language feeds)
  { source: "xinhua-rss", outlet: "xinhuanet.com", url: "http://www.xinhuanet.com/english/rss/worldrss.xml" },
  { source: "tass-rss", outlet: "tass.com", url: "https://tass.com/rss/v2.xml" },
  { source: "dpa-rss", outlet: "dpa.com", url: "https://www.dpa.com/rss/latest.rss" },
  { source: "ansa-rss", outlet: "ansa.it", url: "https://www.ansa.it/sito/notizie/economia/economia_rss.xml" },
  { source: "efe-rss", outlet: "efe.com", url: "https://www.efe.com/efe/english/rss/portada.xml" },
  { source: "kyodo-rss", outlet: "kyodonews.net", url: "https://english.kyodonews.net/rss/all.xml" },
  { source: "yonhap-rss", outlet: "yna.co.kr", url: "https://en.yna.co.kr/RSS/economy.xml" },
  { source: "anadolu-rss", outlet: "aa.com.tr", url: "https://www.aa.com.tr/en/rss/default?cat=economy" },
  { source: "wam-rss", outlet: "wam.ae", url: "https://wam.ae/en/rss" },
  { source: "spa-rss", outlet: "spa.gov.sa", url: "https://www.spa.gov.sa/rss/en/economy.xml" },
  { source: "kuna-rss", outlet: "kuna.net.kw", url: "https://www.kuna.net.kw/rss/en/economy.xml" },
  { source: "qna-rss", outlet: "qna.org.qa", url: "https://www.qna.org.qa/en/rss/economy.xml" },
  { source: "map-rss", outlet: "mapnews.ma", url: "https://www.mapnews.ma/en/rss" },
  { source: "tap-tn-rss", outlet: "tap.info.tn", url: "https://www.tap.info.tn/en/rss" },

  // ── AML / financial-crime regulators (global)
  { source: "austrac-rss", outlet: "austrac.gov.au", url: "https://www.austrac.gov.au/rss.xml" },
  { source: "fintrac-rss", outlet: "fintrac-canafe.gc.ca", url: "https://www.fintrac-canafe.gc.ca/new-neuf/feed-en.xml" },
  { source: "mas-rss", outlet: "mas.gov.sg", url: "https://www.mas.gov.sg/rss/news.xml" },
  { source: "sfc-hk-rss", outlet: "sfc.hk", url: "https://www.sfc.hk/en/rss/news.xml" },
  { source: "asic-rss", outlet: "asic.gov.au", url: "https://asic.gov.au/about-asic/news-centre/rss-feeds/?p=mediareleases" },
  { source: "apra-rss", outlet: "apra.gov.au", url: "https://www.apra.gov.au/rss.xml" },
  { source: "sebi-rss", outlet: "sebi.gov.in", url: "https://www.sebi.gov.in/sebiweb/home/HomeAction.do?doListing=yes&sid=0&ssid=0&smid=0&pageno=1&ftype=rss" },
  { source: "rbi-rss", outlet: "rbi.org.in", url: "https://www.rbi.org.in/Scripts/RSS.aspx" },
  { source: "fsa-jp-rss", outlet: "fsa.go.jp", url: "https://www.fsa.go.jp/en/rss/news.xml" },
  { source: "fsc-kr-rss", outlet: "fsc.go.kr", url: "https://www.fsc.go.kr/en/rss/news.xml" },
  { source: "sarb-rss", outlet: "resbank.co.za", url: "https://www.resbank.co.za/en/rss/news.xml" },
  { source: "cbn-ng-rss", outlet: "cbn.gov.ng", url: "https://www.cbn.gov.ng/rss.asp" },
  { source: "cbk-ke-rss", outlet: "centralbank.go.ke", url: "https://www.centralbank.go.ke/rss/" },
  { source: "sfo-uk-rss", outlet: "sfo.gov.uk", url: "https://www.sfo.gov.uk/feed/" },
  { source: "ofsi-gov-rss", outlet: "gov.uk", url: "https://www.gov.uk/government/organisations/office-of-financial-sanctions-implementation/activity.atom" },
  { source: "fma-nz-rss", outlet: "fma.govt.nz", url: "https://www.fma.govt.nz/rss" },
  { source: "osfi-rss", outlet: "osfi-bsif.gc.ca", url: "https://www.osfi-bsif.gc.ca/en/rss/news" },
  { source: "ifsra-rss", outlet: "centralbank.ie", url: "https://www.centralbank.ie/regulation/industry-market-sectors/anti-money-laundering-countering-the-financing-of-terrorism/rss" },
  { source: "dfsa-rss", outlet: "dfsa.ae", url: "https://www.dfsa.ae/news/rss" },
  { source: "cma-sa-rss", outlet: "cma.org.sa", url: "https://www.cma.org.sa/en/MediaCenter/News/Pages/rss.aspx" },
  { source: "vara-rss", outlet: "vara.ae", url: "https://www.vara.ae/en/rss" },

  // ── Investigative journalism (new additions)
  { source: "tbij-rss", outlet: "thebureauinvestigates.com", url: "https://www.thebureauinvestigates.com/feed" },
  { source: "propublica-rss", outlet: "propublica.org", url: "https://www.propublica.org/feeds/propublica/main" },
  { source: "thesentry-rss", outlet: "thesentry.org", url: "https://thesentry.org/feed/" },
  { source: "financeuncovered-rss", outlet: "financeuncovered.org", url: "https://financeuncovered.org/feed/" },
  { source: "correctiv-rss", outlet: "correctiv.org", url: "https://correctiv.org/feed/" },
  { source: "followthemoneyNL-rss", outlet: "ftm.eu", url: "https://www.ftm.eu/feed" },
  { source: "forbiddenstories-rss", outlet: "forbiddenstories.org", url: "https://forbiddenstories.org/feed/" },
  { source: "papertrailmedia-rss", outlet: "papertrailmedia.de", url: "https://www.papertrailmedia.de/feed/" },
  { source: "dossiercentre-rss", outlet: "dossiercentre.org", url: "https://dossiercentre.org/feed/" },
  { source: "sourcemat-rss", outlet: "source-material.org", url: "https://source-material.org/feed/" },
  { source: "wiredrep-rss", outlet: "wired-gov.net", url: "https://wired-gov.net/wg/news.nsf/home?openform&rss" },
  { source: "irpicenter-rss", outlet: "irpicenter.com", url: "https://irpicenter.com/en/feed/" },
  { source: "reportingproject-rss", outlet: "thereportingproject.org", url: "https://thereportingproject.org/feed/" },

  // ── Think tanks / policy (financial crime + sanctions focus)
  { source: "csis-rss", outlet: "csis.org", url: "https://www.csis.org/rss.xml" },
  { source: "brookings-rss", outlet: "brookings.edu", url: "https://www.brookings.edu/feed/" },
  { source: "cfr-rss", outlet: "cfr.org", url: "https://www.cfr.org/rss.xml" },
  { source: "chathamhouse-rss", outlet: "chathamhouse.org", url: "https://www.chathamhouse.org/rss.xml" },
  { source: "crisisgroup-rss", outlet: "crisisgroup.org", url: "https://www.crisisgroup.org/rss.xml" },
  { source: "rusi-rss", outlet: "rusi.org", url: "https://rusi.org/rss.xml" },
  { source: "carnegie-rss", outlet: "carnegieendowment.org", url: "https://carnegieendowment.org/rss/solr.xml" },
  { source: "wilsoncenter-rss", outlet: "wilsoncenter.org", url: "https://www.wilsoncenter.org/rss.xml" },
  { source: "stimson-rss", outlet: "stimson.org", url: "https://www.stimson.org/feed/" },
  { source: "c4isrnet-rss", outlet: "c4isrnet.com", url: "https://www.c4isrnet.com/rss/all/" },
  { source: "theconversation-rss", outlet: "theconversation.com", url: "https://theconversation.com/us/articles.atom" },
  { source: "georgetownsec-rss", outlet: "georgetownsecuritystudies.org", url: "https://georgetownsecuritystudies.org/feed/" },

  // ── More national papers — gaps by jurisdiction
  { source: "luxtimes-rss", outlet: "luxtimes.lu", url: "https://www.luxtimes.lu/en/rss" },
  { source: "brusselstimes-rss", outlet: "brusselstimes.com", url: "https://www.brusselstimes.com/feed/" },
  { source: "warsawbiz-rss", outlet: "warsawbusinessjournal.com", url: "https://warsawbusinessjournal.com/feed/" },
  { source: "bbj-hu-rss", outlet: "bbj.hu", url: "https://bbj.hu/rss" },
  { source: "sofiaglobe-rss", outlet: "sofiaglobe.com", url: "https://sofiaglobe.com/feed/" },
  { source: "sarajevotimes-rss", outlet: "sarajevotimes.com", url: "https://sarajevotimes.com/feed/" },
  { source: "georgiatoday-rss", outlet: "georgiatoday.ge", url: "https://georgiatoday.ge/feed/" },
  { source: "bakutoday-rss", outlet: "bakupost.az", url: "https://bakupost.az/rss" },
  { source: "astana-times-rss", outlet: "astanatimes.com", url: "https://astanatimes.com/feed/" },
  { source: "moldova-rss", outlet: "moldova.org", url: "https://www.moldova.org/en/rss" },
  { source: "tiranatimes-rss", outlet: "tiranatimes.com", url: "https://www.tiranatimes.com/feed/" },
  { source: "serbiamon-rss", outlet: "serbia-monitor.com", url: "https://www.serbia-monitor.com/feed" },
  { source: "skopjedaily-rss", outlet: "skopjedailynews.mk", url: "https://skopjedailynews.mk/feed/" },
  { source: "irishtimes-rss", outlet: "irishtimes.com", url: "https://www.irishtimes.com/cmlink/the-irish-times-news-1.1319192" },
  { source: "rteie-rss", outlet: "rte.ie", url: "https://www.rte.ie/rss/news.xml" },
  { source: "icelandmonitor-rss", outlet: "icelandmonitor.mbl.is", url: "https://icelandmonitor.mbl.is/rss/" },
  { source: "maltaindependent-rss", outlet: "independent.com.mt", url: "https://www.independent.com.mt/rss" },
  { source: "timesofmalta-rss", outlet: "timesofmalta.com", url: "https://timesofmalta.com/rss/news.xml" },

  // ── More Middle East / MENA
  { source: "almonitor-rss", outlet: "al-monitor.com", url: "https://www.al-monitor.com/rss" },
  { source: "iraninternational-rss", outlet: "iranintl.com", url: "https://www.iranintl.com/en/rss" },
  { source: "radiofarda-rss", outlet: "radiofarda.com", url: "https://www.radiofarda.com/api/epiqq" },
  { source: "arabweekly2-rss", outlet: "thearabweekly.com", url: "https://thearabweekly.com/rss" },
  { source: "zawya-sanctions-rss", outlet: "zawya.com", url: "https://www.zawya.com/rss/mena/legal-regulatory" },

  // ── More Africa
  { source: "quartzafrica-rss", outlet: "qz.com", url: "https://qz.com/africa/rss" },
  { source: "techcabal-rss", outlet: "techcabal.com", url: "https://techcabal.com/feed/" },
  { source: "newafricanmag-rss", outlet: "newafricanmagazine.com", url: "https://newafricanmagazine.com/feed/" },
  { source: "africanbus-rss", outlet: "africanbusinessmagazine.com", url: "https://africanbusinessmagazine.com/feed/" },
  { source: "stears-rss", outlet: "stears.co", url: "https://www.stears.co/feed/" },
  { source: "restofworld-rss", outlet: "restofworld.org", url: "https://restofworld.org/feed/latest" },
  { source: "afriquefrance-rss", outlet: "afriquefrance.fr", url: "https://afriquefrance.fr/feed/" },
  { source: "jeuneafrique-rss", outlet: "jeuneafrique.com", url: "https://www.jeuneafrique.com/feed/rss/" },

  // ── More crypto / digital assets
  { source: "blockworks-rss", outlet: "blockworks.co", url: "https://blockworks.co/feed/" },
  { source: "unchained-rss", outlet: "unchainedcrypto.com", url: "https://unchainedcrypto.com/feed/" },
  { source: "thedefiant-rss", outlet: "thedefiant.io", url: "https://thedefiant.io/feed" },
  { source: "protos-rss", outlet: "protos.com", url: "https://protos.com/feed/" },
  { source: "cryptonews-rss", outlet: "cryptonews.com", url: "https://cryptonews.com/news/feed/" },
  { source: "bitcoinist-rss", outlet: "bitcoinist.com", url: "https://bitcoinist.com/feed/" },

  // ── More South Asia
  { source: "dhakatribune-rss", outlet: "dhakatribune.com", url: "https://www.dhakatribune.com/rss" },
  { source: "tbsbd-rss", outlet: "tbsnews.net", url: "https://www.tbsnews.net/rss" },
  { source: "newsminute-rss", outlet: "thenewsminute.com", url: "https://www.thenewsminute.com/rss" },
  { source: "thehimalayan-rss", outlet: "thehimalayantimes.com", url: "https://thehimalayantimes.com/feed/" },
  { source: "himalouth-rss", outlet: "himalsouthasian.com", url: "https://www.himalsouthasian.com/feed/" },

  // ── More Southeast Asia
  { source: "tempo-id-rss", outlet: "en.tempo.co", url: "https://en.tempo.co/rss/business" },
  { source: "khaosod-rss", outlet: "khaosodenglish.com", url: "https://www.khaosodenglish.com/feed/" },
  { source: "vietnamplus-rss", outlet: "vietnamplus.vn", url: "https://en.vietnamplus.vn/rss/news.rss" },
  { source: "myanmartimes-rss", outlet: "mmtimes.com", url: "https://www.mmtimes.com/rss" },
  { source: "mekongeyerss", outlet: "mekongeye.com", url: "https://mekongeye.com/feed/" },
  { source: "benarnews-rss", outlet: "benarnews.org", url: "https://www.benarnews.org/rss/english/all-stories.xml" },
  { source: "islandsbiz-rss", outlet: "islandsbusiness.com", url: "https://islandsbusiness.com/feed/" },

  // ── More Latin America investigative
  { source: "elmostrador-rss", outlet: "elmostrador.cl", url: "https://www.elmostrador.cl/feed/" },
  { source: "confidencial-ni-rss", outlet: "confidencial.digital", url: "https://confidencial.digital/feed/" },
  { source: "plazapublica-rss", outlet: "plazapublica.com.gt", url: "https://www.plazapublica.com.gt/feed" },
  { source: "nexojornal-rss", outlet: "nexojornal.com.br", url: "https://www.nexojornal.com.br/rss" },
  { source: "agenciapublica-rss", outlet: "agenciapublica.org.br", url: "https://agenciapublica.org.br/feed/" },
  { source: "ojoconmipato-rss", outlet: "ojoconmipato.org", url: "https://ojoconmipato.org/feed/" },
  { source: "elpitazo-rss", outlet: "elpitazo.net", url: "https://elpitazo.net/feed/" },
  { source: "verdadabierta-rss", outlet: "verdadabierta.com", url: "https://verdadabierta.com/feed/" },

  // ── Open data / transparency / campaign finance
  { source: "opensecrets-rss", outlet: "opensecrets.org", url: "https://www.opensecrets.org/news/feed/" },
  { source: "followthemoneyeu-rss", outlet: "followthemoney.eu", url: "https://www.followthemoney.eu/feed/" },
  { source: "globaleaks-rss", outlet: "globaleaks.org", url: "https://www.globaleaks.org/blog/feed/" },
  { source: "odcrisis-rss", outlet: "odc.org", url: "https://www.odc.org/feed/" },
  { source: "globalfinancialint-rss", outlet: "gfintegrity.org", url: "https://gfintegrity.org/feed/rss/" },

  // ── More court / legal intel
  { source: "lawfareblog-rss", outlet: "lawfaremedia.org", url: "https://www.lawfaremedia.org/feed" },
  { source: "justsecurity-rss", outlet: "justsecurity.org", url: "https://www.justsecurity.org/feed/" },
  { source: "globallegmonitor-rss", outlet: "loc.gov", url: "https://www.loc.gov/rss/law/new.xml" },
  { source: "ejiltalk-rss", outlet: "ejiltalk.org", url: "https://www.ejiltalk.org/feed/" },
  { source: "mondaq-aml-rss", outlet: "mondaq.com", url: "https://www.mondaq.com/rss/toc_135.xml" },

  // ── International AML bodies & multilateral enforcement
  { source: "unodc-rss", outlet: "unodc.org", url: "https://www.unodc.org/rss/press-release.xml" },
  { source: "olaf-rss", outlet: "ec.europa.eu", url: "https://anti-fraud.ec.europa.eu/rss.xml" },
  { source: "eppo-rss", outlet: "eppo.europa.eu", url: "https://www.eppo.europa.eu/en/rss.xml" },
  { source: "moneyval-rss", outlet: "coe.int", url: "https://www.coe.int/en/web/moneyval/rss" },
  { source: "greco-rss", outlet: "coe.int", url: "https://www.coe.int/en/web/greco/rss" },
  { source: "egmont-rss", outlet: "egmontgroup.org", url: "https://egmontgroup.org/feed/" },
  { source: "apg-rss", outlet: "apgml.org", url: "https://www.apgml.org/news/rss.aspx" },
  { source: "giaba-rss", outlet: "giaba.org", url: "https://www.giaba.org/rss/" },
  { source: "gafilat-rss", outlet: "gafilat.org", url: "https://www.gafilat.org/index.php/en/rss" },
  { source: "menafatf-rss", outlet: "menafatf.org", url: "https://www.menafatf.org/en/rss" },
  { source: "esaamlg-rss", outlet: "esaamlg.org", url: "https://www.esaamlg.org/news/rss" },
  { source: "wolfsberg-rss", outlet: "wolfsberg-principles.com", url: "https://www.wolfsberg-principles.com/feed/" },
  { source: "basil-rss", outlet: "baselgovernance.org", url: "https://baselgovernance.org/rss.xml" },
  { source: "u4-rss", outlet: "u4.no", url: "https://www.u4.no/rss" },
  { source: "undp-rss", outlet: "undp.org", url: "https://www.undp.org/rss.xml" },
  { source: "unodc-fiu-rss", outlet: "unodc.org", url: "https://www.unodc.org/rss/financial-crime.xml" },

  // ── Switzerland / Liechtenstein / Austria (key offshore + banking)
  { source: "nzz-rss", outlet: "nzz.ch", url: "https://www.nzz.ch/wirtschaft.rss" },
  { source: "tagesanzeiger-rss", outlet: "tagesanzeiger.ch", url: "https://www.tagesanzeiger.ch/wirtschaft/rss.html" },
  { source: "letemps-rss", outlet: "letemps.ch", url: "https://www.letemps.ch/rss" },
  { source: "bilan-rss", outlet: "bilan.ch", url: "https://www.bilan.ch/rss" },
  { source: "srf-rss", outlet: "srf.ch", url: "https://www.srf.ch/news/rss/bnf.rss" },
  { source: "rts-rss", outlet: "rts.ch", url: "https://www.rts.ch/rss/news.xml" },
  { source: "derstandard-rss", outlet: "derstandard.at", url: "https://www.derstandard.at/rss" },
  { source: "diepresse-rss", outlet: "diepresse.com", url: "https://www.diepresse.com/rss/Wirtschaft" },
  { source: "orf-rss", outlet: "orf.at", url: "https://rss.orf.at/news.xml" },
  { source: "wienwirtschaft-rss", outlet: "wirtschaftsblatt.at", url: "https://www.wienerzeitung.at/rss/wirtschaft.xml" },

  // ── Taiwan + Greater China
  { source: "taipeitimes-rss", outlet: "taipeitimes.com", url: "https://www.taipeitimes.com/rss/front" },
  { source: "taiwannews-rss", outlet: "taiwannews.com.tw", url: "https://www.taiwannews.com.tw/rss/index.rss" },
  { source: "wirechina-rss", outlet: "thewirechina.com", url: "https://www.thewirechina.com/feed/" },
  { source: "radiofreeasia-rss", outlet: "rfa.org", url: "https://www.rfa.org/english/rss2.xml" },
  { source: "voanews-rss", outlet: "voanews.com", url: "https://www.voanews.com/api/ztrqq$mpqpt" },
  { source: "dw-cn-rss", outlet: "dw.com", url: "https://rss.dw.com/atom/rss-zh-world" },

  // ── Central America + Caribbean (narco/corruption/offshore)
  { source: "laprensa-pa-rss", outlet: "prensa.com", url: "https://www.prensa.com/rss/economia.xml" },
  { source: "estrellapanama-rss", outlet: "laestrella.com.pa", url: "https://www.laestrella.com.pa/rss/economia" },
  { source: "listindiario-rss", outlet: "listindiario.com", url: "https://listindiario.com/rss/" },
  { source: "acento-rss", outlet: "acento.com.do", url: "https://acento.com.do/feed/" },
  { source: "diariolibre-rss", outlet: "diariolibre.com", url: "https://www.diariolibre.com/rss/portada" },
  { source: "laprensahn-rss", outlet: "laprensa.hn", url: "https://www.laprensa.hn/feed/" },
  { source: "elheraldohn-rss", outlet: "elheraldo.hn", url: "https://www.elheraldo.hn/rss/portada" },
  { source: "elsalvadornews-rss", outlet: "elsalvadornews.net", url: "https://www.elsalvadornews.net/feed/" },
  { source: "elfaro-sv-rss", outlet: "elfaro.net", url: "https://elfaro.net/en/rss" },
  { source: "gato-encerrado-rss", outlet: "gatoencerrado.net", url: "https://www.gatoencerrado.net/feed/" },
  { source: "caribbeannewsglobal-rss", outlet: "caribbeannewsglobal.com", url: "https://www.caribbeannewsglobal.com/feed/" },
  { source: "nationnews-bb-rss", outlet: "nationnews.com", url: "https://www.nationnews.com/rss/" },

  // ── More Mexico investigative
  { source: "lajornada-rss", outlet: "jornada.com.mx", url: "https://www.jornada.com.mx/rss/portada.xml" },
  { source: "proceso-rss", outlet: "proceso.com.mx", url: "https://www.proceso.com.mx/rss/" },
  { source: "sinembargo-rss", outlet: "sinembargo.mx", url: "https://www.sinembargo.mx/feed" },
  { source: "contralinea-rss", outlet: "contralinea.com.mx", url: "https://contralinea.com.mx/feed/" },
  { source: "quinto-elemento-rss", outlet: "quintoelab.org", url: "https://quintoelab.org/feed/" },

  // ── More Nigeria / West Africa
  { source: "dailytrust-rss", outlet: "dailytrust.com", url: "https://dailytrust.com/feed/" },
  { source: "thisday-ng-rss", outlet: "thisdaylive.com", url: "https://www.thisdaylive.com/index.php/feed/" },
  { source: "leadership-ng-rss", outlet: "leadership.ng", url: "https://leadership.ng/feed/" },
  { source: "nigerianeye-rss", outlet: "nigerianeye.com", url: "https://nigerianeye.com/feed/" },
  { source: "ripplesnigeria-rss", outlet: "ripplesnigeria.com", url: "https://www.ripplesnigeria.com/feed/" },
  { source: "icirng-rss", outlet: "icir.com.ng", url: "https://www.icir.com.ng/feed/" },
  { source: "africaunion-rss", outlet: "au.int", url: "https://au.int/en/rss" },
  { source: "westafricanpilot-rss", outlet: "westafricanpilot.com", url: "https://westafricanpilot.com/feed/" },
  { source: "businessamlive-rss", outlet: "businessamlive.com", url: "https://businessamlive.com/feed/" },

  // ── East / Central Africa
  { source: "rwnewstimes-rss", outlet: "newtimes.co.rw", url: "https://www.newtimes.co.rw/rss.xml" },
  { source: "addisfortune-rss", outlet: "addisfortune.news", url: "https://addisfortune.news/feed/" },
  { source: "radiodabanga-rss", outlet: "dabangasudan.org", url: "https://dabangasudan.org/en/feed" },
  { source: "eacbl-rss", outlet: "eabw.com", url: "https://www.eabw.com/feed/" },
  { source: "theexchange-rss", outlet: "theexchange.africa", url: "https://theexchange.africa/feed/" },
  { source: "kenyanwallst-rss", outlet: "kenyanwallstreet.com", url: "https://kenyanwallstreet.com/feed/" },
  { source: "bunifu-rss", outlet: "businessdailyafrica.com", url: "https://www.businessdailyafrica.com/bd/data/rss" },
  { source: "citizentv-ke-rss", outlet: "citizen.digital", url: "https://www.citizen.digital/feed" },
  { source: "southsudan-eye-rss", outlet: "southsudaneyemedia.com", url: "https://southsudaneyemedia.com/feed/" },
  { source: "thenationss-rss", outlet: "thenationmirror.com", url: "https://thenationmirror.com/feed/" },

  // ── Southern Africa
  { source: "moneyweb-rss", outlet: "moneyweb.co.za", url: "https://www.moneyweb.co.za/feed/" },
  { source: "fin24-rss", outlet: "fin24.com", url: "https://www.fin24.com/rss/news" },
  { source: "sundaytimes-sa-rss", outlet: "timeslive.co.za", url: "https://www.timeslive.co.za/rss/" },
  { source: "zambiawatchdog-rss", outlet: "zambiawatchdog.com", url: "https://zambiawatchdog.com/feed/" },
  { source: "zambiadailymail-rss", outlet: "daily-mail.co.zm", url: "https://www.daily-mail.co.zm/feed/" },
  { source: "timeszambia-rss", outlet: "times.co.zm", url: "https://www.times.co.zm/feed/" },
  { source: "zimmorningpost-rss", outlet: "zimmorningpost.com", url: "https://zimmorningpost.com/feed/" },
  { source: "bulawayo24-rss", outlet: "bulawayo24.com", url: "https://bulawayo24.com/feed/" },

  // ── North Africa (French + Arabic)
  { source: "almasryalyoum-rss", outlet: "almasryalyoum.com", url: "https://www.almasryalyoum.com/rss/frontpage" },
  { source: "egyptindependent-rss", outlet: "egyptindependent.com", url: "https://egyptindependent.com/feed/" },
  { source: "dailynewsegypt-rss", outlet: "dailynewsegypt.com", url: "https://dailynewsegypt.com/feed/" },
  { source: "tsa-dz-rss", outlet: "tsa-algerie.com", url: "https://www.tsa-algerie.com/rss/" },
  { source: "elkhabar-rss", outlet: "elkhabar.com", url: "https://www.elkhabar.com/press/rss/" },
  { source: "businessnews-tn-rss", outlet: "businessnews.com.tn", url: "https://www.businessnews.com.tn/rss" },
  { source: "telquel-rss", outlet: "telquel.ma", url: "https://telquel.ma/feed/" },
  { source: "medias24-rss", outlet: "medias24.com", url: "https://medias24.com/feed/" },

  // ── More CIS / post-Soviet investigative
  { source: "currenttime-rss", outlet: "currenttime.tv", url: "https://www.currenttime.tv/rss" },
  { source: "kavkazreality-rss", outlet: "kavkazreality.com", url: "https://kavkazreality.com/rss" },
  { source: "nbcentralasia-rss", outlet: "centralasianews.net", url: "https://centralasianews.net/feed/" },
  { source: "rferl-ua-rss", outlet: "radiosvoboda.org", url: "https://www.radiosvoboda.org/api/zp-qiqt_um_ztmiu" },
  { source: "kyivpost-rss", outlet: "kyivpost.com", url: "https://www.kyivpost.com/rss" },
  { source: "ukrpravda-rss", outlet: "epravda.com.ua", url: "https://www.epravda.com.ua/rss/economics.xml" },

  // ── More Asia-Pacific + Pacific islands
  { source: "pacificbeat-rss", outlet: "abc.net.au", url: "https://www.abc.net.au/pacific/feed/52278/rss.xml" },
  { source: "pacificislandtimes-rss", outlet: "pacificislandtimes.com", url: "https://www.pacificislandtimes.com/feed/" },
  { source: "rni-rss", outlet: "rnz.co.nz", url: "https://www.rnz.co.nz/rss/international.xml" },
  { source: "pireport-rss", outlet: "pireport.org", url: "https://www.pireport.org/rss.xml" },
  { source: "fijisun-rss", outlet: "fijisun.com.fj", url: "https://fijisun.com.fj/feed/" },
  { source: "radionz-rss", outlet: "rnz.co.nz", url: "https://www.rnz.co.nz/rss/news.xml" },

  // ── More South Asia investigative + regional
  { source: "thediplomat-sa-rss", outlet: "thediplomat.com", url: "https://thediplomat.com/category/south-asia/feed/" },
  { source: "gandhara-rss", outlet: "gandhara.rferl.org", url: "https://gandhara.rferl.org/api/zp-tqvpptmm_ztmiu" },
  { source: "dawncrime-rss", outlet: "dawn.com", url: "https://www.dawn.com/feeds/crime" },
  { source: "thetribune-in-rss", outlet: "tribuneindia.com", url: "https://www.tribuneindia.com/rss/feed?catId=20" },
  { source: "telanganatoday-rss", outlet: "telanganatoday.com", url: "https://telanganatoday.com/feed" },
  { source: "mathrubhumi-rss", outlet: "english.mathrubhumi.com", url: "https://english.mathrubhumi.com/rss/news.xml" },

  // ── More Southeast Asian investigative
  { source: "asiasentinel2-rss", outlet: "asiasentinel.com", url: "https://www.asiasentinel.com/category/business/feed" },
  { source: "coconuts-sg-rss", outlet: "coconuts.co", url: "https://coconuts.co/singapore/feed/" },
  { source: "coconuts-kl-rss", outlet: "coconuts.co", url: "https://coconuts.co/kuala-lumpur/feed/" },
  { source: "themalaymailonline-rss", outlet: "malaymail.com", url: "https://www.malaymail.com/category/malaysia/feed" },
  { source: "thesundaily-rss", outlet: "thesundaily.my", url: "https://www.thesundaily.my/rss/newsrss.xml" },
  { source: "cambodiadaily-rss", outlet: "cambodiadaily.com", url: "https://cambodiadaily.com/feed/" },
  { source: "mizzima-economy-rss", outlet: "mizzima.com", url: "https://mizzima.com/economy/feed" },
  { source: "laotiantimes-rss", outlet: "laotiantimes.com", url: "https://laotiantimes.com/feed/" },

  // ── Financial / banking specialist press
  { source: "bankingexchange-rss", outlet: "bankingexchange.com", url: "https://www.bankingexchange.com/rss/category/news" },
  { source: "paymentssource-rss", outlet: "paymentssource.com", url: "https://www.paymentssource.com/rss/section/news" },
  { source: "globalbankingfin-rss", outlet: "globalbankingandfinance.com", url: "https://www.globalbankingandfinance.com/feed/" },
  { source: "americanbanker-rss", outlet: "americanbanker.com", url: "https://www.americanbanker.com/rss/news" },
  { source: "ifr-rss", outlet: "ifre.com", url: "https://www.ifre.com/rss/news.xml" },
  { source: "euromoney-rss", outlet: "euromoney.com", url: "https://www.euromoney.com/rss/latestnews.aspx" },
  { source: "thetimes-fin-rss", outlet: "thetimes.co.uk", url: "https://www.thetimes.co.uk/money/rss" },
  { source: "thisismoney-rss", outlet: "thisismoney.co.uk", url: "https://www.thisismoney.co.uk/money/rss.xml" },

  // ── Export controls / sanctions specialist
  { source: "exportcompliancedaily-rss", outlet: "exportcompliancedaily.com", url: "https://www.exportcompliancedaily.com/rss/" },
  { source: "sanctionsio-rss", outlet: "sanctions.io", url: "https://sanctions.io/blog/feed/" },
  { source: "gibsondunn-sanct-rss", outlet: "gibsondunn.com", url: "https://www.gibsondunn.com/rss/practice/sanctions" },
  { source: "tradelaw-rss", outlet: "tradecompliance.com", url: "https://www.tradecompliance.com/feed/" },
  { source: "customstoday-rss", outlet: "customstoday.com.pk", url: "https://customstoday.com.pk/feed/" },

  // ── More Balkan + Eastern EU
  { source: "balkans-rss", outlet: "balkansweb.com", url: "https://www.balkansweb.com/rss" },
  { source: "oslobodjenje-rss", outlet: "oslobodjenje.ba", url: "https://www.oslobodjenje.ba/rss" },
  { source: "klix-rss", outlet: "klix.ba", url: "https://www.klix.ba/rss" },
  { source: "vijesti-rss", outlet: "vijesti.me", url: "https://www.vijesti.me/rss" },
  { source: "pobjeda-rss", outlet: "pobjeda.me", url: "https://www.pobjeda.me/rss" },
  { source: "reportersro-rss", outlet: "reporters.ro", url: "https://www.reporters.ro/feed/" },
  { source: "czdnes-rss", outlet: "czpres.com", url: "https://www.czpres.com/feed/" },
  { source: "spectator-sk-rss", outlet: "spectator.sme.sk", url: "https://spectator.sme.sk/rss" },
  { source: "dailybusiness-ro-rss", outlet: "dailybusiness.ro", url: "https://www.dailybusiness.ro/feed/" },

  // ── Euronews + multilingual broadcast
  { source: "euronews-en-rss", outlet: "euronews.com", url: "https://www.euronews.com/rss?level=theme&name=news" },
  { source: "euronews-fr-rss", outlet: "euronews.com", url: "https://fr.euronews.com/rss?level=theme&name=news" },
  { source: "euronews-de-rss", outlet: "euronews.com", url: "https://de.euronews.com/rss?level=theme&name=news" },
  { source: "euronews-ar-rss", outlet: "euronews.com", url: "https://arabic.euronews.com/rss?level=theme&name=news" },
  { source: "arte-rss", outlet: "arte.tv", url: "https://www.arte.tv/api/rss/guide/fr/" },
  { source: "dw-ru-rss", outlet: "dw.com", url: "https://rss.dw.com/atom/rss-ru-news" },
  { source: "dw-ar-rss", outlet: "dw.com", url: "https://rss.dw.com/atom/rss-ara-all" },
  { source: "dw-tr-rss", outlet: "dw.com", url: "https://rss.dw.com/atom/rss-tur-all" },
  { source: "dw-fa-rss", outlet: "dw.com", url: "https://rss.dw.com/atom/rss-per-all" },
  { source: "dw-uk-rss", outlet: "dw.com", url: "https://rss.dw.com/atom/rss-ukr-all" },
  { source: "bbcpersian-rss", outlet: "bbc.com", url: "https://feeds.bbci.co.uk/persian/rss.xml" },
  { source: "bbcurdu-rss", outlet: "bbc.com", url: "https://feeds.bbci.co.uk/urdu/rss.xml" },
  { source: "bbcarabic-rss", outlet: "bbc.com", url: "https://feeds.bbci.co.uk/arabic/rss.xml" },
  { source: "bbcturkish-rss", outlet: "bbc.com", url: "https://feeds.bbci.co.uk/turkce/rss.xml" },
  { source: "bbcvietnamese-rss", outlet: "bbc.com", url: "https://feeds.bbci.co.uk/vietnamese/rss.xml" },
  { source: "bbcmundo-rss", outlet: "bbc.com", url: "https://feeds.bbci.co.uk/mundo/rss.xml" },
  { source: "bbcbrasil-rss", outlet: "bbc.com", url: "https://feeds.bbci.co.uk/portuguese/rss.xml" },
  { source: "bbcchina-rss", outlet: "bbc.com", url: "https://feeds.bbci.co.uk/zhongwen/simp/rss.xml" },
  { source: "bbcrussian-rss", outlet: "bbc.com", url: "https://feeds.bbci.co.uk/russian/rss.xml" },
  { source: "voa-africa-rss", outlet: "voanews.com", url: "https://www.voanews.com/api/ztrqq$mpq_ty" },
  { source: "rfi-africa-rss", outlet: "rfi.fr", url: "https://www.rfi.fr/fr/rss" },
  { source: "france24-ar-rss", outlet: "france24.com", url: "https://www.france24.com/ar/rss" },

  // ── Francophone Africa (critical gap — FATF grey-list countries)
  { source: "agenceecofin-rss", outlet: "agenceecofin.com", url: "https://www.agenceecofin.com/rss/finance" },
  { source: "jeuneafrique-eco-rss", outlet: "jeuneafrique.com", url: "https://www.jeuneafrique.com/rss/economie/" },
  { source: "africanmanager-rss", outlet: "africanmanager.com", url: "https://africanmanager.com/feed/" },
  { source: "leconomiste-ma-rss", outlet: "leconomiste.com", url: "https://www.leconomiste.com/rss.xml" },
  { source: "lefaso-rss", outlet: "lefaso.net", url: "https://lefaso.net/spip.php?page=backend" },
  { source: "journalducameroun-rss", outlet: "journalducameroun.com", url: "https://www.journalducameroun.com/feed/" },
  { source: "mutations-cm-rss", outlet: "mutations.info", url: "https://www.mutations.info/spip.php?page=backend" },
  { source: "gabonreview-rss", outlet: "gabonreview.com", url: "https://www.gabonreview.com/feed/" },
  { source: "radiookapi-rss", outlet: "radiookapi.net", url: "https://www.radiookapi.net/feed" },
  { source: "congoindep-rss", outlet: "congoindependant.com", url: "https://www.congoindependant.com/feed/" },
  { source: "congo-research-rss", outlet: "congoresearchgroup.org", url: "https://congoresearchgroup.org/feed/" },
  { source: "malijet-rss", outlet: "malijet.com", url: "https://malijet.com/rss" },
  { source: "leguide-gn-rss", outlet: "leguineenportail.net", url: "https://leguineenportail.net/feed/" },
  { source: "abidjannet-rss", outlet: "abidjan.net", url: "https://news.abidjan.net/rss.asp" },
  { source: "koaci-rss", outlet: "koaci.com", url: "https://koaci.com/rss" },
  { source: "pressafrik-rss", outlet: "pressafrik.com", url: "https://www.pressafrik.com/spip.php?page=backend" },
  { source: "seneweb-rss", outlet: "seneweb.com", url: "https://www.seneweb.com/news/rss.xml" },
  { source: "lequotidien-sn-rss", outlet: "lequotidien.sn", url: "https://www.lequotidien.sn/feed/" },
  { source: "igfm-sn-rss", outlet: "igfm.sn", url: "https://www.igfm.sn/feed/" },
  { source: "beninwebtv-rss", outlet: "beninwebtv.com", url: "https://beninwebtv.com/feed/" },
  { source: "togobreaking-rss", outlet: "togobreaking.info", url: "https://www.togobreaking.info/feed/" },
  { source: "togoweb-rss", outlet: "togoweb.net", url: "https://www.togoweb.net/rss.xml" },
  { source: "nigerdiaspora-rss", outlet: "nigerdiaspora.com", url: "https://www.nigerdiaspora.com/feed/" },
  { source: "actuniger-rss", outlet: "actuniger.com", url: "https://actuniger.com/feed/" },
  { source: "sahelien-rss", outlet: "sahelien.com", url: "https://sahelien.com/feed/" },

  // ── Hungarian + Polish investigative (EU rule-of-law hotspots)
  { source: "444hu-rss", outlet: "444.hu", url: "https://444.hu/feed" },
  { source: "direkt36-rss", outlet: "direkt36.hu", url: "https://www.direkt36.hu/feed/" },
  { source: "magyarnarancs-rss", outlet: "magyarnarancs.hu", url: "https://magyarnarancs.hu/rss" },
  { source: "atlatszo-rss", outlet: "atlatszo.hu", url: "https://atlatszo.hu/feed/" },
  { source: "portalhun-rss", outlet: "portfolio.hu", url: "https://www.portfolio.hu/rss/all.xml" },
  { source: "tvn24-pl-rss", outlet: "tvn24.pl", url: "https://tvn24.pl/najnowsze.xml" },
  { source: "wyborcza-rss", outlet: "wyborcza.pl", url: "https://wyborcza.pl/rss/1,75399.xml" },
  { source: "onet-pl-rss", outlet: "onet.pl", url: "https://wiadomosci.onet.pl/rss/region/polska/rss.xml" },
  { source: "newsweekpl-rss", outlet: "newsweek.pl", url: "https://www.newsweek.pl/feeds.xml" },
  { source: "oko-press-rss", outlet: "oko.press", url: "https://oko.press/feed/" },
  { source: "respekt-cz-rss", outlet: "respekt.cz", url: "https://www.respekt.cz/rss-export/all" },
  { source: "denik-n-rss", outlet: "denikn.cz", url: "https://denikn.cz/feed/" },
  { source: "zdg-md-rss", outlet: "zdg.md", url: "https://www.zdg.md/feed/" },
  { source: "anticoruptie-md-rss", outlet: "anticoruptie.md", url: "https://anticoruptie.md/en/feed" },
  { source: "rise-ro-rss", outlet: "riseromania.ro", url: "https://www.riseromania.ro/feed/" },

  // ── More Latin America investigative
  { source: "ojopublico-rss", outlet: "ojo-publico.com", url: "https://ojo-publico.com/feed" },
  { source: "idlreporteros-rss", outlet: "idl-reporteros.pe", url: "https://idl-reporteros.pe/feed/" },
  { source: "larepublica-pe-rss", outlet: "larepublica.pe", url: "https://larepublica.pe/rss/portada" },
  { source: "lasillavacia-rss", outlet: "lasillavacia.co", url: "https://lasillavacia.com/feed/" },
  { source: "razonpublica-rss", outlet: "razonpublica.com", url: "https://razonpublica.com/feed/" },
  { source: "colombiareports-rss", outlet: "colombiareports.com", url: "https://colombiareports.com/feed/" },
  { source: "brecha-uy-rss", outlet: "brecha.com.uy", url: "https://brecha.com.uy/feed/" },
  { source: "observador-uy-rss", outlet: "elobservador.com.uy", url: "https://www.elobservador.com.uy/rss/portada.xml" },
  { source: "abccolor-py-rss", outlet: "abc.com.py", url: "https://www.abc.com.py/rss/portada" },
  { source: "lanacion-py-rss", outlet: "lanacion.com.py", url: "https://www.lanacion.com.py/feed/" },
  { source: "metropoles-rss", outlet: "metropoles.com", url: "https://www.metropoles.com/feed" },
  { source: "elpitazo-ve-rss", outlet: "elpitazo.net", url: "https://elpitazo.net/category/economia/feed/" },
  { source: "talcualdigital-rss", outlet: "talcualdigital.com", url: "https://talcualdigital.com/feed/" },

  // ── More Southern + Eastern Africa
  { source: "newframe-rss", outlet: "newframe.com", url: "https://www.newframe.com/feed/" },
  { source: "groundup-rss", outlet: "groundup.org.za", url: "https://groundup.org.za/feed/" },
  { source: "mmegi-rss", outlet: "mmegi.bw", url: "https://www.mmegi.bw/rss" },
  { source: "leso-times-rss", outlet: "lestimes.com", url: "https://lestimes.com/feed/" },
  { source: "swaziobserver-rss", outlet: "observer.org.sz", url: "https://www.observer.org.sz/feed/" },
  { source: "nation-mw-rss", outlet: "mwnation.com", url: "https://mwnation.com/feed/" },
  { source: "frontpageafrica-rss", outlet: "frontpageafricaonline.com", url: "https://frontpageafricaonline.com/feed/" },
  { source: "liberianobserver-rss", outlet: "liberianobserver.com", url: "https://www.liberianobserver.com/feed/" },
  { source: "awoko-sl-rss", outlet: "awoko.org", url: "https://awoko.org/feed/" },
  { source: "concord-sl-rss", outlet: "concordsl.net", url: "https://www.concordsl.net/feed/" },
  { source: "thepoint-gm-rss", outlet: "thepoint.gm", url: "https://thepoint.gm/rss" },
  { source: "foroyaa-gm-rss", outlet: "foroyaa.net", url: "https://foroyaa.net/feed/" },

  // ── More Middle East / Gulf
  { source: "alquds-rss", outlet: "alquds.com", url: "https://www.alquds.com/feed/" },
  { source: "asharqalawsat-rss", outlet: "aawsat.com", url: "https://aawsat.com/rss.xml" },
  { source: "alahednews-rss", outlet: "al-monitor.com", url: "https://www.al-monitor.com/rss" },
  { source: "yemenmirror-rss", outlet: "yemenmirror.com", url: "https://www.yemenmirror.com/feed/" },
  { source: "marebpress-rss", outlet: "marebpress.net", url: "https://marebpress.net/feed/" },
  { source: "thearabreport-rss", outlet: "thearabreport.net", url: "https://thearabreport.net/feed/" },
  { source: "annahar-rss", outlet: "annahar.com", url: "https://www.annahar.com/rss" },
  { source: "elnashra-rss", outlet: "elnashra.com", url: "https://www.elnashra.com/rss/news" },

  // ── More South / Southeast Asia
  { source: "thefinexpress-bd-rss", outlet: "thefinancialexpress.com.bd", url: "https://thefinancialexpress.com.bd/feed" },
  { source: "newagebd-rss", outlet: "newagebd.net", url: "https://www.newagebd.net/rss/latest" },
  { source: "deccanherald-rss", outlet: "deccanherald.com", url: "https://www.deccanherald.com/rss-feed/nation" },
  { source: "newindexpress-rss", outlet: "newindianexpress.com", url: "https://www.newindianexpress.com/rss/industry-and-economy" },
  { source: "moneycontrol-rss", outlet: "moneycontrol.com", url: "https://www.moneycontrol.com/rss/buzzingstocks.xml" },
  { source: "financialexpress-in-rss", outlet: "financialexpress.com", url: "https://www.financialexpress.com/feed/" },
  { source: "thequint-crime-rss", outlet: "thequint.com", url: "https://www.thequint.com/rss/crime" },
  { source: "philippinestar-rss", outlet: "philstar.com", url: "https://www.philstar.com/rss/headlines" },
  { source: "manilatimes2-rss", outlet: "manilatimes.net", url: "https://www.manilatimes.net/category/business/feed/" },
  { source: "pna-ph-rss", outlet: "pna.gov.ph", url: "https://www.pna.gov.ph/rss/latest.xml" },
  { source: "vietfinance-rss", outlet: "vir.com.vn", url: "https://vir.com.vn/rss/news.rss" },
  { source: "antara-rss", outlet: "antaranews.com", url: "https://www.antaranews.com/rss/terkini" },
  { source: "detik-rss", outlet: "news.detik.com", url: "https://rss.detik.com/index.php/detikcom" },

  // ── More Pacific
  { source: "matangitonga-rss", outlet: "matangitonga.to", url: "https://matangitonga.to/feed" },
  { source: "pacificconfidential-rss", outlet: "pacificconfidential.nz", url: "https://www.pacificconfidential.nz/feed/" },
  { source: "rnz-pacific2-rss", outlet: "rnz.co.nz", url: "https://www.rnz.co.nz/rss/pacific/feed.xml" },

  // ── OECD / multilateral economic
  { source: "oecd-rss", outlet: "oecd.org", url: "https://www.oecd.org/newsroom/rss/news.xml" },
  { source: "wto-rss", outlet: "wto.org", url: "https://www.wto.org/english/res_e/reser_e/rssnews_e.rss" },
  { source: "g20-rss", outlet: "g20.org", url: "https://www.g20.org/rss.xml" },
  { source: "iif-rss", outlet: "iif.com", url: "https://www.iif.com/rss" },
  { source: "eiti-rss", outlet: "eiti.org", url: "https://eiti.org/feed" },
  { source: "nrgi-rss", outlet: "resourcegovernance.org", url: "https://resourcegovernance.org/feed" },
  { source: "globalwitness2-rss", outlet: "globalwitness.org", url: "https://www.globalwitness.org/en/campaigns/feed/" },
  { source: "openownership-rss", outlet: "openownership.org", url: "https://www.openownership.org/en/rss.xml" },
  { source: "swiftinstitute-rss", outlet: "swiftinstitute.org", url: "https://swiftinstitute.org/feed/" },

  // ── More court / legal intel
  { source: "sdny-rss", outlet: "justice.gov", url: "https://www.justice.gov/usao-sdny/news/rss" },
  { source: "edny-rss", outlet: "justice.gov", url: "https://www.justice.gov/usao-edny/news/rss" },
  { source: "doj-criminal-rss", outlet: "justice.gov", url: "https://www.justice.gov/criminal/news/rss" },
  { source: "doj-nsd-rss", outlet: "justice.gov", url: "https://www.justice.gov/nsd/news/rss" },
  { source: "fcpa-blog-rss", outlet: "fcpablog.com", url: "https://fcpablog.com/feed/" },
  { source: "fcpa-professor-rss", outlet: "fcpaprofessor.com", url: "https://fcpaprofessor.com/feed/" },
  { source: "ibar-rss", outlet: "ibanet.org", url: "https://www.ibanet.org/rss/news" },

  // ── More crypto / DeFi / digital assets crime
  { source: "coincenter-rss", outlet: "coincenter.org", url: "https://coincenter.org/feed" },
  { source: "messari-rss", outlet: "messari.io", url: "https://messari.io/rss" },
  { source: "crypto-enforcement-rss", outlet: "sec.gov", url: "https://www.sec.gov/litigation/litreleases/tag/digital-asset/rss.xml" },
  { source: "doj-crypto-rss", outlet: "justice.gov", url: "https://www.justice.gov/opa/news/rss?category=cryptocurrency" },
  { source: "fatf-crypto-rss", outlet: "fatf-gafi.org", url: "https://www.fatf-gafi.org/en/topics/virtual-assets/rss.xml" },

  // ── More financial crime / AML specialist
  { source: "fincrimeconnect-rss", outlet: "fincrimeconnect.com", url: "https://fincrimeconnect.com/feed/" },
  { source: "kyc360-rss", outlet: "kyc360.com", url: "https://kyc360.riskscreen.com/feed/" },
  { source: "theguardianmlb-rss", outlet: "theguardian.com", url: "https://www.theguardian.com/world/money-laundering/rss" },
  { source: "thetimes-crime-rss", outlet: "thetimes.co.uk", url: "https://www.thetimes.co.uk/crime/rss" },
  { source: "dfrlab-rss", outlet: "dfrlab.org", url: "https://dfrlab.org/feed/" },
  { source: "stanfordio-rss", outlet: "cyber.fsi.stanford.edu", url: "https://cyber.fsi.stanford.edu/io/rss.xml" },
  { source: "freedomhouse-rss", outlet: "freedomhouse.org", url: "https://freedomhouse.org/rss.xml" },
  { source: "carnegieethics-rss", outlet: "carnegiecouncil.org", url: "https://www.carnegiecouncil.org/rss/all" },

  // ── Round 8: Central Asia & Caucasus ─────────────────────────────────────
  { source: "rferl-rss", outlet: "rferl.org", url: "https://www.rferl.org/api/zpqmepiqeriuuv" },
  { source: "rferl-kz-rss", outlet: "rferl.org/kazakh", url: "https://rus.azattyq.org/rss/latest.rss" },
  { source: "rferl-uz-rss", outlet: "rferl.org/uzbek", url: "https://rus.ozodlik.org/rss/latest.rss" },
  { source: "rferl-tj-rss", outlet: "rferl.org/tajik", url: "https://rus.ozodi.org/rss/latest.rss" },
  { source: "rferl-tm-rss", outlet: "rferl.org/turkmen", url: "https://rus.azathabar.com/rss/latest.rss" },
  { source: "rferl-az-rss", outlet: "rferl.org/azerbaijani", url: "https://www.azadliq.org/rss/latest.rss" },
  { source: "rferl-ge-rss", outlet: "rferl.org/georgian", url: "https://www.ekhokavkaza.com/rss/latest.rss" },
  { source: "rferl-am-rss", outlet: "rferl.org/armenian", url: "https://www.azatutyun.am/rss/latest.rss" },
  { source: "occrp-central-asia", outlet: "occrp.org", url: "https://www.occrp.org/en/component/tags/tag/central-asia?format=feed&type=rss" },
  { source: "hetq-am", outlet: "hetq.am", url: "https://hetq.am/en/rss" },
  { source: "investigative-kz", outlet: "vlast.kz", url: "https://vlast.kz/feed/" },
  { source: "factcheck-ge", outlet: "factcheck.ge", url: "https://factcheck.ge/en/feed/" },
  { source: "oc-media-ge", outlet: "oc-media.org", url: "https://oc-media.org/feed/" },
  { source: "jam-news-am", outlet: "jam-news.net", url: "https://jam-news.net/feed/" },
  { source: "meydan-az", outlet: "meydan.tv", url: "https://meydan.tv/en/rss" },
  { source: "tolonews-af", outlet: "tolonews.com", url: "https://tolonews.com/rss.xml" },
  { source: "ariana-af", outlet: "ariananews.af", url: "https://ariananews.af/feed/" },
  { source: "khaama-af", outlet: "khaama.com", url: "https://www.khaama.com/feed/" },

  // ── Round 8: South Asia expanded ─────────────────────────────────────────
  { source: "daily-star-bd", outlet: "thedailystar.net", url: "https://www.thedailystar.net/rss.xml" },
  { source: "prothom-alo-en", outlet: "prothomalo.com", url: "https://en.prothomalo.com/feed" },
  { source: "bdnews24", outlet: "bdnews24.com", url: "https://bdnews24.com/?widgetName=rssfeed&widgetId=1150&getXmlFeed=true" },
  { source: "dawn-pk", outlet: "dawn.com", url: "https://www.dawn.com/feeds/home" },
  { source: "geo-pk", outlet: "geo.tv", url: "https://www.geo.tv/rss/10" },
  { source: "the-news-pk", outlet: "thenews.com.pk", url: "https://www.thenews.com.pk/rss/1/8" },
  { source: "friday-times-pk", outlet: "thefridaytimes.com", url: "https://thefridaytimes.com/feed/" },
  { source: "nayadaur-pk", outlet: "nayadaur.tv", url: "https://nayadaur.tv/feed/" },
  { source: "himal-southasian", outlet: "himalmag.com", url: "https://www.himalmag.com/feed/" },
  { source: "kathmandu-post", outlet: "kathmandupost.com", url: "https://kathmandupost.com/rss" },
  { source: "myrepublica-np", outlet: "myrepublica.com", url: "https://myrepublica.nagariknetwork.com/rss/news.xml" },
  { source: "daily-mirror-lk", outlet: "dailymirror.lk", url: "https://www.dailymirror.lk/rss" },
  { source: "colombo-gazette-lk", outlet: "colombogazette.com", url: "https://colombogazette.com/feed/" },
  { source: "maldives-independent", outlet: "maldivesindependent.com", url: "https://maldivesindependent.com/feed/" },
  { source: "kuensel-bt", outlet: "kuenselonline.com", url: "https://kuenselonline.com/feed/" },

  // ── Round 8: Southeast Asia expanded ────────────────────────────────────
  { source: "khmer-times-kh", outlet: "khmertimeskh.com", url: "https://www.khmertimeskh.com/feed/" },
  { source: "voa-khmer", outlet: "voacambodia.com", url: "https://www.voacambodia.com/api/zqomitteii" },
  { source: "irrawaddy-mm", outlet: "irrawaddy.com", url: "https://www.irrawaddy.com/feed" },
  { source: "mizzima-mm", outlet: "mizzima.com", url: "https://mizzima.com/rss.xml" },
  { source: "myanmar-now", outlet: "myanmar-now.org", url: "https://www.myanmar-now.org/feed" },
  { source: "vientiane-times-la", outlet: "vientianetimes.org.la", url: "https://www.vientianetimes.org.la/rss.xml" },
  { source: "rfa-lao", outlet: "rfa.org/lao", url: "https://www.rfa.org/lao/rss2.xml" },
  { source: "rfa-khmer", outlet: "rfa.org/khmer", url: "https://www.rfa.org/khmer/rss2.xml" },
  { source: "rfa-burmese", outlet: "rfa.org/burmese", url: "https://www.rfa.org/burmese/rss2.xml" },
  { source: "rfa-vietnamese", outlet: "rfa.org/vietnamese", url: "https://www.rfa.org/vietnamese/rss2.xml" },
  { source: "rfa-mandarin", outlet: "rfa.org/mandarin", url: "https://www.rfa.org/mandarin/rss2.xml" },
  { source: "rfa-tibetan", outlet: "rfa.org/tibetan", url: "https://www.rfa.org/tibetan/rss2.xml" },
  { source: "rfa-uyghur", outlet: "rfa.org/uyghur", url: "https://www.rfa.org/uyghur/rss2.xml" },
  { source: "coconuts-media", outlet: "coconuts.co", url: "https://coconuts.co/feed/" },
  { source: "nikkei-asia", outlet: "asia.nikkei.com", url: "https://asia.nikkei.com/rss/feed/nar" },
  { source: "timorpost-tl", outlet: "timorpost.com", url: "https://timorpost.com/feed/" },
  { source: "tempo-id", outlet: "tempo.co", url: "https://en.tempo.co/rss/id/nasional" },
  { source: "kompas-id", outlet: "kompas.com", url: "https://rss.kompas.com/nasional" },
  { source: "vn-express", outlet: "vnexpress.net", url: "https://vnexpress.net/rss/the-gioi.rss" },
  { source: "thanhnien-vn", outlet: "thanhnien.vn", url: "https://thanhnien.vn/rss/home.rss" },

  // ── Round 8: East Asia expanded ──────────────────────────────────────────
  { source: "japan-times", outlet: "japantimes.co.jp", url: "https://www.japantimes.co.jp/feed/topstories/" },
  { source: "mainichi-shimbun", outlet: "mainichi.jp", url: "https://mainichi.jp/rss/articles.rss" },
  { source: "yomiuri-shimbun", outlet: "yomiuri.co.jp", url: "https://www.yomiuri.co.jp/feed/" },
  { source: "korea-herald", outlet: "koreaherald.com", url: "https://www.koreaherald.com/rss/020100000000.xml" },
  { source: "korea-times", outlet: "koreatimes.co.kr", url: "https://www.koreatimes.co.kr/www/rss/rss.xml" },
  { source: "yonhap-en", outlet: "yonhapnewsagency.com", url: "https://en.yna.co.kr/RSS/news.xml" },
  { source: "scmp-hk", outlet: "scmp.com", url: "https://www.scmp.com/rss/4/feed" },
  { source: "hk-free-press", outlet: "hongkongfp.com", url: "https://hongkongfp.com/feed/" },
  { source: "taiwan-news", outlet: "taiwannews.com.tw", url: "https://www.taiwannews.com.tw/rss/index.rss" },
  { source: "focus-taiwan", outlet: "focustaiwan.tw", url: "https://focustaiwan.tw/rss/aall.xml" },
  { source: "the-reporter-tw", outlet: "twreporter.org", url: "https://www.twreporter.org/a/rss2.0.xml" },

  // ── Round 8: Eastern Europe / Balkans ────────────────────────────────────
  { source: "kyiv-independent", outlet: "kyivindependent.com", url: "https://kyivindependent.com/feed/" },
  { source: "ukrainska-pravda-en", outlet: "pravda.com.ua", url: "https://www.pravda.com.ua/eng/rss/" },
  { source: "meduza-en", outlet: "meduza.io", url: "https://meduza.io/rss/all" },
  { source: "the-insider-ru", outlet: "theins.ru", url: "https://theins.ru/en/feed/" },
  { source: "istories-ru", outlet: "istories.media", url: "https://istories.media/en/feed/" },
  { source: "schema-data-ua", outlet: "schema.org.ua", url: "https://www.schema.org.ua/en/feed/" },
  { source: "bne-intellinews", outlet: "intellinews.com", url: "https://www.intellinews.com/rss/news/" },
  { source: "balkan-insight", outlet: "balkaninsight.com", url: "https://balkaninsight.com/feed/" },
  { source: "birn-rss", outlet: "birn.eu.com", url: "https://birn.eu.com/feed/" },
  { source: "krik-rs", outlet: "krik.rs", url: "https://www.krik.rs/feed/" },
  { source: "cins-rs", outlet: "cins.rs", url: "https://www.cins.rs/en/feed/" },
  { source: "investigace-cz", outlet: "investigace.cz", url: "https://www.investigace.cz/feed/" },
  { source: "juzna-srbija-rs", outlet: "juznavest.com", url: "https://juznavest.com/feed/" },
  { source: "frontstory-pl", outlet: "frontstory.pl", url: "https://frontstory.pl/feed/" },
  { source: "delfi-lt", outlet: "en.delfi.lt", url: "https://en.delfi.lt/rss/all.xml" },
  { source: "delfi-lv", outlet: "eng.lsm.lv", url: "https://eng.lsm.lv/rss/latest.a.rss" },
  { source: "err-ee", outlet: "err.ee", url: "https://www.err.ee/rss/uudised" },
  { source: "postimees-en", outlet: "postimees.ee", url: "https://news.postimees.ee/rss" },
  { source: "re-check-am", outlet: "recheck.am", url: "https://recheck.am/en/feed/" },
  { source: "investigative-bg", outlet: "bivol.bg", url: "https://bivol.bg/en/feed" },

  // ── Round 8: Nordic / Western Europe investigative ───────────────────────
  { source: "efto-nl", outlet: "ftm.nl", url: "https://www.ftm.nl/en/rss" },
  { source: "correctiv-de", outlet: "correctiv.org", url: "https://correctiv.org/feed/" },
  { source: "frag-den-staat-de", outlet: "fragdenstaat.de", url: "https://fragdenstaat.de/en/feed/latest/" },
  { source: "finance-uncovered", outlet: "financeuncovered.org", url: "https://www.financeuncovered.org/feed/" },
  { source: "tbij-uk", outlet: "thebureauinvestigates.com", url: "https://www.thebureauinvestigates.com/feed" },
  { source: "exaro-uk", outlet: "opendemocracy.net", url: "https://www.opendemocracy.net/rss.xml" },
  { source: "followthemoney-eu", outlet: "followthemoney.eu", url: "https://www.followthemoney.eu/feed/" },
  { source: "organised-crime-corruption", outlet: "ocindex.net", url: "https://ocindex.net/feed" },
  { source: "forsvaret-dk", outlet: "information.dk", url: "https://www.information.dk/rss" },
  { source: "dn-no", outlet: "dn.no", url: "https://www.dn.no/rss" },
  { source: "aftonbladet-se", outlet: "aftonbladet.se", url: "https://rss.aftonbladet.se/rss2/small/pages/sections/senastenytt/" },
  { source: "yle-fi-en", outlet: "yle.fi", url: "https://feeds.yle.fi/uutiset/v1/majorHeadlines/YLE_UUTISET.rss" },

  // ── Round 8: North Africa / Sahel expanded ────────────────────────────────
  { source: "alaraby-en", outlet: "alaraby.co.uk", url: "https://alaraby.co.uk/feed" },
  { source: "maghreb-confidential", outlet: "africaintelligence.com", url: "https://www.africaintelligence.com/rss/ama.xml" },
  { source: "tap-tn", outlet: "tap.info.tn", url: "http://www.tap.info.tn/en/rss-feeds/news.xml" },
  { source: "aps-dz", outlet: "aps.dz", url: "https://www.aps.dz/en/rss/1-latest-news.rss" },
  { source: "map-ma", outlet: "mapnews.ma", url: "https://www.mapnews.ma/en/rss/all-news" },
  { source: "sahel-intelligence", outlet: "sahel-intelligence.com", url: "https://sahel-intelligence.com/feed/" },
  { source: "mali-actu", outlet: "maliactu.net", url: "https://maliactu.net/feed/" },
  { source: "burkina-info", outlet: "lefaso.net", url: "https://lefaso.net/spip.php?page=backend" },
  { source: "niger24-ne", outlet: "niger24.com", url: "https://niger24.com/feed/" },
  { source: "allafrica-sahel", outlet: "allafrica.com", url: "https://allafrica.com/tools/headlines/rdf/sahel/headlines.rdf" },

  // ── Round 8: West & Central Africa expanded ──────────────────────────────
  { source: "africa-confidential", outlet: "africa-confidential.com", url: "https://www.africa-confidential.com/rss" },
  { source: "cameroon-concord", outlet: "cameroon-concord.com", url: "https://www.cameroon-concord.com/index.php?format=feed&type=rss" },
  { source: "equatorialguinea-rss", outlet: "eguineapress.com", url: "https://eguineapress.com/feed/" },
  { source: "centrafrique-info", outlet: "centrafrique-info.com", url: "https://www.centrafrique-info.com/feed/" },
  { source: "tchad-infos", outlet: "tchadinfos.com", url: "https://tchadinfos.com/feed/" },
  { source: "gabon-review", outlet: "gabonreview.com", url: "https://www.gabonreview.com/feed/" },
  { source: "congo-planet-cd", outlet: "congoplanet.com", url: "https://www.congoplanet.com/rss/" },
  { source: "rfi-afrique", outlet: "rfi.fr", url: "https://www.rfi.fr/fr/rss/afrique.xml" },
  { source: "deutsche-welle-africa", outlet: "dw.com", url: "https://rss.dw.com/rdf/rss-en-africa" },

  // ── Round 8: East Africa expanded ────────────────────────────────────────
  { source: "the-east-african", outlet: "theeastafrican.co.ke", url: "https://www.theeastafrican.co.ke/tea/rss" },
  { source: "africa-report", outlet: "theafricareport.com", url: "https://www.theafricareport.com/feed/" },
  { source: "nation-africa-ke", outlet: "nation.africa", url: "https://nation.africa/kenya/rss.xml" },
  { source: "monitor-ug", outlet: "monitor.co.ug", url: "https://www.monitor.co.ug/rss/all" },
  { source: "the-citizen-tz", outlet: "thecitizen.co.tz", url: "https://www.thecitizen.co.tz/tanzania/rss" },
  { source: "addis-standard-et", outlet: "addisstandard.com", url: "https://addisstandard.com/feed/" },
  { source: "ethiopia-insight", outlet: "ethiopia-insight.com", url: "https://ethiopia-insight.com/feed/" },
  { source: "the-reporter-et", outlet: "thereporterethiopia.com", url: "https://www.thereporterethiopia.com/rss" },
  { source: "somalia-newsroom", outlet: "somalianewsroom.com", url: "https://somalianewsroom.com/feed/" },
  { source: "garowe-so", outlet: "garoweonline.com", url: "https://www.garoweonline.com/rss.xml" },
  { source: "somaliland-sun", outlet: "somalilandsun.com", url: "https://www.somalilandsun.com/feed/" },
  { source: "eritrea-hub", outlet: "eritreahub.org", url: "https://eritreahub.org/feed" },
  { source: "djibouti-news", outlet: "lanationdj.com", url: "https://www.lanationdj.com/feed/" },
  { source: "sd-mirror-sd", outlet: "sudanmirror.com", url: "https://www.sudanmirror.com/feed/" },
  { source: "dabanga-sd", outlet: "dabangasudan.org", url: "https://www.dabangasudan.org/en/rss.xml" },
  { source: "madamasr-eg", outlet: "madamasr.com", url: "https://www.madamasr.com/en/feed/" },
  { source: "mada-masr-ar", outlet: "madamasr.com/ar", url: "https://www.madamasr.com/ar/feed/" },

  // ── Round 8: Southern Africa expanded ────────────────────────────────────
  { source: "namibian-na", outlet: "namibian.com.na", url: "https://www.namibian.com.na/rss/" },
  { source: "the-witness-za", outlet: "witness.co.za", url: "https://www.witness.co.za/rss/" },
  { source: "mail-guardian-za", outlet: "mg.co.za", url: "https://mg.co.za/feed/" },
  { source: "daily-maverick-za", outlet: "dailymaverick.co.za", url: "https://www.dailymaverick.co.za/rss" },
  { source: "amabhungane-za", outlet: "amabhungane.co.za", url: "https://amabhungane.co.za/feed/" },
  { source: "newzimbabwe-zw", outlet: "newzimbabwe.com", url: "https://www.newzimbabwe.com/feed/" },
  { source: "newsday-zw", outlet: "newsday.co.zw", url: "https://www.newsday.co.zw/rss/" },
  { source: "zambia-daily-mail", outlet: "daily-mail.co.zm", url: "https://www.daily-mail.co.zm/feed/" },
  { source: "lusaka-times-zm", outlet: "lusakatimes.com", url: "https://www.lusakatimes.com/feed/" },
  { source: "malawi24-mw", outlet: "malawi24.com", url: "https://malawi24.com/feed/" },
  { source: "mozambique-channel", outlet: "club-of-mozambique.com", url: "https://clubofmozambique.com/feed/" },
  { source: "madagascar-tribune", outlet: "madagascar-tribune.com", url: "https://www.madagascar-tribune.com/index.rss" },
  { source: "seychelles-nation", outlet: "nation.sc", url: "https://www.nation.sc/rss/latest_news.xml" },
  { source: "mauritius-times", outlet: "mauritiustimes.com", url: "https://www.mauritiustimes.com/mt/feed/" },

  // ── Round 8: Gulf / MENA expanded ────────────────────────────────────────
  { source: "al-monitor-me", outlet: "al-monitor.com", url: "https://www.al-monitor.com/rss.xml" },
  { source: "middle-east-eye", outlet: "middleeasteye.net", url: "https://www.middleeasteye.net/rss" },
  { source: "iran-intl-en", outlet: "iranintl.com", url: "https://www.iranintl.com/en/rss" },
  { source: "kurdistan24-kd", outlet: "kurdistan24.net", url: "https://www.kurdistan24.net/en/rss.xml" },
  { source: "rudaw-kd", outlet: "rudaw.net", url: "https://www.rudaw.net/en/rss" },
  { source: "iraq-oil-report", outlet: "iraqoilreport.com", url: "https://www.iraqoilreport.com/feed/" },
  { source: "the-national-ae", outlet: "thenationalnews.com", url: "https://www.thenationalnews.com/rss" },
  { source: "gulf-news-ae", outlet: "gulfnews.com", url: "https://gulfnews.com/rss" },
  { source: "arabnews-sa", outlet: "arabnews.com", url: "https://www.arabnews.com/rss.xml" },
  { source: "al-qabas-kw", outlet: "alqabas.com", url: "https://alqabas.com/rss" },
  { source: "peninsula-qa", outlet: "thepeninsulaqatar.com", url: "https://www.thepeninsulaqatar.com/rss" },
  { source: "bahrain-mirror", outlet: "bahrainmirror.com", url: "https://www.bahrainmirror.com/feed/rss" },
  { source: "yemen-monitor", outlet: "yemenmonitor.com", url: "https://www.yemenmonitor.com/rss" },
  { source: "libya-herald", outlet: "libyaherald.com", url: "https://libyaherald.com/feed/" },
  { source: "middle-east-online", outlet: "middle-east-online.com", url: "https://middle-east-online.com/en/rss" },

  // ── Round 8: Latin America expanded ──────────────────────────────────────
  { source: "insight-crime", outlet: "insightcrime.org", url: "https://insightcrime.org/feed/" },
  { source: "latam-journalists", outlet: "latamjournalists.com", url: "https://latamjournalists.com/feed/" },
  { source: "connectas-lat", outlet: "connectas.org", url: "https://www.connectas.org/feed/" },
  { source: "armando-info-ve", outlet: "armando.info", url: "https://armando.info/feed/" },
  { source: "el-pais-es", outlet: "elpais.com", url: "https://feeds.elpais.com/mrss-s/pages/ep/site/elpais.com/portada" },
  { source: "el-mundo-es", outlet: "elmundo.es", url: "https://e00-elmundo.uecdn.es/elmundo/rss/portada.xml" },
  { source: "clarin-ar", outlet: "clarin.com", url: "https://www.clarin.com/rss/ultimas-noticias/" },
  { source: "la-nacion-ar", outlet: "lanacion.com.ar", url: "https://www.lanacion.com.ar/rss/index.xml" },
  { source: "infobae-ar", outlet: "infobae.com", url: "https://www.infobae.com/feeds/rss/spanish/" },
  { source: "folha-br", outlet: "folha.uol.com.br", url: "https://feeds.folha.uol.com.br/poder/rss091.xml" },
  { source: "uol-noticias-br", outlet: "noticias.uol.com.br", url: "https://noticias.uol.com.br/index.htm?action=rss" },
  { source: "agencia-brasil", outlet: "agenciabrasil.ebc.com.br", url: "https://agenciabrasil.ebc.com.br/rss/justicia/feed.xml" },
  { source: "el-tiempo-co", outlet: "eltiempo.com", url: "https://www.eltiempo.com/rss/politica.xml" },
  { source: "semana-co", outlet: "semana.com", url: "https://www.semana.com/rss.xml" },
  { source: "el-espectador-co", outlet: "elespectador.com", url: "https://www.elespectador.com/arc/outboundfeeds/rss/" },
  { source: "proceso-mx", outlet: "proceso.com.mx", url: "https://www.proceso.com.mx/rss/rss.php?cat=1" },
  { source: "animal-politico-mx", outlet: "animalpolitico.com", url: "https://www.animalpolitico.com/feed/" },
  { source: "expediente-mx", outlet: "expedientepolitico.mx", url: "https://expedientepolitico.mx/feed/" },
  { source: "el-comercio-pe", outlet: "elcomercio.pe", url: "https://elcomercio.pe/rss/ultimas-noticias" },
  { source: "la-republica-pe", outlet: "larepublica.pe", url: "https://larepublica.pe/rss/" },
  { source: "el-universo-ec", outlet: "eluniverso.com", url: "https://www.eluniverso.com/rss.xml" },
  { source: "el-comercio-ec", outlet: "elcomercio.com", url: "https://www.elcomercio.com/rss.xml" },
  { source: "la-prensa-pa", outlet: "prensa.com", url: "https://www.prensa.com/rss-prensa/" },
  { source: "el-faro-sv", outlet: "elfaro.net", url: "https://elfaro.net/rss.php" },
  { source: "confidencial-ni", outlet: "confidencial.digital", url: "https://confidencial.digital/feed/" },
  { source: "la-estrella-pa", outlet: "laestrella.com.pa", url: "https://www.laestrella.com.pa/rss.xml" },
  { source: "prensa-libre-gt", outlet: "prensalibre.com", url: "https://www.prensalibre.com/feed/" },
  { source: "la-tribuna-hn", outlet: "latribuna.hn", url: "https://www.latribuna.hn/feed/" },
  { source: "el-heraldo-hn", outlet: "elheraldo.hn", url: "https://www.elheraldo.hn/rss/" },
  { source: "listindiario-do", outlet: "listindiario.com", url: "https://listindiario.com/rss/todas-las-noticias.xml" },
  { source: "el-caribe-do", outlet: "elcaribe.com.do", url: "https://www.elcaribe.com.do/feed/" },
  { source: "elnuevoherald-cu", outlet: "elnuevoherald.com", url: "https://www.elnuevoherald.com/news/world/americas/cuba/rss" },
  { source: "14ymedio-cu", outlet: "14ymedio.com", url: "https://www.14ymedio.com/rss" },
  { source: "caribe-haiti", outlet: "haitilibre.com", url: "https://www.haitilibre.com/en/rss-5-haiti-news.xml" },
  { source: "le-nouvelliste-ht", outlet: "lenouvelliste.com", url: "https://lenouvelliste.com/rss.xml" },
  { source: "trinidad-express", outlet: "trinidadexpress.com", url: "https://trinidadexpress.com/feed/" },
  { source: "barbados-today", outlet: "barbadostoday.bb", url: "https://barbadostoday.bb/feed/" },
  { source: "stabroek-gy", outlet: "stabroeknews.com", url: "https://www.stabroeknews.com/feed/" },
  { source: "times-of-suriname", outlet: "timesofsuriname.com", url: "https://www.timesofsuriname.com/feed/" },

  // ── Round 8: Enforcement databases & transparency ─────────────────────────
  { source: "worldbank-fraud-sanctions", outlet: "worldbank.org", url: "https://www.worldbank.org/en/news/all/rss.xml" },
  { source: "un-security-council-rss", outlet: "un.org", url: "https://www.un.org/press/en/rss.xml" },
  { source: "interpol-notices-rss", outlet: "interpol.int", url: "https://www.interpol.int/en/rss.xml" },
  { source: "transparency-intl-rss", outlet: "transparency.org", url: "https://www.transparency.org/en/rss-feed" },
  { source: "global-witness-rss", outlet: "globalwitness.org", url: "https://www.globalwitness.org/en/rss/" },
  { source: "tax-justice-network", outlet: "taxjustice.net", url: "https://taxjustice.net/feed/" },
  { source: "financial-secrecy-fsi", outlet: "financialsecrecyindex.com", url: "https://fsi.taxjustice.net/feed/" },
  { source: "aml-intelligence-rss", outlet: "amlintelligence.com", url: "https://amlintelligence.com/feed/" },
  { source: "ft-financial-crime-rss", outlet: "ft.com", url: "https://www.ft.com/rss/home/uk" },
  { source: "wsj-crime", outlet: "wsj.com", url: "https://feeds.a.dj.com/rss/WSJcomUSBusiness.xml" },
  { source: "reuters-legal", outlet: "reuters.com/legal", url: "https://feeds.reuters.com/reuters/legalNews" },
  { source: "bloomberg-law-rss", outlet: "bloomberglaw.com", url: "https://news.bloomberglaw.com/rss/blaw/c4bdb2e0-2c88-4c41-8b47-4c86d6da72e5" },
  { source: "lawcom-aml", outlet: "law.com", url: "https://www.law.com/feed/" },
  { source: "moneylaunderingbulletin", outlet: "moneylaunderingbulletin.com", url: "https://www.moneylaunderingbulletin.com/feed/" },
  { source: "regtech-analyst", outlet: "regtechalyst.com", url: "https://regtechanalyst.com/feed/" },
  { source: "amlc-ph-rss", outlet: "amlc.gov.ph", url: "https://www.amlc.gov.ph/index.php?format=feed&type=rss" },
  { source: "fiu-ky", outlet: "fiu.ky.gov.ky", url: "https://www.fiu.ky.gov.ky/sitemap.xml" },
  { source: "fiu-bm-rss", outlet: "bma.bm", url: "https://www.bma.bm/rss/news.xml" },
  { source: "namlc-ng", outlet: "nfiu.gov.ng", url: "https://nfiu.gov.ng/index.php?format=feed&type=rss" },
  { source: "scpc-fr", outlet: "agence-francaise-anticorruption.gouv.fr", url: "https://www.agence-francaise-anticorruption.gouv.fr/rss.xml" },
  { source: "acam-es", outlet: "antifraucat.cat", url: "https://www.antifraucat.cat/en/feed" },
  { source: "greco-coe", outlet: "coe.int/greco", url: "https://www.coe.int/en/web/greco/news-and-events/rss" },
  { source: "olaf-eu", outlet: "ec.europa.eu/anti_fraud", url: "https://anti-fraud.ec.europa.eu/olaf-and-you/reporting-fraud/rss_en" },
  { source: "eppo-eu", outlet: "eppo.europa.eu", url: "https://www.eppo.europa.eu/en/rss.xml" },
  { source: "eurojust-rss", outlet: "eurojust.europa.eu", url: "https://www.eurojust.europa.eu/rss.xml" },
  { source: "cepol-eu", outlet: "cepol.europa.eu", url: "https://www.cepol.europa.eu/rss.xml" },
  { source: "emcdda-eu", outlet: "emcdda.europa.eu", url: "https://www.emcdda.europa.eu/rss-feeds/news_en" },

  // ── Round 8: Crypto / DeFi enforcement ───────────────────────────────────
  { source: "coinfirm-rss", outlet: "coinfirm.com", url: "https://www.coinfirm.com/blog/feed/" },
  { source: "chainalysis-blog", outlet: "chainalysis.com", url: "https://blog.chainalysis.com/feed/" },
  { source: "elliptic-blog", outlet: "elliptic.co", url: "https://www.elliptic.co/blog/rss.xml" },
  { source: "ciphertrace-blog", outlet: "ciphertrace.com", url: "https://ciphertrace.com/blog/feed/" },
  { source: "crystal-blockchain", outlet: "crystalblockchain.com", url: "https://crystalblockchain.com/blog/feed/" },
  { source: "coindesk-policy", outlet: "coindesk.com", url: "https://www.coindesk.com/arc/outboundfeeds/rss/?outputType=xml&category=policy" },
  { source: "cointelegraph-regulation", outlet: "cointelegraph.com", url: "https://cointelegraph.com/rss/category/regulation" },
  { source: "theblock-legal", outlet: "theblock.co", url: "https://www.theblock.co/rss.xml" },
  { source: "decrypt-legal", outlet: "decrypt.co", url: "https://decrypt.co/feed" },
  { source: "binance-blog-compliance", outlet: "binance.com", url: "https://www.binance.com/en/blog/feed" },
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
    // AbortSignal.timeout() actually cancels the underlying fetch when the
    // deadline fires — unlike Promise.race + setTimeout which left the fetch
    // running in the background, leaking sockets and Lambda CPU budget.
    const res = await fetch(feed.url, {
      headers: { accept: "application/rss+xml,application/atom+xml,application/xml,text/xml,*/*", "user-agent": "HawkeyeSterling/1.0 (compatible; adverse-media)" },
      redirect: "follow",
      signal: AbortSignal.timeout(FETCH_TIMEOUT_MS),
    });
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
