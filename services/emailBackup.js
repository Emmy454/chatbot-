import nodemailer from "nodemailer";
import dotenvConfig from "../config/dotenvConfig.js";

const transporter = nodemailer.createTransport({
  service: "gmail",
  auth: {
    user: dotenvConfig.ADMIN_EMAIL,
    pass: dotenvConfig.ADMIN_EMAIL_PASS
  }
});

export async function sendEmailBackup(filePath) {
  await transporter.sendMail({
    from: dotenvConfig.ADMIN_EMAIL,
    to: dotenvConfig.ADMIN_EMAIL,
    subject: "📊 WhatsApp Complaint Backup",
    text: "Attached is the latest complaint backup.",
    attachments: [{ filename: "complaints.xlsx", path: filePath }],
  });

  console.log("✅ Email backup sent");
}
