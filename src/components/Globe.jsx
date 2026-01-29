import React, { useRef, useState, useMemo, useEffect, useCallback } from 'react';
import Map, { Source, Layer } from 'react-map-gl';
import { supabase } from '../supabaseClient';
import { GoogleGenerativeAI } from "@google/generative-ai";
import AuthModal from './AuthModal';
import FavoritesModal from './FavoritesModal';
import { isVipUser } from '../vipList';
import ErrorBoundary from './ErrorBoundary'; // ★追加

const MAPBOX_TOKEN = import.meta.env.VITE_MAPBOX_TOKEN;
const GEMINI_API_KEY = import.meta.env.VITE_GEMINI_API_KEY;

const LANGUAGES = {
  ja: { code: 'ja', label: '🇯🇵 日本語', placeholder: '例: 日本の城...' },
  en: { code: 'en', label: '🇺🇸 English', placeholder: 'Ex: Castles in Japan...' },
  zh: { code: 'zh', label: '🇨🇳 中文', placeholder: '例如：日本的城堡...' },
  es: { code: 'es', label: '🇪🇸 Español', placeholder: 'Ej: Castillos de Japón...' },
  fr: { code: 'fr', label: '🇫🇷 Français', placeholder: 'Ex: Châteaux du Japon...' },
};

// ★地図コンポーネント (メモ化して再レンダリングを防止)
const MemoizedMap = React.memo(({ mapRef, mapboxAccessToken, initialViewState, onMoveEnd, geoJsonData, addLog }) => {
  return (
    <Map
      ref={mapRef}
      mapboxAccessToken={mapboxAccessToken}
      initialViewState={initialViewState}
      projection="globe"
      mapStyle="mapbox://styles/mapbox/satellite-v9"
      fog={{ range: [0.5, 10], color: 'rgba(255, 255, 255, 0)', 'high-color': '#000', 'space-color': '#000', 'star-intensity': 0.6 }}
      terrain={{ source: 'mapbox-dem', exaggeration: 1.5 }}
      onMoveEnd={onMoveEnd}
      style={{ width: '100%', height: '100%' }}
      // reuseMaps={true} // ★ブラックアウトの原因になりやすいので一旦無効化
      onError={(e) => addLog(`Map Error: ${e.error.message}`)} // マップのエラーをキャッチ
    >
      <Source id="mapbox-dem" type="raster-dem" url="mapbox://mapbox.mapbox-terrain-dem-v1" tileSize={512} maxzoom={14} />
      {geoJsonData && (
        <Source id="my-locations" type="geojson" data={geoJsonData}>
          <Layer id="point-glow" type="circle" paint={{ 'circle-radius': 8, 'circle-color': '#ffaa88', 'circle-opacity': 0.4, 'circle-blur': 0.8 }} />
          <Layer id="point-core" type="circle" paint={{ 'circle-radius': 3, 'circle-color': '#fff', 'circle-opacity': 1 }} />
        </Source>
      )}
    </Map>
  );
}, (prev, next) => prev.geoJsonData === next.geoJsonData);

const GlobeContent = () => {
  const mapRef = useRef(null);
  const audioRef = useRef(null);
  
  // Refで状態を保持（レンダリング回避）
  const locationsRef = useRef([]);
  const selectedLocationRef = useRef(null);
  const isGeneratingRef = useRef(false);

  const [locations, setLocations] = useState([]);
  const [selectedLocation, setSelectedLocation] = useState(null);
  const [displayData, setDisplayData] = useState(null);
  const [isPlaying, setIsPlaying] = useState(false);
  
  const [currentLang, setCurrentLang] = useState('ja');
  const [inputTheme, setInputTheme] = useState("");
  const [isGenerating, setIsGenerating] = useState(false);
  const [statusMessage, setStatusMessage] = useState("");

  const [user, setUser] = useState(null);
  const [profile, setProfile] = useState(null);
  const [isPremium, setIsPremium] = useState(false);
  const [showAuthModal, setShowAuthModal] = useState(false);
  const [showFavList, setShowFavList] = useState(false);
  const [favorites, setFavorites] = useState(new Set());
  
  // ★デバッグ用ログ
  const [logs, setLogs] = useState([]);
  const addLog = (msg) => {
    console.log(msg);
    setLogs(prev => [`[${new Date().toLocaleTimeString()}] ${msg}`, ...prev].slice(0, 5));
  };

  // UI状態
  const [isSettingsOpen, setIsSettingsOpen] = useState(false);
  const [bgmVolume, setBgmVolume] = useState(0.5);
  const [voiceVolume, setVoiceVolume] = useState(1.0);
  const [isBgmOn, setIsBgmOn] = useState(false);

  const initialViewState = { longitude: 13.4, latitude: 41.9, zoom: 3 };

  // Ref同期
  useEffect(() => { locationsRef.current = locations; }, [locations]);
  useEffect(() => { selectedLocationRef.current = selectedLocation; }, [selectedLocation]);
  useEffect(() => { isGeneratingRef.current = isGenerating; }, [isGenerating]);

  // データ取得
  const fetchSpots = async () => {
    try {
      const { data, error } = await supabase.from('spots').select('*');
      if (error) throw error;
      if (data) {
        setLocations(data);
        addLog(`Loaded ${data.length} spots.`);
      }
    } catch (e) {
      addLog(`Fetch Error: ${e.message}`);
    }
  };

  useEffect(() => {
    fetchSpots();
    supabase.auth.getSession().then(({ data: { session } }) => {
      if (session?.user) setupUser(session.user);
    });
    const { data: { subscription } } = supabase.auth.onAuthStateChange((_event, session) => {
      if (session?.user) setupUser(session.user);
      else clearUser();
    });
    return () => subscription.unsubscribe();
  }, []);

  const setupUser = (u) => {
    setUser(u);
    fetchFavorites(u.id);
    fetchProfile(u.id, u.email);
    addLog(`User: ${u.email}`);
  };

  const clearUser = () => {
    setUser(null); setProfile(null); setIsPremium(false); setFavorites(new Set());
  };

  const fetchProfile = async (userId, email) => {
    const isVip = isVipUser(email);
    const { data } = await supabase.from('profiles').select('*').eq('id', userId).single();
    if (data) {
      setProfile(data);
      setIsPremium(isVip || data.is_premium);
    } else {
      setIsPremium(isVip);
    }
  };

  const fetchFavorites = async (userId) => {
    const { data } = await supabase.from('favorites').select('spot_id').eq('user_id', userId);
    if (data) setFavorites(new Set(data.map(f => f.spot_id)));
  };

  const toggleFavorite = async () => {
    if (!user) { setShowAuthModal(true); return; }
    if (!selectedLocation) return;
    const spotId = selectedLocation.id;
    const isFav = favorites.has(spotId);
    try {
      if (isFav) {
        await supabase.from('favorites').delete().eq('user_id', user.id).eq('spot_id', spotId);
        const newFavs = new Set(favorites); newFavs.delete(spotId); setFavorites(newFavs);
        addLog("Removed from favorites");
      } else {
        await supabase.from('favorites').insert({ user_id: user.id, spot_id: spotId });
        const newFavs = new Set(favorites); newFavs.add(spotId); setFavorites(newFavs);
        addLog("Added to favorites");
      }
    } catch(e) { addLog(`Fav Error: ${e.message}`); }
  };

  const handleSelectFromList = (spot) => {
    setShowFavList(false);
    setSelectedLocation(spot);
    mapRef.current?.flyTo({ center: [spot.lon, spot.lat], zoom: 6, speed: 1.2, curve: 1 });
  };

  // 翻訳機能
  const translateAndFix = async (spot, lang) => {
    if (statusMessage === "翻訳データを生成中...") return;
    setStatusMessage("翻訳データを生成中...");
    addLog(`翻訳開始: ${spot.name}`);

    try {
      const genAI = new GoogleGenerativeAI(GEMINI_API_KEY);
      const model = genAI.getGenerativeModel({ model: "gemini-1.5-flash" }); 
      
      const prompt = `
        Translate/Rewrite into ${LANGUAGES[lang].name}.
        Target: "${spot.name}"
        Desc: "${spot.description}"
        Output JSON: { "name": "Name", "description": "Desc (max 150 chars)" }
      `;

      const result = await model.generateContent(prompt);
      const text = result.response.text().replace(/```json/g, "").replace(/```/g, "").trim();
      const json = JSON.parse(text);

      // 保存処理
      const nameCol = lang === 'ja' ? 'name_ja' : `name_${lang}`;
      const descCol = lang === 'ja' ? 'description_ja' : `description_${lang}`;
      const updateData = { [nameCol]: json.name, [descCol]: json.description };

      const { error } = await supabase.from('spots').update(updateData).eq('id', spot.id);
      if (error) throw error;
      
      addLog("翻訳完了・保存成功");

      // ローカル更新
      const updatedLocations = locations.map(l => l.id === spot.id ? { ...l, ...updateData } : l);
      setLocations(updatedLocations);
      locationsRef.current = updatedLocations; // Refも更新

      // 表示更新
      if (selectedLocationRef.current && selectedLocationRef.current.id === spot.id) {
        const newData = { ...spot, ...updateData, name: json.name, description: json.description };
        setDisplayData(newData);
        speak(json.description);
      }
    } catch (e) {
      addLog(`翻訳エラー: ${e.message}`);
    } finally {
      setStatusMessage("");
    }
  };

  // 表示・翻訳判定ロジック
  useEffect(() => {
    if (!selectedLocation) {
      setDisplayData(null);
      window.speechSynthesis.cancel();
      setIsPlaying(false);
      return;
    }

    const suffix = currentLang === 'ja' ? '_ja' : `_${currentLang}`;
    let displayName = selectedLocation[`name${suffix}`];
    let displayDesc = selectedLocation[`description${suffix}`];

    // フォールバック
    if (!displayName) displayName = selectedLocation.name;
    if (!displayDesc) displayDesc = selectedLocation.description;

    // ★修正: 翻訳判定ロジック (より厳密に)
    const isJapaneseMode = currentLang === 'ja';
    
    // 日本語が含まれているかチェック (ひらがなカタカナ漢字)
    const hasJapaneseChars = displayName && /[ぁ-んァ-ン一-龯]/.test(displayName);
    
    // 説明文が手抜き、または英語のままかチェック
    const isWeakDesc = !displayDesc || displayDesc.length < 10 || displayDesc.includes("World Heritage") || displayDesc === "世界遺産";
    
    // 日本語モードなのに「日本語文字がない」または「説明が弱い」なら翻訳
    const needsTranslation = isJapaneseMode && (!hasJapaneseChars || isWeakDesc);

    if (needsTranslation) {
      addLog(`翻訳が必要と判定: ${displayName}`);
      const tempData = { ...selectedLocation, name: displayName, description: "翻訳中..." };
      setDisplayData(tempData);
      translateAndFix(selectedLocation, currentLang);
    } else {
      const newData = { ...selectedLocation, name: displayName, description: displayDesc };
      setDisplayData(newData);
      window.speechSynthesis.cancel();
      speak(newData.description);
    }
  }, [selectedLocation, currentLang]);

  const speak = (text) => {
    if (!text || text === "翻訳中...") { setIsPlaying(false); return; }
    const utterance = new SpeechSynthesisUtterance(text);
    utterance.lang = { ja: 'ja-JP', en: 'en-US', zh: 'zh-CN', es: 'es-ES', fr: 'fr-FR' }[currentLang];
    utterance.volume = voiceVolume;
    utterance.onstart = () => setIsPlaying(true);
    utterance.onend = () => setIsPlaying(false);
    window.speechSynthesis.speak(utterance);
  };

  const handleGenerate = async () => {
    if (!inputTheme) return;
    setIsGenerating(true);
    setStatusMessage("AIが生成中...");
    try {
      const genAI = new GoogleGenerativeAI(GEMINI_API_KEY);
      const model = genAI.getGenerativeModel({ model: "gemini-1.5-flash" });
      const prompt = `歴史ガイドとして「${inputTheme}」のスポットを3つ選んで。言語: ${LANGUAGES[currentLang].label}。出力(JSON): [{"name":"名称 #タグ","lat":0,"lon":0,"description":"解説"}]`;
      const result = await model.generateContent(prompt);
      const text = result.response.text().replace(/```json/g, "").replace(/```/g, "").trim();
      let newSpots = JSON.parse(text.match(/\[[\s\S]*\]/)[0]);
      
      const insertData = newSpots.map(s => {
        const spot = { ...s };
        // 生成時はとりあえず name_ja にも入れておく
        spot['name_ja'] = s.name;
        spot['description_ja'] = s.description;
        return spot;
      });

      await supabase.from('spots').insert(insertData);
      fetchSpots();
      if (newSpots.length > 0) mapRef.current?.flyTo({ center: [newSpots[0].lon, newSpots[0].lat], zoom: 4 });
      setInputTheme(""); alert(`${newSpots.length}件追加！`);
    } catch (e) { 
      addLog(`生成エラー: ${e.message}`); 
      alert(e.message); 
    } finally { 
      setIsGenerating(false); setStatusMessage(""); 
    }
  };

  const geoJsonData = useMemo(() => ({
    type: 'FeatureCollection',
    features: locations.map(loc => ({ type: 'Feature', geometry: { type: 'Point', coordinates: [loc.lon, loc.lat] }, properties: { ...loc } }))
  }), [locations]);

  // マップ移動終了時
  const handleMoveEnd = useCallback((evt) => {
    if (!evt.originalEvent || isGeneratingRef.current) return;
    const map = mapRef.current?.getMap();
    if (!map) return;
    const center = map.getCenter();
    const point = map.project(center);
    const features = map.queryRenderedFeatures([[point.x - 20, point.y - 20], [point.x + 20, point.y + 20]], { layers: ['point-core'] });
    
    if (features.length > 0) {
      const bestTarget = features[0].properties;
      const fullLocation = locationsRef.current.find(l => l.id === bestTarget.id) || bestTarget;
      
      // Refを使って比較（再レンダリング防止）
      if (!selectedLocationRef.current || fullLocation.id !== selectedLocationRef.current.id) {
        setSelectedLocation(fullLocation);
        map.flyTo({ center: [fullLocation.lon, fullLocation.lat], speed: 0.6, curve: 1 });
      }
    } else {
       if (selectedLocationRef.current) setSelectedLocation(null);
    }
  }, []);

  const renderNameWithTags = (fullName) => {
    if (!fullName) return null;
    const parts = fullName.split('#');
    const name = parts[0].trim();
    const tags = parts.slice(1).map(t => t.trim());
    return (<div style={{ display: 'flex', flexDirection: 'column', alignItems: 'center', gap: '5px' }}><span style={{ fontSize: '1.2rem', fontWeight: 'bold' }}>{name}</span><div style={{ display: 'flex', gap: '5px' }}>{tags.map((tag, i) => (<span key={i} style={{ fontSize: '0.7rem', padding: '2px 8px', borderRadius: '10px', backgroundColor: '#00ffcc', color: '#000', fontWeight: 'bold' }}>#{tag}</span>))}</div></div>);
  };

  // BGM制御
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

  return (
    <div style={{ width: "100vw", height: "100dvh", background: "black", fontFamily: 'sans-serif', position: 'relative', overflow: 'hidden' }}>
      <audio ref={audioRef} src="/bgm.mp3" loop />
      
      {/* デバッグコンソール（画面左下） */}
      <div style={{ 
        position: 'absolute', bottom: '10px', left: '10px', zIndex: 100, 
        background: 'rgba(0,0,0,0.7)', color: '#00ff00', fontSize: '10px', 
        padding: '5px', borderRadius: '5px', maxWidth: '300px', pointerEvents: 'none'
      }}>
        {logs.map((log, i) => <div key={i}>{log}</div>)}
      </div>

      {showAuthModal && <AuthModal onClose={() => setShowAuthModal(false)} onLoginSuccess={setupUser} />}
      {showFavList && user && <FavoritesModal userId={user.id} onClose={() => setShowFavList(false)} onSelect={handleSelectFromList} />}

      <div style={{ position: 'absolute', top: '20px', left: '20px', zIndex: 20, display: 'flex', gap: '8px', background: 'rgba(0,0,0,0.6)', padding: '10px', borderRadius: '12px', backdropFilter: 'blur(5px)', border: '1px solid rgba(255,255,255,0.1)', alignItems: 'center' }}>
        <select value={currentLang} onChange={(e) => setCurrentLang(e.target.value)} style={{ appearance: 'none', background: 'transparent', color: 'white', border: 'none', fontSize: '1.2rem', fontWeight: 'bold', cursor: 'pointer', paddingRight: '15px', outline: 'none' }}>{Object.keys(LANGUAGES).map(key => <option key={key} value={key} style={{ color: 'black' }}>{LANGUAGES[key].label}</option>)}</select>
        <div style={{ width: '1px', height: '20px', background: 'rgba(255,255,255,0.3)' }}></div>
        <input type="text" value={inputTheme} onChange={e => setInputTheme(e.target.value)} placeholder={LANGUAGES[currentLang].placeholder} style={{ background: 'transparent', border: 'none', color: 'white', outline: 'none', padding: '5px', width: '120px', fontSize: '0.9rem' }} onKeyDown={e => e.key === 'Enter' && handleGenerate()} />
        <button onClick={handleGenerate} disabled={isGenerating} style={{ background: isGenerating ? '#555' : '#00ffcc', color: 'black', border: 'none', borderRadius: '4px', padding: '5px 12px', cursor: 'pointer', fontWeight: 'bold', fontSize: '0.9rem' }}>Go</button>
        <button onClick={() => setIsSettingsOpen(!isSettingsOpen)} style={{ background: 'transparent', color: 'white', border: 'none', cursor: 'pointer', fontSize: '1.2rem', padding: '0 5px' }}>⚙️</button>
      </div>

      <div style={{ position: 'absolute', top: '20px', right: '20px', zIndex: 20, display: 'flex', alignItems: 'center', gap: '10px' }}>
        {profile && (<div style={{ color: 'white', fontSize: '0.9rem', background: 'rgba(0,0,0,0.6)', padding: '5px 10px', borderRadius: '8px', border: isPremium ? '1px solid #FFD700' : '1px solid #444' }}><span style={{ fontWeight: 'bold' }}>{profile.username}</span><span style={{ color: '#888', marginLeft: '5px' }}>#{profile.discriminator}</span>{isPremium && <span style={{ marginLeft: '5px', color: '#FFD700' }}>★</span>}</div>)}
        {user && (<button onClick={() => setShowFavList(true)} style={{ background: 'rgba(0,0,0,0.6)', border: '1px solid #ff3366', color: '#ff3366', borderRadius: '50%', width: '40px', height: '40px', cursor: 'pointer', fontSize: '1.2rem', backdropFilter: 'blur(5px)', display: 'flex', alignItems: 'center', justifyContent: 'center' }}>♥</button>)}
        <button onClick={() => { if (user) { if (window.confirm('ログアウトしますか？')) { supabase.auth.signOut(); clearUser(); } } else { setShowAuthModal(true); } }} style={{ background: 'rgba(0,0,0,0.6)', border: '1px solid rgba(255,255,255,0.2)', color: user ? '#00ffcc' : 'white', borderRadius: '50%', width: '40px', height: '40px', cursor: 'pointer', fontSize: '1.2rem', backdropFilter: 'blur(5px)', display: 'flex', alignItems: 'center', justifyContent: 'center' }}>{user ? '👤' : '🔑'}</button>
      </div>

      {isSettingsOpen && (
        <div style={{ position: 'absolute', top: '70px', left: '20px', zIndex: 20, background: 'rgba(20,20,20,0.9)', padding: '15px', borderRadius: '12px', border: '1px solid rgba(255,255,255,0.2)', color: 'white', minWidth: '200px', backdropFilter: 'blur(10px)' }}>
          <div style={{ marginBottom: '10px', fontWeight: 'bold', color: '#00ffcc' }}>Settings</div>
          <div style={{ display: 'flex', justifyContent: 'space-between', marginBottom: '10px' }}><span>BGM</span><button onClick={() => setIsBgmOn(!isBgmOn)} style={{ background: isBgmOn ? '#ffaa00' : '#555', color: 'white', border: 'none', borderRadius: '4px', padding: '2px 8px', fontSize: '0.8rem', cursor: 'pointer' }}>{isBgmOn ? 'ON' : 'OFF'}</button></div>
          <input type="range" min="0" max="1" step="0.1" value={bgmVolume} onChange={e => setBgmVolume(parseFloat(e.target.value))} style={{ width: '100%', marginBottom: '15px', cursor: 'pointer' }} /><div style={{ marginBottom: '5px' }}>Voice Vol</div><input type="range" min="0" max="1" step="0.1" value={voiceVolume} onChange={e => setVoiceVolume(parseFloat(e.target.value))} style={{ width: '100%', cursor: 'pointer' }} />
        </div>
      )}

      {statusMessage && <div style={{ position: 'absolute', top: '80px', left: '20px', zIndex: 20, color: '#00ffcc', textShadow: '0 0 5px black' }}>{statusMessage}</div>}

      <div style={{ position: 'absolute', top: '50%', left: '50%', transform: 'translate(-50%, -50%)', width: '50px', height: '50px', borderRadius: '50%', zIndex: 10, pointerEvents: 'none', border: selectedLocation ? '2px solid #fff' : '2px solid rgba(255, 180, 150, 0.5)', boxShadow: selectedLocation ? '0 0 20px #fff' : '0 0 10px rgba(255, 100, 100, 0.3)', transition: 'all 0.3s' }} />

      {displayData && (
        <div style={{ position: 'absolute', bottom: '15%', left: '50%', transform: 'translateX(-50%)', background: 'rgba(10, 10, 10, 0.85)', padding: '20px', borderRadius: '20px', color: 'white', textAlign: 'center', backdropFilter: 'blur(10px)', border: '1px solid rgba(255, 255, 255, 0.2)', zIndex: 10, minWidth: '300px', maxWidth: '80%', boxShadow: '0 4px 30px rgba(0,0,0,0.5)', animation: 'fadeIn 0.5s' }}>
          <div style={{ position: 'absolute', top: '-20px', right: '20px' }}><button onClick={toggleFavorite} style={{ background: favorites.has(selectedLocation.id) ? '#ff3366' : '#333', color: 'white', border: '2px solid white', borderRadius: '50%', width: '40px', height: '40px', cursor: 'pointer', fontSize: '1.2rem', boxShadow: '0 4px 10px rgba(0,0,0,0.5)', transition: 'all 0.2s' }}>{favorites.has(selectedLocation.id) ? '♥' : '♡'}</button></div>
          <div style={{ marginBottom: '10px', fontSize: '12px', color: isPlaying ? '#00ffcc' : '#888' }}>{isPlaying ? <><span className="pulse">●</span> ON AIR</> : <span>● READY</span>}</div>
          <div style={{ color: '#ffccaa', marginBottom: '10px' }}>{renderNameWithTags(displayData.name)}</div>
          <p style={{ margin: 0, fontSize: '0.85rem', color: '#ddd', maxHeight: '150px', overflowY: 'auto', textAlign: 'left', lineHeight: '1.6' }}>{displayData.description}</p>
        </div>
      )}

      {/* Mapコンポーネント */}
      <MemoizedMap 
        mapRef={mapRef}
        mapboxAccessToken={MAPBOX_TOKEN}
        initialViewState={initialViewState}
        onMoveEnd={handleMoveEnd}
        geoJsonData={geoJsonData}
        addLog={addLog} // ログ関数を渡す
      />
      <style>{`@keyframes fadeIn { from { opacity: 0; transform: translateX(-50%) translateY(10px); } to { opacity: 1; transform: translateX(-50%) translateY(0); } } .pulse { animation: pulse 1s infinite; } @keyframes pulse { 0% { opacity: 1; } 50% { opacity: 0.3; } 100% { opacity: 1; } }`}</style>
    </div>
  );
};

// ErrorBoundaryでラップ
export default function GlobeWrapper() {
  return (
    <ErrorBoundary>
      <GlobeContent />
    </ErrorBoundary>
  );
}