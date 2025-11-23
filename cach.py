import logging
import re
from telegram import Update
from telegram.ext import ApplicationBuilder, ContextTypes, CommandHandler, MessageHandler, filters
from supabase import create_client, Client

# --- SOZLAMALAR ---
# Supabase ma'lumotlaringiz (index.html dagi bilan bir xil)
SUPABASE_URL = "https://maahdpuwvaugqjfnihbu.supabase.co"
SUPABASE_KEY = "eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6Im1hYWhkcHV3dmF1Z3FqZm5paGJ1Iiwicm9sZSI6ImFub24iLCJpYXQiOjE3NjM4ODM4NTEsImV4cCI6MjA3OTQ1OTg1MX0.ILp0bW01IMLydAuXcYXQSM6NORGG5yjJt367JsFyDm4" # index.html dagi uzun key
BOT_TOKEN = "8546769864:AAFubr-PDQG5tcstUhRqo7Qw4cZlQd18h-4"

# Supabasega ulanish
supabase: Client = create_client(SUPABASE_URL, SUPABASE_KEY)

logging.basicConfig(
    format='%(asctime)s - %(name)s - %(levelname)s - %(message)s',
    level=logging.INFO
)

async def start(update: Update, context: ContextTypes.DEFAULT_TYPE):
    await update.message.reply_text(
        "Assalomu alaykum! Menga xarajat yoki kirimni yozing.\n\n"
        "Masalan: '30 ming chiqim obedga' yoki '200000 kirim oylik'"
    )

def parse_text(text):
    text = text.lower()
    
    # 1. Summani topish
    amount = 0
    # Raqamlarni ajratib olish (masalan: 30000 yoki 30)
    numbers = re.findall(r'\d+', text.replace(" ", ""))
    if not numbers:
        return None
    
    amount = int(numbers[0])
    
    # 'ming' va 'mln' so'zlarini hisobga olish
    if 'ming' in text or 'k' in text:
        amount *= 1000
    elif 'mln' in text or 'm' in text:
        amount *= 1000000
        
    # 2. Turini aniqlash (kirim/chiqim)
    trans_type = 'expense' # Default chiqim
    if 'kirim' in text or 'keldi' in text or 'tushdi' in text or 'foyda' in text:
        trans_type = 'income'
    
    # 3. Kategoriyani aniqlash (qolgan so'zlar)
    # Raqam va kalit so'zlarni olib tashlaymiz
    ignore_words = ['ming', 'mln', 'kirim', 'chiqim', 'so\'m', 'som', 'ga', 'uchun', str(amount)]
    clean_text = text
    # Raqamni o'chiramiz
    clean_text = re.sub(r'\d+', '', clean_text)
    
    category = clean_text
    for word in ignore_words:
        category = category.replace(word, "")
    
    category = category.strip().capitalize()
    if not category:
        category = "Umumiy"
        
    return {
        "amount": amount,
        "type": trans_type,
        "category": category
    }

async def handle_message(update: Update, context: ContextTypes.DEFAULT_TYPE):
    user_id = update.effective_user.id
    text = update.message.text
    
    parsed = parse_text(text)
    
    if not parsed:
        await update.message.reply_text("Tushunmadim 🤷‍♂️. Iltimos, summa va izohni yozing. M: '50 ming chiqim benzin'")
        return

    try:
        # Supabasega yozish
        data = {
            "user_id": user_id,
            "amount": parsed['amount'],
            "category": parsed['category'],
            "type": parsed['type'],
            "date": int(update.message.date.timestamp() * 1000), # JavaScript vaqti (ms)
            "receipt_url": None
        }
        
        supabase.table("transactions").insert(data).execute()
        
        # Javob qaytarish
        emoji = "🟢" if parsed['type'] == 'income' else "🔴"
        formatted_amount = f"{parsed['amount']:,}".replace(",", " ")
        
        await update.message.reply_text(
            f"{emoji} Saqlandi!\n\n"
            f"💰 Summa: {formatted_amount} so'm\n"
            f"📂 Kategoriya: {parsed['category']}\n"
            f"Mini Appga kirsangiz ko'rinasiz."
        )
        
    except Exception as e:
        print(f"Xatolik: {e}")
        await update.message.reply_text("Tizimda xatolik bo'ldi. Keyinroq urinib ko'ring.")

if __name__ == '__main__':
    application = ApplicationBuilder().token(BOT_TOKEN).build()
    
    application.add_handler(CommandHandler('start', start))
    application.add_handler(MessageHandler(filters.TEXT & (~filters.COMMAND), handle_message))
    
    print("Bot ishga tushdi...")
    application.run_polling()