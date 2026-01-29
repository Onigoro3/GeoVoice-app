// src/components/Globe.jsx

import React, { useRef, useState, useMemo, useEffect } from 'react';
import Map, { Source, Layer } from 'react-map-gl';
import { mockLocations } from '../data/locations';

// ★修正: .env からトークンを読み込む
const MAPBOX_TOKEN = import.meta.env.VITE_MAPBOX_TOKEN;

const Globe = () => {
  const mapRef = useRef(null);
  const [selectedLocation, setSelectedLocation] = useState(null);
  const [isPlaying, setIsPlaying] = useState(false); // 読み上げ中かどうかのフラグ
  const [viewState, setViewState] = useState({
    longitude: 135,
    latitude: 35,
    zoom: 1.5,
  });

  // --- 音声合成（読み上げ）機能 ---
  const speak = (text) => {
    // ブラウザの読み上げ機能をキャンセル（前の音声を止める）
    window.speechSynthesis.cancel();

    if (!text) {
      setIsPlaying(false);
      return;
    }

    const utterance = new SpeechSynthesisUtterance(text);
    utterance.lang = 'ja-JP'; // 日本語設定
    utterance.rate = 1.0; // 読み上げ速度
    utterance.pitch = 1.0; // 声の高さ

    // 読み上げ開始時のイベント
    utterance.onstart = () => setIsPlaying(true);
    // 読み上げ終了時のイベント
    utterance.onend = () => setIsPlaying(false);

    window.speechSynthesis.speak(utterance);
  };

  // 選択場所が変わった時に読み上げを実行
  useEffect(() => {
    if (selectedLocation) {
      // 少し遅延させてから読み上げ（スナップ直後の落ち着きを待つ）
      const timer = setTimeout(() => {
        speak(selectedLocation.description);
      }, 500);
      return () => clearTimeout(timer);
    } else {
      // 選択が解除されたら読み上げストップ
      window.speechSynthesis.cancel();
      setIsPlaying(false);
    }
  }, [selectedLocation]);

  // --- データ変換 (GeoJSON) ---
  const geoJsonData = useMemo(() => {
    return {
      type: 'FeatureCollection',
      features: mockLocations.map(loc => ({
        type: 'Feature',
        geometry: { type: 'Point', coordinates: [loc.lon, loc.lat] },
        properties: { ...loc }
      }))
    };
  }, []);

  // --- スナップ機能 ---
  const handleMoveEnd = (evt) => {
    if (!evt.originalEvent) return;
    const map = mapRef.current?.getMap();
    if (!map) return;

    const center = map.project(map.getCenter());
    const snapRadius = 80;
    let bestTarget = null;
    let minDist = snapRadius;

    mockLocations.forEach(loc => {
      const projected = map.project([loc.lon, loc.lat]);
      const dx = projected.x - center.x;
      const dy = projected.y - center.y;
      const dist = Math.sqrt(dx * dx + dy * dy);

      if (dist < minDist) {
        minDist = dist;
        bestTarget = loc;
      }
    });

    if (bestTarget) {
      setSelectedLocation(bestTarget);
      map.flyTo({
        center: [bestTarget.lon, bestTarget.lat],
        essential: true,
        speed: 0.6,
        curve: 1.5,
      });
    } else {
      setSelectedLocation(null);
    }
  };

  return (
    <div style={{ width: "100vw", height: "100vh", position: "relative", backgroundColor: "black" }}>
      
      {/* UI: 照準（枠） */}
      <div style={{
        position: 'absolute',
        top: '50%', left: '50%',
        transform: 'translate(-50%, -50%)',
        width: '80px', height: '80px',
        borderRadius: '50%',
        zIndex: 10,
        pointerEvents: 'none',
        border: selectedLocation ? '2px solid #fff' : '2px solid rgba(255, 180, 150, 0.5)',
        boxShadow: selectedLocation ? '0 0 20px #fff' : '0 0 10px rgba(255, 100, 100, 0.3)',
        transition: 'all 0.3s ease',
      }} />

      {/* UI: ポップアップ */}
      {selectedLocation && (
        <div style={{
          position: 'absolute',
          bottom: '15%', left: '50%',
          transform: 'translateX(-50%)',
          backgroundColor: 'rgba(10, 10, 10, 0.85)',
          padding: '20px 30px', borderRadius: '20px',
          color: 'white', textAlign: 'center',
          backdropFilter: 'blur(10px)',
          border: '1px solid rgba(255, 255, 255, 0.2)',
          zIndex: 10, minWidth: '240px',
          boxShadow: '0 4px 30px rgba(0,0,0,0.5)',
          animation: 'fadeIn 0.5s ease'
        }}>
          {/* 再生中インジケーター */}
          <div style={{ 
            marginBottom: '10px', 
            fontSize: '12px', 
            color: isPlaying ? '#00ffcc' : '#888',
            display: 'flex', alignItems: 'center', justifyContent: 'center', gap: '5px'
          }}>
            {isPlaying ? (
              <>
                <span className="pulse">●</span> ON AIR
              </>
            ) : (
              <span>● READY</span>
            )}
          </div>

          <h3 style={{ margin: '0 0 8px 0', color: '#ffccaa', fontSize: '1.2rem' }}>{selectedLocation.name}</h3>
          <p style={{ margin: 0, fontSize: '0.9rem', color: '#ddd', lineHeight: '1.5' }}>{selectedLocation.description}</p>
        </div>
      )}

      {/* Mapbox 本体 */}
      <Map
        ref={mapRef}
        mapboxAccessToken={MAPBOX_TOKEN}
        initialViewState={viewState}
        projection="globe"
        mapStyle="mapbox://styles/mapbox/satellite-v9"
        fog={{
          range: [0.5, 10],
          color: 'rgba(255, 255, 255, 0)',
          'high-color': '#000',
          'space-color': '#000',
          'star-intensity': 0.6
        }}
        terrain={{ source: 'mapbox-dem', exaggeration: 1.5 }}
        onMoveEnd={handleMoveEnd}
        onMove={evt => setViewState(evt.viewState)}
        style={{ width: '100%', height: '100%' }}
      >
        <Source
          id="mapbox-dem"
          type="raster-dem"
          url="mapbox://mapbox.mapbox-terrain-dem-v1"
          tileSize={512}
          maxzoom={14}
        />

        <Source id="my-locations" type="geojson" data={geoJsonData}>
          {/* 光彩 */}
          <Layer
            id="point-glow"
            type="circle"
            paint={{
              'circle-radius': 15,
              'circle-color': '#ffaa88',
              'circle-opacity': 0.4,
              'circle-blur': 0.8,
            }}
          />
          {/* 芯 */}
          <Layer
            id="point-core"
            type="circle"
            paint={{
              'circle-radius': 6,
              'circle-color': '#fff',
              'circle-opacity': 1,
            }}
          />
        </Source>
      </Map>
      
      {/* CSSアニメーション (点滅用) */}
      <style>{`
        @keyframes fadeIn {
          from { opacity: 0; transform: translateX(-50%) translateY(10px); }
          to { opacity: 1; transform: translateX(-50%) translateY(0); }
        }
        .pulse {
          animation: pulse 1s infinite;
        }
        @keyframes pulse {
          0% { opacity: 1; }
          50% { opacity: 0.3; }
          100% { opacity: 1; }
        }
      `}</style>
    </div>
  );
};

export default Globe;