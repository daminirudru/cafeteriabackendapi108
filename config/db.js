import mongoose from "mongoose";
import logger from '../utils/logger.js';

export const connectDB = async () => {
    try {
        const mongoURI = process.env.MONGODB_URI;
        
        if (!mongoURI) {
            throw new Error('MONGODB_URI environment variable is not defined');
        }

        const options = {
            useNewUrlParser: true,
            useUnifiedTopology: true,
            maxPoolSize: 10, // Maintain up to 10 socket connections
            serverSelectionTimeoutMS: 5000, // Keep trying to send operations for 5 seconds
            socketTimeoutMS: 45000, // Close sockets after 45 seconds of inactivity
            bufferMaxEntries: 0, // Disable mongoose buffering
            bufferCommands: false, // Disable mongoose buffering
        };

        const conn = await mongoose.connect(mongoURI, options);
        
        logger.info('Database connected successfully', {
            host: conn.connection.host,
            database: conn.connection.name,
            port: conn.connection.port
        });

        // Handle connection events
        mongoose.connection.on('error', (err) => {
            logger.error('Database connection error', err);
        });

        mongoose.connection.on('disconnected', () => {
            logger.warn('Database disconnected');
        });

        mongoose.connection.on('reconnected', () => {
            logger.info('Database reconnected');
        });

        // Graceful shutdown
        process.on('SIGINT', async () => {
            try {
                await mongoose.connection.close();
                logger.info('Database connection closed through app termination');
                process.exit(0);
            } catch (err) {
                logger.error('Error during database disconnection', err);
                process.exit(1);
            }
        });

        return conn;
    } catch (error) {
        logger.error('Database connection failed', error);
        process.exit(1);
    }
};