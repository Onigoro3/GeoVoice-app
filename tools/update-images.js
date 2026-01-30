import { createClient } from "@supabase/supabase-js";
import dotenv from "dotenv";
import fetch from "node-fetch";

dotenv.config();

const SUPABASE_URL = process.env.VITE_SUPABASE_URL;
const SUPABASE_KEY = process.env.VITE_SUPABASE_KEY;
const PIXABAY_KEY = process.env.VITE_PIXABAY_API_KEY;

if (!SUPABASE_URL || !SUPABASE_KEY) {
  process.exit(1);
}

const supabase = createClient(SUPABASE_URL, SUPABASE_KEY);

// Wikipediaから取得
async function fetchFromWikipedia(query) {
  try {
    const url = `https://en.wikipedia.org/w/api.php?action=query&titles=${encodeURIComponent(query)}&prop=pageimages&format=json&pithumbsize=600&origin=*`;
    const res = await fetch(url);
    const json = await res.json();
    const pages = json.query?.pages;
    if (pages) {
      const pageId = Object.keys(pages)[0];
      if (pageId !== "-1" && pages[pageId].thumbnail) {
        return pages[pageId].thumbnail.source;
      }
    }
  } catch (e) { return null; }
  return null;
}

// Pixabayから取得
async function fetchFromPixabay(query) {
  if (!PIXABAY_KEY) return null;
  try {
    const url = `https://pixabay.com/api/?key=${PIXABAY_KEY}&q=${encodeURIComponent(query)}&image_type=photo&category=travel&per_page=3`;
    const res = await fetch(url);
    const json = await res.json();
    if (json.hits && json.hits.length > 0) {
      return json.hits[0].webformatURL;
    }
  } catch (e) { return null; }
  return null;
}

async function main() {
  console.log("🔄 全データを取得中...");

  let allSpots = [];
  let page = 0;
  const pageSize = 1000;
  let hasNext = true;

  // ★修正: 1000件ずつループして全件吸い出す
  while (hasNext) {
    const { data, error } = await supabase
      .from('spots')
      .select('*')
      .order('id')
      .range(page * pageSize, (page + 1) * pageSize - 1);

    if (error) {
      console.error("Fetch error:", error);
      break;
    }

    if (data.length > 0) {
      allSpots = allSpots.concat(data);
      process.stdout.write(`\r📥 データ読み込み中... 現在 ${allSpots.length} 件`);
      page++;
      // もし取得数がpageSize未満なら、それが最後のページ
      if (data.length < pageSize) hasNext = false;
    } else {
      hasNext = false;
    }
  }

  console.log(`\n📋 合計 ${allSpots.length} 件の画像チェックを開始します`);

  // ここから画像収集処理
  for (let i = 0; i < allSpots.length; i++) {
    const spot = allSpots[i];
    
    // 画像が既にある場合はスキップしたいならコメントアウトを外す
    // if (spot.image_url) continue; 

    const searchNameEn = (spot.name_en || spot.name).split('#')[0].trim();
    const searchNameJa = (spot.name_ja || spot.name).split('#')[0].trim();

    let imageUrl = null;
    let source = "";

    // 1. Wiki (En)
    imageUrl = await fetchFromWikipedia(searchNameEn);
    if (imageUrl) source = "Wiki";

    // 2. Pixabay (En)
    if (!imageUrl) {
      imageUrl = await fetchFromPixabay(searchNameEn);
      if (imageUrl) source = "Pixabay(En)";
    }

    // 3. Pixabay (Ja)
    if (!imageUrl) {
      imageUrl = await fetchFromPixabay(searchNameJa);
      if (imageUrl) source = "Pixabay(Ja)";
    }

    if (imageUrl) {
      await supabase.from('spots').update({ image_url: imageUrl }).eq('id', spot.id);
      process.stdout.write(`\r✅ [${i + 1}/${allSpots.length}] ${spot.name.substring(0, 10)}... -> GET! (${source})     `);
    } else {
      process.stdout.write(`\r⚠️ [${i + 1}/${allSpots.length}] ${spot.name.substring(0, 10)}... -> なし    `);
    }

    await new Promise(r => setTimeout(r, 200)); 
  }
  console.log("\n🎉 全画像収集完了！");
}

main();