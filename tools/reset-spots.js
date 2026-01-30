import { createClient } from "@supabase/supabase-js";
import dotenv from "dotenv";
import readline from "readline"; // ユーザー入力用

dotenv.config();

const SUPABASE_URL = process.env.VITE_SUPABASE_URL;
const SUPABASE_KEY = process.env.VITE_SUPABASE_KEY;

if (!SUPABASE_URL || !SUPABASE_KEY) {
  console.error("❌ Error: .envの設定を確認してください");
  process.exit(1);
}

const supabase = createClient(SUPABASE_URL, SUPABASE_KEY);

const rl = readline.createInterface({
  input: process.stdin,
  output: process.stdout
});

console.log("⚠️  警告: この操作は Supabase 上の全てのスポットデータを削除します。");
console.log("⚠️  この操作は取り消せません。");

rl.question("本当に実行しますか？ (yes/no): ", async (answer) => {
  if (answer.toLowerCase() === 'yes') {
    console.log("🗑️  全データを削除中...");
    
    // idが0以外のものを削除（実質全削除）
    const { error } = await supabase.from('spots').delete().neq('id', 0);
    
    if (error) {
      console.error("❌ エラーが発生しました:", error.message);
    } else {
      console.log("✅ 全削除が完了しました。");
    }
  } else {
    console.log("キャンセルしました。");
  }
  rl.close();
});