import { BlobServiceClient, ContainerClient } from '@azure/storage-blob';
import { blobServiceClient } from './azure';
import { logger } from '../utils/logger';

export class WorkspaceStorageService {
  private static instance: WorkspaceStorageService;
  private static readonly MAIN_CONTAINER_NAME = process.env.AZURE_STORAGE_CONTAINER_NAME || 'aiva-files';
  private static readonly WORKSPACE_PARENT_FOLDER = 'workspace/'; // New parent folder

  private constructor() {}

  public static getInstance(): WorkspaceStorageService {
    if (!WorkspaceStorageService.instance) {
      WorkspaceStorageService.instance = new WorkspaceStorageService();
    }
    return WorkspaceStorageService.instance;
  }

  /**
   * Ensures the main workspace container exists
   * @returns True if successful, false otherwise
   */
  public async initializeMainContainer(): Promise<boolean> {
    try {
      if (!blobServiceClient) {
        logger.warn('Blob service client not initialized');
        return false;
      }

      const containerClient = blobServiceClient.getContainerClient(WorkspaceStorageService.MAIN_CONTAINER_NAME);
      await containerClient.createIfNotExists();
      
      // Create the workspace parent folder
      const workspaceFolderPlaceholder = containerClient.getBlockBlobClient(`${WorkspaceStorageService.WORKSPACE_PARENT_FOLDER}.placeholder`);
      await workspaceFolderPlaceholder.uploadData(Buffer.from('Workspace parent folder placeholder'), {
        blobHTTPHeaders: {
          blobContentType: 'text/plain'
        }
      });
      
      const exists = await containerClient.exists();
      if (exists) {
        logger.info(`Main workspace container verified: ${WorkspaceStorageService.MAIN_CONTAINER_NAME}`);
        return true;
      } else {
        logger.warn(`Failed to verify main workspace container: ${WorkspaceStorageService.MAIN_CONTAINER_NAME}`);
        return false;
      }
    } catch (error) {
      logger.error(`Failed to initialize main workspace container:`, error);
      return false;
    }
  }

  /**
   * Creates a proper folder structure for a workspace within the main container
   * @param workspaceId - The unique ID of the workspace
   * @param workspaceName - The name of the workspace
   * @returns The folder path if successful, null otherwise
   */
  public async createWorkspaceFolder(workspaceId: string, workspaceName: string): Promise<string | null> {
    try {
      if (!blobServiceClient) {
        logger.warn('Blob service client not initialized, skipping folder creation');
        return null;
      }

      // Create a folder with the workspace name and ID for better identification
      // Format: workspace/{workspaceName}-{workspaceId(first 7 digits)}/
      const sanitizedWorkspaceName = workspaceName.replace(/[^a-zA-Z0-9-]/g, '-').toLowerCase();
      const shortWorkspaceId = workspaceId.substring(0, 7);
      const folderPath = `${WorkspaceStorageService.WORKSPACE_PARENT_FOLDER}${sanitizedWorkspaceName}-${shortWorkspaceId}/`;
      
      logger.info(`Creating workspace folder structure: ${folderPath} for workspace: ${workspaceName}`);
      
      const containerClient = blobServiceClient.getContainerClient(WorkspaceStorageService.MAIN_CONTAINER_NAME);
      
      // Create multiple placeholder files to establish a proper folder structure
      const placeholderContent = `Workspace: ${workspaceName}
ID: ${workspaceId}
Created: ${new Date().toISOString()}
Purpose: This folder contains all files and documents for the "${workspaceName}" workspace.
Path: ${folderPath}

This is a placeholder file to maintain the folder structure in Azure Blob Storage.
Files uploaded to this workspace will be stored in this folder.`;

      // Create main folder placeholder
      const mainPlaceholder = containerClient.getBlockBlobClient(`${folderPath}.placeholder`);
      await mainPlaceholder.uploadData(Buffer.from(placeholderContent), {
        blobHTTPHeaders: {
          blobContentType: 'text/plain'
        },
        metadata: {
          workspaceId: workspaceId,
          workspaceName: workspaceName,
          folderType: 'workspace',
          createdAt: new Date().toISOString()
        }
      });

      // Create a README file to document the workspace
      const readmePlaceholder = containerClient.getBlockBlobClient(`${folderPath}README.txt`);
      const readmeContent = `Workspace: ${workspaceName}
========================================

This folder contains all files and documents for the "${workspaceName}" workspace.

Workspace Details:
- ID: ${workspaceId}
- Name: ${workspaceName}
- Created: ${new Date().toISOString()}
- Storage Path: ${folderPath}

File Organization:
- All uploaded files will be stored in this folder
- Files are automatically indexed for search
- Documents are processed for AI-powered chat responses

Azure Integration:
- Blob Storage: storageaiva/blob/${folderPath}
- AI Search Index: ${sanitizedWorkspaceName}-${shortWorkspaceId}index
- Semantic Configuration: search${sanitizedWorkspaceName}-${shortWorkspaceId}index

This folder structure ensures proper organization and enables advanced features like:
- Document search across workspace files
- AI-powered responses using workspace context
- File management and organization
- Automatic content indexing and processing
`;

      await readmePlaceholder.uploadData(Buffer.from(readmeContent), {
        blobHTTPHeaders: {
          blobContentType: 'text/plain'
        },
        metadata: {
          workspaceId: workspaceId,
          workspaceName: workspaceName,
          fileType: 'readme',
          createdAt: new Date().toISOString()
        }
      });

      // Verify the folder was created by checking if blobs exist
      let folderCreated = false;
      for await (const blob of containerClient.listBlobsFlat()) {
        if (blob.name.startsWith(folderPath)) {
          folderCreated = true;
          logger.info(`✅ Verified blob created: ${blob.name}`);
          break;
        }
      }

      if (folderCreated) {
        logger.info(`✅ Successfully created workspace folder structure: ${folderPath}`);
        logger.info(`📁 Full Azure path: storageaiva/${WorkspaceStorageService.MAIN_CONTAINER_NAME}/${folderPath}`);
        return folderPath;
      } else {
        logger.error(`❌ Failed to verify workspace folder creation: ${folderPath}`);
        return null;
      }
    } catch (error) {
      logger.error(`Failed to create workspace folder for workspace ${workspaceName} (${workspaceId}):`, error);
      return null;
    }
  }

  /**
   * Deletes a workspace folder and all its contents
   * @param workspaceId - The unique ID of the workspace
   * @param workspaceName - The name of the workspace
   * @returns True if successful, false otherwise
   */
  public async deleteWorkspaceFolder(workspaceId: string, workspaceName: string): Promise<boolean> {
    try {
      if (!blobServiceClient) {
        logger.warn('Blob service client not initialized, skipping folder deletion');
        return false;
      }

      const sanitizedWorkspaceName = workspaceName.replace(/[^a-zA-Z0-9-]/g, '-').toLowerCase();
      const shortWorkspaceId = workspaceId.substring(0, 7);
      const folderPath = `${WorkspaceStorageService.WORKSPACE_PARENT_FOLDER}${sanitizedWorkspaceName}-${shortWorkspaceId}/`;
      
      logger.info(`Deleting workspace folder: ${folderPath}`);
      
      const containerClient = blobServiceClient.getContainerClient(WorkspaceStorageService.MAIN_CONTAINER_NAME);
      
      // Delete all blobs within the folder
      const blobsToDelete = [];
      for await (const blob of containerClient.listBlobsFlat()) {
        if (blob.name.startsWith(folderPath)) {
          blobsToDelete.push(blob.name);
        }
      }
      
      // Delete all blobs in the folder
      for (const blobName of blobsToDelete) {
        const blobClient = containerClient.getBlobClient(blobName);
        await blobClient.deleteIfExists();
      }
      
      logger.info(`Successfully deleted workspace folder and contents: ${folderPath}`);
      return true;
    } catch (error) {
      logger.error(`Failed to delete workspace folder for workspace ${workspaceName} (${workspaceId}):`, error);
      return false;
    }
  }

  /**
   * Checks if a workspace folder exists
   * @param workspaceId - The unique ID of the workspace
   * @param workspaceName - The name of the workspace
   * @returns True if folder exists, false otherwise
   */
  public async folderExists(workspaceId: string, workspaceName: string): Promise<boolean> {
    try {
      if (!blobServiceClient) {
        logger.warn('Blob service client not initialized');
        return false;
      }

      const sanitizedWorkspaceName = workspaceName.replace(/[^a-zA-Z0-9-]/g, '-').toLowerCase();
      const shortWorkspaceId = workspaceId.substring(0, 7);
      const folderPath = `${WorkspaceStorageService.WORKSPACE_PARENT_FOLDER}${sanitizedWorkspaceName}-${shortWorkspaceId}/`;
      
      const containerClient = blobServiceClient.getContainerClient(WorkspaceStorageService.MAIN_CONTAINER_NAME);
      
      // Check if any blobs exist with the folder prefix
      for await (const blob of containerClient.listBlobsFlat()) {
        if (blob.name.startsWith(folderPath)) {
          return true;
        }
      }
      
      return false;
    } catch (error) {
      logger.error(`Failed to check if folder exists for workspace ${workspaceName} (${workspaceId}):`, error);
      return false;
    }
  }

  /**
   * Lists all blobs in a workspace folder
   * @param workspaceId - The unique ID of the workspace
   * @param workspaceName - The name of the workspace
   * @returns Array of blob names
   */
  public async listWorkspaceBlobs(workspaceId: string, workspaceName: string): Promise<string[]> {
    try {
      if (!blobServiceClient) {
        logger.warn('Blob service client not initialized');
        return [];
      }

      const sanitizedWorkspaceName = workspaceName.replace(/[^a-zA-Z0-9-]/g, '-').toLowerCase();
      const shortWorkspaceId = workspaceId.substring(0, 7);
      const folderPath = `${WorkspaceStorageService.WORKSPACE_PARENT_FOLDER}${sanitizedWorkspaceName}-${shortWorkspaceId}/`;
      
      const containerClient = blobServiceClient.getContainerClient(WorkspaceStorageService.MAIN_CONTAINER_NAME);
      
      const blobNames: string[] = [];
      for await (const blob of containerClient.listBlobsFlat()) {
        // Only include blobs that are in this workspace folder and exclude the placeholder
        if (blob.name.startsWith(folderPath) && !blob.name.endsWith('.placeholder')) {
          // Return just the filename part (without the folder path)
          const fileName = blob.name.substring(folderPath.length);
          blobNames.push(fileName);
        }
      }
      
      return blobNames;
    } catch (error) {
      logger.error(`Failed to list blobs for workspace ${workspaceName} (${workspaceId}):`, error);
      return [];
    }
  }

  /**
   * Gets the full blob URL for a file in a workspace folder
   * @param workspaceId - The unique ID of the workspace
   * @param workspaceName - The name of the workspace
   * @param fileName - The name of the file
   * @returns The full blob URL
   */
  public getBlobUrl(workspaceId: string, workspaceName: string, fileName: string): string {
    const sanitizedWorkspaceName = workspaceName.replace(/[^a-zA-Z0-9-]/g, '-').toLowerCase();
    const shortWorkspaceId = workspaceId.substring(0, 7);
    const folderPath = `${WorkspaceStorageService.WORKSPACE_PARENT_FOLDER}${sanitizedWorkspaceName}-${shortWorkspaceId}/`;
    return `${blobServiceClient?.accountName}/${WorkspaceStorageService.MAIN_CONTAINER_NAME}/${folderPath}${fileName}`;
  }
  
  /**
   * Gets the workspace folder name (used for Azure Search index name)
   * @param workspaceId - The unique ID of the workspace
   * @param workspaceName - The name of the workspace
   * @returns The workspace folder name
   */
  public getWorkspaceFolderName(workspaceId: string, workspaceName: string): string {
    const sanitizedWorkspaceName = workspaceName.replace(/[^a-zA-Z0-9-]/g, '-').toLowerCase();
    const shortWorkspaceId = workspaceId.substring(0, 7);
    return `${sanitizedWorkspaceName}-${shortWorkspaceId}`;
  }
}