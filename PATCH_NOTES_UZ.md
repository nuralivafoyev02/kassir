# Qo'shimcha patch notes

## Ushbu bosqichda tuzatildi

1. `mirshodga qarz 100 ming` kabi matnlar endi oddiy chiqim yoki `Kredit` bo'lib ketmaydi. Bot buni qarz intent sifatida ushlaydi.
2. `100 ming Suxrobdan qaytdi`, `Suxrob 100 ming qaytardi`, `Suxrobga 80 ming qaytardim` kabi yozuvlar endi qarz qaytishi sifatida ishlanadi.
3. Agar ochiq qarz mavjud bo'lsa, `600 ming Mirshoddan` kabi qisqa yozuv ham debt settlement sifatida ushlanadi.
4. Botdagi `❓ Qo'llanma` to'liq qayta yozildi: kirim, chiqim, qarz berish, qarz olish, qarz qaytishi, reja tuzish misollari qo'shildi.
5. Reja kartalari yaxshilandi: necha foiz to'lgani, qancha qolgani yoki qanchaga oshib ketgani ko'rinadi.
6. Plan alert logikasi `100%` ga yetganda ham ishlaydi.
7. Mini App > Qarzlar ro'yxati soddalashtirildi: ro'yxatda asosan ism + summa, ustiga bosilganda to'liq ma'lumot ochiladi.
8. Yangi plan yaratishda ogohlantirish limiti bo'sh qoldirilsa, avtomatik `10%` default olinadi.

## O'zgargan fayllar
- `api/bot.js`
- `public/app.features.js`
- `public/style.css`
- `src/views/DebtsView.vue`
