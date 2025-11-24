from keep_alive import keep_alive
import logging
import re
import time
from telegram import Update
from telegram.ext import ApplicationBuilder, ContextTypes, CommandHandler, MessageHandler, filters
from supabase import create_client, Client

# --- SOZLAMALAR ---
SUPABASE_URL = "https://maahdpuwvaugqjfnihbu.supabase.co"
SUPABASE_KEY = "eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6Im1hYWhkcHV3dmF1Z3FqZm5paGJ1Iiwicm9sZSI6ImFub24iLCJpYXQiOjE3NjM4ODM4NTEsImV4cCI6MjA3OTQ1OTg1MX0.ILp0bW01IMLydAuXcYXQSM6NORGG5yjJt367JsFyDm4" # index.html dagi uzun key
BOT_TOKEN = "8546769864:AAFubr-PDQG5tcstUhRqo7Qw4cZlQd18h-4"

supabase: Client = create_client(SUPABASE_URL, SUPABASE_KEY)

logging.basicConfig(format='%(asctime)s - %(name)s - %(levelname)s - %(message)s', level=logging.INFO)

async def start(update: Update, context: ContextTypes.DEFAULT_TYPE):
    await update.message.reply_text(f"Assalomu alaykum, {update.effective_user.first_name}👋! \n\nMenga yozing yoki rasm (chek) yuboring kategoriya va summasi bilan.\nMasalan: '30 ming obed. \n\nAgar muammo yoki takliflar bo'lsa @uyqur_nurali ga murojaat qilishizngiz mumkin.'")

def parse_text(text):
    if not text: return None
    text = text.lower()
    amount = 0
    numbers = re.findall(r'\d+', text.replace(" ", ""))
    if not numbers: return None
    amount = int(numbers[0])
    if 'ming' in text or 'k' in text: amount *= 1000
    elif 'mln' in text or 'm' in text: amount *= 1000000
    
    trans_type = 'expense'
    if 'kirim' in text or 'keldi' in text or 'tushdi' in text: trans_type = 'income'
    
    ignore_words = ['ming', 'mln', 'kirim', 'chiqim', 'som', "so'm", 'ga', 'uchun', str(amount)]
    clean_text = text
    clean_text = re.sub(r'\d+', '', clean_text)
    category = clean_text
    for word in ignore_words: category = category.replace(word, "")
    category = category.strip().capitalize() or "Umumiy"
    
    return {"amount": amount, "type": trans_type, "category": category}

async def handle_message(update: Update, context: ContextTypes.DEFAULT_TYPE):
    user_id = update.effective_user.id
    
    # Matnni olish (Rasm tagida yoki oddiy xabar)
    text = update.message.text or update.message.caption
    
    # Agar rasm tashlab, tagiga hech narsa yozilmagan bo'lsa
    if not text:
        await update.message.reply_text("Rasm tagiga izoh yozmadingiz. Masalan: 30 ming nimagadur")
        return

    parsed = parse_text(text)
    
    if not parsed:
        await update.message.reply_text("Summani tushunmadim. Iltimos, raqam bilan yozing (Masalan: 30 ming).")
        return

    receipt_url = None
    
    # --- RASM YUKLASH QISMI (O'ZGARTIRILDI) ---
    if update.message.photo:
        status_msg = await update.message.reply_text("Rasm yuklanmoqda... ⏳")
        try:
            # Eng sifatli rasmni olamiz
            photo = update.message.photo[-1]
            file = await photo.get_file()
            
            # Faylni yuklab olish
            file_bytes = await file.download_as_bytearray()
            
            # MUHIM: bytearray ni bytes ga o'giramiz
            final_bytes = bytes(file_bytes)
            
            # Fayl nomi
            file_name = f"{user_id}_{int(time.time())}.jpg"
            
            # Supabasega yuklash
            res = supabase.storage.from_("receipts").upload(
                path=file_name,
                file=final_bytes,
                file_options={"content-type": "image/jpeg"}
            )
            
            # Linkni olish
            receipt_url = supabase.storage.from_("receipts").get_public_url(file_name)
            await status_msg.delete()
            
        except Exception as e:
            # Xatolikni terminalga ham, telegramga ham chiqarish
            error_text = str(e)
            print(f"Rasm xatosi: {error_text}")
            await status_msg.edit_text(f"⚠️ Rasm yuklanmadi! Xato: {error_text}\nLekin summa saqlanadi.")
            # Agar xato "Duplicate" bo'lsa yoki fayl nomi bilan bog'liq bo'lsa, shuni bilib olamiz

    # --- BAZAGA YOZISH ---
    try:
        data = {
            "user_id": user_id,
            "amount": parsed['amount'],
            "category": parsed['category'],
            "type": parsed['type'],
            "date": int(update.message.date.timestamp() * 1000),
            "receipt_url": receipt_url
        }
        
        supabase.table("transactions").insert(data).execute()
        
        emoji = "🟢" if parsed['type'] == 'income' else "🔴"
        formatted_amount = f"{parsed['amount']:,}".replace(",", " ")
        photo_icon = "📸 Rasm bilan" if receipt_url else ""
        
        await update.message.reply_text(
            f"{emoji} Tayyor! ({photo_icon})\n\n"
            f"💰Summa: {formatted_amount} so'm\n"
            f"📂Kategoriya: {parsed['category']}\n\n"
            f"Tranzaksiyani Kassaga kiritib qo'ydim✅"
        )
        
    except Exception as e:
        print(f"Baza xatosi: {e}")
        await update.message.reply_text(f"Baza xatosi: {e}")
if __name__ == '__main__':
    application = ApplicationBuilder().token(BOT_TOKEN).build()
    # FOTO va TEXT ni qabul qiladigan filter
    application.add_handler(CommandHandler('start', start))
    application.add_handler(MessageHandler(filters.PHOTO | (filters.TEXT & ~filters.COMMAND), handle_message))
    keep_alive()
    print("Bot ishga tushdi...")
    application.run_polling()