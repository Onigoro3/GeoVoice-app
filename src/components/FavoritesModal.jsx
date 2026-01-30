import React, { useEffect, useState } from 'react';
import { supabase } from '../supabaseClient';

const FavoritesModal = ({ userId, onClose, onSelect }) => {
  const [groupedItems, setGroupedItems] = useState({});
  const [loading, setLoading] = useState(true);
  const [openCountries, setOpenCountries] = useState({});

  useEffect(() => {
    const fetchMyFavorites = async () => {
      const { data } = await supabase
        .from('favorites')
        .select(`spot_id, spots (*)`)
        .eq('user_id', userId)
        .order('created_at', { ascending: false });

      if (data) {
        const spots = data.map(f => f.spots).filter(Boolean);
        const groups = {};
        spots.forEach(spot => {
          const country = spot.country_ja || 'その他';
          if (!groups[country]) groups[country] = [];
          groups[country].push(spot);
        });
        setGroupedItems(groups);
        const initialOpenState = {};
        Object.keys(groups).forEach(c => initialOpenState[c] = true);
        setOpenCountries(initialOpenState);
      }
      setLoading(false);
    };
    fetchMyFavorites();
  }, [userId]);

  const handleDelete = async (e, spotId, country) => {
    e.stopPropagation();
    if (!window.confirm("削除しますか？")) return;
    const { error } = await supabase.from('favorites').delete().eq('user_id', userId).eq('spot_id', spotId);
    if (!error) {
      const newGroups = { ...groupedItems };
      newGroups[country] = newGroups[country].filter(item => item.id !== spotId);
      if (newGroups[country].length === 0) delete newGroups[country];
      setGroupedItems(newGroups);
    }
  };

  const toggleCountry = (country) => {
    setOpenCountries(prev => ({ ...prev, [country]: !prev[country] }));
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
        <div style={{ padding: '15px', borderBottom: '1px solid #333', display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
          <h2 style={{ margin: 0, color: '#ff3366', fontSize: '1.2rem' }}>♥ My World</h2>
          <button onClick={onClose} style={{ background: 'transparent', border: 'none', color: '#888', fontSize: '1.5rem', cursor: 'pointer' }}>×</button>
        </div>

        <div style={{ flex: 1, overflowY: 'auto', padding: '10px' }}>
          {loading ? (
            <div style={{ color: '#888', textAlign: 'center', marginTop: '20px' }}>Loading...</div>
          ) : Object.keys(groupedItems).length === 0 ? (
            <div style={{ color: '#888', textAlign: 'center', marginTop: '20px' }}>
              まだ保存されていません。<br/>ハートボタンで追加しよう！
            </div>
          ) : (
            Object.keys(groupedItems).sort().map(country => (
              <div key={country} style={{ marginBottom: '10px' }}>
                <div onClick={() => toggleCountry(country)} style={{ padding: '8px 12px', background: '#333', color: '#00ffcc', fontWeight: 'bold', borderRadius: '8px', cursor: 'pointer', display: 'flex', justifyContent: 'space-between', alignItems: 'center', border: '1px solid #444' }}>
                  <span>{country} <span style={{fontSize:'0.8rem', color:'#888', fontWeight:'normal'}}>({groupedItems[country].length})</span></span>
                  <span>{openCountries[country] ? '▼' : '▶'}</span>
                </div>
                {openCountries[country] && (
                  <div style={{ marginTop: '5px', paddingLeft: '10px' }}>
                    {groupedItems[country].map(spot => (
                      <div key={spot.id} onClick={() => onSelect(spot)} style={{ background: '#222', padding: '10px', marginBottom: '5px', borderRadius: '6px', borderLeft: '3px solid #ff3366', cursor: 'pointer', display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
                        <div style={{ display: 'flex', alignItems: 'center', gap: '10px' }}>
                          {/* ★画像サムネイル */}
                          <div style={{ width: '40px', height: '40px', borderRadius: '4px', overflow: 'hidden', background: '#000' }}>
                            {spot.image_url ? (
                              <img src={spot.image_url} alt="" style={{ width: '100%', height: '100%', objectFit: 'cover' }} />
                            ) : (
                              <div style={{ width: '100%', height: '100%', display: 'flex', alignItems: 'center', justifyContent: 'center', color: '#555', fontSize: '0.6rem' }}>No Img</div>
                            )}
                          </div>
                          <div style={{ color: 'white', fontSize: '0.9rem' }}>{spot.name.split('#')[0]}</div>
                        </div>
                        <button onClick={(e) => handleDelete(e, spot.id, country)} style={{ background: 'transparent', border: 'none', color: '#666', fontSize: '1.2rem', cursor: 'pointer' }}>×</button>
                      </div>
                    ))}
                  </div>
                )}
              </div>
            ))
          )}
        </div>
      </div>
    </div>
  );
};

export default FavoritesModal;