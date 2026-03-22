<template>
  <!-- MODALS -->
  <div class="ov" id="ov-action" onclick="closeOv('ov-action',event)">
    <div class="sheet">
      <div class="sh-hdl"></div>
      <div id="action-btns"></div>
    </div>
  </div>
  <div class="ov center" id="ov-delete" onclick="closeOv('ov-delete',event)">
    <div class="sheet c" onclick="event.stopPropagation()">
      <div class="del-ico"><svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-linecap="round"
          stroke-linejoin="round">
          <polyline points="3 6 5 6 21 6" />
          <path d="M19 6v14a2 2 0 0 1-2 2H7a2 2 0 0 1-2-2V6m3 0V4a1 1 0 0 1 1-1h4a1 1 0 0 1 1 1v2" />
        </svg></div>
      <div style="text-align:center">
        <div style="font-size:17px;font-weight:800" data-i18n="confirm_delete">O'chirishni tasdiqlang</div>
        <div style="font-size:13px;color:var(--muted);margin-top:6px" data-i18n="confirm_delete_sub">Bu operatsiya bazadan o'chiriladi</div>
      </div>
      <div class="mrow"><button class="bcl" onclick="closeOv('ov-delete')" data-i18n="cancel">Bekor</button><button class="bdng"
          onclick="confirmDel()" data-i18n="action_delete">O'chirish</button></div>
    </div>
  </div>
  <div class="ov center" id="ov-edit" onclick="closeOv('ov-edit',event)">
    <div class="sheet c" onclick="event.stopPropagation()">
      <div class="sh-ttl">✏️ <span data-i18n="edit_title">Tahrirlash</span></div>
      <div class="fld"><label data-i18n="edit_category">Kategoriya</label><input id="ed-cat" type="text"></div>
      <div class="fld"><label data-i18n="edit_amount">Summa (so'm)</label><input id="ed-amt" type="text" inputmode="decimal"></div>
      <div class="fld"><label data-i18n="edit_type">Turi</label><select id="ed-type">
          <option value="income" data-i18n="edit_type_income">📈 Kirim</option>
          <option value="expense" data-i18n="edit_type_expense">📉 Chiqim</option>
        </select></div>
      <div class="mrow"><button class="bcl" onclick="closeOv('ov-edit')" data-i18n="cancel">Bekor</button><button class="bpri"
          onclick="saveEdit()" data-i18n="save">Saqlash</button></div>
    </div>
  </div>
  <div class="ov center" id="ov-editcat" onclick="closeOv('ov-editcat',event)">
    <div class="sheet c" onclick="event.stopPropagation()">
      <div class="sh-ttl">✏️ <span data-i18n="edit_cat_title">Kategoriya nomi</span></div>
      <div class="fld"><label data-i18n="edit_cat_new_name">Yangi nom</label><input id="ec-name" type="text" data-i18n-placeholder="new_cat_name_ph" placeholder="Nom..."></div>
      <div class="mrow"><button class="bcl" onclick="closeOv('ov-editcat')" data-i18n="cancel">Bekor</button><button class="bpri"
          onclick="saveEditCat()" data-i18n="save">Saqlash</button></div>
    </div>
  </div>
  <div class="ov" id="ov-addcat" onclick="closeOv('ov-addcat',event)">
    <div class="sheet" onclick="event.stopPropagation()">
      <div class="sh-hdl"></div>
      <button class="sh-close" onclick="closeOv('ov-addcat')">✕</button>
      <div class="sh-ttl" data-i18n="new_cat_title">Yangi Kategoriya</div>
      <div class="fld">
        <label data-i18n="new_cat_name">Nom</label>
        <input id="nc-name" type="text" data-i18n-placeholder="new_cat_name_ph" placeholder="Kategoriya nomi...">
      </div>
      <div class="fld" style="margin-top:20px">
        <label data-i18n="new_cat_icon">Ikonka tanlang</label>
        <div id="icon-grid"></div>
      </div>
      <button class="bpri" style="margin-top:24px;width:100%" onclick="saveNewCat()" data-i18n="save">Saqlash</button>
    </div>
  </div>
  <div class="ov center" id="ov-date" onclick="closeOv('ov-date',event)">
    <div class="sheet c" onclick="event.stopPropagation()">
      <div class="sh-ttl">📅 <span data-i18n="date_range">Sana oralig'i</span></div>
      <div class="fld"><label data-i18n="date_start">Boshlanish</label><input id="d-from" type="date"></div>
      <div class="fld"><label data-i18n="date_end">Tugash</label><input id="d-to" type="date"></div>
      <div class="mrow"><button class="bcl" onclick="closeOv('ov-date')" data-i18n="cancel">Bekor</button><button class="bpri"
          onclick="applyDate()" data-i18n="date_apply">Qo'llash</button></div>
    </div>
  </div>
  <div class="ov center" id="ov-export" onclick="closeOv('ov-export',event)">
    <div class="sheet c exp-modal" onclick="event.stopPropagation()">
      <div class="sh-ttl">📄 <span data-i18n="pdf_title">PDF Hisobot</span></div>
      <div class="exp-hint" data-i18n="pdf_modal_hint">PDF hisobot Unicode formatda yaratiladi va kirill matnlar to‘g‘ri chiqadi.</div>
      <div class="exp-presets">
        <button class="exp-chip" type="button" data-exp-preset="today" onclick="setExportPreset('today')" data-i18n="pdf_preset_today">Bugun</button>
        <button class="exp-chip" type="button" data-exp-preset="month" onclick="setExportPreset('month')" data-i18n="pdf_preset_month">Shu oy</button>
        <button class="exp-chip" type="button" data-exp-preset="last30" onclick="setExportPreset('last30')" data-i18n="pdf_preset_last30">So‘nggi 30 kun</button>
      </div>
      <div class="exp-grid">
        <div class="fld"><label data-i18n="date_start">Boshlanish</label><input id="ex-from" type="date"></div>
        <div class="fld"><label data-i18n="date_end">Tugash</label><input id="ex-to" type="date"></div>
      </div>
      <div class="exp-cards panel">
        <div class="exp-card">
          <span class="exp-label" data-i18n="pdf_ops">Operatsiyalar</span>
          <strong id="ex-cnt">0</strong>
        </div>
        <div class="exp-card">
          <span class="exp-label" data-i18n="pdf_receipts">Cheklar</span>
          <strong id="ex-rec">0</strong>
        </div>
        <div class="exp-card income">
          <span class="exp-label" data-i18n="income">Kirim</span>
          <strong id="ex-inc">0</strong>
        </div>
        <div class="exp-card expense">
          <span class="exp-label" data-i18n="expense">Chiqim</span>
          <strong id="ex-exp">0</strong>
        </div>
        <div class="exp-card balance wide">
          <span class="exp-label" data-i18n="balance_title">Qoldiq</span>
          <strong id="ex-bal">0</strong>
        </div>
      </div>
      <div class="exp-meta panel">
        <div class="exp-s"><span data-i18n="pdf_period_label">Davr</span><span id="ex-period">—</span></div>
        <div class="exp-s"><span data-i18n="pdf_file_label">Fayl nomi</span><span id="ex-file">Kassa.pdf</span></div>
      </div>
      <div class="mrow"><button class="bcl" onclick="closeOv('ov-export')" data-i18n="cancel">Bekor</button><button class="bpri"
          id="ex-create-btn" onclick="makePDF()" data-i18n="pdf_create">Yaratish</button></div>
    </div>
  </div>
  <div class="ov" id="ov-settings" onclick="closeOv('ov-settings',event)">
    <div class="sheet stg-sheet" onclick="event.stopPropagation()">
      <div class="sh-hdl"></div>
      <button class="sh-close" onclick="closeOv('ov-settings')">✕</button>
      <div class="sh-ttl" data-i18n="settings_title">⚙️ Sozlamalar</div>

      <!-- PROFIL -->
      <div class="stg-profile">
        <div class="stg-avatar" id="stg-avatar">
          <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.5" stroke-linecap="round"
            stroke-linejoin="round">
            <path d="M20 21v-2a4 4 0 0 0-4-4H8a4 4 0 0 0-4 4v2" />
            <circle cx="12" cy="7" r="4" />
          </svg>
        </div>
        <div class="stg-name" id="stg-user-name">—</div>
        <div class="stg-sub-info" id="stg-sub-info" data-i18n="stg_coming_soon">Tez orada</div>
      </div>

      <!-- GURUH: PROFIL -->
      <div class="stg-group">
        <div class="stg-item" onclick="openStgSub('stg-sub-profile')">
          <div class="stg-ico">👤</div>
          <div class="stg-txt" data-i18n="stg_edit_profile">Profilni tahrirlash</div>
          <div class="stg-arrow">›</div>
        </div>
        <div class="stg-item stg-disabled">
          <div class="stg-ico">💎</div>
          <div class="stg-txt" data-i18n="stg_subscription">Obuna holati</div>
          <span class="stg-badge" data-i18n="stg_coming_soon">Tez orada</span>
        </div>
      </div>

      <!-- GURUH: UMUMIY -->
      <div class="stg-group">
        <div class="stg-item" onclick="openTgGroup()">
          <div class="stg-ico">✈️</div>
          <div class="stg-txt" data-i18n="stg_tg_group">Telegram guruh</div>
          <div class="stg-arrow">›</div>
        </div>
        <div class="stg-item" onclick="openStgSub('stg-sub-rate')">
          <div class="stg-ico">💱</div>
          <div class="stg-txt" data-i18n="stg_balance">Balanslar</div>
          <div class="stg-arrow">›</div>
        </div>
        <div class="stg-item stg-disabled" onclick="openStgSub('stg-sub-cats')">
          <div class="stg-ico">📂</div>
          <div class="stg-txt" data-i18n="stg_categories">Kategoriyalar</div>
          <span class="stg-badge" data-i18n="stg_coming_soon">Tez orada</span>
          <!-- <div class="stg-arrow">›</div> -->
        </div>
        <div class="stg-item stg-disabled">
          <div class="stg-ico">👥</div>
          <div class="stg-txt" data-i18n="stg_friends">Do'stlar</div>
          <span class="stg-badge" data-i18n="stg_coming_soon">Tez orada</span>
        </div>
        <div class="stg-item stg-disabled">
          <div class="stg-ico">🔔</div>
          <div class="stg-txt" data-i18n="stg_notifications">Bildirishnomalar</div>
          <span class="stg-badge" data-i18n="stg_coming_soon">Tez orada</span>
        </div>
      </div>

      <!-- GURUH: HISOBOTLAR -->
      <div class="stg-group">
        <div class="stg-item" onclick="openExport()">
          <div class="stg-ico">📥</div>
          <div class="stg-txt" data-i18n="stg_download_report">Hisobotni yuklab olish</div>
          <div class="stg-arrow">›</div>
        </div>
        <div class="stg-item" onclick="resetData()">
          <div class="stg-ico">🗑️</div>
          <div class="stg-txt stg-danger" data-i18n="stg_clear_data">Hisobotlarni tozalash</div>
          <div class="stg-arrow">›</div>
        </div>
      </div>

      <!-- GURUH: HAQIDA -->
      <div class="stg-group">
        <div class="stg-item" onclick="openStgSub('stg-sub-guide')">
          <div class="stg-ico">📖</div>
          <div class="stg-txt" data-i18n="stg_guide">Foydalanish yo'riqnomasi</div>
          <div class="stg-arrow">›</div>
        </div>
        <div class="stg-item" onclick="openStgSub('stg-sub-lang')">
          <div class="stg-ico">🌍</div>
          <div class="stg-txt" data-i18n="stg_language">Tilni o'zgartirish</div>
          <div class="stg-arrow">›</div>
        </div>
      </div>

      <!-- GURUH: YORDAM -->
      <div class="stg-group">
        <div class="stg-item" onclick="openSupport()">
          <div class="stg-ico">💬</div>
          <div class="stg-txt" data-i18n="stg_support">Qo'llab-quvvatlash</div>
          <div class="stg-arrow">›</div>
        </div>
        <div class="stg-item" onclick="openStgSub('stg-sub-terms')">
          <div class="stg-ico">📋</div>
          <div class="stg-txt" data-i18n="stg_terms">Bizning shartlar</div>
          <div class="stg-arrow">›</div>
        </div>
        <div class="stg-item" onclick="openStgSub('stg-sub-privacy')">
          <div class="stg-ico">🛡️</div>
          <div class="stg-txt" data-i18n="stg_privacy">Maxfiylik siyosati</div>
          <div class="stg-arrow">›</div>
        </div>
      </div>

      <!-- GURUH: XAVFSIZLIK -->
      <div class="stg-group">
        <div class="stg-item">
          <div class="stg-ico">🔐</div>
          <div class="stg-info">
            <div class="stg-txt" data-i18n="stg_pin">PIN Kod</div>
            <div class="stg-sub" id="stg-pin-status" data-i18n="stg_pin_not_set">O'rnatilmagan</div>
          </div>
          <button class="stg-action-btn" onclick="setupPin()" data-i18n="stg_pin_setup">O'rnatish</button>
        </div>
        <div class="stg-item" id="stg-pin-rm-row" style="display:none">
          <div class="stg-ico">❌</div>
          <div class="stg-txt stg-danger" data-i18n="stg_pin_remove" onclick="removePin()">PIN ni o'chirish</div>
        </div>
        <div class="stg-item" id="stg-bio-row" style="display:none">
          <div class="stg-ico">👆</div>
          <div class="stg-info">
            <div class="stg-txt" data-i18n="stg_biometric">Biometrik</div>
            <div class="stg-sub" data-i18n="stg_biometric_sub">Face ID / Touch ID</div>
          </div>
          <div class="tgl" id="stg-bio-tgl" onclick="toggleBio(event)" role="switch" data-i18n-aria-label="stg_biometric"></div>
        </div>
        <div class="stg-item">
          <div class="stg-ico" id="stg-theme-ico">🌙</div>
          <div class="stg-info">
            <div class="stg-txt" data-i18n="stg_theme">Mavzu</div>
            <div class="stg-sub" data-i18n="stg_theme_sub">Tungi / Kunduzgi</div>
          </div>
          <button class="stg-action-btn" onclick="toggleTheme()" data-i18n="stg_theme_toggle">Almashtirish</button>
        </div>
      </div>

      <!-- GURUH: DATA -->
      <div class="stg-group">
        <div class="stg-item" onclick="doExport()">
          <div class="stg-ico">📤</div>
          <div class="stg-txt" data-i18n="stg_export_json">JSON Eksport</div>
          <div class="stg-arrow">›</div>
        </div>
        <label class="stg-item" style="cursor:pointer">
          <div class="stg-ico">📥</div>
          <div class="stg-txt" data-i18n="stg_import_json">JSON Import</div>
          <input type="file" accept=".json" style="display:none" onchange="doImport(event)">
          <div class="stg-arrow">›</div>
        </label>
      </div>

      <div style="height:40px"></div>
    </div>
  </div>

  <!-- SETTINGS SUBPAGES -->
  <div class="ov" id="stg-sub-profile" onclick="closeOv('stg-sub-profile',event)">
    <div class="sheet stg-sheet" onclick="event.stopPropagation()">
      <div class="sh-hdl"></div>
      <button class="sh-close" onclick="closeOv('stg-sub-profile')">✕</button>
      <div class="sh-ttl" data-i18n="stg_edit_profile">Profilni tahrirlash</div>
      <div class="stg-profile">
        <div class="stg-avatar lg" id="stg-avatar-edit">
          <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.5">
            <path d="M20 21v-2a4 4 0 0 0-4-4H8a4 4 0 0 0-4 4v2" />
            <circle cx="12" cy="7" r="4" />
          </svg>
        </div>
        <input id="profile-photo-input" type="file" accept="image/*" hidden onchange="handleProfilePhotoInput(event)">
        <div class="profile-photo-actions">
          <button type="button" class="stg-action-btn profile-photo-btn" id="profile-photo-pick-btn" onclick="pickProfilePhoto()" data-i18n="profile_photo_upload">Rasm yuklash</button>
          <button type="button" class="stg-action-btn profile-photo-btn danger" id="profile-photo-remove-btn" onclick="removeProfilePhoto()" data-i18n="profile_photo_remove">O'chirish</button>
        </div>
        <div class="profile-photo-note" id="profile-photo-note" data-i18n="profile_photo_hint">Profil rasmi bosh sahifa va sozlamalarda ko'rinadi.</div>
      </div>
      <div class="fld"><label data-i18n="new_cat_name">Ism</label><input id="stg-name-in" type="text"
          data-i18n-placeholder="profile_name_placeholder" placeholder="Ismingiz..."></div>
      <button class="bpri" style="width:100%;margin-top:16px" onclick="saveProfile()" data-i18n="save">Saqlash</button>
    </div>
  </div>

  <div class="ov" id="stg-sub-rate" onclick="closeStgRateBackdrop(event)">
    <div class="sheet stg-sheet" onclick="event.stopPropagation()">
      <div class="sh-hdl"></div>
      <button class="sh-close" onclick="closeStgRate(false)">✕</button>
      <div class="sh-ttl" data-i18n="stg_balance">💱 Balanslar</div>
      <div class="fld">
        <label data-i18n="stg_rate_sub">1 USD = ? UZS</label>
        <input id="stg-rate-in" type="text" inputmode="decimal" placeholder="12850" oninput="handleRateInput(this)">
      </div>
      <div class="mrow" style="margin-top:20px">
        <button class="bcl" onclick="closeStgRate(false)" data-i18n="cancel">Bekor qilish</button>
        <button class="bpri" onclick="saveRateFromStg()" data-i18n="save">Saqlash</button>
      </div>
    </div>
  </div>

  <div class="ov" id="stg-sub-cats" onclick="closeOv('stg-sub-cats',event)">
    <div class="sheet stg-sheet" onclick="event.stopPropagation()">
      <div class="sh-hdl"></div>
      <button class="sh-close" onclick="closeOv('stg-sub-cats')">✕</button>
      <div class="sh-ttl" data-i18n="stg_categories">📂 Kategoriyalar</div>
      <div class="stg-cat-tabs">
        <button class="stg-cat-tab active" id="stg-cat-inc-tab" onclick="stgCatTab('income')">📈 <span
            data-i18n="income">Kirim</span></button>
        <button class="stg-cat-tab" id="stg-cat-exp-tab" onclick="stgCatTab('expense')">📉 <span
            data-i18n="expense">Chiqim</span></button>
      </div>
      <div id="stg-cat-list"></div>
      <button class="bpri" style="width:100%;margin-top:16px" onclick="openAddCatFromStg()">
        + <span data-i18n="add_new_cat">Yangi kategoriya</span>
      </button>
    </div>
  </div>

  <div class="ov" id="stg-sub-lang" onclick="closeOv('stg-sub-lang',event)">
    <div class="sheet stg-sheet" onclick="event.stopPropagation()">
      <div class="sh-hdl"></div>
      <button class="sh-close" onclick="closeOv('stg-sub-lang')">✕</button>
      <div class="sh-ttl" data-i18n="stg_language">🌍 Tilni o'zgartirish</div>
      <div class="stg-group" style="margin-top:8px">
        <div class="stg-item stg-lang-opt" data-lang="uz" onclick="changeLang('uz')">
          <div class="stg-ico">🇺🇿</div>
          <div class="stg-txt" data-i18n="stg_lang_uz">O'zbek tili</div>
          <div class="stg-check" id="lang-check-uz">✓</div>
        </div>
        <div class="stg-item stg-lang-opt" data-lang="ru" onclick="changeLang('ru')">
          <div class="stg-ico">🇷🇺</div>
          <div class="stg-txt" data-i18n="stg_lang_ru">Русский</div>
          <div class="stg-check" id="lang-check-ru"></div>
        </div>
        <div class="stg-item stg-lang-opt" data-lang="en" onclick="changeLang('en')">
          <div class="stg-ico">🇬🇧</div>
          <div class="stg-txt" data-i18n="stg_lang_en">English</div>
          <div class="stg-check" id="lang-check-en"></div>
        </div>
      </div>
    </div>
  </div>

  <div class="ov center" id="stg-sub-terms" onclick="closeOv('stg-sub-terms',event)">
    <div class="sheet c" onclick="event.stopPropagation()" style="max-height:80vh;overflow-y:auto">
      <div class="sh-ttl" data-i18n="terms_title">📋 Bizning shartlar</div>
      <div class="stg-legal-text" id="stg-terms-text"></div>
      <button class="bcl" style="width:100%;margin-top:16px" onclick="closeOv('stg-sub-terms')"
        data-i18n="stg_close">Yopish</button>
    </div>
  </div>

  <div class="ov center" id="stg-sub-privacy" onclick="closeOv('stg-sub-privacy',event)">
    <div class="sheet c" onclick="event.stopPropagation()" style="max-height:80vh;overflow-y:auto">
      <div class="sh-ttl" data-i18n="privacy_title">🛡️ Maxfiylik siyosati</div>
      <div class="stg-legal-text" id="stg-privacy-text"></div>
      <button class="bcl" style="width:100%;margin-top:16px" onclick="closeOv('stg-sub-privacy')"
        data-i18n="stg_close">Yopish</button>
    </div>
  </div>

  <div class="ov center" id="stg-sub-guide" onclick="closeOv('stg-sub-guide',event)">
    <div class="sheet c" onclick="event.stopPropagation()" style="max-height:80vh;overflow-y:auto">
      <div class="sh-ttl">📖 <span data-i18n="guide_title">Foydalanish yo'riqnomasi</span></div>
      <div class="stg-legal-text" data-i18n-html="guide_html">
        <p><strong>Kassa</strong> — shaxsiy moliyaviy boshqaruv ilovasi.</p>
        <p>📌 <strong>Kirim/Chiqim qo'shish:</strong> Pastdagi "+" tugmasini bosing, turini tanlang, kategoriyani belgilang va summani kiriting.</p>
        <p>📊 <strong>Hisobotlar:</strong> Bosh sahifada diagramma va trendlarni ko'ring. Sana filtri orqali ma'lum davr uchun ko'ring.</p>
        <p>📱 <strong>Telegram bot:</strong> Botga xabar yozing (masalan: "500 ming ovqat chiqim") va tranzaksiya avtomatik saqlanadi.</p>
        <p>🔐 <strong>Xavfsizlik:</strong> PIN kod va Face ID/Touch ID orqali ilovangizni himoyalang.</p>
        <p>📤 <strong>Eksport:</strong> Ma'lumotlarni JSON formatida saqlash yoki PDF hisobot yaratish mumkin.</p>
      </div>
      <button class="bcl" style="width:100%;margin-top:16px" onclick="closeOv('stg-sub-guide')"
        data-i18n="stg_close">Yopish</button>
    </div>
  </div>

  <div id="ctx-menu"><button class="ctx-i blue" onclick="ctxEdit()"><svg viewBox="0 0 24 24" fill="none"
        stroke="currentColor" stroke-linecap="round" stroke-linejoin="round">
        <path d="M11 4H4a2 2 0 0 0-2 2v14a2 2 0 0 0 2 2h14a2 2 0 0 0 2-2v-7" />
        <path d="M18.5 2.5a2.121 2.121 0 0 1 3 3L12 15l-4 1 1-4 9.5-9.5z" />
      </svg><span data-i18n="action_edit">Tahrirlash</span></button>
    <div class="ctx-div"></div><button class="ctx-i red" onclick="ctxDel()"><svg viewBox="0 0 24 24" fill="none"
        stroke="currentColor" stroke-linecap="round" stroke-linejoin="round">
        <polyline points="3 6 5 6 21 6" />
        <path d="M19 6v14a2 2 0 0 1-2 2H7a2 2 0 0 1-2-2V6" />
      </svg><span data-i18n="action_delete">O'chirish</span></button>
  </div>
  <div id="rec-view" onclick="closeReceiptViewer(event)">
    <div class="rec-shell" onclick="event.stopPropagation()">
      <div class="rec-toolbar">
        <button type="button" class="rec-tool" id="rec-open-btn" onclick="openReceiptExternal()">↗ <span data-i18n="receipt_open">Ochish</span></button>
        <button type="button" class="rec-tool primary" id="rec-save-btn" onclick="downloadReceipt()">⬇ <span data-i18n="receipt_save">Saqlash</span></button>
        <button type="button" class="rec-tool" onclick="closeReceiptViewer()">✕</button>
      </div>
      <div class="rec-stage">
        <div id="rec-loader" class="rec-loader" data-i18n="receipt_loading">Chek yuklanmoqda...</div>
        <div id="rec-error" class="rec-error"></div>
        <img id="rec-img" src="" alt="chek" data-i18n-alt="hist_receipt">
      </div>
    </div>
  </div>
</template>
