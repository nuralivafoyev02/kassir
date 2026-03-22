<template>
      <div id="view-add" :class="['view', { active }]">
        <div class="add-hdr">
          <h2 data-i18n="add_title">Tranzaksiya</h2>
          <p data-i18n="add_sub">Kirim yoki chiqimni qo'shing</p>
        </div>
        <div id="chat-area">
          <div class="msg" data-i18n="add_hello">👋 Salom! Kirim yoki chiqimni qo'shing.</div>
        </div>
        <div class="add-ctrl">
          <div id="flow-start">
            <button class="fbtn i" onclick="startFlow('income')"><svg viewBox="0 0 24 24" fill="none"
                stroke="currentColor" stroke-linecap="round" stroke-linejoin="round">
                <circle cx="12" cy="12" r="10" />
                <line x1="12" y1="8" x2="12" y2="16" />
                <line x1="8" y1="12" x2="16" y2="12" />
              </svg><span data-i18n="add_income">Kirim</span></button>
            <button class="fbtn e" onclick="startFlow('expense')"><svg viewBox="0 0 24 24" fill="none"
                stroke="currentColor" stroke-linecap="round" stroke-linejoin="round">
                <circle cx="12" cy="12" r="10" />
                <line x1="8" y1="12" x2="16" y2="12" />
              </svg><span data-i18n="add_expense">Chiqim</span></button>
          </div>
          <div id="flow-cats">
            <div class="cats-hdr">
              <span data-i18n="add_select_cat">Kategoriya tanlang</span>
              <button class="add-cat-b" onclick="openAddCat()"><svg viewBox="0 0 24 24" fill="none"
                  stroke="currentColor" stroke-linecap="round" stroke-linejoin="round">
                  <line x1="12" y1="5" x2="12" y2="19" />
                  <line x1="5" y1="12" x2="19" y2="12" />
                </svg><span data-i18n="add_new_cat">Yangi</span></button>
            </div>
            <div id="cat-grid"></div>
            <button class="cflow-cancel" onclick="cancelFlow()">✕ <span data-i18n="add_cancel">Bekor
                qilish</span></button>
          </div>
          <div id="flow-input">
            <div class="flow-meta">
              <span id="flow-type-badge" class="flow-type-badge income" data-i18n="income">Kirim</span>
              <span id="flow-cat-pill" class="flow-cat-pill" data-i18n="flow_cat_unselected">Kategoriya tanlanmagan</span>
            </div>
            <div class="in-row">
              <button class="cur-btn" id="cur-btn" onclick="toggleCur()">UZS</button>
              <input id="amt-in" type="text" inputmode="decimal" data-i18n-placeholder="add_amount_placeholder"
                placeholder="Summani kiriting..." oninput="formatInputAmount(event)">
            </div>
            <div id="rec-area">
              <img id="rec-thumb" src="" alt="chek">
              <div>
                <div style="font-size:13px;font-weight:600" data-i18n="add_receipt_attached">✅ Chek biriktirildi</div>
                <button class="rec-del" onclick="clearRec()" data-i18n="add_receipt_remove">O'chirish</button>
              </div>
            </div>
            <div class="act-row">
              <label class="clip-b"><svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-linecap="round"
                  stroke-linejoin="round">
                  <path
                    d="M21.44 11.05l-9.19 9.19a6 6 0 0 1-8.49-8.49l9.19-9.19a4 4 0 0 1 5.66 5.66l-9.2 9.19a2 2 0 0 1-2.83-2.83l8.49-8.48" />
                </svg><input type="file" accept="image/*" style="display:none" onchange="handleFile(event)"></label>
              <button class="save-b" id="flow-save-btn" onclick="submitFlow()">💾 <span data-i18n="add_save">Saqlash</span></button>
              <button class="cancel-x" onclick="cancelFlow()"><svg viewBox="0 0 24 24" fill="none" stroke="currentColor"
                  stroke-linecap="round" stroke-linejoin="round">
                  <line x1="18" y1="6" x2="6" y2="18" />
                  <line x1="6" y1="6" x2="18" y2="18" />
                </svg></button>
            </div>
          </div>
        </div>
      </div>
</template>

<script setup>
defineProps({
  active: { type: Boolean, default: false }
})
</script>
