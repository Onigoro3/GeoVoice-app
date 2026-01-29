import React, { useRef, useState, useMemo, useEffect, useCallback } from 'react';
import Map, { Source, Layer } from 'react-map-gl';
import { supabase } from '../supabaseClient';
import { GoogleGenerativeAI } from "@google/generative-ai";

const MAPBOX_TOKEN = import.meta.env.VITE_MAPBOX_TOKEN;
const GEMINI_API_KEY = import.meta.env.VITE_GEMINI_API_KEY;

// ★追加: 対応言語の定義
const LANGUAGES = {
  ja: { code: 'ja', name: 'Japanese', voice: 'ja-JP', label: '🇯🇵 日本語', placeholder: '例: 日本の城...' },
  en: { code: 'en', name: 'English', voice: 'en-US', label: '🇺🇸 English', placeholder: 'Ex: Castles in Japan...' },
  zh: { code: 'zh', name: 'Chinese', voice: 'zh-CN', label: '🇨🇳 中文', placeholder: '例如：日本的城堡...' },
  es: { code: 'es', name: 'Spanish', voice: 'es-ES', label: '🇪🇸 Español', placeholder: 'Ej: Castillos de Japón...' },
  fr: { code: 'fr', name: 'French', voice: 'fr-FR', label: '🇫🇷 Français', placeholder: 'Ex: Châteaux du Japon...' },
};

const Globe = () => {
  const mapRef = useRef(null);
  const audioRef = useRef(null);
  const [locations, setLocations] = useState([]);
  const [selectedLocation, setSelectedLocation] = useState(null);
  const [displayData, setDisplayData] = useState(null);
  const [isPlaying, setIsPlaying] = useState(false);
  
  // 設定用State
  const [isSettingsOpen, setIsSettingsOpen] = useState(false);
  const [bgmVolume, setBgmVolume] = useState(0.5);
  const [voiceVolume, setVoiceVolume] = useState(1.0);
  const [isBgmOn, setIsBgmOn] = useState(false);
  
  // ★追加: 言語設定 (初期値は日本語)
  const [currentLang, setCurrentLang] = useState('ja');

  const initialViewState = {
    longitude: 13.4, latitude: 41.9, zoom: 3,
  };
  
  const [inputTheme, setInputTheme] = useState("");
  const [isGenerating, setIsGenerating] = useState(false);
  const [statusMessage, setStatusMessage] = useState("");

  const fetchSpots = async () => {
    const { data, error } = await supabase.from('spots').select('*');
    if (!error && data) setLocations(data);
  };

  useEffect(() => { fetchSpots(); }, []);

  // BGM制御
  useEffect(() => {
    const audio = audioRef.current;
    if (!audio) return;
    if (isBgmOn) {
      const playPromise = audio.play();
      if (playPromise !== undefined) { playPromise.catch(() => {}); }
      const targetVolume = isPlaying ? bgmVolume * 0.2 : bgmVolume;
      audio.volume = targetVolume;
    } else {
      audio.pause();
    }
  }, [isBgmOn, isPlaying, bgmVolume]);

  // ★修正: 言語コードを受け取って、その国のWikipediaから取得する
  const fetchWikiSummary = async (keyword, langCode) => {
    try {
      const cleanKeyword = keyword.split('#')[0].trim().split('（')[0].split('(')[0];
      // 言語ごとのAPIエンドポイント
      const url = `https://${langCode}.wikipedia.org/api/rest_v1/page/summary/${encodeURIComponent(cleanKeyword)}`;
      const res = await fetch(url);
      if (!res.ok) return null;
      const json = await res.json();
      return json.extract;
    } catch { return null; }
  };

  // 選択時の処理
  useEffect(() => {
    if (!selectedLocation) {
      setDisplayData(null);
      window.speechSynthesis.cancel();
      setIsPlaying(false);
      return;
    }

    setDisplayData(selectedLocation);
    
    // 短い説明などの場合、Wikiを取りに行く
    // ★ここ重要: ピンが保存された時の言語はわからないため、とりあえず「現在の設定言語」でWikiを探しに行く
    // もしヒットしなければ、AIが生成した元のテキスト(description)で喋る
    if (selectedLocation.description === '世界遺産' || selectedLocation.description.length < 20) {
      speak(selectedLocation.description); // まずは即時再生

      fetchWikiSummary(selectedLocation.name, currentLang).then(wikiText => {
        if (wikiText) {
          const newData = { ...selectedLocation, description: wikiText + " (Wiki)" };
          setDisplayData(newData);
          speak(newData.description);
        }
      });
    } else {
      speak(selectedLocation.description);
    }
  }, [selectedLocation, currentLang]); // 言語が変わったら再取得するかも考慮

  // 音声合成
  const speak = (text) => {
    window.speechSynthesis.cancel();
    if (!text) { setIsPlaying(false); return; }
    
    const utterance = new SpeechSynthesisUtterance(text);
    // ★修正: 現在の言語設定に合わせて声を変更
    utterance.lang = LANGUAGES[currentLang].voice; 
    utterance.volume = voiceVolume;
    
    utterance.onstart = () => setIsPlaying(true);
    utterance.onend = () => setIsPlaying(false);
    
    window.speechSynthesis.speak(utterance);
  };

  const handleGenerate = async () => {
    if (!inputTheme) return;
    setIsGenerating(true);
    const langConfig = LANGUAGES[currentLang];
    
    // ステータス表示も言語によって変えるとベストだが、今回は簡易的に英語/日本語
    setStatusMessage(currentLang === 'ja' ? "AIが選定中..." : "AI is thinking...");

    try {
      const genAI = new GoogleGenerativeAI(GEMINI_API_KEY);
      const model = genAI.getGenerativeModel({ model: "gemini-2.5-flash" });

      // ★修正: プロンプトを国際化
      const prompt = `
        You are a historical tour guide.
        Please select 3 interesting historical spots about "${inputTheme}".
        
        [Constraints]
        1. Language: Write Name and Description in **${langConfig.name}**.
        2. Name: Use the official Wikipedia title in ${langConfig.name} so I can search it later.
        3. Tags: Add 1 or 2 tags with '#' at the end of the name (e.g. "Name #History").
        4. Format: Output ONLY JSON.
        
        Output JSON: [{"name": "Name #Tag", "lat": 12.34, "lon": 56.78, "description": "Description in ${langConfig.name}..."}]
      `;

      const result = await model.generateContent(prompt);
      const text = result.response.text().replace(/```json/g, "").replace(/```/g, "").trim();
      const jsonMatch = text.match(/\[[\s\S]*\]/);
      if (!jsonMatch) throw new Error("JSON Error");
      
      const newSpots = JSON.parse(jsonMatch[0]);

      // Wiki補完
      const updatedSpots = await Promise.all(newSpots.map(async (spot) => {
        const wikiText = await fetchWikiSummary(spot.name, currentLang);
        return wikiText ? { ...spot, description: wikiText + " (Wiki)" } : spot;
      }));

      await supabase.from('spots').insert(updatedSpots);
      await fetchSpots();
      
      if (updatedSpots.length > 0) {
        mapRef.current?.flyTo({ center: [updatedSpots[0].lon, updatedSpots[0].lat], zoom: 4, speed: 0.8 });
      }
      
      setInputTheme("");
      alert(`${updatedSpots.length} added!`);

    } catch (e) {
      alert(`Error: ${e.message}`);
    } finally {
      setIsGenerating(false);
      setStatusMessage("");
    }
  };

  const geoJsonData = useMemo(() => ({
    type: 'FeatureCollection',
    features: locations.map(loc => ({
      type: 'Feature',
      geometry: { type: 'Point', coordinates: [loc.lon, loc.lat] },
      properties: { ...loc }
    }))
  }), [locations]);

  const handleMoveEnd = useCallback((evt) => {
    if (!evt.originalEvent || isGenerating) return;
    const map = mapRef.current?.getMap();
    if (!map) return;
    
    const rect = map.getContainer().getBoundingClientRect();
    const center = { x: rect.width / 2, y: rect.height / 2 };
    const bounds = map.getBounds();
    const snapRadius = 50;
    
    let bestTarget = null;
    let minDist = snapRadius;

    locations.forEach(loc => {
      if (!bounds.contains([loc.lon, loc.lat])) return;
      const p = map.project([loc.lon, loc.lat]);
      const dist = Math.sqrt((p.x - center.x)**2 + (p.y - center.y)**2);
      if (dist < minDist) { minDist = dist; bestTarget = loc; }
    });

    if (bestTarget) {
      if (!selectedLocation || bestTarget.id !== selectedLocation.id) {
        setSelectedLocation(bestTarget);
        map.flyTo({ center: [bestTarget.lon, bestTarget.lat], speed: 0.5, curve: 1 });
      }
    } else {
      setSelectedLocation(null);
    }
  }, [locations, isGenerating, selectedLocation]);

  const renderNameWithTags = (fullName) => {
    if (!fullName) return null;
    const parts = fullName.split('#');
    const name = parts[0].trim();
    const tags = parts.slice(1).map(t => t.trim());

    return (
      <div style={{ display: 'flex', flexDirection: 'column', alignItems: 'center', gap: '5px' }}>
        <span style={{ fontSize: '1.2rem', fontWeight: 'bold' }}>{name}</span>
        <div style={{ display: 'flex', gap: '5px' }}>
          {tags.map((tag, i) => (
            <span key={i} style={{
              fontSize: '0.7rem', padding: '2px 8px', borderRadius: '10px',
              backgroundColor: tag.includes('World Heritage') || tag.includes('世界遺産') ? '#FFD700' : '#00ffcc',
              color: '#000', fontWeight: 'bold'
            }}>
              #{tag}
            </span>
          ))}
        </div>
      </div>
    );
  };

  return (
    <div style={{ width: "100vw", height: "100vh", background: "black", fontFamily: 'sans-serif' }}>
      
      <audio ref={audioRef} src="/bgm.mp3" loop />

      {/* コントロールバー */}
      <div style={{ position: 'absolute', top: '20px', left: '20px', zIndex: 20, display: 'flex', gap: '10px', background: 'rgba(0,0,0,0.6)', padding: '10px', borderRadius: '12px', backdropFilter: 'blur(5px)', border: '1px solid rgba(255,255,255,0.1)' }}>
        
        {/* 言語切り替えボタン (🌐) */}
        <div style={{ position: 'relative' }}>
          <button 
            onClick={() => {
              // 言語を順番に切り替える
              const keys = Object.keys(LANGUAGES);
              const nextIndex = (keys.indexOf(currentLang) + 1) % keys.length;
              setCurrentLang(keys[nextIndex]);
            }} 
            style={{ background: 'transparent', border: 'none', fontSize: '1.5rem', cursor: 'pointer', padding: '0 5px' }}
            title="Change Language"
          >
            🌐
          </button>
          {/* 現在の言語ラベルを小さく表示 */}
          <div style={{ position: 'absolute', bottom: '-15px', left: '50%', transform: 'translateX(-50%)', fontSize: '10px', color: '#fff', whiteSpace: 'nowrap' }}>
            {LANGUAGES[currentLang].code.toUpperCase()}
          </div>
        </div>

        <input 
          type="text" 
          value={inputTheme} 
          onChange={e => setInputTheme(e.target.value)} 
          placeholder={LANGUAGES[currentLang].placeholder} // プレースホルダーも切り替え
          style={{ background: 'transparent', border: 'none', borderBottom: '1px solid #666', color: 'white', outline: 'none', padding: '5px', width: '140px' }} 
          onKeyDown={e => e.key === 'Enter' && handleGenerate()} 
        />
        
        <button onClick={handleGenerate} disabled={isGenerating} style={{ background: isGenerating ? '#555' : '#00ffcc', color: 'black', border: 'none', borderRadius: '4px', padding: '5px 10px', cursor: 'pointer', fontWeight: 'bold' }}>
          {isGenerating ? '...' : 'Go'}
        </button>
        
        <button onClick={() => setIsSettingsOpen(!isSettingsOpen)} style={{ background: '#333', color: 'white', border: 'none', borderRadius: '4px', padding: '5px 10px', cursor: 'pointer', fontSize: '1.2rem' }}>
          ⚙️
        </button>
      </div>

      {/* 設定パネル */}
      {isSettingsOpen && (
        <div style={{ position: 'absolute', top: '70px', left: '20px', zIndex: 20, background: 'rgba(20,20,20,0.9)', padding: '15px', borderRadius: '12px', border: '1px solid rgba(255,255,255,0.2)', color: 'white', minWidth: '200px', boxShadow: '0 4px 15px rgba(0,0,0,0.5)', backdropFilter: 'blur(10px)' }}>
          <div style={{ marginBottom: '10px', fontWeight: 'bold', color: '#00ffcc' }}>Settings</div>
          
          <div style={{ display: 'flex', justifyContent: 'space-between', marginBottom: '5px' }}>
            <span>Language</span>
            <span style={{ fontSize: '0.8rem' }}>{LANGUAGES[currentLang].label}</span>
          </div>
          
          <div style={{ display: 'flex', justifyContent: 'space-between', marginBottom: '10px' }}>
            <span>BGM</span>
            <button onClick={() => setIsBgmOn(!isBgmOn)} style={{ background: isBgmOn ? '#ffaa00' : '#555', color: 'white', border: 'none', borderRadius: '4px', padding: '2px 8px', fontSize: '0.8rem', cursor: 'pointer' }}>{isBgmOn ? 'ON' : 'OFF'}</button>
          </div>
          <input type="range" min="0" max="1" step="0.1" value={bgmVolume} onChange={e => setBgmVolume(parseFloat(e.target.value))} style={{ width: '100%', marginBottom: '15px', cursor: 'pointer' }} />
          
          <div style={{ marginBottom: '5px' }}>Voice Vol</div>
          <input type="range" min="0" max="1" step="0.1" value={voiceVolume} onChange={e => setVoiceVolume(parseFloat(e.target.value))} style={{ width: '100%', cursor: 'pointer' }} />
        </div>
      )}

      {statusMessage && <div style={{ position: 'absolute', top: '80px', left: '20px', zIndex: 20, color: '#00ffcc', textShadow: '0 0 5px black' }}>{statusMessage}</div>}

      <div style={{ position: 'absolute', top: '50%', left: '50%', transform: 'translate(-50%, -50%)', width: '50px', height: '50px', borderRadius: '50%', zIndex: 10, pointerEvents: 'none', border: selectedLocation ? '2px solid #fff' : '2px solid rgba(255, 180, 150, 0.5)', boxShadow: selectedLocation ? '0 0 20px #fff' : '0 0 10px rgba(255, 100, 100, 0.3)', transition: 'all 0.3s' }} />

      {displayData && (
        <div style={{ position: 'absolute', bottom: '15%', left: '50%', transform: 'translateX(-50%)', background: 'rgba(10, 10, 10, 0.85)', padding: '20px', borderRadius: '20px', color: 'white', textAlign: 'center', backdropFilter: 'blur(10px)', border: '1px solid rgba(255, 255, 255, 0.2)', zIndex: 10, minWidth: '300px', maxWidth: '80%', boxShadow: '0 4px 30px rgba(0,0,0,0.5)', animation: 'fadeIn 0.5s' }}>
          <div style={{ marginBottom: '10px', fontSize: '12px', color: isPlaying ? '#00ffcc' : '#888' }}>{isPlaying ? <><span className="pulse">●</span> ON AIR</> : <span>● READY</span>}</div>
          <div style={{ color: '#ffccaa', marginBottom: '10px' }}>{renderNameWithTags(displayData.name)}</div>
          <p style={{ margin: 0, fontSize: '0.85rem', color: '#ddd', maxHeight: '150px', overflowY: 'auto', textAlign: 'left', lineHeight: '1.6' }}>{displayData.description}</p>
        </div>
      )}

      <Map ref={mapRef} mapboxAccessToken={MAPBOX_TOKEN} initialViewState={initialViewState} projection="globe" mapStyle="mapbox://styles/mapbox/satellite-v9" fog={{ range: [0.5, 10], color: 'rgba(255, 255, 255, 0)', 'high-color': '#000', 'space-color': '#000', 'star-intensity': 0.6 }} terrain={{ source: 'mapbox-dem', exaggeration: 1.5 }} onMoveEnd={handleMoveEnd} style={{ width: '100%', height: '100%' }}>
        <Source id="mapbox-dem" type="raster-dem" url="mapbox://mapbox.mapbox-terrain-dem-v1" tileSize={512} maxzoom={14} />
        {geoJsonData && (
          <Source id="my-locations" type="geojson" data={geoJsonData}>
            <Layer id="point-glow" type="circle" paint={{ 'circle-radius': 8, 'circle-color': '#ffaa88', 'circle-opacity': 0.4, 'circle-blur': 0.8 }} />
            <Layer id="point-core" type="circle" paint={{ 'circle-radius': 3, 'circle-color': '#fff', 'circle-opacity': 1 }} />
          </Source>
        )}
      </Map>
      <style>{`@keyframes fadeIn { from { opacity: 0; transform: translateX(-50%) translateY(10px); } to { opacity: 1; transform: translateX(-50%) translateY(0); } } .pulse { animation: pulse 1s infinite; } @keyframes pulse { 0% { opacity: 1; } 50% { opacity: 0.3; } 100% { opacity: 1; } }`}</style>
    </div>
  );
};

export default Globe;