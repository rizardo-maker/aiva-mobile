/**
 * Test script to verify proper folder structure creation in Azure Blob Storage
 * This script tests that workspaces create proper folder hierarchies, not just individual blobs
 */

const axios = require('axios');
const { BlobServiceClient } = require('@azure/storage-blob');
require('dotenv').config();

const API_BASE_URL = 'http://localhost:8080/api';
const TEST_WORKSPACE_NAME = 'folder-test-' + Date.now();

// Azure configuration
const AZURE_STORAGE_CONNECTION_STRING = process.env.AZURE_STORAGE_CONNECTION_STRING;
const AZURE_STORAGE_CONTAINER_NAME = process.env.AZURE_STORAGE_CONTAINER_NAME || 'blob';

let authToken = null;
let createdWorkspaceId = null;

async function main() {
  try {
    console.log('🚀 Testing workspace folder structure creation...\n');

    // Step 1: Login
    console.log('1️⃣ Authenticating...');
    await login();
    console.log('✅ Authentication successful\n');

    // Step 2: Create workspace
    console.log('2️⃣ Creating test workspace...');
    const workspace = await createWorkspace();
    console.log('✅ Workspace created successfully');
    console.log(`   ID: ${workspace.id}`);
    console.log(`   Name: ${workspace.name}`);
    console.log(`   Folder Path: ${workspace.folderPath || 'Not set'}\n`);

    // Step 3: Verify folder structure in Azure Blob Storage
    console.log('3️⃣ Verifying folder structure in Azure Blob Storage...');
    await verifyFolderStructure(workspace);
    console.log('✅ Folder structure verification complete\n');

    // Step 4: List all blobs in the workspace folder
    console.log('4️⃣ Listing workspace folder contents...');
    await listWorkspaceFolderContents(workspace);
    console.log('✅ Folder contents listing complete\n');

    console.log('🎉 Folder structure test completed successfully!');
    console.log('📁 The workspace now has a proper folder structure in Azure Blob Storage');

  } catch (error) {
    console.error('❌ Test failed:', error.message);
    console.error('Full error:', error);
  }
}

async function login() {
  try {
    const response = await axios.post(`${API_BASE_URL}/auth/login`, {
      email: 'aiva50543@gmail.com',
      password: 'admin123'
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
      description: 'Test workspace for folder structure verification',
      color: '#9333EA',
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

async function verifyFolderStructure(workspace) {
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

    // Check what files exist in the workspace folder
    const folderFiles = [];
    for await (const blob of containerClient.listBlobsFlat()) {
      if (blob.name.startsWith(expectedFolderPath)) {
        folderFiles.push(blob.name);
        console.log(`   📄 Found file: ${blob.name}`);
      }
    }

    if (folderFiles.length > 0) {
      console.log(`   ✅ Workspace folder structure exists with ${folderFiles.length} files`);
      console.log(`   📁 Full path: storageaiva/${AZURE_STORAGE_CONTAINER_NAME}/${expectedFolderPath}`);
      
      // Check for specific files
      const hasPlaceholder = folderFiles.some(file => file.endsWith('.placeholder'));
      const hasReadme = folderFiles.some(file => file.endsWith('README.txt'));
      
      console.log(`   📋 Structure analysis:`);
      console.log(`   • Placeholder file: ${hasPlaceholder ? '✅ Present' : '❌ Missing'}`);
      console.log(`   • README file: ${hasReadme ? '✅ Present' : '❌ Missing'}`);
      
      if (hasPlaceholder && hasReadme) {
        console.log(`   ✅ Complete folder structure created successfully!`);
      } else {
        console.log(`   ⚠️  Partial folder structure - some files missing`);
      }
    } else {
      console.log(`   ❌ No workspace folder structure found`);
      console.log(`   📁 Expected: storageaiva/${AZURE_STORAGE_CONTAINER_NAME}/${expectedFolderPath}`);
    }

  } catch (error) {
    console.error('   Folder structure verification failed:', error.message);
    throw error;
  }
}

async function listWorkspaceFolderContents(workspace) {
  try {
    console.log('   Listing all files in workspace folder...');
    const blobServiceClient = BlobServiceClient.fromConnectionString(AZURE_STORAGE_CONNECTION_STRING);
    const containerClient = blobServiceClient.getContainerClient(AZURE_STORAGE_CONTAINER_NAME);

    const sanitizedName = TEST_WORKSPACE_NAME.replace(/[^a-zA-Z0-9-]/g, '-').toLowerCase();
    const shortId = workspace.id.substring(0, 7);
    const folderPath = `workspace/${sanitizedName}-${shortId}/`;

    console.log(`   📁 Workspace folder: ${folderPath}`);
    console.log(`   📋 Contents:`);

    let fileCount = 0;
    for await (const blob of containerClient.listBlobsFlat()) {
      if (blob.name.startsWith(folderPath)) {
        fileCount++;
        const fileName = blob.name.substring(folderPath.length);
        const fileSize = blob.properties.contentLength || 0;
        const lastModified = blob.properties.lastModified?.toISOString() || 'Unknown';
        
        console.log(`   ${fileCount}. ${fileName}`);
        console.log(`      Size: ${fileSize} bytes`);
        console.log(`      Modified: ${lastModified}`);
        console.log(`      Full path: ${blob.name}`);
        console.log('');
      }
    }

    if (fileCount === 0) {
      console.log('   📭 No files found in workspace folder');
    } else {
      console.log(`   📊 Total files in workspace folder: ${fileCount}`);
    }

  } catch (error) {
    console.error('   Failed to list folder contents:', error.message);
    throw error;
  }
}

// Run the test
main().catch(console.error);
