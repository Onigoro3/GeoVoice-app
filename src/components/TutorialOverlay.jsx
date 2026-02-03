import React, { useState } from 'react';

const LANGUAGES = {
  ja: { label: '🇯🇵 日本語' },
  en: { label: '🇺🇸 English' },
  zh: { label: '🇨🇳 中文' },
  es: { label: '🇪🇸 Español' },
  fr: { label: '🇫🇷 Français' },
};

// 言語ごとのテキストデータ
const TUTORIAL_TEXTS = {
  ja: {
    step2: { title: '時空を超える旅へ、<br />ようこそ。', desc: 'GeoVoiceは、世界中のあらゆる場所と時代を巡る<br />新感覚の<span className="highlight">AI音声ガイドアプリ</span>です。', btn: '旅を始める ▶' },
    step3: { title: 'あなた専用のAIガイド', desc: '訪れる場所の歴史や物語を、<br />AIが自動で語りかけます。<br />（再生ボタンでいつでも聞けます）', btn: '次へ ▶' },
    step4: { title: '世界を自由に探索', desc: '地図を動かして、光るスポットをタップ。<br />または「ブラウズ」からツアーに出かけましょう。', btn: '準備OK ▶' }
  },
  en: {
    step2: { title: 'Welcome to a journey<br />across time and space.', desc: 'GeoVoice is a new <span className="highlight">AI audio guide app</span><br />that takes you to places and eras around the world.', btn: 'Start Journey ▶' },
    step3: { title: 'Your Personal AI Guide', desc: 'The AI automatically narrates the history<br />and stories of the places you visit.<br />(You can listen anytime via the play button)', btn: 'Next ▶' },
    step4: { title: 'Explore Freely', desc: 'Move the map and tap glowing spots.<br />Or go on a tour from the "Browse" tab.', btn: 'Ready! ▶' }
  },
  // 他の言語も必要に応じて追加（デフォルトは英語にフォールバックします）
  zh: {
    step2: { title: '欢迎踏上<br />超越时空的旅程', desc: 'GeoVoice 是一款带您游览世界各地和各个时代的<br />新感觉<span className="highlight">AI语音导览应用</span>。', btn: '开始旅程 ▶' },
    step3: { title: '您的专属 AI 导游', desc: 'AI 会自动为您讲述所到之处的历史和故事。<br />（点击播放按钮即可随时收听）', btn: '下一步 ▶' },
    step4: { title: '自由探索世界', desc: '移动地图，点击发光点。<br />或者从“浏览”标签开始游览。', btn: '准备好了 ▶' }
  }
};

const TutorialOverlay = ({ onClose, onLanguageSelect }) => {
  const [step, setStep] = useState(1);
  const [isFadingOut, setIsFadingOut] = useState(false);
  const [currentLang, setCurrentLang] = useState('ja'); // 選択中の言語（表示用）

  const totalSteps = 4;

  const handleNext = () => {
    if (step < totalSteps) {
      setStep(s => s + 1);
    } else {
      // 終了処理
      setIsFadingOut(true);
      setTimeout(() => {
        onClose();
      }, 800);
    }
  };

  const handleLanguageClick = (langKey) => {
    setCurrentLang(langKey);
    onLanguageSelect(langKey); // 親コンポーネント（Globe.jsx）に通知
    setStep(2); // ステップ2へ進む
  };

  // テキスト取得ヘルパー
  const getText = (stepKey) => {
    const texts = TUTORIAL_TEXTS[currentLang] || TUTORIAL_TEXTS['en'] || TUTORIAL_TEXTS['ja'];
    return texts[stepKey];
  };

  const styles = `
    @keyframes fadeIn { from { opacity: 0; transform: translateY(20px); } to { opacity: 1; transform: translateY(0); } }
    .tutorial-overlay { position: fixed; top: 0; left: 0; width: 100%; height: 100%; background: radial-gradient(circle at center, #1a1a2e 0%, #000000 100%); z-index: 9999; display: flex; flex-direction: column; justify-content: center; alignItems: center; color: white; padding: 20px; box-sizing: border-box; transition: opacity 0.8s ease-out; }
    .tutorial-overlay.fading-out { opacity: 0; pointer-events: none; }
    .content-box { text-align: center; max-width: 500px; width: 100%; animation: fadeIn 0.8s ease-out; }
    .step-icon { font-size: 5rem; margin-bottom: 20px; display: inline-block; filter: drop-shadow(0 0 15px rgba(0,255,204,0.5)); }
    .float-anim { animation: float 4s ease-in-out infinite; }
    .pulse-anim { animation: pulse 2s ease-in-out infinite; }
    h1 { font-size: 2.2rem; margin-bottom: 15px; background: linear-gradient(to right, #fff, #00ffcc); -webkit-background-clip: text; -webkit-text-fill-color: transparent; line-height: 1.3; }
    h2 { font-size: 1.8rem; margin-bottom: 15px; color: #00ffcc; }
    p { font-size: 1.1rem; line-height: 1.8; color: #ccc; margin-bottom: 30px; }
    .highlight { color: #00ffcc; font-weight: bold; }
    .next-button { background: linear-gradient(45deg, #00ffcc, #00aaff); border: none; padding: 15px 40px; color: #000; font-weight: bold; font-size: 1.2rem; border-radius: 30px; cursor: pointer; box-shadow: 0 5px 20px rgba(0,255,204,0.4); transition: transform 0.2s, box-shadow 0.2s; }
    .next-button:hover { transform: scale(1.05); }
    .lang-grid { display: grid; grid-template-columns: repeat(2, 1fr); gap: 15px; margin-top: 20px; }
    .lang-button { background: #111; border: 2px solid #333; color: white; padding: 15px; font-size: 1.1rem; border-radius: 12px; cursor: pointer; transition: all 0.3s; display: flex; justify-content: center; alignItems: center; }
    .lang-button:hover { border-color: #00ffcc; background: #0a0a0a; transform: translateY(-3px); }
    .step-indicator { display: flex; gap: 10px; margin-top: 30px; }
    .dot { width: 10px; height: 10px; border-radius: 50%; background: #333; transition: all 0.3s; }
    .dot.active { background: #00ffcc; transform: scale(1.3); }
    @keyframes float { 0%, 100% { transform: translateY(0); } 50% { transform: translateY(-15px); } }
    @keyframes pulse { 0%, 100% { transform: scale(1); opacity: 0.8; } 50% { transform: scale(1.1); opacity: 1; } }
  `;

  const renderStepContent = () => {
    // ステップ1：言語選択（最初に持ってくる）
    if (step === 1) {
      return (
        <div className="content-box" key="step1">
          <div className="step-icon float-anim">🗣️</div>
          <h2>言語を選択してください</h2>
          <p>Select your language to start.</p>
          <div className="lang-grid">
            {Object.entries(LANGUAGES).map(([key, { label }]) => (
              <button key={key} className="lang-button" onClick={() => handleLanguageClick(key)}>
                {label}
              </button>
            ))}
          </div>
        </div>
      );
    }

    // ステップ2〜4：選んだ言語で表示
    const t = getText(`step${step}`);
    if (!t) return null;

    let icon = '🌍';
    if (step === 3) icon = '🔊';
    if (step === 4) icon = '👆🗺️';

    return (
      <div className="content-box" key={`step${step}`}>
        <div className={`step-icon ${step === 3 ? 'pulse-anim' : 'float-anim'}`}>{icon}</div>
        <h2 dangerouslySetInnerHTML={{ __html: t.title }} />
        <p dangerouslySetInnerHTML={{ __html: t.desc }} />
        <button className="next-button" onClick={handleNext}>{t.btn}</button>
      </div>
    );
  };

  return (
    <>
      <style>{styles}</style>
      <div className={`tutorial-overlay ${isFadingOut ? 'fading-out' : ''}`}>
        {renderStepContent()}
        <div className="step-indicator">
          {[...Array(totalSteps)].map((_, i) => (
            <div key={i} className={`dot ${step === i + 1 ? 'active' : ''}`} />
          ))}
        </div>
      </div>
    </>
  );
};

export default TutorialOverlay;