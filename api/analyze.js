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

  // Clean the text from problematic characters
  const cleanText = text
    .replace(/[\u0000-\u0008\u000B\u000C\u000E-\u001F]/g, ' ')
    .replace(/\\/g, ' ')
    .replace(/"/g, "'")
    .substring(0, 15000);

  const systemMessage = `You are an Israeli credit card expense analyzer. You receive data from Excel/CSV files exported from Israeli credit card companies.

Your job is to categorize each transaction into the correct expense category.

Return ONLY valid JSON in this exact format:
{"expenses": [{"description": "merchant name", "amount": 123.45, "category": "category name"}]}

IMPORTANT RULES:
- Extract the merchant/business name (שם בית עסק)
- Extract the transaction amount in ILS (סכום)
- Assign each transaction to ONE category
- IGNORE: credit limits, points, refunds, credits, balances, summaries, fees
- ONLY include actual purchases/payments`;

  const userPrompt = `Analyze this credit card data from an Israeli Excel export and categorize each transaction.

CATEGORIES (choose exactly one per transaction):
- מזון לבית (supermarkets: רמי לוי, שופרסל, ויקטורי, מגה, יוחננוף, AM:PM, Yellow)
- אוכל בחוץ ובילויים (restaurants, cafes, bars, WOLT, Gett Delivery, וולט, מסעדות)
- תחביבים (SPOTIFY, NETFLIX, Google, Amazon, חוגים, חדר כושר, ספוטיפיי)
- תקשורת (HOT, YES, סלקום, פרטנר, 012, בזק, אינטרנט)
- ביטוח (ביטוח לאומי, הראל, מגדל, כלל, הפניקס, איילון)
- בריאות (מכבי, כללית, מאוחדת, לאומית, בית מרקחת, סופר פארם, Be)
- דלק וחניה (סונול, פז, דלק, Ten, Yellow, חניון, אחוזת החוף)
- תחבצ (Gett, מונית, רכבת, אוטובוס, רב קו, Bubble)
- ביגוד והנעלה (H&M, זארה, NEXT, FOX, גולף, קסטרו, רנואר)
- פארם (סופר פארם, Be, גוד פארם, אופטיקה, קוסמטיקה)
- תספורת וקוסמטיקה (מספרה, ספר, מניקור, פדיקור, עיצוב)
- מתנות (חנות מתנות, פרחים, צעצועים)
- כבישי אגרה (כביש 6, דרך ארץ, נתיבי איילון)
- חופשה וטיול (מלון, Booking, Airbnb, טיסות)
- עוזרת ושמרטף (עוזרת בית, שמרטפות, מטפלת)
- תיקוני רכב (מוסך, טסט, טיפול רכב, צמיגים)
- בעלי חיים (וטרינר, מזון לחיות, חנות חיות)
- דמי כיס וילדים (דמי כיס, קניות ילדים)
- יהדות וחגים (יודאיקה, קניות לחג)
- סיגריות (טבק, סיגריות)
- ביט ללא מעקב (BIT, ביט, Bit - העברות כסף)
- מזומן ללא מעקב (משיכת מזומן, כספומט)
- שונות (כל השאר)

DATA FROM EXCEL:
${cleanText}

Return JSON with all transactions categorized.`;

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
        max_tokens: 4096,
        temperature: 0,
        response_format: { type: 'json_object' }
      })
    });

    if (!response.ok) {
      const err = await response.json();
      return res.status(500).json({ 
        error: err.error?.message || 'OpenAI error'
      });
    }

    const data = await response.json();
    const content = data.choices[0].message.content;

    // Clean the content before parsing
    let cleanContent = content
      .replace(/[\u0000-\u001F]+/g, ' ')
      .replace(/,\s*}/g, '}')
      .replace(/,\s*]/g, ']')
      .trim();

    try {
      const result = JSON.parse(cleanContent);
      
      // Ensure expenses array exists and filter out bad entries
      if (!result.expenses) {
        result.expenses = [];
      }
      
      // Filter out entries that look like limits/points/summaries
      result.expenses = result.expenses.filter(exp => {
        if (!exp.description || !exp.amount) return false;
        if (typeof exp.amount !== 'number' || exp.amount <= 0) return false;
        
        const desc = exp.description.toLowerCase();
        const badWords = ['מסגרת', 'נקודות', 'יתרה', 'סיכום', 'התחייבות', 'זיכוי', 'החזר', 'עמלה', 'סה"כ', 'total'];
        return !badWords.some(word => desc.includes(word));
      });
      
      return res.status(200).json(result);
    } catch (parseError) {
      // Try to extract JSON from response
      const jsonMatch = cleanContent.match(/\{[\s\S]*\}/);
      if (jsonMatch) {
        try {
          const result = JSON.parse(jsonMatch[0]);
          if (result.expenses) {
            return res.status(200).json(result);
          }
        } catch (e) {
          // ignore
        }
      }
      
      return res.status(500).json({ 
        error: 'שגיאה בניתוח התשובה. נסה שוב.',
        details: parseError.message,
        raw: cleanContent.substring(0, 200)
      });
    }

  } catch (error) {
    return res.status(500).json({ error: error.message });
  }
};
