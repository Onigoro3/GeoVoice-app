import React from 'react';
import Globe from './components/Globe';

function App() {
  return (
    <div>
      {/* 地球儀を表示 */}
      <Globe />
      
      {/* 仮のタイトル表示 (UIレイヤー) */}
      <div style={{ 
        position: 'absolute', 
        top: 20, 
        left: 20, 
        color: 'white', 
        zIndex: 100,
        fontFamily: 'sans-serif',
        textShadow: '2px 2px 4px rgba(0,0,0,0.8)'
      }}>
        <h1>GeoVoice</h1>
        <p>Earth Experience Prototype</p>
      </div>
    </div>
  );
}

export default App;