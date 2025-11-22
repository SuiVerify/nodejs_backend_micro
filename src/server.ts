import 'dotenv/config';
import app from './app';
import { initDatabase, testConnection, closePool } from './services/database.service';

const PORT = process.env.PORT || 3001;

// ASCII Banner
const banner = `
╔═══════════════════════════════════════════════════════════╗
║                                                           ║
║   ███████╗██╗   ██╗██╗██╗   ██╗███████╗██████╗ ██╗███████╗║
║   ██╔════╝██║   ██║██║██║   ██║██╔════╝██╔══██╗██║██╔════╝║
║   ███████╗██║   ██║██║██║   ██║█████╗  ██████╔╝██║█████╗  ║
║   ╚════██║██║   ██║██║╚██╗ ██╔╝██╔══╝  ██╔══██╗██║██╔══╝  ║
║   ███████║╚██████╔╝██║ ╚████╔╝ ███████╗██║  ██║██║██║     ║
║   ╚══════╝ ╚═════╝ ╚═╝  ╚═══╝  ╚══════╝╚═╝  ╚═╝╚═╝╚═╝     ║
║                                                           ║
║           Backend Microservice - NFT Settlement           ║
║                                                           ║
╚═══════════════════════════════════════════════════════════╝
`;

async function startServer(): Promise<void> {
  try {
    console.log(banner);

    // Test database connection
    console.log('Connecting to database...');
    const dbConnected = await testConnection();
    if (!dbConnected) {
      throw new Error('Failed to connect to database');
    }

    // Initialize database tables
    await initDatabase();

    // Start Express server
    app.listen(PORT, () => {
      console.log(`\n🚀 Server running on http://localhost:${PORT}`);
      console.log(`📍 Health check: http://localhost:${PORT}/api/settlement/health`);
      console.log(`📍 Settle NFT: POST http://localhost:${PORT}/api/settlement/settle`);
      console.log('\nReady to process NFT settlements!\n');
    });
  } catch (error) {
    console.error('Failed to start server:', error);
    process.exit(1);
  }
}

// Graceful shutdown
process.on('SIGINT', async () => {
  console.log('\nShutting down gracefully...');
  await closePool();
  process.exit(0);
});

process.on('SIGTERM', async () => {
  console.log('\nShutting down gracefully...');
  await closePool();
  process.exit(0);
});

// Start the server
startServer();
