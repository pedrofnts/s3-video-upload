const express = require('express');
const config = require('./config/config');
const uploadRoutes = require('./routes/uploadRoutes');

// Initialize Express app
const app = express();

// Middleware for parsing JSON and url-encoded data
app.use(express.json());
app.use(express.urlencoded({ extended: true }));

// Add request logging middleware
app.use((req, res, next) => {
  console.log(`${new Date().toISOString()} - ${req.method} ${req.originalUrl}`);
  next();
});

// Routes
app.use('/api', uploadRoutes);

// Simple health check endpoint
app.get('/health', (req, res) => {
  res.status(200).json({ status: 'ok', timestamp: new Date().toISOString() });
});

// 404 handler - SEMPRE retorna 200
app.use((req, res) => {
  res.status(200).json({
    success: true,
    message: 'Requisição recebida.',
    warning: `Rota não encontrada: ${req.originalUrl}`
  });
});

// Global error handler - SEMPRE retorna 200
app.use((err, req, res, next) => {
  console.error('Unhandled error:', err);

  // SEMPRE retorna 200, independente do erro
  return res.status(200).json({
    success: true,
    message: 'Requisição recebida. Processamento iniciado.',
    warning: err.message || 'Erro durante processamento'
  });
});

// Start the server
const PORT = config.app.port;
const server = app.listen(PORT, () => {
  console.log(`Server running on port ${PORT}`);
});

// Handle unhandled rejections and exceptions to prevent crashes
process.on('unhandledRejection', (reason, promise) => {
  console.error('Unhandled Rejection at:', promise, 'reason:', reason);
  // Application continues running despite the rejection
});

process.on('uncaughtException', (error) => {
  console.error('Uncaught Exception:', error);
  // Gracefully shut down in case of uncaught exception (optional)
  // server.close(() => {
  //   process.exit(1);
  // });
});

module.exports = app; 