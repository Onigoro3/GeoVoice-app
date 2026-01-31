import { createClient } from '@supabase/supabase-js';
import { GoogleGenerativeAI } from "@google/generative-ai";
import dotenv from 'dotenv';

// .envファイルを読み込む
dotenv.config();

// 環境変数のチェック
const SUPABASE_URL = process.env.VITE_SUPABASE_URL;
const SUPABASE_KEY = process.env.VITE_SUPABASE_ANON_KEY || process.env.VITE_SUPABASE_KEY;
const GEMINI_API_KEY = process.env.VITE_GEMINI_API_KEY || process.env.VITE_GOOGLE_API_KEY;

if (!SUPABASE_URL || !SUPABASE_KEY || !GEMINI_API_KEY) {
  console.error("⛔ エラー: 環境変数が不足しています。.envを確認してください。");
  process.exit(1);
}

const supabase = createClient(SUPABASE_URL, SUPABASE_KEY);
const genAI = new GoogleGenerativeAI(GEMINI_API_KEY);
const model = genAI.getGenerativeModel({ model: "gemini-2.0-flash" });

const sleep = (ms) => new Promise((resolve) => setTimeout(resolve, ms));

async function updateAllCountries() {
  console.log("🔍 データベースの総件数を確認中...");

  // 1. まず件数だけを取得 (head: true)
  const { count, error: countError } = await supabase
    .from('spots')
    .select('*', { count: 'exact', head: true });

  if (countError) {
    console.error("❌ 件数取得エラー:", countError.message);
    return;
  }

  console.log(`📊 登録されているスポット総数: ${count} 件`);
  console.log("🔄 全データのダウンロードを開始します（1000件制限を回避中）...");

  // 2. 全データを分割して取得
  let allSpots = [];
  let rangeStart = 0;
  const rangeStep = 999; // 1回に取得する数（Supabaseの上限は通常1000）

  while (true) {
    const { data, error } = await supabase
      .from('spots')
      .select('*')
      .range(rangeStart, rangeStart + rangeStep);

    if (error) {
      console.error("❌ データ取得エラー:", error.message);
      return;
    }

    if (!data || data.length === 0) break;

    allSpots = allSpots.concat(data);
    // console.log(`... ${allSpots.length} / ${count} 件 取得済み`); // 進捗が見たい場合はコメントアウト解除

    if (data.length < rangeStep + 1) break; // 最後まで取れたら終了
    rangeStart += rangeStep + 1;
  }

  console.log(`✅ 全データ取得完了: ${allSpots.length} 件`);
  console.log("🚀 国名のAI判定と更新を開始します...");

  let successCount = 0;
  let failCount = 0;
  let skipCount = 0;

  // 3. 取得した全データに対して更新処理
  for (let i = 0; i < allSpots.length; i++) {
    const spot = allSpots[i];
    
    // ※既に国名が入っているものをスキップしたい場合はここを有効にしてください
    // if (spot.country_ja) { 
    //   skipCount++;
    //   // console.log(`[スキップ] ${spot.name}: 既にあり (${spot.country_ja})`); 
    //   continue; 
    // }

    try {
      const prompt = `この場所がある「国名」を日本語で答えて。出力は国名のみ（例: 日本）。余計な文字は一切不要。場所: ${spot.name}, 緯度:${spot.lat}, 経度:${spot.lon}`;
      
      const result = await model.generateContent(prompt);
      const countryName = result.response.text().trim().replace(/\n/g, '');

      if (countryName) {
        const { error: updateError } = await supabase
          .from('spots')
          .update({ country_ja: countryName })
          .eq('id', spot.id);

        if (updateError) throw updateError;

        console.log(`[${i + 1}/${allSpots.length}] ✅ 更新: ${spot.name} -> ${countryName}`);
        successCount++;
      } else {
        console.warn(`[${i + 1}/${allSpots.length}] ⚠️ 判定不能: ${spot.name}`);
        failCount++;
      }

    } catch (e) {
      console.error(`[${i + 1}/${allSpots.length}] ❌ エラー: ${spot.name}`, e.message);
      failCount++;
    }

    // APIレート制限回避のための待機
    await sleep(1000); 
  }

  console.log("---------------------------------------------------");
  console.log(`🎉 全処理完了！`);
  console.log(`総数: ${allSpots.length}`);
  console.log(`成功: ${successCount}`);
  console.log(`失敗: ${failCount}`);
  console.log(`スキップ: ${skipCount}`);
}

updateAllCountries();