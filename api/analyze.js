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

  const prompt = `אתה מומחה בניתוח דוחות הוצאות ישראליים.

להלן טקסט מדוח הוצאות:
---
${text}
---

המשימה: מצא את כל ההוצאות/עסקאות וקטלג כל אחת לקטגוריה המתאימה.

קטגוריות: מזון לבית, אוכל בחוץ ובילויים, פארם, דלק וחניה, מתנות לאירועים ולשמחות, ביגוד והנעלה, תחב"צ, כבישי אגרה, תספורת וקוסמטיקה, תחביבים, סיגריות, חופשה/טיול, עוזרת/שמרטף, תיקוני רכב, בריאות, בעלי חיים, דמי כיס/ילדים, יהדות/חגים, שונות, ביט ללא מעקב, מזומן ללא מעקב

כללים חשובים:
1. כל העברה/תשלום דרך BIT או ביט - תמיד הולך ל"ביט ללא מעקב"
2. מנויים ושירותי סטרימינג (SPOTIFY, NETFLIX, APPLE, GOOGLE וכדומה) - הולכים ל"תחביבים"
3. חדרי כושר, ספורט, יוגה, פילאטיס (כמו גרייט שייפ, הולמס פלייס) - הולכים ל"תחביבים"
4. שירותי GOOGLE (GOOGLE CHA, GOOGLE BUS, GOOGLE ON, GOOGLE ONE וכדומה) - הולכים ל"תחביבים"
5. משיכת מזומן מכספומט - הולכת ל"מזומן ללא מעקב"
6. סופרמרקטים, מכולות, מאפיות, מעדניות - הולכים ל"מזון לבית"
7. מסעדות, ברים, בתי קפה, פאבים, מקומות שאוכלים/שותים בחוץ - הולכים ל"אוכל בחוץ ובילויים"

דוגמאות לקטגוריות:
- מזון לבית: רמי לוי, שופרסל, מגה, ויקטורי, יוחננוף, אושר עד, חצי חינם, סופרים, מכולות, מינימרקטים, מאפיות (לחם, בייגל, עוגות לבית), מעדניות, קצביות, ירקניות, AM:PM קניות, כל חנות שקונים בה מזון לבית
- אוכל בחוץ ובילויים: מסעדות, ברים, פאבים, בתי קפה, בתי שתייה, קפה, WOLT, תן ביס, קולנוע, ארומה, קפה קפה, גרג, מקדונלדס, בורגר קינג, KFC, פיצה, פלאפל, שווארמה, סושי, אסיאתי, איטלקי, כל מקום שאוכלים או שותים בחוץ ולא לוקחים הביתה
- פארם: סופר פארם, בי פארם, אשד פארם
- דלק וחניה: סונול, פז, דור אלון, פנגו, חניונים, אפיפארק, YELLOWPNGO
- תחב"צ: רכבת, אוטובוס, גט, מוניות, רב קו, GETT
- תחביבים: SPOTIFY, NETFLIX, APPLE, GOOGLE, חדר כושר, גרייט שייפ, הולמס פלייס, מנויים
- ביט ללא מעקב: BIT, ביט, העברה בביט
- מזומן ללא מעקב: משיכת מזומן, כספומט, ATM

פורמט תשובה - JSON בלבד, בלי שום טקסט נוסף לפני או אחרי:
{"expenses": [{"description": "שם העסק", "amount": 123.45, "category": "קטגוריה"}]}

חשוב מאוד: החזר רק JSON תקין, בלי הסברים, בלי markdown, בלי קוד. רק את האובייקט JSON.`;

  try {
    const response = await fetch('https://api.openai.com/v1/chat/completions', {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'Authorization': `Bearer ${API_KEY}`
      },
      body: JSON.stringify({
        model: 'gpt-4o-mini',
        messages: [{ role: 'user', content: prompt }],
        max_tokens: 4096,
        temperature: 0.1
      })
    });

    if (!response.ok) {
      const err = await response.json();
      const errorMessage = err.error?.message || 'OpenAI error';
      console.error('OpenAI Error:', JSON.stringify(err));
      return res.status(500).json({ 
        error: errorMessage,
        details: err.error,
        keyPreview: API_KEY ? API_KEY.substring(0, 10) + '...' + API_KEY.substring(API_KEY.length - 4) : 'NO KEY'
      });
    }

    const data = await response.json();
    const content = data.choices[0].message.content;

    const jsonMatch = content.match(/\{[\s\S]*\}/);
    if (!jsonMatch) {
      return res.status(500).json({ error: 'Invalid AI response', raw: content });
    }

    try {
      // Clean the JSON string from potential issues
      let jsonStr = jsonMatch[0];
      jsonStr = jsonStr.replace(/[\u0000-\u001F]+/g, ' '); // Remove control characters
      jsonStr = jsonStr.replace(/,\s*}/g, '}'); // Remove trailing commas
      jsonStr = jsonStr.replace(/,\s*]/g, ']'); // Remove trailing commas in arrays
      
      const result = JSON.parse(jsonStr);
      return res.status(200).json(result);
    } catch (parseError) {
      return res.status(500).json({ 
        error: 'Failed to parse AI response: ' + parseError.message,
        raw: content.substring(0, 500)
      });
    }

  } catch (error) {
    return res.status(500).json({ error: error.message });
  }
};
