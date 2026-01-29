import React, { useRef, useState, useMemo, useEffect, useCallback } from 'react';
import Map, { Source, Layer } from 'react-map-gl';
import { supabase } from '../supabaseClient';
import { GoogleGenerativeAI } from "@google/generative-ai";
import AuthModal from './AuthModal';
import FavoritesModal from './FavoritesModal';
import { isVipUser } from '../vipList';

const MAPBOX_TOKEN = import.meta.env.VITE_MAPBOX_TOKEN;
const GEMINI_API_KEY = import.meta.env.VITE_GEMINI_API_KEY;

const LANGUAGES = {
  ja: { code: 'ja', label: '🇯🇵 日本語', placeholder: '例: 日本の城...' },
  en: { code: 'en', label: '🇺🇸 English', placeholder: 'Ex: Castles in Japan...' },
  zh: { code: 'zh', label: '🇨🇳 中文', placeholder: '例如：日本的城堡...' },
  es: { code: 'es', label: '🇪🇸 Español', placeholder: 'Ej: Castillos de Japón...' },
  fr: { code: 'fr', label: '🇫🇷 Français', placeholder: 'Ex: Châteaux du Japon...' },
};

// ★地図のブラックアウト対策（メモ化）
const MemoizedMap = React.memo(({ mapRef, mapboxAccessToken, initialViewState, onMoveEnd, geoJsonData }) => {
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
      reuseMaps={true}
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

const Globe = () => {
  const mapRef = useRef(null);
  const audioRef = useRef(null);
  
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

  const [user, setUser] = useState(null);
  const [profile, setProfile] = useState(null);
  const [isPremium, setIsPremium] = useState(false);
  
  const [showAuthModal, setShowAuthModal] = useState(false);
  const [showFavList, setShowFavList] = useState(false);
  const [favorites, setFavorites] = useState(new Set());

  const initialViewState = { longitude: 13.4, latitude: 41.9, zoom: 3 };

  // データ取得
  const fetchSpots = async () => {
    const { data, error } = await supabase.from('spots').select('*');
    if (!error && data) setLocations(data);
  };

  useEffect(() => {
    fetchSpots();
    supabase.auth.getSession().then(({ data: { session } }) => {
      if (session?.user) {
        setUser(session.user);
        fetchFavorites(session.user.id);
        fetchProfile(session.user.id, session.user.email);
      }
    });
    const { data: { subscription } } = supabase.auth.onAuthStateChange((_event, session) => {
      if (session?.user) {
        setUser(session.user);
        fetchFavorites(session.user.id);
        fetchProfile(session.user.id, session.user.email);
      } else {
        setUser(null); setProfile(null); setIsPremium(false); setFavorites(new Set());
      }
    });
    return () => subscription.unsubscribe();
  }, []);

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
    if (data) {
      setFavorites(new Set(data.map(f => f.spot_id)));
    }
  };

  const toggleFavorite = async () => {
    if (!user) { setShowAuthModal(true); return; }
    if (!selectedLocation) return;
    const spotId = selectedLocation.id;
    const isFav = favorites.has(spotId);
    if (isFav) {
      const { error } = await supabase.from('favorites').delete().eq('user_id', user.id).eq('spot_id', spotId);
      if (!error) { const newFavs = new Set(favorites); newFavs.delete(spotId); setFavorites(newFavs); }
    } else {
      const { error } = await supabase.from('favorites').insert({ user_id: user.id, spot_id: spotId });
      if (!error) { const newFavs = new Set(favorites); newFavs.add(spotId); setFavorites(newFavs); }
    }
  };

  const handleSelectFromList = (spot) => {
    setShowFavList(false);
    setSelectedLocation(spot);
    mapRef.current?.flyTo({ center: [spot.lon, spot.lat], zoom: 6, speed: 1.2, curve: 1 });
  };

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

  // ★強力な自動翻訳・修復機能
  const translateAndFix = async (spot, lang) => {
    // 既に生成中なら重複させない
    if (statusMessage === "翻訳データを生成中...") return;

    // 一時的にステータス表示
    setStatusMessage(`翻訳中: ${spot.name}...`);
    
    try {
      const genAI = new GoogleGenerativeAI(GEMINI_API_KEY);
      const model = genAI.getGenerativeModel({ model: "gemini-1.5-flash" }); 
      
      // プロンプト: 「世界遺産」みたいな手抜き説明文も、ちゃんと書き直させる
      const prompt = `
        You are a travel guide. 
        Translate/Rewrite the location info into ${LANGUAGES[lang].name}.
        Target: "${spot.name}" (Description: "${spot.description}")
        
        Rules:
        1. If the description is too short or just "World Heritage", generate a proper 100-character explanation.
        2. Output JSON only: { "name": "Name #Tag", "description": "Explanation..." }
      `;

      const result = await model.generateContent(prompt);
      const text = result.response.text().replace(/```json/g, "").replace(/```/g, "").trim();
      const json = JSON.parse(text);

      // 保存するカラム名
      const nameCol = lang === 'ja' ? 'name_ja' : `name_${lang}`;
      const descCol = lang === 'ja' ? 'description_ja' : `description_${lang}`;
      
      const updateData = {
        [nameCol]: json.name,
        [descCol]: json.description
      };

      // 1. DB更新 (全ユーザーのために保存)
      await supabase.from('spots').update(updateData).eq('id', spot.id);
      
      // 2. ローカルデータ更新 (リロードなしで反映)
      setLocations(prev => prev.map(l => l.id === spot.id ? { ...l, ...updateData } : l));
      
      // 3. 現在の表示を即座に更新して読み上げ
      if (selectedLocation && selectedLocation.id === spot.id) {
        const newData = { ...spot, ...updateData, name: json.name, description: json.description };
        setDisplayData(newData);
        setStatusMessage(""); // メッセージ消去
        speak(json.description);
      }

    } catch (e) {
      console.error("Auto-translation failed:", e);
      setStatusMessage("");
    }
  };

  // 選択時のロジック (ここを厳しくした)
  useEffect(() => {
    if (!selectedLocation) {
      setDisplayData(null);
      window.speechSynthesis.cancel();
      setIsPlaying(false);
      return;
    }

    // 1. まずは持っているデータを表示しようとする
    const suffix = currentLang === 'ja' ? '_ja' : `_${currentLang}`;
    // 日本語の場合は name_ja を見る。無ければ name を見る
    let displayName = selectedLocation[`name${suffix}`];
    let displayDesc = selectedLocation[`description${suffix}`];

    // フォールバック: もし専用カラムが空なら、デフォルト(英語など)を表示しておく
    if (!displayName) displayName = selectedLocation.name;
    if (!displayDesc) displayDesc = selectedLocation.description;

    // 2. 「これ翻訳必要じゃね？」判定
    // 条件: 
    // - 日本語モードなのに、名前に日本語(ひらがな/カタカナ/漢字)が含まれていない
    // - または、説明文が「世界遺産」だけ、もしくは極端に短い(15文字以下)
    const isJapaneseMode = currentLang === 'ja';
    const hasJapaneseChars = displayName && displayName.match(/[ぁ-んァ-ン一-龯]/);
    const isWeakDescription = !displayDesc || displayDesc.length < 15 || displayDesc.includes("世界遺産") || displayDesc.includes("World Heritage");

    const needsFix = isJapaneseMode && (!hasJapaneseChars || isWeakDescription);

    if (needsFix) {
      // ★翻訳が必要な場合
      // まずは今の状態(英語など)を表示
      const tempData = { ...selectedLocation, name: displayName, description: displayDesc };
      setDisplayData(tempData);
      
      // 裏で翻訳を実行！
      translateAndFix(selectedLocation, currentLang);
    } else {
      // ★完璧なデータがある場合
      const newData = { ...selectedLocation, name: displayName, description: displayDesc };
      setDisplayData(newData);
      window.speechSynthesis.cancel();
      speak(newData.description);
    }
  }, [selectedLocation, currentLang]); // selectedLocationが変わるたびにチェック

  const speak = (text) => {
    if (!text) { setIsPlaying(false); return; }
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
        // 生成時はとりあえず name_ja 等にも入れておく
        const suffix = currentLang === 'ja' ? '_ja' : `_${currentLang}`;
        if (currentLang !== 'ja') {
           spot[`name${suffix}`] = s.name;
           spot[`description${suffix}`] = s.description;
        } else {
           spot['name_ja'] = s.name;
           spot['description_ja'] = s.description;
        }
        return spot;
      });

      await supabase.from('spots').insert(insertData);
      fetchSpots();
      if (newSpots.length > 0) mapRef.current?.flyTo({ center: [newSpots[0].lon, newSpots[0].lat], zoom: 4 });
      setInputTheme(""); alert(`${newSpots.length}件追加！`);
    } catch (e) { alert(`Error: ${e.message}`); } finally { setIsGenerating(false); setStatusMessage(""); }
  };

  const geoJsonData = useMemo(() => ({
    type: 'FeatureCollection',
    features: locations.map(loc => ({ type: 'Feature', geometry: { type: 'Point', coordinates: [loc.lon, loc.lat] }, properties: { ...loc } }))
  }), [locations]);

  // 地図移動時の処理（ブラックアウト対策済み）
  const handleMoveEnd = useCallback((evt) => {
    if (!evt.originalEvent || isGenerating) return;
    const map = mapRef.current?.getMap();
    if (!map) return;
    const center = map.getCenter();
    const point = map.project(center);
    const features = map.queryRenderedFeatures([[point.x - 20, point.y - 20], [point.x + 20, point.y + 20]], { layers: ['point-core'] });
    if (features.length > 0) {
      const bestTarget = features[0].properties;
      const fullLocation = locations.find(l => l.id === bestTarget.id) || bestTarget;
      if (!selectedLocation || fullLocation.id !== selectedLocation.id) {
        setSelectedLocation(fullLocation);
        map.flyTo({ center: [fullLocation.lon, fullLocation.lat], speed: 0.6, curve: 1 });
      }
    } else { setSelectedLocation(null); }
  }, [locations, isGenerating, selectedLocation]);

  const renderNameWithTags = (fullName) => {
    if (!fullName) return null;
    const parts = fullName.split('#');
    const name = parts[0].trim();
    const tags = parts.slice(1).map(t => t.trim());
    return (<div style={{ display: 'flex', flexDirection: 'column', alignItems: 'center', gap: '5px' }}><span style={{ fontSize: '1.2rem', fontWeight: 'bold' }}>{name}</span><div style={{ display: 'flex', gap: '5px' }}>{tags.map((tag, i) => (<span key={i} style={{ fontSize: '0.7rem', padding: '2px 8px', borderRadius: '10px', backgroundColor: '#00ffcc', color: '#000', fontWeight: 'bold' }}>#{tag}</span>))}</div></div>);
  };

  return (
    <div style={{ width: "100vw", height: "100dvh", background: "black", fontFamily: 'sans-serif', position: 'relative', overflow: 'hidden' }}>
      <audio ref={audioRef} src="/bgm.mp3" loop />
      
      {showAuthModal && <AuthModal onClose={() => setShowAuthModal(false)} onLoginSuccess={(u) => { setUser(u); fetchProfile(u.id, u.email); }} />}
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
        <button onClick={() => { if (user) { if (window.confirm('ログアウトしますか？')) { supabase.auth.signOut(); setUser(null); setProfile(null); } } else { setShowAuthModal(true); } }} style={{ background: 'rgba(0,0,0,0.6)', border: '1px solid rgba(255,255,255,0.2)', color: user ? '#00ffcc' : 'white', borderRadius: '50%', width: '40px', height: '40px', cursor: 'pointer', fontSize: '1.2rem', backdropFilter: 'blur(5px)', display: 'flex', alignItems: 'center', justifyContent: 'center' }}>{user ? '👤' : '🔑'}</button>
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

      {/* ★メモ化されたMapコンポーネント */}
      <MemoizedMap 
        mapRef={mapRef}
        mapboxAccessToken={MAPBOX_TOKEN}
        initialViewState={initialViewState}
        onMoveEnd={handleMoveEnd}
        geoJsonData={geoJsonData}
      />
      
      <style>{`@keyframes fadeIn { from { opacity: 0; transform: translateX(-50%) translateY(10px); } to { opacity: 1; transform: translateX(-50%) translateY(0); } } .pulse { animation: pulse 1s infinite; } @keyframes pulse { 0% { opacity: 1; } 50% { opacity: 0.3; } 100% { opacity: 1; } }`}</style>
    </div>
  );
};

export default Globe;