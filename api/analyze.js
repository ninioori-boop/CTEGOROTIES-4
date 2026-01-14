module.exports = async (req, res) => {
  res.setHeader('Access-Control-Allow-Origin', '*');
  res.setHeader('Access-Control-Allow-Methods', 'POST, OPTIONS');
  res.setHeader('Access-Control-Allow-Headers', 'Content-Type');

  if (req.method === 'OPTIONS') return res.status(200).end();
  if (req.method !== 'POST') return res.status(405).json({ error: 'Method not allowed' });

  const { text } = req.body || {};
  if (!text) return res.status(400).json({ error: 'No text provided' });

  const API_KEY = process.env.OPENAI_API_KEY;
  if (!API_KEY) return res.status(500).json({ error: 'API key not configured' });

  const cleanText = text
    .replace(/[\u0000-\u0008\u000B\u000C\u000E-\u001F]/g, ' ')
    .replace(/\\/g, ' ')
    .replace(/"/g, "'")
    .substring(0, 20000);

  const systemMessage = `Israeli credit card analyzer. Return JSON: {"expenses":[{"description":"name","amount":123,"category":"cat"}]}

CATEGORIES:
מזון לבית, אוכל בחוץ ובילויים, תחביבים, תקשורת, ביטוח, בריאות, דלק וחניה, תחבצ, ביגוד והנעלה, פארם, תספורת וקוסמטיקה, מתנות, כבישי אגרה, חופשה וטיול, תיקוני רכב, בעלי חיים, ביט ללא מעקב, מזומן ללא מעקב, מיסים, דמי ניהול בניין, עמלות בנק ואשראי, משכנתא, שכר דירה, ארנונה, חשמל, גז, מים וביוב, קופת חולים, חינוך וקייטנות, תרומות, החזר הלוואות, ריהוט והבית, שונות

SPECIFIC RULES:
Transport: Gett/גט=תחבצ (NOT דלק), פנגו/מוביט/רב קו=תחבצ
Communication: NEXT TV/נקסט/HOT=תקשורת, Netflix/Spotify=תקשורת
Bit: BIT/ביט/העברה בביט=ביט ללא מעקב
Groceries: כוורת/Kovert/שופרסל/רמי לוי/ויקטורי/יוחננוף/am:pm=מזון לבית
Food out: WOLT/ולט/מקדונלד/קפה/מסעדה/קייטרינג/bordo=אוכל בחוץ ובילויים
Fees: דמי כרטיס/דמי ניהול/עמלת SMS/ריבית על מינוס=עמלות בנק ואשראי
Building: מיי טאוור/My Tower/ועד בית=דמי ניהול בניין
Utilities: חברת החשמל=חשמל, פאזגז=גז, מי גת/מים=מים וביוב
Health: מכבי/כללית/מאוחדת/לאומית=קופת חולים, מכבידנט/דנטל/שיניים=בריאות
Hobbies: כושר/gym/שייפ/גרייט שייפ=תחביבים
Education: גן/קייטנה/חינוך=חינוך וקייטנות
Fuel: דלק/סונול/פז/דור אלון/חניה=דלק וחניה
Taxes: מס הכנסה/מעמ/נציבות/גביית מעמ=מיסים
Donations: תרומה/הוראת קבע=תרומות

INSTALLMENT RULES:
- amount=MONTHLY payment (NOT total)
- תשלום X/Y→add installment_current:X, installment_total:Y, total_amount:full_price
- Example: מכבידנט 1116 תשלום 11/12→amount:1116, installment_current:11, installment_total:12

IGNORE: מסגרת אשראי, יתרה, סה"כ לחיוב, נקודות`;

  const userPrompt = `Credit card data. Categorize ALL transactions:\n${cleanText}`;

  try {
    const response = await fetch('https://api.openai.com/v1/chat/completions', {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'Authorization': 'Bearer ' + API_KEY
      },
      body: JSON.stringify({
        model: 'gpt-4o-mini',
        messages: [
          { role: 'system', content: systemMessage },
          { role: 'user', content: userPrompt }
        ],
        max_tokens: 8000,
        temperature: 0,
        response_format: { type: 'json_object' }
      })
    });

    if (!response.ok) {
      const err = await response.json().catch(() => ({}));
      return res.status(500).json({ error: err.error?.message || 'OpenAI error' });
    }

    const data = await response.json();
    const content = data.choices[0].message.content;

    let cleanContent = content.replace(/[\u0000-\u001F]+/g, ' ').replace(/,\s*}/g, '}').replace(/,\s*]/g, ']').trim();

    try {
      const result = JSON.parse(cleanContent);
      if (!result.expenses) result.expenses = [];
      
      result.expenses = result.expenses.filter(exp => {
        if (!exp.description || !exp.amount) return false;
        if (typeof exp.amount !== 'number' || exp.amount <= 0) return false;
        const desc = exp.description.toLowerCase();
        return !['מסגרת אשראי', 'יתרת זכות', 'סה"כ'].some(p => desc.includes(p));
      });
      
      return res.status(200).json(result);
    } catch (e) {
      const match = cleanContent.match(/\{[\s\S]*\}/);
      if (match) {
        try {
          const result = JSON.parse(match[0]);
          if (result.expenses) return res.status(200).json(result);
        } catch (e2) {}
      }
      return res.status(500).json({ error: 'שגיאה בניתוח. נסה שוב.' });
    }
  } catch (error) {
    return res.status(500).json({ error: error.message });
  }
};
