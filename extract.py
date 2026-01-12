from http.server import BaseHTTPRequestHandler
import json
import base64
import pdfplumber
import io
import re

def extract_tables_from_pdf(pdf_bytes):
    """Extract text from PDF tables using pdfplumber"""
    extracted_data = []
    
    with pdfplumber.open(io.BytesIO(pdf_bytes)) as pdf:
        for page_num, page in enumerate(pdf.pages, 1):
            # Try to extract tables first (most accurate for credit card statements)
            tables = page.extract_tables()
            
            if tables:
                for table in tables:
                    for row in table:
                        if row:
                            # Filter out None values and empty strings
                            cleaned_row = [str(cell).strip() if cell else '' for cell in row]
                            if any(cleaned_row):
                                extracted_data.append(' | '.join(cleaned_row))
            
            # Also extract regular text for non-table content
            text = page.extract_text()
            if text:
                extracted_data.append(f"\n--- טקסט מעמוד {page_num} ---\n{text}")
    
    return '\n'.join(extracted_data)

def clean_extracted_text(text):
    """Clean up the extracted text"""
    # Fix spaced numbers
    text = re.sub(r'(\d)\s+(\d)', r'\1\2', text)
    # Fix decimal numbers
    text = re.sub(r'(\d)\s*\.\s*(\d)', r'\1.\2', text)
    # Fix comma in numbers
    text = re.sub(r'(\d)\s*,\s*(\d)', r'\1,\2', text)
    # Fix currency
    text = re.sub(r'₪\s+', '₪', text)
    text = re.sub(r'\s+₪', '₪', text)
    # Clean multiple spaces
    text = re.sub(r'\s{3,}', '  ', text)
    # Clean multiple newlines
    text = re.sub(r'\n{3,}', '\n\n', text)
    
    return text.strip()

class handler(BaseHTTPRequestHandler):
    def do_POST(self):
        try:
            # Read request body
            content_length = int(self.headers.get('Content-Length', 0))
            body = self.rfile.read(content_length)
            data = json.loads(body)
            
            # Get PDF data (base64 encoded)
            pdf_base64 = data.get('pdf')
            if not pdf_base64:
                self.send_error_response(400, 'No PDF data provided')
                return
            
            # Decode base64
            try:
                pdf_bytes = base64.b64decode(pdf_base64)
            except Exception as e:
                self.send_error_response(400, f'Invalid base64 data: {str(e)}')
                return
            
            # Extract text from PDF
            extracted_text = extract_tables_from_pdf(pdf_bytes)
            
            if not extracted_text or len(extracted_text) < 50:
                self.send_error_response(400, 'Could not extract text from PDF. Make sure it contains selectable text.')
                return
            
            # Clean up the text
            cleaned_text = clean_extracted_text(extracted_text)
            
            # Send response
            self.send_response(200)
            self.send_header('Content-Type', 'application/json')
            self.send_header('Access-Control-Allow-Origin', '*')
            self.end_headers()
            
            response = {
                'success': True,
                'text': cleaned_text,
                'length': len(cleaned_text)
            }
            self.wfile.write(json.dumps(response, ensure_ascii=False).encode('utf-8'))
            
        except Exception as e:
            self.send_error_response(500, f'Server error: {str(e)}')
    
    def do_OPTIONS(self):
        self.send_response(200)
        self.send_header('Access-Control-Allow-Origin', '*')
        self.send_header('Access-Control-Allow-Methods', 'POST, OPTIONS')
        self.send_header('Access-Control-Allow-Headers', 'Content-Type')
        self.end_headers()
    
    def send_error_response(self, code, message):
        self.send_response(code)
        self.send_header('Content-Type', 'application/json')
        self.send_header('Access-Control-Allow-Origin', '*')
        self.end_headers()
        response = {'success': False, 'error': message}
        self.wfile.write(json.dumps(response, ensure_ascii=False).encode('utf-8'))
