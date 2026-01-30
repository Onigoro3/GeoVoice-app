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

// 日本を地域ブロックに分割して大量取得を狙う
const TARGET_AREAS = [
  "Hokkaido, Japan",
  "Tohoku Region, Japan", 
  "Tokyo, Japan",
  "Kanagawa (Yokohama/Kamakura), Japan",
  "Kanto Region (excluding Tokyo/Kanagawa), Japan",
  "Chubu Region (Nagoya/Kanazawa/Mt.Fuji areas), Japan",
  "Kyoto, Japan",
  "Osaka, Japan",
  "Kansai Region (Nara/Kobe/Wakayama), Japan",
  "Chugoku Region (Hiroshima/Okayama), Japan",
  "Shikoku Region, Japan",
  "Kyushu Region (Fukuoka/Nagasaki/Beppu), Japan",
  "Okinawa, Japan"
];

async function generateLandmarks(area) {
  console.log(`\n🔍 ${area} の観光名所を探索中...`);

  try {
    const prompt = `
      List 10 to 15 popular tourist landmarks in "${area}".
      
      Rules:
      1. Focus on specific tourist spots (Buildings, Towers, Temples, Districts, Parks).
      2. Do NOT include broad regions, only specific point locations.
      3. Exclude World Heritage Sites if possible (focus on local popular spots like "Dotonbori", "Tokyo Tower", "Scramble Crossing").
      4. Category must be "landmark".
      
      Output JSON format:
      [
        {
          "name": "Name in English",
          "name_ja": "日本語名",
          "description_ja": "観光客向けの魅力的な解説(100文字程度)",
          "category": "landmark",
          "country": "Japan"
        }
      ]
    `;

    const result = await model.generateContent(prompt);
    const text = result.response.text().replace(/```json/g, "").replace(/```/g, "").trim();
    const spots = JSON.parse(text);

    console.log(`✅ ${spots.length} 件 ヒットしました。`);

    let count = 0;
    for (const spot of spots) {
      // 名前で重複チェック
      const { data: existing } = await supabase.from('spots').select('id').eq('name_ja', spot.name_ja).maybeSingle();
      
      if (!existing) {
        // 座標はあとで "fix:all" で自動補完されるため、ここでは省略可だが
        // Geminiが座標を返さないことも多いため、別途ジオコーディングが必要になる可能性があります。
        // 今回はとりあえずデータを入れます。座標がないと地図に出ないので、
        // 本来は座標もAIに頼むのがベストです。プロンプトを修正して座標も要求します。
        
        // (プロンプト修正版のロジックで再取得する形にします)
        const latLonPrompt = `Get coordinates for "${spot.name} ${area}". JSON: {"lat": 0.0, "lon": 0.0}`;
        try {
            const locResult = await model.generateContent(latLonPrompt);
            const locText = locResult.response.text().replace(/```json/g, "").replace(/```/g, "").trim();
            const loc = JSON.parse(locText);
            
            spot.lat = loc.lat;
            spot.lon = loc.lon;

            const { error } = await supabase.from('spots').insert(spot);
            if (error) console.error("  ❌ 保存エラー:", error.message);
            else { 
                console.log(`  ➕ 追加: ${spot.name_ja}`);
                count++;
            }
        } catch(e) {
            console.log(`  ⚠️ 座標取得失敗: ${spot.name}`);
        }
      } else {
        // console.log(`  Skip: ${spot.name_ja}`);
      }
      // API制限回避の待機
      await new Promise(r => setTimeout(r, 1000));
    }
    console.log(`  => ${count} 件 新規保存しました。`);

  } catch (e) {
    console.error(`エラー (${area}):`, e.message);
  }
}

async function main() {
  console.log("🚀 日本全国 観光名所プロジェクト始動...");
  
  for (const area of TARGET_AREAS) {
    await generateLandmarks(area);
    await new Promise(r => setTimeout(r, 2000));
  }
  
  console.log("\n🎉 全地域のスキャン完了！ 'npm run fix:all' を実行して画像を収集してください。");
}

main();