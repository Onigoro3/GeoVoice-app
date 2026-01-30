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

// API制限対策: 少しゆっくり回す
const INTERVAL_MS = 1000;

async function main() {
  console.log("🌲 全スポットの「自然 vs 歴史」判定を開始します...");

  let allSpots = [];
  let page = 0;
  const pageSize = 1000;
  let hasNext = true;

  // 1. 全データを取得
  while (hasNext) {
    const { data, error } = await supabase
      .from('spots')
      .select('id, name, description')
      .order('id')
      .range(page * pageSize, (page + 1) * pageSize - 1);

    if (error) break;
    if (data.length > 0) {
      allSpots = allSpots.concat(data);
      process.stdout.write(`\r📥 データ読み込み中... 現在 ${allSpots.length} 件`);
      page++;
      if (data.length < pageSize) hasNext = false;
    } else {
      hasNext = false;
    }
  }

  console.log(`\n📋 合計 ${allSpots.length} 件の判定を開始します`);

  // 2. AI判定 & 更新
  for (let i = 0; i < allSpots.length; i++) {
    const item = allSpots[i];

    // 判定プロンプト
    const prompt = `
      Classify this tourism spot into "nature" or "history".
      Name: "${item.name}"
      Description: "${item.description}"
      
      Rules:
      - "nature": Mountains, Lakes, Forests, Oceans, Islands, National Parks, Animals, Reefs.
      - "history": Temples, Castles, Ruins, Cities, Towers, Museums, Statues.
      
      Output ONLY one word: "nature" or "history".
    `;

    try {
      const result = await model.generateContent(prompt);
      const category = result.response.text().trim().toLowerCase().includes("nature") ? "nature" : "history";

      // DB更新
      await supabase
        .from('spots')
        .update({ category: category })
        .eq('id', item.id);

      // ログ表示
      const mark = category === 'nature' ? '🌲' : '🏛️';
      const percent = Math.round(((i + 1) / allSpots.length) * 100);
      process.stdout.write(`\r✅ [${i + 1}/${allSpots.length}] (${percent}%) ${mark} ${category.toUpperCase()} : ${item.name.substring(0, 15)}...      `);

      // 待機
      await new Promise(r => setTimeout(r, INTERVAL_MS));

    } catch (e) {
      console.log(`\n⚠️ Error at ${item.name}: ${e.message}`);
      if (e.message.includes("429")) {
        console.log("🛑 API制限。30秒待機...");
        await new Promise(r => setTimeout(r, 30000));
        i--;
      }
    }
  }

  console.log("\n🎉 全カテゴリー修正完了！");
}

main();