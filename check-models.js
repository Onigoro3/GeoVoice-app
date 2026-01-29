import dotenv from "dotenv";
import fetch from "node-fetch";

dotenv.config();

const API_KEY = process.env.VITE_GEMINI_API_KEY;

if (!API_KEY) {
  console.error("❌ APIキーが見つかりません。.envを確認してください。");
  process.exit(1);
}

const url = `https://generativelanguage.googleapis.com/v1beta/models?key=${API_KEY}`;

async function listModels() {
  console.log("🔍 利用可能なモデルを問い合わせ中...");
  
  try {
    const response = await fetch(url);
    const data = await response.json();

    if (!data.models) {
      throw new Error(`エラー: ${JSON.stringify(data)}`);
    }

    console.log("\n✅ === あなたのアカウントで利用可能なモデル一覧 ===");
    
    // "generateContent" (テキスト生成) に対応しているモデルだけを表示
    const chatModels = data.models.filter(m => 
      m.supportedGenerationMethods.includes("generateContent")
    );

    chatModels.forEach(model => {
      // モデル名を見やすく表示
      console.log(`Model: ${model.name.replace('models/', '')}`);
      // console.log(`   Name: ${model.displayName}`); // 詳細名が必要ならコメントアウト解除
    });

    console.log("\n💡 ヒント: 上記の中から 'flash' や 'pro' がつく新しいモデルを選んでください。");

  } catch (error) {
    console.error("❌ 取得失敗:", error);
  }
}

listModels();