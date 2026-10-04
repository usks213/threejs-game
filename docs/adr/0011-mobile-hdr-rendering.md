# 0011: モバイルHDR描画

## 要求
PBR、ボリュメトリック光、物理スカイと昼夜、SH/IBL、自動露出、ブルーム、動的影、リアルタイム反射を同時に使う。独自のゲームであり、参考作品のアセットは転用しない。

## 実装
- 全実体アセットをMetallic/Roughness方式のMeshStandardMaterialまたはMeshPhysicalMaterialに統一。土・木・石・布・革・肌・葉・金属・結晶の128px周期プロシージャルalbedo/normal/roughnessを共有する。色のみsRGB、法線/粗さはlinear。金属以外のmetalnessは0。
- 地形はworld-space triplanar PBR。水はIOR 1.333、粗さ、波面法線、clearcoat、環境反射とSSRを使う。波面法線は解析的に生成するため画像のnormal mapは不要。
- Three.js SkyのPreetham/Rayleigh/Mieモデルを太陽の高度と天候で制御。月・星・雲は補助的な手続き表現。完全な多重散乱やボリュメトリック雲ではない。
- HDRスカイを64px PMREMへ変換しIBLに使用。別の16px cubeの6面をまとめて非同期読み取りし、立体角で重み付けして9係数/3バンドのSHを生成しLightProbeへ適用。太陽角度が変わった時に更新し、最低1.5秒間隔。毎フレームは生成しない。
- HDR描画順: SSRのbeauty/depth/normal/mask → SSR → volumetric → auto exposure → bloom → ACES/sRGB output → FXAA。
- 光の散乱は半解像度16サンプルのview-ray march。高さ依存密度、Beer–Lambert減衰、Henyey–Greenstein位相関数、動的shadow mapによる遮蔽。深度を考慮して拡大合成する。
- 自動露出はGPUで8×8の対数平均輝度を測光し1px ping-pong textureで時間適応。明順応と暗順応の速度を分ける。通常描画に同期readbackはない。診断値のみ1秒ごとに1px非同期readback。
- UnrealBloomPassによるHDR明部抽出と5段階blur。単なる白色オーバーレイではない。
- 1024px PCF shadow mapを最大約8Hzで更新。太陽/月、プレイヤー、木、岩、建物、敵の動きを反映する。接地補助デカールは別途維持。
- 半解像度SSRを128step上限で計算。水や結晶など粗さ0.25未満の表面を選択。粗い金属はPMREMの反射を使用。対象がないフレームでは空のSSRパスを省く。画面外/遮蔽裏の反射はIBLへフォールバックする。SSRは完全なray tracingではなく、薄い形状や画面端では反射が欠けうる。
- UI、照準、建築ゴースト、HPバー、接地デカール、天候/ヒット粒子は物理表面ではないためunlitを維持する。

## 性能と寿命
DPRは最大1、長辺900px。SSR/霧はさらに半解像度。共有テクスチャ・PMREM・cube・post targets・shader/materialを破棄する。SH読み取り中のcubeは非同期処理終了まで保持する。
実機性能は端末に依存する。SwiftShaderのブラウザ検証値をAndroid GPUのFPSとして報告しない。描画方式を変える場合もゲーム/物理/保存は変更しない。

## 検証
短い単体テスト、型、ビルド、描画関連のAndroid Chromiumケース。GPUの露出・平均輝度・SH係数を昼夜で比較し、shader/JS例外を監視し、昼夜の画像を保存する。CI結果は実際の完了結果を参照する。

SSRの未命中画素はRGBA=0で初期化し、r180 blurのalpha=0除算を防止する。初期の太陽方向を非ゼロにし、不正なSH係数でシーン全体を汚染しない。描画開始は最初のゲームSnapshot後。CIの画像はCSS解像度で取得し、エミュレーション端末の高DPRによる不要な読み出しを抑える。

