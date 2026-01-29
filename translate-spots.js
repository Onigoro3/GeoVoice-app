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

// ★変更: ここを確実に "gemini-2.0-flash" にしてください
// (Liteでも 2.5でもなく、無印の 2.0 Flash です)
const model = genAI.getGenerativeModel({ model: "gemini-2.5-flash" });

// 1件ずつ、5秒間隔で進む（安全第一）
const BATCH_SIZE = 1; 
const INTERVAL_MS = 5000; 

async function main() {
  console.log("🔍 翻訳対象をスキャン中...");

  // 全データを取得
  const { data: spots, error } = await supabase.from('spots').select('*');
  if (error) {
    console.error("Error fetching spots:", error);
    return;
  }

  // まだ英語が入っていないデータを抽出
  const targetSpots = spots.filter(s => !s.description_en || s.description_en === "World Heritage Site");

  console.log(`📋 残り ${targetSpots.length} 件の翻訳を行います。`);
  console.log("🚀 モデル: gemini-2.0-flash で開始します...");
  console.log("🐢 止まらないようにゆっくり進みます (5秒間隔)...");

  for (let i = 0; i < targetSpots.length; i++) {
    const item = targetSpots[i];

    const prompt = `
      You are a translator. Translate this location data into English, Chinese (Simplified), Spanish, and French.
      
      Input:
      ID: ${item.id}
      Name: ${item.name.split('#')[0].trim()}
      Description: ${item.description}

      Output JSON format ONLY:
      [{"id": ${item.id}, "name_en": "...", "desc_en": "...", "name_zh": "...", "desc_zh": "...", "name_es": "...", "desc_es": "...", "name_fr": "...", "desc_fr": "..."}]
      
      Rules:
      1. Names: Append tags " #WorldHeritage" (en), " #世界遗产" (zh), " #PatrimonioMundial" (es), " #PatrimoineMondial" (fr).
      2. Desc: Concise (under 200 chars).
    `;

    try {
      const result = await model.generateContent(prompt);
      const text = result.response.text().replace(/```json/g, "").replace(/```/g, "").trim();
      
      let translations;
      try {
        translations = JSON.parse(text);
      } catch (e) {
        throw new Error("JSON Parse Error");
      }

      for (const t of translations) {
        const { error: updateError } = await supabase
          .from('spots')
          .update({
            name_en: t.name_en, description_en: t.desc_en,
            name_zh: t.name_zh, description_zh: t.desc_zh,
            name_es: t.name_es, description_es: t.desc_es,
            name_fr: t.name_fr, description_fr: t.desc_fr
          })
          .eq('id', t.id);

        if (updateError) console.error(`DB Update Error ID ${t.id}:`, updateError.message);
      }

      const percent = Math.round(((i + 1) / targetSpots.length) * 100);
      process.stdout.write(`\r✅ 完了: ${i + 1} / ${targetSpots.length} (${percent}%) - ${item.name.substring(0, 10)}...      `);

      await new Promise(r => setTimeout(r, INTERVAL_MS));

    } catch (e) {
      console.log(`\n⚠️  スキップ (ID: ${item.id}): ${e.message}`);
      
      if (e.message.includes('429') || e.message.includes('Quota')) {
        console.log("🛑 制限検知。60秒休憩して再トライします...");
        await new Promise(r => setTimeout(r, 60000));
        i--; // インデックスを戻して再試行
      } else {
        await new Promise(r => setTimeout(r, 2000));
      }
    }
  }

  console.log("\n🎉 全翻訳完了！");
}

main();