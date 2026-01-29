// src/components/Globe.jsx

import React, { useRef, useState, useMemo, useEffect, useCallback } from 'react';
import Map, { Source, Layer } from 'react-map-gl';
import { supabase } from '../supabaseClient';
import { GoogleGenerativeAI } from "@google/generative-ai";

const MAPBOX_TOKEN = import.meta.env.VITE_MAPBOX_TOKEN;
const GEMINI_API_KEY = import.meta.env.VITE_GEMINI_API_KEY;

const Globe = () => {
  const mapRef = useRef(null);
  const [locations, setLocations] = useState([]);
  const [selectedLocation, setSelectedLocation] = useState(null);
  const [displayData, setDisplayData] = useState(null);
  const [isPlaying, setIsPlaying] = useState(false);
  
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

  useEffect(() => {
    if (!selectedLocation) {
      setDisplayData(null);
      window.speechSynthesis.cancel();
      setIsPlaying(false);
      return;
    }
    setDisplayData(selectedLocation);
    if (selectedLocation.description === '世界遺産' || selectedLocation.description.length < 15) {
      fetchWikiSummary(selectedLocation.name).then(wikiText => {
        if (wikiText) {
          const newData = { ...selectedLocation, description: wikiText + " (出典: Wikipedia)" };
          setDisplayData(newData);
          speak(newData.description);
        } else {
          speak(selectedLocation.description);
        }
      });
    } else {
      speak(selectedLocation.description);
    }
  }, [selectedLocation]);

  const speak = (text) => {
    window.speechSynthesis.cancel();
    if (!text) { setIsPlaying(false); return; }
    setTimeout(() => {
      const utterance = new SpeechSynthesisUtterance(text);
      utterance.lang = 'ja-JP';
      utterance.onstart = () => setIsPlaying(true);
      utterance.onend = () => setIsPlaying(false);
      window.speechSynthesis.speak(utterance);
    }, 500);
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

  // ★修正箇所: スマホでのズレを解消するためのロジック変更
  const handleMoveEnd = useCallback((evt) => {
    if (!evt.originalEvent || isGenerating) return;
    const map = mapRef.current?.getMap();
    if (!map) return;
    
    // --- 修正ポイント: 中心の取得方法を変更 ---
    // 地図が表示されているコンテナのサイズを直接測る
    const rect = map.getContainer().getBoundingClientRect();
    // その中心座標を計算（これが最も確実な「見た目の真ん中」）
    const center = {
        x: rect.width / 2,
        y: rect.height / 2
    };
    
    // 現在の表示範囲（地理座標）
    const bounds = map.getBounds();

    // 吸着範囲（ピクセル）。少しだけ広げて捉えやすくする (40 -> 50)
    const snapRadius = 50;
    
    let bestTarget = null;
    let minDist = snapRadius;

    locations.forEach(loc => {
      // 画面外ならスキップ
      if (!bounds.contains([loc.lon, loc.lat])) return;

      // ピンの座標を画面座標に変換
      const p = map.project([loc.lon, loc.lat]);
      
      // 距離計算
      const dist = Math.sqrt((p.x - center.x)**2 + (p.y - center.y)**2);
      
      if (dist < minDist) {
        minDist = dist;
        bestTarget = loc;
      }
    });

    if (bestTarget) {
      // 違う場所なら更新して移動
      if (!selectedLocation || bestTarget.id !== selectedLocation.id) {
        setSelectedLocation(bestTarget);
        // 移動速度を少しゆっくりにして、吸着感を強調
        map.flyTo({ center: [bestTarget.lon, bestTarget.lat], speed: 0.5, curve: 1 });
      }
    } else {
      // 範囲外なら解除
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
      
      <div style={{ position: 'absolute', top: '20px', left: '20px', zIndex: 20, display: 'flex', gap: '10px', background: 'rgba(0,0,0,0.6)', padding: '10px', borderRadius: '12px', backdropFilter: 'blur(5px)', border: '1px solid rgba(255,255,255,0.1)' }}>
        <input type="text" value={inputTheme} onChange={e => setInputTheme(e.target.value)} placeholder="例: 日本の城..." style={{ background: 'transparent', border: 'none', borderBottom: '1px solid #666', color: 'white', outline: 'none', padding: '5px', width: '200px' }} onKeyDown={e => e.key === 'Enter' && handleGenerate()} />
        <button onClick={handleGenerate} disabled={isGenerating} style={{ background: isGenerating ? '#555' : '#00ffcc', color: 'black', border: 'none', borderRadius: '4px', padding: '5px 15px', cursor: 'pointer', fontWeight: 'bold' }}>{isGenerating ? 'Wait...' : '生成'}</button>
      </div>

      {statusMessage && <div style={{ position: 'absolute', top: '80px', left: '20px', zIndex: 20, color: '#00ffcc', textShadow: '0 0 5px black' }}>{statusMessage}</div>}

      {/* 照準枠 */}
      <div style={{ position: 'absolute', top: '50%', left: '50%', transform: 'translate(-50%, -50%)', width: '50px', height: '50px', borderRadius: '50%', zIndex: 10, pointerEvents: 'none', border: selectedLocation ? '2px solid #fff' : '2px solid rgba(255, 180, 150, 0.5)', boxShadow: selectedLocation ? '0 0 20px #fff' : '0 0 10px rgba(255, 100, 100, 0.3)', transition: 'all 0.3s' }} />

      {/* ポップアップ */}
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