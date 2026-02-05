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

=== קטגוריות זמינות (36 קטגוריות) ===
מזון לבית, אוכל בחוץ ובילויים, תחביבים, תקשורת, ביטוח, בריאות, דלק וחניה, תחבצ, ביגוד והנעלה, פארם, תספורת וקוסמטיקה, מתנות, כבישי אגרה, חופשה וטיול, תיקוני רכב, בעלי חיים, ביט ללא מעקב, מזומן ללא מעקב, מיסים, דמי ניהול בניין, עמלות בנק ואשראי, משכנתא, שכר דירה, ארנונה, חשמל, גז, מים וביוב, קופת חולים, ביטוח לאומי, חינוך וקייטנות, תרומות, החזר הלוואות, ריהוט והבית, צעצועים, עוזרת בית, סיגריות, שונות

=== ⚠️ כללים קריטיים - עדיפות עליונה! ===
❗ "ביטוח לאומי" = תמיד "ביטוח לאומי" (לא ביט!)
❗ "נציבות מס הכנסה" / "מס הכנסה ומיסים" = תמיד "מיסים" (לא תקשורת!)
❗ "דמי כרטיס" = תמיד "עמלות בנק ואשראי" (לא תקשורת!)
❗ "מ.תחבורה" / "פנגו מוביט" = תמיד "תחבצ" (לא ביט!)

=== כללי זהב (חובה לציית!) ===
1. ביטוח לאומי: "ביטוח לאומי ספק"/"ביטוח לאומי הוק" = "ביטוח לאומי" (קטגוריה נפרדת!)
2. מיסים: נציבות מס/מס הכנסה/מעמ/גביית מעמ = "מיסים"
3. עמלות: דמי כרטיס/עמלה/ריבית = "עמלות בנק ואשראי"
4. תחבצ: מ.תחבורה/פנגו מוביט/Gett/גט/מונית/Uber/אגד/דן/רכבת = "תחבצ"
5. ביטוח: הראל/מגדל/הפניקס/כלל/מנורה/איילון = "ביטוח"
6. בריאות: מכבידנט/דנטל/אסותא/טרם = "בריאות"
7. תקשורת: HOT/בזק/פרטנר/סלקום/Netflix/Spotify = "תקשורת" (לא מיסים!)
8. ביט: רק "העברה ב BIT"/"העברה בביט" = "ביט ללא מעקב"
9. מזון לבית: שופרסל/רמי לוי/כוורת/AM:PM = "מזון לבית"
10. אוכל בחוץ: WOLT/מקדונלד/ארומה/קפה = "אוכל בחוץ ובילויים"
11. דמי ניהול: מיי טאוור/ועד בית = "דמי ניהול בניין"
12. קופ"ח: מכבי/כללית/מאוחדת/לאומית (תשלומי חבר) = "קופת חולים"

=== תשלומים (קריטי!) ===
- "תשלום X/Y", "תשלום X מתוך Y", "חלק X מתוך Y", "X מ-Y", "פריסה X/Y" = עסקה בתשלומים
- amount = הסכום החודשי בלבד (לא הסה"כ!)
- תמיד הוסף: installment_current, installment_total כשמזוהה תשלום

=== דוגמאות קריטיות (שים לב!) ===

⚠️ מקרים בעייתיים:
✅ "ביטוח לאומי ספק הוק 904" → ביטוח לאומי (לא ביט!)
✅ "נציבות מס הכנסה ומיסים 14352" → מיסים (לא תקשורת!)
✅ "דמי כרטיס 34.9" → עמלות בנק ואשראי (לא תקשורת!)
✅ "מ.תחבורה - פנגו מוביט 28.5" → תחבצ (לא ביט!)

דוגמאות נוספות:
ביטוח: "הראל בריאות 31.8" → ביטוח | "מגדל 450" → ביטוח
בריאות: "מכבידנט תשלום 11/12 1116" → בריאות | "אסותא 500" → בריאות
תחבצ: "Gett 150" → תחבצ | "אגד 12" → תחבצ | "רכבת ישראל 28" → תחבצ
תקשורת: "NEXT TV 115" → תקשורת | "Netflix 55" → תקשורת | "HOT mobile 108" → תקשורת
מזון: "כוורת 226" → מזון לבית | "שופרסל 340" → מזון לבית
אוכל בחוץ: "WOLT 107" → אוכל בחוץ | "מקדונלד 35" → אוכל בחוץ
עמלות: "דמי כרטיס 35" → עמלות בנק ואשראי | "עמלת SMS 5" → עמלות בנק ואשראי
דמי ניהול: "מיי טאוור 473" → דמי ניהול בניין | "ועד בית 350" → דמי ניהול בניין
מיסים: "גביית מעמ 16068" → מיסים | "נציבות מס 14352" → מיסים

=== התעלם לגמרי מ: ===
"מסגרת אשראי", "יתרת זכות", "סה"כ לחיוב", "נקודות", "זיכוי", "העברה בין חשבונות"

=== חשוב! ===
- שם החברה קובע את הקטגוריה!
- חברות ביטוח = תמיד ביטוח, גם אם כתוב "בריאות"!`;

  try {
    const response = await fetch('https://api.openai.com/v1/chat/completions', {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'Authorization': `Bearer ${API_KEY}`
      },
      body: JSON.stringify({
        model: 'gpt-4o',
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
