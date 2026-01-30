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

// モデル: gemini-2.0-flash
const model = genAI.getGenerativeModel({ model: "gemini-2.0-flash" });

// API制限対策: 4秒に1回ペース
const INTERVAL_MS = 4000;

async function main() {
  console.log("🌍 全スポットデータを取得中...");

  let allSpots = [];
  let page = 0;
  const pageSize = 1000;
  let hasNext = true;

  // ★修正: 1000件ずつループして全データを吸い出す
  while (hasNext) {
    const { data, error } = await supabase
      .from('spots')
      .select('*')
      .order('id')
      .range(page * pageSize, (page + 1) * pageSize - 1);

    if (error) {
      console.error("Fetch error:", error);
      break;
    }

    if (data.length > 0) {
      allSpots = allSpots.concat(data);
      process.stdout.write(`\r📥 データ読み込み中... 現在 ${allSpots.length} 件`);
      page++;
      if (data.length < pageSize) hasNext = false;
    } else {
      hasNext = false;
    }
  }

  console.log(`\n📋 合計 ${allSpots.length} 件の翻訳チェックを開始します`);
  console.log("🚀 開始します (中断するには Ctrl+C)...");

  for (let i = 0; i < allSpots.length; i++) {
    const item = allSpots[i];

    // すでに翻訳済みかチェックしたい場合は以下を有効化
    // if (item.name_ja && item.description_ja) continue;

    const prompt = `
      You are a travel guide. Translate/Rewrite this location info into 5 languages.
      Input Name: "${item.name}"
      Input Desc: "${item.description}"

      Output JSON ONLY format:
      {
        "ja": { "name": "名前", "desc": "解説(100文字程度)" },
        "en": { "name": "Name", "desc": "Description(150 chars)" },
        "zh": { "name": "名称", "desc": "说明" },
        "es": { "name": "Nombre", "desc": "Descripción" },
        "fr": { "name": "Nom", "desc": "Description" }
      }
    `;

    try {
      const result = await model.generateContent(prompt);
      const text = result.response.text().replace(/```json/g, "").replace(/```/g, "").trim();
      const json = JSON.parse(text);

      // DB更新
      const { error: updateError } = await supabase
        .from('spots')
        .update({
          name_ja: json.ja.name, description_ja: json.ja.desc,
          name_en: json.en.name, description_en: json.en.desc,
          name_zh: json.zh.name, description_zh: json.zh.desc,
          name_es: json.es.name, description_es: json.es.desc,
          name_fr: json.fr.name, description_fr: json.fr.desc,
        })
        .eq('id', item.id);

      if (updateError) throw updateError;

      const percent = Math.round(((i + 1) / allSpots.length) * 100);
      process.stdout.write(`\r✅ [${i + 1}/${allSpots.length}] (${percent}%) ${json.ja.name}       `);

      await new Promise(r => setTimeout(r, INTERVAL_MS));

    } catch (e) {
      console.log(`\n⚠️  Skip ID ${item.id}: ${e.message}`);
      if (e.message.includes("429")) {
        console.log("🛑 API制限検知。60秒休憩します...");
        await new Promise(r => setTimeout(r, 60000));
        i--; // リトライ
      }
    }
  }

  console.log("\n🎉 全翻訳完了！");
}

main();