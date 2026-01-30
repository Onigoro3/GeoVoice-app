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
  ja: { code: 'ja', name: 'Japanese', label: '🇯🇵 日本語', placeholder: '場所を検索...' },
  en: { code: 'en', name: 'English', label: '🇺🇸 English', placeholder: 'Search...' },
  zh: { code: 'zh', name: 'Chinese', label: '🇨🇳 中文', placeholder: '搜索...' },
  es: { code: 'es', name: 'Spanish', label: '🇪🇸 Español', placeholder: 'Buscar...' },
  fr: { code: 'fr', name: 'French', label: '🇫🇷 Français', placeholder: 'Rechercher...' },
};

const PREMIUM_CATEGORIES = ['modern', 'science', 'art'];

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
      reuseMaps={true}
      optimizeForTerrain={true}
    >
      <Source id="mapbox-dem" type="raster-dem" url="mapbox://mapbox.mapbox-terrain-dem-v1" tileSize={512} maxzoom={14} />
      {geoJsonData && (
        <Source id="my-locations" type="geojson" data={geoJsonData}>
          <Layer 
            id="point-glow" 
            type="circle" 
            paint={{ 
              'circle-radius': 6, 
              'circle-color': [
                'match', ['get', 'category'],
                'landmark', '#ff8800',
                'nature', '#00ff7f',
                'history', '#ffcc00',
                'modern', '#00ffff',
                'science', '#d800ff',
                'art', '#ff0055',
                '#ffcc00'
              ],
              'circle-opacity': 0.8, 
              'circle-blur': 0.4 
            }} 
          />
          <Layer id="point-core" type="circle" paint={{ 'circle-radius': 3, 'circle-color': '#fff', 'circle-opacity': 1 }} />
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
  const isHistoryModeRef = useRef(false);
  const historyIndexRef = useRef(0);
  const historySortedSpotsRef = useRef([]);
  const rideTimeoutRef = useRef(null);
  const visibleCategoriesRef = useRef(null);

  const [locations, setLocations] = useState([]);
  const [selectedLocation, setSelectedLocation] = useState(null);
  const [displayData, setDisplayData] = useState(null);
  const [isPlaying, setIsPlaying] = useState(false);
  const [isRideMode, setIsRideMode] = useState(false);
  const [isHistoryMode, setIsHistoryMode] = useState(false);
  
  const [historyYearInput, setHistoryYearInput] = useState("");
  const [historyEra, setHistoryEra] = useState("AD");
  const [historyCountry, setHistoryCountry] = useState("ALL");
  
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
    landmark: true, history: true, nature: true, modern: true, science: true, art: true
  });

  const [isSettingsOpen, setIsSettingsOpen] = useState(false);
  const [bgmVolume, setBgmVolume] = useState(0.5);
  const [voiceVolume, setVoiceVolume] = useState(1.0);
  const [isBgmOn, setIsBgmOn] = useState(false);

  const [isPc, setIsPc] = useState(window.innerWidth > 768);
  const [popupPos, setPopupPos] = useState({ x: 20, y: 100 });
  const [isDragging, setIsDragging] = useState(false);
  const [dragOffset, setDragOffset] = useState({ x: 0, y: 0 });

  const [activeTab, setActiveTab] = useState('map');
  // PC用サイドパネル表示フラグ
  const [showSidePanel, setShowSidePanel] = useState(false); 

  const initialViewState = { longitude: 135.0, latitude: 35.0, zoom: 3.5 };

  const countryList = useMemo(() => {
    const countries = new Set();
    locations.forEach(loc => {
      if (loc.country_ja) countries.add(loc.country_ja);
      else if (loc.country) countries.add(loc.country);
    });
    return Array.from(countries).sort();
  }, [locations]);

  useEffect(() => {
    const handleResize = () => setIsPc(window.innerWidth > 768);
    window.addEventListener('resize', handleResize);
    return () => window.removeEventListener('resize', handleResize);
  }, []);

  const handleMouseDown = (e) => {
    if (!isPc) return;
    if (['BUTTON', 'INPUT', 'SELECT', 'OPTION'].includes(e.target.tagName)) return;
    // サイドパネル内クリック時はドラッグしない
    if (e.target.closest('.side-panel') || e.target.closest('.control-bar')) return;
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

  useEffect(() => {
    isRideModeRef.current = isRideMode;
    isHistoryModeRef.current = isHistoryMode;
    if (isRideMode) {
      if (isHistoryMode) {
        let candidates = locationsRef.current.filter(l => l.year !== null && l.year !== undefined);
        if (historyCountry !== "ALL") candidates = candidates.filter(l => l.country === historyCountry || l.country_ja === historyCountry);
        if (historyYearInput && !isNaN(historyYearInput)) {
          let targetYear = parseInt(historyYearInput);
          if (historyEra === "BC") targetYear = -targetYear;
          candidates.sort((a, b) => Math.abs(a.year - targetYear) - Math.abs(b.year - targetYear));
        } else {
          candidates.sort((a, b) => a.year - b.year);
        }
        if (candidates.length === 0) {
          alert("条件に合うスポットが見つかりません");
          setIsHistoryMode(false); setIsRideMode(false); return;
        }
        historySortedSpotsRef.current = candidates;
        historyIndexRef.current = 0;
      }
      setActiveTab('ride');
      nextRideStep();
    } else {
      window.speechSynthesis.cancel();
      setIsPlaying(false);
      if (rideTimeoutRef.current) clearTimeout(rideTimeoutRef.current);
    }
  }, [isRideMode]);

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

  const handleCurrentLocation = () => {
    if (!navigator.geolocation) { alert("現在地機能が使えません"); return; }
    navigator.geolocation.getCurrentPosition(
      (pos) => {
        const { longitude, latitude } = pos.coords;
        mapRef.current?.flyTo({ center: [longitude, latitude], zoom: 10, speed: 1.5, curve: 1 });
      },
      () => { alert("位置情報の取得に失敗しました"); }
    );
  };

  const startHistoryRide = () => {
    setShowSidePanel(false); // PC用
    setShowBrowseOverlay(false); // スマホ用
    setIsHistoryMode(true);
    setIsRideMode(true);
  };

  const jumpToRandomSpot = (targetCategory = null) => {
    const candidates = locationsRef.current.filter(loc => {
      const cat = loc.category || 'history';
      if (!profile?.is_premium && !isVipUser(user?.email) && PREMIUM_CATEGORIES.includes(cat)) return false;
      if (targetCategory && cat !== targetCategory) return false;
      return true;
    });
    if (candidates.length === 0) { alert("スポットが見つかりません"); return; }
    setIsHistoryMode(false);
    if (isRideMode) setIsRideMode(false);
    setShowSidePanel(false); // PC用
    setShowBrowseOverlay(false); // スマホ用
    setActiveTab('map');
    const nextSpot = candidates[Math.floor(Math.random() * candidates.length)];
    setSelectedLocation(nextSpot);
    mapRef.current?.flyTo({ center: [nextSpot.lon, nextSpot.lat], zoom: 6, speed: 1.2, curve: 1.5, pitch: 40, essential: true });
  };

  const nextRideStep = () => {
    if (!isRideModeRef.current) return;
    let nextSpot = null;
    if (isHistoryModeRef.current) {
        const sorted = historySortedSpotsRef.current;
        let idx = historyIndexRef.current;
        if (idx >= sorted.length) idx = 0; 
        nextSpot = sorted[idx];
        historyIndexRef.current = idx + 1;
    } else {
        const currentFilters = visibleCategoriesRef.current || { history: true, nature: true, modern: true, science: true, art: true };
        const candidates = locationsRef.current.filter(loc => {
          const cat = loc.category || 'history';
          if (!profile?.is_premium && !isVipUser(user?.email) && PREMIUM_CATEGORIES.includes(cat)) return false;
          return currentFilters[cat];
        });
        if (candidates.length === 0) { setIsRideMode(false); return; }
        nextSpot = candidates[Math.floor(Math.random() * candidates.length)];
    }
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
    if (category === 'landmark') { tag = '観光名所'; color = '#ff8800'; }
    if (category === 'nature') { tag = '自然遺産'; color = '#00ff7f'; }
    if (category === 'modern') { tag = '現代建築'; color = '#00ffff'; }
    if (category === 'science') { tag = '宇宙・科学'; color = '#d800ff'; }
    if (category === 'art') { tag = '美術館'; color = '#ff0055'; }
    return { tag, color };
  };

  const getYearLabel = (year) => {
    if (!year) return '';
    return year < 0 ? `BC ${Math.abs(year)}` : `AD ${year}`;
  };

  useEffect(() => {
    const audio = audioRef.current;
    if (!audio) return;
    if (isBgmOn) { audio.play().catch(() => {}); audio.volume = isPlaying ? bgmVolume * 0.2 : bgmVolume; } else { audio.pause(); }
  }, [isBgmOn, isPlaying, bgmVolume]);

  const handleTabChange = (tab) => {
    if (activeTab === tab) {
      // 既にアクティブなタブを押したら閉じる(PC版ならパネルを隠す)
      if (tab !== 'map') {
        setActiveTab('map');
        setShowSidePanel(false);
        setShowBrowseOverlay(false);
        setIsSettingsOpen(false);
        if (tab === 'fav') setShowFavList(false);
      }
      return;
    }
    setActiveTab(tab);
    
    // PC版とスマホ版で挙動を分ける
    if (isPc) {
      if (tab === 'browse' || tab === 'settings' || tab === 'search') {
        setShowSidePanel(true);
      } else {
        setShowSidePanel(false);
      }
    } else {
      setShowBrowseOverlay(tab === 'browse');
      setIsSettingsOpen(tab === 'settings');
    }

    if (tab === 'ride') { if (!isRideMode) toggleRideMode(); }
    if (tab === 'fav') { if (user) setShowFavList(true); else setShowAuthModal(true); }
  };

  // ★PCサイドパネル用コンテンツ描画
  const renderSidePanelContent = () => {
    if (activeTab === 'search') {
      return (
        <div>
          <h3 style={{color:'#fff', marginTop:0}}>検索</h3>
          <div style={{ display: 'flex', gap: '5px', marginBottom:'20px' }}>
            <input autoFocus type="text" value={inputTheme} onChange={e => setInputTheme(e.target.value)} placeholder={LANGUAGES[currentLang].placeholder} style={{ flex: 1, background: '#222', border: '1px solid #444', color: 'white', padding: '8px', borderRadius: '5px' }} onKeyDown={e => e.key === 'Enter' && handleGenerate()} />
            <button onClick={handleGenerate} style={{ background: '#00ffcc', color: 'black', border: 'none', borderRadius: '5px', padding: '0 10px', fontWeight: 'bold' }}>Go</button>
          </div>
        </div>
      );
    }
    if (activeTab === 'browse') {
      return (
        <div>
          <h3 style={{color:'#fff', marginTop:0}}>ブラウズ</h3>
          
          <div style={{ background: '#222', borderRadius: '10px', padding: '15px', marginBottom: '20px', border: '1px solid #ffcc00' }}>
            <h4 style={{ margin: '0 0 10px 0', color: '#ffcc00' }}>⏳ ヒストリーライド</h4>
            <div style={{ display: 'flex', gap: '5px', marginBottom: '10px' }}>
                <input type="number" placeholder="年" value={historyYearInput} onChange={e => setHistoryYearInput(e.target.value)} style={{ flex: 1, padding: '5px', background: '#111', color: 'white', border:'1px solid #555' }} />
                <select value={historyEra} onChange={e => setHistoryEra(e.target.value)} style={{ background: '#111', color: 'white', border:'1px solid #555' }}><option value="AD">AD</option><option value="BC">BC</option></select>
            </div>
            <select value={historyCountry} onChange={e => setHistoryCountry(e.target.value)} style={{ width: '100%', padding: '5px', marginBottom: '10px', background: '#111', color: 'white', border:'1px solid #555' }}>
                <option value="ALL">全ての国</option>
                {countryList.map(c => <option key={c} value={c}>{c}</option>)}
            </select>
            <button onClick={startHistoryRide} style={{ width: '100%', padding: '8px', borderRadius: '20px', background: '#ffcc00', border: 'none', color: 'black', fontWeight: 'bold', cursor: 'pointer' }}>START</button>
          </div>

          <button onClick={() => jumpToRandomSpot()} style={{ width: '100%', padding: '10px', borderRadius: '20px', background: 'transparent', border: '2px solid #00ffcc', color: '#00ffcc', fontWeight: 'bold', marginBottom: '20px', cursor: 'pointer' }}>気球の旅 🎈</button>
          
          <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '10px' }}>
            <div onClick={() => jumpToRandomSpot('landmark')} style={{ background: '#222', padding: '10px', borderRadius: '10px', cursor: 'pointer', textAlign:'center', border:'1px solid #333' }}><div style={{fontSize:'1.5rem'}}>🏯</div><div style={{color:'#ff8800', fontSize:'0.8rem'}}>観光名所</div></div>
            <div onClick={() => jumpToRandomSpot('nature')} style={{ background: '#222', padding: '10px', borderRadius: '10px', cursor: 'pointer', textAlign:'center', border:'1px solid #333' }}><div style={{fontSize:'1.5rem'}}>🌲</div><div style={{color:'#00ff7f', fontSize:'0.8rem'}}>自然</div></div>
            <div onClick={() => jumpToRandomSpot('history')} style={{ background: '#222', padding: '10px', borderRadius: '10px', cursor: 'pointer', textAlign:'center', border:'1px solid #333' }}><div style={{fontSize:'1.5rem'}}>🏛️</div><div style={{color:'#ffcc00', fontSize:'0.8rem'}}>歴史</div></div>
            <div onClick={() => jumpToRandomSpot('modern')} style={{ background: '#222', padding: '10px', borderRadius: '10px', cursor: 'pointer', textAlign:'center', border:'1px solid #333' }}><div style={{fontSize:'1.5rem'}}>🏙️</div><div style={{color:'#00ffff', fontSize:'0.8rem'}}>現代</div></div>
          </div>
        </div>
      );
    }
    if (activeTab === 'settings') {
      return (
        <div>
          <h3 style={{color:'#fff', marginTop:0}}>設定</h3>
          <div style={{ marginBottom: '15px' }}>
            <div style={{marginBottom:'5px', color:'#ccc'}}>言語</div>
            <select value={currentLang} onChange={(e) => setCurrentLang(e.target.value)} style={{ width:'100%', background: '#333', color: 'white', padding: '5px', borderRadius: '5px' }}>
                {Object.keys(LANGUAGES).map(key => <option key={key} value={key}>{LANGUAGES[key].label}</option>)}
            </select>
          </div>
          <div style={{ marginBottom: '15px' }}>
            <div style={{marginBottom:'5px', color:'#ccc'}}>音量</div>
            <div style={{display:'flex', justifyContent:'space-between'}}><span>BGM</span><button onClick={() => setIsBgmOn(!isBgmOn)} style={{ fontSize:'0.7rem' }}>{isBgmOn?'ON':'OFF'}</button></div>
            <input type="range" min="0" max="1" step="0.1" value={bgmVolume} onChange={e => setBgmVolume(parseFloat(e.target.value))} style={{ width: '100%' }} />
          </div>
          {user && <button onClick={() => { if(confirm('Logout?')) { supabase.auth.signOut(); clearUser(); setActiveTab('map'); setShowSidePanel(false); }}} style={{ width: '100%', padding: '10px', background: '#333', color: '#ff3366', border: 'none', borderRadius: '5px' }}>ログアウト</button>}
        </div>
      );
    }
    return null;
  };

  return (
    <div style={{ width: "100vw", height: "100dvh", background: "black", fontFamily: 'sans-serif', position: 'fixed', top: 0, left: 0, overflow: 'hidden', touchAction: 'none', overscrollBehavior: 'none' }}>
      <audio ref={audioRef} src="/bgm.mp3" loop />
      
      {isPc && <div style={{ position: 'absolute', bottom: '10px', left: '10px', zIndex: 100, background: 'rgba(0,0,0,0.7)', color: '#00ff00', fontSize: '10px', padding: '5px', borderRadius: '5px', maxWidth: '300px', pointerEvents: 'none' }}>{logs.map((log, i) => <div key={i}>{log}</div>)}</div>}
      
      {/* ★PC版 サイドパネル (ニョキッと出る) */}
      {isPc && (
        <div 
          className="side-panel"
          style={{ 
            position: 'absolute', 
            bottom: '90px', // コントロールバー(高さ約70px+マージン)の上
            left: '20px', 
            width: '320px', 
            maxHeight: showSidePanel ? '80vh' : '0px', // アニメーション用
            background: 'rgba(15, 15, 15, 0.95)', 
            borderRadius: '15px', 
            border: showSidePanel ? '1px solid rgba(255,255,255,0.2)' : 'none',
            overflowY: 'auto', 
            boxShadow: '0 4px 20px rgba(0,0,0,0.5)', 
            transition: 'max-height 0.3s ease-in-out, opacity 0.3s ease-in-out',
            opacity: showSidePanel ? 1 : 0,
            zIndex: 90,
            padding: showSidePanel ? '20px' : '0px 20px'
          }}
        >
          {showSidePanel && renderSidePanelContent()}
        </div>
      )}

      {/* ★PC版 コントロールバー (左下固定) */}
      {isPc && (
        <div className="control-bar" style={{ position: 'absolute', bottom: '20px', left: '20px', zIndex: 100, width: '320px', background: '#111', borderRadius: '15px', border: '1px solid rgba(255,255,255,0.1)', overflow: 'hidden', boxShadow: '0 4px 20px rgba(0,0,0,0.8)' }}>
          {/* 現在地・タイトル */}
          <div style={{ padding: '10px 15px', borderBottom: '1px solid #222', display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
            <div style={{ color: 'white', fontWeight: 'bold', fontSize: '1.1rem' }}>{isRideMode ? (isHistoryMode ? '⏳ History Ride' : '✈️ Auto Ride') : '🌍 GeoVoice'}</div>
            <button onClick={handleCurrentLocation} style={{ background: '#333', border: 'none', color: '#00ffcc', borderRadius: '50%', width: '30px', height: '30px', cursor: 'pointer' }}>📍</button>
          </div>
          
          {/* ライドコントローラー (常時表示エリア) */}
          {isRideMode && (
             <div style={{ padding: '10px 15px', display: 'flex', gap: '10px', alignItems:'center', background:'#222' }}>
                <button onClick={toggleRideMode} style={{ flex: 1, background: '#ff3366', color: 'white', border: 'none', borderRadius: '5px', padding: '5px', fontWeight: 'bold', cursor:'pointer' }}>STOP</button>
                <button onClick={handleNextRide} style={{ flex: 1, background: '#444', color: 'white', border: 'none', borderRadius: '5px', padding: '5px', fontWeight: 'bold', cursor:'pointer' }}>NEXT</button>
             </div>
          )}
          
          {/* メニュータブ */}
          <div style={{ display: 'flex', borderTop: '1px solid #222' }}>
            <NavButton icon="🔍" label="Search" active={activeTab === 'search'} onClick={() => handleTabChange('search')} />
            <NavButton icon="✈️" label="Ride" active={isRideMode} onClick={() => handleTabChange('ride')} />
            <NavButton icon="🎲" label="Browse" active={activeTab === 'browse'} onClick={() => handleTabChange('browse')} />
            <NavButton icon="♥" label="Favs" active={activeTab === 'fav'} onClick={() => handleTabChange('fav')} />
            <NavButton icon="⚙️" label="Set" active={activeTab === 'settings'} onClick={() => handleTabChange('settings')} />
          </div>
        </div>
      )}

      {/* PC版 ログアウト (右上) */}
      {isPc && user && (
        <div style={{ position: 'absolute', top: '20px', right: '20px', zIndex: 50 }}>
          {profile && <div style={{ color: 'white', background: 'rgba(0,0,0,0.6)', padding: '5px 10px', borderRadius: '8px', marginBottom: '5px', textAlign: 'right' }}>{profile.username}</div>}
        </div>
      )}

      {showAuthModal && <AuthModal onClose={() => setShowAuthModal(false)} onLoginSuccess={setupUser} />}
      {showFavList && user && <FavoritesModal userId={user.id} onClose={() => setShowFavList(false)} onSelect={handleSelectFromList} />}

      {/* スマホ用 設定・ブラウズ画面 (全画面オーバーレイ) */}
      {!isPc && (isSettingsOpen || showBrowseOverlay) && (
        <div style={{ 
          position: 'fixed', top: 0, left: 0, width: '100%', height: 'calc(100% - 80px)', 
          background: '#111', zIndex: 200, overflowY: 'auto', padding: '20px', boxSizing: 'border-box'
        }}>
          {/* 閉じるボタン */}
          <button onClick={() => handleTabChange('map')} style={{ position:'absolute', top:'15px', right:'15px', background:'transparent', border:'none', color:'#888', fontSize:'1.5rem' }}>✕</button>
          
          {showBrowseOverlay && (
            <div>
              <h2 style={{ color: 'white', marginTop: '10px' }}>ブラウズ</h2>
              <div style={{ background: '#222', borderRadius: '15px', padding: '20px', marginBottom: '30px', border: '1px solid #ffcc00' }}>
                <h3 style={{ margin: '0 0 10px 0', color: '#ffcc00' }}>⏳ ヒストリーライド</h3>
                <div style={{ display: 'flex', gap: '10px', marginBottom: '10px' }}>
                    <input type="number" placeholder="年" value={historyYearInput} onChange={e => setHistoryYearInput(e.target.value)} style={{ flex: 1, padding: '8px', background: '#111', color: 'white', border:'1px solid #555', borderRadius:'5px' }} />
                    <select value={historyEra} onChange={e => setHistoryEra(e.target.value)} style={{ background: '#111', color: 'white', border:'1px solid #555', borderRadius:'5px' }}><option value="AD">AD</option><option value="BC">BC</option></select>
                </div>
                <select value={historyCountry} onChange={e => setHistoryCountry(e.target.value)} style={{ width: '100%', padding: '8px', marginBottom: '15px', background: '#111', color: 'white', border:'1px solid #555', borderRadius:'5px' }}>
                    <option value="ALL">全ての国</option>
                    {countryList.map(c => <option key={c} value={c}>{c}</option>)}
                </select>
                <button onClick={startHistoryRide} style={{ width: '100%', padding: '10px', borderRadius: '20px', background: '#ffcc00', border: 'none', color: 'black', fontSize:'1rem', fontWeight: 'bold' }}>START</button>
              </div>
              <button onClick={() => jumpToRandomSpot()} style={{ width: '100%', padding: '15px', borderRadius: '30px', background: 'transparent', border: '2px solid #00ffcc', color: '#00ffcc', fontSize: '1.1rem', fontWeight: 'bold', marginBottom: '40px' }}>気球の旅 🎈</button>
              <h3 style={{ color: 'white', borderLeft: '4px solid #00ff7f', paddingLeft: '10px' }}>カテゴリー</h3>
              <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '15px' }}>
                <div onClick={() => jumpToRandomSpot('landmark')} style={{ background: '#222', padding: '15px', borderRadius: '15px', textAlign:'center', border:'1px solid #333' }}><div style={{fontSize:'2rem'}}>🏯</div><div style={{color:'#ff8800'}}>観光名所</div></div>
                <div onClick={() => jumpToRandomSpot('nature')} style={{ background: '#222', padding: '15px', borderRadius: '15px', textAlign:'center', border:'1px solid #333' }}><div style={{fontSize:'2rem'}}>🌲</div><div style={{color:'#00ff7f'}}>自然</div></div>
                <div onClick={() => jumpToRandomSpot('history')} style={{ background: '#222', padding: '15px', borderRadius: '15px', textAlign:'center', border:'1px solid #333' }}><div style={{fontSize:'2rem'}}>🏛️</div><div style={{color:'#ffcc00'}}>歴史</div></div>
                <div onClick={() => jumpToRandomSpot('modern')} style={{ background: '#222', padding: '15px', borderRadius: '15px', textAlign:'center', border:'1px solid #333' }}><div style={{fontSize:'2rem'}}>🏙️</div><div style={{color:'#00ffff'}}>現代</div></div>
              </div>
            </div>
          )}

          {isSettingsOpen && (
            <div>
              <h2 style={{ color: 'white', marginTop: '10px' }}>設定</h2>
              <div style={{ marginBottom: '20px' }}>
                <div style={{color:'#ccc', marginBottom:'5px'}}>言語</div>
                <select value={currentLang} onChange={(e) => setCurrentLang(e.target.value)} style={{ width:'100%', background: '#333', color: 'white', padding: '10px', borderRadius: '5px', fontSize:'1rem' }}>
                    {Object.keys(LANGUAGES).map(key => <option key={key} value={key}>{LANGUAGES[key].label}</option>)}
                </select>
              </div>
              <div style={{ marginBottom: '20px' }}>
                <div style={{color:'#ccc', marginBottom:'5px'}}>BGM</div>
                <button onClick={() => setIsBgmOn(!isBgmOn)} style={{ width:'100%', padding:'10px', background: isBgmOn ? '#ffaa00' : '#333', color:'white', border:'none', borderRadius:'5px' }}>{isBgmOn ? 'ON' : 'OFF'}</button>
                <input type="range" min="0" max="1" step="0.1" value={bgmVolume} onChange={e => setBgmVolume(parseFloat(e.target.value))} style={{ width: '100%', marginTop:'10px' }} />
              </div>
              {user && <button onClick={() => { if(confirm('Logout?')) { supabase.auth.signOut(); clearUser(); handleTabChange('map'); }}} style={{ width: '100%', padding: '15px', background: '#333', color: '#ff3366', border: 'none', borderRadius: '10px', fontSize: '1rem', fontWeight: 'bold' }}>ログアウト</button>}
            </div>
          )}
        </div>
      )}

      {/* スマホ用ボトムナビゲーション */}
      {!isPc && (
        <div style={{ 
          position: 'fixed', bottom: 0, left: 0, width: '100%', height: '80px', 
          background: 'rgba(0, 0, 0, 0.95)', borderTop: '1px solid #333', 
          display: 'flex', justifyContent: 'space-around', alignItems: 'center', 
          zIndex: 100, paddingBottom: 'env(safe-area-inset-bottom)'
        }}>
          <button onClick={handleCurrentLocation} style={{ position: 'absolute', top: '-60px', left: '20px', width: '45px', height: '45px', background: '#222', border: '1px solid #444', borderRadius: '50%', color: '#00ffcc', fontSize: '1.2rem', boxShadow: '0 4px 10px black', zIndex: 110 }}>📍</button>
          
          <NavButton icon="🌍" label="探索" active={activeTab === 'map'} onClick={() => handleTabChange('map')} />
          <NavButton icon="✈️" label="ライド" active={activeTab === 'ride' || isRideMode} onClick={() => handleTabChange('ride')} />
          <NavButton icon="🎲" label="ブラウズ" active={activeTab === 'browse'} onClick={() => handleTabChange('browse')} />
          <NavButton icon="♥" label="リスト" active={activeTab === 'fav'} onClick={() => handleTabChange('fav')} />
          <NavButton icon="⚙️" label="設定" active={activeTab === 'settings'} onClick={() => handleTabChange('settings')} />
        </div>
      )}

      {/* ★スマホ用 ライドコントロール */}
      {!isPc && isRideMode && activeTab !== 'browse' && (
        <div style={{ position: 'absolute', bottom: '120px', left: '50%', transform: 'translateX(-50%)', display: 'flex', flexDirection:'column', alignItems:'center', gap: '10px', zIndex: 50, width:'90%' }}>
          {/* 年号表示 */}
          {isHistoryMode && displayData?.year && <div style={{ color: '#ffcc00', fontWeight: 'bold', fontSize: '1.2rem', textShadow: '0 0 5px black', background:'rgba(0,0,0,0.5)', padding:'2px 10px', borderRadius:'10px' }}>{getYearLabel(displayData.year)}</div>}
          <div style={{ display:'flex', gap:'10px' }}>
            <button onClick={toggleRideMode} style={{ background: '#ff3366', color: 'white', border: 'none', borderRadius: '30px', padding: '10px 25px', fontWeight: 'bold', boxShadow: '0 4px 15px rgba(0,0,0,0.5)' }}>🛑 STOP</button>
            <button onClick={handleNextRide} style={{ background: 'white', color: 'black', border: 'none', borderRadius: '30px', padding: '10px 25px', fontWeight: 'bold', boxShadow: '0 4px 15px rgba(0,0,0,0.5)' }}>⏩ NEXT</button>
          </div>
        </div>
      )}

      {statusMessage && <div style={{ position: 'absolute', top: '80px', left: '20px', zIndex: 20, color: '#00ffcc', textShadow: '0 0 5px black' }}>{statusMessage}</div>}

      <div style={{ position: 'absolute', top: isPc ? '50%' : '30%', left: '50%', transform: 'translate(-50%, -50%)', width: '50px', height: '50px', borderRadius: '50%', zIndex: 10, pointerEvents: 'none', border: selectedLocation ? '2px solid #fff' : '2px solid rgba(255, 180, 150, 0.5)', boxShadow: selectedLocation ? '0 0 20px #fff' : '0 0 10px rgba(255, 100, 100, 0.3)', transition: 'all 0.3s' }} />

      {/* スポット情報カード (PCはドラッグ可) */}
      {selectedLocation && displayData && activeTab !== 'browse' && (
        <>
          {!isPc && displayData.image_url && (
            <div style={{
              position: 'absolute', top: '40px', left: '10px', right: '10px',
              height: '160px', borderRadius: '15px', overflow: 'hidden',
              boxShadow: '0 4px 20px rgba(0,0,0,0.5)', zIndex: 10, pointerEvents: 'none',
              border: '1px solid rgba(255,255,255,0.1)'
            }}>
              <img src={displayData.image_url} alt={displayData.name} style={{ width: '100%', height: '100%', objectFit: 'cover' }} />
              <div style={{ position: 'absolute', bottom: 0, left: 0, width: '100%', height: '50px', background: 'linear-gradient(to top, rgba(0,0,0,0.7), transparent)' }} />
            </div>
          )}

          <div 
            onMouseDown={handleMouseDown}
            style={{ 
              position: 'absolute', 
              left: isPc ? popupPos.x : '10px', 
              right: isPc ? 'auto' : '10px',
              top: isPc ? popupPos.y : 'auto', 
              bottom: isPc ? 'auto' : (isRideMode ? '190px' : '120px'), 
              transform: isPc ? 'none' : 'none', 
              background: 'rgba(10, 10, 10, 0.95)', 
              padding: '20px', borderRadius: '20px', color: 'white', textAlign: 'center', 
              backdropFilter: 'blur(10px)', border: '1px solid rgba(255, 255, 255, 0.2)', zIndex: 10, 
              width: isPc ? '400px' : 'auto', maxWidth: isPc ? '360px' : 'none', maxHeight: isPc ? 'none' : '40vh',
              boxShadow: '0 4px 30px rgba(0,0,0,0.6)', overflow: isPc ? 'auto' : 'hidden', 
              display: 'flex', flexDirection: 'column', 
              cursor: isPc ? (isDragging ? 'grabbing' : 'grab') : 'default',
              animation: isDragging ? 'none' : 'fadeIn 0.3s',
            }}
          >
            {isPc && displayData.image_url && (
              <div style={{ width: '100%', height: '140px', marginBottom: '10px', borderRadius: '12px', overflow: 'hidden', position: 'relative', flexShrink: 0 }}>
                <img src={displayData.image_url} alt={displayData.name} style={{ width: '100%', height: '100%', objectFit: 'cover' }} />
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
        </>
      )}

      <MemoizedMap mapRef={mapRef} mapboxAccessToken={MAPBOX_TOKEN} initialViewState={initialViewState} onMoveEnd={handleMoveEnd} geoJsonData={filteredGeoJsonData} onError={(e) => addLog(`Map Error: ${e.error.message}`)} padding={isPc ? {} : { bottom: window.innerHeight * 0.4 }} />
      <style>{`@keyframes fadeIn { from { opacity: 0; transform: translateY(20px) translateX(-50%); } to { opacity: 1; transform: translateY(0) translateX(-50%); } } .pulse { animation: pulse 1s infinite; } @keyframes pulse { 0% { opacity: 1; } 50% { opacity: 0.3; } 100% { opacity: 1; } }`}</style>
    </div>
  );
};

const NavButton = ({ icon, label, active, onClick }) => (
  <div onClick={onClick} style={{ display: 'flex', flexDirection: 'column', alignItems: 'center', cursor: 'pointer', color: active ? '#00ffcc' : '#888', width: '20%', transition: 'all 0.2s' }}>
    <div style={{ fontSize: active ? '1.8rem' : '1.5rem', marginBottom: '2px', transition: 'all 0.2s' }}>{icon}</div>
    <div style={{ fontSize: '0.6rem', fontWeight: active ? 'bold' : 'normal', color: active ? 'white' : '#666' }}>{label}</div>
  </div>
);

export default function GlobeWrapper() {
  return (
    <ErrorBoundary>
      <GlobeContent />
    </ErrorBoundary>
  );
}