import React, { useRef, useEffect } from 'react';
import { Viewer } from 'resium';
import * as Cesium from 'cesium';

const Globe = () => {
  const viewerRef = useRef(null);

  useEffect(() => {
    // ここでは軽量化の設定だけ行います
    if (viewerRef.current && viewerRef.current.cesiumElement) {
      const viewer = viewerRef.current.cesiumElement;
      
      viewer.scene.requestRenderMode = true;
      viewer.scene.maximumRenderTimeChange = Infinity;
      viewer.scene.terrainProvider = new Cesium.EllipsoidTerrainProvider();
      viewer.resolutionScale = 0.8;
      viewer.scene.shadows = false;
      viewer.scene.fog.enabled = true;
      
      // 背景色を黒にする念押しの設定
      viewer.scene.backgroundColor = Cesium.Color.BLACK;
      
      // 3Dモード限定
      viewer.scene3DOnly = true;
    }
  }, []);

  return (
    <div style={{ width: "100vw", height: "100vh", backgroundColor: "#000" }}>
      <Viewer 
        ref={viewerRef}
        full
        // --- 【ここが重要な変更点です】 ---
        skyBox={false}  // 星空を確実にオフにする設定
        sun={false}     // 太陽をオフ
        moon={false}    // 月をオフ
        // -------------------------------
        
        // UIボタン非表示設定
        animation={false} 
        timeline={false}
        infoBox={false}
        homeButton={false}
        navigationHelpButton={false}
        geocoder={false}
        baseLayerPicker={false} 
        sceneModePicker={false}
        selectionIndicator={false}
        fullscreenButton={false}
        creditContainer={document.createElement("div")}
        scene3DOnly={true}
        contextOptions={{
          webgl: {
            alpha: false,
            backgroundColor: [0, 0, 0, 1]
          }
        }}
      />
    </div>
  );
};

export default Globe;