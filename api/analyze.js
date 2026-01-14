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

=== קטגוריות זמינות (35 קטגוריות) ===
מזון לבית, אוכל בחוץ ובילויים, תחביבים, תקשורת, ביטוח, בריאות, דלק וחניה, תחבצ, ביגוד והנעלה, פארם, תספורת וקוסמטיקה, מתנות, כבישי אגרה, חופשה וטיול, תיקוני רכב, בעלי חיים, ביט ללא מעקב, מזומן ללא מעקב, מיסים, דמי ניהול בניין, עמלות בנק ואשראי, משכנתא, שכר דירה, ארנונה, חשמל, גז, מים וביוב, קופת חולים, חינוך וקייטנות, תרומות, החזר הלוואות, ריהוט והבית, צעצועים, עוזרת בית, סיגריות, שונות

=== כללי זהב (חובה לציית!) ===
1. ביטוח: הראל/מגדל/הפניקס/כלל/מנורה/איילון/ביטוח ישיר/AIG/שומרה/ליברה/WeSure = "ביטוח"
2. בריאות: מכבידנט/דנטל/כללית סמייל/אסותא/טרם/ביקורופא/מרפאה/רופא = "בריאות"
3. תחבצ: Gett/גט/מונית/Uber/Yango/אגד/דן/מטרופולין/רכבת = "תחבצ"
4. תקשורת: HOT/בזק/פרטנר/סלקום/יס/Netflix/Spotify/Disney/Apple Music = "תקשורת"
5. ביט: BIT/ביט/העברה בביט = "ביט ללא מעקב"
6. מזון לבית: שופרסל/רמי לוי/יוחננוף/ויקטורי/טיב טעם/אושר עד/כוורת/AM:PM = "מזון לבית"
7. אוכל בחוץ: WOLT/מקדונלד/בורגראנץ/דומינו/ארומה/קפה/מסעדה/סושי = "אוכל בחוץ ובילויים"
8. דמי ניהול: מיי טאוור/ועד בית/אדן ניהול/קלינטון = "דמי ניהול בניין"
9. עמלות: דמי כרטיס/עמלה/ריבית/ישראכרט/max/ויזה כאל = "עמלות בנק ואשראי"
10. מיסים: מס הכנסה/מעמ/נציבות/רשות המסים = "מיסים"
11. פארם: סופר-פארם/גוד פארם/בית מרקחת = "פארם"
12. דלק: פז/סונול/דור אלון/Ten/Yellow/Menta = "דלק וחניה"
13. בעלי חיים: אניפט/PetWay/זו ארץ זו/ספידוג/הג'ונגל/וטרינר = "בעלי חיים"
14. צעצועים: Toys R Us/כפר השעשועים/שילב/מוצצים/Baby Star = "צעצועים"
15. תרומות: יד שרה/לתת/עזר מציון/ויצו/זק"א/מד"א = "תרומות"
16. קופ"ח: מכבי/כללית/מאוחדת/לאומית (רק תשלומי חבר!) = "קופת חולים"

=== תשלומים (קריטי!) ===
- "תשלום X/Y" או "X מ-Y" = תשלומים
- amount = הסכום החודשי (לא הסה"כ!)
- הוסף: installment_current, installment_total

=== דוגמאות חשובות ===

ביטוח: "הראל בריאות 31.8" → ביטוח | "מגדל ביטוח 450" → ביטוח | "ביטוח ישיר 200" → ביטוח
בריאות: "מכבידנט תשלום 11/12 1116" → בריאות, amount:1116 | "אסותא 500" → בריאות
תחבצ: "Gett 150" → תחבצ | "אגד 12" → תחבצ | "רכבת ישראל 28" → תחבצ
תקשורת: "NEXT TV 115" → תקשורת | "Netflix 55" → תקשורת | "Spotify 22" → תקשורת
מזון: "כוורת 226" → מזון לבית | "שופרסל 340" → מזון לבית | "רמי לוי 580" → מזון לבית
אוכל בחוץ: "WOLT 107" → אוכל בחוץ | "ארומה 45" → אוכל בחוץ | "מקדונלד 35" → אוכל בחוץ
פארם: "סופר-פארם 89" → פארם | "גוד פארם 45" → פארם
דלק: "פז 250" → דלק וחניה | "סונול 180" → דלק וחניה | "Yellow 50" → דלק וחניה
בעלי חיים: "אניפט 150" → בעלי חיים | "וטרינר 300" → בעלי חיים
צעצועים: "כפר השעשועים 200" → צעצועים | "שילב 350" → צעצועים
עמלות: "דמי כרטיס 35" → עמלות | "עמלת SMS 5" → עמלות
דמי ניהול: "מיי טאוור 473" → דמי ניהול בניין | "ועד בית 350" → דמי ניהול בניין
תחביבים: "הולמס פלייס 400" → תחביבים | "סינמה סיטי 80" → תחביבים
חופשה: "booking.com 1200" → חופשה וטיול | "אל על 800" → חופשה וטיול

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
