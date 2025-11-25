const TelegramBot = require('node-telegram-bot-api');
const { createClient } = require('@supabase/supabase-js');

const token = process.env.BOT_TOKEN;
const supabaseUrl = process.env.SUPABASE_URL;
const supabaseKey = process.env.SUPABASE_KEY;

const bot = new TelegramBot(token);
const supabase = createClient(supabaseUrl, supabaseKey);

// Yordamchi: Kutish (Animatsiya uchun)
const sleep = (ms) => new Promise(r => setTimeout(r, ms));

// 🔥 KUCHAYTIRILGAN TAHLIL FUNKSIYASI (O'sha aqlli versiya)
function parseText(text) {
    if (!text) return null;
    let originalText = text;
    text = text.toLowerCase().trim();

    // 1. "so'm", "$" va boshqa belgilarni tozalash
    text = text.replace(/so'?m|sum|uzs|\$|€/g, '');

    // 2. Regex: Raqam + (k/ming/mln)
    let amount = 0;
    const numberMatch = text.match(/(\d+[.,]?\d*)\s*(k|ming|mln|m|mill?ion)?\b/);

    if (!numberMatch) return null;

    let rawNumber = numberMatch[1].replace(',', '.');
    let suffix = numberMatch[2];
    amount = parseFloat(rawNumber);

    if (suffix) {
        if (['k', 'ming'].includes(suffix)) amount *= 1000;
        else if (['m', 'mln', 'million'].includes(suffix)) amount *= 1000000;
    }

    // 3. Kirim/Chiqim aniqlash
    let type = 'expense';
    const incomeKeywords = ['+', 'kirim', 'tushdi', 'keldi', 'avans', 'oylik', 'bonus', 'qaytdi', 'foyda'];
    const expenseKeywords = ['-', 'chiqim', 'ketdi', 'tolandi', 'to\'landi', 'xarajat', 'berdi'];

    if (incomeKeywords.some(word => text.includes(word))) type = 'income';
    else if (originalText.trim().startsWith('+')) type = 'income';

    // 4. Kategoriya aniqlash
    let cleanText = text;
    cleanText = cleanText.replace(numberMatch[0], '');
    [...incomeKeywords, ...expenseKeywords].forEach(word => { cleanText = cleanText.replace(word, ''); });
    cleanText = cleanText.replace(/[+\-*/]/g, '').trim();

    let category = cleanText.charAt(0).toUpperCase() + cleanText.slice(1);
    if (category.length < 2) category = type === 'income' ? "Kirim" : "Umumiy xarajat";

    return { amount: Math.round(amount), type, category };
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
            if (msg.contact.user_id !== userId) return res.status(200).send('OK');
            
            await supabase.from('users').upsert({
                user_id: userId,
                phone_number: msg.contact.phone_number,
                full_name: `${msg.from.first_name} ${msg.from.last_name || ''}`.trim()
            });
            await bot.sendMessage(chatId, "🎉 <b>Ro'yxatdan o'tdingiz!</b>\nEndi xarajatlarni yozishingiz mumkin.", { reply_markup: MAIN_KEYBOARD, parse_mode: 'HTML' });
            return res.status(200).send('OK');
        }

        if (!user) {
            await bot.sendMessage(chatId, "👋 Assalomu alaykum!\nBotdan foydalanish uchun telefon raqamingizni tasdiqlang.", {
                reply_markup: {
                    keyboard: [[{ text: "📱 Telefon raqamni yuborish", request_contact: true }]],
                    resize_keyboard: true, one_time_keyboard: true
                }
            });
            return res.status(200).send('OK');
        }

        // 2. HISOBOTLAR
        if (text === '📊 Bugungi Hisobot' || text === '📅 Oylik Hisobot') {
            // Status xabari
            const statusMsg = await bot.sendMessage(chatId, "⏳ <b>Hisob-kitob qilinmoqda...</b>", { parse_mode: 'HTML' });
            
            const now = new Date();
            let startTime;
            let title;

            if (text === '📊 Bugungi Hisobot') {
                startTime = new Date(now.setHours(0,0,0,0)).getTime();
                title = "BUGUNGI HISOBOT";
            } else {
                startTime = new Date(now.getFullYear(), now.getMonth(), 1).getTime();
                title = `${now.toLocaleString('uz-UZ', { month: 'long' }).toUpperCase()} OYI HISOBOTI`;
            }

            const { data: trans } = await supabase.from('transactions')
                .select('*').eq('user_id', userId).gte('date', startTime);

            const inc = trans.filter(t => t.type === 'income').reduce((a, b) => a + (b.amount || 0), 0);
            const exp = trans.filter(t => t.type === 'expense').reduce((a, b) => a + (b.amount || 0), 0);
            const balance = inc - exp;

            // Xabarni yangilash (Edit)
            await bot.editMessageText(
                `📊 <b>${title}:</b>\n\n` +
                `📥 Kirim: <b>+${inc.toLocaleString()}</b> so'm\n` +
                `📤 Chiqim: <b>-${exp.toLocaleString()}</b> so'm\n` +
                `➖➖➖➖➖➖➖➖\n` +
                `${balance >= 0 ? '🤑' : '💸'} Sof qoldiq: <b>${balance.toLocaleString()} so'm</b>`,
                { chat_id: chatId, message_id: statusMsg.message_id, parse_mode: 'HTML' }
            );
            return res.status(200).send('OK');
        }

        if (text === "↩️ Oxirgisini O'chirish") {
            const statusMsg = await bot.sendMessage(chatId, "⏳ <b>Oxirgi operatsiya qidirilmoqda...</b>", { parse_mode: 'HTML' });
            
            const { data: lastTrans } = await supabase.from('transactions')
                .select('*').eq('user_id', userId).order('date', { ascending: false }).limit(1).single();

            if (lastTrans) {
                await supabase.from('transactions').delete().eq('id', lastTrans.id);
                await bot.editMessageText(
                    `🗑 <b>Muvaffaqiyatli o'chirildi!</b>\n\n` +
                    `📂 ${lastTrans.category}\n` +
                    `💰 ${lastTrans.amount.toLocaleString()} so'm`,
                    { chat_id: chatId, message_id: statusMsg.message_id, parse_mode: 'HTML' }
                );
            } else {
                await bot.editMessageText("⚠️ O'chirish uchun hech narsa topilmadi.", { chat_id: chatId, message_id: statusMsg.message_id });
            }
            return res.status(200).send('OK');
        }

        if (text === '/start') {
            await bot.sendMessage(chatId, "Kassa botiga xush kelibsiz! \nSumma va izoh yozing:", { reply_markup: MAIN_KEYBOARD });
            return res.status(200).send('OK');
        }

        // 3. ASOSIY TRANZAKSIYA LOGIKASI (Status qo'shilgan qism)
        const parsed = parseText(text);

        // Agar matnni tahlil qila olsak (raqam va izoh bor bo'lsa)
        if (parsed) {
            // 1-QADAM: Darhol javob qaytaramiz (Status)
            const processingMsg = await bot.sendMessage(chatId, 
                `⏳ <b>Ma'lumotlar tahlil qilinmoqda...</b>\n` + 
                `<i>Biroz kuting, bazaga saqlayapman</i> 🔄`, 
                { parse_mode: 'HTML' }
            );

            let receiptUrl = null;
            
            // Rasm yuklash (agar bo'lsa)
            if (msg.photo) {
                try {
                    // Statusni o'zgartiramiz agar rasm bo'lsa
                    await bot.editMessageText(
                        `📸 <b>Chek rasmi yuklanmoqda...</b>\n` + 
                        `<i>Biroz kuting...</i>`, 
                        { chat_id: chatId, message_id: processingMsg.message_id, parse_mode: 'HTML' }
                    );

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
                } catch (e) { console.error("Rasm yuklashda xato", e); }
            }

            // Bazaga yozish
            await supabase.from('transactions').insert({
                user_id: userId,
                amount: parsed.amount,
                category: parsed.category,
                type: parsed.type,
                date: Date.now(),
                receipt_url: receiptUrl
            });

            // Formatlash
            const emoji = parsed.type === 'income' ? '🟢' : '🔴';
            const typeText = parsed.type === 'income' ? 'Kirim' : 'Chiqim';
            const photoStatus = receiptUrl ? "Bor 📸" : "Yo'q ❌";

            // 2-QADAM: Xabarni yakuniy chiroyli chekga o'zgartiramiz
            await bot.editMessageText(
                `✅ <b>Muvaffaqiyatli saqlandi!</b>\n\n` +
                `${emoji} <b>Turi:</b> ${typeText}\n` +
                `💰 <b>Summa:</b> ${parsed.amount.toLocaleString('uz-UZ')} so'm\n` +
                `📂 <b>Kategoriya:</b> ${parsed.category}\n` +
                `🧾 <b>Chek rasm:</b> ${photoStatus}\n` +
                `➖➖➖➖➖➖➖➖\n` +
                `<i>📊 Umumiy statistikani ko'rish uchun "Bugungi Hisobot" tugmasini bosing.</i>`,
                { chat_id: chatId, message_id: processingMsg.message_id, parse_mode: 'HTML' }
            );

        } else if (msg.photo && !parsed) {
            await bot.sendMessage(chatId, "⚠️ Rasmni ko'rdim, lekin summani topa olmadim. Iltimos, rasm tagiga summa va izoh yozib yuboring.", { parse_mode: 'HTML' });
        }

        res.status(200).send('OK');
    } catch (error) {
        console.error("Bot Error:", error);
        res.status(200).send('Error');
    }
};