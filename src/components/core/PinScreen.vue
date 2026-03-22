<template>
  <div id="pin-screen">
    <div style="font-size:48px">🔐</div>
    <div>
      <div id="pin-ttl">PIN Kod</div>
      <div id="pin-sub">Kirish uchun 4 xonali kod</div>
    </div>
    <div id="pin-dots">
      <div class="pd" id="pd0"></div>
      <div class="pd" id="pd1"></div>
      <div class="pd" id="pd2"></div>
      <div class="pd" id="pd3"></div>
    </div>
    <button id="pin-bio-b" onclick="triggerBio()">
      <svg viewBox="0 0 24 24" fill="none">
        <path d="M12 1C8.14 1 5 4.14 5 8v3M12 1c3.86 0 7 3.14 7 7v3M8 21v-4a4 4 0 0 1 8 0v4M12 11v4"
          stroke-linecap="round" stroke-linejoin="round" />
      </svg>
      <span id="pin-bio-txt" data-i18n="pin_bio_btn">Biometrik</span>
    </button>
    <div class="pin-pad">
      <button class="pk" onclick="pp('1')">1</button><button class="pk" onclick="pp('2')">2</button><button class="pk"
        onclick="pp('3')">3</button>
      <button class="pk" onclick="pp('4')">4</button><button class="pk" onclick="pp('5')">5</button><button class="pk"
        onclick="pp('6')">6</button>
      <button class="pk" onclick="pp('7')">7</button><button class="pk" onclick="pp('8')">8</button><button class="pk"
        onclick="pp('9')">9</button>
      <div></div><button class="pk" onclick="pp('0')">0</button>
      <button class="pk" onclick="pd()" style="font-size:16px">⌫</button>
    </div>
    <button type="button" id="pin-cancel-b" onclick="cancelPin()" data-i18n="pin_cancel">Bekor qilish</button>
  </div>
</template>
