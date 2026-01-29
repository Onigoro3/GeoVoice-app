import { createClient } from "@supabase/supabase-js";
import dotenv from "dotenv";
import fetch from "node-fetch";

dotenv.config();

const SUPABASE_URL = process.env.VITE_SUPABASE_URL;
const SUPABASE_KEY = process.env.VITE_SUPABASE_KEY;
const MAPBOX_TOKEN = process.env.VITE_MAPBOX_TOKEN;

if (!SUPABASE_URL || !SUPABASE_KEY || !MAPBOX_TOKEN) {
  console.error("❌ Error: .envの設定を確認してください");
  process.exit(1);
}

const supabase = createClient(SUPABASE_URL, SUPABASE_KEY);

async function main() {
  console.log("🌍 スポット情報を取得中...");
  
  // 国名がまだないデータを取得
  const { data: spots, error } = await supabase
    .from('spots')
    .select('id, lat, lon, name')
    .is('country_ja', null); // 日本語国名がないものを対象

  if (error) {
    console.error("Error fetching spots:", error);
    return;
  }

  console.log(`📋 ${spots.length} 件の国判定を開始します...`);

  // Mapbox APIのレート制限に配慮して少しずつ処理
  for (let i = 0; i < spots.length; i++) {
    const spot = spots[i];
    
    try {
      // Mapbox APIで座標から国を取得 (言語: 日本語)
      const url = `https://api.mapbox.com/geocoding/v5/mapbox.places/${spot.lon},${spot.lat}.json?types=country&language=ja&access_token=${MAPBOX_TOKEN}`;
      const res = await fetch(url);
      const json = await res.json();

      if (json.features && json.features.length > 0) {
        const countryName = json.features[0].text; // 例: "日本"
        
        // DB更新
        await supabase
          .from('spots')
          .update({ 
            country: countryName,    // 検索用などに
            country_ja: countryName  // 表示用
          })
          .eq('id', spot.id);
        
        process.stdout.write(`\r✅ [${i + 1}/${spots.length}] ${spot.name.split('#')[0]} -> ${countryName}       `);
      } else {
         // 海の上などで国がない場合
         await supabase.from('spots').update({ country_ja: 'その他' }).eq('id', spot.id);
         process.stdout.write(`\r⚠️ [${i + 1}/${spots.length}] ${spot.name.split('#')[0]} -> 国不明       `);
      }

    } catch (e) {
      console.error(`\n❌ Error ID ${spot.id}:`, e.message);
    }

    // API制限回避のため少し待機 (重要)
    await new Promise(r => setTimeout(r, 100)); 
  }

  console.log("\n🎉 全スポットの国判定が完了しました！");
}

main();