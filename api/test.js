module.exports = (req, res) => {
  const apiKey = process.env.OPENAI_API_KEY;
  
  res.setHeader('Access-Control-Allow-Origin', '*');
  
  if (!apiKey) {
    return res.status(200).json({
      status: 'ERROR',
      message: 'API key is NOT configured in Vercel',
      hasKey: false
    });
  }
  
  // Show only first 10 and last 4 characters for security
  const maskedKey = apiKey.substring(0, 10) + '...' + apiKey.substring(apiKey.length - 4);
  
  return res.status(200).json({
    status: 'OK',
    message: 'API key is configured',
    hasKey: true,
    keyPreview: maskedKey,
    keyLength: apiKey.length
  });
};
