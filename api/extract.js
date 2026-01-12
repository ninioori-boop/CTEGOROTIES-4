const pdf = require('pdf-parse');

module.exports = async (req, res) => {
  // CORS headers
  res.setHeader('Access-Control-Allow-Origin', '*');
  res.setHeader('Access-Control-Allow-Methods', 'POST, OPTIONS');
  res.setHeader('Access-Control-Allow-Headers', 'Content-Type');
  
  if (req.method === 'OPTIONS') {
    return res.status(200).end();
  }
  
  if (req.method !== 'POST') {
    return res.status(405).json({ success: false, error: 'Method not allowed' });
  }
  
  try {
    const { pdf: pdfBase64 } = req.body;
    
    if (!pdfBase64) {
      return res.status(400).json({ success: false, error: 'No PDF data provided' });
    }
    
    // Decode base64 to buffer
    const pdfBuffer = Buffer.from(pdfBase64, 'base64');
    
    // Parse PDF with pdf-parse (better for Hebrew)
    const options = {
      // Custom page renderer to preserve table structure
      pagerender: function(pageData) {
        let render_options = {
          normalizeWhitespace: false,
          disableCombineTextItems: false
        };
        
        return pageData.getTextContent(render_options)
          .then(function(textContent) {
            let text = '';
            let lastY = null;
            
            for (let item of textContent.items) {
              // Add newline when Y position changes significantly
              if (lastY !== null && Math.abs(item.transform[5] - lastY) > 5) {
                text += '\n';
              }
              text += item.str + ' ';
              lastY = item.transform[5];
            }
            
            return text;
          });
      }
    };
    
    const data = await pdf(pdfBuffer, options);
    
    let extractedText = data.text || '';
    
    if (extractedText.length < 50) {
      return res.status(400).json({ 
        success: false, 
        error: 'Could not extract enough text from PDF' 
      });
    }
    
    // Clean up the text
    extractedText = cleanText(extractedText);
    
    return res.status(200).json({
      success: true,
      text: extractedText,
      length: extractedText.length,
      pages: data.numpages
    });
    
  } catch (error) {
    console.error('PDF extraction error:', error);
    return res.status(500).json({ 
      success: false, 
      error: 'Error extracting PDF: ' + error.message 
    });
  }
};

function cleanText(text) {
  // Fix spaced numbers
  text = text.replace(/(\d)\s+(\d)/g, '$1$2');
  // Fix decimal numbers
  text = text.replace(/(\d)\s*\.\s*(\d)/g, '$1.$2');
  // Fix comma in numbers
  text = text.replace(/(\d)\s*,\s*(\d)/g, '$1,$2');
  // Fix currency
  text = text.replace(/₪\s+/g, '₪');
  text = text.replace(/\s+₪/g, '₪');
  // Clean multiple spaces
  text = text.replace(/\s{3,}/g, '  ');
  // Clean multiple newlines
  text = text.replace(/\n{3,}/g, '\n\n');
  
  return text.trim();
}
