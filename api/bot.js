const TelegramBot = require('node-telegram-bot-api');
const { createClient } = require('@supabase/supabase-js');
const fs = require('fs');
const path = require('path');
const axios = require('axios');
const { OpenAI } = require('openai');

// --- KONFIGURATSIYA ---
const token = process.env.BOT_TOKEN;
const supabaseUrl = process.env.SUPABASE_URL;
const supabaseKey = process.env.SUPABASE_KEY;

// Botni Webhook rejimida ishlatish uchun (polling: false)
const bot = new TelegramBot(token, { polling: false });
const supabase = createClient(supabaseUrl, supabaseKey);

// OpenAI ni sozlash
const openai = process.env.OPENAI_API_KEY 
    ? new OpenAI({ apiKey: process.env.OPENAI_API_KEY }) 
    : null;

// --- MATNLAR ---
const GUIDE_TEXT = `<b>📖 BOTDAN FOYDALANISH QO'LLANMASI:</b>\n\n` +
    `Botga yozing yoki <b>OVOZLI XABAR</b> yuboring! 🎙\n\n` +
    `<b>1. Chiqim (Xarajat):</b>\n` +
    `➖ <i>50 ming tushlik</i>\n` +
    `➖ <i>-50$ bozorlik</i>\n` +
    `🎙 <i>"Taksiga 20 ming berdim"</i>\n\n` +
    `<b>2. Kirim (Daromad):</b>\n` +
    `➕ <i>2 mln oylik</i>\n` +
    `🎙 <i>"100 dollar bonus oldim"</i>\n\n` +
    `<i>Valyuta kursi Kassa App sozlamalaridan olinadi.</i>`;

const MAIN_KEYBOARD = {
    keyboard: [
        ['📊 Bugungi Hisobot', '📅 Oylik Hisobot'],
        ['↩️ Oxirgisini O\'chirish', 'Botdan foydalanish❓'] 
    ],
    resize_keyboard: true
};

// --- YORDAMCHI FUNKSIYALAR ---

/**
 * Matndan summa, kategoriya va valyutani ajratib oladi.
 */
function parseText(text) {
    if (!text) return null;
    text = text.toLowerCase().trim();
    
    // Tinish belgilarini bo'sh joyga almashtirish (parse qilish osonroq bo'lishi uchun)
    text = text.replace(/[.,!?;:]/g, ' '); 

    // 1. Valyutani aniqlash
    const isUSD = text.includes('$') || text.includes('usd') || text.includes('dollar');
    
    // Valyuta so'zlarini tozalash
    text = text.replace(/so'?m|sum|uzs|\$|€|usd|dollar/g, '');

    // 2. Summani ajratish (Regex: 100, 100k, 1.5mln)
    // \d+ (raqamlar), [.,]? (nuqta yoki vergul), \d* (davomi), \s* (bo'sh joy), (k|ming...) (suffix)
    const numberMatch = text.match(/(\d+[.,]?\d*)\s*(k|ming|mln|m|mill?ion)?\b/);

    if (!numberMatch) return null;

    let rawNumber = numberMatch[1].replace(',', '.'); // Vergulni nuqtaga aylantirish
    let suffix = numberMatch[2];
    let amount = parseFloat(rawNumber);

    if (suffix) {
        if (['k', 'ming'].includes(suffix)) amount *= 1000;
        else if (['m', 'mln', 'million'].includes(suffix)) amount *= 1000000;
    }

    // 3. Turni aniqlash (Kirim yoki Chiqim)
    let type = 'expense'; // Default: chiqim
    const incomeKeywords = ['+', 'kirim', 'tushdi', 'keldi', 'avans', 'oylik', 'bonus', 'qaytdi', 'foyda', 'topdim', 'oldim'];
    const expenseKeywords = ['-', 'chiqim', 'ketdi', 'tolandi', 'to\'landi', 'xarajat', 'berdi', 'sotib', 'uchun', 'sarfladim'];

    if (incomeKeywords.some(word => text.includes(word))) type = 'income';
    
    // 4. Kategoriyani ajratish
    let cleanText = text;
    cleanText = cleanText.replace(numberMatch[0], ''); // Raqamni o'chiramiz
    if(suffix) cleanText = cleanText.replace(suffix, ''); // Suffixni o'chiramiz
    
    [...incomeKeywords, ...expenseKeywords].forEach(word => { cleanText = cleanText.replace(word, ''); });
    cleanText = cleanText.replace(/[+\-*/]/g, '').trim();

    // Ortiqcha bo'sh joylarni tozalash
    cleanText = cleanText.replace(/\s+/g, ' ').trim();

    let category = cleanText.charAt(0).toUpperCase() + cleanText.slice(1);
    if (category.length < 2) category = type === 'income' ? "Kirim" : "Umumiy xarajat";

    return { amount: Math.round(amount), type, category, isUSD };
}

/**
 * Tranzaksiyani saqlash va javob yuborish
 */
async function saveTransaction(userId, chatId, parsedData, receiptUrl = null, userExchangeRate = 12850, replyMsgId = null) {
    let finalAmount = parsedData.amount;
    let finalCategory = parsedData.category;
    let currencyNote = "so'm";

    // Agar USD bo'lsa, kursga ko'paytiramiz
    if (parsedData.isUSD) {
        finalAmount = Math.round(parsedData.amount * userExchangeRate);
        finalCategory = `${parsedData.category} ($${parsedData.amount})`;
        currencyNote = `so'm ($${parsedData.amount})`;
    }

    // Supabasega yozish
    const { error } = await supabase.from('transactions').insert({
        user_id: userId,
        amount: finalAmount,
        category: finalCategory,
        type: parsedData.type,
        date: Date.now(),
        receipt_url: receiptUrl
    });

    if (error) {
        console.error("Supabase Error:", error);
        await bot.sendMessage(chatId, "⚠️ Bazaga yozishda xatolik bo'ldi. Qaytadan urinib ko'ring.");
        return;
    }

    // Javob xabari
    const emoji = parsedData.type === 'income' ? '🟢' : '🔴';
    const typeText = parsedData.type === 'income' ? 'Kirim' : 'Chiqim';
    const photoStatus = receiptUrl ? "Bor 📸" : "Yo'q";

    const opts = { parse_mode: 'HTML' };
    if (replyMsgId) opts.reply_to_message_id = replyMsgId;

    await bot.sendMessage(chatId, 
        `✅ <b>Muvaffaqiyatli saqlandi!</b>\n\n` +
        `${emoji} <b>Turi:</b> ${typeText}\n` +
        `💰 <b>Summa:</b> ${finalAmount.toLocaleString('uz-UZ')} ${currencyNote !== "so'm" ? `\n<i>(${currencyNote})</i>` : "so'm"}\n` +
        `📂 <b>Kategoriya:</b> ${parsedData.category}\n` +
        `🧾 <b>Chek rasm:</b> ${photoStatus}`, 
        opts
    );
}

// --- ASOSIY SERVERLESS HANDLER ---

module.exports = async (req, res) => {
    try {
        // Vercel faqat POST so'rovlarni qabul qilishi kerak (Telegram Webhook uchun)
        if (req.method === 'POST') {
            const msg = req.body.message;
            
            // Ba'zan telegram 'edited_message' yoki boshqa update turlarini yuboradi
            if (!msg) return res.status(200).send('No message found');

            const chatId = msg.chat.id;
            const userId = msg.from.id;
            const text = msg.text || msg.caption; // Rasm tagidagi matn ham olinadi

            // 1. Foydalanuvchini va kursni olish
            let { data: user } = await supabase.from('users').select('*').eq('user_id', userId).single();

            // Kontakt orqali ro'yxatdan o'tish
            if (msg.contact) {
                if (msg.contact.user_id !== userId) return res.status(200).send('OK');
                
                await supabase.from('users').upsert({
                    user_id: userId,
                    phone_number: msg.contact.phone_number,
                    full_name: `${msg.from.first_name} ${msg.from.last_name || ''}`.trim(),
                    last_start_date: new Date(),
                    exchange_rate: 12850 // Default kurs
                });
                await bot.sendMessage(chatId, "🎉 <b>Ro'yxatdan o'tdingiz!</b>\nEndi kirim yoki chiqimlarni yozishingiz mumkin.", { reply_markup: MAIN_KEYBOARD, parse_mode: 'HTML' });
                return res.status(200).send('OK');
            }

            // Agar foydalanuvchi yo'q bo'lsa
            if (!user) {
                await bot.sendMessage(chatId, "👋 Assalomu alaykum!\nBotdan foydalanish uchun telefon raqamingizni tasdiqlang.", {
                    reply_markup: {
                        keyboard: [[{ text: "📱 Telefon raqamni yuborish", request_contact: true }]],
                        resize_keyboard: true, one_time_keyboard: true
                    }
                });
                return res.status(200).send('OK');
            }

            // 2. /Start buyrug'i
            if (text === '/start') {
                const now = new Date();
                const todayStr = now.toDateString();
                const lastDate = user.last_start_date ? new Date(user.last_start_date).toDateString() : null;

                if (lastDate !== todayStr) {
                    await bot.sendMessage(chatId, `Assalomu aleykum, ${user.full_name || 'Foydalanuvchi'}! ☀️\nBugun qanday moliyaviy operatsiyalarni bajaramiz?`, { reply_markup: MAIN_KEYBOARD });
                    await supabase.from('users').update({ last_start_date: now }).eq('user_id', userId);
                } else {
                    await bot.sendMessage(chatId, GUIDE_TEXT, { reply_markup: MAIN_KEYBOARD, parse_mode: 'HTML' });
                }
                return res.status(200).send('OK');
            }

            // 3. Yordam
            if (text === 'Botdan foydalanish❓') {
                await bot.sendMessage(chatId, GUIDE_TEXT, { parse_mode: 'HTML' });
                return res.status(200).send('OK');
            }

            // 4. Hisobotlar
            if (text === '📊 Bugungi Hisobot' || text === '📅 Oylik Hisobot') {
                const statusMsg = await bot.sendMessage(chatId, "⏳ <b>Hisob-kitob qilinmoqda...</b>", { parse_mode: 'HTML' });
                
                const now = new Date();
                let startTime, title;

                if (text === '📊 Bugungi Hisobot') {
                    startTime = new Date(now.setHours(0,0,0,0)).getTime();
                    title = "BUGUNGI HISOBOT";
                } else {
                    startTime = new Date(now.getFullYear(), now.getMonth(), 1).getTime();
                    title = `${now.toLocaleString('uz-UZ', { month: 'long' }).toUpperCase()} OYI HISOBOTI`;
                }

                const { data: trans } = await supabase.from('transactions')
                    .select('*').eq('user_id', userId).gte('date', startTime);

                if (!trans || trans.length === 0) {
                    await bot.editMessageText(`📊 <b>${title}:</b>\n\nMa'lumot topilmadi.`, { chat_id: chatId, message_id: statusMsg.message_id, parse_mode: 'HTML' });
                    return res.status(200).send('OK');
                }

                const inc = trans.filter(t => t.type === 'income').reduce((a, b) => a + (b.amount || 0), 0);
                const exp = trans.filter(t => t.type === 'expense').reduce((a, b) => a + (b.amount || 0), 0);
                const balance = inc - exp;

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

            // 5. O'chirish
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

            // 6. OVOZLI XABAR LOGIKASI (WHISPER) 🎙️
            if (msg.voice) {
                if (!openai) {
                    await bot.sendMessage(chatId, "⚠️ Kechirasiz, ovozli xizmat ishlashi uchun OpenAI API kaliti sozlanmagan.");
                    return res.status(200).send('OK');
                }
                // const processingMsg = await bot.sendMessage(chatId, "🎙 <b>Ovoz tahlil qilinmoqda...</b>", { parse_mode: 'HTML' });
                try {
                    // 1. Fayl havolasini olish
                    const fileId = msg.voice.file_id;
                    const fileLink = await bot.getFileLink(fileId);
                    
                    // 2. Faylni yuklab olish (Vercel uchun /tmp papkasiga)
                    const voicePath = path.join('/tmp', `voice_${fileId}.ogg`);
                    const writer = fs.createWriteStream(voicePath);
                    
                    const response = await axios({
                        url: fileLink,
                        method: 'GET',
                        responseType: 'stream'
                    });

                    response.data.pipe(writer);

                    await new Promise((resolve, reject) => {
                        writer.on('finish', resolve);
                        writer.on('error', reject);
                    });

                    // 3. OpenAI Whisper ga yuborish
                    const transcription = await openai.audio.transcriptions.create({
                        file: fs.createReadStream(voicePath),
                        model: "whisper-1",
                        language: "uz" // O'zbek tilida yaxshiroq tushunishi uchun
                    });

                    const transcribedText = transcription.text;
                    
                    // Faylni o'chirib tashlash
                    try { fs.unlinkSync(voicePath); } catch(e) {}

                    // Agar ovozdan hech narsa tushunilmasa
                    if (!transcribedText || transcribedText.trim().length === 0) {
                         await bot.editMessageText("Kechirasiz, ovozli habar funksiyasi tez orada ishga tushadi.", { chat_id: chatId, message_id: processingMsg.message_id });
                         return res.status(200).send('OK');
                    }

                    // 4. Matnni tahlil qilish (Parsing)
                    const parsedVoice = parseText(transcribedText);
                    
                    if (parsedVoice) {
                        // Tahlil xabarini o'chirish
                        await bot.deleteMessage(chatId, processingMsg.message_id).catch(()=>{});
                        
                        // Tranzaksiyani saqlash (Kurs bazadan olinadi)
                        const currentRate = user.exchange_rate || 12850;
                        await saveTransaction(userId, chatId, parsedVoice, null, currentRate, msg.message_id);
                    } else {
                        // Agar matn bor lekin summa yo'q bo'lsa
                        await bot.editMessageText(`🤷‍♂️ <b>Tushunganim:</b> "${transcribedText}"\n\nLekin bu matndan aniq summa va maqsadni topa olmadim. Aniqroq gapirib ko'ring (masalan: "Taksiga 20 ming berdim").`, { chat_id: chatId, message_id: processingMsg.message_id, parse_mode: 'HTML' });
                    }

                } catch (error) {
                    console.error("Voice Error:", error);
                    // Foydalanuvchiga xatoni ko'rsatamiz (Debug uchun)
                    const errorDetails = error.response ? JSON.stringify(error.response.data) : error.message;
                    await bot.editMessageText(`Kechirasiz, ovozli habar funksiyasi tez orada ishga tushadi`, { chat_id: chatId, message_id: processingMsg.message_id });
                }
                return res.status(200).send('OK');
            }

            // 7. MATNLI TRANZAKSIYA LOGIKASI
            const parsed = parseText(text);

            if (parsed) {
                let receiptUrl = null;
                
                // Rasm logikasi
                if (msg.photo) {
                    const photoProcessingMsg = await bot.sendMessage(chatId, "📸 <b>Rasm yuklanmoqda...</b>", {parse_mode: 'HTML'});
                    try {
                        const photoId = msg.photo[msg.photo.length - 1].file_id;
                        const fileLink = await bot.getFileLink(photoId);
                        
                        const response = await axios({ url: fileLink, method: 'GET', responseType: 'arraybuffer' });
                        const fileName = `${userId}_${Date.now()}.jpg`;
                        
                        const { error } = await supabase.storage.from('receipts').upload(fileName, response.data, { contentType: 'image/jpeg' });
                        
                        if (!error) {
                            const { data } = supabase.storage.from('receipts').getPublicUrl(fileName);
                            receiptUrl = data.publicUrl;
                        }
                        await bot.deleteMessage(chatId, photoProcessingMsg.message_id).catch(()=>{});
                    } catch (e) { 
                        console.error("Rasm yuklash xato", e);
                        await bot.editMessageText("⚠️ Rasmni saqlay olmadim, lekin tranzaksiya yoziladi. Kassa ga kirim Tarim bo'limidan rasm(check) qo'shsangiz bo'ladi.", {chat_id: chatId, message_id: photoProcessingMsg.message_id});
                    }
                }

                const currentRate = user.exchange_rate || 12850;
                await saveTransaction(userId, chatId, parsed, receiptUrl, currentRate, msg.message_id);

            } else if (msg.photo && !parsed) {
                await bot.sendMessage(chatId, "⚠️ Rasm tagiga summa va izoh yozishni unutdingiz (yoki men tushunmadim).");
            } else if (text !== '/start' && !parsed) {
                 await bot.sendMessage(chatId, "Tushunmadim. Quyidagicha yozing:\n" + GUIDE_TEXT, {parse_mode: 'HTML'});
            }

            return res.status(200).send('OK');
        } else {
            // GET so'rov kelsa (Brauzerda ochilganda)
            return res.status(200).send('Bot ishlamoqda 🚀');
        }
    } catch (error) {
        console.error("Bot Error:", error);
        res.status(500).send('Internal Server Error');
    }
};