# GeoVoice 開発用コマンドマニュアル

このファイルは、開発によく使うコマンドをまとめたものです。
ターミナルにコピペして使用してください。

## 📱 1. スマホアプリの更新手順 (Android/iOS)
コードを修正した後、Android Studio (またはXcode) に反映させるための**3点セット**です。

```bash
# 1. Webサイトとしてビルド (distフォルダを作成)
npm run build

# 2. ビルドした内容をスマホ用フォルダに同期 & コピー
npx cap sync

# 3. Android Studio を起動 (ここから Run ▶ ボタンを押す)
npx cap open android

# 変更ファイルを全てステージング
git add .

# コミット (メッセージは変更内容に合わせて変える)
git commit -m "機能追加: 〇〇の実装"

# GitHubへアップロード (保存)
git push origin main

# 国名データの更新 (AI修正など)
node scripts/update_countries.js

# (もしWiki取得用のスクリプトがある場合)
# node scripts/fetch_wiki_data.js

# 全サイズのアイコンを自動生成して各フォルダに配置
npx capacitor-assets generate

# ローカルサーバー起動
npm run dev

# インストール
npm install ライブラリ名

# スマホ側にも反映 (これを忘れるとアプリが動かなくなる)
npx cap sync

# 画像のない物を高速取得(50件ずつ取得)「Wiki徹底検索」→「Pixabay」→「Mapbox衛星写真（確実）」
node tools/update-images.js