import React, { useEffect, useState } from 'react';

const SplashScreen = ({ onFinished }) => {
  const [isFading, setIsFading] = useState(false);

  useEffect(() => {
    // 修正: 2500ms -> 1200ms に短縮
    const timer = setTimeout(() => {
      setIsFading(true);
      setTimeout(() => {
        onFinished();
      }, 500);
    }, 1200);

    return () => clearTimeout(timer);
  }, [onFinished]);

  return (
    <div style={{
      position: 'fixed',
      top: 0,
      left: 0,
      width: '100vw',
      height: '100vh',
      backgroundColor: '#000',
      display: 'flex',
      flexDirection: 'column',
      justifyContent: 'center',
      alignItems: 'center',
      zIndex: 9999,
      opacity: isFading ? 0 : 1,
      transition: 'opacity 0.5s ease-out', // フェードアウトも少し早く
      pointerEvents: isFading ? 'none' : 'auto'
    }}>
      <div className="logo-container" style={{ textAlign: 'center' }}>
        <div style={{
          fontSize: '4rem',
          marginBottom: '20px',
          animation: 'bounce 1s infinite' // バウンスも早く
        }}>🌍</div>
        <h1 style={{
          color: '#fff',
          fontFamily: 'sans-serif',
          fontSize: '2.5rem',
          letterSpacing: '3px',
          margin: 0,
          background: 'linear-gradient(90deg, #fff, #00ffcc, #fff)',
          backgroundSize: '200% auto',
          backgroundClip: 'text',
          WebkitBackgroundClip: 'text',
          color: 'transparent',
          animation: 'shine 2s linear infinite' // キラキラも早く
        }}>
          GeoVoice
        </h1>
        <p style={{ color: '#666', marginTop: '10px', fontSize: '0.9rem' }}>Exploring the World with AI</p>
      </div>
      
      <style>{`
        @keyframes bounce {
          0%, 100% { transform: translateY(0); }
          50% { transform: translateY(-10px); }
        }
        @keyframes shine {
          to { background-position: 200% center; }
        }
      `}</style>
    </div>
  );
};

export default SplashScreen;