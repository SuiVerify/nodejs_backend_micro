import express, { Application, Request, Response, NextFunction } from 'express';
import cors from 'cors';
import settlementRoutes from './routes/settlement.routes';

const app: Application = express();

// Middleware
app.use(cors());
app.use(express.json());

// Routes
app.use('/api/settlement', settlementRoutes);

// Root endpoint
app.get('/', (req: Request, res: Response) => {
  res.json({
    name: 'SuiVerify Backend Microservice',
    version: '1.0.0',
    endpoints: {
      settle: 'POST /api/settlement/settle',
      status: 'GET /api/settlement/status/:nftId',
      health: 'GET /api/settlement/health',
    },
  });
});

// 404 handler
app.use((req: Request, res: Response) => {
  res.status(404).json({
    success: false,
    error: 'Endpoint not found',
  });
});

// Error handler
app.use((err: Error, req: Request, res: Response, next: NextFunction) => {
  console.error('Unhandled error:', err);
  res.status(500).json({
    success: false,
    error: 'Internal server error',
  });
});

export default app;
