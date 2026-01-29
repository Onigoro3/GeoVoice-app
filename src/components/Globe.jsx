import React, { useRef, useState, useMemo, useEffect, useCallback } from 'react';
import Map, { Source, Layer } from 'react-map-gl';
import { supabase } from '../supabaseClient';
import { GoogleGenerativeAI } from "@google/generative-ai";

const MAPBOX_TOKEN = import.meta.env.VITE_MAPBOX_TOKEN;
const GEMINI_API_KEY = import.meta.env.VITE_GEMINI_API_KEY;

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
  const wikiCache = useRef({}); 
  
  const [locations, setLocations] = useState([]);
  const [selectedLocation, setSelectedLocation] = useState(null);
  const [displayData, setDisplayData] = useState(null);
  const [isPlaying, setIsPlaying] = useState(false);
  
  const [isSettingsOpen, setIsSettingsOpen] = useState(false);
  const [bgmVolume, setBgmVolume] = useState(0.5);
  const [voiceVolume, setVoiceVolume] = useState(1.0);
  const [isBgmOn, setIsBgmOn] = useState(false);
  
  const [currentLang, setCurrentLang] = useState('ja');
  const [inputTheme, setInputTheme] = useState("");
  const [isGenerating, setIsGenerating] = useState(false);
  const [statusMessage, setStatusMessage] = useState("");

  const initialViewState = {
    longitude: 13.4, latitude: 41.9, zoom: 3,
  };

  const fetchSpots = async () => {
    const { data, error } = await supabase.from('spots').select('*');
    if (!error && data) setLocations(data);
  };

  useEffect(() => { fetchSpots(); }, []);

  useEffect(() => {
    const audio = audioRef.current;
    if (!audio) return;
    if (isBgmOn) {
      audio.play().catch(() => {});
      audio.volume = isPlaying ? bgmVolume * 0.2 : bgmVolume;
    } else {
      audio.pause();
    }
  }, [isBgmOn, isPlaying, bgmVolume]);

  const fetchWikiSummary = async (keyword, langCode) => {
    const cleanKeyword = keyword.split('#')[0].trim().split('（')[0].split('(')[0];
    const cacheKey = `${langCode}_${cleanKeyword}`;
    
    if (wikiCache.current[cacheKey]) {
      return wikiCache.current[cacheKey];
    }

    try {
      const url = `https://${langCode}.wikipedia.org/api/rest_v1/page/summary/${encodeURIComponent(cleanKeyword)}`;
      const res = await fetch(url);
      if (!res.ok) return null;
      const json = await res.json();
      
      if (json.extract) {
        wikiCache.current[cacheKey] = json.extract;
      }
      return json.extract;
    } catch { return null; }
  };

  // ★追加: 全言語を一括先読みする関数
  const prefetchAllLanguages = (keyword) => {
    const cleanKeyword = keyword.split('#')[0].trim().split('（')[0].split('(')[0];
    // 現在の言語以外をすべて取得しに行く
    Object.keys(LANGUAGES).forEach(langCode => {
      const cacheKey = `${langCode}_${cleanKeyword}`;
      if (!wikiCache.current[cacheKey]) {
        // 非同期で裏で走らせる（awaitしない）
        fetchWikiSummary(cleanKeyword, langCode);
      }
    });
  };

  // 選択時の処理
  useEffect(() => {
    if (!selectedLocation) {
      setDisplayData(null);
      window.speechSynthesis.cancel();
      setIsPlaying(false);
      return;
    }

    // ★高速化の肝: ピンを選んだ瞬間に、全言語のデータを裏で取りに行く
    prefetchAllLanguages(selectedLocation.name);

    window.speechSynthesis.cancel();

    // 翻訳が必要か判定
    const needsTranslation = currentLang !== 'ja' || selectedLocation.description === '世界遺産' || selectedLocation.description.length < 20;

    if (!needsTranslation) {
      setDisplayData(selectedLocation);
      speak(selectedLocation.description);
    } else {
      // キャッシュ確認
      const cleanKeyword = selectedLocation.name.split('#')[0].trim().split('（')[0].split('(')[0];
      const cacheKey = `${currentLang}_${cleanKeyword}`;
      const cachedText = wikiCache.current[cacheKey];

      if (cachedText) {
        const newData = { ...selectedLocation, description: cachedText + " (Wiki)" };
        setDisplayData(newData);
        speak(newData.description);
      } else {
        // キャッシュがない場合（最初の1回だけここを通る）
        // 前の言語のテキストを表示したままにするか、"Loading..."にするか
        // ユーザー体験的には「前の言語を一瞬残す」方がチカチカしないが、
        // 「変わった感」を出すためにローディングを一瞬出す
        setDisplayData({ ...selectedLocation, description: "Loading..." });
        
        fetchWikiSummary(selectedLocation.name, currentLang).then(wikiText => {
          if (wikiText) {
            const newData = { ...selectedLocation, description: wikiText + " (Wiki)" };
            setDisplayData(newData);
            speak(newData.description);
          } else {
            setDisplayData(selectedLocation);
            speak(selectedLocation.description);
          }
        });
      }
    }
  }, [selectedLocation, currentLang]);

  const speak = (text) => {
    window.speechSynthesis.cancel();
    if (!text || text === "Loading...") { setIsPlaying(false); return; }
    
    const utterance = new SpeechSynthesisUtterance(text);
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
    setStatusMessage(currentLang === 'ja' ? "AIが選定中..." : "AI is thinking...");

    try {
      const genAI = new GoogleGenerativeAI(GEMINI_API_KEY);
      const model = genAI.getGenerativeModel({ model: "gemini-2.5-flash" });

      const prompt = `
        You are a historical tour guide.
        Select 3 interesting spots about "${inputTheme}".
        Output ONLY JSON.
        Constraints:
        1. Language: ${langConfig.name}.
        2. Name: Official Wikipedia title in ${langConfig.name}.
        3. Tags: Add 1-2 tags with '#' (e.g. "Name #History").
        Output: [{"name": "Name #Tag", "lat": 12.34, "lon": 56.78, "description": "Desc..."}]
      `;

      const result = await model.generateContent(prompt);
      const text = result.response.text().replace(/```json/g, "").replace(/```/g, "").trim();
      const jsonMatch = text.match(/\[[\s\S]*\]/);
      if (!jsonMatch) throw new Error("JSON Error");
      
      const newSpots = JSON.parse(jsonMatch[0]);

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
    const centerX = rect.width / 2;
    const centerY = rect.height / 2;
    const snapRadius = 40; 
    
    let bestTarget = null;
    let minDist = snapRadius;

    const features = map.queryRenderedFeatures(
      [[centerX - snapRadius, centerY - snapRadius], [centerX + snapRadius, centerY + snapRadius]],
      { layers: ['point-core'] }
    );

    features.forEach(f => {
      const geom = f.geometry;
      const p = map.project([geom.coordinates[0], geom.coordinates[1]]);
      const dist = Math.sqrt((p.x - centerX)**2 + (p.y - centerY)**2);
      if (dist < minDist) {
        minDist = dist;
        bestTarget = f.properties;
      }
    });

    if (bestTarget) {
      const fullLocation = locations.find(l => l.id === bestTarget.id) || bestTarget;
      if (!selectedLocation || fullLocation.id !== selectedLocation.id) {
        setSelectedLocation(fullLocation);
        map.flyTo({ center: [fullLocation.lon, fullLocation.lat], speed: 0.6, curve: 1 });
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
    <div style={{ width: "100vw", height: "100dvh", background: "black", fontFamily: 'sans-serif', position: 'relative', overflow: 'hidden' }}>
      
      <audio ref={audioRef} src="/bgm.mp3" loop />

      <div style={{ position: 'absolute', top: '20px', left: '20px', zIndex: 20, display: 'flex', gap: '8px', background: 'rgba(0,0,0,0.6)', padding: '10px', borderRadius: '12px', backdropFilter: 'blur(5px)', border: '1px solid rgba(255,255,255,0.1)', alignItems: 'center' }}>
        <div style={{ position: 'relative', display: 'flex', alignItems: 'center' }}>
          <select 
            value={currentLang}
            onChange={(e) => setCurrentLang(e.target.value)}
            style={{ appearance: 'none', background: 'transparent', color: 'white', border: 'none', fontSize: '1.2rem', fontWeight: 'bold', cursor: 'pointer', paddingRight: '15px', outline: 'none' }}
          >
            {Object.keys(LANGUAGES).map(key => (
              <option key={key} value={key} style={{ color: 'black' }}>{LANGUAGES[key].label}</option>
            ))}
          </select>
          <span style={{ position: 'absolute', right: 0, top: '50%', transform: 'translateY(-40%)', fontSize: '0.6rem', color: '#ccc', pointerEvents: 'none' }}>▼</span>
        </div>
        <div style={{ width: '1px', height: '20px', background: 'rgba(255,255,255,0.3)' }}></div>
        <input 
          type="text" 
          value={inputTheme} 
          onChange={e => setInputTheme(e.target.value)} 
          placeholder={LANGUAGES[currentLang].placeholder}
          style={{ background: 'transparent', border: 'none', color: 'white', outline: 'none', padding: '5px', width: '120px', fontSize: '0.9rem' }} 
          onKeyDown={e => e.key === 'Enter' && handleGenerate()} 
        />
        <button onClick={handleGenerate} disabled={isGenerating} style={{ background: isGenerating ? '#555' : '#00ffcc', color: 'black', border: 'none', borderRadius: '4px', padding: '5px 12px', cursor: 'pointer', fontWeight: 'bold', fontSize: '0.9rem' }}>{isGenerating ? '...' : 'Go'}</button>
        <button onClick={() => setIsSettingsOpen(!isSettingsOpen)} style={{ background: 'transparent', color: 'white', border: 'none', cursor: 'pointer', fontSize: '1.2rem', padding: '0 5px' }}>⚙️</button>
      </div>

      {isSettingsOpen && (
        <div style={{ position: 'absolute', top: '70px', left: '20px', zIndex: 20, background: 'rgba(20,20,20,0.9)', padding: '15px', borderRadius: '12px', border: '1px solid rgba(255,255,255,0.2)', color: 'white', minWidth: '200px', boxShadow: '0 4px 15px rgba(0,0,0,0.5)', backdropFilter: 'blur(10px)' }}>
          <div style={{ marginBottom: '10px', fontWeight: 'bold', color: '#00ffcc' }}>Audio Settings</div>
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