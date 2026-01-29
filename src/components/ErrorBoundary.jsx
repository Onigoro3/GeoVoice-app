import React from 'react';

class ErrorBoundary extends React.Component {
  constructor(props) {
    super(props);
    this.state = { hasError: false, error: null, errorInfo: null };
  }

  static getDerivedStateFromError(error) {
    return { hasError: true };
  }

  componentDidCatch(error, errorInfo) {
    this.setState({ error, errorInfo });
    console.error("Uncaught error:", error, errorInfo);
  }

  render() {
    if (this.state.hasError) {
      return (
        <div style={{ padding: '20px', background: '#330000', color: '#ffaaaa', height: '100vh', overflow: 'auto' }}>
          <h1>⚠️ アプリがクラッシュしました</h1>
          <h3>エラー内容:</h3>
          <pre style={{ background: 'black', padding: '10px', whiteSpace: 'pre-wrap' }}>
            {this.state.error && this.state.error.toString()}
          </pre>
          <h3>場所:</h3>
          <pre style={{ background: 'black', padding: '10px', whiteSpace: 'pre-wrap' }}>
            {this.state.errorInfo && this.state.errorInfo.componentStack}
          </pre>
          <button 
            onClick={() => window.location.reload()} 
            style={{ padding: '10px 20px', fontSize: '1.2rem', marginTop: '20px', cursor: 'pointer' }}
          >
            リロードして復帰
          </button>
        </div>
      );
    }

    return this.props.children; 
  }
}

export default ErrorBoundary;