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

// ★攻略対象の国リスト（ここを増やせば全世界いけます）
const TARGET_COUNTRIES = [
  // アジア
  "Japan", "China", "South Korea", "Thailand", "Vietnam", "India", "Indonesia", "Singapore", "Malaysia",
  // ヨーロッパ
  "France", "Italy", "Spain", "United Kingdom", "Germany", "Greece", "Switzerland", "Netherlands", "Turkey",
  // 北米・南米
  "United States", "Canada", "Mexico", "Brazil", "Argentina", "Peru",
  // オセアニア・その他
  "Australia", "New Zealand", "Egypt", "South Africa", "United Arab Emirates"
];

// 1エリアあたりに取得するスポット数
const SPOTS_PER_REGION = 12; 

async function getRegions(country) {
  console.log(`\n🗺️  ${country} の主要な観光エリアを分析中...`);
  try {
    const prompt = `
      List 10 to 15 distinct major tourist regions, cities, or prefectures in "${country}" to cover the WHOLE country evenly.
      Output JSON list of strings only.
      Example: ["Region A", "City B", "Province C"]
    `;
    const result = await model.generateContent(prompt);
    const text = result.response.text().replace(/```json/g, "").replace(/```/g, "").trim();
    return JSON.parse(text);
  } catch (e) {
    console.error(`❌ 地域取得エラー (${country}):`, e.message);
    return [];
  }
}

async function getSpotsForRegion(country, region) {
  console.log(`  🔍 ${region} (${country}) の名所を収集中...`);
  try {
    const prompt = `
      List ${SPOTS_PER_REGION} popular tourist landmarks in "${region}, ${country}".
      
      Rules:
      1. Specific tourist spots only (Buildings, Temples, Parks, Museums, Markets).
      2. NO broad areas like "Downtown". Point locations only.
      3. Category must be "landmark".
      4. Coordinates are rough estimates.
      
      Output JSON:
      [
        {
          "name": "Name in English",
          "name_ja": "日本語名",
          "description_ja": "日本語の魅力的な解説(80-100文字)",
          "category": "landmark",
          "country": "${country}",
          "lat": 0.0,
          "lon": 0.0
        }
      ]
    `;
    
    const result = await model.generateContent(prompt);
    const text = result.response.text().replace(/```json/g, "").replace(/```/g, "").trim();
    return JSON.parse(text);
  } catch (e) {
    console.error(`  ⚠️ スポット取得エラー (${region}):`, e.message);
    return [];
  }
}

async function main() {
  console.log("🚀 世界観光名所 100本ノック・プロジェクト始動...\n");

  for (const country of TARGET_COUNTRIES) {
    console.log(`\n=========================================`);
    console.log(`🏁 Target Country: ${country}`);
    console.log(`=========================================`);

    // 1. その国のエリア・都市をリストアップさせる
    const regions = await getRegions(country);
    console.log(`  📍 ターゲットエリア: ${regions.join(", ")}`);

    // 2. エリアごとにスポットを取得して保存
    let countryTotal = 0;
    
    for (const region of regions) {
      const spots = await getSpotsForRegion(country, region);
      
      for (const spot of spots) {
        // 重複チェック
        const { data: existing } = await supabase.from('spots').select('id').eq('name', spot.name).maybeSingle();
        
        if (!existing) {
          // 座標が0.0の場合は保存しない（または別途補正する）ガードを入れてもよいが、今回はそのまま
          const { error } = await supabase.from('spots').insert(spot);
          if (!error) {
            process.stdout.write("•"); // 進捗ドット
            countryTotal++;
          }
        }
      }
      // API制限対策: エリアごとに少し休憩
      await new Promise(r => setTimeout(r, 2000)); 
    }
    console.log(`\n  ✨ ${country}: 合計 ${countryTotal} 件のスポットを追加しました！`);
  }

  console.log("\n🎉 全国のデータ収集が完了しました！");
  console.log("👉 次に 'npm run fix:all' を実行して、画像取得と翻訳の仕上げを行ってください。");
}

main();