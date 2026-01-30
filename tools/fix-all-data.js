import { createClient } from "@supabase/supabase-js";
import { GoogleGenerativeAI } from "@google/generative-ai";
import dotenv from "dotenv";
import fetch from "node-fetch";

dotenv.config();

const SUPABASE_URL = process.env.VITE_SUPABASE_URL;
const SUPABASE_KEY = process.env.VITE_SUPABASE_KEY;
const GEMINI_API_KEY = process.env.VITE_GEMINI_API_KEY;
const PIXABAY_KEY = process.env.VITE_PIXABAY_API_KEY;

if (!SUPABASE_URL || !SUPABASE_KEY || !GEMINI_API_KEY) {
  console.error("❌ .envの設定を確認してください");
  process.exit(1);
}

const supabase = createClient(SUPABASE_URL, SUPABASE_KEY);
const genAI = new GoogleGenerativeAI(GEMINI_API_KEY);
const model = genAI.getGenerativeModel({ model: "gemini-2.0-flash" });

// API制限対策のための待機時間
const SLEEP_MS = 2000; 

// --- 画像取得関数 ---
async function fetchImage(query) {
  // 1. Wikipedia
  try {
    const wikiUrl = `https://en.wikipedia.org/w/api.php?action=query&titles=${encodeURIComponent(query)}&prop=pageimages&format=json&pithumbsize=600&origin=*`;
    const res = await fetch(wikiUrl);
    const json = await res.json();
    const pages = json.query?.pages;
    if (pages) {
      const pageId = Object.keys(pages)[0];
      if (pageId !== "-1" && pages[pageId].thumbnail) return pages[pageId].thumbnail.source;
    }
  } catch (e) {}

  // 2. Pixabay
  if (PIXABAY_KEY) {
    try {
      const pixUrl = `https://pixabay.com/api/?key=${PIXABAY_KEY}&q=${encodeURIComponent(query)}&image_type=photo&category=travel&per_page=3`;
      const res = await fetch(pixUrl);
      const json = await res.json();
      if (json.hits && json.hits.length > 0) return json.hits[0].webformatURL;
    } catch (e) {}
  }
  return null;
}

async function main() {
  console.log("🛠️ 全スポットのデータ完全修復プロセスを開始します...");

  // 全データ取得（ページネーション）
  let allSpots = [];
  let page = 0;
  const pageSize = 1000;
  let hasNext = true;

  while (hasNext) {
    const { data, error } = await supabase.from('spots').select('*').order('id').range(page * pageSize, (page + 1) * pageSize - 1);
    if (error) break;
    if (data.length > 0) {
      allSpots = allSpots.concat(data);
      process.stdout.write(`\r📥 データ読み込み中... ${allSpots.length}件`);
      page++;
      if (data.length < pageSize) hasNext = false;
    } else { hasNext = false; }
  }
  console.log(`\n📋 合計 ${allSpots.length} 件を処理します。`);

  for (let i = 0; i < allSpots.length; i++) {
    const spot = allSpots[i];
    let updates = {};
    let statusLog = "";

    // --- 1. 画像処理 ---
    if (!spot.image_url) {
      const searchName = (spot.name_en || spot.name).split('#')[0].trim();
      const newImage = await fetchImage(searchName);
      if (newImage) {
        updates.image_url = newImage;
        statusLog += "📸画像GET ";
      } else {
        statusLog += "❌画像なし ";
      }
    } else {
      statusLog += "✅画像済 ";
    }

    // --- 2. 翻訳・解説生成 ---
    // 解説が極端に短い、または他言語が欠けている場合に実行
    const needsTranslation = 
      !spot.description_ja || spot.description_ja.length < 20 ||
      !spot.description_en || 
      !spot.description_zh || 
      !spot.description_es || 
      !spot.description_fr;

    if (needsTranslation) {
      try {
        const prompt = `
          Tourism Guide Task.
          Spot Name: "${spot.name}"
          
          1. Determine category: "nature", "history", "modern", "science", or "art".
          2. Generate interesting descriptions (100-150 chars) in 5 languages.
          
          Output JSON ONLY:
          {
            "category": "category_name",
            "ja": { "name": "日本語名", "desc": "解説" },
            "en": { "name": "English Name", "desc": "Description" },
            "zh": { "name": "中文名", "desc": "说明" },
            "es": { "name": "Nombre", "desc": "Descripción" },
            "fr": { "name": "Nom", "desc": "Description" }
          }
        `;
        
        const result = await model.generateContent(prompt);
        const text = result.response.text().replace(/```json/g, "").replace(/```/g, "").trim();
        const json = JSON.parse(text);

        updates = {
          ...updates,
          category: json.category, // カテゴリも補正
          name_ja: json.ja.name, description_ja: json.ja.desc,
          name_en: json.en.name, description_en: json.en.desc,
          name_zh: json.zh.name, description_zh: json.zh.desc,
          name_es: json.es.name, description_es: json.es.desc,
          name_fr: json.fr.name, description_fr: json.fr.desc,
        };
        statusLog += "🌍翻訳完了 ";
      } catch (e) {
        statusLog += "⚠️翻訳失敗 ";
        if (e.message.includes("429")) {
            console.log("\n🛑 API制限検知。60秒待機...");
            await new Promise(r => setTimeout(r, 60000));
            i--; // リトライ
            continue;
        }
      }
    } else {
      statusLog += "✅翻訳済 ";
    }

    // --- 3. 保存処理 ---
    if (Object.keys(updates).length > 0) {
      await supabase.from('spots').update(updates).eq('id', spot.id);
      statusLog += "💾保存";
    } else {
      statusLog += "✨更新なし";
    }

    // 進捗表示
    const percent = Math.round(((i + 1) / allSpots.length) * 100);
    process.stdout.write(`\r[${percent}%] ${spot.name.substring(0,10)}... : ${statusLog}      `);

    // API負荷軽減
    await new Promise(r => setTimeout(r, SLEEP_MS));
  }

  console.log("\n\n🎉 全データの整備が完了しました！");
}

main();