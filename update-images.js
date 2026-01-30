import { createClient } from "@supabase/supabase-js";
import dotenv from "dotenv";
import fetch from "node-fetch";

dotenv.config();

const SUPABASE_URL = process.env.VITE_SUPABASE_URL;
const SUPABASE_KEY = process.env.VITE_SUPABASE_KEY;

if (!SUPABASE_URL || !SUPABASE_KEY) {
  console.error("❌ Error: .envの設定を確認してください");
  process.exit(1);
}

const supabase = createClient(SUPABASE_URL, SUPABASE_KEY);

async function main() {
  console.log("🖼️  画像のないスポットを探しています...");
  
  // 画像がないデータを取得
  const { data: spots, error } = await supabase
    .from('spots')
    .select('id, name, name_en')
    .is('image_url', null); // まだ画像がないやつだけ

  if (error) {
    console.error("Error fetching spots:", error);
    return;
  }

  console.log(`📋 ${spots.length} 件の画像を収集開始します...`);

  for (let i = 0; i < spots.length; i++) {
    const spot = spots[i];
    
    // 検索ワード: 英語名があれば英語で、なければ日本語名からタグ(#)を除去したもの
    // (Wikipediaは英語の方が画像ヒット率が高い傾向にあります)
    const searchName = spot.name_en 
      ? spot.name_en.split('#')[0].trim() 
      : spot.name.split('#')[0].trim();

    try {
      // Wikipedia API (英語) を叩く
      const url = `https://en.wikipedia.org/w/api.php?action=query&titles=${encodeURIComponent(searchName)}&prop=pageimages&format=json&pithumbsize=600`;
      const res = await fetch(url);
      const json = await res.json();
      
      const pages = json.query?.pages;
      let imageUrl = null;

      if (pages) {
        const pageId = Object.keys(pages)[0];
        if (pageId !== "-1" && pages[pageId].thumbnail) {
          imageUrl = pages[pageId].thumbnail.source;
        }
      }

      if (imageUrl) {
        // DB更新
        await supabase
          .from('spots')
          .update({ image_url: imageUrl })
          .eq('id', spot.id);
        
        process.stdout.write(`\r✅ [${i + 1}/${spots.length}] ${spot.name.substring(0, 10)}... -> 画像GET!      `);
      } else {
        process.stdout.write(`\r⚠️ [${i + 1}/${spots.length}] ${spot.name.substring(0, 10)}... -> 画像なし      `);
      }

    } catch (e) {
      // エラーは無視して次へ
    }

    // APIに優しく待機
    await new Promise(r => setTimeout(r, 100)); 
  }

  console.log("\n🎉 画像収集完了！");
}

main();