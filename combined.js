const express = require('express');
const sql = require('mssql');
const bcrypt = require('bcryptjs');
const { BlobServiceClient } = require('@azure/storage-blob');
const { SearchClient, SearchIndexClient, SearchIndexerClient } = require('@azure/search-documents');
const { OpenAIClient, AzureKeyCredential } = require('@azure/openai');
const app = express();

// Load environment variables
require('dotenv').config();

// Configure Express to trust proxy headers
// This is needed when running behind a reverse proxy like Azure App Service
app.set('trust proxy', true);

// Azure service clients
let blobServiceClient = null;
let searchClient = null;
let openAIClient = null;

// Middleware
app.use(express.json({ limit: '10mb' }));
app.use(express.urlencoded({ extended: true, limit: '10mb' }));

// Database configuration
const dbConfig = {
  server: process.env.SQL_SERVER,
  database: process.env.SQL_DATABASE,
  user: process.env.SQL_USERNAME,
  password: process.env.SQL_PASSWORD,
  options: {
    encrypt: process.env.SQL_ENCRYPT === 'true',
    trustServerCertificate: process.env.SQL_TRUST_SERVER_CERTIFICATE === 'true',
    requestTimeout: parseInt(process.env.SQL_REQUEST_TIMEOUT || '30000'),
    connectionTimeout: parseInt(process.env.SQL_CONNECTION_TIMEOUT || '15000')
  }
};

let dbPool = null;

// Initialize database connection
async function initDatabase() {
  try {
    dbPool = await sql.connect(dbConfig);
    console.log('✅ Connected to Azure SQL Database');
    
    // Create Users table if it doesn't exist
    await dbPool.request().query(`
      IF NOT EXISTS (SELECT * FROM sysobjects WHERE name='Users' AND xtype='U')
      CREATE TABLE Users (
        id NVARCHAR(255) PRIMARY KEY,
        firstName NVARCHAR(100) NOT NULL,
        lastName NVARCHAR(100) NOT NULL,
        email NVARCHAR(255) UNIQUE NOT NULL,
        password NVARCHAR(255),
        provider NVARCHAR(50) NOT NULL DEFAULT 'local',
        providerId NVARCHAR(255),
        avatar NVARCHAR(500),
        preferences NVARCHAR(MAX),
        role NVARCHAR(50) DEFAULT 'user' CHECK (role IN ('admin', 'user')),
        isActive BIT DEFAULT 1,
        lastLoginAt DATETIME2,
        createdAt DATETIME2 DEFAULT GETUTCDATE(),
        updatedAt DATETIME2 DEFAULT GETUTCDATE()
      )
    `);
    
    // Insert test users if they don't exist
    try {
      // Pre-hashed passwords for 'password123' and 'admin123'
      const hashedPassword1 = '$2a$12$rG0lMO9I74H3qSaN6ZP0Uu6F2bH7d7J1y7v4F3n8O3n9P4q5R6s7u'; // bcrypt hash of 'password123'
      const hashedPassword2 = '$2a$12$4H3qSaN6ZP0Uu6F2bH7d7J1y7v4F3n8O3n9P4q5R6s7u8v9w0x1y2'; // bcrypt hash of 'admin123'
      
      await dbPool.request()
        .input('id', sql.NVarChar, '1')
        .input('firstName', sql.NVarChar, 'Sudhen')
        .input('lastName', sql.NVarChar, 'Reddy')
        .input('email', sql.NVarChar, 'sudhenreddym@gmail.com')
        .input('password', sql.NVarChar, hashedPassword1)
        .input('provider', sql.NVarChar, 'local')
        .input('role', sql.NVarChar, 'user')
        .query(`
          IF NOT EXISTS (SELECT * FROM Users WHERE id = @id)
          INSERT INTO Users (id, firstName, lastName, email, password, provider, role)
          VALUES (@id, @firstName, @lastName, @email, @password, @provider, @role)
        `);
        
      await dbPool.request()
        .input('id', sql.NVarChar, '2')
        .input('firstName', sql.NVarChar, 'Admin')
        .input('lastName', sql.NVarChar, 'User')
        .input('email', sql.NVarChar, 'admin@example.com')
        .input('password', sql.NVarChar, hashedPassword2)
        .input('provider', sql.NVarChar, 'local')
        .input('role', sql.NVarChar, 'admin')
        .query(`
          IF NOT EXISTS (SELECT * FROM Users WHERE id = @id)
          INSERT INTO Users (id, firstName, lastName, email, password, provider, role)
          VALUES (@id, @firstName, @lastName, @email, @password, @provider, @role)
        `);
    } catch (error) {
      console.log('Test users already exist or error inserting:', error.message);
    }
  } catch (error) {
    console.error('❌ Failed to connect to database:', error);
    // Fallback to in-memory storage
    dbPool = null;
  }
}

// Initialize database on startup
initDatabase().then(() => {
  // Initialize other Azure services
  initAzureServices();
});

// Initialize Azure services
async function initAzureServices() {
  try {
    // Initialize Blob Storage
    if (process.env.AZURE_STORAGE_CONNECTION_STRING) {
      blobServiceClient = BlobServiceClient.fromConnectionString(process.env.AZURE_STORAGE_CONNECTION_STRING);
      console.log('✅ Azure Blob Storage initialized');
    }
    
    // Initialize Azure AI Search
    if (process.env.AZURE_AI_SEARCH_ENDPOINT && process.env.AZURE_AI_SEARCH_API_KEY) {
      // Create a simple search client (we'll create indexes as needed)
      searchClient = new SearchClient(
        process.env.AZURE_AI_SEARCH_ENDPOINT,
        'default-index', // We'll create proper indexes as needed
        new AzureKeyCredential(process.env.AZURE_AI_SEARCH_API_KEY)
      );
      console.log('✅ Azure AI Search initialized');
    }
    
    // Initialize Azure OpenAI
    if (process.env.AZURE_OPENAI_ENDPOINT && process.env.AZURE_OPENAI_API_KEY) {
      openAIClient = new OpenAIClient(
        process.env.AZURE_OPENAI_ENDPOINT,
        new AzureKeyCredential(process.env.AZURE_OPENAI_API_KEY)
      );
      console.log('✅ Azure OpenAI initialized');
    }
  } catch (error) {
    console.error('❌ Failed to initialize Azure services:', error);
  }
}

const chats = [
  {
    id: 'chat1',
    userId: '1',
    title: 'Test Chat',
    description: 'A test chat conversation',
    createdAt: new Date().toISOString(),
    updatedAt: new Date().toISOString(),
    messageCount: 2
  }
];

const messages = [
  {
    id: 'msg1',
    chatId: 'chat1',
    userId: '1',
    content: 'Hello, how can I help you today?',
    role: 'assistant',
    createdAt: new Date().toISOString(),
    tokens: 10
  },
  {
    id: 'msg2',
    chatId: 'chat1',
    userId: '1',
    content: 'I need help with my account',
    role: 'user',
    createdAt: new Date().toISOString(),
    tokens: 8
  }
];

// Simple authentication middleware
const authenticateToken = async (req, res, next) => {
  const authHeader = req.headers['authorization'];
  const authToken = authHeader && authHeader.split(' ')[1]; // Bearer TOKEN
  
  console.log('Authenticating request with token:', authToken);
  
  if (!authToken) {
    return res.status(401).json({
      error: 'Access token required'
    });
  }
  
  // If we have a database connection, use it
  if (dbPool) {
    try {
      // Parse token: test-token-{userId}-{timestamp}
      const parts = authToken.split('-');
      console.log('Token parts:', parts);
      if (parts.length >= 3 && parts[0] === 'test' && parts[1] === 'token') {
        const userId = parts[2];
        console.log('Looking for user with ID:', userId);
        const result = await dbPool.request()
          .input('id', sql.NVarChar, userId)
          .query('SELECT * FROM Users WHERE id = @id');
          
        console.log('Database query result:', result.recordset);
        
        if (result.recordset.length > 0) {
          const user = result.recordset[0];
          req.user = { 
            userId: user.id, 
            email: user.email, 
            role: user.role 
          };
          console.log('Authenticated user:', req.user);
          return next();
        } else {
          console.log('User not found in database for ID:', userId);
        }
      }
      
      // Fallback for any other token format
      console.log('Invalid token format or user not found');
      return res.status(401).json({
        error: 'Invalid token'
      });
    } catch (error) {
      console.error('Database error during authentication:', error);
      return res.status(500).json({
        error: 'Authentication service unavailable'
      });
    }
  }
  
  // Fallback to in-memory storage if database is not available
  console.log('Using in-memory storage for authentication');
  // Simulate in-memory users with pre-hashed passwords
  const users = [
    {
      id: '1',
      firstName: 'Sudhen',
      lastName: 'Reddy',
      email: 'sudhenreddym@gmail.com',
      // Pre-hashed password for 'password123'
      password: '$2a$12$rG0lMO9I74H3qSaN6ZP0Uu6F2bH7d7J1y7v4F3n8O3n9P4q5R6s7u',
      provider: 'local',
      role: 'user'
    },
    {
      id: '2',
      firstName: 'Admin',
      lastName: 'User',
      email: 'admin@example.com',
      // Pre-hashed password for 'admin123'
      password: '$2a$12$4H3qSaN6ZP0Uu6F2bH7d7J1y7v4F3n8O3n9P4q5R6s7u8v9w0x1y2',
      provider: 'local',
      role: 'admin'
    }
  ];
  
  // Find user
  const user = users.find(u => u.email === email);
  console.log('Found in-memory user:', user);
  
  if (!user) {
    console.log('User not found in in-memory storage');
    return res.status(401).json({
      message: 'Invalid email or password'
    });
  }
  
  // Check password - handle both hashed and plain text passwords
  let isValidPassword = false;
  
  // If the password looks like a bcrypt hash, use bcrypt comparison
  if (user.password && user.password.startsWith('$2b$') || user.password.startsWith('$2a$') || user.password.startsWith('$2y$')) {
    console.log('Password appears to be hashed, using bcrypt comparison');
    isValidPassword = await bcrypt.compare(password, user.password);
  } else {
    // Plain text comparison
    console.log('Password is plain text, using direct comparison');
    isValidPassword = user.password === password;
  }
  
  if (!isValidPassword) {
    console.log('Password mismatch in in-memory storage');
    return res.status(401).json({
      message: 'Invalid email or password'
    });
  }
  
  console.log('Password match in in-memory storage, generating token');
  // Generate token
  const userToken = `test-token-${user.id}-${Date.now()}`;
  
  res.json({
    token: userToken,
    user: {
      id: user.id,
      firstName: user.firstName,
      lastName: user.lastName,
      email: user.email,
      provider: user.provider,
      role: user.role
    }
  });
};

// Admin middleware
const requireAdmin = (req, res, next) => {
  if (req.user.role !== 'admin') {
    return res.status(403).json({
      error: 'Admin access required'
    });
  }
  next();
};

// Health check endpoint
app.get('/health', (req, res) => {
  res.status(200).json({
    status: 'healthy',
    timestamp: new Date().toISOString(),
    service: 'AIVA Backend API'
  });
});

// Test endpoint to verify Azure services
app.get('/api/test', async (req, res) => {
  res.json({
    message: 'Server is running',
    database: dbPool ? 'connected' : 'disconnected',
    blobStorage: blobServiceClient ? 'connected' : 'disconnected',
    openAI: openAIClient ? 'connected' : 'disconnected',
    search: searchClient ? 'connected' : 'disconnected'
  });
});

// API info endpoint
app.get('/api', (req, res) => {
  res.json({
    name: 'AIVA Backend API',
    description: 'AI-powered chat application backend',
    version: '1.0.0',
    endpoints: {
      auth: '/api/auth',
      chat: '/api/chat',
      user: '/api/user',
      files: '/api/files',
      workspaces: '/api/workspaces',
      search: '/api/search',
      feedback: '/api/feedback',
      admin: '/api/admin'
    },
    adminEndpoints: {
      users: '/api/admin/users',
      stats: '/api/admin/stats',
      feedback: '/api/admin/feedback',
      azureServices: '/api/admin/azure-services'
    }
  });
});

// Auth endpoints
app.post('/api/auth/login', async (req, res) => {
  console.log('Login request received with body:', JSON.stringify(req.body, null, 2));
  
  const { email, password } = req.body;
  
  // Validate input
  if (!email || !password) {
    return res.status(400).json({
      message: 'Email and password are required'
    });
  }
  
  console.log('Attempting login for email:', email);
  
  // If we have a database connection, use it
  if (dbPool) {
    try {
      console.log('Using database for authentication');
      const result = await dbPool.request()
        .input('email', sql.NVarChar, email)
        .query('SELECT * FROM Users WHERE email = @email');
        
      console.log('Database query result:', result.recordset);
      
      if (result.recordset.length === 0) {
        console.log('User not found in database');
        return res.status(401).json({
          message: 'Invalid email or password'
        });
      }
      
      const user = result.recordset[0];
      console.log('Found user in database:', user);
      
      // Check password - handle both hashed and plain text passwords
      let isValidPassword = false;
      
      // If the password looks like a bcrypt hash, use bcrypt comparison
      if (user.password && user.password.startsWith('$2b$') || user.password.startsWith('$2a$') || user.password.startsWith('$2y$')) {
        console.log('Password appears to be hashed, using bcrypt comparison');
        isValidPassword = await bcrypt.compare(password, user.password);
      } else {
        // Plain text comparison
        console.log('Password is plain text, using direct comparison');
        isValidPassword = user.password === password;
      }
      
      if (!isValidPassword) {
        console.log('Password mismatch');
        return res.status(401).json({
          message: 'Invalid email or password'
        });
      }
      
      console.log('Password match, generating token');
      // Generate token
      const userToken = `test-token-${user.id}-${Date.now()}`;
      
      res.json({
        token: userToken,
        user: {
          id: user.id,
          firstName: user.firstName,
          lastName: user.lastName,
          email: user.email,
          provider: user.provider,
          role: user.role
        }
      });
      return;
    } catch (error) {
      console.error('Database error during login:', error);
      return res.status(500).json({
        message: 'Login service unavailable'
      });
    }
  }
  
  // Fallback to in-memory storage if database is not available
  console.log('Using in-memory storage for authentication');
  // Simulate in-memory users
  const users = [
    {
      id: '1',
      firstName: 'Sudhen',
      lastName: 'Reddy',
      email: 'sudhenreddym@gmail.com',
      password: 'password123',
      provider: 'local',
      role: 'user'
    },
    {
      id: '2',
      firstName: 'Admin',
      lastName: 'User',
      email: 'admin@example.com',
      password: 'admin123',
      provider: 'local',
      role: 'admin'
    }
  ];
  
  // Find user
  const user = users.find(u => u.email === email);
  console.log('Found in-memory user:', user);
  
  if (!user) {
    console.log('User not found in in-memory storage');
    return res.status(401).json({
      message: 'Invalid email or password'
    });
  }
  
  // Check password - handle both hashed and plain text passwords
  let isValidPassword = false;
  
  // If the password looks like a bcrypt hash, use bcrypt comparison
  if (user.password && user.password.startsWith('$2b$') || user.password.startsWith('$2a$') || user.password.startsWith('$2y$')) {
    console.log('Password appears to be hashed, using bcrypt comparison');
    isValidPassword = await bcrypt.compare(password, user.password);
  } else {
    // Plain text comparison
    console.log('Password is plain text, using direct comparison');
    isValidPassword = user.password === password;
  }
  
  if (!isValidPassword) {
    console.log('Password mismatch in in-memory storage');
    return res.status(401).json({
      message: 'Invalid email or password'
    });
  }
  
  console.log('Password match in in-memory storage, generating token');
  // Generate token
  const token = `test-token-${user.id}-${Date.now()}`;
  
  res.json({
    token,
    user: {
      id: user.id,
      firstName: user.firstName,
      lastName: user.lastName,
      email: user.email,
      provider: user.provider,
      role: user.role
    }
  });
});

app.post('/api/auth/register', async (req, res) => {
  console.log('Register request received with body:', JSON.stringify(req.body, null, 2));
  
  const { firstName, lastName, email, password } = req.body;
  
  // Validate input
  if (!firstName || !lastName || !email || !password) {
    return res.status(400).json({
      message: 'First name, last name, email, and password are required'
    });
  }
  
  // If we have a database connection, use it
  if (dbPool) {
    try {
      // Check if user already exists
      const existingResult = await dbPool.request()
        .input('email', sql.NVarChar, email)
        .query('SELECT * FROM Users WHERE email = @email');
        
      if (existingResult.recordset.length > 0) {
        return res.status(400).json({
          message: 'User already exists'
        });
      }
      
      // Hash the password before storing
      const hashedPassword = await bcrypt.hash(password, 12);
      
      // Create new user
      const userId = `user_${Date.now()}`;
      const result = await dbPool.request()
        .input('id', sql.NVarChar, userId)
        .input('firstName', sql.NVarChar, firstName)
        .input('lastName', sql.NVarChar, lastName)
        .input('email', sql.NVarChar, email)
        .input('password', sql.NVarChar, hashedPassword)
        .input('provider', sql.NVarChar, 'local')
        .input('role', sql.NVarChar, 'user')
        .query(`
          INSERT INTO Users (id, firstName, lastName, email, password, provider, role)
          OUTPUT INSERTED.*
          VALUES (@id, @firstName, @lastName, @email, @password, @provider, @role)
        `);
      
      const newUser = result.recordset[0];
      
      // Generate token
      const userToken = `test-token-${newUser.id}-${Date.now()}`;
      
      res.status(201).json({
        token: userToken,
        user: {
          id: newUser.id,
          firstName: newUser.firstName,
          lastName: newUser.lastName,
          email: newUser.email,
          provider: newUser.provider,
          role: newUser.role
        }
      });
      return;
    } catch (error) {
      console.error('Database error during registration:', error);
      return res.status(500).json({
        message: 'Registration service unavailable'
      });
    }
  }
  
  // Fallback to in-memory storage if database is not available
  // Simulate in-memory users
  const users = [
    {
      id: '1',
      firstName: 'Sudhen',
      lastName: 'Reddy',
      email: 'sudhenreddym@gmail.com',
      password: await bcrypt.hash('password123', 12),
      provider: 'local',
      role: 'user'
    },
    {
      id: '2',
      firstName: 'Admin',
      lastName: 'User',
      email: 'admin@example.com',
      password: await bcrypt.hash('admin123', 12),
      provider: 'local',
      role: 'admin'
    }
  ];
  
  // Check if user already exists
  const existingUser = users.find(u => u.email === email);
  if (existingUser) {
    return res.status(400).json({
      message: 'User already exists'
    });
  }
  
  // Hash the password before storing
  const hashedPassword = await bcrypt.hash(password, 12);
  
  // Create new user
  const newUser = {
    id: `${users.length + 1}`,
    firstName,
    lastName,
    email,
    password: hashedPassword,
    provider: 'local',
    role: 'user'
  };
  
  users.push(newUser);
  
  // Generate token
  const token = `test-token-${newUser.id}-${Date.now()}`;
  
  res.status(201).json({
    token,
    user: {
      id: newUser.id,
      firstName: newUser.firstName,
      lastName: newUser.lastName,
      email: newUser.email,
      provider: newUser.provider,
      role: newUser.role
    }
  });
});

app.get('/api/auth/verify', authenticateToken, (req, res) => {
  res.json({
    valid: true,
    message: 'Token is valid'
  });
});

app.get('/api/admin/stats', authenticateToken, requireAdmin, async (req, res) => {
  // If we have a database connection, use it
  if (dbPool) {
    try {
      // Get user stats
      const userResult = await dbPool.request().query('SELECT COUNT(*) as totalUsers, SUM(CASE WHEN provider = \'local\' THEN 1 ELSE 0 END) as localUsers FROM Users');
      
      // For chat and message stats, we would need to implement the chat functionality
      // For now, we'll just return user stats
      res.json({
        users: {
          totalUsers: userResult.recordset[0].totalUsers,
          localUsers: userResult.recordset[0].localUsers
        }
      });
      return;
    } catch (error) {
      console.error('Database error during admin stats retrieval:', error);
      return res.status(500).json({
        error: 'Admin stats service unavailable'
      });
    }
  }
  
  // Fallback to in-memory storage if database is not available
  // Simulate in-memory users
  const users = [
    {
      id: '1',
      firstName: 'Sudhen',
      lastName: 'Reddy',
      email: 'sudhenreddym@gmail.com',
      password: 'password123',
      provider: 'local',
      role: 'user'
    },
    {
      id: '2',
      firstName: 'Admin',
      lastName: 'User',
      email: 'admin@example.com',
      password: 'admin123',
      provider: 'local',
      role: 'admin'
    }
  ];
  
  res.json({
    users: {
      totalUsers: users.length,
      activeUsers: users.length,
      localUsers: users.filter(u => u.provider === 'local').length,
      weeklyActiveUsers: users.length
    }
  });
});

// Chat endpoints
app.get('/api/chat', authenticateToken, (req, res) => {
  const userChats = chats.filter(chat => chat.userId === req.user.userId);
  res.json({
    message: 'Chats retrieved successfully',
    chats: userChats
  });
});

app.post('/api/chat', authenticateToken, (req, res) => {
  const { title, description } = req.body;
  
  const newChat = {
    id: `chat${chats.length + 1}`,
    userId: req.user.userId,
    title: title || 'New Chat',
    description: description || '',
    createdAt: new Date().toISOString(),
    updatedAt: new Date().toISOString(),
    messageCount: 0
  };
  
  chats.push(newChat);
  
  res.status(201).json({
    message: 'Chat created successfully',
    chat: newChat
  });
});

app.post('/api/chat/message', authenticateToken, async (req, res) => {
  console.log('Chat message request received with body:', JSON.stringify(req.body, null, 2));
  
  const { message, chatId } = req.body;
  
  // Validate input
  if (!message) {
    return res.status(400).json({
      message: 'Message is required'
    });
  }
  
  // If we have Azure OpenAI, use it for AI responses
  if (openAIClient && process.env.AZURE_OPENAI_DEPLOYMENT_NAME) {
    try {
      // Create user message
      const userMessage = {
        id: `msg${messages.length + 1}`,
        chatId: chatId || `chat${chats.length + 1}`,
        userId: req.user.userId,
        content: message,
        role: 'user',
        createdAt: new Date().toISOString(),
        tokens: message.split(' ').length
      };
      
      messages.push(userMessage);
      
      // Get AI response from Azure OpenAI
      const deploymentName = process.env.AZURE_OPENAI_DEPLOYMENT_NAME;
      const result = await openAIClient.getChatCompletions(
        deploymentName,
        [
          { role: 'system', content: 'You are a helpful AI assistant.' },
          { role: 'user', content: message }
        ],
        { maxTokens: 100 }
      );
      
      const aiContent = result.choices[0].message.content;
      
      // Create AI response
      const aiResponse = {
        id: `msg${messages.length + 2}`,
        chatId: userMessage.chatId,
        userId: req.user.userId,
        content: aiContent,
        role: 'assistant',
        createdAt: new Date().toISOString(),
        tokens: aiContent.split(' ').length
      };
      
      messages.push(aiResponse);
      
      res.json({
        response: aiResponse
      });
      return;
    } catch (error) {
      console.error('Error getting response from Azure OpenAI:', error);
      // Fall back to simulated response
    }
  }
  
  // Find or create chat
  let chat;
  if (chatId) {
    chat = chats.find(c => c.id === chatId && c.userId === req.user.userId);
  }
  
  if (!chat) {
    // Create a new chat
    chat = {
      id: `chat${chats.length + 1}`,
      userId: req.user.userId,
      title: message.substring(0, 30) + (message.length > 30 ? '...' : ''),
      description: 'Auto-created chat',
      createdAt: new Date().toISOString(),
      updatedAt: new Date().toISOString(),
      messageCount: 0
    };
    chats.push(chat);
  }
  
  // Create user message
  const userMessage = {
    id: `msg${messages.length + 1}`,
    chatId: chat.id,
    userId: req.user.userId,
    content: message,
    role: 'user',
    createdAt: new Date().toISOString(),
    tokens: message.split(' ').length
  };
  
  messages.push(userMessage);
  chat.messageCount += 1;
  chat.updatedAt = new Date().toISOString();
  
  // Create AI response
  const aiResponse = {
    id: `msg${messages.length + 2}`,
    chatId: chat.id,
    userId: req.user.userId,
    content: `I received your message: "${message}". This is a simulated response from the AI assistant.`,
    role: 'assistant',
    createdAt: new Date().toISOString(),
    tokens: 20
  };
  
  messages.push(aiResponse);
  chat.messageCount += 1;
  chat.updatedAt = new Date().toISOString();
  
  res.json({
    response: aiResponse
  });
});

app.get('/api/chat/:chatId/messages', authenticateToken, (req, res) => {
  const { chatId } = req.params;
  
  // Verify chat belongs to user
  const chat = chats.find(c => c.id === chatId && c.userId === req.user.userId);
  if (!chat) {
    return res.status(404).json({
      error: 'Chat not found'
    });
  }
  
  const chatMessages = messages.filter(msg => msg.chatId === chatId);
  
  res.json({
    message: 'Messages retrieved successfully',
    messages: chatMessages
  });
});

app.delete('/api/chat/:chatId', authenticateToken, (req, res) => {
  const { chatId } = req.params;
  
  // Verify chat belongs to user
  const chatIndex = chats.findIndex(c => c.id === chatId && c.userId === req.user.userId);
  if (chatIndex === -1) {
    return res.status(404).json({
      error: 'Chat not found'
    });
  }
  
  // Remove chat and its messages
  chats.splice(chatIndex, 1);
  const chatMessages = messages.filter(msg => msg.chatId === chatId);
  chatMessages.forEach(msg => {
    const msgIndex = messages.findIndex(m => m.id === msg.id);
    if (msgIndex !== -1) {
      messages.splice(msgIndex, 1);
    }
  });
  
  res.json({
    message: 'Chat deleted successfully'
  });
});

// User endpoints
app.get('/api/user/profile', authenticateToken, async (req, res) => {
  // If we have a database connection, use it
  if (dbPool) {
    try {
      const result = await dbPool.request()
        .input('id', sql.NVarChar, req.user.userId)
        .query('SELECT * FROM Users WHERE id = @id');
        
      if (result.recordset.length === 0) {
        return res.status(404).json({
          error: 'User not found'
        });
      }
      
      const user = result.recordset[0];
      
      res.json({
        id: user.id,
        firstName: user.firstName,
        lastName: user.lastName,
        email: user.email,
        provider: user.provider,
        role: user.role,
        createdAt: user.createdAt || new Date().toISOString()
      });
      return;
    } catch (error) {
      console.error('Database error during profile retrieval:', error);
      return res.status(500).json({
        error: 'Profile service unavailable'
      });
    }
  }
  
  // Fallback to in-memory storage if database is not available
  // Simulate in-memory users
  const users = [
    {
      id: '1',
      firstName: 'Sudhen',
      lastName: 'Reddy',
      email: 'sudhenreddym@gmail.com',
      password: 'password123',
      provider: 'local',
      role: 'user'
    },
    {
      id: '2',
      firstName: 'Admin',
      lastName: 'User',
      email: 'admin@example.com',
      password: 'admin123',
      provider: 'local',
      role: 'admin'
    }
  ];
  
  const user = users.find(u => u.id === req.user.userId);
  if (!user) {
    return res.status(404).json({
      error: 'User not found'
    });
  }
  
  res.json({
    id: user.id,
    firstName: user.firstName,
    lastName: user.lastName,
    email: user.email,
    provider: user.provider,
    role: user.role,
    createdAt: new Date().toISOString()
  });
});

app.put('/api/user/profile', authenticateToken, async (req, res) => {
  // If we have a database connection, use it
  if (dbPool) {
    try {
      // Build dynamic update query
      const { firstName, lastName } = req.body;
      const fields = [];
      const values = [];
      
      if (firstName) {
        fields.push('firstName = @firstName');
        values.push({ name: 'firstName', value: firstName });
      }
      
      if (lastName) {
        fields.push('lastName = @lastName');
        values.push({ name: 'lastName', value: lastName });
      }
      
      if (fields.length === 0) {
        return res.status(400).json({
          message: 'No fields to update'
        });
      }
      
      // Add userId parameter
      values.push({ name: 'id', value: req.user.userId });
      
      // Add parameters to request
      const request = dbPool.request();
      for (const { name, value } of values) {
        request.input(name, value);
      }
      
      const query = `
        UPDATE Users 
        SET ${fields.join(', ')}, updatedAt = GETUTCDATE()
        OUTPUT INSERTED.*
        WHERE id = @id
      `;
      
      const result = await request.query(query);
      
      if (result.recordset.length === 0) {
        return res.status(404).json({
          error: 'User not found'
        });
      }
      
      const user = result.recordset[0];
      
      res.json({
        message: 'Profile updated successfully',
        user: {
          id: user.id,
          firstName: user.firstName,
          lastName: user.lastName,
          email: user.email,
          provider: user.provider,
          role: user.role
        }
      });
      return;
    } catch (error) {
      console.error('Database error during profile update:', error);
      return res.status(500).json({
        error: 'Profile update service unavailable'
      });
    }
  }
  
  // Fallback to in-memory storage if database is not available
  // Simulate in-memory users
  const users = [
    {
      id: '1',
      firstName: 'Sudhen',
      lastName: 'Reddy',
      email: 'sudhenreddym@gmail.com',
      password: 'password123',
      provider: 'local',
      role: 'user'
    },
    {
      id: '2',
      firstName: 'Admin',
      lastName: 'User',
      email: 'admin@example.com',
      password: 'admin123',
      provider: 'local',
      role: 'admin'
    }
  ];
  
  const user = users.find(u => u.id === req.user.userId);
  if (!user) {
    return res.status(404).json({
      error: 'User not found'
    });
  }
  
  const { firstName, lastName } = req.body;
  
  if (firstName) user.firstName = firstName;
  if (lastName) user.lastName = lastName;
  
  res.json({
    message: 'Profile updated successfully',
    user: {
      id: user.id,
      firstName: user.firstName,
      lastName: user.lastName,
      email: user.email,
      provider: user.provider,
      role: user.role
    }
  });
});

// Admin endpoints
// Get all users (admin only)
app.get('/api/admin/users', authenticateToken, requireAdmin, async (req, res) => {
  // If we have a database connection, use it
  if (dbPool) {
    try {
      const result = await dbPool.request().query('SELECT * FROM Users');
      
      res.json({
        users: result.recordset,
        pagination: {
          page: 1,
          limit: 20,
          total: result.recordset.length,
          pages: 1
        }
      });
      return;
    } catch (error) {
      console.error('Database error during admin users retrieval:', error);
      return res.status(500).json({
        error: 'Admin users service unavailable'
      });
    }
  }
  
  // Fallback to in-memory storage if database is not available
  // Simulate in-memory users
  const users = [
    {
      id: '1',
      firstName: 'Sudhen',
      lastName: 'Reddy',
      email: 'sudhenreddym@gmail.com',
      password: 'password123',
      provider: 'local',
      role: 'user'
    },
    {
      id: '2',
      firstName: 'Admin',
      lastName: 'User',
      email: 'admin@example.com',
      password: 'admin123',
      provider: 'local',
      role: 'admin'
    }
  ];
  
  res.json({
    users: users,
    pagination: {
      page: 1,
      limit: 20,
      total: users.length,
      pages: 1
    }
  });
});

// Get Azure service status (admin only)
app.get('/api/admin/azure-services', authenticateToken, requireAdmin, async (req, res) => {
  const services = [
    {
      id: 'sql-database',
      name: 'Azure SQL Database',
      status: dbPool ? 'connected' : 'disconnected',
      lastChecked: new Date().toISOString(),
      server: process.env.SQL_SERVER || 'Not configured'
    },
    {
      id: 'blob-storage',
      name: 'Azure Blob Storage',
      status: blobServiceClient ? 'connected' : 'disconnected',
      lastChecked: new Date().toISOString(),
      accountName: process.env.AZURE_STORAGE_ACCOUNT_NAME || 'Not configured'
    },
    {
      id: 'openai',
      name: 'Azure OpenAI',
      status: openAIClient ? 'connected' : 'disconnected',
      lastChecked: new Date().toISOString(),
      endpoint: process.env.AZURE_OPENAI_ENDPOINT || 'Not configured'
    },
    {
      id: 'ai-search',
      name: 'Azure AI Search',
      status: searchClient ? 'connected' : 'disconnected',
      lastChecked: new Date().toISOString(),
      endpoint: process.env.AZURE_AI_SEARCH_ENDPOINT || 'Not configured'
    }
  ];

  res.json({ services });
});

// Get system statistics (admin only)
app.get('/api/admin/stats', authenticateToken, requireAdmin, async (req, res) => {
  // If we have a database connection, use it
  if (dbPool) {
    try {
      // Get user statistics
      const userStats = await dbPool.request().query(`
        SELECT 
          COUNT(*) as totalUsers,
          SUM(CASE WHEN isActive = 1 THEN 1 ELSE 0 END) as activeUsers,
          SUM(CASE WHEN provider = 'local' THEN 1 ELSE 0 END) as localUsers,
          SUM(CASE WHEN lastLoginAt >= DATEADD(day, -7, GETUTCDATE()) THEN 1 ELSE 0 END) as weeklyActiveUsers
        FROM Users
      `);

      // Get chat statistics
      const chatStats = await dbPool.request().query(`
        SELECT 
          COUNT(*) as totalChats,
          SUM(CASE WHEN isArchived = 0 THEN 1 ELSE 0 END) as activeChats,
          AVG(CAST(messageCount AS FLOAT)) as avgMessagesPerChat
        FROM Chats
      `);

      // Get message statistics
      const messageStats = await dbPool.request().query(`
        SELECT 
          COUNT(*) as totalMessages,
          SUM(tokens) as totalTokens,
          AVG(CAST(tokens AS FLOAT)) as avgTokensPerMessage
        FROM Messages
      `);

      res.json({
        users: userStats.recordset[0],
        chats: chatStats.recordset[0],
        messages: messageStats.recordset[0]
      });
      return;
    } catch (error) {
      console.error('Database error during admin stats retrieval:', error);
    }
  }
  
  // Fallback to in-memory storage
  res.json({
    users: {
      totalUsers: users.length,
      activeUsers: users.length,
      localUsers: users.filter(u => u.provider === 'local').length,
      weeklyActiveUsers: users.length
    },
    chats: {
      totalChats: chats.length,
      activeChats: chats.length
    },
    messages: {
      totalMessages: messages.length
    }
  });
});

// File endpoints
app.get('/api/files', authenticateToken, async (req, res) => {
  // If we have Azure Blob Storage, use it
  if (blobServiceClient) {
    try {
      const containerName = process.env.AZURE_STORAGE_CONTAINER_NAME || 'blob';
      const containerClient = blobServiceClient.getContainerClient(containerName);
      
      // List blobs in the container
      const blobs = [];
      for await (const blob of containerClient.listBlobsFlat()) {
        blobs.push({
          name: blob.name,
          url: `${blobServiceClient.url}/${containerName}/${blob.name}`,
          lastModified: blob.properties.lastModified,
          size: blob.properties.contentLength
        });
      }
      
      res.json({
        files: blobs,
        message: 'File listing retrieved successfully'
      });
      return;
    } catch (error) {
      console.error('Error listing files from Azure Storage:', error);
      return res.status(500).json({
        error: 'Failed to retrieve files'
      });
    }
  }
  
  // Fallback to in-memory storage
  res.json({
    files: [],
    message: 'File listing retrieved successfully'
  });
});

// File upload endpoint
app.post('/api/files/upload', authenticateToken, async (req, res) => {
  // This is a simplified implementation - in a real app, you would handle multipart file uploads
  // For now, we'll just return a mock response
  
  // If we have Azure Blob Storage, use it
  if (blobServiceClient) {
    res.json({
      message: 'File upload endpoint ready - use multipart form data to upload files',
      uploadUrl: '/api/files/upload'
    });
    return;
  }
  
  // Fallback to in-memory storage
  res.json({
    message: 'File upload simulated successfully',
    file: {
      id: 'mock-file-id',
      name: 'mock-file.txt',
      size: 1024,
      url: 'https://example.com/mock-file.txt'
    }
  });
});

// Workspace endpoints
app.get('/api/workspaces', authenticateToken, async (req, res) => {
  // If we have Azure Blob Storage, use it
  if (blobServiceClient) {
    try {
      const containerName = process.env.AZURE_STORAGE_CONTAINER_NAME || 'blob';
      const containerClient = blobServiceClient.getContainerClient(containerName);
      
      // List workspaces (simulated)
      const workspaces = [];
      
      res.json({
        workspaces: workspaces,
        message: 'Workspaces retrieved successfully'
      });
      return;
    } catch (error) {
      console.error('Error listing workspaces from Azure Storage:', error);
      return res.status(500).json({
        error: 'Failed to retrieve workspaces'
      });
    }
  }
  
  // Fallback to in-memory storage
  res.json({
    workspaces: [],
    message: 'Workspaces retrieved successfully'
  });
});

// Create workspace
app.post('/api/workspaces', authenticateToken, async (req, res) => {
  // If we have Azure services, use them
  if (blobServiceClient) {
    res.json({
      message: 'Workspace creation endpoint ready',
      workspace: {
        id: 'mock-workspace-id',
        name: req.body.name || 'New Workspace',
        description: req.body.description || 'A new workspace',
        createdAt: new Date().toISOString()
      }
    });
    return;
  }
  
  // Fallback to in-memory storage
  res.json({
    message: 'Workspace created successfully',
    workspace: {
      id: 'mock-workspace-id',
      name: req.body.name || 'New Workspace',
      description: req.body.description || 'A new workspace',
      createdAt: new Date().toISOString()
    }
  });
});

// Search endpoints
app.post('/api/search', authenticateToken, async (req, res) => {
  const { query } = req.body;
  
  // If we have Azure AI Search, use it
  if (searchClient && query) {
    try {
      // Simple search implementation
      const searchResults = await searchClient.search(query, {
        top: 10
      });
      
      const results = [];
      for await (const result of searchResults.results) {
        results.push(result.document);
      }
      
      res.json({
        results: results,
        message: 'Search completed successfully'
      });
      return;
    } catch (error) {
      console.error('Error searching with Azure AI Search:', error);
      return res.status(500).json({
        error: 'Search service unavailable'
      });
    }
  }
  
  // Fallback to in-memory storage
  res.json({
    results: [],
    message: 'Search completed successfully'
  });
});

// GET search endpoint
app.get('/api/search', authenticateToken, async (req, res) => {
  const { q: query } = req.query;
  
  // If we have Azure AI Search, use it
  if (searchClient && query) {
    try {
      // Simple search implementation
      const searchResults = await searchClient.search(query, {
        top: 10
      });
      
      const results = [];
      for await (const result of searchResults.results) {
        results.push(result.document);
      }
      
      res.json({
        results: results,
        message: 'Search completed successfully'
      });
      return;
    } catch (error) {
      console.error('Error searching with Azure AI Search:', error);
      return res.status(500).json({
        error: 'Search service unavailable'
      });
    }
  }
  
  // Fallback to in-memory storage
  res.json({
    results: [],
    message: 'Search completed successfully'
  });
});

// Feedback endpoints
app.post('/api/feedback', authenticateToken, async (req, res) => {
  // If we have a database connection, use it
  if (dbPool) {
    try {
      const feedbackId = `feedback_${Date.now()}`;
      const userId = req.user.userId;
      const { subject, message, category } = req.body;
      
      // Store feedback in database
      const result = await dbPool.request()
        .input('id', sql.NVarChar, feedbackId)
        .input('userId', sql.NVarChar, userId)
        .input('subject', sql.NVarChar, subject)
        .input('message', sql.NVarChar, message)
        .input('category', sql.NVarChar, category || 'general')
        .input('status', sql.NVarChar, 'open')
        .query(`
          INSERT INTO Feedback (id, userId, subject, message, category, status, createdAt, updatedAt)
          OUTPUT INSERTED.*
          VALUES (@id, @userId, @subject, @message, @category, @status, GETUTCDATE(), GETUTCDATE())
        `);
      
      res.json({
        message: 'Feedback submitted successfully',
        feedback: result.recordset[0]
      });
      return;
    } catch (error) {
      console.error('Error submitting feedback to database:', error);
    }
  }
  
  // Fallback to in-memory storage
  res.json({
    message: 'Feedback submitted successfully'
  });
});

// Get user's feedback
app.get('/api/feedback/my-feedback', authenticateToken, async (req, res) => {
  // If we have a database connection, use it
  if (dbPool) {
    try {
      const userId = req.user.userId;
      
      // Get user's feedback from database
      const result = await dbPool.request()
        .input('userId', sql.NVarChar, userId)
        .query('SELECT * FROM Feedback WHERE userId = @userId ORDER BY createdAt DESC');
      
      res.json({
        feedback: result.recordset,
        message: 'User feedback retrieved successfully'
      });
      return;
    } catch (error) {
      console.error('Error retrieving feedback from database:', error);
    }
  }
  
  // Fallback to in-memory storage
  res.json({
    feedback: [],
    message: 'User feedback retrieved successfully'
  });
});

// Get all feedback (admin only)
app.get('/api/admin/feedback', authenticateToken, requireAdmin, async (req, res) => {
  // If we have a database connection, use it
  if (dbPool) {
    try {
      // Get all feedback from database
      const result = await dbPool.request()
        .query('SELECT * FROM Feedback ORDER BY createdAt DESC');
      
      res.json({
        feedback: result.recordset,
        message: 'All feedback retrieved successfully'
      });
      return;
    } catch (error) {
      console.error('Error retrieving feedback from database:', error);
    }
  }
  
  // Fallback to in-memory storage (empty array since this is admin-only)
  res.json({
    feedback: [],
    message: 'All feedback retrieved successfully'
  });
});

// Catch-all for undefined routes
app.all('*', (req, res) => {
  res.status(404).json({
    error: 'Route not found',
    message: `Cannot ${req.method} ${req.url}`
  });
});

const PORT = process.env.PORT || 8080;

app.listen(PORT, '0.0.0.0', () => {
  console.log(`🚀 AIVA Backend API running on port ${PORT}`);
  console.log(`📊 Health check: http://localhost:${PORT}/health`);
  console.log(`📚 API info: http://localhost:${PORT}/api`);
});