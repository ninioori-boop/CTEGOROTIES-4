module.exports = async (req, res) => {
  // CORS headers
  res.setHeader('Access-Control-Allow-Origin', '*');
  res.setHeader('Access-Control-Allow-Methods', 'POST, OPTIONS');
  res.setHeader('Access-Control-Allow-Headers', 'Content-Type');

  if (req.method === 'OPTIONS') {
    return res.status(200).end();
  }

  if (req.method !== 'POST') {
    return res.status(405).json({ error: 'Method not allowed' });
  }

  const { text } = req.body || {};

  if (!text) {
    return res.status(400).json({ error: 'No text provided' });
  }

  const API_KEY = process.env.OPENAI_API_KEY;

  if (!API_KEY) {
    return res.status(500).json({ error: 'API key not configured on server' });
  }

  // הגבלת אורך הטקסט
  const cleanText = text.substring(0, 20000);

  const systemMessage = `אתה מנתח דפי חשבון כרטיס אשראי ישראלי. החזר JSON בלבד: {"expenses":[{"description":"שם","amount":123,"category":"קטגוריה"}]}

=== קטגוריות זמינות ===
מזון לבית, אוכל בחוץ ובילויים, תחביבים, תקשורת, ביטוח, בריאות, דלק וחניה, תחבצ, ביגוד והנעלה, פארם, תספורת וקוסמטיקה, מתנות, כבישי אגרה, חופשה וטיול, תיקוני רכב, בעלי חיים, ביט ללא מעקב, מזומן ללא מעקב, מיסים, דמי ניהול בניין, עמלות בנק ואשראי, משכנתא, שכר דירה, ארנונה, חשמל, גז, מים וביוב, קופת חולים, חינוך וקייטנות, תרומות, החזר הלוואות, ריהוט והבית, שונות

=== כללי זהב (חובה!) ===
1. חברות ביטוח (הראל/מגדל/הפניקס/כלל/מנורה/איילון) = תמיד "ביטוח"
2. שירותי שיניים (מכבידנט/דנטל) = תמיד "בריאות"
3. Gett/גט/מונית = "תחבצ" (לא דלק!)
4. NEXT TV/HOT/בזק/פרטנר/סלקום = "תקשורת"
5. BIT/ביט/העברה בביט = "ביט ללא מעקב"
6. כוורת/שופרסל/רמי לוי = "מזון לבית"
7. WOLT/ולט/מקדונלד/קפה/מסעדה = "אוכל בחוץ ובילויים"
8. מיי טאוור = "דמי ניהול בניין"
9. דמי כרטיס/עמלה = "עמלות בנק ואשראי"
10. מס הכנסה/מעמ/נציבות = "מיסים"

=== כללי תשלומים (קריטי!) ===
- אם רואה "תשלום X/Y" (לדוגמה: תשלום 11/12) → זה תשלומים!
- הסכום שמופיע הוא הסכום החודשי
- הוסף שדות: installment_current, installment_total

=== דוגמאות קריטיות ===

ביטוח:
✅ "הראל בריאות 31.8" → ביטוח
✅ "הראל (שלוח) ביטוח 613" → ביטוח
✅ "מגדל ביטוח 450" → ביטוח
❌ לא "אוכל בחוץ" או "שונות"!

בריאות:
✅ "מכבידנט תל אביב תשלום 11/12 1116" → amount: 1116, בריאות, installment_current: 11, installment_total: 12
✅ "דנטל קליניק 450" → בריאות
❌ לא "קופת חולים"!

תחבורה ציבורית:
✅ "Gett 150" → תחבצ
✅ "גט נסיעות 137" → תחבצ
❌ לא "דלק וחניה"!

תקשורת:
✅ "NEXT TV BY HOT 115.57" → תקשורת
✅ "HOT mobile 108.6" → תקשורת
✅ "Netflix 55" → תקשורת
❌ לא "שונות"!

ביט:
✅ "העברה ב BIT 640" → ביט ללא מעקב
✅ "ביט העברה 500" → ביט ללא מעקב
❌ לא "שונות"!

מזון לבית:
✅ "רשת כוורת 226.1" → מזון לבית
✅ "שופרסל דיל 340" → מזון לבית
✅ "אי.אם.פי.אם 54.8" → מזון לבית
❌ לא "שונות"!

אוכל בחוץ:
✅ "WOLT 107.08" → אוכל בחוץ ובילויים
✅ "מקדונלדס 11" → אוכל בחוץ ובילויים
✅ "קפה אירופה 260" → אוכל בחוץ ובילויים

עמלות:
✅ "דמי כרטיס 34.9" → עמלות בנק ואשראי
✅ "עמלת SMS 5" → עמלות בנק ואשראי

דמי ניהול בניין:
✅ "מיי טאוור בעמ 472.9" → דמי ניהול בניין
✅ "ועד בית 350" → דמי ניהול בניין

תחביבים:
✅ "גרייט שייפ עמית 400" → תחביבים
✅ "לוינגר 25" → תחביבים
✅ "SPOTIFYIL 21.9" → תקשורת (זה סטרימינג!)
✅ "GOOGLE CHA 73" → תקשורת (זה שירות דיגיטלי!)

=== התעלם מ: ===
- "מסגרת אשראי", "יתרת זכות", "סה"כ לחיוב", "נקודות", "זיכוי"

=== חשוב! ===
- בדוק את שם החברה לפני הקטגוריה!
- חברות ביטוח ידועות = תמיד ביטוח!
- תשלומים = amount הוא החודשי`;

  try {
    const response = await fetch('https://api.openai.com/v1/chat/completions', {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'Authorization': `Bearer ${API_KEY}`
      },
      body: JSON.stringify({
        model: 'gpt-4o-mini',
        messages: [
          { role: 'system', content: systemMessage },
          { role: 'user', content: cleanText }
        ],
        max_tokens: 8000,
        temperature: 0.1,
        response_format: { type: "json_object" }
      })
    });

    if (!response.ok) {
      const err = await response.json();
      console.error('OpenAI Error:', err);
      return res.status(500).json({ error: err.error?.message || 'OpenAI error' });
    }

    const data = await response.json();
    const content = data.choices[0].message.content;

    try {
      const result = JSON.parse(content);
      return res.status(200).json(result);
    } catch (parseError) {
      // נסה לחלץ JSON מהתשובה
      const jsonMatch = content.match(/\{[\s\S]*\}/);
      if (jsonMatch) {
        const result = JSON.parse(jsonMatch[0]);
        return res.status(200).json(result);
      }
      return res.status(500).json({ error: 'Invalid AI response format' });
    }

  } catch (error) {
    console.error('Server Error:', error);
    return res.status(500).json({ error: error.message });
  }
};
