import React, { useState } from 'react';
import { supabase } from '../supabaseClient';

const AuthModal = ({ onClose, onLoginSuccess }) => {
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [loading, setLoading] = useState(false);
  const [isSignUp, setIsSignUp] = useState(false); // ログインか登録か
  const [message, setMessage] = useState('');

  const handleAuth = async (e) => {
    e.preventDefault();
    setLoading(true);
    setMessage('');

    try {
      let result;
      if (isSignUp) {
        // 新規登録
        const { data, error } = await supabase.auth.signUp({ email, password });
        if (error) throw error;
        setMessage('確認メールを送信しました。リンクをクリックしてください！');
      } else {
        // ログイン
        const { data, error } = await supabase.auth.signInWithPassword({ email, password });
        if (error) throw error;
        onLoginSuccess(data.user);
        onClose();
      }
    } catch (error) {
      setMessage(`エラー: ${error.message}`);
    } finally {
      setLoading(false);
    }
  };

  return (
    <div style={{
      position: 'fixed', top: 0, left: 0, width: '100%', height: '100%',
      background: 'rgba(0,0,0,0.8)', zIndex: 100, display: 'flex', justifyContent: 'center', alignItems: 'center',
      backdropFilter: 'blur(5px)'
    }}>
      <div style={{
        background: '#222', padding: '30px', borderRadius: '15px', width: '300px',
        color: 'white', border: '1px solid #444', boxShadow: '0 0 20px rgba(0,255,200,0.2)'
      }}>
        <h2 style={{ marginTop: 0, color: '#00ffcc', textAlign: 'center' }}>
          {isSignUp ? 'Sign Up' : 'Login'}
        </h2>
        
        <form onSubmit={handleAuth} style={{ display: 'flex', flexDirection: 'column', gap: '15px' }}>
          <input
            type="email" placeholder="Email" value={email}
            onChange={(e) => setEmail(e.target.value)}
            required
            style={{ padding: '10px', borderRadius: '5px', border: 'none', background: '#333', color: 'white' }}
          />
          <input
            type="password" placeholder="Password" value={password}
            onChange={(e) => setPassword(e.target.value)}
            required
            style={{ padding: '10px', borderRadius: '5px', border: 'none', background: '#333', color: 'white' }}
          />
          
          <button type="submit" disabled={loading} style={{
            padding: '10px', borderRadius: '5px', border: 'none',
            background: loading ? '#555' : '#00ffcc', color: 'black', fontWeight: 'bold', cursor: 'pointer'
          }}>
            {loading ? 'Processing...' : (isSignUp ? 'Create Account' : 'Login')}
          </button>
        </form>

        {message && <div style={{ marginTop: '15px', color: '#ffaa00', fontSize: '0.9rem', textAlign: 'center' }}>{message}</div>}

        <div style={{ marginTop: '20px', textAlign: 'center', fontSize: '0.9rem', color: '#ccc' }}>
          {isSignUp ? "アカウントをお持ちですか？" : "初めてですか？"} 
          <span 
            onClick={() => setIsSignUp(!isSignUp)}
            style={{ color: '#00ffcc', cursor: 'pointer', marginLeft: '5px', textDecoration: 'underline' }}
          >
            {isSignUp ? "Login" : "Sign Up"}
          </span>
        </div>

        <button onClick={onClose} style={{
          marginTop: '20px', width: '100%', background: 'transparent', border: '1px solid #555',
          color: '#888', padding: '5px', borderRadius: '5px', cursor: 'pointer'
        }}>
          Close
        </button>
      </div>
    </div>
  );
};

export default AuthModal;