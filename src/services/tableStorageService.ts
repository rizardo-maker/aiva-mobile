import { TableServiceClient, TableClient, AzureNamedKeyCredential } from '@azure/data-tables';
import { logger } from '../utils/logger';
import { CardData } from './documentIntelligenceService';

export class TableStorageService {
  private static instance: TableStorageService;
  private tableServiceClient: TableServiceClient | null = null;
  private tableClient: TableClient | null = null;
  private tableName: string = 'carddata';
  private isInitialized: boolean = false;

  private constructor() {
    const accountName = process.env.AZURE_STORAGE_ACCOUNT_NAME || '';
    const accountKey = process.env.AZURE_STORAGE_ACCOUNT_KEY || '';
    
    if (!accountName || !accountKey) {
      logger.warn('Azure Storage configuration is missing. Table Storage service will be unavailable.');
      this.tableServiceClient = null;
      this.tableClient = null;
      this.isInitialized = false;
      return;
    }
    
    try {
      const credential = new AzureNamedKeyCredential(accountName, accountKey);
      this.tableServiceClient = new TableServiceClient(
        `https://${accountName}.table.core.windows.net`,
        credential
      );
      
      this.tableClient = new TableClient(
        `https://${accountName}.table.core.windows.net`,
        this.tableName,
        credential
      );
      
      this.isInitialized = true;
      logger.info('✅ Table Storage service initialized');
    } catch (error) {
      logger.error('Failed to initialize Table Storage service:', error);
      this.tableServiceClient = null;
      this.tableClient = null;
      this.isInitialized = false;
    }
  }

  public static getInstance(): TableStorageService {
    if (!TableStorageService.instance) {
      TableStorageService.instance = new TableStorageService();
    }
    return TableStorageService.instance;
  }

  /**
   * Initialize the table if it doesn't exist
   */
  public async initializeTable(): Promise<void> {
    if (!this.isInitialized || !this.tableServiceClient) {
      logger.warn('Table Storage service is not initialized. Skipping table initialization.');
      return;
    }
    
    try {
      await this.tableServiceClient.createTable(this.tableName);
      logger.info(`Table '${this.tableName}' created successfully`);
    } catch (error: any) {
      if (error.statusCode === 409) {
        // Table already exists
        logger.info(`Table '${this.tableName}' already exists`);
      } else {
        logger.error('Failed to create table:', error);
        throw new Error(`Failed to create table: ${error.message}`);
      }
    }
  }

  /**
   * Store card data in Azure Table Storage
   * @param cardData - The card data to store
   * @param partitionKey - Partition key (e.g., admin email or timestamp)
   * @returns The entity key
   */
  public async storeCardData(cardData: CardData, partitionKey: string = 'cards'): Promise<string> {
    if (!this.isInitialized || !this.tableClient) {
      throw new Error('Table Storage service is not initialized');
    }
    
    try {
      // Generate a unique row key
      const rowKey = new Date().getTime().toString();
      
      // Prepare entity for table storage with proper timestamp
      const entity = {
        partitionKey,
        rowKey,
        timestamp: new Date().toISOString(), // Store as ISO string for consistency
        ...cardData
      };
      
      // Insert entity into table
      await this.tableClient.createEntity(entity);
      
      logger.info('Card data stored successfully in table storage');
      return rowKey;
    } catch (error) {
      logger.error('Failed to store card data:', error);
      throw new Error(`Failed to store card data: ${error instanceof Error ? error.message : 'Unknown error'}`);
    }
  }

  /**
   * Retrieve all card data from table storage
   * @param partitionKey - Partition key to filter by (optional)
   * @returns Array of card data entities
   */
  public async getAllCardData(partitionKey?: string): Promise<any[]> {
    if (!this.isInitialized || !this.tableClient) {
      throw new Error('Table Storage service is not initialized');
    }
    
    try {
      const entities: any[] = [];
      let queryOptions: any = {};
      
      if (partitionKey) {
        queryOptions = { filter: `PartitionKey eq '${partitionKey}'` };
      }
      
      const entitiesIterator = this.tableClient.listEntities(queryOptions);
      
      for await (const entity of entitiesIterator) {
        entities.push(entity);
      }
      
      logger.info(`Retrieved ${entities.length} card data entities from table storage`);
      return entities;
    } catch (error) {
      logger.error('Failed to retrieve card data:', error);
      throw new Error(`Failed to retrieve card data: ${error instanceof Error ? error.message : 'Unknown error'}`);
    }
  }

  /**
   * Delete card data from table storage
   * @param partitionKey - Partition key
   * @param rowKey - Row key
   */
  public async deleteCardData(partitionKey: string, rowKey: string): Promise<void> {
    if (!this.isInitialized || !this.tableClient) {
      throw new Error('Table Storage service is not initialized');
    }
    
    try {
      await this.tableClient.deleteEntity(partitionKey, rowKey);
      logger.info('Card data deleted successfully from table storage');
    } catch (error) {
      logger.error('Failed to delete card data:', error);
      throw new Error(`Failed to delete card data: ${error instanceof Error ? error.message : 'Unknown error'}`);
    }
  }
}
