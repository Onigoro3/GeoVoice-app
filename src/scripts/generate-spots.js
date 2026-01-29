import { GoogleGenerativeAI } from "@google/generative-ai";
import { createClient } from "@supabase/supabase-js";
import dotenv from "dotenv";

// .envファイルを読み込む
dotenv.config();

// 設定確認
const GEMINI_KEY = process.env.VITE_GEMINI_API_KEY;
const SUPABASE_URL = process.env.VITE_SUPABASE_URL;
const SUPABASE_KEY = process.env.VITE_SUPABASE_KEY; // 安全のため本来はService Role Keyが好ましいですが、開発中はこれでOK

if (!GEMINI_KEY || !SUPABASE_URL || !SUPABASE_KEY) {
  console.error("エラー: .env に APIキーが設定されていません。");
  process.exit(1);
}

// クライアント初期化
const genAI = new GoogleGenerativeAI(GEMINI_KEY);
const supabase = createClient(SUPABASE_URL, SUPABASE_KEY);

// ★ここを変えると、生成される場所が変わります！
const TARGET_THEME = "イタリアのルネサンス期の隠れた名所"; 

async function main() {
  console.log(`🤖 Gemini 2.5 Flash に「${TARGET_THEME}」について聞いています...`);

  // モデルの指定 (最新のGemini 2.5 Flashを使用)
  const model = genAI.getGenerativeModel({ model: "gemini-2.5-flash" });

  // プロンプト（命令文）
  const prompt = `
    あなたは歴史に詳しいラジオDJです。
    「${TARGET_THEME}」について、ユニークで面白い歴史スポットを3つ選んでください。
    
    出力は以下のJSONフォーマットのみを返してください。Markdown記法は不要です。
    
    [
      {
        "name": "場所の名前",
        "lat": 緯度(数値),
        "lon": 経度(数値),
        "description": "ラジオDJ風の熱い解説テキスト（150文字程度）。「さあ、ここへ来てみてください！」のような語り口調で。"
      }
    ]
  `;

  try {
    const result = await model.generateContent(prompt);
    const response = await result.response;
    let text = response.text();

    // JSONの前後に余計な文字がついている場合のクリーニング
    text = text.replace(/```json/g, "").replace(/```/g, "").trim();

    console.log("📦 データを解析中...");
    const spots = JSON.parse(text);

    console.log("🚀 Supabaseに保存中...");
    
    // データベースに保存
    const { data, error } = await supabase
      .from('spots')
      .insert(spots)
      .select();

    if (error) {
      throw error;
    }

    console.log(`✅ 成功！ ${data.length} 件のスポットを追加しました。`);
    console.log(data.map(s => ` - ${s.name}`).join("\n"));

  } catch (error) {
    console.error("❌ エラーが発生しました:", error);
  }
}

main();