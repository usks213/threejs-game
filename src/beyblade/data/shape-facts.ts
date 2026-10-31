/** Primary-source observations; estimated_geometry entries are NOT measured manufacturer dimensions. */
export const bladeShapeFacts = [
  {
    "name_ja": "ドランソード",
    "source_url": "https://beyblade.takaratomy.co.jp/beyblade-x/lineup/bx01.html",
    "source_image_url": "https://beyblade.takaratomy.co.jp/beyblade-x/lineup/_image/detail_bx01.png",
    "evidence": "official_detail_image_visually_verified_2026-10-25",
    "facts": {
      "contact_count": 3,
      "spin": 1,
      "summary_ja": "3枚のアッパー刃で斜め上へ弾く。"
    },
    "model_ja": "3枚の鋸状非対称刃。衝突面の上向き法線と接線方向の傾きを同じ描画mesh/接触形状から計算。",
    "estimated_geometry": {
      "lobeDepthRatio": 0.16,
      "rakeSign": 1,
      "rakeAngleDegrees": 12,
      "radiusScale": 1.0,
      "outerInertiaFactor": 0.64
    }
  },
  {
    "name_ja": "ヘルズサイズ",
    "source_url": "https://beyblade.takaratomy.co.jp/beyblade-x/lineup/bx02.html",
    "source_image_url": "https://beyblade.takaratomy.co.jp/beyblade-x/lineup/_image/detail_bx02.png",
    "evidence": "official_detail_image_visually_verified_2026-10-25",
    "facts": {
      "contact_count": 4,
      "spin": 1,
      "summary_ja": "4枚のスマッシュ刃で相手の姿勢を崩す。"
    },
    "model_ja": "4枚の幅広い円弧刃。スマッシュ面の下向き法線で力積と倒しトルクを発生。",
    "estimated_geometry": {
      "lobeDepthRatio": 0.09,
      "rakeSign": -1,
      "rakeAngleDegrees": 8,
      "radiusScale": 1.0,
      "outerInertiaFactor": 0.67
    }
  },
  {
    "name_ja": "ウィザードアロー",
    "source_url": "https://beyblade.takaratomy.co.jp/beyblade-x/lineup/bx03.html",
    "source_image_url": "https://beyblade.takaratomy.co.jp/beyblade-x/lineup/_image/detail_bx03.png",
    "evidence": "official_detail_image_visually_verified_2026-10-25",
    "facts": {
      "contact_count": 2,
      "spin": 1,
      "summary_ja": "2枚の大型円形刃、外重心設計。"
    },
    "model_ja": "2本の幅広い円弧を組み合わせた丸い外周。外周質量比を増やす。",
    "estimated_geometry": {
      "lobeDepthRatio": 0.07,
      "rakeSign": 0,
      "radiusScale": 1.0,
      "outerInertiaFactor": 0.76
    }
  },
  {
    "name_ja": "ナイトシールド",
    "source_url": "https://beyblade.takaratomy.co.jp/beyblade-x/lineup/bx04.html",
    "source_image_url": "https://beyblade.takaratomy.co.jp/beyblade-x/lineup/_image/detail_bx04.png",
    "evidence": "official_detail_image_visually_verified_2026-10-25",
    "facts": {
      "contact_count": 6,
      "spin": 1,
      "summary_ja": "6枚の防御刃と衝撃吸収用ダンパー構造。"
    },
    "model_ja": "6分割盾形、丸く低い突出。ダンパー未実装なら未再現表示。",
    "estimated_geometry": {
      "lobeDepthRatio": 0.065,
      "rakeSign": 0,
      "radiusScale": 1.0,
      "outerInertiaFactor": 0.64,
      "dampingMechanism": "not_calibrated"
    }
  },
  {
    "name_ja": "ドランバスター",
    "source_url": "https://beyblade.takaratomy.co.jp/beyblade-x/lineup/ux01.html",
    "source_image_url": "https://beyblade.takaratomy.co.jp/beyblade-x/lineup/_image/detail_ux01.png",
    "evidence": "official_detail_image_visually_verified_2026-10-25",
    "facts": {
      "contact_count": null,
      "spin": 1,
      "summary_ja": "突出した大型攻撃刃で一撃の弾きに特化。公式画像は1つの大きな攻撃先端を示す。刃数の明記はなく、左右に補助的な外形もある。"
    },
    "model_ja": "主攻撃先端1つを持つ非対称outline（単純な1波sinや全周同形は禁止）。大きな三角槍先と両脇のえぐりを輪郭点列で表現。公式はこの出典では偏重心を明記していない。横COM偏心は形状質量積分で推定する場合だけESTIMATED。",
    "estimated_geometry": {
      "primaryAttackPoints": 1,
      "lobeDepthRatio": 0.25,
      "radiusScale": 1.03,
      "outerInertiaFactor": 0.64,
      "lateralCOMOffset": "unmeasured; do not invent official offset"
    }
  },
  {
    "name_ja": "ウィザードロッド",
    "source_url": "https://beyblade.takaratomy.co.jp/beyblade-x/lineup/ux03.html",
    "source_image_url": "https://beyblade.takaratomy.co.jp/beyblade-x/lineup/_image/detail_ux03.png",
    "evidence": "official_detail_image_visually_verified_2026-10-25",
    "facts": {
      "contact_count": 5,
      "spin": 1,
      "summary_ja": "大径5枚刃の外重心設計。UXは樹脂ランチャーフックにより外周への金属配分を増加。"
    },
    "model_ja": "大きく丸い5分割外輪、中心は樹脂色、外周の金属帯を厚く。半径とI/(mR²)双方をArrowより大きく。",
    "estimated_geometry": {
      "lobeDepthRatio": 0.045,
      "rakeSign": 0,
      "radiusScale": 1.1,
      "outerInertiaFactor": 0.84
    }
  },
  {
    "name_ja": "フェニックスウイング メタルコート",
    "source_url": "https://beyblade.takaratomy.co.jp/beyblade-x/lineup/bx23.html",
    "source_image_url": "https://beyblade.takaratomy.co.jp/beyblade-x/lineup/_image/detail_bx23.png",
    "evidence": "official_detail_image_visually_verified_2026-10-25",
    "facts": {
      "contact_count": 3,
      "spin": 1,
      "summary_ja": "重量のある3枚刃。金属塗装で性能が向上。"
    },
    "model_ja": "3枚の大きい翼状面と後退した谷、厚い赤い金属外周、中心黄。公式は数値質量やこの画像でrake角を公開しない。",
    "estimated_geometry": {
      "lobeDepthRatio": 0.15,
      "radiusScale": 1.06,
      "outerInertiaFactor": 0.72,
      "massScale": 1.1,
      "rakeSign": "not_text_verified"
    }
  },
  {
    "name_ja": "コバルトドラグーン",
    "source_url": "https://beyblade.takaratomy.co.jp/beyblade-x/lineup/bx34.html",
    "source_image_url": "https://beyblade.takaratomy.co.jp/beyblade-x/lineup/_image/detail_bx34.png",
    "evidence": "official_detail_image_visually_verified_2026-10-25",
    "facts": {
      "contact_count": 4,
      "spin": -1,
      "summary_ja": "先端の厚い4枚アッパー刃。左回転。"
    },
    "model_ja": "4枚の逆向きカーブした厚い先端。左回転spin符号と接触面向きを一致させる。",
    "estimated_geometry": {
      "lobeDepthRatio": 0.17,
      "rakeSign": 1,
      "rakeAngleDegrees": 13,
      "radiusScale": 1.04,
      "outerInertiaFactor": 0.71
    }
  },
  {
    "name_ja": "ホエールウェーブ",
    "source_url": "https://beyblade.takaratomy.co.jp/beyblade-x/lineup/bx36.html",
    "source_image_url": "https://beyblade.takaratomy.co.jp/beyblade-x/lineup/_image/detail_bx36.png",
    "evidence": "official_detail_image_visually_verified_2026-10-25",
    "facts": {
      "contact_count": 5,
      "spin": 1,
      "summary_ja": "大径で遠心力を狙う5枚スマッシュ刃。上から覆うような連打。"
    },
    "model_ja": "大径5波外周と下向き接触面。高さ差で上から接触した時に下向き力積。",
    "estimated_geometry": {
      "lobeDepthRatio": 0.105,
      "rakeSign": -1,
      "rakeAngleDegrees": 10,
      "radiusScale": 1.08,
      "outerInertiaFactor": 0.76
    }
  },
  {
    "name_ja": "ライトニングエルドラゴ アッパー型",
    "source_url": "https://beyblade.takaratomy.co.jp/beyblade-x/lineup/bx00-ld.html",
    "source_image_url": "https://beyblade.takaratomy.co.jp/beyblade-x/lineup/_image/detail_bxg_07_1.png",
    "evidence": "official_detail_image_visually_verified_2026-10-25",
    "facts": {
      "contact_count": 3,
      "spin": -1,
      "summary_ja": "左向きアッパー刃を3箇所配置する左回転型。"
    },
    "model_ja": "左回転3接点、上向き法線。連打型と同一形状は禁止。",
    "estimated_geometry": {
      "lobeDepthRatio": 0.13,
      "rakeSign": 1,
      "rakeAngleDegrees": 12,
      "radiusScale": 1.0,
      "outerInertiaFactor": 0.65
    }
  },
  {
    "name_ja": "ライトニングエルドラゴ 連打型",
    "source_url": "https://beyblade.takaratomy.co.jp/beyblade-x/lineup/bx00-ld.html",
    "source_image_url": "https://beyblade.takaratomy.co.jp/beyblade-x/lineup/_image/detail_bxg_07_2.png",
    "evidence": "official_detail_image_visually_verified_2026-10-25",
    "facts": {
      "contact_count": 3,
      "spin": -1,
      "summary_ja": "連打刃を3箇所配置する左回転型。"
    },
    "model_ja": "3クラスタに小さい接点を複数設ける。アッパー型より低rake。",
    "estimated_geometry": {
      "lobeDepthRatio": 0.08,
      "rakeSign": 0,
      "radiusScale": 1.0,
      "outerInertiaFactor": 0.65
    }
  },
  {
    "name_ja": "ドランダガー",
    "source_url": "https://beyblade.takaratomy.co.jp/beyblade-x/lineup/bx20.html",
    "source_image_url": "https://beyblade.takaratomy.co.jp/beyblade-x/lineup/_image/detail_bx20B.png",
    "evidence": "official_detail_image_visually_verified_2026-10-25",
    "facts": {
      "contact_count": 6,
      "spin": 1,
      "summary_ja": "6枚の攻撃刃で連打を狙う。"
    },
    "model_ja": "6分割の攻撃輪郭。Swordの3枚輪郭との差を実接触数に反映。",
    "estimated_geometry": {
      "lobeDepthRatio": 0.11,
      "rakeSign": 0,
      "radiusScale": 1.0,
      "outerInertiaFactor": 0.67
    }
  },
  {
    "name_ja": "シャークエッジ",
    "source_url": "https://beyblade.takaratomy.co.jp/beyblade-x/lineup/bx14.html",
    "source_image_url": "https://beyblade.takaratomy.co.jp/beyblade-x/lineup/_image/detail_bx14.png",
    "evidence": "official_detail_image_visually_verified_2026-10-25",
    "facts": {
      "contact_count": null,
      "spin": 1,
      "summary_ja": "急角度アッパーで低位置から跳ね上げる。"
    },
    "model_ja": "鋭い主攻撃面と上向き法線、LFの低高さと相互作用。",
    "estimated_geometry": {
      "lobeDepthRatio": 0.2,
      "rakeSign": 1,
      "rakeAngleDegrees": 20,
      "radiusScale": 0.99,
      "outerInertiaFactor": 0.63
    }
  },
  {
    "name_ja": "シルバーウルフ",
    "source_url": "https://beyblade.takaratomy.co.jp/beyblade-x/lineup/ux08.html",
    "source_image_url": "https://beyblade.takaratomy.co.jp/beyblade-x/lineup/_image/detail_ux08.png",
    "evidence": "official_detail_image_visually_verified_2026-10-25",
    "facts": {
      "contact_count": null,
      "spin": 1,
      "summary_ja": "下部フリーリングが自由回転し攻撃を受け流す。"
    },
    "model_ja": "本体とfree ringを別の角自由度で扱う。ring衝突時はring→本体の有限摩擦伝達。単に無摩擦/無敵にしない。",
    "estimated_geometry": {
      "lobeDepthRatio": 0.06,
      "radiusScale": 1.06,
      "outerInertiaFactor": 0.8,
      "ringCoupling": "unmeasured"
    }
  }
] as const;
export const bitShapeFacts = [
  {
    "code": "F",
    "source_url": "https://beyblade.takaratomy.co.jp/beyblade-x/lineup/bx01.html",
    "source_image_url": "https://beyblade.takaratomy.co.jp/beyblade-x/lineup/_image/detail_bx01.png",
    "evidence": "official_detail_image_visually_verified_2026-10-25",
    "facts_ja": "平らな軸先で走行しXダッシュを決めやすくする。",
    "contact_shape": "flat",
    "mechanisms": [
      "broad_floor_contact"
    ],
    "estimated": {
      "tipRadiusScale": 1,
      "tiltTractionScale": 1
    }
  },
  {
    "code": "T",
    "source_url": "https://beyblade.takaratomy.co.jp/beyblade-x/lineup/bx02.html",
    "source_image_url": "https://beyblade.takaratomy.co.jp/beyblade-x/lineup/_image/detail_bx02.png",
    "evidence": "official_detail_image_visually_verified_2026-10-25",
    "facts_ja": "すぼまった軸で序盤攻撃と終盤持久を両立。",
    "contact_shape": "taper",
    "mechanisms": [
      "tilt_dependent_contact_radius"
    ],
    "estimated": {
      "uprightContactRadiusScale": 0.55,
      "tiltedContactRadiusScale": 0.9
    }
  },
  {
    "code": "B",
    "source_url": "https://beyblade.takaratomy.co.jp/beyblade-x/lineup/bx03.html",
    "source_image_url": "https://beyblade.takaratomy.co.jp/beyblade-x/lineup/_image/detail_bx03.png",
    "evidence": "official_detail_image_visually_verified_2026-10-25",
    "facts_ja": "球形軸先で適度に動き持久。",
    "contact_shape": "ball",
    "mechanisms": [
      "rolling_contact"
    ],
    "estimated": {
      "tipRadiusScale": 0.7
    }
  },
  {
    "code": "N",
    "source_url": "https://beyblade.takaratomy.co.jp/beyblade-x/lineup/bx04.html",
    "source_image_url": "https://beyblade.takaratomy.co.jp/beyblade-x/lineup/_image/detail_bx04.png",
    "evidence": "official_detail_image_visually_verified_2026-10-25",
    "facts_ja": "尖った軸先で傾きとカウンターを狙う。",
    "contact_shape": "needle",
    "mechanisms": [
      "small_contact",
      "tilt_precession"
    ],
    "estimated": {
      "tipRadiusScale": 0.18
    }
  },
  {
    "code": "HN",
    "source_url": "https://beyblade.takaratomy.co.jp/beyblade-x/lineup/bx13.html",
    "source_image_url": "https://beyblade.takaratomy.co.jp/beyblade-x/lineup/_image/detail_bx13.png",
    "evidence": "official_detail_image_visually_verified_2026-10-25",
    "facts_ja": "Nより1mm高い。傾きカウンター。",
    "contact_shape": "needle",
    "mechanisms": [
      "small_contact",
      "higher_height"
    ],
    "estimated": {
      "heightDeltaMetres": 0.001,
      "heightDeltaStatus": "official_relative_to_N"
    }
  },
  {
    "code": "LF",
    "source_url": "https://beyblade.takaratomy.co.jp/beyblade-x/lineup/bx14.html",
    "source_image_url": "https://beyblade.takaratomy.co.jp/beyblade-x/lineup/_image/detail_bx14.png",
    "evidence": "official_detail_image_visually_verified_2026-10-25",
    "facts_ja": "Fより1mm低く、Xダッシュ加速を高める。",
    "contact_shape": "flat",
    "mechanisms": [
      "broad_floor_contact",
      "lower_height"
    ],
    "estimated": {
      "heightDeltaMetres": -0.001,
      "heightDeltaStatus": "official_relative_to_F"
    }
  },
  {
    "code": "P",
    "source_url": "https://beyblade.takaratomy.co.jp/beyblade-x/lineup/bx15.html",
    "source_image_url": "https://beyblade.takaratomy.co.jp/beyblade-x/lineup/_image/detail_bx15.png",
    "evidence": "official_detail_image_visually_verified_2026-10-25",
    "facts_ja": "平軸の中央に突起。動的/静的な動きが変わる。",
    "contact_shape": "point_flat",
    "mechanisms": [
      "central_point",
      "outer_flat_when_tilted"
    ],
    "estimated": {
      "transitionTiltRadians": 0.12
    }
  },
  {
    "code": "O",
    "source_url": "https://beyblade.takaratomy.co.jp/beyblade-x/lineup/bx16.html",
    "source_image_url": "https://beyblade.takaratomy.co.jp/beyblade-x/lineup/_image/detail_bx16.png",
    "evidence": "official_detail_image_visually_verified_2026-10-25",
    "facts_ja": "小型半円形軸先で摩擦を抑制。",
    "contact_shape": "small_hemisphere",
    "mechanisms": [
      "rolling_contact",
      "small_contact"
    ],
    "estimated": {
      "tipRadiusScale": 0.5
    }
  },
  {
    "code": "S",
    "source_url": "https://beyblade.takaratomy.co.jp/beyblade-x/lineup/bx19.html",
    "source_image_url": "https://beyblade.takaratomy.co.jp/beyblade-x/lineup/_image/detail_bx19.png",
    "evidence": "official_detail_image_visually_verified_2026-10-25",
    "facts_ja": "細く尖った軸先で中央を維持する。",
    "contact_shape": "needle",
    "mechanisms": [
      "very_small_contact"
    ],
    "estimated": {
      "tipRadiusScale": 0.12
    }
  },
  {
    "code": "R",
    "source_url": "https://beyblade.takaratomy.co.jp/beyblade-x/lineup/bx20.html",
    "source_image_url": "https://beyblade.takaratomy.co.jp/beyblade-x/lineup/_image/detail_bx20B.png",
    "evidence": "official_detail_image_visually_verified_2026-10-25",
    "facts_ja": "10枚歯ギヤでダッシュ速度を抑え回数を増やす。",
    "contact_shape": "flat",
    "mechanisms": [
      "ten_tooth_gear",
      "reduced_rail_speed_conversion"
    ],
    "estimated": {
      "gearTeeth": 10,
      "gearTeethStatus": "official",
      "gearRadiusScale": 0.83
    }
  },
  {
    "code": "GF",
    "source_url": "https://beyblade.takaratomy.co.jp/beyblade-x/lineup/bx23.html",
    "source_image_url": "https://beyblade.takaratomy.co.jp/beyblade-x/lineup/_image/detail_bx23.png",
    "evidence": "official_detail_image_visually_verified_2026-10-25",
    "facts_ja": "先端まで延ばしたギアでレールに掛かりやすく高速ダッシュ。",
    "contact_shape": "flat",
    "mechanisms": [
      "extended_gear_contact_band",
      "broad_floor_contact"
    ],
    "estimated": {
      "gearBandLoweringScale": 0.4
    }
  },
  {
    "code": "GB",
    "source_url": "https://beyblade.takaratomy.co.jp/beyblade-x/lineup/bx24.html",
    "source_image_url": "https://beyblade.takaratomy.co.jp/beyblade-x/lineup/_image/detail_bx24.png",
    "evidence": "official_detail_image_visually_verified_2026-10-25",
    "facts_ja": "大きい球形軸先と先端まで伸びるギア。",
    "contact_shape": "large_ball",
    "mechanisms": [
      "extended_gear_contact_band",
      "rolling_contact"
    ],
    "estimated": {
      "tipRadiusScale": 0.9
    }
  },
  {
    "code": "GP",
    "source_url": "https://beyblade.takaratomy.co.jp/beyblade-x/lineup/bx26.html",
    "source_image_url": "https://beyblade.takaratomy.co.jp/beyblade-x/lineup/_image/detail_bx26.png",
    "evidence": "official_detail_image_visually_verified_2026-10-25",
    "facts_ja": "Pのギアを先端まで延長して大きい動き変化。",
    "contact_shape": "point_flat",
    "mechanisms": [
      "extended_gear_contact_band",
      "central_point",
      "outer_flat_when_tilted"
    ],
    "estimated": {}
  },
  {
    "code": "GN",
    "source_url": "https://beyblade.takaratomy.co.jp/beyblade-x/lineup/bx27.html",
    "source_image_url": "https://beyblade.takaratomy.co.jp/beyblade-x/lineup/_image/detail_bx27.png",
    "evidence": "official_detail_image_visually_verified_2026-10-25",
    "facts_ja": "尖った軸先周囲までギア延長。中央守備とダッシュ。",
    "contact_shape": "needle",
    "mechanisms": [
      "extended_gear_contact_band",
      "small_contact"
    ],
    "estimated": {}
  },
  {
    "code": "A",
    "source_url": "https://beyblade.takaratomy.co.jp/beyblade-x/lineup/ux01.html",
    "source_image_url": "https://beyblade.takaratomy.co.jp/beyblade-x/lineup/_image/detail_ux01.png",
    "evidence": "official_detail_image_visually_verified_2026-10-25",
    "facts_ja": "平らな軸先と大型ギア。Xダッシュ特化。",
    "contact_shape": "flat",
    "mechanisms": [
      "large_gear",
      "broad_floor_contact"
    ],
    "estimated": {
      "gearRadiusScale": 1.18
    }
  },
  {
    "code": "DB",
    "source_url": "https://beyblade.takaratomy.co.jp/beyblade-x/lineup/ux03.html",
    "source_image_url": "https://beyblade.takaratomy.co.jp/beyblade-x/lineup/_image/detail_ux03.png",
    "evidence": "official_detail_image_visually_verified_2026-10-25",
    "facts_ja": "Bに円盤状の重り。外周重量配分で持久。",
    "contact_shape": "ball_disc",
    "mechanisms": [
      "rolling_contact",
      "peripheral_disc_mass"
    ],
    "estimated": {
      "bitInertiaScale": 1.3,
      "discRadiusScale": 1.7
    }
  },
  {
    "code": "C",
    "source_url": "https://beyblade.takaratomy.co.jp/beyblade-x/lineup/bx34.html",
    "source_image_url": "https://beyblade.takaratomy.co.jp/beyblade-x/lineup/_image/detail_bx34.png",
    "evidence": "official_detail_image_visually_verified_2026-10-25",
    "facts_ja": "渦状の平らな先端。左回転時に床への食いつきを高める。",
    "contact_shape": "spiral_flat",
    "mechanisms": [
      "spin_directional_traction",
      "broad_floor_contact"
    ],
    "estimated": {
      "leftTractionMultiplier": 1.18,
      "rightTractionMultiplier": 1
    }
  },
  {
    "code": "E",
    "source_url": "https://beyblade.takaratomy.co.jp/beyblade-x/lineup/bx36.html",
    "source_image_url": "https://beyblade.takaratomy.co.jp/beyblade-x/lineup/_image/detail_bx36.png",
    "evidence": "official_detail_image_visually_verified_2026-10-25",
    "facts_ja": "大型ガイドで姿勢を保ちXダッシュ時は軸先が浮く。",
    "contact_shape": "guided_tip",
    "mechanisms": [
      "large_guide",
      "rail_contact_lift"
    ],
    "estimated": {
      "guideRadiusScale": 1.8,
      "liftHeight": "unmeasured"
    }
  },
  {
    "code": "FB",
    "source_url": "https://beyblade.takaratomy.co.jp/beyblade-x/lineup/ux08.html",
    "source_image_url": "https://beyblade.takaratomy.co.jp/beyblade-x/lineup/_image/detail_ux08.png",
    "evidence": "official_detail_image_visually_verified_2026-10-25",
    "facts_ja": "ラチェットに対してビットがfree回転。細い球軸先。",
    "contact_shape": "small_ball",
    "mechanisms": [
      "independent_bit_spin",
      "rolling_contact"
    ],
    "estimated": {
      "bearingCoupling": "unmeasured"
    }
  },
  {
    "code": "LR",
    "source_url": "https://beyblade.takaratomy.co.jp/beyblade-x/lineup/ux11.html",
    "source_image_url": "https://beyblade.takaratomy.co.jp/beyblade-x/lineup/_image/detail_ux11.png",
    "evidence": "official_detail_image_visually_verified_2026-10-25",
    "facts_ja": "Rより1mm低い。アッパー攻撃向け。",
    "contact_shape": "flat",
    "mechanisms": [
      "ten_tooth_gear_family",
      "lower_height"
    ],
    "estimated": {
      "heightDeltaMetres": -0.001,
      "heightDeltaStatus": "official_relative_to_R"
    }
  },
  {
    "code": "MN",
    "source_url": "https://beyblade.takaratomy.co.jp/beyblade-x/lineup/ux05.html",
    "source_image_url": "https://beyblade.takaratomy.co.jp/beyblade-x/lineup/_image/detail_ux05.png",
    "evidence": "official_detail_image_visually_verified_2026-10-25",
    "facts_ja": "Nの先端が金属。重量と摩擦低減で安定。",
    "contact_shape": "metal_needle",
    "mechanisms": [
      "small_contact",
      "metal_tip"
    ],
    "estimated": {
      "tipFrictionMultiplier": 0.75,
      "massDelta": "unmeasured"
    }
  },
  {
    "code": "LO",
    "source_url": "https://beyblade.takaratomy.co.jp/beyblade-x/lineup/cx02.html",
    "source_image_url": "https://beyblade.takaratomy.co.jp/beyblade-x/lineup/_image/detail_CX02.png",
    "evidence": "official_detail_image_visually_verified_2026-10-25",
    "facts_ja": "Oより1mm低い。低重心化で持久向上。",
    "contact_shape": "small_hemisphere",
    "mechanisms": [
      "rolling_contact",
      "small_contact",
      "lower_height"
    ],
    "estimated": {
      "heightDeltaMetres": -0.001,
      "heightDeltaStatus": "official_relative_to_O"
    }
  },
  {
    "code": "UN",
    "source_url": "https://beyblade.takaratomy.co.jp/beyblade-x/lineup/cx14.html",
    "source_image_url": "https://beyblade.takaratomy.co.jp/beyblade-x/lineup/_image/detail_CX14.png",
    "evidence": "official_detail_image_visually_verified_2026-10-25",
    "facts_ja": "Nより2mm低く重心を下げる。",
    "contact_shape": "needle",
    "mechanisms": [
      "small_contact",
      "lower_height"
    ],
    "estimated": {
      "heightDeltaMetres": -0.002,
      "heightDeltaStatus": "official_relative_to_N"
    }
  },
  {
    "code": "W",
    "source_url": "https://beyblade.takaratomy.co.jp/beyblade-x/lineup/cx03.html",
    "source_image_url": "https://beyblade.takaratomy.co.jp/beyblade-x/lineup/_image/detail_CX03.png",
    "evidence": "official_detail_image_visually_verified_2026-10-25",
    "facts_ja": "鈍角の尖った軸先と10枚歯gearで傾き/ダッシュ損失を抑える。",
    "contact_shape": "blunt_needle",
    "mechanisms": [
      "blunt_point",
      "ten_tooth_gear"
    ],
    "estimated": {
      "gearTeeth": 10,
      "gearTeethStatus": "official"
    }
  },
  {
    "code": "D",
    "source_url": "https://beyblade.takaratomy.co.jp/beyblade-x/lineup/bx00-drsh.html",
    "source_image_url": "https://beyblade.takaratomy.co.jp/beyblade-x/lineup/_image/detail_bxg11.png",
    "evidence": "official_detail_image_visually_verified_2026-10-25",
    "facts_ja": "軸先の複数突起で床摩擦を増し押し出されにくくする。",
    "contact_shape": "dotted_flat",
    "mechanisms": [
      "multiple_floor_protrusions",
      "increased_traction"
    ],
    "estimated": {}
  },
  {
    "code": "BS",
    "source_url": "https://beyblade.takaratomy.co.jp/beyblade-x/lineup/bx44.html",
    "source_image_url": "https://beyblade.takaratomy.co.jp/beyblade-x/lineup/_image/detail_BX44.png",
    "evidence": "official_detail_image_visually_verified_2026-10-25",
    "facts_ja": "尖った先端がratchetに対し上下に沈み着地衝撃を吸収。",
    "contact_shape": "spring_needle",
    "mechanisms": [
      "axial_suspension"
    ],
    "estimated": {
      "springConstant": "unmeasured",
      "travelMetres": "unmeasured"
    }
  },
  {
    "code": "Z",
    "source_url": "https://beyblade.takaratomy.co.jp/beyblade-x/lineup/ux14.html",
    "source_image_url": "https://beyblade.takaratomy.co.jp/beyblade-x/lineup/_image/detail_UX14.png",
    "evidence": "official_detail_image_visually_verified_2026-10-25",
    "facts_ja": "大型gearのflat軸と中央突起で動的攻撃/静的守備。",
    "contact_shape": "point_flat",
    "mechanisms": [
      "large_gear",
      "central_point",
      "outer_flat_when_tilted"
    ],
    "estimated": {}
  },
  {
    "code": "DS",
    "source_url": "https://beyblade.takaratomy.co.jp/beyblade-x/lineup/bx50.html",
    "source_image_url": "https://beyblade.takaratomy.co.jp/beyblade-x/lineup/_image/detail_BX50.png",
    "evidence": "official_detail_image_visually_verified_2026-10-25",
    "facts_ja": "尖った軸に円盤状の重り。burst耐性20と引き換えに姿勢制御。simple jointでも20。",
    "contact_shape": "needle_disc",
    "mechanisms": [
      "small_contact",
      "peripheral_disc_mass"
    ],
    "estimated": {
      "burstResistanceOverride": 20,
      "burstResistanceOverrideStatus": "official_all_ratchets_including_simple_joint"
    }
  }
] as const;
export const ratchetShapeFacts = [
  {
    "code": "1-*",
    "count": 1,
    "summary_ja": "攻撃特化の1枚刃",
    "source": "https://beyblade.takaratomy.co.jp/beyblade-x/lineup/ux01.html"
  },
  {
    "code": "2-*",
    "count": 2,
    "summary_ja": "左回転時に弾きやすい2枚刃",
    "source": "https://beyblade.takaratomy.co.jp/beyblade-x/lineup/bx34.html"
  },
  {
    "code": "3-*",
    "count": 3,
    "summary_ja": "弾き性能を狙う3枚刃",
    "source": "https://beyblade.takaratomy.co.jp/beyblade-x/lineup/bx01.html"
  },
  {
    "code": "4-*",
    "count": 4,
    "summary_ja": "いなしを狙う4枚刃",
    "source": "https://beyblade.takaratomy.co.jp/beyblade-x/lineup/bx02.html"
  },
  {
    "code": "5-*",
    "count": 5,
    "summary_ja": "分厚く外周重量配分を狙う5枚刃",
    "source": "https://beyblade.takaratomy.co.jp/beyblade-x/lineup/bx26.html"
  },
  {
    "code": "9-*",
    "count": 9,
    "summary_ja": "連打を狙う9枚刃",
    "source": "https://beyblade.takaratomy.co.jp/beyblade-x/lineup/bx23.html"
  },
  {
    "code": "0-*",
    "count": 0,
    "summary_ja": "水平攻撃に耐えやすい円形0枚刃",
    "source": "https://beyblade.takaratomy.co.jp/beyblade-x/lineup/ux12.html"
  },
  {
    "code": "6-*",
    "count": 6,
    "summary_ja": "2種の刃を交互に配置した6枚刃",
    "source": "https://beyblade.takaratomy.co.jp/beyblade-x/lineup/cx03.html"
  },
  {
    "code": "7-*",
    "count": 7,
    "summary_ja": "分厚い垂直7枚刃",
    "source": "https://beyblade.takaratomy.co.jp/beyblade-x/lineup/bx00-drsh.html"
  },
  {
    "code": "8-*",
    "count": 8,
    "summary_ja": "大径で外周重量配分を狙う8枚刃",
    "source": "https://beyblade.takaratomy.co.jp/beyblade-x/lineup/cx14.html"
  }
] as const;
export const conditionalBurstFacts = [
  {
    "ratchet": "4-55",
    "effective_bit_burst_resistance": 30,
    "source_url": "https://beyblade.takaratomy.co.jp/beyblade-x/lineup/cx02.html",
    "source_image_url": "https://beyblade.takaratomy.co.jp/beyblade-x/lineup/_image/detail_CX02.png",
    "scope": "any_bit_with_this_ratchet",
    "reason_ja": "公式脚注がbit耐性を30に固定と明記"
  },
  {
    "ratchet": "M-85",
    "effective_bit_burst_resistance": 30,
    "source_url": "https://beyblade.takaratomy.co.jp/beyblade-x/lineup/bx44.html",
    "source_image_url": "https://beyblade.takaratomy.co.jp/beyblade-x/lineup/_image/detail_BX44.png",
    "scope": "any_bit_with_simple_joint_ratchet",
    "reason_ja": "公式脚注はsimple joint構造ratchetならbitに関わらず30。どの他ratchetが該当するかは個別確認が必要"
  },
  {
    "ratchet": "9-65",
    "effective_bit_burst_resistance": 30,
    "except_bit": "DS",
    "source_url": "https://beyblade.takaratomy.co.jp/beyblade-x/lineup/ux16.html",
    "source_image_url": "https://beyblade.takaratomy.co.jp/beyblade-x/lineup/_image/detail_UX16.png",
    "reason_ja": "simple joint。公式脚注でbitを問わず30（後発DSの例外が優先）"
  },
  {
    "ratchet": "7-55",
    "effective_bit_burst_resistance": 30,
    "except_bit": "DS",
    "source_url": "https://beyblade.takaratomy.co.jp/beyblade-x/lineup/ux18.html",
    "source_image_url": "https://beyblade.takaratomy.co.jp/beyblade-x/lineup/_image/detail_UX18.png",
    "reason_ja": "simple joint。公式脚注でbitを問わず30（後発DSの例外が優先）"
  }
] as const;
