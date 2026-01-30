import { createClient } from "@supabase/supabase-js";
import { GoogleGenerativeAI } from "@google/generative-ai";
import dotenv from "dotenv";

dotenv.config();

const SUPABASE_URL = process.env.VITE_SUPABASE_URL;
const SUPABASE_KEY = process.env.VITE_SUPABASE_KEY;
const GEMINI_API_KEY = process.env.VITE_GEMINI_API_KEY;

if (!SUPABASE_URL || !SUPABASE_KEY || !GEMINI_API_KEY) {
  console.error("❌ .envの設定を確認してください");
  process.exit(1);
}

const supabase = createClient(SUPABASE_URL, SUPABASE_KEY);
const genAI = new GoogleGenerativeAI(GEMINI_API_KEY);
const model = genAI.getGenerativeModel({ model: "gemini-2.0-flash" });

// ターゲットとする国や地域
const TARGET_REGIONS = [
  "Japan", "USA", "France", "UK", "Italy", "China", "Australia"
];

async function generateLandmarks(region) {
  console.log(`\n🔍 ${region} の観光名所を生成中...`);

  try {
    const prompt = `
      List 5 to 8 "Must-Visit Popular Tourist Landmarks" in ${region}.
      
      Rules:
      1. Exclude sites that are purely strictly "Nature" (like mountains), focus on buildings, districts, or monuments.
      2. Include famous spots like "Osaka Castle", "Tokyo Tower", "Times Square", "Eiffel Tower".
      3. It fits the category "landmark".
      
      Output JSON format:
      [
        {
          "name": "Name in English",
          "name_ja": "日本語名",
          "description_ja": "魅力を伝える日本語の解説(100文字程度)",
          "description_en": "Description in English",
          "lat": 0.0,
          "lon": 0.0,
          "category": "landmark",
          "country": "${region}"
        }
      ]
    `;

    const result = await model.generateContent(prompt);
    const text = result.response.text().replace(/```json/g, "").replace(/```/g, "").trim();
    const spots = JSON.parse(text);

    console.log(`✅ ${spots.length} 件取得。保存します...`);

    for (const spot of spots) {
      // 重複チェック（名前で簡易判定）
      const { data: existing } = await supabase.from('spots').select('id').eq('name_en', spot.name).maybeSingle();
      
      if (!existing) {
        const { error } = await supabase.from('spots').insert(spot);
        if (error) console.error("保存エラー:", error.message);
        else console.log(`  ➕ 追加: ${spot.name_ja}`);
      } else {
        console.log(`  DATA 既存: ${spot.name_ja}`);
      }
    }

  } catch (e) {
    console.error(`エラー (${region}):`, e.message);
  }
}

async function main() {
  console.log("🚀 観光名所データの生成を開始します...");
  
  for (const region of TARGET_REGIONS) {
    await generateLandmarks(region);
    // API制限考慮の待機
    await new Promise(r => setTimeout(r, 2000));
  }
  
  console.log("\n🎉 完了しました！ 'npm run fix:all' を実行して画像を取得してください。");
}

main();