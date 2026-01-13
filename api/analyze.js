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

  // Clean the text from problematic characters - increased limit for more transactions
  const cleanText = text
    .replace(/[\u0000-\u0008\u000B\u000C\u000E-\u001F]/g, ' ')
    .replace(/\\/g, ' ')
    .replace(/"/g, "'")
    .substring(0, 60000);

  const systemMessage = `You are an Israeli credit card expense analyzer. You receive data from Excel/CSV files exported from Israeli credit card companies.

Your job is to categorize EVERY SINGLE transaction into the correct expense category.

CRITICAL: You MUST process ALL transactions in the data. Do not skip any rows. Every transaction must appear in your output.

Return ONLY valid JSON in this exact format:
{"expenses": [{"description": "merchant name", "amount": 123.45, "category": "category name"}]}

For INSTALLMENT payments (תשלומים), add extra fields:
{"description": "מכבידנט", "amount": 1116.00, "category": "בריאות", "installment_current": 10, "installment_total": 12, "total_amount": 13403.40}

IMPORTANT RULES:
- Process EVERY transaction row - do not skip any!
- Extract the merchant/business name (שם בית עסק)
- Extract the transaction amount in ILS (סכום)
- Assign each transaction to ONE category
- ALL BIT/ביט transfers = "ביט ללא מעקב"
- מיי טאוור = "דמי ניהול בניין" (building management)
- מס הכנסה/מע"מ = "מיסים" (NOT ביטוח)
- דמי כרטיס = "עמלות בנק ואשראי"
- רשת כוורת = "מזון לבית"
- Look for installment indicators: "תשלום X מתוך Y", "X/Y", "מ-X"
- ONLY IGNORE: credit limit lines, total/summary lines at end
- Include ALL actual purchases/payments/transfers`;

  const userPrompt = `Analyze this credit card data from an Israeli Excel export and categorize EVERY transaction.

CRITICAL: Process ALL rows in the data. Every transaction must be included in your response. Do not skip any!

INSTALLMENT PAYMENTS (תשלומים):
If you see text like "תשלום X מתוך Y" or "X/Y" or "תשלום מ-X", this is an installment payment.
For installment payments, add these fields:
- "installment_current": current payment number
- "installment_total": total number of payments  
- "total_amount": the full transaction amount (before splitting)
Example: "מכבידנט תשלום 10 מ-12 סכום 1,116" means installment 10 of 12, total was 13,403.40

CATEGORIES (choose exactly one per transaction):
- מזון לבית (supermarkets: רמי לוי, שופרסל, ויקטורי, מגה, יוחננוף, AM:PM, Yellow, רשת כוורת, קליית בראשית, Wine&More)
- אוכל בחוץ ובילויים (restaurants, cafes, bars, WOLT, Gett Delivery, וולט, מסעדות, קפה)
- תחביבים (SPOTIFY, NETFLIX, Google, Amazon, חוגים, חדר כושר, ספוטיפיי, NEXT TV BY HOT)
- תקשורת (HOT mobile, YES, סלקום, פרטנר, 012, בזק, אינטרנט, פרי טיוי פלוס)
- ביטוח (ביטוח לאומי, הראל, מגדל, כלל, הפניקס, איילון - NOT מס הכנסה)
- בריאות (מכבי, כללית, מאוחדת, לאומית, בית מרקחת, סופר פארם, Be, מכבידנט, רופא שיניים)
- דלק וחניה (סונול, פז, דלק, Ten, Yellow, חניון, אחוזת החוף, דור אלון)
- תחבצ (Gett, מונית, רכבת, אוטובוס, רב קו, Bubble)
- ביגוד והנעלה (H&M, זארה, NEXT, FOX, גולף, קסטרו, רנואר, ללין)
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
- ביט ללא מעקב (BIT, ביט, Bit, העברה ב-BIT, העברה בביט - ALL BIT transfers go here)
- מזומן ללא מעקב (משיכת מזומן, כספומט)
- מיסים (מס הכנסה, נציבות מס הכנסה, מע"מ, גביית מעמ, רשות המיסים)
- דמי ניהול בניין (מיי טאוור, ועד בית, חברת ניהול, דמי ניהול בניין)
- עמלות בנק ואשראי (דמי כרטיס, עמלה, דמי ניהול חשבון, עמלת עו"ש)
- שונות (anything that doesn't fit above)

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
        max_tokens: 16000,
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
      
      // Filter out entries that are NOT actual transactions (only obvious non-expenses)
      result.expenses = result.expenses.filter(exp => {
        if (!exp.description || !exp.amount) return false;
        if (typeof exp.amount !== 'number' || exp.amount <= 0) return false;
        
        const desc = exp.description.toLowerCase();
        // Only filter out clear non-transactions - be very conservative
        const badPhrases = ['מסגרת אשראי', 'יתרת זכות', 'סה"כ לחיוב', 'סה"כ חיוב', 'total balance', 'credit limit'];
        return !badPhrases.some(phrase => desc.includes(phrase));
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
