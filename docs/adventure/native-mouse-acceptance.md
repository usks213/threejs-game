# Pointer Lockの実入力検査

2026-10-05。公開763c7902のCIはPointer Lock取得まで進んだが、Playwrightのheadless mouse移動から届くtrusted eventはclientX/YとmovementX/Yがすべて0だった。カメラyawを変える入力が実際には届いておらず、その検査は失敗のまま保持する。キーボード視点移動をPointer Lockの代わりの合格にはしない。

次のCI用に、[Playwrightのheaded Linux手順](https://playwright.dev/docs/ci#running-headed)どおり独立Xvfbを使う。Ubuntu公式packageの[ xdotool / XTEST](https://manpages.ubuntu.com/manpages/noble/man1/xdotool.1.html)で相対移動を送り、DOM eventの合成やカメラ状態の代入はしない。[上流実装](https://github.com/jordansissel/xdotool/blob/v3.20160805.1/xdo.c)は相対移動にXTestFakeRelativeMotionEventを使用する。

既存の旋回、攻撃、押下ガード、menuによるlock解除を維持し、前後両方向で新しいtrustedかつlockedの相対移動とyaw変化を要求する。CIでは1display/1worker、再試行0。相対移動だけをXTESTで送り、click/キーはPlaywrightであることをartifactへ明記する。入力が来なければ失敗し、skipや別入力の代用で合格させない。

この追加時点でactual CI結果は待機中。Xvfb/SwiftShaderの検証はユーザーの実機や実機FPSの証明ではない。成果物は`mouse-look-input.json`。
