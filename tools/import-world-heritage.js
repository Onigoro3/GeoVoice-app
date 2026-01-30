import { createClient } from "@supabase/supabase-js";
import dotenv from "dotenv";
import fetch from "node-fetch";

dotenv.config();

const SUPABASE_URL = process.env.VITE_SUPABASE_URL;
const SUPABASE_KEY = process.env.VITE_SUPABASE_KEY;

if (!SUPABASE_URL || !SUPABASE_KEY) {
  console.error("❌ Error: .envの設定を確認してください");
  process.exit(1);
}

const supabase = createClient(SUPABASE_URL, SUPABASE_KEY);

// 言語設定
const LANGS = ['en', 'zh', 'es', 'fr']; // 日本語(ja)はメイン処理で取得

// Wikidataから世界遺産を取得するクエリ（多言語ラベル付き）
const query = `
SELECT ?item ?coord 
  ?itemLabel_ja ?itemLabel_en ?itemLabel_zh ?itemLabel_es ?itemLabel_fr 
WHERE {
  ?item wdt:P1435 wd:Q9259;
        wdt:P625 ?coord.
  
  SERVICE wikibase:label { 
    bd:serviceParam wikibase:language "ja,en,zh,es,fr". 
    ?item rdfs:label ?itemLabel_ja.
    ?item rdfs:label ?itemLabel_en.
    ?item rdfs:label ?itemLabel_zh.
    ?item rdfs:label ?itemLabel_es.
    ?item rdfs:label ?itemLabel_fr.
  }
}
`;

// Wikipediaの概要を取得する関数
async function fetchWikiSummary(title, lang) {
  if (!title) return null;
  try {
    // タイトルから余計なIDなどを除去
    const cleanTitle = title.split('(')[0].trim();
    const url = `https://${lang}.wikipedia.org/api/rest_v1/page/summary/${encodeURIComponent(cleanTitle)}`;
    const res = await fetch(url);
    if (!res.ok) return null;
    const json = await res.json();
    return json.extract || null;
  } catch (e) {
    return null;
  }
}

async function main() {
  console.log("🌍 Wikidataから世界遺産リストを取得中...");

  const url = `https://query.wikidata.org/sparql?query=${encodeURIComponent(query)}&format=json`;
  
  try {
    const res = await fetch(url, { headers: { 'User-Agent': 'GeoVoiceApp/1.0' } });
    if (!res.ok) throw new Error("Wikidata Error");
    const json = await res.json();
    const bindings = json.results.bindings;

    console.log(`📦 ${bindings.length} 件のデータが見つかりました。詳細情報の収集を開始します...`);
    console.log("⚠️  時間がかかります（目安: 10〜20分）。PCを閉じないでください。");

    let successCount = 0;

    // 1件ずつ丁寧に処理（並列にしすぎるとAPI制限でBANされるため）
    for (let i = 0; i < bindings.length; i++) {
      const b = bindings[i];
      
      try {
        const coordStr = b.coord.value.replace("Point(", "").replace(")", "");
        const [lon, lat] = coordStr.split(" ");
        
        // 日本語情報の取得
        const name_ja = b.itemLabel_ja?.value;
        if (!name_ja) continue; // 日本語名がないものはスキップ

        const desc_ja = await fetchWikiSummary(name_ja, 'ja');
        
        // ベースデータ
        const spot = {
          name: name_ja + " #世界遺産",
          description: desc_ja || "世界遺産",
          lat: parseFloat(lat),
          lon: parseFloat(lon),
        };

        // 他言語情報の取得（逐次処理）
        for (const lang of LANGS) {
            const nameKey = `itemLabel_${lang}`;
            const rawName = b[nameKey]?.value;
            
            if (rawName) {
                // 名前を保存
                spot[`name_${lang}`] = rawName + (lang === 'en' ? " #WorldHeritage" : " #世界遺産");
                // 説明文を取得して保存
                const desc = await fetchWikiSummary(rawName, lang);
                spot[`description_${lang}`] = desc || "World Heritage Site";
            }
        }

        // Supabaseに保存
        const { error } = await supabase.from('spots').insert(spot);
        
        if (error) {
          console.error(`❌ Save Error (${name_ja}):`, error.message);
        } else {
          successCount++;
          process.stdout.write(`\r✅ 完了: ${successCount} / ${bindings.length} (${name_ja})          `);
        }

        // サーバーに優しく（0.5秒休憩）
        await new Promise(r => setTimeout(r, 500));

      } catch (e) {
        console.error(`Skipped index ${i}:`, e.message);
      }
    }

    console.log("\n\n🎉 完全インポート完了！これでアプリは爆速になります。");

  } catch (err) {
    console.error("\n❌ Fatal Error:", err);
  }
}

main();