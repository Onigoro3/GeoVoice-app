import { createClient } from '@supabase/supabase-js';
import { GoogleGenerativeAI } from "@google/generative-ai";
import dotenv from 'dotenv';

// .envファイルを読み込む
dotenv.config();

// ★修正: キーの名前が違っても動くように、複数のパターンで取得を試みる
const SUPABASE_URL = process.env.VITE_SUPABASE_URL;
const SUPABASE_KEY = process.env.VITE_SUPABASE_ANON_KEY || process.env.VITE_SUPABASE_KEY; // ここを修正
const GEMINI_API_KEY = process.env.VITE_GEMINI_API_KEY;

// デバッグ用: どのキーが取れていないか確認できるようにする
if (!SUPABASE_URL) console.error("❌ Error: VITE_SUPABASE_URL が見つかりません");
if (!SUPABASE_KEY) console.error("❌ Error: VITE_SUPABASE_ANON_KEY または VITE_SUPABASE_KEY が見つかりません");
if (!GEMINI_API_KEY) console.error("❌ Error: VITE_GEMINI_API_KEY が見つかりません");

if (!SUPABASE_URL || !SUPABASE_KEY || !GEMINI_API_KEY) {
  console.error("⛔ エラー: 環境変数が不足しています。.envファイルの中身を確認してください。");
  process.exit(1);
}

const supabase = createClient(SUPABASE_URL, SUPABASE_KEY);
const genAI = new GoogleGenerativeAI(GEMINI_API_KEY);
const model = genAI.getGenerativeModel({ model: "gemini-2.0-flash" });

// 待機用関数
const sleep = (ms) => new Promise((resolve) => setTimeout(resolve, ms));

// Wikipediaから画像を取得する関数
async function fetchWikipediaImage(query) {
  try {
    const searchUrl = `https://en.wikipedia.org/w/api.php?action=query&format=json&prop=pageimages&piprop=original&titles=${encodeURIComponent(query)}&origin=*`;
    
    const response = await fetch(searchUrl);
    const data = await response.json();
    
    const pages = data.query?.pages;
    if (!pages) return null;

    const pageId = Object.keys(pages)[0];
    if (pageId === "-1") return null;

    return pages[pageId]?.original?.source || null;
  } catch (e) {
    console.error(`   ⚠️ Image fetch failed for ${query}: ${e.message}`);
    return null;
  }
}

// ターゲット国リスト（主要国 + マイナー国）
const TARGET_COUNTRIES = [
  "Japan", "China", "South Korea", "Taiwan", "Thailand", "Vietnam", "Indonesia", "India", "Nepal", "Bhutan", 
  "Mongolia", "Kazakhstan", "Uzbekistan", "Sri Lanka", "Maldives", "Laos", "Cambodia", "Myanmar", "Philippines", 
  "Malaysia", "Singapore", "Brunei", "Fiji", "Palau", "Australia", "New Zealand", "United Kingdom", "France", 
  "Germany", "Italy", "Spain", "Portugal", "Netherlands", "Belgium", "Switzerland", "Austria", "Hungary", 
  "Poland", "Greece", "Turkey", "Croatia", "Czech Republic", "Sweden", "Finland", "Norway", "Iceland", "Egypt", 
  "Morocco", "South Africa", "Kenya", "USA", "Canada", "Mexico", "Brazil", "Argentina", "Peru", "Chile",
  "Turkey", "UAE", "Saudi Arabia", "Israel", "Jordan", "Oman", "Qatar"
];

// テーマ
const THEMES = [
  "Hidden Gems (穴場)", "Historical Ruins (遺跡)", "Nature (自然)", 
  "Modern Architecture (建築)", "Art & Museum (芸術)", "World Heritage (世界遺産)"
];

async function generateMultilingualSpotsLoop() {
  console.log("🚀 完全自動生成モード（5言語・画像・国タグ完備）を開始します... (Ctrl+C で停止)");
  let totalAdded = 0;

  while (true) {
    const targetCountry = TARGET_COUNTRIES[Math.floor(Math.random() * TARGET_COUNTRIES.length)];
    const theme = THEMES[Math.floor(Math.random() * THEMES.length)];

    console.log(`\n🌍 Target: [${targetCountry}] - Theme: [${theme}] 生成中...`);

    try {
      // 1. Geminiにデータ生成を依頼
      const prompt = `
        あなたは多言語対応の旅行ガイドです。以下の条件で観光スポットを3つ生成してください。
        
        ターゲット国: ${targetCountry}
        テーマ: ${theme}
        
        【重要】
        - 実在するスポットを選んでください。
        - JSONの "country" キーには "${targetCountry}" をそのまま入れてください。
        - JSONの "country_ja" キーには、その国の日本語名を入れてください。
        
        出力フォーマット: JSON配列のみ (マークダウン不要)
        [
          {
            "name": "英語名",
            "name_ja": "日本語名",
            "name_zh": "中国語名",
            "name_es": "スペイン語名",
            "name_fr": "フランス語名",
            "lat": 緯度(数値),
            "lon": 経度(数値),
            "description": "英語での解説(100文字)",
            "description_ja": "日本語での解説(100文字)",
            "description_zh": "中国語での解説",
            "description_es": "スペイン語での解説",
            "description_fr": "フランス語での解説",
            "category": "landmark" | "nature" | "history" | "modern" | "science" | "art",
            "year": 建設年または成立年(西暦なら正の数, 紀元前なら負の数。不明ならnull),
            "country": "${targetCountry}",
            "country_ja": "国名(日本語)"
          }
        ]
      `;

      const result = await model.generateContent(prompt);
      const text = result.response.text();
      const jsonStr = text.replace(/```json/g, "").replace(/```/g, "").trim();
      let newSpots = JSON.parse(jsonStr);

      // 2. 画像取得 & データ整形 & 国タグ強制適用
      const spotsToInsert = [];
      
      console.log("   📸 画像を検索中...");
      for (const spot of newSpots) {
        // Wikipediaから画像URLを取得
        const imageUrl = await fetchWikipediaImage(spot.name);
        
        // データを結合
        spotsToInsert.push({
          ...spot,
          image_url: imageUrl,
          country: targetCountry, // 英語タグを確実に付与
        });
        
        if (imageUrl) console.log(`      Found image for: ${spot.name}`);
        else console.log(`      No image found for: ${spot.name}`);
        
        await sleep(1000); 
      }

      // 3. データベースへ保存
      if (spotsToInsert.length > 0) {
        const { error } = await supabase.from('spots').insert(spotsToInsert);

        if (error) {
          console.error("❌ Insert Error:", error.message);
        } else {
          totalAdded += spotsToInsert.length;
          console.log(`✅ ${spotsToInsert.length}件 追加完了! [累計: ${totalAdded}件]`);
        }
      } else {
        console.warn("⚠️ 生成データがありませんでした");
      }

    } catch (e) {
      console.error("❌ Error:", e.message);
    }

    // 4. 休憩
    const waitTime = 20000 + Math.floor(Math.random() * 10000);
    console.log(`☕ ${Math.round(waitTime/1000)}秒 待機...`);
    await sleep(waitTime);
  }
}

generateMultilingualSpotsLoop();