import json
import base64
import pdfplumber
import io
import re
from http.server import BaseHTTPRequestHandler

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
                self.send_json_response(400, {'success': False, 'error': 'No PDF data provided'})
                return
            
            # Decode base64
            try:
                pdf_bytes = base64.b64decode(pdf_base64)
            except Exception as e:
                self.send_json_response(400, {'success': False, 'error': f'Invalid base64 data: {str(e)}'})
                return
            
            # Extract text from PDF
            extracted_text = self.extract_tables_from_pdf(pdf_bytes)
            
            if not extracted_text or len(extracted_text) < 50:
                self.send_json_response(400, {'success': False, 'error': 'Could not extract text from PDF'})
                return
            
            # Clean up the text
            cleaned_text = self.clean_extracted_text(extracted_text)
            
            # Send success response
            self.send_json_response(200, {
                'success': True,
                'text': cleaned_text,
                'length': len(cleaned_text)
            })
            
        except Exception as e:
            self.send_json_response(500, {'success': False, 'error': f'Server error: {str(e)}'})
    
    def do_OPTIONS(self):
        self.send_response(200)
        self.send_header('Access-Control-Allow-Origin', '*')
        self.send_header('Access-Control-Allow-Methods', 'POST, OPTIONS')
        self.send_header('Access-Control-Allow-Headers', 'Content-Type')
        self.end_headers()
    
    def send_json_response(self, status_code, data):
        self.send_response(status_code)
        self.send_header('Content-Type', 'application/json; charset=utf-8')
        self.send_header('Access-Control-Allow-Origin', '*')
        self.end_headers()
        self.wfile.write(json.dumps(data, ensure_ascii=False).encode('utf-8'))
    
    def extract_tables_from_pdf(self, pdf_bytes):
        """Extract text from PDF tables using pdfplumber"""
        extracted_data = []
        
        try:
            with pdfplumber.open(io.BytesIO(pdf_bytes)) as pdf:
                for page_num, page in enumerate(pdf.pages, 1):
                    # Try to extract tables first
                    tables = page.extract_tables()
                    
                    if tables:
                        for table in tables:
                            for row in table:
                                if row:
                                    cleaned_row = [str(cell).strip() if cell else '' for cell in row]
                                    if any(cleaned_row):
                                        extracted_data.append(' | '.join(cleaned_row))
                    
                    # Also extract regular text
                    text = page.extract_text()
                    if text:
                        extracted_data.append(text)
        except Exception as e:
            return f"Error extracting PDF: {str(e)}"
        
        return '\n'.join(extracted_data)
    
    def clean_extracted_text(self, text):
        """Clean up the extracted text"""
        text = re.sub(r'(\d)\s+(\d)', r'\1\2', text)
        text = re.sub(r'(\d)\s*\.\s*(\d)', r'\1.\2', text)
        text = re.sub(r'(\d)\s*,\s*(\d)', r'\1,\2', text)
        text = re.sub(r'₪\s+', '₪', text)
        text = re.sub(r'\s+₪', '₪', text)
        text = re.sub(r'\s{3,}', '  ', text)
        text = re.sub(r'\n{3,}', '\n\n', text)
        return text.strip()
