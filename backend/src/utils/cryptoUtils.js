import crypto from 'crypto';
import { ENCRYPTION_KEY } from '../config/config.js';
import logger from '../utils/logger.js';
const ALGORITHM = 'aes-256-gcm';

const getMasterKey = () => {
  const secret = ENCRYPTION_KEY;
  if (!secret) {
    throw new Error('ENCRYPTION_KEY is not set. Cannot perform encryption operations.');
  }
  return crypto.createHash('sha256').update(String(secret)).digest();
};

/**
 * Encrypts sensitive text (e.g. EVM private key) using AES-256-GCM
 */
export const encryptText = (text) => {
  if (!text) return "";
  if (typeof text !== 'string') return text;
  if (text.startsWith("enc:")) return text; // Already encrypted

  const iv = crypto.randomBytes(12);
  const cipher = crypto.createCipheriv(ALGORITHM, getMasterKey(), iv);
  let encrypted = cipher.update(text, 'utf8', 'hex');
  encrypted += cipher.final('hex');
  const authTag = cipher.getAuthTag().toString('hex');
  return `enc:${iv.toString('hex')}:${authTag}:${encrypted}`;
};

/**
 * Decrypts AES-256-GCM encrypted text safely
 */
export const decryptText = (encryptedData) => {
  if (!encryptedData) return "";
  if (typeof encryptedData !== 'string') return encryptedData;
  if (!encryptedData.startsWith("enc:")) return encryptedData; // Backward compatibility for legacy plaintext

  try {
    const parts = encryptedData.slice(4).split(':');
    if (parts.length !== 3) return encryptedData;

    const iv = Buffer.from(parts[0], 'hex');
    const authTag = Buffer.from(parts[1], 'hex');
    const encryptedText = parts[2];

    const decipher = crypto.createDecipheriv(ALGORITHM, getMasterKey(), iv);
    decipher.setAuthTag(authTag);
    let decrypted = decipher.update(encryptedText, 'hex', 'utf8');
    decrypted += decipher.final('utf8');
    return decrypted;
  } catch (err) {
    logger.error("Decryption error:", err.message);
    return "";
  }
};
