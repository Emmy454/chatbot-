import { google } from "googleapis";
import fs from "fs";
import dotenvConfig from "../config/dotenvConfig.js";

const oauth2Client = new google.auth.OAuth2(
  dotenvConfig.GOOGLE_CLIENT_ID,
  dotenvConfig.GOOGLE_CLIENT_SECRET,
  dotenvConfig.GOOGLE_REDIRECT_URI
);

oauth2Client.setCredentials({
  refresh_token: dotenvConfig.GOOGLE_DRIVE_REFRESH_TOKEN
});

const drive = google.drive({ version: "v3", auth: oauth2Client });

export async function uploadToDrive(filePath) {
  await drive.files.create({
    requestBody: {
      name: `complaints_${Date.now()}.xlsx`,
      mimeType: "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet",
    },
    media: { 
      mimeType: "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet", 
      body: fs.createReadStream(filePath) 
    }
  });

  console.log("✅ Uploaded to Google Drive");
}
