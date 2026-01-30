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

async function main() {
  console.log("⏳ 歴史データ（年代）の付与を開始します...");

  // 年代が入っていないデータを取得
  let { data: spots, error } = await supabase.from('spots').select('*').is('year', null);
  if (error) { console.error(error); return; }

  console.log(`対象: ${spots.length} 件`);

  // 10件ずつまとめて処理して高速化
  const BATCH_SIZE = 10;
  for (let i = 0; i < spots.length; i += BATCH_SIZE) {
    const batch = spots.slice(i, i + BATCH_SIZE);
    
    try {
      const prompt = `
        Identify the construction year or founding year (approximate AD/BC year) for these locations.
        Return JSON object where key is ID and value is Year (integer). Use negative numbers for BC.
        Example: {"123": 1603, "124": -2500}
        
        Targets:
        ${batch.map(s => `${s.id}: ${s.name} (${s.country || ''})`).join("\n")}
      `;

      const result = await model.generateContent(prompt);
      const text = result.response.text().replace(/```json/g, "").replace(/```/g, "").trim();
      const yearMap = JSON.parse(text);

      for (const [id, year] of Object.entries(yearMap)) {
        if (year && !isNaN(year)) {
          await supabase.from('spots').update({ year: parseInt(year) }).eq('id', id);
          process.stdout.write(`✅`);
        }
      }
    } catch (e) {
      process.stdout.write(`❌`);
    }
    // API負荷軽減
    await new Promise(r => setTimeout(r, 2000));
  }
  console.log("\n🎉 年代データの付与完了！");
}

main();