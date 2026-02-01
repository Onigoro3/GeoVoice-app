import React, { useRef, useState, useMemo, useEffect, useCallback } from 'react';
import Map, { Source, Layer } from 'react-map-gl';
import { supabase } from '../supabaseClient';
import { GoogleGenerativeAI } from "@google/generative-ai";
import AuthModal from './AuthModal';
import FavoritesModal from './FavoritesModal';
import ErrorBoundary from './ErrorBoundary';
import SplashScreen from './SplashScreen';
import TutorialOverlay from './TutorialOverlay';
import { isVipUser } from '../vipList';

const MAPBOX_TOKEN = import.meta.env.VITE_MAPBOX_TOKEN;
const GEMINI_API_KEY = import.meta.env.VITE_GEMINI_API_KEY;

const LANGUAGES = {
  ja: { code: 'ja', name: 'Japanese', label: '🇯🇵 日本語', placeholder: '行きたい場所やテーマを入力...' },
  en: { code: 'en', name: 'English', label: '🇺🇸 English', placeholder: 'Where do you want to go?' },
  zh: { code: 'zh', name: 'Chinese', label: '🇨🇳 中文', placeholder: '你想去哪里？' },
  es: { code: 'es', name: 'Spanish', label: '🇪🇸 Español', placeholder: '¿Adónde quieres ir?' },
  fr: { code: 'fr', name: 'French', label: '🇫🇷 Français', placeholder: 'Où voulez-vous aller ?' },
};

const ERA_LABELS = {
  ja: { AD: '西暦', BC: '紀元前' },
  en: { AD: 'AD', BC: 'BC' },
  zh: { AD: '公元', BC: '公元前' },
  es: { AD: 'd.C.', BC: 'a.C.' },
  fr: { AD: 'ap. J.-C.', BC: 'av. J.-C.' },
};

const BGM_LIBRARY = [
  // Pop
  { id: 'pop1', title: '10℃', artist: 'Japan', genre: 'Pop', url: '/bgm/Pop1.mp3' },
  { id: 'pop2', title: 'Green park', artist: 'Japan', genre: 'Pop', url: '/bgm/Pop2.mp3' },
  { id: 'pop3', title: 'ART-Break', artist: 'Japan', genre: 'Pop', url: '/bgm/Pop3.mp3' },
  // Chill
  { id: 'chill1', title: 'かえりみち', artist: 'Japan', genre: 'Chill', url: '/bgm/Chill1.mp3' }, 
  { id: 'chill2', title: 'ON AIR', artist: 'Japan', genre: 'Chill', url: '/bgm/Chill2.mp3' },
  { id: 'chill3', title: 'Bad-weather', artist: 'Japan', genre: 'Chill', url: '/bgm/Chill3.mp3' },
  // Rock
  { id: 'rock1', title: 'Rolling Girl', artist: 'Japan', genre: 'Rock', url: '/bgm/Rock1.mp3' },
  { id: 'rock2', title: 'Break your destiny', artist: 'Japan', genre: 'Rock', url: '/bgm/Rock2.mp3' },
  { id: 'rock3', title: 'Sword in the Void', artist: 'Japan', genre: 'Rock', url: '/bgm/Rock3.mp3' },
  // Metal
  { id: 'metal1', title: 'MECHANICAL DEATH', artist: 'Japan', genre: 'Metal', url: '/bgm/Metal1.mp3' },
  { id: 'metal2', title: 'RADICAL GOOD SPEED', artist: 'Japan', genre: 'Metal', url: '/bgm/Metal2.mp3' },
  { id: 'metal3', title: 'DIVINE WARRIORS', artist: 'Japan', genre: 'Metal', url: '/bgm/Metal3.mp3' },
  // EDM
  { id: 'edm1', title: 'Cosmic Summer', artist: 'Japan', genre: 'EDM', url: '/bgm/EDM1.mp3' },
  { id: 'edm2', title: 'Rogue Circuit', artist: 'Japan', genre: 'EDM', url: '/bgm/EDM2.mp3' },
  { id: 'edm3', title: 'Guide Me to Heaven', artist: 'Japan', genre: 'EDM', url: '/bgm/EDM3.mp3' },
  // Jazz
  { id: 'jazz1', title: 'Winter Night Street', artist: 'Japan', genre: 'Jazz', url: '/bgm/JAZZ1.mp3' },
  { id: 'jazz2', title: 'Dive to ocean', artist: 'Japan', genre: 'Jazz', url: '/bgm/JAZZ2.mp3' },
  { id: 'jazz3', title: 'Tea with Grace', artist: 'Japan', genre: 'Jazz', url: '/bgm/JAZZ3.mp3' },
  // Country
  { id: 'country1', title: 'Peaceful Town', artist: 'Japan', genre: 'Country', url: '/bgm/Country1.mp3' },
  { id: 'country2', title: '木立の冬支度', artist: 'Japan', genre: 'Country', url: '/bgm/Country2.mp3' },
  { id: 'country3', title: '秋を探しに', artist: 'Japan', genre: 'Country', url: '/bgm/Country3.mp3' },
];

const PREMIUM_CATEGORIES = ['nature', 'modern', 'science', 'art'];

const PRIVACY_POLICY_TEXT = `## プライバシーポリシー (省略)`;

const MAP_CONFIG = {
  style: "mapbox://styles/mapbox/satellite-v9",
  fog: { range: [0.5, 10], color: 'rgba(255, 255, 255, 0)', 'high-color': '#000', 'space-color': '#000', 'star-intensity': 0.6 },
  terrain: { source: 'mapbox-dem', exaggeration: 1.5 }
};

const LAYER_GLOW = {
  id: 'point-glow',
  type: 'circle',
  paint: {
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
  }
};
const LAYER_CORE = {
  id: 'point-core',
  type: 'circle',
  paint: { 'circle-radius': 3, 'circle-color': '#fff', 'circle-opacity': 1 }
};

const MAP_CONTAINER_STYLE = { width: '100%', height: '100%' };

const getCategoryDetails = (category) => {
  let tag = '世界遺産'; let color = '#ffcc00';
  if (category === 'landmark') { tag = '観光名所'; color = '#ff8800'; }
  if (category === 'nature') { tag = '自然遺産'; color = '#00ff7f'; }
  if (category === 'modern') { tag = '現代建築'; color = '#00ffff'; }
  if (category === 'science') { tag = '宇宙・科学'; color = '#d800ff'; }
  if (category === 'art') { tag = '美術館'; color = '#ff0055'; }
  return { tag, color };
};

const MemoizedMap = React.memo(({ mapRef, mapboxAccessToken, initialViewState, onMoveEnd, onClick, onMouseEnter, onMouseLeave, cursor, geoJsonData, onError, padding }) => {
  return (
    <Map
      ref={mapRef}
      mapboxAccessToken={mapboxAccessToken}
      initialViewState={initialViewState}
      projection="globe"
      mapStyle={MAP_CONFIG.style}
      fog={MAP_CONFIG.fog}
      terrain={MAP_CONFIG.terrain}
      onMoveEnd={onMoveEnd}
      onClick={onClick}
      onMouseEnter={onMouseEnter}
      onMouseLeave={onMouseLeave}
      cursor={cursor} 
      style={MAP_CONTAINER_STYLE}
      onError={onError}
      dragRotate={true}
      touchZoomRotate={true}
      padding={padding}
      reuseMaps={true}
      optimizeForTerrain={true} 
      interactiveLayerIds={['point-glow', 'point-core']}
    >
      <Source id="mapbox-dem" type="raster-dem" url="mapbox://mapbox.mapbox-terrain-dem-v1" tileSize={512} maxzoom={14} />
      {geoJsonData && (
        <Source id="my-locations" type="geojson" data={geoJsonData}>
          <Layer {...LAYER_GLOW} />
          <Layer {...LAYER_CORE} />
        </Source>
      )}
    </Map>
  );
}, (prev, next) => prev.geoJsonData === next.geoJsonData && prev.padding === next.padding && prev.cursor === next.cursor);

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
  const rideCategoryRef = useRef(null);
  
  const nextSpotDataRef = useRef(null);
  const imageCacheRef = useRef(new Set());

  const [locations, setLocations] = useState([]);
  const [selectedLocation, setSelectedLocation] = useState(null);
  
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
  
  const [imgError, setImgError] = useState(false); 
  const [imgLoading, setImgLoading] = useState(true);

  const [user, setUser] = useState(null);
  const [profile, setProfile] = useState(null);
  const [isPremium, setIsPremium] = useState(false);
  const [showAuthModal, setShowAuthModal] = useState(false);
  const [showFavList, setShowFavList] = useState(false);
  const [favorites, setFavorites] = useState(new Set());

  // ★フォーム用State
  const [showContactModal, setShowContactModal] = useState(false);
  const [showRequestModal, setShowRequestModal] = useState(false);
  const [formEmail, setFormEmail] = useState("");
  const [formMessage, setFormMessage] = useState("");
  const [formPlaceName, setFormPlaceName] = useState("");
  const [formPlaceDesc, setFormPlaceDesc] = useState("");

  const [visibleCategories, setVisibleCategories] = useState({
    landmark: true, history: true, nature: true, 
    modern: true, science: true, art: true
  });

  const [bgmVolume, setBgmVolume] = useState(0.5);
  const [voiceVolume, setVoiceVolume] = useState(1.0);
  const [isBgmOn, setIsBgmOn] = useState(false);
  const [currentTrack, setCurrentTrack] = useState(BGM_LIBRARY[0]);
  const [loopMode, setLoopMode] = useState('all'); 
  const [genreFilter, setGenreFilter] = useState('ALL');
  const [artistFilter, setArtistFilter] = useState('ALL');

  const [isPc, setIsPc] = useState(window.innerWidth > 768);
  const [popupPos, setPopupPos] = useState({ x: 20, y: 20 });
  const [isDragging, setIsDragging] = useState(false);
  const [dragOffset, setDragOffset] = useState({ x: 0, y: 0 });
  const [activeTab, setActiveTab] = useState(null); 
  const [nearbySpots, setNearbySpots] = useState([]);
  const [cursor, setCursor] = useState('auto'); 
  
  const [showSplash, setShowSplash] = useState(true);
  const [showTutorial, setShowTutorial] = useState(false);

  const premiumSpotCount = useMemo(() => {
    return locations.filter(l => PREMIUM_CATEGORIES.includes(l.category || 'history')).length;
  }, [locations]);

  const accessibleSpotCount = useMemo(() => {
    const isUserPremium = isPremium || isVipUser(user?.email);
    if (isUserPremium) return locations.length;
    return locations.filter(loc => !PREMIUM_CATEGORIES.includes(loc.category || 'history')).length;
  }, [locations, isPremium, user]);

  const isPanelOpen = isPc && activeTab && (activeTab === 'explore' || activeTab === 'browse' || activeTab === 'settings');

  const displayData = useMemo(() => {
    if (!selectedLocation) return null;
    const suffix = currentLang === 'ja' ? '_ja' : `_${currentLang}`;
    let displayName = selectedLocation[`name${suffix}`] || selectedLocation.name;
    let displayDesc = selectedLocation[`description${suffix}`] || selectedLocation.description;
    return { 
        ...selectedLocation, 
        name: displayName, 
        description: displayDesc, 
        needsTranslation: currentLang === 'ja' && !/[ぁ-んァ-ン]/.test(displayName) 
    };
  }, [selectedLocation, currentLang]);

  const handleSplashFinish = () => {
    setShowSplash(false);
    const hasSeen = localStorage.getItem('hasSeenTutorial');
    if (!hasSeen) {
      setShowTutorial(true);
    }
  };

  const handleLanguageSelect = (lang) => {
    setCurrentLang(lang);
  };

  const initialViewState = { longitude: 135.0, latitude: 35.0, zoom: 3.5 };

  const toggleRideMode = () => setIsRideMode(prev => !prev);

  const handleTabChange = (tab) => {
    if (activeTab === tab) { setActiveTab(null); return; }
    setActiveTab(tab);
    if (tab === 'ride') { if (!isRideMode) toggleRideMode(); }
    if (tab === 'fav') { if (user) setShowFavList(true); else setShowAuthModal(true); }
  };

  useEffect(() => { if (isPc) setPopupPos({ x: window.innerWidth - 420, y: 20 }); }, [isPc]);
  useEffect(() => { locationsRef.current = locations; }, [locations]);
  useEffect(() => { selectedLocationRef.current = selectedLocation; }, [selectedLocation]);
  useEffect(() => { isGeneratingRef.current = isGenerating; }, [isGenerating]);
  useEffect(() => { visibleCategoriesRef.current = visibleCategories; }, [visibleCategories]);
  
  useEffect(() => { isRideModeRef.current = isRideMode; }, [isRideMode]);
  useEffect(() => { isHistoryModeRef.current = isHistoryMode; }, [isHistoryMode]);

  useEffect(() => {
    if (nearbySpots.length > 0) {
        nearbySpots.forEach(spot => {
            if (spot.image_url && !imageCacheRef.current.has(spot.image_url)) {
                const img = new Image();
                img.src = spot.image_url;
                img.onload = () => {
                    imageCacheRef.current.add(spot.image_url);
                };
            }
        });
    }
  }, [nearbySpots]);

  const countryList = useMemo(() => {
    const countries = new Set();
    locations.forEach(loc => { if (loc.country_ja) countries.add(loc.country_ja); });
    return Array.from(countries).sort();
  }, [locations]);

  const availableGenres = useMemo(() => Array.from(new Set(BGM_LIBRARY.map(t => t.genre))).sort(), []);
  const availableArtists = useMemo(() => { 
    let tracks = BGM_LIBRARY;
    if (genreFilter !== 'ALL') tracks = tracks.filter(t => t.genre === genreFilter);
    return Array.from(new Set(tracks.map(t => t.artist))).sort(); 
  }, [genreFilter]);
  const currentPlaylist = useMemo(() => { 
    let tracks = BGM_LIBRARY;
    if (genreFilter !== 'ALL') tracks = tracks.filter(t => t.genre === genreFilter);
    if (artistFilter !== 'ALL') tracks = tracks.filter(t => t.artist === artistFilter);
    return tracks; 
  }, [genreFilter, artistFilter]);

  useEffect(() => {
    const handleResize = () => setIsPc(window.innerWidth > 768);
    window.addEventListener('resize', handleResize);
    return () => window.removeEventListener('resize', handleResize);
  }, []);

  const handleMouseDown = (e) => {
    if (!isPc) return;
    if (['BUTTON', 'INPUT', 'SELECT', 'OPTION', 'A'].includes(e.target.tagName)) return;
    if (e.target.closest('.pc-ui-container')) return;
    setIsDragging(true);
    const startX = popupPos ? popupPos.x : (window.innerWidth - 420);
    const startY = popupPos ? popupPos.y : 20;
    setDragOffset({ x: e.clientX - startX, y: e.clientY - startY });
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

  const fetchSpots = async () => {
    try {
      let from = 0; const batchSize = 1000;
      const minimalFields = 'id, name, name_ja, lat, lon, category, country_ja, year';
      setLocations([]);
      while (true) {
        const { data, error } = await supabase.from('spots').select(minimalFields).range(from, from + batchSize - 1);
        if (error || !data || data.length === 0) break;
        const validBatch = data.filter(d => d.lat && d.lon).map(d => ({ ...d, category: d.category || 'history' }));
        setLocations(prev => [...prev, ...validBatch]);
        if (data.length < batchSize) break;
        from += batchSize;
        await new Promise(resolve => setTimeout(resolve, 50)); 
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

  const setupUser = (u) => { setUser(u); setFormEmail(u.email || ""); fetchFavorites(u.id); fetchProfile(u.id, u.email); };
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
  const toggleFavorite = async (targetId) => {
    if (!user) { setShowAuthModal(true); return; }
    const id = targetId || selectedLocation?.id;
    if (!id) return;
    const isFav = favorites.has(id);
    try {
      if (isFav) {
        await supabase.from('favorites').delete().eq('user_id', user.id).eq('spot_id', id);
        const newFavs = new Set(favorites); newFavs.delete(id); setFavorites(newFavs);
      } else {
        await supabase.from('favorites').insert({ user_id: user.id, spot_id: id });
        const newFavs = new Set(favorites); newFavs.add(id); setFavorites(newFavs);
      }
    } catch(e) { addLog(`Fav Error: ${e.message}`); }
  };

  const handleSelectFromList = (spot) => { fetchAndSelectSpot(spot.id); };
  
  const fetchAndSelectSpot = async (spotId, fromPreload=false) => {
    if (!fromPreload) {
        const spot = locationsRef.current.find(s => s.id === spotId);
        if (spot && PREMIUM_CATEGORIES.includes(spot.category) && !isPremium && !isVipUser(user?.email)) {
            alert("🔒 このカテゴリ（自然・現代・科学・芸術）はプレミアム会員限定です。\n設定からプレミアムに参加してください！");
            return;
        }
    }

    try {
        let fullSpot = null;
        
        if (fromPreload && nextSpotDataRef.current && nextSpotDataRef.current.id === spotId) {
            fullSpot = nextSpotDataRef.current;
            nextSpotDataRef.current = null; 
        } else {
            const { data } = await supabase.from('spots').select('*').eq('id', spotId).single();
            if (data) {
                fullSpot = { ...data, category: data.category || 'history' };
            }
        }

        if (fullSpot) {
            setSelectedLocation(fullSpot);
            mapRef.current?.flyTo({ center: [fullSpot.lon, fullSpot.lat], zoom: 6, speed: 2.0, curve: 1, essential: true });
            
            if (isRideModeRef.current) {
                setTimeout(preloadNextSpot, 500); 
            }
        }
    } catch (e) { console.error(e); }
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
      
      if (selectedLocationRef.current && selectedLocationRef.current.id === spot.id) {
        const newData = { ...spot, ...updateData, name: json.name, description: json.description };
        setSelectedLocation(newData);
        if (!isRideModeRef.current) speak(json.description);
      }
    } catch (e) { addLog(`翻訳失敗: ${e.message}`); } finally { setStatusMessage(""); }
  };

  useEffect(() => { 
    if (!displayData) { 
        if(window.speechSynthesis) window.speechSynthesis.cancel(); 
        setIsPlaying(false); 
        setImgError(false); 
        return; 
    }

    setImgError(false);
    const isCached = displayData.image_url && imageCacheRef.current.has(displayData.image_url);
    setImgLoading(!isCached);

    if (!displayData.needsTranslation) { 
        if(window.speechSynthesis) window.speechSynthesis.cancel(); 
        speak(displayData.description); 
    }
  }, [displayData]); 

  const speak = (text) => { 
    if (!window.speechSynthesis) return;
    if (!text) { setIsPlaying(false); return; }
    const utterance = new SpeechSynthesisUtterance(text);
    utterance.lang = { ja: 'ja-JP', en: 'en-US', zh: 'zh-CN', es: 'es-ES', fr: 'fr-FR' }[currentLang];
    utterance.volume = voiceVolume;
    utterance.onstart = () => setIsPlaying(true);
    utterance.onend = () => { 
        setIsPlaying(false); 
        if(isRideModeRef.current) {
            rideTimeoutRef.current = setTimeout(nextRideStep, 3000); 
        }
    };
    window.speechSynthesis.speak(utterance);
  };

  const togglePlay = () => { 
    if (!window.speechSynthesis) return;
    if (window.speechSynthesis.speaking) {
      if (window.speechSynthesis.paused) { window.speechSynthesis.resume(); setIsPlaying(true); } 
      else { window.speechSynthesis.pause(); setIsPlaying(false); }
    } else { if (selectedLocation) speak(displayData?.description); else findClosestSpotAndPlay(); }
  };

  const findClosestSpotAndPlay = () => {
    const map = mapRef.current?.getMap(); if (!map) return;
    const center = map.getCenter(); let closestSpot = null; let minDistance = Infinity;
    locationsRef.current.forEach(loc => {
        const dist = Math.pow(loc.lat - center.lat, 2) + Math.pow(loc.lon - center.lng, 2);
        if (dist < minDistance) { minDistance = dist; closestSpot = loc; }
    });
    if (closestSpot) fetchAndSelectSpot(closestSpot.id);
  };

  const playNextTrack = () => {
    if (loopMode === 'one') { audioRef.current.currentTime = 0; audioRef.current.play().catch(()=>{}); } 
    else {
      const currentIndex = currentPlaylist.findIndex(t => t.id === currentTrack.id);
      let nextIndex = (currentIndex + 1) % currentPlaylist.length;
      setCurrentTrack(currentPlaylist[nextIndex]);
    }
  };
  const playPrevTrack = () => {
    const currentIndex = currentPlaylist.findIndex(t => t.id === currentTrack.id);
    let prevIndex = (currentIndex - 1 + currentPlaylist.length) % currentPlaylist.length;
    setCurrentTrack(currentPlaylist[prevIndex]);
  };
  const handleTrackEnded = () => { playNextTrack(); };

  useEffect(() => {
    const audio = audioRef.current; if (!audio) return;
    if (isBgmOn) { audio.volume = isPlaying ? bgmVolume * 0.2 : bgmVolume; audio.play().catch(e => console.log("Auto-play prevented")); } 
    else { audio.pause(); }
  }, [isBgmOn, isPlaying, bgmVolume, currentTrack]);

  const handleMapClick = useCallback((event) => {
    if (isRideModeRef.current) setIsRideMode(false);
    const feature = event.features?.[0];
    if (feature && (feature.layer.id === 'point-glow' || feature.layer.id === 'point-core')) {
        fetchAndSelectSpot(feature.properties.id);
    }
  }, []);

  const onMouseEnter = useCallback(() => setCursor('pointer'), []);
  const onMouseLeave = useCallback(() => setCursor('auto'), []);

  const handleMoveEnd = useCallback((evt) => {
    if (isRideModeRef.current || isGeneratingRef.current) return;
    const map = mapRef.current?.getMap(); if (!map) return;
    if (activeTab === 'explore') {
      const bounds = map.getBounds(); const ne = bounds.getNorthEast(); const sw = bounds.getSouthWest();
      const nearby = locationsRef.current.filter(loc => loc.lat >= sw.lat && loc.lat <= ne.lat && loc.lon >= sw.lng && loc.lon <= ne.lng);
      const center = map.getCenter(); 
      nearby.sort((a, b) => (Math.pow(a.lat - center.lat, 2) + Math.pow(a.lon - center.lng, 2)) - (Math.pow(b.lat - center.lat, 2) + Math.pow(b.lon - center.lng, 2)));
      setNearbySpots(nearby.slice(0, 15)); 
    }
  }, [activeTab]);

  // ★追加: フォーム送信処理
  const handleContactSubmit = async () => {
    if (!formMessage.trim()) return alert("メッセージを入力してください");
    try {
        const { error } = await supabase.from('inquiries').insert({ user_id: user?.id, email: formEmail, message: formMessage });
        if (error) throw error;
        alert("送信しました。ありがとうございます！");
        setFormMessage(""); setShowContactModal(false);
    } catch(e) { alert("送信エラー: " + e.message); }
  };

  const handleRequestSubmit = async () => {
    if (!formPlaceName.trim()) return alert("場所の名前を入力してください");
    try {
        const { error } = await supabase.from('place_requests').insert({ user_id: user?.id, place_name: formPlaceName, description: formPlaceDesc });
        if (error) throw error;
        alert("リクエストを送信しました！");
        setFormPlaceName(""); setFormPlaceDesc(""); setShowRequestModal(false);
    } catch(e) { alert("送信エラー: " + e.message); }
  };

  const handleGenerate = async () => {
    if (!inputTheme) return; setIsGenerating(true); setStatusMessage("AI生成中...");
    try {
      const genAI = new GoogleGenerativeAI(GEMINI_API_KEY); const model = genAI.getGenerativeModel({ model: "gemini-2.0-flash" });
      const prompt = `歴史ガイドとして「${inputTheme}」のスポットを3つ選んで。言語: ${LANGUAGES[currentLang].label}。出力(JSON): [{"name":"名称 #タグ","lat":0,"lon":0,"description":"解説"}]`;
      const result = await model.generateContent(prompt); const text = result.response.text().replace(/```json/g, "").replace(/```/g, "").trim();
      let newSpots = JSON.parse(text.match(/\[[\s\S]*\]/)[0]);
      const insertData = newSpots.map(s => ({ ...s, name_ja: s.name, description_ja: s.description, category: 'history' }));
      await supabase.from('spots').insert(insertData); fetchSpots();
      if (newSpots.length > 0) mapRef.current?.flyTo({ center: [newSpots[0].lon, newSpots[0].lat], zoom: 4 });
      setInputTheme(""); alert(`${newSpots.length}件追加！`);
    } catch (e) { alert(e.message); } finally { setIsGenerating(false); setStatusMessage(""); }
  };

  const handleNextRide = () => { 
    if (!isRideMode) return; 
    if(window.speechSynthesis) window.speechSynthesis.cancel(); 
    if (rideTimeoutRef.current) clearTimeout(rideTimeoutRef.current); 
    setTimeout(() => { nextRideStep(); }, 50);
  };

  const handleCurrentLocation = () => { if (!navigator.geolocation) { alert("現在地機能が使えません"); return; } navigator.geolocation.getCurrentPosition((pos) => { mapRef.current?.flyTo({ center: [pos.coords.longitude, pos.coords.latitude], zoom: 9, speed: 1.5, curve: 1 }); }, () => { alert("位置情報の取得に失敗しました"); }); };
  
  const startHistoryRide = () => { 
    if (!isPremium && !isVipUser(user?.email)) {
        alert("🔒 ヒストリーライドはプレミアム限定機能です。\n歴史の旅へ出かけるにはアップグレードが必要です！");
        return;
    }
    setIsHistoryMode(true); 
    setIsRideMode(true); 
    setActiveTab('map'); 
    setTimeout(() => { nextRideStep(); }, 100);
  };
  const toggleRideModeTrigger = () => { if (!isRideMode) { if(!isHistoryMode) jumpToRandomSpot(); else nextRideStep(); } else setIsRideMode(false); };
  
  const jumpToRandomSpot = (cat=null) => { 
    rideCategoryRef.current = cat; 
    if (cat && PREMIUM_CATEGORIES.includes(cat) && !isPremium && !isVipUser(user?.email)) {
        alert("🔒 プレミアム限定機能です"); return;
    }
    if (cat) { const newFilters = { landmark: false, history: false, nature: false, modern: false, science: false, art: false }; newFilters[cat] = true; setVisibleCategories(newFilters); } 
    else { setVisibleCategories({ landmark: true, history: true, nature: true, modern: true, science: true, art: true }); }
    setIsHistoryMode(false); setIsRideMode(true); setActiveTab('map'); setTimeout(() => { nextRideStep(); }, 100); 
  };

  const getNextSpotCandidate = () => {
    if (isHistoryModeRef.current) {
        const sorted = historySortedSpotsRef.current; 
        let idx = historyIndexRef.current; 
        if (idx >= sorted.length) idx = 0; 
        historyIndexRef.current = idx + 1; 
        return sorted[idx];
    } else {
        const currentFilters = visibleCategoriesRef.current || { history: true, nature: true, modern: true, science: true, art: true }; 
        const targetCat = rideCategoryRef.current;
        let candidates = locationsRef.current.filter(loc => {
          const cat = loc.category || 'history';
          if (!profile?.is_premium && !isVipUser(user?.email) && PREMIUM_CATEGORIES.includes(cat)) return false;
          if (targetCat) return cat === targetCat;
          return currentFilters[cat];
        });
        if (selectedLocationRef.current) candidates = candidates.filter(c => c.id !== selectedLocationRef.current.id);
        if (candidates.length === 0) return null;
        return candidates[Math.floor(Math.random() * candidates.length)];
    }
  };

  const preloadNextSpot = async () => {
    const nextCandidate = getNextSpotCandidate();
    if (!nextCandidate) return;

    try {
        const { data } = await supabase.from('spots').select('*').eq('id', nextCandidate.id).single();
        if (data) {
            const fullSpot = { ...data, category: data.category || 'history' };
            nextSpotDataRef.current = fullSpot;
            
            if (fullSpot.image_url) {
                const img = new Image();
                img.src = fullSpot.image_url;
                img.onload = () => {
                    imageCacheRef.current.add(fullSpot.image_url);
                };
            }
        }
    } catch (e) { console.error("Preload error", e); }
  };

  const nextRideStep = async () => {
    if (!isRideModeRef.current) return;
    
    if (nextSpotDataRef.current) {
        await fetchAndSelectSpot(nextSpotDataRef.current.id, true);
    } else {
        const nextSpot = getNextSpotCandidate();
        if (nextSpot) {
            await fetchAndSelectSpot(nextSpot.id);
        } else {
            setIsRideMode(false);
        }
    }
  };

  const filteredGeoJsonData = useMemo(() => {
    const filtered = locations.filter(loc => {
      const cat = loc.category || 'history';
      if (!isPremium && !isVipUser(user?.email) && PREMIUM_CATEGORIES.includes(cat)) return false;
      return visibleCategories[cat];
    });
    return { 
      type: 'FeatureCollection', 
      features: filtered.map(loc => ({ type: 'Feature', geometry: { type: 'Point', coordinates: [loc.lon, loc.lat] }, properties: { ...loc } })) 
    };
  }, [locations, visibleCategories, isPremium, user]);

  const renderPanelContent = () => {
    const commonStyle = { background: '#111', borderRadius: '15px', padding: '20px', border: '1px solid rgba(255,255,255,0.1)', minHeight: '200px', pointerEvents: 'auto' };

    if (activeTab === 'explore') {
        const content = (
            <div>
              <h2 style={{color:'#fff', marginTop:0, marginBottom:'5px', fontSize:'1.2rem'}}>探索</h2>
              <div style={{color:'#888', fontSize:'0.8rem', marginBottom:'15px', borderBottom:'1px solid #333', paddingBottom:'10px'}}>この地域のピックアップ</div>
              {nearbySpots.length === 0 ? (
                <div style={{color:'#666', textAlign:'center', marginTop:'30px'}}>地図を動かして<br/>スポットを探そう 🌍</div>
              ) : (
                <div style={{ display:'flex', flexDirection:'column' }}>
                  {nearbySpots.map(spot => (
                    <div key={spot.id} onClick={() => handleSelectFromList(spot)} style={{ padding:'12px 5px', borderBottom:'1px solid #222', cursor:'pointer', background: selectedLocation?.id === spot.id ? 'rgba(0,255,204,0.1)' : 'transparent', display:'flex', justifyContent:'space-between', alignItems:'center' }}>
                      <div><div style={{color:'white', fontWeight:'bold', fontSize:'0.9rem'}}>{spot.name_ja || spot.name}</div><div style={{color:'#888', fontSize:'0.75rem', marginTop:'2px'}}>{getCategoryDetails(spot.category).tag}</div></div>
                      <button onClick={(e) => { e.stopPropagation(); toggleFavorite(spot.id); }} style={{background:'transparent', border:'none', color: favorites.has(spot.id)?'#ff3366':'#444', fontSize:'1.2rem', cursor:'pointer'}}>♥</button>
                    </div>
                  ))}
                </div>
              )}
            </div>
        );
        return isPc ? <div style={commonStyle}>{content}</div> : content;
    }
    
    if (activeTab === 'browse') {
      const isUserPremium = isPremium || isVipUser(user?.email);
      return (
        <div style={commonStyle}>
          <h2 style={{color:'#fff', marginTop:0, fontSize:'1.5rem'}}>ブラウズ</h2>
          <div style={{ 
              background: '#222', 
              borderRadius: '12px', 
              padding: '15px', 
              marginBottom: '20px', 
              border: '1px solid #444',
              opacity: isUserPremium ? 1 : 0.5,
              position: 'relative',
              pointerEvents: isUserPremium ? 'auto' : 'none' 
          }}>
            {!isUserPremium && (
                <div style={{position:'absolute', top:0, left:0, width:'100%', height:'100%', zIndex:10, display:'flex', justifyContent:'center', alignItems:'center', pointerEvents:'auto'}} onClick={() => alert("🔒 ヒストリーライドはプレミアム限定機能です")}>
                    <div style={{background:'rgba(0,0,0,0.8)', padding:'5px 15px', borderRadius:'10px', border:'1px solid #ffcc00', color:'white', fontWeight:'bold'}}>🔒 プレミアム (History)</div>
                </div>
            )}
            <h4 style={{ margin: '0 0 10px 0', color: '#ffcc00' }}>⏳ ヒストリーライド</h4>
            <div style={{ display: 'flex', gap: '5px', marginBottom: '10px' }}>
                <input type="number" placeholder="年" value={historyYearInput} onChange={e => setHistoryYearInput(e.target.value)} style={{ flex: 1, padding: '8px', background: '#111', color: 'white', border:'1px solid #555', borderRadius:'5px' }} />
                <select value={historyEra} onChange={e => setHistoryEra(e.target.value)} style={{ background: '#111', color: 'white', border:'1px solid #555', borderRadius:'5px' }}><option value="AD">{ERA_LABELS[currentLang].AD}</option><option value="BC">{ERA_LABELS[currentLang].BC}</option></select>
            </div>
            <select value={historyCountry} onChange={e => setHistoryCountry(e.target.value)} style={{ width: '100%', padding: '8px', marginBottom: '15px', background: '#111', color: 'white', border:'1px solid #555', borderRadius:'5px' }}><option value="ALL">全ての国</option>{countryList.map(c => <option key={c} value={c}>{c}</option>)}</select>
            <button onClick={startHistoryRide} style={{ width: '100%', padding: '10px', borderRadius: '20px', background: '#ffcc00', border: 'none', color: 'black', fontWeight: 'bold', cursor: 'pointer' }}>START</button>
          </div>

          <div style={{color:'#888', fontSize:'0.9rem', marginBottom:'15px'}}>カテゴリを選んでツアーを開始</div>
          <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '10px' }}>
            <div onClick={() => jumpToRandomSpot('landmark')} style={{ background: '#222', padding: '15px', borderRadius: '10px', cursor: 'pointer', textAlign:'center', border:'1px solid #333' }}><div style={{fontSize:'1.5rem'}}>🏯</div><div style={{color:'#ff8800', fontSize:'0.8rem'}}>観光名所</div></div>
            <div onClick={() => jumpToRandomSpot('history')} style={{ background: '#222', padding: '15px', borderRadius: '10px', cursor: 'pointer', textAlign:'center', border:'1px solid #333' }}><div style={{fontSize:'1.5rem'}}>🏛️</div><div style={{color:'#ffcc00', fontSize:'0.8rem'}}>歴史</div></div>
            
            <div onClick={() => isUserPremium ? jumpToRandomSpot('nature') : alert('🔒 プレミアム限定です')} style={{ background: '#222', padding: '15px', borderRadius: '10px', cursor: 'pointer', textAlign:'center', border:'1px solid #333', opacity: isUserPremium ? 1 : 0.5 }}>
              <div style={{fontSize:'1.5rem'}}>{isUserPremium ? '🌲' : '🔒'}</div><div style={{color:'#00ff7f', fontSize:'0.8rem'}}>自然 (Pro)</div>
            </div>
            <div onClick={() => isUserPremium ? jumpToRandomSpot('modern') : alert('🔒 プレミアム限定です')} style={{ background: '#222', padding: '15px', borderRadius: '10px', cursor: 'pointer', textAlign:'center', border:'1px solid #333', opacity: isUserPremium ? 1 : 0.5 }}>
              <div style={{fontSize:'1.5rem'}}>{isUserPremium ? '🏙️' : '🔒'}</div><div style={{color:'#00ffff', fontSize:'0.8rem'}}>現代 (Pro)</div>
            </div>
            <div onClick={() => isUserPremium ? jumpToRandomSpot('science') : alert('🔒 プレミアム限定です')} style={{ background: '#222', padding: '15px', borderRadius: '10px', cursor: 'pointer', textAlign:'center', border:'1px solid #333', opacity: isUserPremium ? 1 : 0.5 }}>
              <div style={{fontSize:'1.5rem'}}>{isUserPremium ? '🚀' : '🔒'}</div><div style={{color:'#d800ff', fontSize:'0.8rem'}}>科学 (Pro)</div>
            </div>
            <div onClick={() => isUserPremium ? jumpToRandomSpot('art') : alert('🔒 プレミアム限定です')} style={{ background: '#222', padding: '15px', borderRadius: '10px', cursor: 'pointer', textAlign:'center', border:'1px solid #333', opacity: isUserPremium ? 1 : 0.5 }}>
              <div style={{fontSize:'1.5rem'}}>{isUserPremium ? '🎨' : '🔒'}</div><div style={{color:'#ff0055', fontSize:'0.8rem'}}>芸術 (Pro)</div>
            </div>
          </div>
        </div>
      );
    }

    if (activeTab === 'settings') {
      return (
        <div style={commonStyle}>
          <h2 style={{ color: 'white', marginTop: 0, fontSize:'1.5rem', marginBottom:'20px' }}>設定</h2>
          
          {(!isPremium && !isVipUser(user?.email)) && (
            <div style={{ background: '#222', borderRadius: '16px', padding: '20px', marginBottom: '25px', boxShadow: '0 4px 15px rgba(0,0,0,0.5)', border: '1px solid #333', textAlign: 'left' }}>
              <div style={{ display: 'flex', alignItems: 'center', marginBottom: '15px' }}>
                <div style={{ fontSize: '2.5rem', marginRight: '15px' }}>🌍</div>
                <div><div style={{ color: 'white', fontSize: '1.2rem', fontWeight: 'bold' }}>GeoVoice</div><div style={{ color: '#00ffcc', fontSize: '1.4rem', fontWeight: 'bold', letterSpacing: '1px' }}>プレミアム</div></div>
              </div>
              <div style={{ color: '#ccc', marginBottom: '20px', fontSize: '0.9rem', lineHeight: '1.8' }}>
                <div style={{ display: 'flex', alignItems: 'center' }}><span style={{ color: '#00ffcc', marginRight: '10px' }}>✓</span> 広告なしで快適に</div>
                <div style={{ display: 'flex', alignItems: 'center' }}><span style={{ color: '#00ffcc', marginRight: '10px' }}>✓</span> 自然・現代・科学・芸術 カテゴリ解放</div>
                <div style={{ display: 'flex', alignItems: 'center' }}><span style={{ color: '#00ffcc', marginRight: '10px' }}>✓</span> <b>約{premiumSpotCount}件</b>のスポットが追加されます！</div>
                <div style={{ display: 'flex', alignItems: 'center' }}><span style={{ color: '#00ffcc', marginRight: '10px' }}>✓</span> ヒストリーライド＆AIガイド使い放題</div>
              </div>
              <button style={{ width: '100%', padding: '12px', background: '#00ffcc', color: 'black', border: 'none', borderRadius: '25px', fontWeight: 'bold', fontSize: '1rem', cursor: 'pointer', marginBottom: '10px' }}>プレミアムに参加する</button>
              <div style={{ textAlign: 'center', color: '#888', fontSize: '0.8rem', cursor: 'pointer', textDecoration: 'underline' }}>購入を復元</div>
            </div>
          )}

          {(isPremium || isVipUser(user?.email)) && (
             <div style={{ background: 'linear-gradient(45deg, #00332a, #000)', borderRadius: '16px', padding: '20px', marginBottom: '25px', border: '1px solid #00ffcc', textAlign: 'center' }}>
                <div style={{ color: '#00ffcc', fontWeight: 'bold', fontSize: '1.2rem', marginBottom: '5px' }}>💎 Premium Member</div>
                <div style={{ color: '#ccc', fontSize: '0.9rem' }}>全ての機能が解放されています</div>
             </div>
          )}

          <div style={{marginBottom: '20px'}}>
            <div style={{color:'white', marginBottom:'5px'}}>言語設定 / Language</div>
            <select value={currentLang} onChange={(e) => setCurrentLang(e.target.value)} style={{width:'100%', padding:'8px', background:'#333', color:'white', border:'1px solid #555', borderRadius:'5px'}}>
              {Object.values(LANGUAGES).map(L => <option key={L.code} value={L.code}>{L.label}</option>)}
            </select>
          </div>

          <div style={{ padding: '15px' }}>
              <div style={{ display: 'flex', justifyContent: 'space-between', marginBottom: '5px', color: 'white', alignItems:'center' }}>
                  <span>BGM Player</span>
                  <button onClick={() => setIsBgmOn(!isBgmOn)} style={{ background: 'transparent', color: isBgmOn?'#00ffcc':'#666', border: 'none', cursor: 'pointer', fontWeight:'bold' }}>{isBgmOn ? 'ON' : 'OFF'}</button>
              </div>
              <div style={{background:'#111', padding:'10px', borderRadius:'8px', marginBottom:'15px', border:'1px solid #444'}}>
                  <div style={{display:'flex', justifyContent:'space-between', alignItems:'center', marginBottom:'10px'}}>
                      <div style={{color:'white', fontSize:'0.9rem', fontWeight:'bold'}}>{currentTrack.title}</div>
                      <div style={{color:'#888', fontSize:'0.8rem'}}>{currentTrack.artist}</div>
                  </div>
                  <select value={genreFilter} onChange={(e) => { const newGenre = e.target.value; setGenreFilter(newGenre); setArtistFilter('ALL'); let nextTrack = BGM_LIBRARY[0]; if (newGenre !== 'ALL') { const found = BGM_LIBRARY.find(t => t.genre === newGenre); if (found) nextTrack = found; } setCurrentTrack(nextTrack); }} style={{ width:'100%', background: '#333', color: '#fff', border: '1px solid #555', borderRadius: '4px', padding: '4px', marginBottom:'5px', fontSize:'0.8rem' }}><option value="ALL">All Genres</option>{availableGenres.map(g => <option key={g} value={g}>{g}</option>)}</select>
                  <select value={artistFilter} onChange={(e) => { const newArtist = e.target.value; setArtistFilter(newArtist); let nextTrack = BGM_LIBRARY[0]; if (newArtist !== 'ALL') { const found = BGM_LIBRARY.find(t => t.artist === newArtist && (genreFilter === 'ALL' || t.genre === genreFilter)); if (found) nextTrack = found; } else if (genreFilter !== 'ALL') { const found = BGM_LIBRARY.find(t => t.genre === genreFilter); if (found) nextTrack = found; } setCurrentTrack(nextTrack); }} style={{ width:'100%', background: '#333', color: '#fff', border: '1px solid #555', borderRadius: '4px', padding: '4px', marginBottom:'5px', fontSize:'0.8rem' }}><option value="ALL">All Artists</option>{availableArtists.map(a => <option key={a} value={a}>{a}</option>)}</select>
                  <div style={{display:'flex', gap:'5px', marginBottom:'10px'}}>
                      <select value={currentTrack.id} onChange={(e) => { const selected = BGM_LIBRARY.find(t => t.id === e.target.value); if (selected) { setCurrentTrack(selected); if (!isBgmOn) setIsBgmOn(true); } }} style={{ flex:1, background: '#333', color: '#00ffcc', border: '1px solid #555', borderRadius: '4px', padding: '4px', fontSize:'0.8rem' }}>{currentPlaylist.map(t => <option key={t.id} value={t.id}>{t.title}</option>)}</select>
                      <button onClick={() => setLoopMode(loopMode === 'one' ? 'all' : 'one')} style={{ background: loopMode==='one'?'#00ffcc':'#333', color:loopMode==='one'?'#000':'#fff', border:'1px solid #555', borderRadius:'4px', padding:'4px 8px', cursor:'pointer' }}>{loopMode === 'one' ? '🔂' : '🔁'}</button>
                  </div>
                  <div style={{display:'flex', justifyContent:'center', gap:'15px'}}>
                      <button onClick={playPrevTrack} style={{background:'transparent', border:'none', color:'#fff', cursor:'pointer', fontSize:'1.2rem'}}>⏮</button>
                      <button onClick={() => isBgmOn ? setIsBgmOn(false) : setIsBgmOn(true)} style={{background:'transparent', border:'none', color:'#00ffcc', cursor:'pointer', fontSize:'1.2rem'}}>{isBgmOn ? '⏸' : '▶'}</button>
                      <button onClick={playNextTrack} style={{background:'transparent', border:'none', color:'#fff', cursor:'pointer', fontSize:'1.2rem'}}>⏭</button>
                  </div>
              </div>
              <input type="range" min="0" max="1" step="0.1" value={bgmVolume} onChange={e => setBgmVolume(parseFloat(e.target.value))} style={{ width: '100%', marginBottom:'20px', accentColor:'#00ffcc' }} />
              <div style={{ color: 'white', marginBottom: '10px' }}>ボイス音量</div>
              <input type="range" min="0" max="1" step="0.1" value={voiceVolume} onChange={e => setVoiceVolume(parseFloat(e.target.value))} style={{ width: '100%', accentColor:'#00ffcc' }} />
          </div>
          
          <div style={{ marginTop: '20px', padding: '15px 0', borderTop: '1px solid #333', display: 'flex', flexDirection: 'column', gap: '10px' }}>
            <button onClick={() => setShowContactModal(true)} style={{ width: '100%', padding: '12px', background: '#222', color: 'white', border: '1px solid #444', borderRadius: '8px', fontSize: '0.9rem', cursor: 'pointer', textAlign: 'left', display: 'flex', alignItems: 'center' }}>
                <span style={{ marginRight: '10px', fontSize: '1.2rem' }}>📧</span> お問い合わせ
            </button>
            <button onClick={() => setShowRequestModal(true)} style={{ width: '100%', padding: '12px', background: '#222', color: 'white', border: '1px solid #444', borderRadius: '8px', fontSize: '0.9rem', cursor: 'pointer', textAlign: 'left', display: 'flex', alignItems: 'center' }}>
                <span style={{ marginRight: '10px', fontSize: '1.2rem' }}>📍</span> 場所の追加依頼
            </button>
          </div>
          
          {user && <button onClick={() => { if(confirm('Logout?')) { supabase.auth.signOut(); clearUser(); handleTabChange('map'); }}} style={{ width: '100%', padding: '15px', background: '#222', color: '#ff3366', border: 'none', borderRadius: '10px', fontSize: '1rem', fontWeight: 'bold', marginTop:'30px' }}>ログアウト</button>}
          <div style={{ height: '80px' }}></div> 
        </div>
      );
    }
    return null;
  };

  return (
    <div style={{ width: "100vw", height: "100dvh", background: "black", fontFamily: 'sans-serif', position: 'fixed', top: 0, left: 0, overflow: 'hidden', touchAction: 'none', overscrollBehavior: 'none' }}>
      <audio ref={audioRef} src={currentTrack.url} loop={loopMode === 'one'} onEnded={handleTrackEnded} /> 
      
      {showSplash && <SplashScreen onFinished={handleSplashFinish} />}
      {showTutorial && <TutorialOverlay onClose={() => setShowTutorial(false)} onLanguageSelect={handleLanguageSelect} />}

      {/* お問い合わせモーダル */}
      {showContactModal && (
        <div style={{ position:'fixed', top:0, left:0, width:'100%', height:'100%', background:'rgba(0,0,0,0.8)', zIndex:9999, display:'flex', justifyContent:'center', alignItems:'center' }} onClick={() => setShowContactModal(false)}>
            <div style={{ width:'90%', maxWidth:'400px', background:'#222', padding:'20px', borderRadius:'15px', border:'1px solid #444' }} onClick={e => e.stopPropagation()}>
                <h3 style={{color:'white', marginTop:0}}>📧 お問い合わせ</h3>
                <div style={{color:'white', marginBottom:'5px'}}>メールアドレス (任意)</div>
                <input type="email" value={formEmail} onChange={e => setFormEmail(e.target.value)} style={{width:'100%', padding:'10px', marginBottom:'15px', background:'#333', border:'1px solid #555', color:'white', borderRadius:'5px'}} />
                <div style={{color:'white', marginBottom:'5px'}}>メッセージ</div>
                <textarea value={formMessage} onChange={e => setFormMessage(e.target.value)} rows={5} style={{width:'100%', padding:'10px', marginBottom:'15px', background:'#333', border:'1px solid #555', color:'white', borderRadius:'5px'}}></textarea>
                <div style={{display:'flex', gap:'10px'}}>
                    <button onClick={() => setShowContactModal(false)} style={{flex:1, padding:'10px', background:'#444', color:'white', border:'none', borderRadius:'5px'}}>キャンセル</button>
                    <button onClick={handleContactSubmit} style={{flex:1, padding:'10px', background:'#00ffcc', color:'black', fontWeight:'bold', border:'none', borderRadius:'5px'}}>送信</button>
                </div>
            </div>
        </div>
      )}

      {/* 場所追加依頼モーダル */}
      {showRequestModal && (
        <div style={{ position:'fixed', top:0, left:0, width:'100%', height:'100%', background:'rgba(0,0,0,0.8)', zIndex:9999, display:'flex', justifyContent:'center', alignItems:'center' }} onClick={() => setShowRequestModal(false)}>
            <div style={{ width:'90%', maxWidth:'400px', background:'#222', padding:'20px', borderRadius:'15px', border:'1px solid #444' }} onClick={e => e.stopPropagation()}>
                <h3 style={{color:'white', marginTop:0}}>📍 場所の追加依頼</h3>
                <div style={{color:'white', marginBottom:'5px'}}>場所の名前 / 住所</div>
                <input type="text" value={formPlaceName} onChange={e => setFormPlaceName(e.target.value)} style={{width:'100%', padding:'10px', marginBottom:'15px', background:'#333', border:'1px solid #555', color:'white', borderRadius:'5px'}} />
                <div style={{color:'white', marginBottom:'5px'}}>補足情報 (任意)</div>
                <textarea value={formPlaceDesc} onChange={e => setFormPlaceDesc(e.target.value)} rows={3} style={{width:'100%', padding:'10px', marginBottom:'15px', background:'#333', border:'1px solid #555', color:'white', borderRadius:'5px'}}></textarea>
                <div style={{display:'flex', gap:'10px'}}>
                    <button onClick={() => setShowRequestModal(false)} style={{flex:1, padding:'10px', background:'#444', color:'white', border:'none', borderRadius:'5px'}}>キャンセル</button>
                    <button onClick={handleRequestSubmit} style={{flex:1, padding:'10px', background:'#00ffcc', color:'black', fontWeight:'bold', border:'none', borderRadius:'5px'}}>送信</button>
                </div>
            </div>
        </div>
      )}

      <div style={{ position: 'absolute', top: '15px', left: '15px', zIndex: 10, color: 'white', background: 'rgba(0,0,0,0.6)', padding: '5px 12px', borderRadius: '8px', fontSize: '0.8rem', pointerEvents: 'none', backdropFilter:'blur(5px)', border:'1px solid rgba(255,255,255,0.2)' }}>
        Spots: {accessibleSpotCount}
      </div>

      {!isPremium && !isVipUser(user?.email) && (
        <div style={{ position: 'absolute', top: '50px', left: '50%', transform: 'translateX(-50%)', zIndex: 90, width: '320px', height: '50px', background: 'rgba(255,255,255,0.1)', border: '1px dashed #666', color: '#888', display: 'flex', alignItems: 'center', justifyContent: 'center', fontSize: '0.8rem', pointerEvents: 'none' }}>
          [ここに広告バナーが入ります]
        </div>
      )}

      <div style={{ 
          position: 'absolute', 
          top: isPc ? '50%' : '30%', 
          left: '50%', 
          transform: 'translate(-50%, -50%)', 
          width: '50px', 
          height: '50px', 
          borderRadius: '50%', 
          zIndex: 10, 
          pointerEvents: 'none', 
          border: displayData ? '3px solid #00ffcc' : '2px solid rgba(255, 180, 150, 0.5)', 
          boxShadow: displayData ? '0 0 20px #00ffcc' : '0 0 10px rgba(255, 100, 100, 0.3)', 
          transition: 'all 0.3s ease-out' 
      }} />

      {isPc && (
        <div className="pc-ui-container" style={{ position: 'absolute', bottom: '20px', left: '20px', width: '360px', zIndex: 100, display: 'flex', flexDirection: 'column', pointerEvents: 'none' }}>
          <div style={{ background: 'transparent', borderTopLeftRadius: '15px', borderTopRightRadius: '15px', borderBottom: 'none', maxHeight: isPanelOpen ? '60vh' : '0px', height: 'auto', overflowY: 'auto', transition: 'max-height 0.3s ease-in-out, opacity 0.3s', opacity: isPanelOpen ? 1 : 0, visibility: isPanelOpen ? 'visible' : 'hidden', borderLeft: isPanelOpen ? '1px solid rgba(255,255,255,0.1)' : '0px', borderRight: isPanelOpen ? '1px solid rgba(255,255,255,0.1)' : '0px', borderTop: isPanelOpen ? '1px solid rgba(255,255,255,0.1)' : '0px', padding: isPanelOpen ? '0' : '0px', boxSizing: 'border-box', pointerEvents: 'none' }}>{renderPanelContent()}</div>
          <div className="control-bar" style={{ background: '#111', borderBottomLeftRadius: '15px', borderBottomRightRadius: '15px', borderTopLeftRadius: isPanelOpen ? '0' : '15px', borderTopRightRadius: isPanelOpen ? '0' : '15px', border: '1px solid rgba(255,255,255,0.1)', overflow: 'hidden', boxShadow: '0 4px 20px rgba(0,0,0,0.8)', zIndex: 101, pointerEvents: 'auto' }}>
            <div style={{ padding: '15px', borderBottom: '1px solid #222', display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
              <div style={{ color: 'white', fontWeight: 'bold', fontSize: '1.2rem' }}>GeoVoice</div>
              <div style={{ display: 'flex', gap: '10px' }}>
                <button onClick={togglePlay} style={{ background: '#333', border: 'none', color: isPlaying ? '#00ffcc' : 'white', borderRadius: '50%', width: '35px', height: '35px', cursor: 'pointer', fontSize:'1rem' }}>{isPlaying ? '⏸' : '▶'}</button>
                <button onClick={toggleRideMode} style={{ background: isRideMode?'#ff3366':'#333', border: 'none', color: 'white', borderRadius: '50%', width: '35px', height: '35px', cursor: 'pointer', fontWeight:'bold', fontSize:'0.8rem' }}>{isRideMode?'🛑':'✈️'}</button>
                <button onClick={handleCurrentLocation} style={{ background: '#333', border: 'none', color: '#00ffcc', borderRadius: '50%', width: '35px', height: '35px', cursor: 'pointer', fontSize:'1rem' }}>📍</button>
              </div>
            </div>
            {activeTab === 'search' && (
               <div style={{ padding: '15px', borderBottom:'1px solid #222' }}>
                  <div style={{ display: 'flex', gap: '5px' }}>
                    <input autoFocus type="text" value={inputTheme} onChange={e => setInputTheme(e.target.value)} placeholder={LANGUAGES[currentLang].placeholder} style={{ flex: 1, background: '#222', border: '1px solid #444', color: 'white', padding: '12px', borderRadius: '8px', fontSize:'1rem' }} onKeyDown={e => e.key === 'Enter' && handleGenerate()} />
                    <button onClick={handleGenerate} style={{ background: '#00ffcc', color: 'black', border: 'none', borderRadius: '8px', padding: '0 15px', fontWeight: 'bold' }}>Go</button>
                  </div>
               </div>
            )}
            <div style={{ display: 'flex', borderTop: '1px solid #222', height:'70px', alignItems:'center' }}>
              <NavButton icon="🌍" label="探索" active={activeTab === 'explore'} onClick={() => handleTabChange('explore')} />
              <NavButton icon="♥" label="リスト" active={activeTab === 'fav'} onClick={() => handleTabChange('fav')} />
              <NavButton icon="🎲" label="ブラウズ" active={activeTab === 'browse'} onClick={() => handleTabChange('browse')} />
              <NavButton icon="🔍" label="検索" active={activeTab === 'search'} onClick={() => handleTabChange('search')} />
              <NavButton icon="⚙️" label="設定" active={activeTab === 'settings'} onClick={() => handleTabChange('settings')} />
            </div>
          </div>
        </div>
      )}

      {!isPc && activeTab !== 'map' && activeTab !== 'ride' && activeTab !== 'fav' && activeTab !== null && (
        <>
          {activeTab === 'explore' ? (
            <div style={{ 
                position: 'fixed', bottom: '80px', left: 0, width: '100%', height: '40vh', 
                background: 'rgba(10, 10, 10, 0.95)', zIndex: 200, overflowY: 'auto', 
                borderTopLeftRadius: '20px', borderTopRightRadius: '20px',
                borderTop: '1px solid rgba(255,255,255,0.2)', padding: '15px', boxSizing: 'border-box',
                transition: 'transform 0.3s ease-out'
            }}>
                <button onClick={() => setActiveTab(null)} style={{ position:'absolute', top:'10px', right:'15px', background:'transparent', border:'none', color:'#888', fontSize:'1.2rem', zIndex:201 }}>✕</button>
                {renderPanelContent()}
            </div>
          ) : (
            <div style={{ position: 'fixed', top: 0, left: 0, width: '100%', height: 'calc(100% - 80px)', background: '#111', zIndex: 200, overflowY: 'auto', padding: '20px', boxSizing: 'border-box' }}>
              <button onClick={() => setActiveTab(null)} style={{ position:'absolute', top:'15px', right:'15px', background:'transparent', border:'none', color:'#888', fontSize:'1.5rem', zIndex:201 }}>✕</button>
              {renderPanelContent()}
              {activeTab === 'search' && (
                 <div style={{marginTop:'40px'}}>
                   <h2 style={{color:'#fff', marginTop:0, marginBottom:'20px'}}>検索</h2>
                   <div style={{ display: 'flex', gap: '5px' }}>
                      <input autoFocus type="text" value={inputTheme} onChange={e => setInputTheme(e.target.value)} placeholder={LANGUAGES[currentLang].placeholder} style={{ flex: 1, background: '#222', border: '1px solid #444', color: 'white', padding: '12px', borderRadius: '8px', fontSize:'1rem' }} onKeyDown={e => e.key === 'Enter' && handleGenerate()} />
                      <button onClick={handleGenerate} style={{ background: '#00ffcc', color: 'black', border: 'none', borderRadius: '8px', padding: '0 15px', fontWeight: 'bold' }}>Go</button>
                   </div>
                 </div>
              )}
            </div>
          )}
        </>
      )}

      {!isPc && (
        <div style={{ position: 'fixed', bottom: 0, left: 0, width: '100%', height: '80px', background: 'rgba(0, 0, 0, 0.95)', borderTop: '1px solid #333', display: 'flex', justifyContent: 'space-around', alignItems: 'center', zIndex: 100, paddingBottom: 'env(safe-area-inset-bottom)' }}>
          <NavButton icon="🌍" label="探索" active={activeTab === 'explore'} onClick={() => handleTabChange('explore')} />
          <NavButton icon="♥" label="リスト" active={activeTab === 'fav'} onClick={() => handleTabChange('fav')} />
          <NavButton icon="🎲" label="ブラウズ" active={activeTab === 'browse'} onClick={() => handleTabChange('browse')} />
          <NavButton icon="🔍" label="検索" active={activeTab === 'search'} onClick={() => handleTabChange('search')} />
          <NavButton icon="⚙️" label="設定" active={activeTab === 'settings'} onClick={() => handleTabChange('settings')} />
        </div>
      )}

      {!isPc && (activeTab === null || activeTab === 'map') && (
        <div style={{ position: 'absolute', bottom: '210px', left: '20px', right:'20px', display:'flex', justifyContent:'space-between', zIndex:110 }}>
            <div style={{display:'flex', gap:'10px'}}>
                <button onClick={handleCurrentLocation} style={{ width: '50px', height: '50px', background: '#222', border: '1px solid #444', borderRadius: '50%', color: '#00ffcc', fontSize: '1.5rem', boxShadow: '0 4px 10px black', cursor: 'pointer' }}>📍</button>
                <button onClick={togglePlay} style={{ width: '50px', height: '50px', background: '#222', border: '1px solid #444', borderRadius: '50%', color: isPlaying ? '#00ffcc' : 'white', fontSize: '1.2rem', boxShadow: '0 4px 10px black', cursor: 'pointer' }}>{isPlaying ? '⏸' : '▶'}</button>
            </div>
            <div style={{display:'flex', gap:'10px'}}>
                {isRideMode ? (
                    <>
                        <button onClick={toggleRideMode} style={{ width: '50px', height: '50px', background: '#ff3366', border: '2px solid white', borderRadius: '50%', color: 'white', fontSize: '1.2rem', boxShadow: '0 4px 10px black', cursor: 'pointer' }}>🛑</button>
                        <button onClick={handleNextRide} style={{ height: '50px', padding:'0 20px', background: 'white', color:'black', border: 'none', borderRadius: '25px', fontWeight:'bold', boxShadow: '0 4px 10px black' }}>⏩</button>
                    </>
                ) : (
                    <button onClick={toggleRideMode} style={{ width: '50px', height: '50px', background: '#00aaff', border: '2px solid white', borderRadius: '50%', color: 'white', fontSize: '1.2rem', boxShadow: '0 4px 10px black', cursor: 'pointer' }}>✈️</button>
                )}
            </div>
        </div>
      )}

      {selectedLocation && displayData && (activeTab === null || activeTab === 'map' || isPc) && (
        <>
          {!isPc && displayData.image_url && !imgError && (
            <div style={{ position: 'absolute', top: '40px', left: '10px', right: '10px', height: '160px', borderRadius: '15px', overflow: 'hidden', boxShadow: '0 4px 20px rgba(0,0,0,0.5)', zIndex: 10, pointerEvents: 'none', border: '1px solid rgba(255,255,255,0.1)', background: '#000' }}>
              {imgLoading && <div style={{width:'100%', height:'100%', display:'flex', alignItems:'center', justifyContent:'center', color:'#666'}}>Loading...</div>}
              <img 
                src={displayData.image_url} 
                alt={displayData.name} 
                style={{ width: '100%', height: '100%', objectFit: 'cover', opacity: imgLoading ? 0 : 1 }}
                onError={() => setImgError(true)}
                onLoad={() => {
                    setImgLoading(false);
                    imageCacheRef.current.add(displayData.image_url);
                }}
                loading="eager"
                fetchPriority="high"
              />
              <div style={{ position: 'absolute', bottom: 0, left: 0, width: '100%', height: '50px', background: 'linear-gradient(to top, rgba(0,0,0,0.7), transparent)' }} />
            </div>
          )}
          <div onMouseDown={handleMouseDown} style={{ 
              position: 'absolute', left: isPc ? (popupPos?.x || (window.innerWidth - 420)) : '10px', top: isPc ? (popupPos?.y || 20) : 'auto', right: isPc ? 'auto' : '10px', bottom: isPc ? 'auto' : '290px', transform: isPc ? 'none' : 'none', 
              background: 'rgba(10, 10, 10, 0.95)', padding: '20px', borderRadius: '20px', color: 'white', textAlign: 'center', backdropFilter: 'blur(10px)', border: '1px solid rgba(255, 255, 255, 0.2)', zIndex: 10, width: isPc ? '400px' : 'auto', maxWidth: isPc ? '360px' : 'none', maxHeight: isPc ? 'none' : '40vh', boxShadow: '0 4px 30px rgba(0,0,0,0.6)', resize: isPc ? 'both' : 'none', overflow: isPc ? 'auto' : 'hidden', display: 'flex', flexDirection: 'column', cursor: isPc ? (isDragging ? 'grabbing' : 'grab') : 'default', animation: isDragging ? 'none' : 'fadeIn 0.3s'
            }}>
            {isPc && displayData.image_url && !imgError && (
              <div style={{ width: '100%', height: '140px', marginBottom: '10px', borderRadius: '12px', overflow: 'hidden', position: 'relative', flexShrink: 0, background:'#000' }}>
                {imgLoading && <div style={{width:'100%', height:'100%', display:'flex', alignItems:'center', justifyContent:'center', color:'#666'}}>Loading...</div>}
                <img 
                    src={displayData.image_url} 
                    alt={displayData.name} 
                    style={{ width: '100%', height: '100%', objectFit: 'cover', opacity: imgLoading ? 0 : 1 }} 
                    onError={() => setImgError(true)}
                    onLoad={() => {
                        setImgLoading(false);
                        imageCacheRef.current.add(displayData.image_url);
                    }}
                    loading="eager"
                    fetchPriority="high"
                />
              </div>
            )}
            <div style={{ position: 'absolute', top: '10px', right: '10px', zIndex: 5 }}>
              <button onMouseDown={e => e.stopPropagation()} onClick={() => toggleFavorite(null)} style={{ background: favorites.has(displayData.id) ? '#ff3366' : '#333', color: 'white', border: '2px solid white', borderRadius: '50%', width: '40px', height: '40px', cursor: 'pointer', fontSize: '1.2rem', boxShadow: '0 4px 10px rgba(0,0,0,0.5)', transition: 'all 0.2s' }}>{favorites.has(displayData.id) ? '♥' : '♡'}</button>
            </div>
            <div style={{ fontSize: '1.2rem', fontWeight: 'bold', color: '#ffccaa', marginBottom: '5px', flexShrink: 0 }}>{displayData.name.split('#')[0].trim()}</div>
            <div style={{ display: 'flex', justifyContent: 'center', alignItems: 'center', gap: '8px', marginBottom: '10px', flexShrink: 0, flexWrap: 'wrap' }}>
              {(displayData.country_ja || displayData.country) && (<span style={{ fontSize: '0.8rem', padding: '2px 10px', borderRadius: '12px', backgroundColor: '#333', border: '1px solid #888', color: '#eee', fontWeight: 'bold' }}>{displayData.country_ja || displayData.country}</span>)}
              {(() => { const { tag, color } = getCategoryDetails(displayData.category); return (<span style={{ fontSize: '0.8rem', padding: '2px 10px', borderRadius: '12px', backgroundColor: color, color: '#000', fontWeight: 'bold', boxShadow: '0 0 5px '+color }}>#{tag}</span>); })()}
              {displayData.needsTranslation && (<button onMouseDown={e => e.stopPropagation()} onClick={() => translateAndFix(displayData, currentLang)} style={{ background: '#00ffcc', color: 'black', border: 'none', borderRadius: '4px', padding: '2px 10px', fontSize: '0.8rem', fontWeight: 'bold', cursor: 'pointer' }}>🔄 翻訳</button>)}
            </div>
            <div style={{ overflowY: 'auto', flex: 1, touchAction: 'pan-y', paddingBottom: '10px' }} onMouseDown={e => e.stopPropagation()}>
              <p style={{ margin: 0, fontSize: '0.85rem', color: '#ddd', lineHeight: '1.6', textAlign: 'left' }}>{displayData.description}</p>
            </div>
            {isPc && <button onClick={() => { if (!isRideMode) setIsRideMode(true); nextRideStep(); }} style={{ marginTop:'10px', width:'100%', padding:'10px', background:'#333', color:'white', border:'1px solid #555', borderRadius:'5px' }}>⏩ {isRideMode ? '次へスキップ' : 'ツアーを開始'}</button>}
            {!isPc && isRideMode && <button onClick={handleNextRide} style={{ marginTop:'10px', width:'100%', padding:'10px', background:'#333', color:'white', border:'1px solid #555', borderRadius:'5px' }}>⏩ 次へスキップ</button>}
          </div>
        </>
      )}

      <MemoizedMap 
        mapRef={mapRef} 
        mapboxAccessToken={MAPBOX_TOKEN} 
        initialViewState={initialViewState} 
        onMoveEnd={handleMoveEnd} 
        onClick={handleMapClick}
        geoJsonData={filteredGeoJsonData} 
        onError={(e) => addLog(`Map Error: ${e.error.message}`)} 
        padding={isPc ? {} : { bottom: window.innerHeight * 0.4 }} 
        cursor={cursor}
        onMouseEnter={onMouseEnter}
        onMouseLeave={onMouseLeave}
        style={MAP_CONTAINER_STYLE}
        interactiveLayerIds={['point-glow', 'point-core']}
      />
    </div>
  );
};

const NavButton = ({ icon, label, active, onClick }) => (
  <div onClick={onClick} style={{ display: 'flex', flexDirection: 'column', alignItems: 'center', justifyContent:'center', cursor: 'pointer', color: active ? '#00ffcc' : '#888', width: '20%', height:'100%', transition: 'all 0.2s', borderBottom: active ? '3px solid #00ffcc' : '3px solid transparent' }}>
    <div style={{ fontSize: active ? '1.5rem' : '1.3rem', marginBottom: '2px', transition: 'all 0.2s' }}>{icon}</div>
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