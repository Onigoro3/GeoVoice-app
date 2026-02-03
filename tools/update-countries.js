import { createClient } from "@supabase/supabase-js";
import dotenv from "dotenv";
import fetch from "node-fetch";

dotenv.config();

const SUPABASE_URL = process.env.VITE_SUPABASE_URL;
const SUPABASE_KEY = process.env.VITE_SUPABASE_KEY;
const MAPBOX_TOKEN = process.env.VITE_MAPBOX_TOKEN;
const PIXABAY_KEY = process.env.VITE_PIXABAY_API_KEY;

if (!SUPABASE_URL || !SUPABASE_KEY || !MAPBOX_TOKEN) {
  console.error("❌ Error: .envの設定を確認してください (MAPBOX_TOKEN, PIXABAY_API_KEY等)");
  process.exit(1);
}

const supabase = createClient(SUPABASE_URL, SUPABASE_KEY);

// ==========================================
// 🛠️ 画像取得用関数群 (Wiki -> Pixabay -> Mapbox)
// ==========================================

async function fetchFromWikipedia(query) {
  if (!query) return null;
  try {
    const searchUrl = `https://en.wikipedia.org/w/api.php?action=query&list=search&srsearch=${encodeURIComponent(query)}&format=json&origin=*`;
    const searchRes = await fetch(searchUrl);
    const searchJson = await searchRes.json();
    
    if (!searchJson.query?.search?.length) return null;
    
    const title = searchJson.query.search[0].title;
    const imgUrl = `https://en.wikipedia.org/w/api.php?action=query&titles=${encodeURIComponent(title)}&prop=pageimages&format=json&pithumbsize=600&origin=*`;
    
    const imgRes = await fetch(imgUrl);
    const imgJson = await imgRes.json();
    const pages = imgJson.query?.pages;
    
    if (pages) {
      const pageId = Object.keys(pages)[0];
      if (pageId !== "-1" && pages[pageId].thumbnail) {
        return pages[pageId].thumbnail.source;
      }
    }
  } catch (e) { return null; }
  return null;
}

async function fetchFromPixabay(query) {
  if (!PIXABAY_KEY || !query) return null;
  try {
    const url = `https://pixabay.com/api/?key=${PIXABAY_KEY}&q=${encodeURIComponent(query)}&image_type=photo&category=travel&per_page=3&safesearch=true`;
    const res = await fetch(url);
    const json = await res.json();
    if (json.hits && json.hits.length > 0) {
      return json.hits[0].webformatURL;
    }
  } catch (e) { return null; }
  return null;
}

function getMapboxStaticImage(lat, lon) {
  if (!MAPBOX_TOKEN) return null;
  return `https://api.mapbox.com/styles/v1/mapbox/satellite-v9/static/${lon},${lat},15,0,0/600x400@2x?access_token=${MAPBOX_TOKEN}`;
}

// ==========================================
// 🛠️ 国名取得用関数 (Mapbox Geocoding)
// ==========================================

async function fetchCountryFromMapbox(lat, lon) {
  try {
    const url = `https://api.mapbox.com/geocoding/v5/mapbox.places/${lon},${lat}.json?types=country&language=ja&access_token=${MAPBOX_TOKEN}`;
    const res = await fetch(url);
    const json = await res.json();
    if (json.features && json.features.length > 0) {
      return json.features[0].text; // "日本" などの国名
    }
  } catch (e) { return null; }
  return null;
}

// ==========================================
// 🚀 メイン処理
// ==========================================

async function main() {
  console.log("🌍 データ補完プロセスを開始します...");
  console.log("条件: 「国名がない」または「画像がない」スポットのみを処理します。");

  const BATCH_SIZE = 50;
  let hasNext = true;
  let totalProcessed = 0;

  while (hasNext) {
    // ★重要: 国名(country_ja)がない、または 画像(image_url)がないデータを取得
    // これにより、すでに両方持っているデータは自動的にスキップされます
    const { data: spots, error } = await supabase
      .from('spots')
      .select('*')
      .or('country_ja.is.null,image_url.is.null')
      .range(0, BATCH_SIZE - 1);

    if (error) {
      console.error("Fetch Error:", error.message);
      break;
    }

    if (!spots || spots.length === 0) {
      console.log("\n✨ 全てのデータの補完が完了しました！ (対象データなし)");
      hasNext = false;
      break;
    }

    console.log(`\n📥 未完了データ ${spots.length} 件を読み込みました... (Total: ${totalProcessed}件完了)`);

    for (let i = 0; i < spots.length; i++) {
      const spot = spots[i];
      const updates = {};
      let logMsg = `[${i + 1}/${spots.length}] ${spot.name.substring(0, 10)}...`;

      // -------------------------------------------------
      // 1. 国名の補完
      // -------------------------------------------------
      if (!spot.country_ja) {
        const country = await fetchCountryFromMapbox(spot.lat, spot.lon);
        if (country) {
          updates.country_ja = country;
          updates.country = country; // 念のため両方
          logMsg += ` 🏳️ ${country}`;
        } else {
          updates.country_ja = "その他";
          logMsg += ` 🏳️ 不明`;
        }
      }

      // -------------------------------------------------
      // 2. 画像の補完 (Wiki -> Pixabay -> Mapbox)
      // -------------------------------------------------
      if (!spot.image_url) {
        const nameEn = (spot.name_en || spot.name).split('#')[0].trim();
        const nameJa = (spot.name_ja || spot.name).split('#')[0].trim();
        let imageUrl = null;
        let source = "";

        // Wiki (En)
        imageUrl = await fetchFromWikipedia(nameEn);
        if (imageUrl) source = "Wiki(En)";

        // Wiki (Ja)
        if (!imageUrl) {
          imageUrl = await fetchFromWikipedia(nameJa);
          if (imageUrl) source = "Wiki(Ja)";
        }

        // Pixabay
        if (!imageUrl) {
          imageUrl = await fetchFromPixabay(nameEn);
          if (imageUrl) source = "Pixabay";
        }

        // Mapbox Satellite (最終手段)
        if (!imageUrl) {
          imageUrl = getMapboxStaticImage(spot.lat, spot.lon);
          source = "Mapbox(Sat)";
        }

        if (imageUrl) {
          updates.image_url = imageUrl;
          logMsg += ` 🖼️ GET(${source})`;
        }
      }

      // -------------------------------------------------
      // 保存処理
      // -------------------------------------------------
      if (Object.keys(updates).length > 0) {
        await supabase.from('spots').update(updates).eq('id', spot.id);
        process.stdout.write(`\r✅ ${logMsg}      `);
        totalProcessed++;
      } else {
        // 更新なし（APIエラー等）
        process.stdout.write(`\rKZ ${logMsg} (No updates)`);
      }

      // APIレート制限への配慮
      await new Promise(r => setTimeout(r, 200)); 
    }
  }
}

main();