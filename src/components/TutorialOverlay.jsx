import React, { useState } from 'react';

const TutorialOverlay = ({ onClose, onLanguageSelect }) => {
  const [step, setStep] = useState(0); // 0: 言語選択, 1~3: 説明

  const handleLang = (lang) => {
    onLanguageSelect(lang);
    setStep(1);
  };

  const handleNext = () => {
    if (step < 3) setStep(step + 1);
    else {
      localStorage.setItem('hasSeenTutorial', 'true');
      onClose();
    }
  };

  return (
    <div style={{
      position: 'fixed', top: 0, left: 0, width: '100%', height: '100%',
      backgroundColor: 'rgba(0,0,0,0.9)', zIndex: 10000,
      display: 'flex', flexDirection: 'column', justifyContent: 'center', alignItems: 'center',
      color: 'white', textAlign: 'center', padding: '20px', boxSizing: 'border-box'
    }}>
      {/* ステップ0: 言語選択 */}
      {step === 0 && (
        <div style={{ animation: 'fadeIn 0.5s' }}>
          <h1 style={{ fontSize: '2rem', marginBottom: '40px', background: 'linear-gradient(90deg, #fff, #00ffcc)', backgroundClip: 'text', WebkitBackgroundClip: 'text', color: 'transparent' }}>
            Welcome to GeoVoice
          </h1>
          <p style={{ marginBottom: '20px', color: '#aaa' }}>言語を選択 / Select Language</p>
          <div style={{ display: 'flex', flexDirection: 'column', gap: '15px', width: '200px' }}>
            <button onClick={() => handleLang('ja')} style={langBtnStyle}>🇯🇵 日本語</button>
            <button onClick={() => handleLang('en')} style={langBtnStyle}>🇺🇸 English</button>
            <button onClick={() => handleLang('zh')} style={langBtnStyle}>🇨🇳 中文</button>
            <button onClick={() => handleLang('es')} style={langBtnStyle}>🇪🇸 Español</button>
            <button onClick={() => handleLang('fr')} style={langBtnStyle}>🇫🇷 Français</button>
          </div>
        </div>
      )}

      {/* ステップ1~3: チュートリアル */}
      {step > 0 && (
        <div style={{ animation: 'fadeIn 0.5s', width: '100%' }}>
          <div style={{ width: '100%', height: '200px', position: 'relative', marginBottom: '30px' }}>
            {step === 1 && <div className="hand-drag">👆</div>}
            {step === 2 && (
              <>
                <div className="dot-pulse" style={{ position: 'absolute', top: '50%', left: '50%', transform: 'translate(-50%, -50%)' }}></div>
                <div className="hand-tap">👆</div>
              </>
            )}
            {step === 3 && <div style={{ fontSize: '5rem' }}>🚀</div>}
          </div>

          <h2 style={{ fontSize: '1.5rem', marginBottom: '10px', color: '#00ffcc' }}>
            {step === 1 && "地図を動かそう"}
            {step === 2 && "スポットを探そう"}
            {step === 3 && "準備OK！"}
          </h2>
          <p style={{ fontSize: '1rem', lineHeight: '1.6', marginBottom: '40px', color: '#ddd' }}>
            {step === 1 && "画面をドラッグして、\n世界中を自由に飛び回れます。"}
            {step === 2 && "地図上の「数字」はスポットの塊です。\nズームするとバラけて詳細が見えます。"}
            {step === 3 && "さあ、あなただけの\n地球儀の旅に出かけましょう！"}
          </p>

          <button onClick={handleNext} style={{
            padding: '12px 40px', background: '#00ffcc', color: 'black',
            border: 'none', borderRadius: '30px', fontSize: '1.1rem', fontWeight: 'bold', cursor: 'pointer',
            boxShadow: '0 0 15px rgba(0, 255, 204, 0.6)'
          }}>
            {step === 3 ? "始める" : "次へ"}
          </button>
        </div>
      )}

      <style>{`
        @keyframes fadeIn { from { opacity: 0; transform: translateY(10px); } to { opacity: 1; transform: translateY(0); } }
        .hand-drag { position: absolute; top: 60%; left: 30%; font-size: 4rem; animation: dragMove 2s infinite ease-in-out; }
        @keyframes dragMove { 0% { left: 30%; top: 60%; transform: rotate(0deg); } 50% { left: 70%; top: 40%; transform: rotate(-10deg); } 100% { left: 30%; top: 60%; transform: rotate(0deg); } }
        .hand-tap { position: absolute; top: 60%; left: 50%; font-size: 4rem; transform: translateX(-50%); animation: tapMove 1.5s infinite; }
        @keyframes tapMove { 0% { top: 60%; transform: translateX(-50%) scale(1); } 50% { top: 50%; transform: translateX(-50%) scale(0.9); } 100% { top: 60%; transform: translateX(-50%) scale(1); } }
        .dot-pulse { width: 20px; height: 20px; background: #ffcc00; border-radius: 50%; box-shadow: 0 0 0 rgba(255, 204, 0, 0.4); animation: pulseDot 1.5s infinite; }
        @keyframes pulseDot { 0% { box-shadow: 0 0 0 0 rgba(255, 204, 0, 0.7); } 70% { box-shadow: 0 0 0 20px rgba(255, 204, 0, 0); } 100% { box-shadow: 0 0 0 0 rgba(255, 204, 0, 0); } }
      `}</style>
    </div>
  );
};

const langBtnStyle = {
  padding: '15px', background: '#333', color: 'white', border: '1px solid #555',
  borderRadius: '10px', fontSize: '1.1rem', cursor: 'pointer', transition: '0.2s',
  textAlign: 'left'
};

export default TutorialOverlay;