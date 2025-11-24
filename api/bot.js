const TelegramBot = require('node-telegram-bot-api');
const { createClient } = require('@supabase/supabase-js');

// Vercel Environment o'zgaruvchilari
const token = process.env.BOT_TOKEN;
const supabaseUrl = process.env.SUPABASE_URL;
const supabaseKey = process.env.SUPABASE_KEY;

const bot = new TelegramBot(token);
const supabase = createClient(supabaseUrl, supabaseKey);

function parseText(text) {
    if (!text) return null;
    text = text.toLowerCase();
    
    // Raqamlarni ajratib olish
    const numbers = text.replace(/\s/g, '').match(/\d+/g);
    if (!numbers) return null;
    
    let amount = parseInt(numbers[0]);
    if (text.includes('ming') || text.includes('k')) amount *= 1000;
    else if (text.includes('mln') || text.includes('m')) amount *= 1000000;
    
    let type = 'expense';
    if (['kirim', 'keldi', 'tushdi'].some(word => text.includes(word))) type = 'income';
    
    const ignoreWords = ['ming', 'mln', 'kirim', 'chiqim', 'som', "so'm", 'ga', 'uchun', amount.toString()];
    let category = text.replace(/\d+/g, '');
    ignoreWords.forEach(word => { category = category.replace(word, ''); });
    category = category.trim().replace(/^\w/, c => c.toUpperCase()) || "Umumiy";
    
    return { amount, type, category };
}

module.exports = async (req, res) => {
    try {
        // Agar webhookdan bo'sh so'rov kelsa
        if (!req.body || !req.body.message) return res.status(200).send("Bot ishlamoqda 🚀");

        const msg = req.body.message;
        const chatId = msg.chat.id;
        const userId = msg.from.id;
        const text = msg.text || msg.caption;

        // Start komandasi
        if (text === '/start') {
            await bot.sendMessage(chatId, `Assalomu alaykum! Kassaga xush kelibsiz. Marxamat ishni boshlaymiz.`);
            return res.status(200).send('OK');
        }

        // Tahlil
        const parsed = parseText(text);
        if (!parsed && !msg.photo) {
            await bot.sendMessage(chatId, "Summani tushunmadim. Iltimos, raqam bilan yozing.");
            return res.status(200).send('OK');
        }

        // Rasm yuklash
        let receiptUrl = null;
        if (msg.photo) {
            const loading = await bot.sendMessage(chatId, "Rasm yuklanmoqda... ⏳");
            try {
                const photoId = msg.photo[msg.photo.length - 1].file_id;
                const fileLink = await bot.getFileLink(photoId);
                const response = await fetch(fileLink);
                const arrayBuffer = await response.arrayBuffer();
                const buffer = Buffer.from(arrayBuffer);
                const fileName = `${userId}_${Date.now()}.jpg`;

                const { error } = await supabase.storage.from('receipts').upload(fileName, buffer, { contentType: 'image/jpeg' });
                if (error) throw error;
                
                const { data } = supabase.storage.from('receipts').getPublicUrl(fileName);
                receiptUrl = data.publicUrl;
                await bot.deleteMessage(chatId, loading.message_id);
            } catch (e) {
                await bot.editMessageText(`⚠️ Rasm xatosi: ${e.message}`, { chat_id: chatId, message_id: loading.message_id });
            }
        }

        // Bazaga yozish
        if (parsed) {
            await supabase.from('transactions').insert({
                user_id: userId,
                amount: parsed.amount,
                category: parsed.category,
                type: parsed.type,
                date: Date.now(),
                receipt_url: receiptUrl
            });

            const emoji = parsed.type === 'income' ? '🟢' : '🔴';
            const money = parsed.amount.toLocaleString().replace(/,/g, ' ');
            const photoText = receiptUrl ? "📸rasm bilan" : "";
            await bot.sendMessage(chatId, `
                ${emoji}Tayyor! ${photoText}\n\n
                📂Kategoriya: ${parsed.category} \n
                📅Sana: ${new Date().toLocaleDateString()}\n
                💰Summa: ${money} so'm\n
                \nTranzaksiya Kassaga saqlandi✅`);
        }

        res.status(200).send('OK');
    } catch (error) {
        console.error(error);
        res.status(200).send('Error'); // Telegram qayta-qayta yubormasligi uchun 200 qaytaramiz
    }
};