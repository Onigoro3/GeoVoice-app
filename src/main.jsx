import React from 'react';
import ReactDOM from 'react-dom/client';
import App from './App';
import './index.css';
// ★追加: これがないと実機で地図が表示されません！
import 'mapbox-gl/dist/mapbox-gl.css'; 

import { registerSW } from 'virtual:pwa-register';

// PWAの自動更新設定
const updateSW = registerSW({
  onNeedRefresh() {
    if (confirm("新しいコンテンツが利用可能です。更新しますか？")) {
      updateSW(true);
    }
  },
  onOfflineReady() {
    console.log("App is ready to work offline.");
  },
});

ReactDOM.createRoot(document.getElementById('root')).render(
  <React.StrictMode>
    <App />
  </React.StrictMode>
);