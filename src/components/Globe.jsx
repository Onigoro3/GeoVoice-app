import React, { useRef, useState, useMemo, useEffect, useCallback } from 'react';
import Map, { Source, Layer } from 'react-map-gl';
import { supabase } from '../supabaseClient';
import { GoogleGenerativeAI } from "@google/generative-ai";

const MAPBOX_TOKEN = import.meta.env.VITE_MAPBOX_TOKEN;
const GEMINI_API_KEY = import.meta.env.VITE_GEMINI_API_KEY;

const Globe = () => {
  const mapRef = useRef(null);
  const audioRef = useRef(null);
  const [locations, setLocations] = useState([]);
  const [selectedLocation, setSelectedLocation] = useState(null);
  const [displayData, setDisplayData] = useState(null);
  const [isPlaying, setIsPlaying] = useState(false);
  
  // --- 音量設定用State ---
  const [isSettingsOpen, setIsSettingsOpen] = useState(false); // 設定パネル開閉
  const [bgmVolume, setBgmVolume] = useState(0.5);   // BGM音量 (0.0 ~ 1.0)
  const [voiceVolume, setVoiceVolume] = useState(1.0); // 音声音量 (0.0 ~ 1.0)
  const [isBgmOn, setIsBgmOn] = useState(false);
  
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

  // --- BGM制御 (音量スライダー対応) ---
  useEffect(() => {
    const audio = audioRef.current;
    if (!audio) return;

    if (isBgmOn) {
      // ユーザー操作が必要な場合のエラー対策
      const playPromise = audio.play();
      if (playPromise !== undefined) {
        playPromise.catch(() => {
          // 自動再生ブロック時は何もしない（ユーザーの次の操作を待つ）
        });
      }

      // ダッキング処理（解説中は音量を下げる）
      // 基準音量は bgmVolume を使う
      const targetVolume = isPlaying ? bgmVolume * 0.2 : bgmVolume;

      // 音量を滑らかに変更 (簡易的)
      audio.volume = targetVolume;
      
    } else {
      audio.pause();
    }
  }, [isBgmOn, isPlaying, bgmVolume]);

  const fetchWikiSummary = async (keyword) => {
    try {
      const cleanKeyword = keyword.split('#')[0].trim().split('（')[0].split('(')[0];
      const url = `https://ja.wikipedia.org/api/rest_v1/page/summary/${encodeURIComponent(cleanKeyword)}`;
      const res = await fetch(url);
      if (!res.ok) return null;
      const json = await res.json();
      return json.extract;
    } catch { return null; }
  };

  // --- 選択時の処理 (高速化) ---
  useEffect(() => {
    if (!selectedLocation) {
      setDisplayData(null);
      window.speechSynthesis.cancel();
      setIsPlaying(false);
      return;
    }

    // ★修正: まずは即座に表示・再生（Wikiを待たない）
    setDisplayData(selectedLocation);
    
    // 短い説明や「世界遺産」だけの場合のみ、裏でWikiを取りに行く
    if (selectedLocation.description === '世界遺産' || selectedLocation.description.length < 15) {
      // とりあえず今の短い文で喋り始める
      speak(selectedLocation.description);

      // 非同期でWiki取得
      fetchWikiSummary(selectedLocation.name).then(wikiText => {
        if (wikiText) {
          // Wikiが取れたらデータを差し替え
          const newData = { ...selectedLocation, description: wikiText + " (出典: Wikipedia)" };
          setDisplayData(newData);
          // 文章が変わったので、読み上げ直す
          speak(newData.description);
        }
      });
    } else {
      // 最初から長い説明があるならそれを即座に読む
      speak(selectedLocation.description);
    }
  }, [selectedLocation]);

  // --- 音声合成 (高速化 & 音量対応) ---
  const speak = (text) => {
    window.speechSynthesis.cancel();
    if (!text) { setIsPlaying(false); return; }
    
    // ★修正: setTimeoutを削除し、即時再生に変更
    const utterance = new SpeechSynthesisUtterance(text);
    utterance.lang = 'ja-JP';
    utterance.volume = voiceVolume; // ★スライダーの値を反映
    
    utterance.onstart = () => setIsPlaying(true);
    utterance.onend = () => setIsPlaying(false);
    
    window.speechSynthesis.speak(utterance);
  };

  const handleGenerate = async () => {
    if (!inputTheme) return;
    setIsGenerating(true);
    setStatusMessage("AIがスポットを選定・タグ付け中...");

    try {
      const genAI = new GoogleGenerativeAI(GEMINI_API_KEY);
      const model = genAI.getGenerativeModel({ model: "gemini-2.5-flash" });

      const prompt = `
        歴史ガイドとして「${inputTheme}」に関するスポットを3つ選んで。
        【重要】
        1. "name" の末尾にタグを#付きで追加（例: "姫路城 #世界遺産"）。
        2. Wikipediaの正式名称を使う。
        出力(JSON): [{"name": "名称 #タグ", "lat": 数値, "lon": 数値, "description": "解説"}]
      `;

      const result = await model.generateContent(prompt);
      const text = result.response.text().replace(/```json/g, "").replace(/```/g, "").trim();
      const jsonMatch = text.match(/\[[\s\S]*\]/);
      if (!jsonMatch) throw new Error("JSON解析エラー");
      
      const newSpots = JSON.parse(jsonMatch[0]);

      setStatusMessage("Wiki情報を補完中...");
      const updatedSpots = await Promise.all(newSpots.map(async (spot) => {
        const wikiText = await fetchWikiSummary(spot.name);
        return wikiText ? { ...spot, description: wikiText + " (出典: Wikipedia)" } : spot;
      }));

      setStatusMessage("保存中...");
      await supabase.from('spots').insert(updatedSpots);
      await fetchSpots();
      
      if (updatedSpots.length > 0) {
        mapRef.current?.flyTo({ center: [updatedSpots[0].lon, updatedSpots[0].lat], zoom: 4, speed: 0.8 });
      }
      
      setInputTheme("");
      alert(`${updatedSpots.length}件追加しました！`);

    } catch (e) {
      alert(`失敗: ${e.message}`);
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
              backgroundColor: tag === '世界遺産' ? '#FFD700' : '#00ffcc',
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

      {/* --- コントロールバー --- */}
      <div style={{ position: 'absolute', top: '20px', left: '20px', zIndex: 20, display: 'flex', gap: '10px', background: 'rgba(0,0,0,0.6)', padding: '10px', borderRadius: '12px', backdropFilter: 'blur(5px)', border: '1px solid rgba(255,255,255,0.1)' }}>
        <input type="text" value={inputTheme} onChange={e => setInputTheme(e.target.value)} placeholder="例: 日本の城..." style={{ background: 'transparent', border: 'none', borderBottom: '1px solid #666', color: 'white', outline: 'none', padding: '5px', width: '140px' }} onKeyDown={e => e.key === 'Enter' && handleGenerate()} />
        <button onClick={handleGenerate} disabled={isGenerating} style={{ background: isGenerating ? '#555' : '#00ffcc', color: 'black', border: 'none', borderRadius: '4px', padding: '5px 10px', cursor: 'pointer', fontWeight: 'bold' }}>{isGenerating ? 'Wait...' : '生成'}</button>
        
        {/* 設定ボタン (歯車) */}
        <button onClick={() => setIsSettingsOpen(!isSettingsOpen)} style={{ background: '#333', color: 'white', border: 'none', borderRadius: '4px', padding: '5px 10px', cursor: 'pointer', fontSize: '1.2rem' }}>
          ⚙️
        </button>
      </div>

      {/* --- 設定パネル (音量スライダー) --- */}
      {isSettingsOpen && (
        <div style={{
          position: 'absolute', top: '70px', left: '20px', zIndex: 20,
          background: 'rgba(20,20,20,0.9)', padding: '15px', borderRadius: '12px',
          border: '1px solid rgba(255,255,255,0.2)', color: 'white', minWidth: '200px',
          boxShadow: '0 4px 15px rgba(0,0,0,0.5)', backdropFilter: 'blur(10px)'
        }}>
          <div style={{ display: 'flex', justifyContent: 'space-between', marginBottom: '10px' }}>
            <span>BGM</span>
            <button onClick={() => setIsBgmOn(!isBgmOn)} style={{ background: isBgmOn ? '#ffaa00' : '#555', color: 'white', border: 'none', borderRadius: '4px', padding: '2px 8px', fontSize: '0.8rem', cursor: 'pointer' }}>
              {isBgmOn ? 'ON' : 'OFF'}
            </button>
          </div>
          <input 
            type="range" min="0" max="1" step="0.1" 
            value={bgmVolume} onChange={e => setBgmVolume(parseFloat(e.target.value))}
            style={{ width: '100%', marginBottom: '15px', cursor: 'pointer' }} 
          />
          
          <div style={{ marginBottom: '5px' }}>Voice Vol</div>
          <input 
            type="range" min="0" max="1" step="0.1" 
            value={voiceVolume} onChange={e => setVoiceVolume(parseFloat(e.target.value))}
            style={{ width: '100%', cursor: 'pointer' }} 
          />
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