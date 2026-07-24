window.APP_CONFIG = {
  supabaseUrl: "https://ojmpeuuldpsfuilnneui.supabase.co",
  supabaseKey: "sb_publishable_4fsA55-lJq9glbcg9Lqd6A__XmIJwIa",
  sheetsWebhookUrl: "https://script.google.com/macros/s/AKfycbxPZQ-RW9iDpZaiiT5FaceGlo0v1tbvQMgupstSjTwZAc37Z0eepChi0nAlqgKZKN8n/exec",
  // Apps Script 측에서 검증할 공유 토큰 (apps-script-v3.gs 참고)
  sheetsToken: "MMEEC-2607-HEAT",

  // ── 기상청 오픈API (기상 정보 팝업) ──────────────
  // 공공데이터포털 일반 인증키(Decoding)
  kmaServiceKey: "96214125ce610ed52ea92c3d5823a2ce7d3d6d1743bc3602b338a27e4926de63",
  // 울산 북구 양정동 격자 (근사치 — 기상청 공식 엑셀 대조 권장)
  kmaNx: 103,
  kmaNy: 84,
  // 기상특보 관할 지점 (159 = 부산지방기상청: 부산·울산·경남)
  kmaWrnStnId: 159,
  // 특보 텍스트에서 우리 지역만 걸러낼 키워드 (양정동=울산서부 L1082900)
  kmaAreaKeyword: "울산",
};
