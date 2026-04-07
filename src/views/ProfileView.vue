<template>
  <div id="view-profile" :class="['view', 'view-profile', { active }]">
    <div class="profile-view-head">
      <h2 data-i18n="nav_profile">Profil</h2>
    </div>

    <div class="profile-view-shell">
      <div class="stg-profile">
        <div class="stg-avatar" id="stg-avatar">
          <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.5" stroke-linecap="round"
            stroke-linejoin="round">
            <path d="M20 21v-2a4 4 0 0 0-4-4H8a4 4 0 0 0-4 4v2" />
            <circle cx="12" cy="7" r="4" />
          </svg>
        </div>
        <div class="stg-name" id="stg-user-name">—</div>
        <div class="stg-sub-info" id="stg-sub-info" data-i18n="stg_coming_soon">Tez kunda</div>
      </div>

      <div class="stg-group">
        <div class="stg-item" onclick="openStgSub('stg-sub-profile')">
          <div class="stg-ico">👤</div>
          <div class="stg-txt" data-i18n="stg_edit_profile">Profilni tahrirlash</div>
          <div class="stg-arrow">›</div>
        </div>
        <div class="stg-item" id="stg-subscription-item" onclick="openStgSub('stg-sub-subscription')">
          <div class="stg-ico">💎</div>
          <div class="stg-info">
            <div class="stg-txt" data-i18n="stg_subscription">Obuna holati</div>
            <div class="stg-sub" id="stg-subscription-sub">Bepul · Obuna bo'lmagan</div>
          </div>
          <span class="stg-badge" id="stg-subscription-badge">Bepul</span>
          <div class="stg-arrow">›</div>
        </div>
      </div>

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
        <div class="stg-item" onclick="openStgSub('stg-sub-cats')">
          <div class="stg-ico">📂</div>
          <div class="stg-txt" data-i18n="stg_categories">Kategoriyalar</div>
          <div class="stg-arrow">›</div>
        </div>
        <div class="stg-item stg-disabled">
          <div class="stg-ico">👥</div>
          <div class="stg-txt" data-i18n="stg_friends">Do'stlar</div>
          <span class="stg-badge" data-i18n="stg_coming_soon">Tez kunda</span>
        </div>
        <div class="stg-item" onclick="openStgSub('stg-sub-notifications')">
          <div class="stg-ico">🔔</div>
          <div class="stg-info">
            <div class="stg-txt" data-i18n="stg_notifications">Bildirishnomalar</div>
            <div class="stg-sub" data-i18n="stg_notifications_sub">Ogohlantirishlar sozlash</div>
          </div>
          <div class="stg-arrow">›</div>
        </div>
      </div>

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
          <div class="tgl" id="stg-bio-tgl" onclick="toggleBio(event)" role="switch"
            data-i18n-aria-label="stg_biometric"></div>
        </div>
        <div class="stg-item theme-item-block">
          <div class="stg-ico" id="stg-theme-ico">🌙</div>
          <div class="stg-info">
            <div class="stg-txt" data-i18n="stg_theme">Mavzu</div>
            <div class="stg-sub" data-i18n="stg_theme_sub">Tungi / Kunduzgi</div>
          </div>
          <button class="stg-action-btn" onclick="toggleTheme()" data-i18n="stg_theme_toggle">Almashtirish</button>
        </div>
        <div class="theme-palette-wrap">
          <div class="theme-palette-head">
            <strong>Rang uslubi</strong>
            <span>Mini app aksent rangini tanlang</span>
          </div>
          <div class="theme-palette" id="theme-palette">
            <button type="button" class="theme-swatch" data-theme-color="gold" onclick="setAccentTheme('gold')">
              <span class="theme-dot gold"></span>
              <span class="theme-name">Sariq</span>
            </button>
            <button type="button" class="theme-swatch" data-theme-color="violet" onclick="setAccentTheme('violet')">
              <span class="theme-dot violet"></span>
              <span class="theme-name">Binafsha</span>
            </button>
            <button type="button" class="theme-swatch" data-theme-color="mono" onclick="setAccentTheme('mono')">
              <span class="theme-dot mono"></span>
              <span class="theme-name">Oq-qora</span>
            </button>
          </div>
        </div>
      </div>

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
    </div>
  </div>
</template>

<script setup>
defineProps({
  active: { type: Boolean, default: false },
})
</script>
