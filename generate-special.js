import { createClient } from "@supabase/supabase-js";
import { GoogleGenerativeAI } from "@google/generative-ai";
import dotenv from "dotenv";

dotenv.config();

const SUPABASE_URL = process.env.VITE_SUPABASE_URL;
const SUPABASE_KEY = process.env.VITE_SUPABASE_KEY;
const GEMINI_API_KEY = process.env.VITE_GEMINI_API_KEY;

if (!SUPABASE_URL || !SUPABASE_KEY || !GEMINI_API_KEY) {
  process.exit(1);
}

const supabase = createClient(SUPABASE_URL, SUPABASE_KEY);
const genAI = new GoogleGenerativeAI(GEMINI_API_KEY);
const model = genAI.getGenerativeModel({ model: "gemini-2.0-flash" });

// 生成したいカテゴリと、AIへの命令
const TARGETS = [
  {
    id: "modern",
    label: "Modern Landmarks",
    prompt: "List 10 famous 'Modern Landmarks' (Iconic structures built after 1850). Examples: Eiffel Tower, Statue of Liberty, Sydney Opera House, Burj Khalifa. Exclude generic office skyscrapers."
  },
  {
    id: "science",
    label: "Space & Science",
    prompt: "List 10 famous 'Space & Science facilities'. Examples: Kennedy Space Center, CERN, Mauna Kea Observatories, Baikonur Cosmodrome."
  },
  {
    id: "art",
    label: "Museums & Art",
    prompt: "List 10 famous 'Art Museums'. Examples: Louvre Museum, The British Museum, Metropolitan Museum of Art, Vatican Museums."
  }
];

// 地域リスト（偏りを防ぐため）
const REGIONS = ["Europe", "North America", "Asia", "South America", "Oceania", "Middle East"];

async function main() {
  console.log("✨ 新カテゴリーのスポットを生成中...");

  // 重複チェック用
  const { data: existingSpots } = await supabase.from('spots').select('name');
  const existingNames = new Set(existingSpots.map(s => s.name));

  for (const target of TARGETS) {
    console.log(`\n📂 カテゴリ: ${target.label} (${target.id}) を収集中...`);

    for (const region of REGIONS) {
      const prompt = `
        You are a travel guide. ${target.prompt}
        Location: ${region}.
        
        Output JSON format ONLY:
        [
          {
            "name": "Name (English)",
            "name_ja": "Name (Japanese)",
            "lat": 0.0,
            "lon": 0.0,
            "description_en": "Description (English)",
            "description_ja": "Description (Japanese, 100 chars)",
            "country_ja": "Country Name (Japanese)"
          }
        ]
      `;

      try {
        const result = await model.generateContent(prompt);
        const text = result.response.text().replace(/```json/g, "").replace(/```/g, "").trim();
        const newSpots = JSON.parse(text);

        let count = 0;
        for (const spot of newSpots) {
          if (existingNames.has(spot.name) || existingNames.has(spot.name_ja)) continue;

          await supabase.from('spots').insert({
            name: spot.name,
            name_ja: spot.name_ja,
            name_en: spot.name,
            lat: spot.lat,
            lon: spot.lon,
            description: spot.description_en,
            description_ja: spot.description_ja,
            description_en: spot.description_en,
            country_ja: spot.country_ja,
            category: target.id // ★ここで 'modern', 'science', 'art' を保存
          });
          
          process.stdout.write(`\r✅ 追加 [${target.id}]: ${spot.name_ja}      `);
          count++;
          existingNames.add(spot.name);
        }
        if (count === 0) process.stdout.write(`\r⚠️ [${region}] 新規なし      `);

      } catch (e) {
        // エラーは無視して次へ
      }
      await new Promise(r => setTimeout(r, 1500));
    }
  }

  console.log("\n\n🎉 全追加完了！");
  console.log("💡 'node update-images.js' を実行して画像を取得してください。");
}

main();