import dotenv from "dotenv";

dotenv.config();

export const {
  DB_HOST,
  DB_USER,
  DB_PASSWORD,
  DB_NAME,
  DB_PORT,
  WHATSAPP_TOKEN,
  PHONE_NUMBER_ID,
  ADMIN_EMAIL,
  ADMIN_EMAIL_PASS,
  GOOGLE_CLIENT_ID,
  GOOGLE_CLIENT_SECRET,
  GOOGLE_REDIRECT_URI,
  GOOGLE_DRIVE_REFRESH_TOKEN,
  WEBHOOK_VERIFY_TOKEN
} = process.env;
