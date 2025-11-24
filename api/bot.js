const TelegramBot = require('node-telegram-bot-api');
const { createClient } = require('@supabase/supabase-js');

const token = process.env.BOT_TOKEN;
const supabaseUrl = process.env.SUPABASE_URL;
const supabaseKey = process.env.SUPABASE_KEY;

const bot = new TelegramBot(token);
const supabase = createClient(supabaseUrl, supabaseKey);

// Yordamchi: Kutish (Animatsiya uchun)
const sleep = (ms) => new Promise(r => setTimeout(r, ms));

// Yordamchi: Matnni tahlil qilish
function parseText(text) {
    if (!text) return null;
    text = text.toLowerCase();
    
    const numbers = text.replace(/\s/g, '').match(/\d+/g);
    if (!numbers) return null;
    
    let amount = parseInt(numbers[0]);
    if (text.includes('ming') || text.includes('k')) amount *= 1000;
    else if (text.includes('mln') || text.includes('m')) amount *= 1000000;
    
    let type = 'expense';
    if (['kirim', 'keldi', 'tushdi', 'savdo', '+'].some(word => text.includes(word))) type = 'income';
    
    const ignoreWords = ['ming', 'mln', 'kirim', 'chiqim', 'som', "so'm", 'ga', 'uchun', 'savdo', amount.toString()];
    let category = text.replace(/\d+/g, '');
    ignoreWords.forEach(word => { category = category.replace(word, ''); });
    category = category.trim().replace(/^\w/, c => c.toUpperCase()) || "Umumiy";
    
    return { amount, type, category };
}

const MAIN_KEYBOARD = {
    keyboard: [
        ['📊 Bugungi Hisobot', '📅 Oylik Hisobot'],
        ['↩️ Oxirgisini O\'chirish']
    ],
    resize_keyboard: true
};

module.exports = async (req, res) => {
    try {
        if (!req.body || !req.body.message) return res.status(200).send("Bot ishlamoqda 🚀");

        const msg = req.body.message;
        const chatId = msg.chat.id;
        const userId = msg.from.id;
        const text = msg.text || msg.caption;

        // 1. LOGIN TEKSHIRUVI
        const { data: user } = await supabase.from('users').select('*').eq('user_id', userId).single();

        if (msg.contact) {
            if (msg.contact.user_id !== userId) {
                await bot.sendMessage(chatId, "Iltimos, o'zingizni raqamingizni yuboring!");
                return res.status(200).send('OK');
            }
            await supabase.from('users').upsert({
                user_id: userId,
                phone_number: msg.contact.phone_number,
                full_name: `${msg.from.first_name} ${msg.from.last_name || ''}`.trim()
            });
            await bot.sendMessage(chatId, "🎉 Ro'yxatdan o'tdingiz! Kassani ishlatishingiz mumkin.", { reply_markup: MAIN_KEYBOARD });
            return res.status(200).send('OK');
        }

        if (!user) {
            await bot.sendMessage(chatId, "👋 Assalomu alaykum!\nBotdan foydalanish uchun telefon raqamingizni tasdiqlang.", {
                reply_markup: {
                    keyboard: [[{ text: "📱 Telefon raqamni yuborish", request_contact: true }]],
                    resize_keyboard: true,
                    one_time_keyboard: true
                }
            });
            return res.status(200).send('OK');
        }

        // --- HISOBOTLAR LOGIKASI (ANIMATSIYA BILAN) ---

        // 2. BUGUNGI HISOBOT
        if (text === '📊 Bugungi Hisobot') {
            // 1. Loading xabari
            const loadingMsg = await bot.sendMessage(chatId, "🔄 <b>Ma'lumotlarni yig'ayapman...</b>", { parse_mode: 'HTML' });
            
            const startOfDay = new Date();
            startOfDay.setHours(0,0,0,0);
            
            // 2. Bazadan olish
            const { data: trans } = await supabase.from('transactions')
                .select('*')
                .eq('user_id', userId)
                .gte('date', startOfDay.getTime());

            // Animatsiya: Tahlil
            await bot.editMessageText("📉 <b>Kirim/Chiqimlarni tahlil qilyapman...</b>", { chat_id: chatId, message_id: loadingMsg.message_id, parse_mode: 'HTML' });
            await sleep(500); // 0.5 soniya pauza (chiroyli ko'rinishi uchun)

            const inc = trans.filter(t => t.type === 'income').reduce((a, b) => a + (b.amount || 0), 0);
            const exp = trans.filter(t => t.type === 'expense').reduce((a, b) => a + (b.amount || 0), 0);
            const balance = inc - exp;
            
            // Animatsiya: Tayyor
            await bot.editMessageText("✅ <b>Deyarli tayyor!</b>", { chat_id: chatId, message_id: loadingMsg.message_id, parse_mode: 'HTML' });
            await sleep(500);

            // 3. Yakuniy natija (Edit qilamiz)
            const icon = balance >= 0 ? '📈' : '📉';
            await bot.editMessageText(
                `📊 <b>BUGUNGI HISOBOT:</b>\n\n` +
                `📥 Kirim: <b>+${inc.toLocaleString()}</b> so'm\n` +
                `📤 Chiqim: <b>-${exp.toLocaleString()}</b> so'm\n` +
                `➖➖➖➖➖➖➖➖\n` +
                `${icon} Sof qoldiq: <b>${balance.toLocaleString()} so'm</b>`, 
                { chat_id: chatId, message_id: loadingMsg.message_id, parse_mode: 'HTML' }
            );
            return res.status(200).send('OK');
        }

        // 3. OYLIK HISOBOT
        if (text === '📅 Oylik Hisobot') {
            const loadingMsg = await bot.sendMessage(chatId, "🔄 <b>Ma'lumotlarni yig'ayapman...</b>", { parse_mode: 'HTML' });

            const now = new Date();
            const startOfMonth = new Date(now.getFullYear(), now.getMonth(), 1).getTime();
            const monthName = now.toLocaleString('uz-UZ', { month: 'long' });

            const { data: trans } = await supabase.from('transactions')
                .select('*')
                .eq('user_id', userId)
                .gte('date', startOfMonth);
            
            await bot.editMessageText("📉 <b>Kirim/Chiqimlarni tahlil qilyapman...</b>", { chat_id: chatId, message_id: loadingMsg.message_id, parse_mode: 'HTML' });
            await sleep(600);

            const inc = trans.filter(t => t.type === 'income').reduce((a, b) => a + (b.amount || 0), 0);
            const exp = trans.filter(t => t.type === 'expense').reduce((a, b) => a + (b.amount || 0), 0);
            const balance = inc - exp;

            await bot.editMessageText("✅ <b>Deyarli tayyor!</b>", { chat_id: chatId, message_id: loadingMsg.message_id, parse_mode: 'HTML' });
            await sleep(500);
            
            const icon = balance >= 0 ? '🤑' : '💸';
            
            // Chiroyli format
            await bot.editMessageText(
                `📅 <b>${monthName.toUpperCase()} OYI HISOBOTI:</b>\n\n` +
                `🟩 Jami Kirim: <b>+${inc.toLocaleString()}</b> so'm\n` +
                `🟥 Jami Chiqim: <b>-${exp.toLocaleString()}</b> so'm\n` +
                `➖➖➖➖➖➖➖➖\n` +
                `${icon} <b>Sof Foyda: ${balance.toLocaleString()} so'm</b>`, 
                { chat_id: chatId, message_id: loadingMsg.message_id, parse_mode: 'HTML' }
            );
            return res.status(200).send('OK');
        }

        // 4. UNDO
        if (text === "↩️ Oxirgisini O'chirish") {
            const { data: lastTrans } = await supabase.from('transactions')
                .select('*').eq('user_id', userId).order('date', { ascending: false }).limit(1).single();

            if (lastTrans) {
                await supabase.from('transactions').delete().eq('id', lastTrans.id);
                await bot.sendMessage(chatId, `🗑 O'chirildi:\n${lastTrans.category}: ${lastTrans.amount.toLocaleString()} so'm`);
            } else {
                await bot.sendMessage(chatId, "O'chirish uchun ma'lumot yo'q.");
            }
            return res.status(200).send('OK');
        }

        if (text === '/start') {
            await bot.sendMessage(chatId, "Kassa ishlamoqda. Summa va izoh yozing:", { reply_markup: MAIN_KEYBOARD });
            return res.status(200).send('OK');
        }

        // 5. TRANZAKSIYANI QABUL QILISH
        const parsed = parseText(text);
        if (!parsed && !msg.photo) return res.status(200).send('OK');

        let receiptUrl = null;
        if (msg.photo) {
            const loading = await bot.sendMessage(chatId, "Rasm yuklanmoqda... ⏳");
            try {
                const photoId = msg.photo[msg.photo.length - 1].file_id;
                const fileLink = await bot.getFileLink(photoId);
                const response = await fetch(fileLink);
                const arrayBuffer = await response.arrayBuffer();
                const fileName = `${userId}_${Date.now()}.jpg`;

                const { error } = await supabase.storage.from('receipts').upload(fileName, Buffer.from(arrayBuffer), { contentType: 'image/jpeg' });
                if (!error) {
                    const { data } = supabase.storage.from('receipts').getPublicUrl(fileName);
                    receiptUrl = data.publicUrl;
                }
                await bot.deleteMessage(chatId, loading.message_id);
            } catch (e) {
                console.error(e);
            }
        }

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
            const photoText = receiptUrl ? " 📸" : "";
            
            await bot.sendMessage(chatId, 
                `${emoji} <b>Saqlandi:</b> ${money} so'm${photoText}\n📂 ${parsed.category}`,
                { parse_mode: 'HTML' }
            );
        } else if (msg.photo && !parsed) {
            await bot.sendMessage(chatId, "⚠️ Rasmni saqladim, lekin summani tushunmadim. Rasm tagiga izoh yozing.");
        }

        res.status(200).send('OK');
    } catch (error) {
        console.error("Bot Error:", error);
        res.status(200).send('Error');
    }
};