import React, { useEffect, useState } from 'react';
import { supabase } from '../supabaseClient';

const FavoritesModal = ({ userId, onClose, onSelect }) => {
  const [items, setItems] = useState([]);
  const [loading, setLoading] = useState(true);

  // お気に入りデータを取得
  useEffect(() => {
    const fetchMyFavorites = async () => {
      // favoritesテーブルとspotsテーブルを結合して取得
      const { data, error } = await supabase
        .from('favorites')
        .select(`
          spot_id,
          spots (*)
        `)
        .eq('user_id', userId)
        .order('created_at', { ascending: false }); // 新しい順

      if (data) {
        // データ構造を整形 (spotsの中身を取り出す)
        const formatted = data.map(f => f.spots).filter(Boolean);
        setItems(formatted);
      }
      setLoading(false);
    };

    fetchMyFavorites();
  }, [userId]);

  // 削除機能
  const handleDelete = async (e, spotId) => {
    e.stopPropagation(); // 親のクリックイベント（移動）を止める
    if (!window.confirm("削除しますか？")) return;

    const { error } = await supabase
      .from('favorites')
      .delete()
      .eq('user_id', userId)
      .eq('spot_id', spotId);

    if (!error) {
      setItems(items.filter(item => item.id !== spotId));
    }
  };

  return (
    <div style={{
      position: 'fixed', top: 0, left: 0, width: '100%', height: '100%',
      background: 'rgba(0,0,0,0.85)', zIndex: 100, display: 'flex', justifyContent: 'center', alignItems: 'center',
      backdropFilter: 'blur(5px)'
    }}>
      <div style={{
        background: '#1a1a1a', width: '90%', maxWidth: '400px', maxHeight: '80vh',
        borderRadius: '15px', border: '1px solid #444', display: 'flex', flexDirection: 'column',
        boxShadow: '0 0 30px rgba(0,0,0,0.8)'
      }}>
        
        {/* ヘッダー */}
        <div style={{ padding: '15px', borderBottom: '1px solid #333', display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
          <h2 style={{ margin: 0, color: '#ff3366', fontSize: '1.2rem' }}>♥ My Favorites</h2>
          <button onClick={onClose} style={{ background: 'transparent', border: 'none', color: '#888', fontSize: '1.5rem', cursor: 'pointer' }}>×</button>
        </div>

        {/* リストエリア */}
        <div style={{ flex: 1, overflowY: 'auto', padding: '10px' }}>
          {loading ? (
            <div style={{ color: '#888', textAlign: 'center', marginTop: '20px' }}>Loading...</div>
          ) : items.length === 0 ? (
            <div style={{ color: '#888', textAlign: 'center', marginTop: '20px' }}>
              まだ保存されていません。<br/>ハートボタンで追加しよう！
            </div>
          ) : (
            items.map(spot => (
              <div 
                key={spot.id}
                onClick={() => onSelect(spot)} // クリックで移動
                style={{
                  background: '#222', padding: '12px', marginBottom: '8px', borderRadius: '8px',
                  border: '1px solid #333', cursor: 'pointer', display: 'flex', justifyContent: 'space-between', alignItems: 'center',
                  transition: 'background 0.2s'
                }}
                onMouseOver={e => e.currentTarget.style.background = '#333'}
                onMouseOut={e => e.currentTarget.style.background = '#222'}
              >
                <div>
                  <div style={{ color: 'white', fontWeight: 'bold', fontSize: '0.95rem' }}>
                    {spot.name.split('#')[0]}
                  </div>
                  <div style={{ color: '#00ffcc', fontSize: '0.75rem', marginTop: '2px' }}>
                    {spot.name.includes('#') ? `#${spot.name.split('#')[1]}` : '#Spot'}
                  </div>
                </div>
                
                {/* 削除ボタン */}
                <button 
                  onClick={(e) => handleDelete(e, spot.id)}
                  style={{
                    background: 'transparent', border: '1px solid #555', color: '#888',
                    borderRadius: '4px', padding: '5px 8px', fontSize: '0.8rem', cursor: 'pointer'
                  }}
                >
                  削除
                </button>
              </div>
            ))
          )}
        </div>
      </div>
    </div>
  );
};

export default FavoritesModal;