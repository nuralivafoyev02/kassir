const TelegramBot = require('node-telegram-bot-api');
const { createClient } = require('@supabase/supabase-js');

// Vercel Environment o'zgaruvchilari
const token = process.env.BOT_TOKEN;
const supabaseUrl = process.env.SUPABASE_URL;
const supabaseKey = process.env.SUPABASE_KEY;

const bot = new TelegramBot(token);
const supabase = createClient(supabaseUrl, supabaseKey);

// Yordamchi funksiya: Matnni tahlil qilish
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

// Asosiy menyu tugmalari
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

        // 1. FOYDALANUVCHINI TEKSHIRISH (Login)
        // Bazadan user bor-yo'qligini tekshiramiz
        const { data: user, error } = await supabase
            .from('users')
            .select('*')
            .eq('user_id', userId)
            .single();

        // 1.1 Agar CONTACT yuborilgan bo'lsa (Ro'yxatdan o'tish)
        if (msg.contact) {
            if (msg.contact.user_id !== userId) {
                await bot.sendMessage(chatId, "Iltimos, o'zingizni raqamingizni yuboring!");
                return res.status(200).send('OK');
            }

            // Userni bazaga yozamiz
            await supabase.from('users').upsert({
                user_id: userId,
                phone_number: msg.contact.phone_number,
                full_name: `${msg.from.first_name} ${msg.from.last_name || ''}`.trim()
            });

            await bot.sendMessage(chatId, "🎉 Ro'yxatdan o'tdingiz! Endi kassani ishlatishingiz mumkin.", {
                reply_markup: MAIN_KEYBOARD
            });
            return res.status(200).send('OK');
        }

        // 1.2 Agar user bazada bo'lmasa -> Ofertani jo'natamiz
        if (!user) {
            const offerText = "👋 Assalomu alaykum!\nBotdan foydalanish uchun telefon raqamingizni tasdiqlang.\n\n\"Tasdiqlash\" tugmasini bosish orqali siz ommaviy ofertaga rozilik bildirasiz.";
            await bot.sendMessage(chatId, offerText, {
                reply_markup: {
                    keyboard: [[{
                        text: "📱 Telefon raqamni yuborish va Tasdiqlash",
                        request_contact: true
                    }]],
                    resize_keyboard: true,
                    one_time_keyboard: true
                }
            });
            return res.status(200).send('OK');
        }

        // --- RO'YXATDAN O'TGAN FOYDALANUVCHILAR UCHUN ---

        // 2. STATISTIKA (/start va tugmalar)
        if (text === '/start') {
            await bot.sendMessage(chatId, "Kassa ishlamoqda. Summa va izoh yozing:", { reply_markup: MAIN_KEYBOARD });
            return res.status(200).send('OK');
        }

        if (text === '📊 Bugungi Hisobot') {
            const startOfDay = new Date().setHours(0,0,0,0);
            const { data: trans } = await supabase.from('transactions')
                .select('*')
                .eq('user_id', userId)
                .gte('date', startOfDay);
            
            const inc = trans.filter(t => t.type === 'income').reduce((a, b) => a + (b.amount || 0), 0);
            const exp = trans.filter(t => t.type === 'expense').reduce((a, b) => a + (b.amount || 0), 0);
            
            await bot.sendMessage(chatId, 
                `📅 <b>Bugungi Hisobot:</b>\n\n🟢 Kirim: ${inc.toLocaleString()} so'm\n🔴 Chiqim: ${exp.toLocaleString()} so'm\n\n💰 <b>Sof qoldiq: ${(inc - exp).toLocaleString()} so'm</b>`, 
                { parse_mode: 'HTML' }
            );
            return res.status(200).send('OK');
        }

        // 3. OXIRGISINI O'CHIRISH (UNDO)
        if (text === "↩️ Oxirgisini O'chirish") {
            // Eng oxirgi tranzaksiyani topamiz
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

        // 4. TRANZAKSIYANI QABUL QILISH
        const parsed = parseText(text);
        if (!parsed && !msg.photo) {
             // Agar rasm ham, tushunarli matn ham bo'lmasa
             return res.status(200).send('OK');
        }

        // Rasm yuklash (Agar bor bo'lsa)
        let receiptUrl = null;
        if (msg.photo) {
            const loading = await bot.sendMessage(chatId, "Rasm yuklanmoqda... ⏳");
            try {
                const photoId = msg.photo[msg.photo.length - 1].file_id;
                const fileLink = await bot.getFileLink(photoId);
                const response = await fetch(fileLink);
                const arrayBuffer = await response.arrayBuffer();
                const fileName = `${userId}_${Date.now()}.jpg`;

                // Supabase Storagega yuklash
                const { error } = await supabase.storage.from('receipts').upload(fileName, Buffer.from(arrayBuffer), { contentType: 'image/jpeg' });
                if (!error) {
                    const { data } = supabase.storage.from('receipts').getPublicUrl(fileName);
                    receiptUrl = data.publicUrl;
                }
                await bot.deleteMessage(chatId, loading.message_id);
            } catch (e) {
                console.error(e); // Xatoni logga yozamiz lekin userga bildirmaymiz, transaction saqlanaversin
            }
        }

        // Agar matn tahlil qilingan bo'lsa -> Bazaga yozamiz
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
            await bot.sendMessage(chatId, "⚠️ Rasmni saqladim, lekin summani tushunmadim. Iltimos, rasm tagiga izoh yozing.");
        }

        res.status(200).send('OK');
    } catch (error) {
        console.error("Bot Error:", error);
        res.status(200).send('Error');
    }
};