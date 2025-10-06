import express from 'express';
import multer from 'multer';
import { DocumentIntelligenceService } from '../services/documentIntelligenceService';
import { TableStorageService } from '../services/tableStorageService';
import { logger } from '../utils/logger';

const router = express.Router();
const upload = multer({ limits: { fileSize: 10 * 1024 * 1024 } }); // 10MB limit

// Initialize services
let documentIntelligenceService: DocumentIntelligenceService | null = null;
let tableStorageService: TableStorageService | null = null;

try {
  documentIntelligenceService = DocumentIntelligenceService.getInstance();
} catch (error) {
  logger.warn('Document Intelligence service unavailable:', error);
}

try {
  tableStorageService = TableStorageService.getInstance();
  // Initialize the table
  tableStorageService.initializeTable().catch(err => {
    logger.error('Failed to initialize card data table:', err);
  });
} catch (error) {
  logger.warn('Table Storage service unavailable:', error);
}

/**
 * Upload and scan a card document
 * POST /api/admin/cards/scan
 */
router.post('/scan', upload.single('cardImage'), async (req, res) => {
  try {
    if (!documentIntelligenceService) {
      return res.status(503).json({ error: 'Document Intelligence service is not available' });
    }
    
    if (!req.file) {
      return res.status(400).json({ error: 'No file uploaded' });
    }

    logger.info('Processing card scan request');
    
    // Analyze the document using Azure Document Intelligence
    const cardData = await documentIntelligenceService.analyzeCardDocument(req.file.buffer);
    
    // Store the extracted data in Azure Table Storage if available
    let rowKey = 'mock-id';
    if (tableStorageService) {
      rowKey = await tableStorageService.storeCardData(cardData, 'admin-cards');
    }
    
    res.json({
      message: 'Card scanned and data stored successfully',
      cardData,
      id: rowKey
    });
  } catch (error) {
    logger.error('Card scan error:', error);
    res.status(500).json({ 
      error: 'Failed to scan card',
      details: error instanceof Error ? error.message : 'Unknown error'
    });
  }
});

/**
 * Get all scanned cards
 * GET /api/admin/cards
 */
router.get('/', async (req, res) => {
  try {
    if (!tableStorageService) {
      return res.status(503).json({ error: 'Table Storage service is not available' });
    }
    
    logger.info('Retrieving all scanned cards');
    
    const cards = await tableStorageService.getAllCardData('admin-cards');
    
    res.json({
      cards
    });
  } catch (error) {
    logger.error('Get cards error:', error);
    res.status(500).json({ 
      error: 'Failed to retrieve cards',
      details: error instanceof Error ? error.message : 'Unknown error'
    });
  }
});

/**
 * Delete a scanned card
 * DELETE /api/admin/cards/:id
 */
router.delete('/:id', async (req, res) => {
  try {
    if (!tableStorageService) {
      return res.status(503).json({ error: 'Table Storage service is not available' });
    }
    
    const { id } = req.params;
    
    if (!id) {
      return res.status(400).json({ error: 'Card ID is required' });
    }
    
    logger.info(`Deleting card with ID: ${id}`);
    
    await tableStorageService.deleteCardData('admin-cards', id);
    
    res.json({
      message: 'Card deleted successfully'
    });
  } catch (error) {
    logger.error('Delete card error:', error);
    res.status(500).json({ 
      error: 'Failed to delete card',
      details: error instanceof Error ? error.message : 'Unknown error'
    });
  }
});

export { router as cardScanRoutes };
