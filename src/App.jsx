// src/App.jsx

import Globe from './components/Globe';
// ★追加: 更新チェック用のライブラリ
import { useRegisterSW } from 'virtual:pwa-register/react';
import { useEffect } from 'react';

function App() {
  // --- ★追加: 自動更新ロジック ---
  const {
    needRefresh: [needRefresh, setNeedRefresh],
    updateServiceWorker,
  } = useRegisterSW({
    onRegistered(r) {
      // 1分ごとに更新チェックを行う設定
      if (r) {
        setInterval(() => {
          r.update();
        }, 60 * 1000); // 60000ms = 1分
      }
    },
  });

  // 更新が必要な場合（新しいバージョンが見つかった場合）、勝手にリロードする
  useEffect(() => {
    if (needRefresh) {
      updateServiceWorker(true);
    }
  }, [needRefresh, updateServiceWorker]);
  // -----------------------------

  return (
    <div className="App">
      <Globe />
    </div>
  );
}

export default App;