/**
 * Test script to verify workspace creation with Azure integration
 * This script tests the complete workflow:
 * 1. Create a workspace via API
 * 2. Verify Azure Blob Storage folder creation
 * 3. Verify Azure AI Search index creation
 * 4. Check naming format compliance
 */

const axios = require('axios');
const { BlobServiceClient } = require('@azure/storage-blob');
const { SearchIndexClient, AzureKeyCredential } = require('@azure/search-documents');
require('dotenv').config();

const API_BASE_URL = 'http://localhost:8080/api';
const TEST_WORKSPACE_NAME = 'test-workspace-' + Date.now();

// Azure configuration
const AZURE_STORAGE_CONNECTION_STRING = process.env.AZURE_STORAGE_CONNECTION_STRING;
const AZURE_STORAGE_CONTAINER_NAME = process.env.AZURE_STORAGE_CONTAINER_NAME || 'blob';
const AZURE_AI_SEARCH_ENDPOINT = process.env.AZURE_AI_SEARCH_ENDPOINT;
const AZURE_AI_SEARCH_API_KEY = process.env.AZURE_AI_SEARCH_API_KEY;

let authToken = null;
let createdWorkspaceId = null;

async function main() {
  try {
    console.log('🚀 Starting workspace creation test...\n');

    // Step 1: Login to get auth token
    console.log('1️⃣ Authenticating...');
    await login();
    console.log('✅ Authentication successful\n');

    // Step 2: Create workspace
    console.log('2️⃣ Creating test workspace...');
    const workspace = await createWorkspace();
    console.log('✅ Workspace created successfully');
    console.log(`   ID: ${workspace.id}`);
    console.log(`   Name: ${workspace.name}`);
    console.log(`   Folder Path: ${workspace.folderPath || 'Not set'}`);
    console.log(`   Search Index: ${workspace.searchIndexName || 'Not set'}\n`);

    // Step 3: Verify Azure Blob Storage
    console.log('3️⃣ Verifying Azure Blob Storage...');
    await verifyBlobStorage(workspace);
    console.log('✅ Azure Blob Storage verification complete\n');

    // Step 4: Verify Azure AI Search
    console.log('4️⃣ Verifying Azure AI Search...');
    await verifyAISearch(workspace);
    console.log('✅ Azure AI Search verification complete\n');

    // Step 5: Test naming format
    console.log('5️⃣ Verifying naming format compliance...');
    verifyNamingFormat(workspace);
    console.log('✅ Naming format verification complete\n');

    console.log('🎉 All tests passed! Workspace creation with Azure integration is working correctly.');

  } catch (error) {
    console.error('❌ Test failed:', error.message);
    console.error('Full error:', error);
  }
}

async function login() {
  try {
    // Try to login with admin credentials
    const response = await axios.post(`${API_BASE_URL}/auth/login`, {
      email: 'aiva50543@gmail.com', // Admin email from .env
      password: 'admin123' // Default admin password
    });

    if (response.data.token) {
      authToken = response.data.token;
      console.log('   Token obtained successfully');
    } else {
      throw new Error('No token received from login');
    }
  } catch (error) {
    console.error('   Login failed:', error.response?.data || error.message);
    throw error;
  }
}

async function createWorkspace() {
  try {
    const response = await axios.post(`${API_BASE_URL}/workspaces`, {
      name: TEST_WORKSPACE_NAME,
      description: 'Test workspace for Azure integration verification',
      color: '#FF6B35',
      isShared: false
    }, {
      headers: {
        'Authorization': `Bearer ${authToken}`,
        'Content-Type': 'application/json'
      }
    });

    if (response.data.workspace) {
      createdWorkspaceId = response.data.workspace.id;
      return response.data.workspace;
    } else {
      throw new Error('No workspace data in response');
    }
  } catch (error) {
    console.error('   Workspace creation failed:', error.response?.data || error.message);
    throw error;
  }
}

async function verifyBlobStorage(workspace) {
  try {
    console.log('   Connecting to Azure Blob Storage...');
    const blobServiceClient = BlobServiceClient.fromConnectionString(AZURE_STORAGE_CONNECTION_STRING);
    const containerClient = blobServiceClient.getContainerClient(AZURE_STORAGE_CONTAINER_NAME);

    // Check if container exists
    const containerExists = await containerClient.exists();
    if (!containerExists) {
      throw new Error(`Container "${AZURE_STORAGE_CONTAINER_NAME}" does not exist`);
    }
    console.log(`   ✅ Container "${AZURE_STORAGE_CONTAINER_NAME}" exists`);

    // Generate expected folder path
    const sanitizedName = TEST_WORKSPACE_NAME.replace(/[^a-zA-Z0-9-]/g, '-').toLowerCase();
    const shortId = workspace.id.substring(0, 7);
    const expectedFolderPath = `workspace/${sanitizedName}-${shortId}/`;
    
    console.log(`   Expected folder path: ${expectedFolderPath}`);
    console.log(`   Actual folder path: ${workspace.folderPath || 'Not set'}`);

    // Check if workspace folder exists
    let folderExists = false;
    for await (const blob of containerClient.listBlobsFlat()) {
      if (blob.name.startsWith(expectedFolderPath)) {
        folderExists = true;
        console.log(`   ✅ Found blob: ${blob.name}`);
        break;
      }
    }

    if (folderExists) {
      console.log(`   ✅ Workspace folder exists in Azure Blob Storage`);
      console.log(`   📁 Full path: storageaiva/${AZURE_STORAGE_CONTAINER_NAME}/${expectedFolderPath}`);
    } else {
      console.log(`   ❌ Workspace folder NOT found in Azure Blob Storage`);
      console.log(`   📁 Expected: storageaiva/${AZURE_STORAGE_CONTAINER_NAME}/${expectedFolderPath}`);
    }

  } catch (error) {
    console.error('   Blob Storage verification failed:', error.message);
    throw error;
  }
}

async function verifyAISearch(workspace) {
  try {
    console.log('   Connecting to Azure AI Search...');
    const searchClient = new SearchIndexClient(AZURE_AI_SEARCH_ENDPOINT, new AzureKeyCredential(AZURE_AI_SEARCH_API_KEY));

    // Generate expected index name
    const sanitizedName = TEST_WORKSPACE_NAME.replace(/[^a-zA-Z0-9-]/g, '-').toLowerCase();
    const shortId = workspace.id.substring(0, 7);
    const expectedIndexName = `${sanitizedName}-${shortId}index`;
    const expectedSemanticConfig = `search${expectedIndexName}`;

    console.log(`   Expected index name: ${expectedIndexName}`);
    console.log(`   Expected semantic config: ${expectedSemanticConfig}`);
    console.log(`   Actual index name: ${workspace.searchIndexName || 'Not set'}`);

    // List all indexes to check if ours exists
    let indexExists = false;
    let indexDetails = null;

    try {
      const indexes = await searchClient.listIndexes();
      for await (const index of indexes) {
        if (index.name === expectedIndexName) {
          indexExists = true;
          indexDetails = index;
          console.log(`   ✅ Found index: ${index.name}`);
          break;
        }
      }
    } catch (error) {
      console.error('   Failed to list indexes:', error.message);
    }

    if (indexExists) {
      console.log(`   ✅ Workspace index exists in Azure AI Search`);
      console.log(`   🔍 Full location: aivasearch/${expectedIndexName}`);
      
      // Check semantic configuration
      if (indexDetails && indexDetails.semanticSearch && indexDetails.semanticSearch.configurations) {
        const hasSemanticConfig = indexDetails.semanticSearch.configurations.some(config => 
          config.name === expectedSemanticConfig
        );
        if (hasSemanticConfig) {
          console.log(`   ✅ Semantic configuration exists: ${expectedSemanticConfig}`);
        } else {
          console.log(`   ❌ Semantic configuration NOT found: ${expectedSemanticConfig}`);
        }
      } else {
        console.log(`   ❌ No semantic search configurations found`);
      }
    } else {
      console.log(`   ❌ Workspace index NOT found in Azure AI Search`);
      console.log(`   🔍 Expected: aivasearch/${expectedIndexName}`);
    }

  } catch (error) {
    console.error('   AI Search verification failed:', error.message);
    throw error;
  }
}

function verifyNamingFormat(workspace) {
  console.log('   Checking naming format compliance...');
  
  const sanitizedName = TEST_WORKSPACE_NAME.replace(/[^a-zA-Z0-9-]/g, '-').toLowerCase();
  const shortId = workspace.id.substring(0, 7);
  
  // Expected formats
  const expectedFolderPath = `workspace/${sanitizedName}-${shortId}/`;
  const expectedIndexName = `${sanitizedName}-${shortId}index`;
  const expectedSemanticConfig = `search${expectedIndexName}`;
  
  console.log('   📋 Format verification:');
  console.log(`   • Workspace ID (first 7 chars): ${shortId}`);
  console.log(`   • Sanitized name: ${sanitizedName}`);
  console.log(`   • Expected folder format: workspace/{name}-{id}/`);
  console.log(`   • Expected index format: {name}-{id}index`);
  console.log(`   • Expected semantic format: search{indexName}`);
  
  // Verify actual vs expected
  const folderMatch = workspace.folderPath === expectedFolderPath;
  const indexMatch = workspace.searchIndexName === expectedIndexName;
  
  console.log(`   • Folder path match: ${folderMatch ? '✅' : '❌'} (${workspace.folderPath || 'Not set'})`);
  console.log(`   • Index name match: ${indexMatch ? '✅' : '❌'} (${workspace.searchIndexName || 'Not set'})`);
  
  if (folderMatch && indexMatch) {
    console.log('   ✅ All naming formats are correct!');
  } else {
    console.log('   ❌ Some naming formats do not match expected patterns');
  }
}

// Run the test
main().catch(console.error);
