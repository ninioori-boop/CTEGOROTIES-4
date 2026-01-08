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

דוגמאות לקטגוריות:
- מזון לבית: רמי לוי, שופרסל, מגה, ויקטורי, סופרים
- אוכל בחוץ ובילויים: מסעדות, קפה, WOLT, תן ביס, קולנוע
- פארם: סופר פארם, בי פארם
- דלק וחניה: סונול, פז, דור אלון, פנגו, חניונים
- תחב"צ: רכבת, אוטובוס, גט, מוניות

פורמט תשובה - JSON בלבד:
{"expenses": [{"description": "שם העסק", "amount": 123.45, "category": "קטגוריה"}, ...]}`;

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
      return res.status(500).json({ error: err.error?.message || 'OpenAI error' });
    }

    const data = await response.json();
    const content = data.choices[0].message.content;

    const jsonMatch = content.match(/\{[\s\S]*\}/);
    if (!jsonMatch) {
      return res.status(500).json({ error: 'Invalid AI response' });
    }

    const result = JSON.parse(jsonMatch[0]);
    return res.status(200).json(result);

  } catch (error) {
    return res.status(500).json({ error: error.message });
  }
};
