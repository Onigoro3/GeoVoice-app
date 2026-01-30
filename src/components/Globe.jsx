import React, { useRef, useState, useMemo, useEffect, useCallback } from 'react';
import Map, { Source, Layer } from 'react-map-gl';
import { supabase } from '../supabaseClient';
import { GoogleGenerativeAI } from "@google/generative-ai";
import AuthModal from './AuthModal';
import FavoritesModal from './FavoritesModal';
import ErrorBoundary from './ErrorBoundary';
import { isVipUser } from '../vipList';

const MAPBOX_TOKEN = import.meta.env.VITE_MAPBOX_TOKEN;
const GEMINI_API_KEY = import.meta.env.VITE_GEMINI_API_KEY;

const LANGUAGES = {
  ja: { code: 'ja', name: 'Japanese', label: '🇯🇵', placeholder: '場所を検索...' },
  en: { code: 'en', name: 'English', label: '🇺🇸', placeholder: 'Search...' },
  zh: { code: 'zh', name: 'Chinese', label: '🇨🇳', placeholder: '搜索...' },
  es: { code: 'es', name: 'Spanish', label: '🇪🇸', placeholder: 'Buscar...' },
  fr: { code: 'fr', name: 'French', label: '🇫🇷', placeholder: 'Rechercher...' },
};

const PREMIUM_CATEGORIES = ['modern', 'science', 'art'];

// マップコンポーネント
const MemoizedMap = React.memo(({ mapRef, mapboxAccessToken, initialViewState, onMoveEnd, geoJsonData, onError, padding }) => {
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
      onError={onError}
      dragRotate={true}
      touchZoomRotate={true}
      padding={padding}
    >
      <Source id="mapbox-dem" type="raster-dem" url="mapbox://mapbox.mapbox-terrain-dem-v1" tileSize={512} maxzoom={14} />
      {geoJsonData && (
        <Source id="my-locations" type="geojson" data={geoJsonData}>
          <Layer 
            id="point-glow" 
            type="circle" 
            paint={{ 
              'circle-radius': 18,
              'circle-color': [
                'match', ['get', 'category'],
                'nature', '#00ff7f',
                'history', '#ffcc00',
                'modern', '#00ffff',
                'science', '#d800ff',
                'art', '#ff0055',
                '#ffcc00'
              ],
              'circle-opacity': 0.7, 
              'circle-blur': 0.6 
            }} 
          />
          <Layer id="point-core" type="circle" paint={{ 'circle-radius': 6, 'circle-color': '#fff', 'circle-opacity': 1 }} />
        </Source>
      )}
    </Map>
  );
}, (prev, next) => prev.geoJsonData === next.geoJsonData && prev.padding === next.padding);

const GlobeContent = () => {
  const mapRef = useRef(null);
  const audioRef = useRef(null);
  const locationsRef = useRef([]);
  const selectedLocationRef = useRef(null);
  const isGeneratingRef = useRef(false);
  const isRideModeRef = useRef(false);
  const rideTimeoutRef = useRef(null);
  const visibleCategoriesRef = useRef(null);

  const [locations, setLocations] = useState([]);
  const [selectedLocation, setSelectedLocation] = useState(null);
  const [displayData, setDisplayData] = useState(null);
  const [isPlaying, setIsPlaying] = useState(false);
  const [isRideMode, setIsRideMode] = useState(false);
  
  const [currentLang, setCurrentLang] = useState('ja');
  const [inputTheme, setInputTheme] = useState("");
  const [isGenerating, setIsGenerating] = useState(false);
  const [statusMessage, setStatusMessage] = useState("");
  const [logs, setLogs] = useState([]);

  const [user, setUser] = useState(null);
  const [profile, setProfile] = useState(null);
  const [isPremium, setIsPremium] = useState(false);
  const [showAuthModal, setShowAuthModal] = useState(false);
  const [showFavList, setShowFavList] = useState(false);
  const [favorites, setFavorites] = useState(new Set());

  const [visibleCategories, setVisibleCategories] = useState({
    history: true, nature: true, modern: true, science: true, art: true
  });

  const [isSettingsOpen, setIsSettingsOpen] = useState(false);
  const [bgmVolume, setBgmVolume] = useState(0.5);
  const [voiceVolume, setVoiceVolume] = useState(1.0);
  const [isBgmOn, setIsBgmOn] = useState(false);

  const [isPc, setIsPc] = useState(window.innerWidth > 768);
  const [popupPos, setPopupPos] = useState({ x: 20, y: 100 });
  const [isDragging, setIsDragging] = useState(false);
  const [dragOffset, setDragOffset] = useState({ x: 0, y: 0 });

  // ★モバイル用タブ管理
  const [activeTab, setActiveTab] = useState('map'); // map, ride, discover, fav, settings
  const [showDiscoverMenu, setShowDiscoverMenu] = useState(false);

  const initialViewState = { longitude: 13.4, latitude: 41.9, zoom: 3 };

  useEffect(() => {
    const handleResize = () => setIsPc(window.innerWidth > 768);
    window.addEventListener('resize', handleResize);
    return () => window.removeEventListener('resize', handleResize);
  }, []);

  // --- マウス操作系 ---
  const handleMouseDown = (e) => {
    if (!isPc) return;
    if (e.target.tagName === 'BUTTON' || e.target.tagName === 'INPUT' || e.target.tagName === 'SELECT') return;
    setIsDragging(true);
    setDragOffset({ x: e.clientX - popupPos.x, y: e.clientY - popupPos.y });
  };
  const handleMouseMove = useCallback((e) => {
    if (isDragging) { e.preventDefault(); setPopupPos({ x: e.clientX - dragOffset.x, y: e.clientY - dragOffset.y }); }
  }, [isDragging, dragOffset]);
  const handleMouseUp = () => setIsDragging(false);
  useEffect(() => {
    if (isDragging) { window.addEventListener('mousemove', handleMouseMove); window.addEventListener('mouseup', handleMouseUp); }
    else { window.removeEventListener('mousemove', handleMouseMove); window.removeEventListener('mouseup', handleMouseUp); }
    return () => { window.removeEventListener('mousemove', handleMouseMove); window.removeEventListener('mouseup', handleMouseUp); };
  }, [isDragging, handleMouseMove]);

  const addLog = (msg) => { console.log(msg); setLogs(prev => [`[${new Date().toLocaleTimeString()}] ${msg}`, ...prev].slice(0, 5)); };

  useEffect(() => { locationsRef.current = locations; }, [locations]);
  useEffect(() => { selectedLocationRef.current = selectedLocation; }, [selectedLocation]);
  useEffect(() => { isGeneratingRef.current = isGenerating; }, [isGenerating]);
  useEffect(() => { visibleCategoriesRef.current = visibleCategories; }, [visibleCategories]);

  // ライドモード制御
  useEffect(() => {
    isRideModeRef.current = isRideMode;
    if (isRideMode) {
      addLog("✈️ フライトライド開始");
      nextRideStep();
    } else {
      addLog("🛑 フライトライド停止");
      window.speechSynthesis.cancel();
      setIsPlaying(false);
      if (rideTimeoutRef.current) clearTimeout(rideTimeoutRef.current);
    }
  }, [isRideMode]);

  // データ取得
  const fetchSpots = async () => {
    try {
      const { data, error } = await supabase.from('spots').select('*');
      if (error) throw error;
      if (data) {
        const formattedData = data.map(d => ({ ...d, category: d.category || 'history' }));
        setLocations(formattedData);
        addLog(`Loaded ${data.length} spots`);
      }
    } catch (e) { addLog(`Fetch Error: ${e.message}`); }
  };

  useEffect(() => {
    fetchSpots();
    supabase.auth.getSession().then(({ data: { session } }) => { if (session?.user) setupUser(session.user); });
    const { data: { subscription } } = supabase.auth.onAuthStateChange((_event, session) => {
      if (session?.user) setupUser(session.user); else clearUser();
    });
    return () => subscription.unsubscribe();
  }, []);

  const setupUser = (u) => { setUser(u); fetchFavorites(u.id); fetchProfile(u.id, u.email); addLog(`Login: ${u.email}`); };
  const clearUser = () => { setUser(null); setProfile(null); setIsPremium(false); setFavorites(new Set()); };
  const fetchProfile = async (userId, email) => {
    const isVip = isVipUser(email);
    const { data } = await supabase.from('profiles').select('*').eq('id', userId).single();
    if (data) { setProfile(data); setIsPremium(isVip || data.is_premium); } else { setIsPremium(isVip); }
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
      } else {
        await supabase.from('favorites').insert({ user_id: user.id, spot_id: spotId });
        const newFavs = new Set(favorites); newFavs.add(spotId); setFavorites(newFavs);
      }
    } catch(e) { addLog(`Fav Error: ${e.message}`); }
  };

  const handleSelectFromList = (spot) => {
    setShowFavList(false);
    setSelectedLocation(spot);
    mapRef.current?.flyTo({ center: [spot.lon, spot.lat], zoom: 6, speed: 1.2, curve: 1 });
  };

  const fetchAndSaveImage = async (spot) => {
    const searchName = (spot.name_en || spot.name).split('#')[0].trim();
    try {
      const url = `https://en.wikipedia.org/w/api.php?action=query&titles=${encodeURIComponent(searchName)}&prop=pageimages&format=json&pithumbsize=600&origin=*`;
      const res = await fetch(url);
      const json = await res.json();
      const pages = json.query?.pages;
      let imageUrl = null;
      if (pages) {
        const pageId = Object.keys(pages)[0];
        if (pageId !== "-1" && pages[pageId].thumbnail) imageUrl = pages[pageId].thumbnail.source;
      }
      if (imageUrl) {
        await supabase.from('spots').update({ image_url: imageUrl }).eq('id', spot.id);
        const updated = locationsRef.current.map(l => l.id === spot.id ? { ...l, image_url: imageUrl } : l);
        setLocations(updated);
        locationsRef.current = updated;
        if (selectedLocationRef.current?.id === spot.id) setDisplayData(prev => ({ ...prev, image_url: imageUrl }));
      }
    } catch (e) { console.error("Image fetch failed", e); }
  };

  const translateAndFix = async (spot, lang) => {
    if (statusMessage.includes("生成中")) return;
    setStatusMessage("翻訳中...");
    try {
      const genAI = new GoogleGenerativeAI(GEMINI_API_KEY);
      const model = genAI.getGenerativeModel({ model: "gemini-2.0-flash" }); 
      const prompt = `Translate/Rewrite into ${LANGUAGES[lang].name}. Target: "${spot.name}" Desc: "${spot.description}" Output JSON only: { "name": "Name", "description": "Desc (max 150 chars)" }`;
      const result = await model.generateContent(prompt);
      const text = result.response.text().replace(/```json/g, "").replace(/```/g, "").trim();
      const json = JSON.parse(text);
      const updateData = { [`name_${lang}`]: json.name, [`description_${lang}`]: json.description };
      await supabase.from('spots').update(updateData).eq('id', spot.id);
      const updatedLocations = locations.map(l => l.id === spot.id ? { ...l, ...updateData } : l);
      setLocations(updatedLocations);
      locationsRef.current = updatedLocations;
      if (selectedLocationRef.current && selectedLocationRef.current.id === spot.id) {
        const newData = { ...spot, ...updateData, name: json.name, description: json.description };
        setDisplayData(newData);
        if (!isRideModeRef.current) speak(json.description);
      }
    } catch (e) { addLog(`翻訳失敗: ${e.message}`); } finally { setStatusMessage(""); }
  };

  useEffect(() => {
    if (!selectedLocation) {
      setDisplayData(null);
      window.speechSynthesis.cancel();
      setIsPlaying(false);
      return;
    }
    const suffix = currentLang === 'ja' ? '_ja' : `_${currentLang}`;
    let displayName = selectedLocation[`name${suffix}`] || selectedLocation.name;
    let displayDesc = selectedLocation[`description${suffix}`] || selectedLocation.description;
    const isJapaneseMode = currentLang === 'ja';
    const hasJapaneseChars = displayName && /[ぁ-んァ-ン一-龯]/.test(displayName);
    const isWeakDesc = !displayDesc || displayDesc.length < 10 || displayDesc.includes("World Heritage") || displayDesc === "世界遺産";
    if (!selectedLocation.image_url) fetchAndSaveImage(selectedLocation);
    const newData = { ...selectedLocation, name: displayName, description: displayDesc, needsTranslation: isJapaneseMode && (!hasJapaneseChars || isWeakDesc) };
    setDisplayData(newData);
    if (!newData.needsTranslation) {
      window.speechSynthesis.cancel();
      speak(newData.description);
    }
  }, [selectedLocation, currentLang]);

  const speak = (text) => {
    if (!text) { setIsPlaying(false); return; }
    const utterance = new SpeechSynthesisUtterance(text);
    utterance.lang = { ja: 'ja-JP', en: 'en-US', zh: 'zh-CN', es: 'es-ES', fr: 'fr-FR' }[currentLang];
    utterance.volume = voiceVolume;
    utterance.onstart = () => setIsPlaying(true);
    utterance.onend = () => {
      setIsPlaying(false);
      if (isRideModeRef.current) { rideTimeoutRef.current = setTimeout(() => { nextRideStep(); }, 3000); }
    };
    window.speechSynthesis.speak(utterance);
  };

  const handleGenerate = async () => {
    if (!inputTheme) return;
    setIsGenerating(true); setStatusMessage("AI生成中...");
    try {
      const genAI = new GoogleGenerativeAI(GEMINI_API_KEY);
      const model = genAI.getGenerativeModel({ model: "gemini-2.0-flash" });
      const prompt = `歴史ガイドとして「${inputTheme}」のスポットを3つ選んで。言語: ${LANGUAGES[currentLang].label}。出力(JSON): [{"name":"名称 #タグ","lat":0,"lon":0,"description":"解説"}]`;
      const result = await model.generateContent(prompt);
      const text = result.response.text().replace(/```json/g, "").replace(/```/g, "").trim();
      let newSpots = JSON.parse(text.match(/\[[\s\S]*\]/)[0]);
      const insertData = newSpots.map(s => ({ ...s, name_ja: s.name, description_ja: s.description, category: 'history' }));
      await supabase.from('spots').insert(insertData);
      fetchSpots();
      if (newSpots.length > 0) mapRef.current?.flyTo({ center: [newSpots[0].lon, newSpots[0].lat], zoom: 4 });
      setInputTheme(""); alert(`${newSpots.length}件追加！`);
    } catch (e) { alert(e.message); } finally { setIsGenerating(false); setStatusMessage(""); }
  };

  const toggleRideMode = () => setIsRideMode(prev => !prev);
  const handleNextRide = () => { if (!isRideMode) return; window.speechSynthesis.cancel(); if (rideTimeoutRef.current) clearTimeout(rideTimeoutRef.current); nextRideStep(); };

  // ★ランダムジャンプ (Discover)
  const jumpToRandomSpot = (targetCategory = null) => {
    const candidates = locationsRef.current.filter(loc => {
      const cat = loc.category || 'history';
      if (!profile?.is_premium && !isVipUser(user?.email) && PREMIUM_CATEGORIES.includes(cat)) return false;
      if (targetCategory && cat !== targetCategory) return false;
      return true;
    });
    if (candidates.length === 0) { alert("スポットが見つかりません"); return; }
    const nextSpot = candidates[Math.floor(Math.random() * candidates.length)];
    setSelectedLocation(nextSpot);
    mapRef.current?.flyTo({ center: [nextSpot.lon, nextSpot.lat], zoom: 6, speed: 1.2, curve: 1.5, pitch: 40, essential: true });
    setShowDiscoverMenu(false); // メニューを閉じる
  };

  const nextRideStep = () => {
    if (!isRideModeRef.current) return;
    const currentFilters = visibleCategoriesRef.current || { history: true, nature: true, modern: true, science: true, art: true };
    const candidates = locationsRef.current.filter(loc => {
      const cat = loc.category || 'history';
      if (!profile?.is_premium && !isVipUser(user?.email) && PREMIUM_CATEGORIES.includes(cat)) return false;
      return currentFilters[cat];
    });
    if (candidates.length === 0) { setIsRideMode(false); return; }
    const nextSpot = candidates[Math.floor(Math.random() * candidates.length)];
    setSelectedLocation(nextSpot);
    mapRef.current?.flyTo({ center: [nextSpot.lon, nextSpot.lat], zoom: 6, speed: 0.8, curve: 1.5, pitch: 45, bearing: Math.random() * 360, essential: true });
  };

  const filteredGeoJsonData = useMemo(() => {
    const filtered = locations.filter(loc => {
      const cat = loc.category || 'history';
      if (!isPremium && PREMIUM_CATEGORIES.includes(cat)) return false;
      return visibleCategories[cat];
    });
    return { type: 'FeatureCollection', features: filtered.map(loc => ({ type: 'Feature', geometry: { type: 'Point', coordinates: [loc.lon, loc.lat] }, properties: { ...loc } })) };
  }, [locations, visibleCategories, isPremium]);

  const handleMoveEnd = useCallback((evt) => {
    if (!evt.originalEvent && isRideModeRef.current) return;
    if (isGeneratingRef.current) return;
    const map = mapRef.current?.getMap(); if (!map) return;
    const center = map.getCenter(); const point = map.project(center);
    const boxSize = 60;
    const features = map.queryRenderedFeatures([[point.x - boxSize/2, point.y - boxSize/2], [point.x + boxSize/2, point.y + boxSize/2]], { layers: ['point-core'] });
    if (features.length > 0) {
      let bestTarget = features[0].properties;
      const fullLocation = locationsRef.current.find(l => l.id === bestTarget.id) || bestTarget;
      if (!selectedLocationRef.current || fullLocation.id !== selectedLocationRef.current.id) {
        setSelectedLocation(fullLocation);
        map.flyTo({ center: [fullLocation.lon, fullLocation.lat], speed: 1.5, curve: 1 });
      }
    } else { if (selectedLocationRef.current) setSelectedLocation(null); }
  }, []);

  const getCategoryDetails = (category) => {
    let tag = '世界遺産'; let color = '#ffcc00';
    if (category === 'nature') { tag = '自然遺産'; color = '#00ff7f'; }
    if (category === 'modern') { tag = '現代建築'; color = '#00ffff'; }
    if (category === 'science') { tag = '宇宙・科学'; color = '#d800ff'; }
    if (category === 'art') { tag = '美術館'; color = '#ff0055'; }
    return { tag, color };
  };

  useEffect(() => {
    const audio = audioRef.current;
    if (!audio) return;
    if (isBgmOn) { audio.play().catch(() => {}); audio.volume = isPlaying ? bgmVolume * 0.2 : bgmVolume; } else { audio.pause(); }
  }, [isBgmOn, isPlaying, bgmVolume]);

  return (
    <div style={{ width: "100vw", height: "100dvh", background: "black", fontFamily: 'sans-serif', position: 'fixed', top: 0, left: 0, overflow: 'hidden', touchAction: 'none', overscrollBehavior: 'none' }}>
      <audio ref={audioRef} src="/bgm.mp3" loop />
      
      {/* PC用ログ・UI */}
      {isPc && <div style={{ position: 'absolute', bottom: '10px', left: '10px', zIndex: 100, background: 'rgba(0,0,0,0.7)', color: '#00ff00', fontSize: '10px', padding: '5px', borderRadius: '5px', maxWidth: '300px', pointerEvents: 'none' }}>{logs.map((log, i) => <div key={i}>{log}</div>)}</div>}
      {isPc && (
        <div style={{ position: 'absolute', top: '10px', left: '10px', zIndex: 20, display: 'flex', gap: '5px', background: 'rgba(0,0,0,0.6)', padding: '5px 10px', borderRadius: '12px', backdropFilter: 'blur(5px)', border: '1px solid rgba(255,255,255,0.1)', alignItems: 'center' }}>
          <select value={currentLang} onChange={(e) => setCurrentLang(e.target.value)} style={{ background: 'transparent', color: 'white', border: 'none', fontSize: '1rem', fontWeight: 'bold' }}>{Object.keys(LANGUAGES).map(key => <option key={key} value={key} style={{ color: 'black' }}>{LANGUAGES[key].label}</option>)}</select>
          <input type="text" value={inputTheme} onChange={e => setInputTheme(e.target.value)} placeholder={LANGUAGES[currentLang].placeholder} style={{ background: 'transparent', border: 'none', color: 'white', padding: '5px', width: '120px' }} onKeyDown={e => e.key === 'Enter' && handleGenerate()} />
          <button onClick={handleGenerate} style={{ background: '#00ffcc', color: 'black', border: 'none', borderRadius: '4px', padding: '5px 8px', fontWeight: 'bold' }}>Go</button>
          <button onClick={toggleRideMode} style={{ background: isRideMode ? '#ff3366' : '#00aaff', color: 'white', border: 'none', borderRadius: '20px', padding: '5px 12px', fontWeight: 'bold', marginLeft: '5px' }}>{isRideMode ? '🛑 Stop' : '✈️ Ride'}</button>
          {isRideMode && <button onClick={handleNextRide} style={{ background: 'rgba(255, 255, 255, 0.2)', color: 'white', border: '1px solid white', borderRadius: '20px', padding: '5px 12px', fontWeight: 'bold', marginLeft: '5px' }}>⏩ Next</button>}
        </div>
      )}

      {showAuthModal && <AuthModal onClose={() => setShowAuthModal(false)} onLoginSuccess={setupUser} />}
      {showFavList && user && <FavoritesModal userId={user.id} onClose={() => setShowFavList(false)} onSelect={handleSelectFromList} />}

      {/* PC用右上の設定 */}
      <div style={{ position: 'absolute', top: '10px', right: '10px', zIndex: 20, display: 'flex', alignItems: 'center', gap: '5px' }}>
        {profile && isPc && (<div style={{ color: 'white', fontSize: '0.9rem', background: 'rgba(0,0,0,0.6)', padding: '5px 10px', borderRadius: '8px', border: isPremium ? '1px solid #FFD700' : '1px solid #444' }}><span style={{ fontWeight: 'bold' }}>{profile.username}</span>{isPremium && <span style={{ marginLeft: '5px', color: '#FFD700' }}>★</span>}</div>)}
        {/* PCのみ表示 */}
        {isPc && user && (<button onClick={() => setShowFavList(true)} style={{ background: 'rgba(0,0,0,0.6)', border: '1px solid #ff3366', color: '#ff3366', borderRadius: '50%', width: '36px', height: '36px', fontSize: '1rem' }}>♥</button>)}
        {isPc && <button onClick={() => setIsSettingsOpen(!isSettingsOpen)} style={{ background: 'rgba(0,0,0,0.6)', border: '1px solid white', color: 'white', borderRadius: '50%', width: '36px', height: '36px' }}>⚙️</button>}
      </div>

      {isSettingsOpen && (
        <div style={{ position: 'absolute', top: '60px', right: isPc ? '10px' : 'auto', left: isPc ? 'auto' : '10px', zIndex: 30, background: 'rgba(20,20,20,0.95)', padding: '15px', borderRadius: '12px', border: '1px solid rgba(255,255,255,0.2)', color: 'white', minWidth: '220px', backdropFilter: 'blur(10px)', boxShadow: '0 4px 20px black' }}>
          <div style={{ marginBottom: '15px', fontWeight: 'bold', color: '#00ffcc', borderBottom: '1px solid #444', paddingBottom: '5px' }}>Settings</div>
          <div style={{ marginBottom: '15px', display: 'flex', flexDirection: 'column', gap: '8px' }}>
            <label style={{ display: 'flex', alignItems: 'center', gap: '8px' }}><input type="checkbox" checked={visibleCategories.history} onChange={e => setVisibleCategories(prev => ({...prev, history: e.target.checked}))} /><span style={{ color: '#ffcc00' }}>🏛️ 世界遺産</span></label>
            <label style={{ display: 'flex', alignItems: 'center', gap: '8px' }}><input type="checkbox" checked={visibleCategories.nature} onChange={e => setVisibleCategories(prev => ({...prev, nature: e.target.checked}))} /><span style={{ color: '#00ff7f' }}>🌲 自然遺産</span></label>
            <label style={{ display: 'flex', alignItems: 'center', gap: '8px' }}><input type="checkbox" checked={visibleCategories.modern} onChange={e => setVisibleCategories(prev => ({...prev, modern: e.target.checked}))} /><span style={{ color: '#00ffff' }}>🏙️ 現代建築</span></label>
            <label style={{ display: 'flex', alignItems: 'center', gap: '8px' }}><input type="checkbox" checked={visibleCategories.science} onChange={e => setVisibleCategories(prev => ({...prev, science: e.target.checked}))} /><span style={{ color: '#d800ff' }}>🚀 宇宙・科学</span></label>
            <label style={{ display: 'flex', alignItems: 'center', gap: '8px' }}><input type="checkbox" checked={visibleCategories.art} onChange={e => setVisibleCategories(prev => ({...prev, art: e.target.checked}))} /><span style={{ color: '#ff0055' }}>🎨 美術館</span></label>
          </div>
          <div style={{ borderTop: '1px solid #444', paddingTop: '10px' }}>
            <div style={{ display: 'flex', justifyContent: 'space-between', marginBottom: '10px' }}><span>BGM</span><button onClick={() => setIsBgmOn(!isBgmOn)} style={{ background: isBgmOn ? '#ffaa00' : '#555', color: 'white', border: 'none', borderRadius: '4px', padding: '2px 8px', fontSize: '0.8rem' }}>{isBgmOn ? 'ON' : 'OFF'}</button></div>
            <input type="range" min="0" max="1" step="0.1" value={bgmVolume} onChange={e => setBgmVolume(parseFloat(e.target.value))} style={{ width: '100%' }} />
          </div>
          {/* PC版でのみログアウトボタンをここに表示 */}
          {user && <button onClick={() => { if(confirm('Logout?')) { supabase.auth.signOut(); clearUser(); }}} style={{ marginTop: '10px', width: '100%', background: '#333', color: 'white', border: '1px solid #555', padding: '5px', borderRadius: '5px' }}>Logout</button>}
        </div>
      )}

      {statusMessage && <div style={{ position: 'absolute', top: '80px', left: '20px', zIndex: 20, color: '#00ffcc', textShadow: '0 0 5px black' }}>{statusMessage}</div>}

      {/* ★スマホ用ボトムナビゲーション (Radio Garden風) */}
      {!isPc && (
        <div style={{ 
          position: 'fixed', bottom: 0, left: 0, width: '100%', height: '70px', 
          background: 'rgba(10, 10, 10, 0.95)', borderTop: '1px solid rgba(255,255,255,0.1)', 
          display: 'flex', justifyContent: 'space-around', alignItems: 'center', zIndex: 50,
          backdropFilter: 'blur(10px)', paddingBottom: 'env(safe-area-inset-bottom)'
        }}>
          <NavButton icon="🔍" label="探索" active={activeTab === 'map'} onClick={() => { setActiveTab('map'); setIsRideMode(false); }} />
          <NavButton icon="✈️" label="ライド" active={activeTab === 'ride' || isRideMode} onClick={() => { setActiveTab('ride'); toggleRideMode(); }} />
          <NavButton icon="🎲" label="発見" active={activeTab === 'discover'} onClick={() => { setActiveTab('discover'); setShowDiscoverMenu(true); }} />
          <NavButton icon="♥" label="リスト" active={activeTab === 'fav'} onClick={() => { setActiveTab('fav'); if(user) setShowFavList(true); else setShowAuthModal(true); }} />
          <NavButton icon="⚙️" label="設定" active={activeTab === 'settings'} onClick={() => { setActiveTab('settings'); setIsSettingsOpen(!isSettingsOpen); }} />
        </div>
      )}

      {/* ★Radio Garden風「発見」メニュー (Discover Overlay) */}
      {!isPc && showDiscoverMenu && (
        <div style={{
          position: 'fixed', top: 0, left: 0, width: '100%', height: '100%', 
          background: 'rgba(0,0,0,0.85)', zIndex: 40, display: 'flex', flexDirection: 'column', 
          justifyContent: 'center', alignItems: 'center', padding: '20px', backdropFilter: 'blur(5px)'
        }} onClick={() => setShowDiscoverMenu(false)}>
          <div style={{ fontSize: '1.5rem', fontWeight: 'bold', color: 'white', marginBottom: '10px' }}>ブラウズ</div>
          <div style={{ fontSize: '0.9rem', color: '#ccc', marginBottom: '30px', textAlign: 'center' }}>
            どこか知らない地点へ行って、<br/>その土地の空気を吸ってみよう。
          </div>
          
          <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '15px', width: '100%', maxWidth: '350px' }} onClick={e => e.stopPropagation()}>
            <DiscoverCard title="気球の旅" sub="どこでもドア" icon="🎈" color="#00aaff" onClick={() => jumpToRandomSpot()} />
            <DiscoverCard title="大自然" sub="絶景に癒やされる" icon="🌲" color="#00ff7f" onClick={() => jumpToRandomSpot('nature')} />
            <DiscoverCard title="歴史の旅" sub="世界遺産を巡る" icon="🏛️" color="#ffcc00" onClick={() => jumpToRandomSpot('history')} />
            <DiscoverCard title="現代建築" sub="都市の鼓動" icon="🏙️" color="#00ffff" onClick={() => jumpToRandomSpot('modern')} />
          </div>
          
          <button onClick={() => setShowDiscoverMenu(false)} style={{ marginTop: '30px', background: 'transparent', border: '1px solid #555', color: '#888', padding: '10px 30px', borderRadius: '20px' }}>閉じる</button>
        </div>
      )}

      {/* ★ライドコントロール (スマホでライド中のみ下部に表示) */}
      {!isPc && isRideMode && (
        <div style={{
          position: 'absolute', bottom: '80px', left: '50%', transform: 'translateX(-50%)',
          display: 'flex', gap: '10px', zIndex: 45
        }}>
          <button onClick={toggleRideMode} style={{ background: '#ff3366', color: 'white', border: 'none', borderRadius: '20px', padding: '8px 20px', fontWeight: 'bold', boxShadow: '0 4px 10px black' }}>🛑 停止</button>
          <button onClick={handleNextRide} style={{ background: 'white', color: 'black', border: 'none', borderRadius: '20px', padding: '8px 20px', fontWeight: 'bold', boxShadow: '0 4px 10px black' }}>⏩ 次へ</button>
        </div>
      )}

      <div style={{ position: 'absolute', top: isPc ? '50%' : '38%', left: '50%', transform: 'translate(-50%, -50%)', width: '50px', height: '50px', borderRadius: '50%', zIndex: 10, pointerEvents: 'none', border: selectedLocation ? '2px solid #fff' : '2px solid rgba(255, 180, 150, 0.5)', boxShadow: selectedLocation ? '0 0 20px #fff' : '0 0 10px rgba(255, 100, 100, 0.3)', transition: 'all 0.3s' }} />

      {selectedLocation && displayData && (
        <div 
          onMouseDown={handleMouseDown}
          style={{ 
            position: 'absolute', 
            left: isPc ? popupPos.x : '50%', 
            top: isPc ? popupPos.y : 'auto', 
            // ★スマホの場合、ボトムバー(70px) + 余白(15px) の上に表示
            bottom: isPc ? 'auto' : '85px', 
            transform: isPc ? 'none' : 'translateX(-50%)', 
            background: 'rgba(10, 10, 10, 0.9)', 
            padding: isPc ? '20px' : '15px', 
            borderRadius: '20px', 
            color: 'white', 
            textAlign: 'center', 
            backdropFilter: 'blur(10px)', 
            border: '1px solid rgba(255, 255, 255, 0.2)', 
            zIndex: 10, 
            width: isPc ? '400px' : '90%', 
            maxWidth: '360px', 
            maxHeight: isPc ? 'none' : '50vh', 
            boxShadow: '0 4px 30px rgba(0,0,0,0.6)', 
            resize: isPc ? 'both' : 'none', 
            overflow: isPc ? 'auto' : 'hidden', 
            display: 'flex', flexDirection: 'column', 
            cursor: isPc ? (isDragging ? 'grabbing' : 'grab') : 'default',
            animation: isDragging ? 'none' : 'fadeIn 0.3s',
          }}
        >
          {displayData.image_url && (
            <div style={{ width: '100%', height: '140px', marginBottom: '10px', borderRadius: '12px', overflow: 'hidden', position: 'relative', flexShrink: 0 }}>
              <img src={displayData.image_url} alt={displayData.name} style={{ width: '100%', height: '100%', objectFit: 'cover' }} />
              <div style={{ position: 'absolute', bottom: 0, left: 0, width: '100%', background: 'linear-gradient(to top, rgba(0,0,0,0.8), transparent)', height: '50px' }} />
            </div>
          )}

          <div style={{ position: 'absolute', top: '10px', right: '10px', zIndex: 5 }}>
            <button onMouseDown={e => e.stopPropagation()} onClick={toggleFavorite} style={{ background: favorites.has(selectedLocation.id) ? '#ff3366' : '#333', color: 'white', border: '2px solid white', borderRadius: '50%', width: '40px', height: '40px', cursor: 'pointer', fontSize: '1.2rem', boxShadow: '0 4px 10px rgba(0,0,0,0.5)', transition: 'all 0.2s' }}>{favorites.has(selectedLocation.id) ? '♥' : '♡'}</button>
          </div>
          
          <div style={{ fontSize: '1.2rem', fontWeight: 'bold', color: '#ffccaa', marginBottom: '5px', flexShrink: 0 }}>{displayData.name.split('#')[0].trim()}</div>

          <div style={{ display: 'flex', justifyContent: 'center', alignItems: 'center', gap: '8px', marginBottom: '10px', flexShrink: 0, flexWrap: 'wrap' }}>
            {(displayData.country_ja || displayData.country) && (<span style={{ fontSize: '0.8rem', padding: '2px 10px', borderRadius: '12px', backgroundColor: '#333', border: '1px solid #888', color: '#eee', fontWeight: 'bold' }}>{displayData.country_ja || displayData.country}</span>)}
            {(() => {
              const { tag, color } = getCategoryDetails(displayData.category);
              return (<span style={{ fontSize: '0.8rem', padding: '2px 10px', borderRadius: '12px', backgroundColor: color, color: '#000', fontWeight: 'bold', boxShadow: '0 0 5px '+color }}>#{tag}</span>);
            })()}
            {displayData.needsTranslation && (<button onMouseDown={e => e.stopPropagation()} onClick={() => translateAndFix(selectedLocation, currentLang)} style={{ background: '#00ffcc', color: 'black', border: 'none', borderRadius: '4px', padding: '2px 10px', fontSize: '0.8rem', fontWeight: 'bold', cursor: 'pointer' }}>🔄 翻訳</button>)}
          </div>
          
          <div style={{ overflowY: 'auto', flex: 1, touchAction: 'pan-y', paddingBottom: '10px' }} onMouseDown={e => e.stopPropagation()}>
            <p style={{ margin: 0, fontSize: '0.85rem', color: '#ddd', lineHeight: '1.6', textAlign: 'left' }}>{displayData.description}</p>
          </div>
        </div>
      )}

      <MemoizedMap mapRef={mapRef} mapboxAccessToken={MAPBOX_TOKEN} initialViewState={initialViewState} onMoveEnd={handleMoveEnd} geoJsonData={filteredGeoJsonData} onError={(e) => addLog(`Map Error: ${e.error.message}`)} padding={isPc ? {} : { bottom: window.innerHeight * 0.25 }} />
      <style>{`@keyframes fadeIn { from { opacity: 0; transform: translateY(20px) translateX(-50%); } to { opacity: 1; transform: translateY(0) translateX(-50%); } } .pulse { animation: pulse 1s infinite; } @keyframes pulse { 0% { opacity: 1; } 50% { opacity: 0.3; } 100% { opacity: 1; } }`}</style>
    </div>
  );
};

// ヘルパーコンポーネント (ボトムナビ用ボタン)
const NavButton = ({ icon, label, active, onClick }) => (
  <button onClick={onClick} style={{ background: 'transparent', border: 'none', color: active ? '#00ffcc' : '#888', display: 'flex', flexDirection: 'column', alignItems: 'center', gap: '3px', cursor: 'pointer', transition: 'color 0.2s' }}>
    <span style={{ fontSize: '1.4rem' }}>{icon}</span>
    <span style={{ fontSize: '0.65rem', fontWeight: active ? 'bold' : 'normal' }}>{label}</span>
  </button>
);

// ヘルパーコンポーネント (Discoverカード)
const DiscoverCard = ({ title, sub, icon, color, onClick }) => (
  <div onClick={onClick} style={{ background: 'rgba(255,255,255,0.1)', padding: '15px', borderRadius: '15px', cursor: 'pointer', display: 'flex', flexDirection: 'column', alignItems: 'center', gap: '5px', border: `1px solid ${color}` }}>
    <div style={{ fontSize: '2rem' }}>{icon}</div>
    <div style={{ fontWeight: 'bold', color: 'white' }}>{title}</div>
    <div style={{ fontSize: '0.7rem', color: '#ccc' }}>{sub}</div>
  </div>
);

export default function GlobeWrapper() {
  return (
    <ErrorBoundary>
      <GlobeContent />
    </ErrorBoundary>
  );
}