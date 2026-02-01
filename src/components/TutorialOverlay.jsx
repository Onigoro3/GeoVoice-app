import React, { useState } from 'react';

const TutorialOverlay = ({ onClose }) => {
  const [step, setStep] = useState(1);

  const handleNext = () => {
    if (step < 3) setStep(step + 1);
    else {
      // チュートリアル完了を保存
      localStorage.setItem('hasSeenTutorial', 'true');
      onClose();
    }
  };

  return (
    <div style={{
      position: 'fixed', top: 0, left: 0, width: '100%', height: '100%',
      backgroundColor: 'rgba(0,0,0,0.8)', zIndex: 10000,
      display: 'flex', flexDirection: 'column', justifyContent: 'center', alignItems: 'center',
      color: 'white', textAlign: 'center', padding: '20px', boxSizing: 'border-box'
    }}>
      {/* アニメーション領域 */}
      <div style={{ width: '100%', height: '200px', position: 'relative', marginBottom: '30px' }}>
        {step === 1 && (
          // ドラッグ操作のアニメーション
          <div className="hand-drag">👆</div>
        )}
        {step === 2 && (
          // タップ操作のアニメーション
          <>
            <div className="dot-pulse" style={{ position: 'absolute', top: '50%', left: '50%', transform: 'translate(-50%, -50%)' }}></div>
            <div className="hand-tap">👆</div>
          </>
        )}
        {step === 3 && (
          <div style={{ fontSize: '5rem' }}>🚀</div>
        )}
      </div>

      {/* テキスト領域 */}
      <h2 style={{ fontSize: '1.5rem', marginBottom: '10px', color: '#00ffcc' }}>
        {step === 1 && "地図を動かそう"}
        {step === 2 && "スポットを探そう"}
        {step === 3 && "準備OK！"}
      </h2>
      <p style={{ fontSize: '1rem', lineHeight: '1.6', marginBottom: '40px', color: '#ddd' }}>
        {step === 1 && "画面をドラッグして、\n世界中を自由に飛び回れます。"}
        {step === 2 && "地図上の「光る点」をタップすると、\nAIがその場所をガイドします。"}
        {step === 3 && "さあ、あなただけの\n地球儀の旅に出かけましょう！"}
      </p>

      {/* ボタン */}
      <button onClick={handleNext} style={{
        padding: '12px 40px', background: '#00ffcc', color: 'black',
        border: 'none', borderRadius: '30px', fontSize: '1.1rem', fontWeight: 'bold', cursor: 'pointer',
        boxShadow: '0 0 15px rgba(0, 255, 204, 0.6)'
      }}>
        {step === 3 ? "始める" : "次へ"}
      </button>

      {/* CSSアニメーション定義 */}
      <style>{`
        .hand-drag {
          position: absolute; top: 60%; left: 30%; font-size: 4rem;
          animation: dragMove 2s infinite ease-in-out;
        }
        @keyframes dragMove {
          0% { left: 30%; top: 60%; transform: rotate(0deg); }
          50% { left: 70%; top: 40%; transform: rotate(-10deg); }
          100% { left: 30%; top: 60%; transform: rotate(0deg); }
        }

        .hand-tap {
          position: absolute; top: 60%; left: 50%; font-size: 4rem;
          transform: translateX(-50%);
          animation: tapMove 1.5s infinite;
        }
        @keyframes tapMove {
          0% { top: 60%; transform: translateX(-50%) scale(1); }
          50% { top: 50%; transform: translateX(-50%) scale(0.9); }
          100% { top: 60%; transform: translateX(-50%) scale(1); }
        }

        .dot-pulse {
          width: 20px; height: 20px; background: #ffcc00; border-radius: 50%;
          box-shadow: 0 0 0 rgba(255, 204, 0, 0.4);
          animation: pulseDot 1.5s infinite;
        }
        @keyframes pulseDot {
          0% { box-shadow: 0 0 0 0 rgba(255, 204, 0, 0.7); }
          70% { box-shadow: 0 0 0 20px rgba(255, 204, 0, 0); }
          100% { box-shadow: 0 0 0 0 rgba(255, 204, 0, 0); }
        }
      `}</style>
    </div>
  );
};

export default TutorialOverlay;