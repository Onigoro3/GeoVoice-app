import { createClient } from "@supabase/supabase-js";
import { GoogleGenerativeAI } from "@google/generative-ai";
import dotenv from "dotenv";

dotenv.config();

const SUPABASE_URL = process.env.VITE_SUPABASE_URL;
const SUPABASE_KEY = process.env.VITE_SUPABASE_KEY;
const GEMINI_API_KEY = process.env.VITE_GEMINI_API_KEY;

if (!SUPABASE_URL || !SUPABASE_KEY || !GEMINI_API_KEY) {
  console.error("❌ Error: .envの設定を確認してください");
  process.exit(1);
}

const supabase = createClient(SUPABASE_URL, SUPABASE_KEY);
const genAI = new GoogleGenerativeAI(GEMINI_API_KEY);
const model = genAI.getGenerativeModel({ model: "gemini-2.0-flash" });

async function main() {
  console.log("🌲 自然遺産データを生成中...");

  // 重複チェック用：既存のスポット名を取得
  const { data: existingSpots } = await supabase.from('spots').select('name');
  const existingNames = new Set(existingSpots.map(s => s.name));

  // 世界の地域リスト（網羅的に）
  const regions = [
    "North America", "South America", "Europe", "Africa", 
    "Southeast Asia", "East Asia", "Central Asia", "Middle East", "Oceania"
  ];

  for (const region of regions) {
    console.log(`\n🔍 ${region} の自然遺産を探しています...`);

    const prompt = `
      You are a nature guide. List 15 famous "Natural World Heritage Sites" (UNESCO) in ${region}.
      Focus on landscapes, mountains, oceans, forests, and animals.
      Strictly exclude cultural sites (temples, buildings).
      
      Output JSON format ONLY:
      [
        {
          "name": "Name (in English)",
          "name_ja": "Name (in Japanese)",
          "lat": 0.0,
          "lon": 0.0,
          "description_ja": "Japanese Description (digestible, interesting, 100 chars)",
          "description_en": "English Description",
          "country_ja": "Country Name in Japanese"
        }
      ]
    `;

    try {
      const result = await model.generateContent(prompt);
      const text = result.response.text().replace(/```json/g, "").replace(/```/g, "").trim();
      const newSpots = JSON.parse(text);

      let count = 0;
      for (const spot of newSpots) {
        // 名前重複チェック
        if (existingNames.has(spot.name) || existingNames.has(spot.name_ja)) continue;

        // DB追加（category: 'nature' を指定）
        await supabase.from('spots').insert({
          name: spot.name, // デフォルト英語
          name_ja: spot.name_ja,
          name_en: spot.name,
          lat: spot.lat,
          lon: spot.lon,
          description: spot.description_en,
          description_ja: spot.description_ja,
          description_en: spot.description_en,
          country_ja: spot.country_ja,
          category: 'nature' // ★ここで「自然」カテゴリーを設定！
        });
        
        process.stdout.write(`\r✅ 追加: ${spot.name_ja}      `);
        count++;
        existingNames.add(spot.name);
      }
      
      if (count === 0) process.stdout.write("  -> 新規なし");

    } catch (e) {
      console.error(`\nError in ${region}:`, e.message);
    }

    // API制限考慮の休憩
    await new Promise(r => setTimeout(r, 2000));
  }

  console.log("\n\n🎉 自然遺産の追加完了！");
  console.log("💡 続けて 'node update-images.js' を実行すると画像が入ります。");
}

main();