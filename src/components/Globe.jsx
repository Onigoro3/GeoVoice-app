import React from 'react';
import { Viewer } from 'resium';
// Cesiumの基本スタイルはvite-plugin-cesiumが自動で読み込みます

const Globe = () => {
  return (
    <div style={{ width: "100vw", height: "100vh" }}>
      <Viewer 
        full
        // 余計なUIボタンを非表示にして没入感を高める
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
        creditContainer={document.createElement("div")} // クレジット表記を隠すハック
      />
    </div>
  );
};

export default Globe;