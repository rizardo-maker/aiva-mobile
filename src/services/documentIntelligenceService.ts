import { DocumentAnalysisClient, AzureKeyCredential } from '@azure/ai-form-recognizer';
import { logger } from '../utils/logger';

export interface CardData {
  // Front side fields
  civilIdNo: string;
  name: string;
  nationality: string;
  sex: string;
  expiryDate: string;
  birthDate: string;
  
  // Back side fields
  serialNo: string;
  
  // Additional fields for tracking
  [key: string]: string;
}

export class DocumentIntelligenceService {
  private static instance: DocumentIntelligenceService;
  private client: DocumentAnalysisClient | null = null;
  private isInitialized: boolean = false;

  private constructor() {
    const endpoint = process.env.AZURE_DOCUMENT_INTELLIGENCE_ENDPOINT || '';
    const key = process.env.AZURE_DOCUMENT_INTELLIGENCE_KEY || '';
    
    if (!endpoint || !key) {
      logger.warn('Azure Document Intelligence configuration is missing. Service will be unavailable.');
      this.client = null;
      this.isInitialized = false;
      return;
    }
    
    try {
      this.client = new DocumentAnalysisClient(endpoint, new AzureKeyCredential(key));
      this.isInitialized = true;
      logger.info('✅ Document Intelligence service initialized');
    } catch (error) {
      logger.error('Failed to initialize Document Intelligence service:', error);
      this.client = null;
      this.isInitialized = false;
    }
  }

  public static getInstance(): DocumentIntelligenceService {
    if (!DocumentIntelligenceService.instance) {
      DocumentIntelligenceService.instance = new DocumentIntelligenceService();
    }
    return DocumentIntelligenceService.instance;
  }

  /**
   * Analyze a document and extract passport/card information
   * @param buffer - The document buffer
   * @returns Extracted card data
   */
  public async analyzeCardDocument(buffer: Buffer): Promise<CardData> {
    // Check if we're in mock mode for development
    const mockMode = process.env.MOCK_SQL === 'true' || process.env.MOCK_DATABASE === 'true';
    
    if (mockMode) {
      // Return mock card data for development
      logger.info('Mock mode: Returning mock card data for development');
      
      const mockCardData: CardData = {
        civilIdNo: '123456789012',
        name: 'John Doe',
        nationality: 'Kuwaiti',
        sex: 'M',
        expiryDate: '2030-12-31',
        birthDate: '1990-01-15',
        serialNo: 'ABC123456'
      };
      
      return mockCardData;
    }
    
    if (!this.isInitialized || !this.client) {
      throw new Error('Document Intelligence service is not initialized');
    }
    
    try {
      logger.info('Analyzing card document with Azure Document Intelligence');
      
      // Use the prebuilt ID document model
      const poller = await this.client.beginAnalyzeDocument('prebuilt-idDocument', buffer);
      const { documents } = await poller.pollUntilDone();
      
      if (!documents || documents.length === 0) {
        throw new Error('No documents found in the analysis result');
      }
      
      const document = documents[0];
      const fields = document.fields;
      
      // Log all available fields for debugging
      logger.info('Available fields in document:', Object.keys(fields));
      
      // Extract card fields as per requirements
      const cardData: CardData = {
        // Front side fields
        civilIdNo: this.getFieldValue(fields, 'DocumentNumber'),
        name: this.getFieldValue(fields, 'FirstName') + ' ' + this.getFieldValue(fields, 'LastName'),
        nationality: this.getFieldValue(fields, 'CountryRegion') || this.getFieldValue(fields, 'Nationality') || this.getFieldValue(fields, 'Country'),
        sex: this.getFieldValue(fields, 'Sex') || this.getFieldValue(fields, 'Gender'),
        expiryDate: this.getFieldValue(fields, 'DateOfExpiration'),
        birthDate: this.getFieldValue(fields, 'DateOfBirth'),
        
        // Back side fields
        serialNo: this.getFieldValue(fields, 'SerialNumber') || this.getFieldValue(fields, 'DocumentNumber')
      };
      
      // Clean up name by removing extra spaces
      cardData.name = cardData.name.trim().replace(/\s+/g, ' ');
      
      // Try alternative field names for nationality if not found
      if (!cardData.nationality) {
        // Check for common alternative field names
        const nationalityFields = ['Nationality', 'Country', 'IssuingCountry', 'CountryOfIssue'];
        for (const field of nationalityFields) {
          const value = this.getFieldValue(fields, field);
          if (value) {
            cardData.nationality = value;
            break;
          }
        }
      }
      
      // Format birth date to show only date part (not time)
      if (cardData.birthDate) {
        const birthDate = new Date(cardData.birthDate);
        if (!isNaN(birthDate.getTime())) {
          cardData.birthDate = birthDate.toISOString().split('T')[0]; // Format as YYYY-MM-DD
        }
      }
      
      // Format expiry date to show only date part (not time)
      if (cardData.expiryDate) {
        const expiryDate = new Date(cardData.expiryDate);
        if (!isNaN(expiryDate.getTime())) {
          cardData.expiryDate = expiryDate.toISOString().split('T')[0]; // Format as YYYY-MM-DD
        }
      }
      
      // Try alternative field names for serial number if not found
      if (!cardData.serialNo) {
        const serialNoFields = ['SerialNumber', 'DocumentNumber', 'IDNumber'];
        for (const field of serialNoFields) {
          const value = this.getFieldValue(fields, field);
          if (value) {
            cardData.serialNo = value;
            break;
          }
        }
      }
      
      // Add any additional fields that might be present
      for (const [key, value] of Object.entries(fields)) {
        // Skip fields we've already processed
        const processedFields = ['FirstName', 'LastName', 'DocumentNumber', 'CountryRegion', 'Nationality', 'Country', 'Sex', 'Gender', 'DateOfBirth', 'DateOfExpiration', 'SerialNumber', 'IDNumber', 'IssuingCountry', 'CountryOfIssue'];
        if (!processedFields.includes(key) && !(key in cardData) && value && typeof value === 'object' && 'value' in value) {
          cardData[key] = String((value as any).value);
        }
      }
      
      logger.info('Successfully analyzed card document', cardData);
      return cardData;
      
    } catch (error) {
      logger.error('Failed to analyze card document:', error);
      throw new Error(`Failed to analyze card document: ${error instanceof Error ? error.message : 'Unknown error'}`);
    }
  }

  /**
   * Helper method to safely extract field values
   */
  private getFieldValue(fields: any, fieldName: string): string {
    if (fields[fieldName] && fields[fieldName].value) {
      return String(fields[fieldName].value);
    }
    return '';
  }
}
