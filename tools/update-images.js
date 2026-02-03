import { createClient } from "@supabase/supabase-js";
import dotenv from "dotenv";
import fetch from "node-fetch";

dotenv.config();

const SUPABASE_URL = process.env.VITE_SUPABASE_URL;
const SUPABASE_KEY = process.env.VITE_SUPABASE_KEY;
const PIXABAY_KEY = process.env.VITE_PIXABAY_API_KEY;
const MAPBOX_TOKEN = process.env.VITE_MAPBOX_TOKEN;

if (!SUPABASE_URL || !SUPABASE_KEY) {
  process.exit(1);
}

const supabase = createClient(SUPABASE_URL, SUPABASE_KEY);

// ---------------------------------------------------------
// 1. Wikipedia (MediaWiki)
// ---------------------------------------------------------
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

// ---------------------------------------------------------
// 2. Pixabay
// ---------------------------------------------------------
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

// ---------------------------------------------------------
// 3. Mapbox Static Images
// ---------------------------------------------------------
function getMapboxStaticImage(lat, lon) {
  if (!MAPBOX_TOKEN) return null;
  return `https://api.mapbox.com/styles/v1/mapbox/satellite-v9/static/${lon},${lat},15,0,0/600x400@2x?access_token=${MAPBOX_TOKEN}`;
}

async function main() {
  console.log("🚀 高速化モード: 画像がないスポットのみ処理します");
  console.log("優先順: 1.Wiki(En) -> 2.Wiki(Ja) -> 3.Pixabay -> 4.Mapbox衛星写真");

  const BATCH_SIZE = 50; // 一度に処理する数（多すぎるとAPI制限にかかりやすいので50程度に）
  let hasNext = true;
  let totalProcessed = 0;

  while (hasNext) {
    // ★重要: image_url が null のものだけを取得
    // 処理が終わって画像が入ると、このリストからは自動的に消えるので
    // 常に「上から50件」を取り続ければOK (range(0, BATCH_SIZE - 1))
    const { data: spots, error } = await supabase
      .from('spots')
      .select('*')
      .is('image_url', null) // ← これが高速化のキモです！
      .range(0, BATCH_SIZE - 1);

    if (error) {
      console.error("Fetch error:", error);
      break;
    }

    if (!spots || spots.length === 0) {
      console.log("\n✨ 全てのスポットに画像が設定されました！");
      hasNext = false;
      break;
    }

    console.log(`\n📥 未取得のスポット ${spots.length} 件を読み込みました... (Total: ${totalProcessed}件完了)`);

    for (let i = 0; i < spots.length; i++) {
      const spot = spots[i];
      const nameEn = spot.name_en || spot.name.split('#')[0];
      const nameJa = spot.name_ja || spot.name.split('#')[0];

      let imageUrl = null;
      let source = "";

      // 1. Wikipedia (英語)
      if (!imageUrl) {
        imageUrl = await fetchFromWikipedia(nameEn);
        if (imageUrl) source = "Wiki(En)";
      }
      // 2. Wikipedia (日本語)
      if (!imageUrl) {
        imageUrl = await fetchFromWikipedia(nameJa);
        if (imageUrl) source = "Wiki(Ja)";
      }
      // 3. Pixabay
      if (!imageUrl) {
        imageUrl = await fetchFromPixabay(nameEn);
        if (imageUrl) source = "Pixabay";
      }
      // 4. Mapbox Satellite
      if (!imageUrl) {
        imageUrl = getMapboxStaticImage(spot.lat, spot.lon);
        source = "Mapbox(Sat)";
      }

      if (imageUrl) {
        // 画像を保存
        await supabase.from('spots').update({ image_url: imageUrl }).eq('id', spot.id);
        process.stdout.write(`\r✅ [${i + 1}/${spots.length}] ${spot.name.substring(0, 10)}... -> ${source}    `);
        totalProcessed++;
      }

      // APIへの負荷軽減
      await new Promise(r => setTimeout(r, 200)); 
    }
  }
}

main();