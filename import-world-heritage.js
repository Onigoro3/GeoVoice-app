// import-world-heritage.js

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

const query = `
SELECT ?item ?itemLabel ?coord ?desc WHERE {
  ?item wdt:P1435 wd:Q9259;
        wdt:P625 ?coord.
  OPTIONAL { 
    ?item schema:description ?desc.
    FILTER(LANG(?desc) = "ja")
  }
  SERVICE wikibase:label { bd:serviceParam wikibase:language "ja,en". }
}
`;

async function main() {
  console.log("🌍 Wikidataから世界遺産データを取得中...");

  const url = `https://query.wikidata.org/sparql?query=${encodeURIComponent(query)}&format=json`;
  
  try {
    const res = await fetch(url, { headers: { 'User-Agent': 'GeoVoiceApp/1.0' } });
    if (!res.ok) throw new Error(`API Error: ${res.statusText}`);

    const json = await res.json();
    const bindings = json.results.bindings;

    console.log(`📦 ${bindings.length} 件取得。変換中...`);

    const spots = bindings.map(b => {
      try {
        const coordStr = b.coord.value.replace("Point(", "").replace(")", "");
        const [lon, lat] = coordStr.split(" ");
        let name = b.itemLabel.value;
        
        // ★ここが変更点: 名前にタグを埋め込む
        if (!name.includes("#")) {
            name = `${name} #世界遺産`;
        }

        return {
          name: name,
          description: "世界遺産", // ここは固定のままでOK（表示時にWikiから取るため）
          lat: parseFloat(lat),
          lon: parseFloat(lon)
        };
      } catch (e) { return null; }
    }).filter(i => i);

    console.log("🚀 Supabaseに保存中...");

    const chunkSize = 50;
    let successCount = 0;

    for (let i = 0; i < spots.length; i += chunkSize) {
      const chunk = spots.slice(i, i + chunkSize);
      const { error } = await supabase.from('spots').insert(chunk);
      if (error) console.error(`Chunk error:`, error.message);
      else {
        successCount += chunk.length;
        process.stdout.write(`\r✅ 保存済み: ${successCount} / ${spots.length}`);
      }
      await new Promise(r => setTimeout(r, 100));
    }
    console.log("\n🎉 完了！");

  } catch (err) {
    console.error(err);
  }
}

main();