import React, { useState, useEffect } from 'react';

const LANGUAGES = {
  ja: { label: '🇯🇵 日本語' },
  en: { label: '🇺🇸 English' },
  zh: { label: '🇨🇳 中文' },
  es: { label: '🇪🇸 Español' },
  fr: { label: '🇫🇷 Français' },
};

const TutorialOverlay = ({ onClose, onLanguageSelect }) => {
  const [step, setStep] = useState(1);
  const [isFadingOut, setIsFadingOut] = useState(false);

  const totalSteps = 4;

  const handleNext = () => {
    if (step < totalSteps) {
      setStep(s => s + 1);
    }
  };

  const handleLanguageClick = (langKey) => {
    setIsFadingOut(true);
    onLanguageSelect(langKey);
    setTimeout(() => {
      onClose();
    }, 800); // アニメーション終了に合わせて閉じる
  };

  // CSSアニメーション定義
  const styles = `
    @keyframes fadeIn { from { opacity: 0; transform: translateY(20px); } to { opacity: 1; transform: translateY(0); } }
    @keyframes fadeOut { from { opacity: 1; } to { opacity: 0; } }
    @keyframes float { 0% { transform: translateY(0px) rotate(0deg); } 50% { transform: translateY(-15px) rotate(2deg); } 100% { transform: translateY(0px) rotate(0deg); } }
    @keyframes pulse { 0% { transform: scale(1); opacity: 0.8; } 50% { transform: scale(1.1); opacity: 1; } 100% { transform: scale(1); opacity: 0.8; } }
    @keyframes slideInRight { from { transform: translateX(50px); opacity: 0; } to { transform: translateX(0); opacity: 1; } }

    .tutorial-overlay {
      position: fixed; top: 0; left: 0; width: 100%; height: 100%;
      background: radial-gradient(circle at center, #1a1a2e 0%, #000000 100%);
      z-index: 9999; display: flex; flex-direction: column; justify-content: center; alignItems: center;
      color: white; padding: 20px; box-sizing: border-box;
      transition: opacity 0.8s ease-out;
    }
    .tutorial-overlay.fading-out { opacity: 0; pointer-events: none; }

    .content-box {
      text-align: center; max-width: 500px; width: 100%;
      animation: fadeIn 0.8s ease-out;
    }
    
    .step-icon {
      font-size: 5rem; margin-bottom: 20px; display: inline-block;
      filter: drop-shadow(0 0 15px rgba(0,255,204,0.5));
    }
    .float-anim { animation: float 4s ease-in-out infinite; }
    .pulse-anim { animation: pulse 2s ease-in-out infinite; }

    h1 { font-size: 2.2rem; margin-bottom: 15px; background: linear-gradient(to right, #fff, #00ffcc); -webkit-background-clip: text; -webkit-text-fill-color: transparent; line-height: 1.3; }
    h2 { font-size: 1.8rem; margin-bottom: 15px; color: #00ffcc; }
    p { font-size: 1.1rem; line-height: 1.8; color: #ccc; margin-bottom: 30px; }
    .highlight { color: #00ffcc; font-weight: bold; }

    .next-button {
      background: linear-gradient(45deg, #00ffcc, #00aaff); border: none; padding: 15px 40px;
      color: #000; font-weight: bold; font-size: 1.2rem; borderRadius: 30px;
      cursor: pointer; box-shadow: 0 5px 20px rgba(0,255,204,0.4);
      transition: transform 0.2s, box-shadow 0.2s; animation: slideInRight 0.5s ease-out 0.5s backwards;
    }
    .next-button:hover { transform: scale(1.05); box-shadow: 0 8px 25px rgba(0,255,204,0.6); }
    .next-button:active { transform: scale(0.95); }

    .lang-grid { display: grid; grid-template-columns: repeat(2, 1fr); gap: 15px; margin-top: 20px; }
    .lang-button {
      background: #111; border: 2px solid #333; color: white; padding: 15px;
      font-size: 1.1rem; borderRadius: 12px; cursor: pointer; transition: all 0.3s;
      display: flex; justify-content: center; alignItems: center;
    }
    .lang-button:hover { border-color: #00ffcc; background: #0a0a0a; box-shadow: 0 0 15px rgba(0,255,204,0.3); transform: translateY(-3px); }

    .step-indicator {
      display: flex; gap: 10px; margin-top: 30px;
    }
    .dot { width: 10px; height: 10px; borderRadius: 50%; background: #333; transition: all 0.3s; }
    .dot.active { background: #00ffcc; transform: scale(1.3); box-shadow: 0 0 10px #00ffcc; }
  `;

  const renderStepContent = () => {
    switch (step) {
      case 1: // 導入
        return (
          <div className="content-box" key="step1">
            <div className="step-icon float-anim">🌍</div>
            <h1>時空を超える旅へ、<br />ようこそ。</h1>
            <p>GeoVoiceは、世界中のあらゆる場所と時代を巡る<br />新感覚の<span className="highlight">AI音声ガイドアプリ</span>です。</p>
            <button className="next-button" onClick={handleNext}>旅を始める ▶</button>
          </div>
        );
      case 2: // AIガイド
        return (
          <div className="content-box" key="step2">
            <div className="step-icon pulse-anim" style={{fontSize:'4rem'}}>🔊</div>
            <h2>あなた専用のAIガイド</h2>
            <p>訪れる場所の歴史や物語を、<br />AIが自動で語りかけます。<br />（再生ボタンでいつでも聞けます）</p>
            <button className="next-button" onClick={handleNext}>次へ ▶</button>
          </div>
        );
      case 3: // 探索方法
        return (
          <div className="content-box" key="step3">
            <div className="step-icon float-anim" style={{fontSize:'4rem'}}>👆🗺️</div>
            <h2>世界を自由に探索</h2>
            <p>地図を動かして、光るスポットをタップ。<br />または「ブラウズ」からツアーに出かけましょう。</p>
            <button className="next-button" onClick={handleNext}>準備OK ▶</button>
          </div>
        );
      case 4: // 言語選択 (最終ステップ)
        return (
          <div className="content-box" key="step4">
            <div className="step-icon float-anim">🗣️</div>
            <h2>言語を選択してください</h2>
            <p>Select your language to start the journey.</p>
            <div className="lang-grid">
              {Object.entries(LANGUAGES).map(([key, { label }]) => (
                <button key={key} className="lang-button" onClick={() => handleLanguageClick(key)}>
                  {label}
                </button>
              ))}
            </div>
          </div>
        );
      default:
        return null;
    }
  };

  return (
    <>
      <style>{styles}</style>
      <div className={`tutorial-overlay ${isFadingOut ? 'fading-out' : ''}`}>
        {renderStepContent()}
        {step < totalSteps && (
          <div className="step-indicator">
            {[...Array(totalSteps)].map((_, i) => (
              <div key={i} className={`dot ${step === i + 1 ? 'active' : ''}`} />
            ))}
          </div>
        )}
      </div>
    </>
  );
};

export default TutorialOverlay;