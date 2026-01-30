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
  console.log("⏳ 歴史データ（年代）の全件付与プロセスを開始します...");

  let page = 0;
  const pageSize = 1000;
  let hasMore = true;
  let totalProcessed = 0;

  while (hasMore) {
    // 年代が未設定(null)のデータを1000件ずつ取得
    // ※更新するとnullじゃなくなるので、常に0ページ目を取得し続ければよいが、
    //  念のためrangeを使って確実に舐める
    const { data: spots, error } = await supabase
      .from('spots')
      .select('*')
      .is('year', null)
      .range(0, pageSize - 1); // 常に未処理の上位1000件を取る

    if (error) {
      console.error("取得エラー:", error.message);
      break;
    }

    if (!spots || spots.length === 0) {
      console.log("✅ 全てのデータの処理が完了しました。");
      hasMore = false;
      break;
    }

    console.log(`\n📄 バッチ処理中: ${spots.length} 件 (Total: ${totalProcessed}〜)`);

    // AI処理のバッチサイズ (10件ずつ)
    const AI_BATCH_SIZE = 10;
    for (let i = 0; i < spots.length; i += AI_BATCH_SIZE) {
      const batch = spots.slice(i, i + AI_BATCH_SIZE);
      
      try {
        const prompt = `
          Identify the construction year or founding year (approximate AD/BC year) for these locations.
          Return JSON object where key is ID and value is Year (integer). Use negative numbers for BC.
          If unknown, exclude from JSON.
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
            process.stdout.write(`.`);
          }
        }
      } catch (e) {
        process.stdout.write(`x`);
      }
      // APIレート制限回避
      await new Promise(r => setTimeout(r, 2000));
    }
    
    totalProcessed += spots.length;
    // まだデータがあるか確認するためにループ継続
    // (次のループで再度nullのものを探す)
  }

  console.log("\n🎉 年代データの完全付与完了！");
}

main();